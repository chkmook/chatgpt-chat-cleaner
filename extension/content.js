(function () {
  'use strict';
  function removeLegacyUI() {
    const legacy = document.getElementById('chat-tidy-root');
    if (legacy?.shadowRoot?.querySelector('.launcher')) legacy.remove();
  }
  removeLegacyUI();
  if (document.getElementById('chat-delete-controls')) return;
  const C = globalThis.ChatDeleteCore;
  const adapter = globalThis.ChatDeleteAdapter;
  const api = globalThis.ChatDeleteAPI;
  const { host, nodes: n } = globalThis.ChatDeleteInline.create();
  const state = { enabled: false, items: [], selected: new Set(), busy: false, pending: null, controller: null };
  const boxes = new Map();
  let currentSidebar = null;
  function status(text) { n.status.textContent = text; }
  function controls() {
    const locked = state.busy || !!state.pending;
    n.toggle.checked = state.enabled;
    n.toggle.disabled = locked;
    n.tools.hidden = !state.enabled || !!state.pending;
    n.count.hidden = !state.enabled;
    n.count.textContent = `${state.selected.size}/${state.items.length}`;
    n.all.disabled = locked || !state.items.length;
    n.clear.disabled = locked || !state.selected.size;
    n.delete.disabled = locked || !state.selected.size;
    n.archive.disabled = locked || !state.selected.size;
    n.stop.hidden = !state.busy;
    n.confirm.hidden = !state.pending;
    if (state.pending && host.isConnected && !n.confirm.matches(':modal')) {
      // Reopen in the top layer if ChatGPT replaced or moved the sidebar.
      if (n.confirm.open) n.confirm.close();
      n.confirm.showModal();
      n.cancel.focus();
    } else if (!state.pending && n.confirm.open) {
      n.confirm.close();
    }
    boxes.forEach(({ wrapper, input }, id) => {
      wrapper.hidden = !state.enabled;
      wrapper.style.display = state.enabled ? 'inline-flex' : 'none';
      input.checked = state.selected.has(id);
      input.disabled = locked;
    });
  }
  function reconcile() {
    const entries = adapter.entries();
    state.items = entries.map(({ id, title }) => ({ id, title }));
    const current = new Map(entries.map((entry) => [entry.id, entry]));
    // Keep the confirmed queue intact during temporary loading gaps. Reattach
    // the disabled controls and boxes even while a batch is running.
    if (!state.busy) state.selected = new Set([...state.selected].filter((id) => current.has(id)));
    boxes.forEach((box, id) => {
      const entry = current.get(id);
      if (!entry || !box.wrapper.isConnected || box.link !== entry.link) { box.wrapper.remove(); boxes.delete(id); }
    });
    const first = entries[0];
    if (first) {
      currentSidebar = adapter.followSidebar(adapter.historyRoot());
      const list = first.link.closest('[role="list"], ol, ul');
      const anchor = list || first.row;
      if (!host.isConnected || host.parentElement !== anchor.parentElement) anchor.before(host);
    } else if (!host.isConnected) {
      // The final deletion can replace the sidebar with an empty history.
      // Retain its result and controls even though there is no first row now.
      currentSidebar?.()?.prepend(host);
    }
    for (const item of entries) {
      if (boxes.has(item.id)) {
        const box = boxes.get(item.id);
        box.row = item.row;
        const input = box.input;
        const name = `${item.title} 선택`;
        if (input.getAttribute('aria-label') !== name) input.setAttribute('aria-label', name);
        continue;
      }
      const wrapper = document.createElement('label');
      wrapper.dataset.chatDeleteCheckbox = '';
      wrapper.style.cssText = 'display:none;position:relative;z-index:1;align-items:center;justify-content:center;flex:0 0 24px;min-height:24px;margin-inline-end:4px;pointer-events:auto;cursor:pointer;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('aria-label', `${item.title} 선택`);
      // ChatGPT resets native inputs to appearance:none. Restore the checkbox
      // on this injected input so its checked state is actually visible.
      input.style.cssText = 'appearance:auto!important;width:15px;height:15px;margin:0;accent-color:currentColor;cursor:pointer;pointer-events:auto;';
      ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown'].forEach((event) => wrapper.addEventListener(event, (e) => e.stopPropagation()));
      input.addEventListener('change', () => {
        input.checked ? state.selected.add(item.id) : state.selected.delete(item.id);
        controls();
      });
      wrapper.append(input);
      // A sibling of the native link, never inside its clickable area.
      item.link.before(wrapper);
      boxes.set(item.id, { wrapper, input, link: item.link, row: item.row });
    }
    controls();
  }
  function rowTarget(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target === host || target.closest('button, [role="button"], input, select, textarea, [contenteditable="true"], [data-chat-delete-checkbox]')) return null;
    for (const [id, box] of boxes) {
      if (box.row?.isConnected && box.row.contains(target)) return id;
    }
    return null;
  }
  function toggleRow(id) {
    if (state.busy || state.pending) return;
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    controls();
  }
  // Capture before the host application's router. In selection mode, clicking
  // a conversation title or row selects it instead of opening the conversation.
  document.addEventListener('click', (event) => {
    if (!state.enabled || state.busy || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;
    const id = rowTarget(event);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleRow(id);
  }, true);
  for (const type of ['pointerdown', 'mousedown']) {
    document.addEventListener(type, (event) => {
      if (state.enabled && !state.busy && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && rowTarget(event)) event.stopImmediatePropagation();
    }, true);
  }
  document.addEventListener('keydown', (event) => {
    if (!state.enabled || state.busy || !['Enter', ' '].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const id = rowTarget(event);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleRow(id);
  }, true);
  function enable(value) {
    if (state.busy || state.pending) return;
    state.enabled = value;
    state.selected.clear();
    status('');
    reconcile();
  }
  function cancel() {
    const action = state.pending?.action;
    state.pending = null;
    controls();
    if (action) n[action].focus();
  }
  function stage(action) {
    if (state.busy || state.pending) return;
    reconcile();
    const items = C.selectedSnapshot(state.items, state.selected);
    if (!items.length) return;
    state.pending = { action, items };
    const word = action === 'delete' ? '삭제' : '보관';
    n.question.textContent = `${items.length}개 ${word}할까요?`;
    n.warning.textContent = action === 'delete' ? '삭제한 대화는 복구할 수 없습니다.' : '선택한 대화를 보관합니다.';
    n.targets.replaceChildren(...items.map((item) => {
      const li = document.createElement('li'); li.textContent = item.title; return li;
    }));
    n.commit.textContent = `${items.length}개 ${word}`;
    controls();
    n.cancel.focus();
  }
  async function run() {
    if (!state.pending || state.busy) return;
    const { action, items } = state.pending;
    state.pending = null;
    state.busy = true;
    state.controller = new AbortController();
    n.stop.disabled = false;
    controls();
    n.stop.focus();
    const word = action === 'delete' ? '삭제' : '보관';
    let done = 0;
    let batchId = null;
    try {
      adapter.validate(items);
      status(`${word} 0/${items.length} · 준비 중`);
      batchId = await api.prepare(items, action);
      for (const item of items) {
        if (state.controller.signal.aborted) break;
        status(`${word} ${done}/${items.length}`);
        await api.perform(batchId, item, state.controller.signal, (seconds) => {
          const phase = state.controller.signal.aborted ? '중지 대기 · 현재 요청 확인 중' : `ChatGPT 처리 대기 ${seconds}초`;
          status(`${word} ${done}/${items.length} · ${phase}`);
        });
        done++;
        adapter.complete(item);
        state.selected.delete(item.id);
        reconcile();
        if (done < items.length && !state.controller.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 350));
      }
      status(`${word} ${done}/${items.length}${done < items.length ? ' · 중지됨' : ' · 완료'}`);
    } catch (error) {
      status(`${word} ${done}/${items.length} · ${error.name === 'AbortError' ? '중지됨' : error.message}`);
    } finally {
      if (batchId) await api.finish(batchId);
      state.busy = false;
      state.controller = null;
      reconcile();
    }
  }
  n.toggle.addEventListener('change', () => enable(n.toggle.checked));
  n.all.addEventListener('click', () => { reconcile(); state.items.forEach((item) => state.selected.add(item.id)); controls(); });
  n.clear.addEventListener('click', () => { state.selected.clear(); controls(); });
  n.delete.addEventListener('click', () => stage('delete'));
  n.archive.addEventListener('click', () => stage('archive'));
  n.cancel.addEventListener('click', cancel);
  n.commit.addEventListener('click', run);
  n.stop.addEventListener('click', () => {
    state.controller?.abort(); n.stop.disabled = true; status('중지 중');
  });
  n.confirm.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancel();
  });
  n.confirm.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const active = n.confirm.getRootNode().activeElement;
    if ((!event.shiftKey && active === n.commit) || (event.shiftKey && active === n.cancel)) {
      event.preventDefault();
      (event.shiftKey ? n.commit : n.cancel).focus();
    }
    event.stopPropagation();
  });
  let timer;
  const own = (node) => node.nodeType === Node.ELEMENT_NODE && (node === host || node.id === 'chat-tidy-root' || !!node.closest('[data-chat-delete-checkbox]'));
  new MutationObserver((changes) => {
    removeLegacyUI();
    if (changes.every((change) => own(change.target) ||
      (change.type === 'childList' && [...change.addedNodes, ...change.removedNodes].length > 0 && [...change.addedNodes, ...change.removedNodes].every(own)))) return;
    clearTimeout(timer);
    timer = setTimeout(reconcile, 120);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'aria-label', 'title'] });
  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (sender.id === chrome.runtime.id && message?.type === 'CHAT_DELETE_TOGGLE') { enable(!state.enabled); respond({ ok: true }); }
    });
  }
  reconcile();
})();
