const assert = require('node:assert/strict');
const { chromium, expect } = require('playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'allow', permissions: ['microphone'] });
    await context.addInitScript(() => {
      if (!localStorage.getItem('language')) {
        localStorage.setItem('language', 'en');
        localStorage.setItem('asr-backend', 'openai');
        localStorage.setItem('openai-api-key', 'test-key');
        localStorage.setItem('openai-asr-model', 'legacy-asr');
        localStorage.setItem('asr-compress-audio', 'false');
        localStorage.setItem('ai-auto-optimize', 'false');
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const requests = [];
    await page.route('**/api/stt', async route => {
      const request = route.request();
      const form = await new Response(request.postDataBuffer(), { headers: request.headers() }).formData();
      requests.push(form.get('model'));
      await route.fulfill({ json: { success: true, text: 'Recorded text' } });
    });
    await page.goto(process.env.ASR_TEST_URL || 'http://localhost:3011');
    const model = page.locator('#asr-model');
    const panel = page.locator('label[for="asr-model"]').locator('..');
    const toggle = panel.getByRole('button', { name: 'ASR model (leave blank for whisper-1)', exact: true });
    const add = panel.getByRole('button', { name: 'Add', exact: true });
    const remove = panel.getByRole('button', { name: 'Delete', exact: true });
    const option = name => page.getByRole('option', { name, exact: true });
    await expect(model).toHaveValue('legacy-asr');
    await toggle.click();
    await expect(option('legacy-asr')).toBeVisible();
    await expect(option('whisper-1')).toBeVisible();
    await option('legacy-asr').click();
    for (const name of ['custom-asr-one', 'custom-asr-two']) {
      await model.fill(name);
      await add.click();
    }
    await toggle.click();
    await expect(option('custom-asr-one')).toBeVisible();
    await expect(option('custom-asr-two')).toBeVisible();
    await option('custom-asr-one').click();
    await page.reload();
    await expect(model).toHaveValue('custom-asr-one');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export All Config/ }).click();
    const stream = await (await downloadPromise).createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    assert.deepEqual(exported.asr.openaiCompatible.models, ['whisper-1', 'legacy-asr', 'custom-asr-one', 'custom-asr-two']);
    assert.equal(exported.asr.openaiCompatible.model, 'custom-asr-one');
    await remove.click();
    await toggle.click();
    await expect(option('custom-asr-one')).toHaveCount(0);
    await option('custom-asr-two').click();
    const importConfig = async config => {
      await page.locator('input[type="file"]').last().setInputFiles({
        name: 'config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)),
      });
      await page.waitForTimeout(1400);
    };
    await importConfig(exported);
    await expect(model).toHaveValue('custom-asr-one');
    await toggle.click();
    await option('custom-asr-two').click();
    await page.getByRole('button', { name: 'Start Recording', exact: true }).click();
    await expect(model).toBeDisabled();
    await expect(toggle).toBeDisabled();
    await expect(add).toBeDisabled();
    await expect(remove).toBeDisabled();
    await expect(page.locator('.audio-recorder .font-mono')).not.toHaveText('00:00');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(model).toBeEnabled();
    assert.equal(requests.at(-1), 'custom-asr-two');
    const legacy = { ...exported, asr: { ...exported.asr, openaiCompatible: { model: 'imported-single', baseUrl: '' } } };
    await importConfig(legacy);
    await expect(model).toHaveValue('imported-single');
    await toggle.click();
    await expect(option('imported-single')).toBeVisible();
    await option('imported-single').click();
    await page.getByRole('button', { name: '中文', exact: true }).click();
    const chineseToggle = panel.getByRole('button', { name: 'ASR 模型（留空使用 whisper-1）', exact: true });
    await expect(chineseToggle).toBeVisible();
    await expect(panel.getByRole('button', { name: '添加', exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: '删除', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'AI 模型（可选择或输入）' })).toBeVisible();
    await model.fill('中文界面模型');
    await panel.getByRole('button', { name: '添加', exact: true }).click();
    await chineseToggle.click();
    await option('imported-single').click();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(toggle).toBeVisible();
    await expect(model).toHaveValue('imported-single');
    await toggle.click();
    await expect(option('中文界面模型')).toBeVisible();
    assert.deepEqual(errors, []);
    console.log('ASR multi-model selection, persistence, config round-trip, legacy import, request model, disabled controls and Chinese/English rendering passed without hydration errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
