async (page) => {
  const checks = [], calls = [];
  const verify = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  await page.route('**/backend-api/**', route => {
    calls.push(route.request().method());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await page.goto('http://127.0.0.1:4173');
  const ui = page.getByRole('region', { name: '대화 삭제', exact: true });
  const dialog = page.getByRole('dialog');
  await ui.getByRole('switch').check();
  await page.getByRole('checkbox', { name: '연구 아이디어 정리 선택', exact: true }).check();
  await ui.getByRole('button', { name: '삭제', exact: true }).click();
  verify(await dialog.getAttribute('aria-modal') !== 'false' && await ui.locator('#confirm').evaluate(n => n.matches(':modal')), 'confirmation opens as a native modal');
  verify(await dialog.getByRole('heading', { name: '1개 삭제할까요?', exact: true }).isVisible(), 'popup names the action and exact selected count');
  verify(await dialog.locator('#warning').textContent() === '삭제한 대화는 복구할 수 없습니다.', 'delete warns that it cannot be undone');
  verify(await dialog.getByRole('button', { name: '취소', exact: true }).evaluate(n => n === n.getRootNode().activeElement), 'cancel receives initial focus');
  await page.keyboard.press('Enter');
  verify(await dialog.count() === 0 && calls.length === 0, 'default Enter cancels without submitting');
  verify(await ui.getByRole('button', { name: '삭제', exact: true }).evaluate(n => n === n.getRootNode().activeElement), 'cancel restores focus to the action button');
  await ui.getByRole('button', { name: '보관', exact: true }).click();
  verify(await dialog.getByRole('heading', { name: '1개 보관할까요?', exact: true }).isVisible(), 'archive has its own action confirmation');
  verify(await dialog.locator('#warning').textContent() === '선택한 대화를 보관합니다.', 'archive uses the archive description');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    verify(await dialog.evaluate(n => n.contains(n.getRootNode().activeElement)), `Tab ${i + 1} stays inside the confirmation`);
  }
  await page.keyboard.press('Escape');
  verify(await dialog.count() === 0 && calls.length === 0, 'Escape closes the popup without submitting');
  verify(await page.getByRole('checkbox', { name: '연구 아이디어 정리 선택', exact: true }).isChecked(), 'cancelling keeps the selection');
  await ui.getByRole('button', { name: '해제', exact: true }).click();
  const unsafeTitle = '<img src=x onerror="window.fixtureTitleExecuted=true">';
  await page.evaluate(title => addChat('demo-31', title), unsafeTitle);
  await page.getByRole('checkbox', { name: `${unsafeTitle} 선택`, exact: true }).check();
  await ui.getByRole('button', { name: '삭제', exact: true }).click();
  verify(await dialog.locator('#targets li').textContent() === unsafeTitle && await dialog.locator('#targets img').count() === 0, 'titles render as literal text without HTML execution');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await ui.getByRole('button', { name: '전체 선택', exact: true }).click();
  await ui.getByRole('button', { name: '삭제', exact: true }).click();
  verify(await dialog.locator('#targets li').count() === 31, 'a large selection shows every selected title');
  await page.setViewportSize({ width: 390, height: 640 });
  verify(await dialog.evaluate(n => {
    const r = n.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  }), 'popup fits a narrow viewport');
  verify(await dialog.locator('#targets').evaluate(n => n.scrollHeight > n.clientHeight), 'long target lists scroll inside the popup');
  await page.screenshot({ path: 'output/playwright/v0.4.0-confirmation-mobile.png', scale: 'css' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'output/playwright/v0.4.0-confirmation.png', scale: 'css' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'output/playwright/v0.4.0-confirmation-dark.png', scale: 'css' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => {
    const nav = document.querySelector('nav');
    const replacement = nav.cloneNode(true);
    replacement.querySelectorAll('#chat-delete-controls, [data-chat-delete-checkbox]').forEach(n => n.remove());
    nav.replaceWith(replacement);
  });
  await page.waitForFunction(() => document.querySelector('#chat-delete-controls')?.shadowRoot?.querySelector('#confirm').matches(':modal'));
  verify(await dialog.locator('#targets li').count() === 31, 'sidebar replacement preserves the modal and frozen target list');
  await page.keyboard.press('Escape');
  verify(await dialog.count() === 0 && calls.length === 0, 'cancelling after a sidebar replacement submits nothing');
  await page.unrouteAll();
  return { passed: checks.length, checks, scope: 'Local fixture confirmation only; no real account requests' };
}
