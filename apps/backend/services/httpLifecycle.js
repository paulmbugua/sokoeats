import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

export async function listenWithRetry(handler, { port, host = '0.0.0.0', retries = 8, retryMs = 750, logger = console } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535');
  for (let attempt = 0; ; attempt++) {
    const server = createServer(handler);
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ port, host, exclusive: true }, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      return server;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (attempt >= retries) {
        throw Object.assign(new Error(`Port ${port} is already in use. Keep only one backend terminal for this project. Check the existing API at http://127.0.0.1:${port}/healthz. Stop its owning process only if you intend to replace it, then type rs in nodemon. No process was killed and the port was not changed.`), { code: 'EADDRINUSE' });
      }
      if (attempt === 0) logger.warn('[SokoEats][Server] port-busy: waiting briefly for the previous process to release the port', { port, waitMs: retries * retryMs });
      await delay(retryMs);
    }
  }
}

export function closeHttpServer(server, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => server.closeAllConnections(), timeoutMs);
    timer.unref();
    server.close(error => {
      clearTimeout(timer);
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}
