const assert = require('node:assert/strict');
const { chromium, expect } = require('playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', permissions: ['microphone'] });
    await context.addInitScript(() => {
      localStorage.setItem('language', 'en');
      localStorage.setItem('asr-backend', 'openai');
      localStorage.setItem('openai-api-key', 'test-key');
      localStorage.setItem('ai-auto-optimize', 'false');
      localStorage.setItem('asr-compress-audio', 'false');
      const RealAudio = window.Audio;
      window.testPlayers = [];
      window.Audio = function (...args) {
        const audio = new RealAudio(...args);
        window.testPlayers.push(audio);
        return audio;
      };
    });
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/api/stt', route => route.fulfill({ json: { success: true, text: 'Recorded text' } }));
    await page.goto(process.env.ASR_TEST_URL || 'http://localhost:3011');
    await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
    await expect(page.locator('.audio-recorder .font-mono')).toHaveText('00:03', { timeout: 10000 });
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    const play = page.getByRole('button', { name: /Play Recording$/ });
    const stop = page.getByRole('button', { name: /Stop Playback$/ });
    await expect(play).toBeEnabled();
    await play.click();
    await expect(stop).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.testPlayers.at(-1).paused)).toBe(false);
    await stop.click();
    await expect(play).toBeVisible();
    assert.deepEqual(await page.evaluate(() => ({ paused: window.testPlayers.at(-1).paused, time: window.testPlayers.at(-1).currentTime })), { paused: true, time: 0 });
    await play.click();
    await expect(stop).toBeVisible();
    await expect.poll(() => page.evaluate(() => Number.isFinite(window.testPlayers.at(-1).duration))).toBe(true);
    await page.evaluate(() => { const audio = window.testPlayers.at(-1); audio.currentTime = audio.duration - 0.1; });
    await expect(play).toBeVisible();
    await play.click();
    await stop.click();
    assert.equal(await page.evaluate(() => window.testPlayers.filter(audio => !audio.paused).length), 0);
    // A blocked play must restore the button and remain retryable.
    await page.evaluate(() => { window.originalPlay = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = () => Promise.reject(new Error('test playback failure')); });
    await play.click();
    await expect(page.getByText(/Playback failed: test playback failure/)).toBeVisible();
    await expect(play).toBeEnabled();
    await page.evaluate(() => { HTMLMediaElement.prototype.play = window.originalPlay; });
    await play.click();
    await expect(stop).toBeVisible();
    await page.getByRole('button', { name: 'Continue Previous', exact: true }).click();
    assert.equal(await page.evaluate(() => window.testPlayers.filter(audio => !audio.paused).length), 0);
    await page.getByRole('button', { name: 'Discard Recording', exact: true }).click();
    await expect(play).toBeEnabled();
    await play.click();
    await expect(stop).toBeVisible();
    await page.getByRole('button', { name: 'Clear Content', exact: true }).click();
    await expect(stop).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.testPlayers.filter(audio => !audio.paused).length), 0);
    console.log('Real recording playback: stop/rewind, replay, natural end, failure recovery, continuation and clear passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
