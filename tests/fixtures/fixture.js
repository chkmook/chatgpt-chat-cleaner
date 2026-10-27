'use strict';
let historyList = document.getElementById('history');
const titles = ['연구 아이디어 정리', '주간 회의 메모', 'Python 코드 질문', '여행 일정 초안', '논문 요약', '개발 환경 설정', '지난 프로젝트 회고', '<img src=x onerror="alert(1)">', '영어 표현 연습', '보관할 자료'];
window.fixtureActions = [];
window.fixtureMenuCount = 0;
window.fixtureNavigations = 0;
window.fixtureConfirmClicks = 0;
function record(id, action) {
  const scenario = document.getElementById('scenario').value;
  window.fixtureActions.push({ id, action });
  document.getElementById('log').textContent = JSON.stringify(window.fixtureActions);
  if (!['stalled', 'pending-forever', 'delete-rejected'].includes(scenario)) setTimeout(() => {
    document.querySelector(`[data-id="${id}"]`)?.remove();
    if (scenario === 'rerender-list' || scenario === 'rerender-sidebar' || scenario === 'loading-list') {
      const next = document.createElement('div'); next.id = 'history'; next.setAttribute('role', 'list');
      const rows = [...historyList.children];
      const previous = historyList;
      if (scenario === 'rerender-sidebar') {
        const sidebar = previous.closest('aside');
        const replacement = document.createElement('aside'); replacement.id = sidebar.id;
        const nav = document.createElement('nav'); nav.setAttribute('aria-label', '홈'); nav.append(next);
        replacement.append(nav); sidebar.replaceWith(replacement);
      } else previous.replaceWith(next);
      historyList = next;
      if (scenario === 'loading-list') {
        next.setAttribute('aria-busy', 'true');
        setTimeout(() => { next.append(...rows); next.removeAttribute('aria-busy'); }, 900);
      } else next.append(...rows);
    }
  }, scenario === 'slow' ? 1600 : scenario === 'processing-dialog' ? 15000 : 60);
}
function addChat(id, title, project = false) {
  const row = document.createElement('div'); row.className = 'sidebar-item'; row.dataset.id = id; row.setAttribute('role', 'group'); row.setAttribute('aria-label', title);
  const cell = document.createElement('div'); cell.className = 'link-cell';
  const inner = document.createElement('div');
  const a = document.createElement('a'); a.href = project ? `/g/g-p-test/c/${id}` : `/c/${id}`; a.textContent = title; a.setAttribute('aria-label', title); a.addEventListener('click', (event) => { event.preventDefault(); window.fixtureNavigations++; });
  inner.append(a); cell.append(inner);
  const rail = document.createElement('div'); rail.className = 'rail';
  const button = document.createElement('button'); button.type = 'button'; button.id = `trigger-${id}`; button.textContent = '•••'; button.setAttribute('aria-label', '채팅 액션'); button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
  function open(event) {
    const expected = document.getElementById('trigger').value;
    if (event.type !== expected || (event.type === 'pointerdown' && (event.button !== 0 || event.ctrlKey))) return;
    if (event.type === 'pointerdown') event.preventDefault();
    const en = document.getElementById('language').value === 'en';
    document.querySelectorAll('[role=menu]').forEach((node) => node.remove());
    const menu = document.createElement('div'); menu.setAttribute('role', 'menu'); menu.tabIndex = -1; menu.id = `menu-${id}`; menu.setAttribute('aria-labelledby', document.getElementById('scenario').value === 'wrong-owner' ? 'unrelated-trigger' : button.id); menu.setAttribute('data-state', 'open');
    button.setAttribute('aria-expanded', 'true'); window.fixtureMenuCount++;
    const close = () => { menu.remove(); button.setAttribute('aria-expanded', 'false'); };
    for (const action of ['archive', 'delete']) {
      const item = document.createElement('div'); item.setAttribute('role', 'menuitem'); item.tabIndex = -1;
      item.textContent = document.getElementById('scenario').value === 'unknown' ? 'Unsupported' : ({ archive: en ? 'Archive' : '보관', delete: en ? 'Delete' : '삭제' })[action];
      item.addEventListener('click', () => {
        close();
        if (action === 'archive') { record(id, action); return; }
        const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-label', en ? 'Delete chat?' : '채팅을 삭제할까요?');
        const heading = document.createElement('h2'); heading.textContent = en ? 'Delete chat?' : '채팅을 삭제할까요?';
        const p = document.createElement('p');
        const scenario = document.getElementById('scenario').value;
        const name = scenario === 'mismatch' ? '다른 대화' : scenario === 'substring' ? `${title} 복사본` : title;
        p.textContent = en ? `This will permanently delete ${name}. This action cannot be undone.` : `이 작업은 ${name}을(를) 영구적으로 삭제합니다. 되돌릴 수 없습니다.`;
        const cancel = document.createElement('button'); cancel.textContent = en ? 'Cancel' : '취소'; cancel.addEventListener('click', () => dialog.remove());
        const confirm = document.createElement('button'); confirm.textContent = en ? 'Delete chat' : '채팅 삭제';
        confirm.addEventListener('click', () => {
          window.fixtureConfirmClicks++;
          const pending = ['processing-dialog', 'processing-dialog-late-close', 'pending-forever', 'delete-rejected'].includes(scenario);
          if (!pending) dialog.remove();
          else {
            confirm.disabled = true; cancel.disabled = true; dialog.setAttribute('aria-busy', 'true');
            const spinner = document.createElement('span'); spinner.setAttribute('aria-hidden', 'true'); spinner.textContent = ' ◌'; confirm.append(spinner);
            if (scenario === 'delete-rejected') setTimeout(() => {
              const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = '삭제 요청을 처리하지 못했습니다.'; dialog.append(error);
              confirm.disabled = false; cancel.disabled = false; dialog.removeAttribute('aria-busy'); spinner.remove();
            }, 1000);
            else if (scenario !== 'pending-forever') setTimeout(() => dialog.remove(), 15000);
          }
          record(id, action);
        });
        dialog.append(heading, p, cancel, confirm); document.body.append(dialog);
      });
      menu.append(item);
    }
    menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    document.body.append(menu);
  }
  button.addEventListener('pointerdown', open); button.addEventListener('click', open);
  const pin = document.createElement('button'); pin.type = 'button'; pin.textContent = '·'; pin.setAttribute('aria-label', '채팅 고정');
  rail.append(button, pin); row.append(cell, rail); historyList.append(row);
}
function reset() {
  historyList.replaceChildren();
  document.querySelectorAll('body > [role=dialog], body > [role=menu]').forEach((node) => node.remove());
  window.fixtureActions = []; window.fixtureNavigations = 0; window.fixtureMenuCount = 0; window.fixtureConfirmClicks = 0; document.getElementById('log').textContent = '';
  Array.from({ length: 30 }, (_, index) => addChat(`demo-${index + 1}`, titles[index] || `가짜 대화 ${index + 1}`));
  addChat('project-1', '프로젝트 대화', true);
}
document.getElementById('reset').addEventListener('click', reset);
reset();
