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
    const model = page.getByRole('combobox', { name: 'AI model (select or type)' });
    const toggleModels = page.getByRole('button', { name: 'AI model (select or type)', exact: true });
    const option = name => page.getByRole('option', { name, exact: true });
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
    await model.fill('second-groq');
    await add.click();
    await toggleModels.click();
    await expect(option('custom-groq')).toBeVisible();
    await expect(option('second-groq')).toBeVisible();
    await expect(option('openai/gpt-oss-120b')).toBeVisible();
    await option('custom-groq').click();
    await expect(model).toHaveValue('custom-groq');
    await toggleModels.click();
    await option('second-groq').click();
    await expect(model).toHaveValue('second-groq');
    await toggleModels.click();
    await option('custom-groq').click();
    await model.press('ArrowDown');
    await model.press('Enter');
    await expect(model).toHaveValue('openai/gpt-oss-120b');
    await toggleModels.click();
    await option('custom-groq').click();
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
    assert.equal(exported.aiOptimizer.model, 'custom-groq');
    assert.deepEqual(exported.aiOptimizer.models, ['openai/gpt-oss-120b', 'custom-groq', 'second-groq']);
    assert.deepEqual(exported.aiOptimizer.profiles.groq.models, ['openai/gpt-oss-120b', 'custom-groq', 'second-groq']);
    await remove.click();
    await expect(model).toHaveValue('');
    await page.reload();
    await toggleModels.click();
    await expect(option('custom-groq')).toHaveCount(0);
    await expect(option('second-groq')).toBeVisible();
    await option('second-groq').click();
    await expect(model).toHaveValue('second-groq');
    await page.locator('input[type="file"]').filter({ hasNot: page.locator('[accept="audio/*"]') }).last().setInputFiles({
      name: 'config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)),
    });
    await expect(model).toHaveValue('custom-groq');
    await page.waitForTimeout(1400);
    await expect(model).toHaveValue('custom-groq');
    await backend.selectOption('openai');
    await expect(key).toHaveValue('test-openai');
    const importConfig = async config => {
      await page.locator('input[type="file"]').last().setInputFiles({
        name: 'config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)),
      });
      await page.waitForTimeout(1400);
    };
    // Single-provider files can contain multiple saved models without profiles.
    const singleProvider = { ...exported, aiOptimizer: { ...exported.aiOptimizer } };
    delete singleProvider.aiOptimizer.profiles;
    await importConfig(singleProvider);
    await expect(model).toHaveValue('custom-groq');
    await toggleModels.click();
    await expect(option('custom-groq')).toBeVisible();
    await expect(option('second-groq')).toBeVisible();
    await option('second-groq').click();
    await expect(model).toHaveValue('second-groq');
    // Old files only have model: preserve that model and the other provider.
    const legacyConfig = { ...exported, aiOptimizer: {
      backend: 'groq', apiKey: 'legacy-groq-key', model: 'old-single-model', baseUrl: 'https://legacy.example.test/v1',
    } };
    await importConfig(legacyConfig);
    await expect(model).toHaveValue('old-single-model');
    await expect(key).toHaveValue('legacy-groq-key');
    await expect(base).toHaveValue('https://legacy.example.test/v1');
    await toggleModels.click();
    await expect(option('old-single-model')).toBeVisible();
    await option('old-single-model').click();
    await backend.selectOption('openai');
    await expect(key).toHaveValue('test-openai');
    await expect(model).toHaveValue('legacy-model');
    // A file with just one entry in the new models array also stays usable.
    await importConfig({ ...legacyConfig, aiOptimizer: { ...legacyConfig.aiOptimizer, models: ['old-single-model'] } });
    await toggleModels.click();
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
    await option('old-single-model').click();
    console.log('AI backend switching, legacy migration, model add/delete, reload and config round-trip, single-provider multi-model and legacy single-model import passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
