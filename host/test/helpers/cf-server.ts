// FAKE CLOUDFLARE API — justified: the Cloudflare REST API is the I/O seam of io/cloudflare/*. Tests must never
// touch a real account, so this local HTTP server speaks the v4 envelope ({success, errors, result,
// result_info}) for exactly the endpoints GeoHarness calls, keeps zone state across calls, and records every
// request. The production Http implementation (fetch) is used against it unchanged.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest { method: string; path: string; body: unknown }
type Json = Record<string, unknown>;

export interface CfState {
  zones: { id: string; name: string }[];
  rulesets: Record<string, Json[] | undefined>; // key `${zoneId}:${phase}`; undefined = no entrypoint
  settings: Record<string, string>; // key `${zoneId}:${id}`
  tiered: Record<string, string>;
  bot: Record<string, Json>;
  workerDomains: { hostname: string; service: string; zone_id: string }[];
  /** Worker name → its deployments (newest first, as the API returns them); absent = the Worker does not exist. */
  workerDeployments: Record<string, Json[]>;
  /** Pages project → id of its production deployment. */
  pagesProduction: Record<string, string>;
  /** Path prefixes answered with 403 / code 10000. */
  denied: string[];
}

export interface FakeCf { baseUrl: string; state: CfState; requests: RecordedRequest[]; close(): Promise<void> }

const ok = (result: unknown, info?: Json): Json => ({ success: true, errors: [], messages: [], result, ...(info === undefined ? {} : { result_info: info }) });
const fail = (code: number, message: string): Json => ({ success: false, errors: [{ code, message }], messages: [], result: null });

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text === '' ? undefined : (JSON.parse(text) as unknown);
}

function route(s: CfState, method: string, path: string, query: URLSearchParams, body: unknown): [number, Json] {
  if (s.denied.some((d) => path.startsWith(d))) return [403, fail(10000, 'Authentication error')];
  if (path === '/zones' && method === 'GET') {
    const zones = s.zones.filter((z) => z.name === query.get('name'));
    return [200, ok(zones, { page: 1, per_page: 5, total_pages: 1 })];
  }
  const entry = /^\/zones\/([^/]+)\/rulesets\/phases\/([^/]+)\/entrypoint$/.exec(path);
  if (entry !== null) {
    const m = entry;
    const key = `${m[1] ?? ''}:${m[2] ?? ''}`;
    if (method === 'GET') {
      const rules = s.rulesets[key];
      return rules === undefined ? [404, fail(10003, 'could not find entrypoint ruleset')] : [200, ok({ id: `rs-${key}`, phase: m[2], rules })];
    }
    if (method === 'PUT') {
      const incoming = (body as { rules: Json[] }).rules;
      s.rulesets[key] = incoming.map((r, i) => ({ id: typeof r.id === 'string' ? r.id : `new-${i}`, version: '1', last_updated: 'now', ...r }));
      return [200, ok({ id: `rs-${key}`, rules: s.rulesets[key] })];
    }
  }
  if (/^\/zones\/[^/]+\/rulesets$/.test(path)) return [200, ok([])];
  const setting = /^\/zones\/([^/]+)\/settings\/([^/]+)$/.exec(path);
  if (setting !== null) {
    const m = setting;
    const key = `${m[1] ?? ''}:${m[2] ?? ''}`;
    if (method === 'PATCH') s.settings[key] = (body as { value: string }).value;
    return [200, ok({ id: m[2], value: s.settings[key] ?? 'off' })];
  }
  const tiered = /^\/zones\/([^/]+)\/cache\/tiered_cache_smart_topology_enable$/.exec(path);
  if (tiered !== null) {
    const m = tiered;
    const z = m[1] ?? '';
    if (method === 'PATCH') s.tiered[z] = (body as { value: string }).value;
    return [200, ok({ value: s.tiered[z] ?? 'off' })];
  }
  const bot = /^\/zones\/([^/]+)\/bot_management$/.exec(path);
  if (bot !== null) {
    const m = bot;
    const z = m[1] ?? '';
    if (method === 'PUT') s.bot[z] = { ...(s.bot[z] ?? {}), ...(body as Json) };
    return [200, ok(s.bot[z] ?? { fight_mode: true, ai_bots_protection: 'block' })];
  }
  if (/^\/accounts\/[^/]+\/workers\/domains$/.test(path)) {
    const host = query.get('hostname');
    return [200, ok(s.workerDomains.filter((d) => host === null || d.hostname === host), { total_pages: 1 })];
  }
  const deployments = /^\/accounts\/[^/]+\/workers\/scripts\/([^/]+)\/deployments$/.exec(path);
  if (deployments !== null && method === 'GET') {
    const list = s.workerDeployments[decodeURIComponent(deployments[1] ?? '')];
    return list === undefined ? [404, fail(10007, 'This Worker does not exist on your account.')] : [200, ok({ deployments: list })];
  }
  const project = /^\/accounts\/[^/]+\/pages\/projects\/([^/]+)$/.exec(path);
  if (project !== null && method === 'GET') {
    const id = s.pagesProduction[decodeURIComponent(project[1] ?? '')];
    return id === undefined ? [404, fail(8000007, 'Project not found')] : [200, ok({ name: project[1], canonical_deployment: { id } })];
  }
  const rollback = /^\/accounts\/[^/]+\/pages\/projects\/([^/]+)\/deployments\/([^/]+)\/rollback$/.exec(path);
  if (rollback !== null && method === 'POST') {
    s.pagesProduction[decodeURIComponent(rollback[1] ?? '')] = decodeURIComponent(rollback[2] ?? '');
    return [200, ok({ id: rollback[2] })];
  }
  if (/^\/accounts\/[^/]+\/(workers\/scripts|pages\/projects)$/.test(path)) return [200, ok([])];
  if (/^\/zones\/[^/]+\/dns_records$/.test(path)) return [200, ok([], { total_pages: 1 })];
  return [404, fail(7003, `no route for ${method} ${path}`)];
}

export async function startFakeCf(state: Partial<CfState>): Promise<FakeCf> {
  const s: CfState = { zones: [], rulesets: {}, settings: {}, tiered: {}, bot: {}, workerDomains: [], workerDeployments: {}, pagesProduction: {}, denied: [], ...structuredClone(state) };
  // Cloned: the fake mutates its state, and tests share fixtures such as CF_WITH_VERSION.
  const requests: RecordedRequest[] = [];
  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://x');
      const path = url.pathname.replace(/^\/client\/v4/, '');
      const body = await readBody(req);
      requests.push({ method: req.method ?? 'GET', path: `${path}${url.search}`, body });
      const [status, payload] = req.headers.authorization === 'Bearer test-token'
        ? route(s, req.method ?? 'GET', path, url.searchParams, body)
        : [400, fail(6003, 'Invalid request headers')];
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    })();
  });
  await new Promise<void>((r) => { server.listen(0, '127.0.0.1', r); });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/client/v4`,
    state: s,
    requests,
    close: () => new Promise((r) => { server.close(() => { r(); }); }),
  };
}

export const mutations = (reqs: RecordedRequest[]): RecordedRequest[] => reqs.filter((r) => r.method !== 'GET');
