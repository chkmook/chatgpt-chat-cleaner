const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../extension/bridge.js'), 'utf8');

function harness({ manualTimers = false } = {}) {
  const calls = [], responses = [], listeners = [];
  const timers = new Map(); let timerId = 0;
  const state = { user: 'user-a', account: 'account-a', token: 'LOCAL-FAKE-TOKEN', sessionStatus: 200, mutation: () => new Response('{"success":true}', { status: 200 }) };
  const win = {
    async fetch(path, init = {}) {
      const url = new URL(typeof path === 'string' ? path : path.url, 'https://chatgpt.com');
      calls.push({ path: url.pathname, ...init });
      if (url.pathname === '/api/auth/session') return new Response(JSON.stringify(state.token ? { accessToken: state.token, user: { id: state.user }, account: { id: state.account } } : {}), { status: state.sessionStatus });
      return state.mutation(url.pathname, init);
    },
    addEventListener(name, handler) { if (name === 'message') listeners.push(handler); },
    postMessage(data, origin) { responses.push({ data, origin }); }
  };
  vm.runInNewContext(source, { window: win, location: { origin: 'https://chatgpt.com', href: 'https://chatgpt.com/' }, Headers, URL, Request, AbortController, crypto: { randomUUID },
    setTimeout: manualTimers ? (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; } : setTimeout,
    clearTimeout: manualTimers ? id => timers.delete(id) : clearTimeout });
  async function rpc(action, payload, overrides = {}) {
    const requestId = randomUUID();
    await listeners[0]({ source: win, origin: 'https://chatgpt.com', data: { channel: 'chat-delete-api-v1', type: 'request', requestId, action, payload }, ...overrides });
    return responses.find(r => r.data.requestId === requestId)?.data.result;
  }
  const mutations = () => calls.filter(c => c.method === 'DELETE' || c.method === 'PATCH');
  const start = async (action = 'delete', ids = ['one', 'two']) => (await rpc('prepare', { action, ids })).batchId;
  const advance = delay => { for (const [id, timer] of timers) if (timer.delay <= delay) { timers.delete(id); timer.fn(); } };
  return { state, calls, responses, rpc, start, mutations, win, advance };
}

