async (page) => {
  const checks = [];
  const verify = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const ui = page.getByRole('region', { name: '대화 삭제', exact: true });
  const calls = [];
  const state = { token: 'LOCAL-TEST-TOKEN', user: 'test-user', account: 'test-account', status: 200, hold: false, release: null, heldReady: null };
  await page.route('**/api/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: state.token, user: { id: state.user }, account: { id: state.account } }) }));
  await page.route('**/backend-api/**', async route => {
    const request = route.request();
    const path = request.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const headers = request.headers();
    calls.push({ method: request.method(), path, body: request.postData(), account: headers['chatgpt-account-id'], authenticated: headers.authorization === `Bearer ${state.token}` });
    if (state.hold) await new Promise(resolve => { state.release = resolve; state.heldReady?.(); state.heldReady = null; });
    await route.fulfill({ status: state.status, contentType: 'application/json', body: state.status === 200 ? '{"success":true}' : '{}' });
  });
  async function fresh() {
    calls.length = 0; state.status = 200; state.hold = false; state.release = null; state.heldReady = null;
    state.token = 'LOCAL-TEST-TOKEN'; state.user = 'test-user'; state.account = 'test-account';
    await page.goto('http://127.0.0.1:4173');
    await ui.getByRole('switch').click();
  }
  async function choose(titles) {
    for (const title of titles) await page.getByRole('checkbox', { name: `${title} 선택`, exact: true }).click();
  }
  async function commit(count, action = '삭제') {
    await ui.getByRole('button', { name: action, exact: true }).click();
    await ui.getByRole('button', { name: `${count}개 ${action}`, exact: true }).click();
  }
  const finished = text => ui.locator('#status').filter({ hasText: text }).waitFor({ timeout: 30000 });
  async function waitUntilHeld() { if (!state.release) await new Promise(resolve => { state.heldReady = resolve; }); }
  await fresh();
  await choose(['연구 아이디어 정리', '주간 회의 메모', 'Python 코드 질문']);
  await ui.getByRole('button', { name: '삭제', exact: true }).click();
  verify(JSON.stringify(await ui.locator('#targets li').allTextContents()) === JSON.stringify(['연구 아이디어 정리', '주간 회의 메모', 'Python 코드 질문']), 'one confirmation popup contains exactly the selected titles');
  verify(await page.getByRole('dialog', { name: '3개 삭제할까요?', exact: true }).isVisible() && await ui.locator('#confirm').evaluate(n => n.matches(':modal')), 'the confirmation is an accessible modal in the browser top layer');
  verify(calls.length === 0, 'opening the confirmation popup submits nothing');
  await ui.getByRole('button', { name: '취소', exact: true }).click();
  verify(calls.length === 0, 'cancelling the confirmation popup submits nothing');
  await commit(3);
  await finished('삭제 3/3 · 완료');
  verify(JSON.stringify(calls.map(c => [c.method, c.path])) === JSON.stringify([1, 2, 3].map(i => ['DELETE', `/backend-api/conversation/id/demo-${i}`])), 'three selected IDs use their exact DELETE endpoint, once each, in order');
  verify(calls.every(c => c.authenticated && c.account === 'test-account'), 'each request uses the current same-account test session');
  verify(await page.locator('[data-id="demo-1"]').isVisible() === false && await page.locator('[data-id="demo-4"]').isVisible(), 'only acknowledged selected rows are hidden');
  verify(await page.locator('[data-id="project-1"]').isVisible(), 'project chats remain untouched');
  verify(await page.evaluate(() => window.fixtureMenuCount === 0 && window.fixtureConfirmClicks === 0) && await page.getByRole('dialog').count() === 0, 'the batch closes its single confirmation and uses no per-conversation native dialogs or menus');
  await page.locator('[data-id="demo-1"]').evaluate(n => n.remove());
  await page.evaluate(() => addChat('demo-1', '연구 아이디어 정리'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-id="demo-1"]')).display === 'none');
  verify(await page.locator('[data-id="demo-1"]').isVisible() === false, 'a stale native rerender cannot restore an already acknowledged target to the visible list');
  await page.locator('[data-id="demo-1"]').evaluate(n => {
    n.dataset.id = 'demo-31';
    const link = n.querySelector('a'); link.href = '/c/demo-31'; link.textContent = '재사용된 행'; link.setAttribute('aria-label', '재사용된 행');
  });
  await page.getByRole('checkbox', { name: '재사용된 행 선택', exact: true }).waitFor();
  verify(await page.locator('[data-id="demo-31"]').isVisible(), 'recycling a hidden row for another conversation restores its visibility');

  await fresh();
  await ui.getByRole('button', { name: '전체 선택', exact: true }).click();
  await commit(30);
  await finished('삭제 30/30 · 완료');
  verify(calls.length === 30 && new Set(calls.map(c => c.path)).size === 30, 'thirty selected requests complete without duplicates');
  verify(await ui.isVisible() && await ui.getByRole('button', { name: '삭제', exact: true }).isEnabled() === false, 'empty ordinary history retains completion controls');
  verify(await page.getByRole('dialog').count() === 0 && await page.evaluate(() => window.fixtureMenuCount === 0), 'bulk deletion runs without further modals or menus');

  await fresh();
  await choose(['연구 아이디어 정리', '주간 회의 메모']);
  await commit(2, '보관');
  await finished('보관 2/2 · 완료');
  verify(calls.length === 2 && calls.every((c, i) => c.method === 'PATCH' && c.path === `/backend-api/conversation/demo-${i + 1}` && JSON.parse(c.body).is_archived === true), 'bulk archive uses only its two selected IDs and explicit archive body');

  await fresh();
  state.hold = true;
  await choose(['연구 아이디어 정리', '주간 회의 메모']);
  const arrived = page.waitForRequest(request => request.method() === 'DELETE', { timeout: 10000 });
  await commit(2); await arrived; await waitUntilHeld();
  await page.getByRole('textbox', { name: '메시지 입력', exact: true }).fill('삭제 중에도 입력 가능');
  verify(await page.getByRole('textbox', { name: '메시지 입력', exact: true }).inputValue() === '삭제 중에도 입력 가능', 'the conversation editor remains usable during a pending delete');
  await page.evaluate(() => fetch('/backend-api/conversations', { headers: { 'chatgpt-account-id': 'test-account' } }));
  await page.locator('[data-id="demo-4"] a').click();
  verify(await page.evaluate(() => window.fixtureNavigations) === 1, 'conversation navigation remains usable while deletion runs');
  await page.getByRole('textbox', { name: '메시지 입력', exact: true }).click();
  const held = state.release; state.hold = false; held();
  await finished('삭제 2/2 · 완료');
  verify(await page.getByRole('textbox', { name: '메시지 입력', exact: true }).evaluate(n => n === document.activeElement), 'completing background requests does not steal editor focus');
  verify(calls.length === 2 && await page.getByRole('dialog').count() === 0, 'editing and navigation do not change the confirmed deletion targets');
  await page.screenshot({ path: 'output/playwright/v0.4.0-nonblocking.png', scale: 'css' });

  for (const action of ['삭제', '보관']) {
    await fresh();
    state.hold = true;
    await choose(['연구 아이디어 정리', '주간 회의 메모']);
    const stopping = page.waitForRequest(request => request.method() === (action === '삭제' ? 'DELETE' : 'PATCH'), { timeout: 10000 });
    await commit(2, action); await stopping; await waitUntilHeld();
    await ui.getByRole('button', { name: '중지', exact: true }).click();
    const release = state.release; state.hold = false; release();
    await finished(`${action} 1/2 · 중지됨`);
    verify(calls.length === 1 && await page.locator('[data-id="demo-2"]').isVisible(), `${action}: stop confirms only the current request and leaves the next target untouched`);
  }

  await fresh(); state.hold = true;
  await choose(['연구 아이디어 정리', '주간 회의 메모']);
  const switching = page.waitForRequest(request => request.method() === 'DELETE', { timeout: 10000 });
  await commit(2); await switching; await waitUntilHeld();
  const switchRelease = state.release; state.account = 'other-account'; state.hold = false; switchRelease();
  await finished('계정이나 워크스페이스가 바뀌어');
  verify(calls.length === 1 && await page.locator('[data-id="demo-2"]').isVisible(), 'switching workspace preserves the not-yet-submitted target');
  verify((await ui.locator('#status').textContent()).startsWith('삭제 1/2 · '), 'a workspace change retains only the already acknowledged progress');

  for (const error of [401, 429, 500, 202]) {
    await fresh(); state.status = error;
    await choose(['연구 아이디어 정리', '주간 회의 메모']);
    await commit(2);
    await ui.getByRole('switch').waitFor();
    await page.waitForFunction(() => !document.querySelector('#chat-delete-controls').shadowRoot.querySelector('#toggle').disabled);
    verify(calls.length === 1, `HTTP ${error}: error or unconfirmed acceptance is not retried and does not advance`);
    verify(await page.locator('[data-id="demo-1"]').isVisible() && await page.locator('[data-id="demo-2"]').isVisible(), `HTTP ${error}: unconfirmed targets stay visible`);
    verify((await ui.locator('#status').textContent()).startsWith('삭제 0/2 · '), `HTTP ${error}: no false success is counted`);
  }
  await fresh();
  await choose(['연구 아이디어 정리']);
  await ui.getByRole('button', { name: '삭제', exact: true }).click();
  await page.locator('[data-id="demo-1"] a').evaluate(n => { n.textContent = '바뀐 제목'; n.setAttribute('aria-label', '바뀐 제목'); });
  await ui.getByRole('button', { name: '1개 삭제', exact: true }).click();
  await finished('대상 대화가 바뀌었거나');
  verify(calls.length === 0, 'a title changed before the final confirmation blocks all requests');

  await fresh(); state.token = '';
  await choose(['연구 아이디어 정리']); await commit(1);
  await finished('로그인 상태나 접근 권한을');
  verify(calls.length === 0, 'missing login never submits an API mutation');
  await page.unrouteAll();
  return { passed: checks.length, checks, scope: 'Local intercepted session and backend responses only; no real ChatGPT account requests' };
}
