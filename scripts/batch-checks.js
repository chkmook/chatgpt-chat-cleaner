async (page) => {
  const checks = [];
  const verify = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const ui = page.getByRole('region', { name: '대화 삭제', exact: true });
  const results = [];
  for (const scenario of ['rerender-list', 'rerender-sidebar', 'loading-list']) {
    await page.goto('http://127.0.0.1:4173');
    await page.locator('#scenario').selectOption(scenario);
    await ui.getByRole('switch').click();
    for (const title of ['연구 아이디어 정리', '주간 회의 메모', 'Python 코드 질문']) {
      await page.getByRole('checkbox', { name: `${title} 선택`, exact: true }).click();
    }
    await ui.getByRole('button', { name: '삭제', exact: true }).click();
    await ui.getByRole('button', { name: '3개 삭제', exact: true }).click();
    await page.waitForFunction(() => {
      const host = document.getElementById('chat-delete-controls');
      return host && !host.shadowRoot.querySelector('#toggle').disabled;
    }, null, { timeout: 25000 });
    const status = await ui.locator('#status').textContent();
    const submitted = await page.evaluate(() => window.fixtureActions);
    verify(status === '삭제 3/3 · 완료', `${scenario}: all three finish after the list changes (actual: ${status})`);
    verify(JSON.stringify(submitted) === JSON.stringify([1, 2, 3].map(i => ({ id: `demo-${i}`, action: 'delete' }))), `${scenario}: exact selected IDs are submitted once, in order`);
    verify(await page.locator('[data-id="demo-4"]').count() === 1 && await page.locator('[data-id="project-1"]').count() === 1, `${scenario}: unselected and project chats remain`);
    verify(await ui.isVisible() && await page.getByRole('checkbox').count() === 27, `${scenario}: controls and checkboxes survive the rerender`);
    results.push({ scenario, status, submitted });
  }
  await page.goto('http://127.0.0.1:4173');
  await page.locator('#scenario').selectOption('rerender-sidebar');
  await page.locator('#history').evaluate(n => [...n.children].filter(row => !['demo-1', 'demo-2', 'demo-3', 'project-1'].includes(row.dataset.id)).forEach(row => row.remove()));
  await ui.getByRole('switch').click();
  await ui.getByRole('button', { name: '전체 선택', exact: true }).click();
  await ui.getByRole('button', { name: '삭제', exact: true }).click();
  await ui.getByRole('button', { name: '3개 삭제', exact: true }).click();
  await ui.locator('#status').filter({ hasText: '삭제 3/3 · 완료' }).waitFor({ timeout: 25000 });
  verify(await ui.isVisible() && await ui.getByRole('button', { name: '삭제', exact: true }).isDisabled(), 'replacing the final sidebar keeps the completion and disabled delete control visible');
  verify(await page.getByRole('checkbox').count() === 0 && await page.locator('[data-id="project-1"]').count() === 1, 'all selected ordinary chats finish while the excluded project remains');

  await page.goto('http://127.0.0.1:4173');
  await page.locator('#scenario').selectOption('loading-list');
  await ui.getByRole('switch').click();
  for (const title of ['연구 아이디어 정리', '주간 회의 메모', 'Python 코드 질문']) {
    await page.getByRole('checkbox', { name: `${title} 선택`, exact: true }).click();
  }
  await ui.getByRole('button', { name: '삭제', exact: true }).click();
  await ui.getByRole('button', { name: '3개 삭제', exact: true }).click();
  await page.waitForFunction(() => window.fixtureActions.length === 1);
  await ui.getByRole('button', { name: '중지', exact: true }).click();
  await ui.locator('#status').filter({ hasText: '삭제 1/3 · 중지됨' }).waitFor({ timeout: 25000 });
  verify(await page.evaluate(() => window.fixtureActions.length) === 1, 'stop during a list refresh never submits the next selected delete');
  verify(await page.locator('[data-id="demo-2"]').count() === 1 && await page.locator('[data-id="demo-3"]').count() === 1, 'both remaining selected chats survive stop during refresh');
  await page.screenshot({ path: 'output/playwright/v0.2.4-batch.png', scale: 'css' });
  return { passed: checks.length, checks, results, scope: 'Local fake conversations only; no real account access' };
}
