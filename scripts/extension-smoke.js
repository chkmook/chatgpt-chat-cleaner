async (page) => {
  const checks = [], calls = [];
  const verify = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const fixture = await (await page.request.get('http://127.0.0.1:4173/')).text();
  const html = fixture.replace(/<script src="\/extension\/[^\"]+"><\/script>/g, '');
  const script = await (await page.request.get('http://127.0.0.1:4173/fixture.js')).text();
  await page.route('https://chatgpt.com/**', async route => {
    const request = route.request();
    const path = request.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (path === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (path === '/fixture.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: script });
    if (path === '/api/auth/session') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'ISOLATED-LOCAL-TEST', user: { id: 'test-user' }, account: { id: 'test-account' } }) });
    if (path.startsWith('/backend-api/')) {
      calls.push({ method: request.method(), path, authenticated: request.headers().authorization === 'Bearer ISOLATED-LOCAL-TEST' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    }
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto('https://chatgpt.com/');
  await page.evaluate(() => {
    window.fixtureBridgeResponses = [];
    window.addEventListener('message', event => {
      if (event.data?.channel === 'chat-delete-api-v1' && event.data.type === 'response') window.fixtureBridgeResponses.push(JSON.stringify(event.data));
    });
  });
  const ui = page.getByRole('region', { name: '대화 삭제', exact: true }); await ui.waitFor();
  verify(await page.evaluate(() => typeof window.ChatDeleteAdapter === 'undefined' && typeof window.ChatDeleteAPI === 'undefined'), 'sidebar and API client are isolated from the page world');
  verify(await page.locator('#chat-delete-controls').evaluate(n => !!n.closest('nav')), 'installed extension inserts the controls in the native sidebar');
  const context = page.context();
  const worker = context.serviceWorkers().find(w => w.url().endsWith('/background.js')) || await context.waitForEvent('serviceworker');
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  verify(manifest.version === '0.4.0' && manifest.name === 'ChatGPT Chat Cleaner' && !manifest.action.default_popup, 'ChatGPT Chat Cleaner 0.4.0 loads without a separate toolbar popup');
  verify(manifest.content_scripts.some(s => s.world === 'MAIN' && s.run_at === 'document_start' && s.js.includes('bridge.js')), 'the narrowly scoped page bridge loads before ChatGPT starts');
  verify(!manifest.permissions?.includes('storage') && !manifest.host_permissions, 'no storage or external-site permissions are added');
  verify(await worker.evaluate(() => chrome.action.onClicked.hasListeners()), 'extension icon toggle listener remains registered');
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'CHAT_DELETE_TOGGLE' });
  });
  verify(await ui.getByRole('switch').isChecked(), 'the extension icon message enables inline selection');
  verify(await page.getByRole('checkbox').count() === 30, 'thirty ordinary chats receive checkboxes');
  verify(await page.locator('[data-chat-delete-checkbox] input').first().evaluate(n => getComputedStyle(n).appearance !== 'none'), 'native checkbox appearance survives the host reset');
  await page.getByRole('link', { name: '연구 아이디어 정리', exact: true }).click();
  await page.getByRole('link', { name: '주간 회의 메모', exact: true }).click();
  verify(await page.getByRole('checkbox', { name: '연구 아이디어 정리 선택', exact: true }).isChecked(), 'title selection works across the isolated-world boundary');
  await ui.getByRole('button', { name: '삭제', exact: true }).click();
  verify(await page.getByRole('dialog', { name: '2개 삭제할까요?', exact: true }).isVisible() && calls.length === 0, 'installed extension shows one target confirmation before sending requests');
  await ui.getByRole('button', { name: '2개 삭제', exact: true }).click();
  await ui.locator('#status').filter({ hasText: '삭제 2/2 · 완료' }).waitFor();
  verify(JSON.stringify(calls.map(c => [c.method, c.path])) === JSON.stringify([['DELETE', '/backend-api/conversation/id/demo-1'], ['DELETE', '/backend-api/conversation/id/demo-2']]) && calls.every(c => c.authenticated), 'MAIN-world authentication and two exact selected deletes work across worlds');
  verify(await page.evaluate(() => window.fixtureMenuCount === 0 && window.fixtureConfirmClicks === 0) && await page.getByRole('dialog').count() === 0, 'the installed extension closes its confirmation and never opens per-conversation native menus or dialogs');
  verify(await page.locator('[data-id="demo-3"]').isVisible() && await page.locator('[data-id="demo-1"]').isVisible() === false, 'only the successfully acknowledged targets are hidden');
  verify(await page.evaluate(() => window.fixtureBridgeResponses.length > 0 && !window.fixtureBridgeResponses.some(s => s.includes('ISOLATED-LOCAL-TEST') || s.includes('authorization') || s.includes('accessToken'))), 'authentication values never cross the MAIN/isolated message bridge');
  await page.screenshot({ path: 'output/playwright/v0.4.0-extension-loaded.png', scale: 'css' });
  await page.unrouteAll();
  return { passed: checks.length, checks, scope: 'Unpacked extension in a temporary test profile; ALL ChatGPT requests intercepted and fulfilled with fake responses' };
}
