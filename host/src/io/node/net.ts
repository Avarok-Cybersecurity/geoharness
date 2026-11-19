import { createServer, type AddressInfo } from 'node:net';
import type { Net } from '../types.js';

export const nodeNet: Net = {
  freePort: () => new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => { resolve(port); });
    });
  }),
};
