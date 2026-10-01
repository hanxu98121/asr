// NODE_PATH must include Playwright; ASR_TEST_URL defaults to the local test server.
const assert = require('node:assert/strict');
const { chromium, expect } = require('playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'allow', permissions: ['microphone'], acceptDownloads: true });
    await context.addInitScript(() => {
      localStorage.setItem('language', 'en');
      localStorage.setItem('asr-backend', localStorage.getItem('asr-backend') || 'openai');
      localStorage.setItem('openai-api-key', 'test-key');
      localStorage.setItem('ai-auto-optimize', 'false');
    });
    const page = await context.newPage();
    const errors = [];
    // The existing language setting differs from the server's Chinese default.
    page.on('pageerror', error => {
      if (!error.message.startsWith('Hydration failed because') && !error.message.startsWith('Minified React error #418;')) errors.push(error.message);
    });
    page.on('dialog', dialog => dialog.accept());
    const uploads = [];
    let rejectFormat = false;
    await page.route('**/api/stt', async route => {
      const request = route.request();
      const form = await new Response(request.postDataBuffer(), { headers: request.headers() }).formData();
      const file = form.get('audio');
      uploads.push({ bytes: Buffer.from(await file.arrayBuffer()), type: file.type, name: file.name });
      await route.fulfill(rejectFormat ? { status: 415, body: 'Unsupported audio format' } : { json: { success: true, text: 'Recognized' } });
    });
    await page.goto(process.env.ASR_TEST_URL || 'http://localhost:3011');
    const checkbox = page.locator('#asr-compress-audio');
    const start = page.getByRole('button', { name: 'Start Recording', exact: true });
    const stop = page.getByRole('button', { name: 'Stop', exact: true });
    const retry = page.getByRole('button', { name: /Re-recognize|Retry/ });
    const record = async (button = start) => {
      await button.click();
      await expect(stop).toBeVisible();
      await expect(checkbox).toBeDisabled();
      await expect(page.locator('.audio-recorder .font-mono')).not.toHaveText('00:00');
      await stop.click();
      await expect(checkbox).toBeEnabled({ timeout: 30000 });
    };
    const decode = async upload => page.evaluate(async base64 => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const audio = new AudioContext();
      try {
        const decoded = await audio.decodeAudioData(bytes.buffer);
        const samples = decoded.getChannelData(0);
        let energy = 0;
        for (let i = Math.max(0, samples.length - decoded.sampleRate); i < samples.length; i++) energy += samples[i] ** 2;
        return { duration: decoded.duration, tailEnergy: energy / decoded.sampleRate };
      } finally { await audio.close(); }
    }, upload.bytes.toString('base64'));

    await expect(checkbox).toBeChecked();
    await record();
    assert.equal(uploads[0].name, 'recording.mp3');
    assert.equal(uploads[0].type, 'audio/mpeg');
    assert.ok((await decode(uploads[0])).duration > 0.9);
    await record(page.getByRole('button', { name: 'Continue Previous', exact: true }));
    assert.equal(uploads[1].type, 'audio/mpeg');
    await expect(page.locator('textarea[placeholder]').first()).toHaveValue('Recognized\nRecognized');
    await retry.click();
    await expect(checkbox).toBeEnabled();
    const fullCompressedDuration = (await decode(uploads[2])).duration;
    assert.ok(fullCompressedDuration > 1.9);
    await checkbox.uncheck();
    await retry.click();
    await expect(checkbox).toBeEnabled();
    assert.equal(uploads[3].name, 'recording.wav');
    assert.equal(uploads[3].type, 'audio/wav');
    assert.equal(uploads[3].bytes.subarray(0, 4).toString(), 'RIFF');
    const fullRawDuration = (uploads[3].bytes.length - 44) / 32000;
    assert.ok(fullCompressedDuration >= fullRawDuration && fullCompressedDuration - fullRawDuration < 0.15);
    await page.reload();
    await expect(checkbox).not.toBeChecked();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export All Config/ }).click();
    const stream = await (await downloadPromise).createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const config = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(config.asr.compressAudio, false);
    await checkbox.check();
    delete config.asr.compressAudio;
    let importReload = page.waitForEvent('load');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'old-config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
    await importReload;
    await expect(checkbox).toBeChecked();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('asr-compress-audio'))).toBe('true');
    config.asr.compressAudio = false;
    importReload = page.waitForEvent('load');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'new-config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
    await importReload;
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();

    // Send a canonical ten-minute WAV through the application's real worker and encoder.
    await page.evaluate(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message, transfer) {
        if (!(message instanceof ArrayBuffer)) return original.call(this, message, transfer);
        Worker.prototype.postMessage = original;
        const count = Math.floor(600.013 * 16000);
        const buffer = new ArrayBuffer(44 + count * 2);
        const view = new DataView(buffer);
        for (const [offset, value] of [[0, 0x52494646], [8, 0x57415645], [12, 0x666d7420], [36, 0x64617461]]) view.setUint32(offset, value);
        view.setUint32(4, buffer.byteLength - 8, true);
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
        view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, count * 2, true);
        for (let i = 0; i < count; i++) view.setInt16(44 + i * 2, Math.sin(i * 2 * Math.PI * 440 / 16000) * 10000, true);
        original.call(this, buffer, [buffer]);
      };
    });
    await record();
    const long = uploads.at(-1);
    assert.ok(long.bytes.length < 3_700_000);
    const decoded = await decode(long);
    assert.ok(decoded.duration >= 600 && decoded.duration < 600.2);
    assert.ok(decoded.tailEnergy > 0.01, 'final second of audio must retain the tone');

    rejectFormat = true;
    await retry.click();
    await expect(page.getByText(/service does not support this audio format/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Play/ })).toBeEnabled();
    await checkbox.uncheck();
    rejectFormat = false;
    await retry.click();
    await expect(checkbox).toBeEnabled();
    assert.equal(uploads.at(-1).type, 'audio/wav');

    await checkbox.check();
    await page.evaluate(() => { window.Worker = class { constructor() { throw new Error('encoder unavailable'); } }; });
    const countBeforeFailure = uploads.length;
    await retry.click();
    await expect(page.getByText(/Compression failed/)).toBeVisible();
    assert.equal(uploads.length, countBeforeFailure);
    await expect(page.getByRole('button', { name: /Play/ })).toBeEnabled();
    await page.reload();
    await page.locator('select').first().selectOption('gladia-realtime');
    await expect(page.getByText('Applies to recording file uploads. Live transcription uses the original audio stream.')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(checkbox).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(`PASS: real worker MP3 decode (${decoded.duration.toFixed(3)}s, ${long.bytes.length} bytes), preserved tail, WAV retry, setting persistence/import/export, disabled controls, errors and mobile layout`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
