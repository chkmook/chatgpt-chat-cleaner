(function () {
  'use strict';
  const CHANNEL = 'chat-delete-api-v1';
  const nativeFetch = window.fetch;
  const idPattern = /^[A-Za-z0-9-]{1,128}$/;
  const requestPattern = /^[a-f0-9-]{36}$/i;
  let observedAccount = null;
  let accountEpoch = 0;
  let batch = null;
  let preparing = false;

  // Observe only the account selector already attached to ChatGPT's own requests.
  // Authorization values are never intercepted, posted, logged, or persisted.
  window.fetch = function (input, init) {
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      if (url.origin === location.origin && url.pathname.startsWith('/backend-api/')) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        const account = headers.get('chatgpt-account-id');
        if (account && /^[A-Za-z0-9_-]{1,128}$/.test(account) && account !== observedAccount) {
          const firstMatchingHeader = batch && observedAccount === null && account === batch.account;
          observedAccount = account;
          if (!firstMatchingHeader) accountEpoch++;
        } else if (!account && observedAccount && /^\/backend-api\/conversations?(?:\/|$)/.test(url.pathname)) {
          // Returning to the default workspace can remove the account header.
          const sameDefault = batch && observedAccount === batch.account && batch.account === batch.sessionAccount;
          observedAccount = null;
          if (!sameDefault) accountEpoch++;
        }
      }
    } catch { /* Observing must never interfere with ChatGPT's fetch. */ }
    return Reflect.apply(nativeFetch, this, arguments);
  };

  async function fetchBound(path, init, timeout, consume) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await Reflect.apply(nativeFetch, window, [path, {
        ...init, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal
      }]);
      return await consume(response);
    } finally { clearTimeout(timer); }
  }
  async function session() {
    const epoch = accountEpoch;
    const data = await fetchBound('/api/auth/session', { method: 'GET' }, 10000, (response) => {
      if (!response.ok) throw new Error('session');
      return response.json();
    });
    if (epoch !== accountEpoch) throw new Error('account-changed');
    if (typeof data?.accessToken !== 'string' || !data.accessToken || typeof data?.user?.id !== 'string' || !data.user.id) throw new Error('session');
    return {
      token: data.accessToken, user: data.user.id,
      account: observedAccount ?? (typeof data.account?.id === 'string' ? data.account.id : null),
      sessionAccount: typeof data.account?.id === 'string' ? data.account.id : null, epoch
    };
  }
  async function prepare(payload) {
    if (batch || preparing) return { ok: false, error: 'busy' };
    if (!['delete', 'archive'].includes(payload.action) || !Array.isArray(payload.ids) || !payload.ids.length || payload.ids.length > 1000 ||
      payload.ids.some((id) => typeof id !== 'string' || !idPattern.test(id)) || new Set(payload.ids).size !== payload.ids.length) return { ok: false, error: 'invalid' };
    preparing = true;
    try {
      const auth = await session();
      batch = {
        id: crypto.randomUUID(), action: payload.action, ids: [...payload.ids], index: 0,
        user: auth.user, account: auth.account, sessionAccount: auth.sessionAccount, epoch: auth.epoch,
        busy: false, stopped: false, attempted: new Set()
      };
      return { ok: true, batchId: batch.id };
    } finally { preparing = false; }
  }
  async function apply(payload) {
    const job = batch;
    if (!job || payload.batchId !== job.id || job.stopped || job.busy || payload.id !== job.ids[job.index] || job.attempted.has(payload.id)) return { ok: false, error: 'invalid-target' };
    job.busy = true;
    let submitted = false;
    try {
      const auth = await session();
      if (batch !== job || job.stopped || auth.user !== job.user || auth.account !== job.account || auth.sessionAccount !== job.sessionAccount || auth.epoch !== job.epoch || accountEpoch !== job.epoch) throw new Error('account-changed');
      const headers = { authorization: `Bearer ${auth.token}` };
      if (auth.account) headers['chatgpt-account-id'] = auth.account;
      const deleting = job.action === 'delete';
      if (!deleting) headers['content-type'] = 'application/json';
      job.attempted.add(payload.id);
      submitted = true;
      const response = await fetchBound(deleting ? `/backend-api/conversation/id/${payload.id}` : `/backend-api/conversation/${payload.id}`, {
        method: deleting ? 'DELETE' : 'PATCH', headers,
        ...(deleting ? {} : { body: JSON.stringify({ is_archived: true }) })
      }, 60000, async (response) => {
        if (response.status === 200) {
          const body = await response.text();
          if (body.trim()) {
            let result;
            try { result = JSON.parse(body); } catch { throw new Error('unconfirmed'); }
            if (result?.success === false || result?.error) throw new Error('unconfirmed');
          }
        }
        return { status: response.status };
      });
      // A 202 only acknowledges receipt; it cannot confirm this mutation finished.
      if (![200, 204].includes(response.status)) {
        job.stopped = true;
        return { ok: false, error: response.status === 202 ? 'unconfirmed' : 'http', status: response.status, submitted: true };
      }
      job.index++;
      return { ok: true, status: response.status };
    } catch (error) {
      job.stopped = true;
      const known = ['account-changed', 'session', 'unconfirmed'];
      return { ok: false, error: known.includes(error.message) ? error.message : submitted ? 'unconfirmed' : 'session', submitted };
    } finally { job.busy = false; }
  }
  async function handle(action, payload) {
    if (action === 'prepare') return prepare(payload);
    if (action === 'apply') return apply(payload);
    if (action === 'finish' && batch && payload.batchId === batch.id) {
      batch.stopped = true;
      if (!batch.busy) batch = null;
      return { ok: true };
    }
    return { ok: false, error: 'invalid' };
  }
  window.addEventListener('message', async (event) => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.channel !== CHANNEL || message.type !== 'request' ||
      typeof message.requestId !== 'string' || !requestPattern.test(message.requestId) || !message.payload || typeof message.payload !== 'object') return;
    let result;
    try { result = await handle(message.action, message.payload); }
    catch (error) { result = { ok: false, error: error.message === 'account-changed' ? 'account-changed' : 'session' }; }
    // Only operation status and a random batch handle cross the world boundary.
    window.postMessage({ channel: CHANNEL, type: 'response', requestId: message.requestId, result }, location.origin);
  });
})();
