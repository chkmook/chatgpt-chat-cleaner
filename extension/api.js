(function (root) {
  'use strict';
  const CHANNEL = 'chat-delete-api-v1';
  const pending = new Map();
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || data?.channel !== CHANNEL || data.type !== 'response') return;
    const entry = pending.get(data.requestId);
    if (!entry) return;
    pending.delete(data.requestId); clearTimeout(entry.timer); entry.resolve(data.result);
  });
  function request(action, payload) {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(requestId); resolve({ ok: false, error: 'bridge-timeout', submitted: action === 'apply' }); }, action === 'apply' ? 75000 : 15000);
      pending.set(requestId, { resolve, timer });
      window.postMessage({ channel: CHANNEL, type: 'request', requestId, action, payload }, location.origin);
    });
  }
  function failure(result) {
    if (result.error === 'account-changed') return new Error('계정이나 워크스페이스가 바뀌어 중지했습니다.');
    if (result.error === 'session' || (result.error === 'http' && [401, 403].includes(result.status))) return new Error('로그인 상태나 접근 권한을 확인하지 못해 중지했습니다.');
    if (result.error === 'http' && result.status === 429) return new Error('요청이 많아 중지했습니다. 잠시 후 남은 대상을 확인해 주세요.');
    if (['unconfirmed', 'bridge-timeout'].includes(result.error)) return new Error('처리 결과를 확인하지 못해 중지했습니다. 해당 요청은 다시 보내지 않았습니다.');
    if (result.error === 'http') return new Error(`ChatGPT가 요청을 완료하지 못했습니다 (${result.status}). 자동 재시도하지 않습니다.`);
    if (result.error === 'busy') return new Error('이미 실행 중인 작업이 있습니다.');
    return new Error('삭제 대상을 확인하지 못해 중지했습니다.');
  }
  async function prepare(items, action) {
    const result = await request('prepare', { action, ids: items.map((item) => item.id) });
    if (!result?.ok || typeof result.batchId !== 'string') throw failure(result ?? {});
    return result.batchId;
  }
  async function perform(batchId, item, signal, onProgress = () => {}) {
    if (signal.aborted) throw new DOMException('작업을 중지했습니다.', 'AbortError');
    const started = Date.now();
    const timer = setInterval(() => onProgress(Math.floor((Date.now() - started) / 1000)), 1000);
    try {
      const result = await request('apply', { batchId, id: item.id });
      if (!result?.ok) throw failure(result ?? {});
    } finally { clearInterval(timer); }
  }
  function finish(batchId) { return request('finish', { batchId }); }
  root.ChatDeleteAPI = Object.freeze({ prepare, perform, finish });
})(globalThis);