test('only the confirmed ordered IDs can be mutated, once each', async () => {
  const h = harness(); const batchId = await h.start();
  assert.equal((await h.rpc('apply', { batchId, id: 'unselected' })).ok, false);
  assert.equal((await h.rpc('apply', { batchId, id: 'two' })).ok, false);
  assert.equal(h.mutations().length, 0);
  assert.equal((await h.rpc('apply', { batchId, id: 'one' })).ok, true);
  assert.equal((await h.rpc('apply', { batchId, id: 'one' })).ok, false);
  assert.equal((await h.rpc('apply', { batchId, id: 'two' })).ok, true);
  assert.deepEqual(h.mutations().map(c => [c.method, c.path]), [['DELETE', '/backend-api/conversation/id/one'], ['DELETE', '/backend-api/conversation/id/two']]);
});
test('archive has a fixed method, path, and body; arbitrary URLs are never accepted', async () => {
  const h = harness();
  for (const ids of [['../all'], ['one', 'one'], ['https://evil.test'], []]) assert.equal((await h.rpc('prepare', { action: 'delete', ids })).ok, false);
  assert.equal((await h.rpc('prepare', { action: 'delete-all', ids: ['one'] })).ok, false);
  assert.equal(h.calls.length, 0);
  const batchId = await h.start('archive');
  assert.equal((await h.rpc('apply', { batchId, id: 'one', url: 'https://evil.test', method: 'DELETE' })).ok, true);
  assert.deepEqual(h.mutations().map(c => [c.method, c.path, JSON.parse(c.body)]), [['PATCH', '/backend-api/conversation/one', { is_archived: true }]]);
});
test('authentication and account headers stay in same-origin requests and never cross the bridge', async () => {
  const h = harness(); const batchId = await h.start();
  await h.rpc('apply', { batchId, id: 'one' });
  const mutation = h.mutations()[0];
  assert.equal(mutation.headers.authorization, 'Bearer LOCAL-FAKE-TOKEN');
  assert.equal(mutation.headers['chatgpt-account-id'], 'account-a');
  assert.equal(mutation.credentials, 'include');
  assert.equal(mutation.redirect, 'error');
  const wire = JSON.stringify(h.responses);
  assert.equal(wire.includes(h.state.token), false);
  assert.equal(wire.includes('authorization'), false);
  assert.equal(wire.includes('accessToken'), false);
  assert.ok(h.responses.every(r => r.origin === 'https://chatgpt.com'));
});
test('missing login and forbidden sessions never submit a mutation', async () => {
  for (const configure of [h => h.state.token = '', h => h.state.sessionStatus = 401]) {
    const h = harness(); configure(h);
    assert.equal((await h.rpc('prepare', { action: 'delete', ids: ['one'] })).ok, false);
    assert.equal(h.mutations().length, 0);
  }
});
test('switching login or workspace stops before the next mutation', async () => {
  for (const change of [h => h.state.user = 'user-b', h => h.state.account = 'account-b', async h => { await h.win.fetch('/backend-api/accounts/check', { headers: { 'chatgpt-account-id': 'workspace-b' } }); }]) {
    const h = harness(); const batchId = await h.start();
    await h.rpc('apply', { batchId, id: 'one' });
    await change(h);
    const result = await h.rpc('apply', { batchId, id: 'two' });
    assert.equal(result.error, 'account-changed');
    assert.equal(h.mutations().length, 1);
  }
});
test('token rotation for the same identity uses the new token without retrying old requests', async () => {
  const h = harness(); const batchId = await h.start();
  h.state.token = 'LOCAL-ROTATED-TOKEN';
  assert.equal((await h.rpc('apply', { batchId, id: 'one' })).ok, true);
  assert.equal(h.mutations()[0].headers.authorization, 'Bearer LOCAL-ROTATED-TOKEN');
  assert.equal(h.mutations().length, 1);
});
test('returning to a workspace without an account header revokes the old batch', async () => {
  const h = harness();
  await h.win.fetch('/backend-api/conversations', { headers: { 'chatgpt-account-id': 'workspace-b' } });
  const batchId = await h.start();
  await h.win.fetch('/backend-api/conversations', { headers: {} });
  assert.equal((await h.rpc('apply', { batchId, id: 'one' })).error, 'account-changed');
  assert.equal(h.mutations().length, 0);
});
test('normal page requests for the same account do not interrupt the batch', async () => {
  const h = harness(); const batchId = await h.start('delete', ['one', 'two', 'three']);
  assert.equal((await h.rpc('apply', { batchId, id: 'one' })).ok, true);
  await h.win.fetch('/backend-api/conversations', { headers: { 'chatgpt-account-id': 'account-a' } });
  assert.equal((await h.rpc('apply', { batchId, id: 'two' })).ok, true);
  await h.win.fetch('/backend-api/conversations', { headers: {} });
  assert.equal((await h.rpc('apply', { batchId, id: 'three' })).ok, true);
  assert.equal(h.mutations().length, 3);
});
test('HTTP errors, accepted-but-unconfirmed results, invalid bodies, and network loss stop without retries', async () => {
  const cases = [
    () => new Response('', { status: 401 }), () => new Response('', { status: 403 }),
    () => new Response('', { status: 429 }), () => new Response('', { status: 500 }),
    () => new Response('', { status: 202 }), () => new Response('<html>login</html>', { status: 200 }),
    () => new Response('{"success":false}', { status: 200 }), () => { throw new TypeError('network'); }
  ];
  for (const mutation of cases) {
    const h = harness(); h.state.mutation = mutation; const batchId = await h.start();
    assert.equal((await h.rpc('apply', { batchId, id: 'one' })).ok, false);
    assert.equal((await h.rpc('apply', { batchId, id: 'one' })).ok, false);
    assert.equal((await h.rpc('apply', { batchId, id: 'two' })).ok, false);
    assert.equal(h.mutations().length, 1);
  }
});
test('a pending request cannot run concurrently or be confirmed twice', async () => {
  const h = harness(); let resolve;
  h.state.mutation = () => new Promise(r => { resolve = r; });
  const batchId = await h.start();
  const pending = h.rpc('apply', { batchId, id: 'one' });
  while (!resolve) await new Promise(r => setImmediate(r));
  assert.equal((await h.rpc('apply', { batchId, id: 'one' })).ok, false);
  assert.equal((await h.rpc('apply', { batchId, id: 'two' })).ok, false);
  resolve(new Response(null, { status: 204 }));
  assert.equal((await pending).ok, true);
  assert.equal(h.mutations().length, 1);
});
test('finishing a batch revokes its handle and allows a fresh explicit batch', async () => {
  const h = harness(); const batchId = await h.start();
  assert.equal((await h.rpc('prepare', { action: 'delete', ids: ['other'] })).error, 'busy');
  assert.equal((await h.rpc('finish', { batchId })).ok, true);
  assert.equal((await h.rpc('apply', { batchId, id: 'one' })).ok, false);
  assert.equal(typeof await h.start('delete', ['other']), 'string');
  assert.equal(h.mutations().length, 0);
});
test('foreign windows and origins cannot call the bridge', async () => {
  const h = harness();
  assert.equal(await h.rpc('prepare', { action: 'delete', ids: ['one'] }, { origin: 'https://evil.test' }), undefined);
  assert.equal(await h.rpc('prepare', { action: 'delete', ids: ['one'] }, { source: {} }), undefined);
  assert.equal(h.calls.length, 0);
});
for (const phase of ['headers', 'body']) {
  test(`the 60-second bound covers stalled response ${phase} and never retries`, async () => {
    const h = harness({ manualTimers: true });
    h.state.mutation = (path, init) => {
      if (phase === 'headers') return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      return new Response(new ReadableStream({ start(controller) { init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError'))); } }));
    };
    const batchId = await h.start();
    const pending = h.rpc('apply', { batchId, id: 'one' });
    while (!h.mutations().length) await new Promise(r => setImmediate(r));
    h.advance(59000);
    assert.equal(h.mutations()[0].signal.aborted, false);
    h.advance(60000);
    assert.equal((await pending).error, 'unconfirmed');
    assert.equal((await h.rpc('apply', { batchId, id: 'one' })).ok, false);
    assert.equal((await h.rpc('apply', { batchId, id: 'two' })).ok, false);
    assert.equal(h.mutations().length, 1);
  });
}
