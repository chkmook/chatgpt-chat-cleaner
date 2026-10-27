(function (root) {
  "use strict";
  const normalize = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const fold = (value) => normalize(value).toLocaleLowerCase("en-US");
  const labels = {
    delete: new Set(["delete", "delete chat", "delete conversation", "삭제", "대화 삭제", "채팅 삭제"]),
    archive: new Set(["archive", "archive chat", "archive conversation", "보관", "보관하기", "대화 보관", "채팅 보관", "아카이브"])
  };
  function conversationId(href, origin = "https://chatgpt.com") {
    try {
      const url = new URL(href, origin);
      if (url.origin !== origin) return null;
      return /^\/c\/([a-zA-Z0-9-]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    } catch { return null; }
  }
  function isAction(value, action) {
    return labels[action]?.has(fold(value).replace(/(?:\.{3}|…)$/, "").trim()) ?? false;
  }
  function filtered(items, query) {
    const term = fold(query);
    return items.filter((item) => fold(item.title).includes(term));
  }
  function selectedSnapshot(items, selected) {
    return items.filter((item) => selected.has(item.id)).map(({ id, title }) => Object.freeze({ id, title }));
  }
  function dialogNamesTitle(value, title) {
    const text = normalize(value);
    const name = normalize(title);
    if (!name) return false;
    const quotes = [['“', '”'], ['"', '"'], ["'", "'"], ['「', '」'], ['«', '»']];
    if (quotes.some(([left, right]) => text.includes(`${left}${name}${right}`))) return true;
    // Current Korean ChatGPT renders the title as a plain paragraph.
    return text === `이 작업은 ${name}을(를) 영구적으로 삭제합니다. 되돌릴 수 없습니다.` ||
      text === `This will permanently delete ${name}. This action cannot be undone.` ||
      text === `This will delete ${name}.`;
  }
  const api = Object.freeze({ normalize, fold, conversationId, isAction, filtered, selectedSnapshot, dialogNamesTitle });
  root.ChatDeleteCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
