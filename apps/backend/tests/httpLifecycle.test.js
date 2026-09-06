import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, get } from 'node:http';
import { listenWithRetry, closeHttpServer } from '../services/httpLifecycle.js';

const handler = (_req, res) => res.end('sokoeats');
const logger = { warn() {} };
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

test('starts and releases the same port for the next server', async () => {
  const first = await listenWithRetry(handler, { port: 0, host: '127.0.0.1' });
  const port = first.address().port;
  await closeHttpServer(first);
  const second = await listenWithRetry(handler, { port, host: '127.0.0.1', retries: 0 });
  await closeHttpServer(second);
});

test('retries a transient port collision and keeps the requested port', async () => {
  const owner = createServer(handler);
  const port = await listen(owner);
  const timer = setTimeout(() => owner.close(), 80);
  let replacement;
  try {
    replacement = await listenWithRetry(handler, { port, host: '127.0.0.1', retries: 30, retryMs: 20, logger });
    assert.equal(replacement.address().port, port);
  } finally {
    clearTimeout(timer);
    await closeHttpServer(owner);
    if (replacement) await closeHttpServer(replacement);
  }
});

test('persistent collision is actionable and does not kill the owning server', async () => {
  const owner = createServer(handler);
  const port = await listen(owner);
  try {
    await assert.rejects(listenWithRetry(handler, { port, host: '127.0.0.1', retries: 1, retryMs: 10, logger }), error => {
      assert.equal(error.code, 'EADDRINUSE');
      assert.match(error.message, /No process was killed/);
      return true;
    });
    assert.equal(owner.listening, true);
  } finally { await closeHttpServer(owner); }
});

test('shutdown drains an in-flight HTTP request', async () => {
  let arrived;
  const requestArrived = new Promise(resolve => { arrived = resolve; });
  const server = await listenWithRetry((_req, res) => {
    arrived();
    setTimeout(() => res.end('completed'), 50);
  }, { port: 0, host: '127.0.0.1' });
  const response = new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${server.address().port}`, { agent: false }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
  await requestArrived;
  await closeHttpServer(server);
  assert.equal(await response, 'completed');
});

test('rejects invalid port configuration', async () => {
  await assert.rejects(listenWithRetry(handler, { port: NaN }), /PORT must/);
});
