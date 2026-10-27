async (page) => {
  const checks = [];
  const verify = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const ui = page.getByRole('region', { name: '대화 삭제', exact: true });
  const actions = () => page.evaluate(() => window.fixtureActions);
  await page.clock.install();
  async function start(scenario) {
    await page.goto('http://127.0.0.1:4173');
    await page.locator('#scenario').selectOption(scenario);
    await ui.getByRole('switch').click();
    for (const title of ['연구 아이디어 정리', '주간 회의 메모']) {
      await page.getByRole('checkbox', { name: `${title} 선택`, exact: true }).click();
    }
    await ui.getByRole('button', { name: '삭제', exact: true }).click();
    await ui.getByRole('button', { name: '2개 삭제', exact: true }).click();
    await page.waitForFunction(() => window.fixtureConfirmClicks === 1);
  }
  for (const scenario of ['processing-dialog', 'processing-dialog-late-close']) {
    await start(scenario);
    await page.clock.runFor(13000);
    verify(await ui.getByRole('switch').isDisabled(), `${scenario}: queue stays active beyond the old 12-second deadline`);
    verify((await ui.locator('#status').textContent()).includes('ChatGPT 처리 대기'), `${scenario}: waiting status distinguishes pending processing from failure`);
    verify((await actions()).length === 1 && await page.evaluate(() => window.fixtureConfirmClicks) === 1, `${scenario}: no second target or duplicate confirmation while the native dialog processes`);
    if (scenario === 'processing-dialog-late-close') verify(await page.locator('[data-id="demo-1"]').count() === 0, 'early row removal alone does not complete an open processing dialog');
    await page.screenshot({ path: `output/playwright/v0.2.4-${scenario}.png`, scale: 'css' });
    await page.clock.runFor(33000);
    verify(await ui.locator('#status').textContent() === '삭제 2/2 · 완료', `${scenario}: two delayed deletes eventually complete`);
    verify(JSON.stringify(await actions()) === JSON.stringify([{ id: 'demo-1', action: 'delete' }, { id: 'demo-2', action: 'delete' }]), `${scenario}: exactly the two selected IDs are submitted once, in order`);
    verify(await page.evaluate(() => window.fixtureConfirmClicks) === 2 && await page.locator('[data-id="demo-3"]').count() === 1, `${scenario}: each confirmation is clicked once and unselected chats remain`);
  }
  await start('processing-dialog-late-close');
  await page.clock.runFor(13000);
  await ui.getByRole('button', { name: '중지', exact: true }).click();
  await page.clock.runFor(1000);
  verify((await ui.locator('#status').textContent()).includes('중지 대기'), 'stop during native processing explicitly waits for the current submitted result');
  await page.clock.runFor(3000);
  verify(await ui.locator('#status').textContent() === '삭제 1/2 · 중지됨', 'stop counts the completed pending item and ends before the next target');
  verify((await actions()).length === 1 && await page.locator('[data-id="demo-2"]').count() === 1, 'stop never deletes the second selected chat');

  await start('delete-rejected');
  await page.clock.runFor(2000);
  verify((await ui.locator('#status').textContent()).includes('ChatGPT 확인창에 오류가 표시되어'), 'an explicit error in the submitted dialog stops the queue');
  verify((await actions()).length === 1 && await page.evaluate(() => window.fixtureConfirmClicks) === 1, 'a rejected delete is never resubmitted');
  verify(await page.locator('[data-id="demo-1"]').count() === 1 && await page.locator('[data-id="demo-2"]').count() === 1, 'rejected and not-yet-submitted targets remain');

  await start('pending-forever');
  await page.clock.runFor(13000);
  verify(await ui.getByRole('switch').isDisabled(), 'a still-processing request is not timed out after 12 seconds');
  await page.clock.runFor(48000);
  const timeout = await ui.locator('#status').textContent();
  verify(timeout.includes('삭제 0/2 · ChatGPT 처리 결과를 60초 안에 확인하지 못해'), 'a permanently unconfirmed request stops after the bounded 60-second wait');
  verify((await actions()).length === 1 && await page.evaluate(() => window.fixtureConfirmClicks) === 1, 'timeout never retries the submitted request or advances to the next target');
  verify(await page.locator('[data-id="demo-1"]').count() === 1 && await page.locator('[data-id="demo-2"]').count() === 1, 'timeout does not report either remaining row as deleted');
  await page.clock.resume();
  return { passed: checks.length, checks, scope: 'Local fake conversations with an advanced browser clock; no real account mutations' };
}
