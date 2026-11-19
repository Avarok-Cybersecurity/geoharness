/** Minimal runtime guards for untyped JSON crossing an I/O boundary. Each throws naming the context. */

export type JsonObject = Record<string, unknown>;

export function isObject(u: unknown): u is JsonObject {
  return typeof u === 'object' && u !== null && !Array.isArray(u);
}

export function asObject(u: unknown, ctx: string): JsonObject {
  if (!isObject(u)) throw new Error(`${ctx}: expected an object`);
  return u;
}

export function asArray(u: unknown, ctx: string): unknown[] {
  if (!Array.isArray(u)) throw new Error(`${ctx}: expected an array`);
  return u;
}

export function asString(u: unknown, ctx: string): string {
  if (typeof u !== 'string') throw new Error(`${ctx}: expected a string`);
  return u;
}

export function optString(u: unknown, ctx: string): string | undefined {
  return u === undefined || u === null ? undefined : asString(u, ctx);
}

export function asNumber(u: unknown, ctx: string): number {
  if (typeof u !== 'number' || !Number.isFinite(u)) throw new Error(`${ctx}: expected a number`);
  return u;
}

export function parseJson(text: string, ctx: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(`${ctx}: invalid JSON (${e instanceof Error ? e.message : String(e)})`, { cause: e });
  }
}

/** Key-order-independent serialisation, for comparing API objects. */
export function canonicalJson(u: unknown): string {
  if (Array.isArray(u)) return `[${u.map(canonicalJson).join(',')}]`;
  if (isObject(u)) {
    const keys = Object.keys(u).filter((k) => u[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(u[k])}`).join(',')}}`;
  }
  return JSON.stringify(u);
}
