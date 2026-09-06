const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '../src/waitForLocationFix.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exportsObject = {};
runInNewContext(output.outputText, { exports: exportsObject, setTimeout, clearTimeout });
const { waitForLocationFix } = exportsObject;
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('returns position and removes an established watch', async () => {
  let callback;
  let removals = 0;
  const pending = waitForLocationFix(async (onPosition) => {
    callback = onPosition;
    return { remove: () => removals++ };
  }, 1000);
  await tick();
  const position = { coords: { latitude: 0, longitude: 0 } };
  callback(position);
  assert.equal(await pending, position);
  assert.equal(removals, 1);
});

test('times out and removes the watch', async () => {
  let removals = 0;
  await assert.rejects(waitForLocationFix(async () => ({ remove: () => removals++ }), 10), { code: 'LOCATION_FIX_TIMEOUT' });
  assert.equal(removals, 1);
});

test('removes a subscription that arrives after timeout', async () => {
  let register;
  let removals = 0;
  const pending = waitForLocationFix(() => new Promise((resolve) => { register = resolve; }), 10);
  await assert.rejects(pending, { code: 'LOCATION_FIX_TIMEOUT' });
  register({ remove: () => removals++ });
  await tick();
  assert.equal(removals, 1);
});

test('cleans up when position arrives before subscription registration', async () => {
  let removals = 0;
  const position = { coords: {} };
  assert.equal(await waitForLocationFix(async (onPosition) => {
    onPosition(position);
    return { remove: () => removals++ };
  }), position);
  await tick();
  assert.equal(removals, 1);
});

test('reports provider errors and cleans up', async () => {
  let fail;
  let removals = 0;
  const pending = waitForLocationFix(async (_, onError) => {
    fail = onError;
    return { remove: () => removals++ };
  });
  await tick();
  fail('No fix');
  await assert.rejects(pending, { code: 'LOCATION_PROVIDER_ERROR', message: 'No fix' });
  assert.equal(removals, 1);
});

test('propagates native registration rejection', async () => {
  await assert.rejects(waitForLocationFix(async () => {
    throw Object.assign(new Error('Permission revoked'), { code: 'PERMISSION_DENIED' });
  }), { code: 'PERMISSION_DENIED' });
});
