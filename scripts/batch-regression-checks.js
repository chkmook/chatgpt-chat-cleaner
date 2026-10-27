async (page) => {
  // Serve the previously shipped implementation against the new failure fixture.
  for (const name of ['adapter.js', 'content.js']) {
    await page.route(`**/extension/${name}`, route => route.fulfill({ path: `/private/tmp/delete-chats-v022-regression/${name}`, contentType: 'application/javascript' }));
  }
  const results = [];
  for (const scenario of ['rerender-sidebar', 'loading-list']) {
    await page.goto('http://127.0.0.1:4173');
    await page.locator('#scenario').selectOption(scenario);
    const ui = page.getByRole('region', { name: '대화 삭제', exact: true });
    await ui.getByRole('switch').click();
    for (const title of ['연구 아이디어 정리', '주간 회의 메모', 'Python 코드 질문']) {
      await page.getByRole('checkbox', { name: `${title} 선택`, exact: true }).click();
    }
    await ui.getByRole('button', { name: '삭제', exact: true }).click();
    await ui.getByRole('button', { name: '3개 삭제', exact: true }).click();
    // The old toolbar can become detached. Its diagnostic text is retained only
    // in this test harness, without changing the implementation under test.
    const detachedStatus = await page.evaluateHandle(() => document.querySelector('#chat-delete-controls').shadowRoot.querySelector('#status'));
    await page.waitForTimeout(7500);
    const status = await detachedStatus.evaluate(n => n.textContent);
    const submitted = await page.evaluate(() => window.fixtureActions);
    if (status === '삭제 3/3 · 완료' || submitted.length !== 1) throw new Error(`Expected old-version stop: ${scenario}: ${status}`);
    results.push({ scenario, status, submitted, reproduced: true });
  }
  await page.unrouteAll();
  return { results, scope: 'Shipped 0.2.2 against local fixtures; no real account mutations' };
}
