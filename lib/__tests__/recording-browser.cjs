// Run with Playwright available via NODE_PATH and ASR_TEST_URL pointing to the local app.
const assert = require('node:assert/strict');
const { chromium, expect } = require('playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
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
    // Existing i18n reads localStorage during hydration; changing the test language
    // differs from the server's Chinese default. Keep unrelated hydration errors out.
    page.on('pageerror', error => {
      if (!error.message.startsWith('Hydration failed because')) errors.push(error.message);
    });
    let recognitionCount = 0;
    let failRecognition = false;
    let failOptimize = false;
    let holdRecognition = false;
    let releaseRecognition;
    const uploads = [];
    const optimizationInputs = [];
    let liveCount = 0;
    await page.route('**/api/gladia/live', route => route.fulfill({ json: {
      success: true, url: `wss://asr.test/live/${++liveCount}`,
    } }));
    await page.routeWebSocket(/wss:\/\/asr\.test\/live\//, socket => {
      const number = liveCount;
      let sent = false;
      socket.onMessage(message => {
        if (typeof message === 'string' && JSON.parse(message).type === 'stop_recording') {
          socket.send(JSON.stringify({ type: 'end_session' }));
        } else if (!sent) {
          sent = true;
          socket.send(JSON.stringify({ type: 'transcript', data: {
            is_final: true, utterance: { text: `Live ${number}` },
          } }));
        }
      });
    });
    await page.route('**/api/stt', async route => {
      const request = route.request();
      const form = await new Response(request.postDataBuffer(), { headers: request.headers() }).formData();
      const bytes = new Uint8Array(await form.get('audio').arrayBuffer());
      uploads.push(bytes);
      recognitionCount++;
      if (holdRecognition) await new Promise(resolve => { releaseRecognition = resolve; });
      await route.fulfill({ json: failRecognition
        ? { success: false, error: 'test recognition failure' }
        : { success: true, text: `Part ${recognitionCount}` } });
    });
    await page.route('**/api/ai-optimize', async route => {
      const body = route.request().postDataJSON();
      optimizationInputs.push(body.text);
      await route.fulfill({ json: failOptimize ? { success: false, error: 'test optimization failure' }
        : { success: true, text: `Optimized: ${body.text}` } });
    });
    page.on('dialog', dialog => dialog.accept());
    await page.goto(process.env.ASR_TEST_URL || 'http://localhost:3011');
    const start = page.getByRole('button', { name: 'Start Recording', exact: true });
    const stop = page.getByRole('button', { name: 'Stop', exact: true });
    const cancel = page.getByRole('button', { name: 'Discard Recording', exact: true });
    const resume = page.getByRole('button', { name: 'Continue Previous', exact: true });
    const raw = page.locator('textarea[placeholder]').first();
    // This suite validates exact WAV merging; compression has its own browser suite.
    await page.locator('#asr-compress-audio').uncheck();
    const history = () => page.evaluate(() => JSON.parse(localStorage.getItem('asr_transcription_history') || '[]'));
    const record = async button => {
      await button.click();
      await expect(stop).toBeVisible();
      await expect(page.locator('.audio-recorder .font-mono')).not.toHaveText('00:00', { timeout: 10000 });
    };
    const complete = async expected => {
      await stop.click();
      await expect(resume).toBeEnabled();
      await expect(raw).toHaveValue(expected);
    };
    const replayWav = () => page.evaluate(async () => {
      const RealAudio = window.Audio;
      let captured;
      window.Audio = class { constructor(url) { captured = url; } play() { return Promise.resolve(); } };
      [...document.querySelectorAll('button')].find(button => button.textContent.includes('Play')).click();
      window.Audio = RealAudio;
      const audio = new RealAudio(captured);
      await new Promise((resolve, reject) => { audio.onloadedmetadata = resolve; audio.onerror = reject; });
      if (!(audio.duration > 0)) throw new Error('Merged WAV is not playable');
      await audio.play();
      audio.pause();
      return Array.from(new Uint8Array(await (await fetch(captured)).arrayBuffer()));
    });

    await record(start);
    await complete('Part 1');
    const firstAudio = await replayWav();
    const firstHistory = await history();
    assert.equal(firstHistory.length, 1);
    const originalId = firstHistory[0].id;
    await record(resume);
    await expect(raw).toHaveValue('Part 1');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const pausedTime = await page.locator('.audio-recorder .font-mono').textContent();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.audio-recorder .font-mono').textContent(), pausedTime);
    await expect(raw).toHaveValue('Part 1');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(raw).toHaveValue('Part 1');
    await cancel.click();
    await expect(resume).toBeEnabled();
    await expect(raw).toHaveValue('Part 1');
    assert.equal(recognitionCount, 1);
    assert.deepEqual(await replayWav(), firstAudio);
    assert.deepEqual(await history(), firstHistory);
    await record(start);
    await expect(raw).toHaveValue('');
    await cancel.click();
    await expect(raw).toHaveValue('Part 1');
    await expect(page.locator('textarea[readonly]')).toHaveCount(0);
    assert.deepEqual(await replayWav(), firstAudio);
    holdRecognition = true;
    await record(resume);
    await stop.click();
    await expect(start).toBeDisabled();
    await expect(raw).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Clear Content', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: /History \(/ }).click();
    await expect(page.getByTitle('Use this record').first()).toBeDisabled();
    await page.keyboard.press('Control+Shift+X');
    await expect(raw).toHaveValue('Part 1');
    assert.equal(typeof releaseRecognition, 'function');
    holdRecognition = false;
    releaseRecognition();
    await expect(resume).toBeEnabled();
    await expect(raw).toHaveValue('Part 1\nPart 2');
    await page.getByRole('button', { name: /History \(/ }).click();
    await record(resume);
    await complete('Part 1\nPart 2\nPart 3');
    const merged = await replayWav();
    assert.equal(merged.length, uploads.reduce((size, bytes) => size + bytes.length - 44, 44));
    let records = await history();
    assert.equal(records.length, 1);
    assert.equal(records[0].id, originalId);
    assert.equal(records[0].duration, (merged.length - 44) / 32000);
    assert.equal(records[0].optimizedText, 'Optimized: Part 1\nPart 2\nPart 3');
    await page.getByRole('button', { name: /Re-recognize|Retry/ }).click();
    await expect(resume).toBeEnabled();
    await expect(raw).toHaveValue('Part 4');
    assert.deepEqual(Array.from(uploads[3]), merged);
    assert.equal((await history()).length, 1);

    failRecognition = true;
    await record(resume);
    await complete('Part 4');
    assert.equal((await history())[0].text, 'Part 4');
    failRecognition = false;
    failOptimize = true;
    await page.getByRole('button', { name: /Re-recognize|Retry/ }).click();
    await expect(resume).toBeEnabled();
    await expect(raw).toHaveValue('Part 6');
    assert.equal((await history())[0].optimizedText, undefined);
    await expect(page.getByText('Optimization failed: test optimization failure')).toBeVisible();
    failOptimize = false;
    await record(start);
    await complete('Part 7');
    assert.equal((await history()).length, 2);
    await page.getByRole('button', { name: /History \(/ }).click();
    await page.getByTitle('Use this record').first().click();
    await expect(resume).toHaveCount(0);
    await page.reload();
    await expect(resume).toHaveCount(0);
    await record(start);
    await complete('Part 8');
    await page.getByRole('button', { name: 'Clear Content', exact: true }).click();
    await expect(resume).toHaveCount(0);
    await expect(raw).toHaveValue('');

    // Exercise the real live-client WebSocket and the same microphone recorder.
    await page.locator('select').first().selectOption('gladia-realtime');
    await page.locator('input[name="asr-api-key"]').fill('live-key');
    await record(start);
    await complete('Live 1');
    const liveSnapshot = await history();
    const liveAudio = await replayWav();
    await record(resume);
    await expect(raw).toHaveValue('Live 1\nLive 2');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await cancel.click();
    await expect(raw).toHaveValue('Live 1');
    await expect(resume).toBeEnabled();
    assert.deepEqual(await history(), liveSnapshot);
    assert.deepEqual(await replayWav(), liveAudio);
    await record(resume);
    await complete('Live 1\nLive 3');
    assert.equal((await history()).length, liveSnapshot.length);
    assert.equal((await history())[0].id, liveSnapshot[0].id);
    assert.ok((await replayWav()).length > liveAudio.length);

    // A failed microphone start restores the previous live transcript and audio.
    await page.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...args) => {
        navigator.mediaDevices.getUserMedia = original;
        throw new Error('test microphone denied');
      };
    });
    await start.click();
    await expect(page.getByText('Error: test microphone denied')).toBeVisible();
    await expect(raw).toHaveValue('Live 1\nLive 3');
    await expect(resume).toBeEnabled();

    await page.setViewportSize({ width: 375, height: 812 });
    await record(resume);
    const recorderBox = await page.locator('.audio-recorder').boundingBox();
    assert.ok(recorderBox.width <= 375);
    await cancel.click();

    // Zero captured frames behave like discard, without a transcription upload.
    const beforeEmpty = await history();
    await page.evaluate(() => {
      const original = AudioContext.prototype.createScriptProcessor;
      AudioContext.prototype.createScriptProcessor = function (...args) {
        AudioContext.prototype.createScriptProcessor = original;
        const processor = original.apply(this, args);
        Object.defineProperty(processor, 'onaudioprocess', { get: () => null, set: () => {} });
        return processor;
      };
    });
    await resume.click();
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(resume).toBeEnabled();
    await expect(raw).toHaveValue('Live 1\nLive 3');
    assert.deepEqual(await history(), beforeEmpty);
    assert.equal(recognitionCount, 8);

    // Insert keeps capturing while a request is pending; Stop optimizes once.
    await page.locator('select').first().selectOption('openai');
    const insert = page.getByRole('button', { name: 'Insert', exact: true });
    const beforeInserts = recognitionCount;
    const beforeOptimizations = optimizationInputs.length;
    const beforeInsertUploads = uploads.length;
    holdRecognition = true;
    releaseRecognition = undefined;
    await record(start);
    await insert.click();
    await expect.poll(() => typeof releaseRecognition).toBe('function');
    await expect(stop).toBeVisible();
    await expect(insert).toBeEnabled();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await insert.click();
    // No captured frames since the previous Insert: do not submit duplicates.
    await insert.click();
    holdRecognition = false;
    releaseRecognition();
    await expect(raw).toHaveValue(`Part ${beforeInserts + 1}\nPart ${beforeInserts + 2}`);
    assert.equal(recognitionCount, beforeInserts + 2);
    assert.equal(optimizationInputs.length, beforeOptimizations);
    await expect(page.locator('textarea[readonly]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForTimeout(400);
    const insertedText = `Part ${beforeInserts + 1}\nPart ${beforeInserts + 2}\nPart ${beforeInserts + 3}`;
    holdRecognition = true;
    releaseRecognition = undefined;
    await stop.click();
    await expect.poll(() => typeof releaseRecognition).toBe('function');
    await expect(start).toBeDisabled();
    assert.equal(optimizationInputs.length, beforeOptimizations);
    holdRecognition = false;
    releaseRecognition();
    await expect(resume).toBeEnabled();
    await expect(raw).toHaveValue(insertedText);
    assert.equal(optimizationInputs.length, beforeOptimizations + 1);
    assert.equal(optimizationInputs.at(-1), insertedText);
    assert.equal((await history())[0].text, insertedText);
    assert.equal((await history())[0].optimizedText, `Optimized: ${insertedText}`);
    const insertedAudio = await replayWav();
    const segmentSamples = uploads.slice(beforeInsertUploads).reduce((size, bytes) => size + bytes.length - 44, 0);
    // Independent resampling may round by one sample per boundary.
    assert.ok(Math.abs(insertedAudio.length - 44 - segmentSamples) <= 6);

    // Discard aborts an in-flight Insert and prevents queued/late results committing.
    const insertSnapshot = await history();
    const cancelCount = recognitionCount;
    holdRecognition = true;
    releaseRecognition = undefined;
    await record(resume);
    await insert.click();
    await expect.poll(() => typeof releaseRecognition).toBe('function');
    await page.waitForTimeout(300);
    await insert.click();
    await cancel.click();
    holdRecognition = false;
    releaseRecognition();
    await expect(resume).toBeEnabled();
    await page.waitForTimeout(300);
    await expect(raw).toHaveValue(insertedText);
    assert.equal(recognitionCount, cancelCount + 1);
    assert.deepEqual(await history(), insertSnapshot);
    assert.deepEqual(await replayWav(), insertedAudio);

    // A failed segment does not block the next segment or full-audio recovery.
    const failedCount = recognitionCount;
    failRecognition = true;
    await record(resume);
    await insert.click();
    await expect(page.getByText('Recognition failed: test recognition failure')).toBeVisible();
    failRecognition = false;
    await page.waitForTimeout(300);
    await complete(`${insertedText}\nPart ${failedCount + 2}`);
    assert.ok((await replayWav()).length > insertedAudio.length);
    assert.deepEqual(errors, []);
    console.log('PASS: recording, continuations, Gladia live, Insert while pending, ordered segments, no duplicate empty segments, Stop optimization, Insert cancellation/failure, complete audio and mobile layout');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
