const assert = require('node:assert/strict');
const { chromium, expect } = require('playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const url = process.env.ASR_TEST_URL || 'http://localhost:3011';
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('language', 'en');
      localStorage.setItem('ai-optimizer-backend', 'openai');
      localStorage.setItem('ai-optimizer-api-key', 'test-openai');
      localStorage.setItem('ai-optimizer-model', 'legacy-model');
      localStorage.setItem('ai-optimizer-base-url', 'https://openai.example.test/v1');
    });
    await page.reload();
    page.on('dialog', dialog => dialog.accept());
    const backend = page.locator('select').filter({ has: page.locator('option[value="groq"]') }).nth(1);
    const panel = page.locator('div').filter({ has: page.locator('input[name="ai-optimizer-api-key"]') }).filter({ has: page.locator(':scope > select') });
    const key = page.locator('input[name="ai-optimizer-api-key"]');
    const model = page.locator('input[list="ai-model-options"]');
    const base = panel.locator('input[type="text"]').last();
    const add = panel.getByRole('button', { name: 'Add', exact: true }).first();
    const remove = panel.getByRole('button', { name: 'Delete', exact: true }).first();
    await expect(model).toHaveValue('legacy-model');
    await backend.selectOption('groq');
    await expect(key).toHaveValue('');
    await expect(model).toHaveValue('');
    await expect(model).toHaveAttribute('placeholder', 'openai/gpt-oss-120b');
    await expect(base).toHaveValue('');
    await key.fill('test-groq');
    await base.fill('https://groq.example.test/v1');
    await model.fill('custom-groq');
    await add.click();
    await expect(add).toBeDisabled();
    await expect(page.locator('#ai-model-options option[value="custom-groq"]')).toHaveCount(1);
    await backend.selectOption('openai');
    await expect(key).toHaveValue('test-openai');
    await expect(model).toHaveValue('legacy-model');
    await expect(base).toHaveValue('https://openai.example.test/v1');
    await backend.selectOption('groq');
    await expect(model).toHaveValue('custom-groq');
    await page.reload();
    await expect(model).toHaveValue('custom-groq');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export All Config/ }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(exported.aiOptimizer.profiles.openai.apiKey, 'test-openai');
    assert.deepEqual(exported.aiOptimizer.profiles.groq.models, ['openai/gpt-oss-120b', 'custom-groq']);
    await remove.click();
    await expect(model).toHaveValue('');
    await page.reload();
    await expect(page.locator('#ai-model-options option[value="custom-groq"]')).toHaveCount(0);
    await page.locator('input[type="file"]').filter({ hasNot: page.locator('[accept="audio/*"]') }).last().setInputFiles({
      name: 'config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)),
    });
    await expect(model).toHaveValue('custom-groq');
    await page.waitForTimeout(1400);
    await expect(model).toHaveValue('custom-groq');
    await backend.selectOption('openai');
    await expect(key).toHaveValue('test-openai');
    console.log('AI backend switching, legacy migration, model add/delete, reload and config round-trip passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
