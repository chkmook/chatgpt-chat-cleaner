async (page) => {
  const testPage = await page.context().newPage();
  const results = [];
  try {
    for (const name of ['adapter.js', 'content.js']) {
      await testPage.route(`**/extension/${name}`, route => route.fulfill({ path: `/private/tmp/delete-chats-v023-regression/${name}`, contentType: 'application/javascript' }));
    }
    await testPage.clock.install();
    for (const scenario of ['processing-dialog', 'processing-dialog-late-close']) {
      await testPage.goto('http://127.0.0.1:4173');
      await testPage.locator('#scenario').selectOption(scenario);
      const ui = testPage.getByRole('region', { name: '대화 삭제', exact: true });
      await ui.getByRole('switch').click();
      for (const title of ['연구 아이디어 정리', '주간 회의 메모']) {
        await testPage.getByRole('checkbox', { name: `${title} 선택`, exact: true }).click();
      }
      await ui.getByRole('button', { name: '삭제', exact: true }).click();
      await ui.getByRole('button', { name: '2개 삭제', exact: true }).click();
      await testPage.waitForFunction(() => window.fixtureConfirmClicks === 1);
      await testPage.clock.runFor(13000);
      const status = await ui.locator('#status').textContent();
      const submitted = await testPage.evaluate(() => window.fixtureActions);
      const pending = await testPage.getByRole('dialog').getByRole('button', { name: /채팅 삭제/ }).isDisabled();
      if (!status.includes('삭제 0/2 · 대화가 목록에서 사라지는 것을 확인하지 못했습니다.') || submitted.length !== 1 || !pending) {
        throw new Error(`Old implementation did not reproduce the pending-dialog failure: ${scenario}: ${status}`);
      }
      results.push({ scenario, status, submitted, nativeDialogStillProcessing: pending, reproduced: true });
    }
  } finally { await testPage.close(); }
  return { results, scope: 'Shipped 0.2.3 with local 15-second fake processing dialogs; browser clock advanced; no real account access' };
}
