(function (root) {
  'use strict';
  function create() {
    const host = document.createElement('div');
    host.id = 'chat-delete-controls';
    host.style.cssText = 'display:block;position:static;width:100%;flex-shrink:0;pointer-events:auto;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { color: inherit; font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; } [hidden] { display: none !important; }
      section { padding: 7px 5px; } .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; white-space: nowrap; }
      input { accent-color: currentColor; margin: 0; width: 14px; height: 14px; }
      button { appearance: auto; font: inherit; color: inherit; background: transparent; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 4px; padding: 3px 7px; cursor: pointer; line-height: 1.5; }
      button:disabled { opacity: .4; cursor: default; } button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 7%, transparent); }
      :focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; width: 100%; margin-top: 5px; }
      #count { opacity: .7; font-size: 11px; } p { margin: 6px 0; } #status { font-size: 11px; overflow-wrap: anywhere; }
      #status:empty { display: none; }
      dialog { color-scheme: light dark; color: CanvasText; background: Canvas; width: min(480px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 22px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 12px; box-shadow: 0 12px 48px #0004; overflow-y: auto; font-size: 14px; }
      dialog::backdrop { background: #0007; } h2 { margin: 0 0 12px; font-size: 18px; } dialog .bar { justify-content: flex-end; margin-top: 18px; } dialog button { padding: 7px 12px; }
      ol { padding-left: 24px; margin: 12px 0; max-height: min(40dvh, 300px); overflow-y: auto; } li { overflow-wrap: anywhere; } .warning { font-weight: 600; }
    `;
    const section = document.createElement('section');
    section.setAttribute('aria-label', '대화 삭제');
    section.innerHTML = `<div class="bar"><label><input id="toggle" type="checkbox" role="switch" aria-label="대화 선택">선택</label><span id="count" hidden></span></div>
      <div class="tools" id="tools" hidden><button id="all" type="button" title="현재 목록에 불러온 대화 선택">전체 선택</button><button id="clear" type="button">해제</button><button id="delete" type="button" disabled>삭제</button><button id="archive" type="button" disabled>보관</button><button id="stop" type="button" hidden>중지</button></div>
      <dialog id="confirm" aria-labelledby="question" aria-describedby="warning hint" hidden><h2 id="question"></h2><p class="warning" id="warning"></p><p id="hint">선택한 대화 목록을 확인한 후 실행해 주세요.</p><ol id="targets" aria-label="선택한 대화 목록"></ol><div class="bar"><button id="cancel" type="button" autofocus>취소</button><button id="commit" type="button">삭제</button></div></dialog>
      <p id="status" role="status" aria-live="polite"></p>`;
    shadow.append(style, section);
    const nodes = {};
    shadow.querySelectorAll('[id]').forEach((node) => { nodes[node.id] = node; });
    return { host, shadow, nodes };
  }
  root.ChatDeleteInline = Object.freeze({ create });
})(globalThis);
