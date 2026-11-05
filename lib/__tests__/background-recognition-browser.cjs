// Run with Playwright available via NODE_PATH and ASR_TEST_URL pointing to the local app.
const assert = require('node:assert/strict');
const { chromium, expect } = require('playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
    await context.addInitScript(() => {
      localStorage.setItem('language', 'en');
      localStorage.setItem('asr-backend', 'openai');
      localStorage.setItem('openai-api-key', 'test-key');
      localStorage.setItem('ai-optimizer-api-key', 'test-ai-key');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => {
      if (!error.message.startsWith('Hydration failed because')) errors.push(error.message);
    });
    let hold = false;
    let requests = 0;
    const held = [];
    const optimizationInputs = [];
    await page.route('**/api/stt', async route => {
      const number = ++requests;
      if (hold) await new Promise(resolve => held.push(resolve));
      await route.fulfill({ json: { success: true, text: `Part ${number}` } }).catch(() => {});
    });
    await page.route('**/api/ai-optimize', async route => {
      const body = route.request().postDataJSON();
      optimizationInputs.push(body.text);
      await route.fulfill({ json: { success: true, text: `Optimized: ${body.text}` } });
    });
    page.on('dialog', dialog => dialog.accept());
    await page.goto(process.env.ASR_TEST_URL || 'http://localhost:3011');
    const start = page.getByRole('button', { name: 'Start Recording', exact: true });
    const stop = page.getByRole('button', { name: 'Stop', exact: true });
    const resume = page.getByRole('button', { name: 'Continue Previous', exact: true });
    const stopRecognition = page.getByRole('button', { name: 'Stop Recognition', exact: true });
    const raw = page.locator('textarea[placeholder]').first();
    await page.locator('#asr-compress-audio').uncheck();
    const history = () => page.evaluate(() => JSON.parse(localStorage.getItem('asr_transcription_history') || '[]'));
    const record = async button => {
      await button.click();
      await expect(stop).toBeVisible();
      await expect(page.locator('.audio-recorder .font-mono')).not.toHaveText('00:00', { timeout: 10000 });
    };
    const release = async () => {
      await expect.poll(() => held.length).toBeGreaterThan(0);
      held.shift()();
    };

    // A new recording during recognition becomes its own history record.
    hold = true;
    await record(start);
    await stop.click();
    await expect(start).toBeEnabled();
    await expect(resume).toBeEnabled();
    await expect(raw).toBeDisabled();
    await record(start);
    await expect(raw).toHaveValue('');
    await stop.click();
    await expect.poll(() => held.length).toBe(2);
    await release();
    await expect.poll(async () => (await history()).length).toBe(1);
    assert.equal((await history())[0].text, 'Part 1');
    await expect(raw).toHaveValue('');
    await release();
    await expect(raw).toHaveValue('Part 2');
    const records = await history();
    assert.equal(records.length, 2);
    assert.notEqual(records[0].id, records[1].id);
    assert.equal(records[0].text, 'Part 2');
    await expect(stopRecognition).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear Content', exact: true }).click();

    // Continuing while the earlier part is recognizing waits for it, then optimizes the combined text once.
    const base = requests;
    const baseOptimizations = optimizationInputs.length;
    await record(start);
    await stop.click();
    await record(resume);
    await stop.click();
    await page.waitForTimeout(500);
    assert.equal(requests, base + 1, 'the continued part must wait for the earlier text');
    await release();
    await expect.poll(() => requests).toBe(base + 2);
    await release();
    await expect(raw).toHaveValue(`Part ${base + 1}\nPart ${base + 2}`);
    assert.equal(optimizationInputs.length, baseOptimizations + 1);
    assert.equal(optimizationInputs.at(-1), `Part ${base + 1}\nPart ${base + 2}`);
    const merged = await history();
    assert.equal(merged.length, 3);
    assert.equal(merged[0].text, `Part ${base + 1}\nPart ${base + 2}`);
    await expect(resume).toBeEnabled();

    // Stop Recognition aborts pending work, keeps the audio and leaves it retryable.
    const beforeStop = await history();
    await record(resume);
    await stop.click();
    await expect(stopRecognition).toBeVisible();
    await stopRecognition.click();
    await expect(stopRecognition).toHaveCount(0);
    await expect(raw).toHaveValue(`Part ${base + 1}\nPart ${base + 2}`);
    await expect(page.getByRole('button', { name: /Re-recognize|Retry/ })).toBeEnabled();
    await expect(resume).toBeEnabled();
    while (held.length) held.shift()();
    await page.waitForTimeout(300);
    assert.deepEqual(await history(), beforeStop);
    assert.deepEqual(errors, []);
    console.log('PASS: independent background records, queued continuation, single combined optimization, stop recognition');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
