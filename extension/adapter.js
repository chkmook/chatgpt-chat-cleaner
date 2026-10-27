(function (root) {
  "use strict";
  const C = root.ChatDeleteCore;
  const completed = new Set();
  const hiddenRows = new Map();
  function visible(node) {
    if (!node?.isConnected || !node.getClientRects().length) return false;
    const style = getComputedStyle(node);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }
  function historyRoot() {
    // Prefer the desktop sidebar. Main-message links and search dialogs are excluded.
    return ['#history', 'nav[aria-label]', 'aside nav', 'aside', 'nav']
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .find((node) => visible(node) && !node.closest('[role="dialog"], [role="alertdialog"]') &&
        [...node.querySelectorAll('a[href]')].some((a) => C.conversationId(a.href, location.origin)));
  }
  function linksIn(scope, id) {
    return [...scope.querySelectorAll('a[href]')].filter((a) => C.conversationId(a.href, location.origin) === id);
  }
  function followSidebar(scope) {
    const original = scope.closest('nav, aside') || scope;
    const tag = original.localName;
    const id = original.id;
    const label = original.getAttribute('aria-label');
    return () => {
      if (visible(original)) return original;
      // A list or its entire landmark can be replaced after deleting an active
      // chat. Follow only the same uniquely identified sidebar, never main links.
      if (!id && !label) return null;
      const matches = [...document.querySelectorAll(tag)].filter((node) => visible(node) &&
        (id ? node.id === id : node.getAttribute('aria-label') === label) &&
        !node.closest('[role="dialog"], [role="alertdialog"]'));
      return matches.length === 1 ? matches[0] : null;
    };
  }
  function optionButton(link, scope) {
    let row = link;
    for (let depth = 0; row && row !== scope && depth < 9; depth++, row = row.parentElement) {
      const ids = new Set([...row.querySelectorAll('a[href]')].map((a) => C.conversationId(a.href, location.origin)).filter(Boolean));
      if (row === link) ids.add(C.conversationId(link.href, location.origin));
      if (ids.size !== 1) return null;
      const buttons = [...row.querySelectorAll('button')].filter((button) => {
        const testId = button.getAttribute('data-testid') ?? '';
        const label = C.fold(button.getAttribute('aria-label'));
        return button.getAttribute('aria-haspopup') === 'menu' ||
          /history.*(?:options|menu)/i.test(testId) ||
          /^(?:more|more options|conversation options|open conversation options|options|더 보기|더보기|추가 옵션|대화 옵션|옵션)$/.test(label);
      });
      if (buttons.length === 1) return { row, button: buttons[0] };
      if (buttons.length > 1) return null;
    }
    return null;
  }
  function titleOf(link) {
    const clone = link.cloneNode(true);
    clone.querySelectorAll('button, [aria-hidden="true"], [data-chat-delete-checkbox]').forEach((node) => node.remove());
    return C.normalize(link.getAttribute('aria-label') || clone.textContent || link.getAttribute('title'));
  }
  function entries() {
    const scope = historyRoot();
    if (!scope) return [];
    const found = new Map();
    for (const link of scope.querySelectorAll('a[href]')) {
      const id = C.conversationId(link.href, location.origin);
      const title = titleOf(link);
      if (id && title && !found.has(id)) found.set(id, { id, title, link, row: optionButton(link, scope)?.row || link.closest('[role="listitem"], li') || link.parentElement });
    }
    const all = [...found.values()];
    syncHidden(all);
    return all.filter((item) => !completed.has(item.id));
  }
  function rowIds(node) {
    const links = [...node.querySelectorAll('a[href]')];
    if (node.matches('a[href]')) links.push(node);
    return new Set(links.map((link) => C.conversationId(link.href, location.origin)).filter(Boolean));
  }
  function syncHidden(all) {
    for (const [row, saved] of hiddenRows) {
      const ids = rowIds(row);
      if (!row.isConnected || ids.size !== 1 || !ids.has(saved.id)) {
        row.style.setProperty('display', saved.display, saved.priority);
        hiddenRows.delete(row);
      }
    }
    for (const item of all) {
      if (!completed.has(item.id)) continue;
      const candidate = item.row;
      const ids = rowIds(candidate);
      const row = ids.size === 1 && ids.has(item.id) ? candidate : item.link;
      if (!hiddenRows.has(row)) hiddenRows.set(row, { id: item.id, display: row.style.getPropertyValue('display'), priority: row.style.getPropertyPriority('display') });
      row.style.setProperty('display', 'none', 'important');
    }
  }
  function validate(items) {
    const scope = historyRoot();
    for (const item of items) {
      const links = scope ? linksIn(scope, item.id) : [];
      if (completed.has(item.id) || links.length !== 1 || titleOf(links[0]) !== item.title) throw new Error('대상 대화가 바뀌었거나 목록에서 사라졌습니다. 다시 선택해 주세요.');
    }
  }
  function complete(item) { completed.add(item.id); entries(); }
  root.ChatDeleteAdapter = Object.freeze({ entries, historyRoot, followSidebar, validate, complete });
})(globalThis);
