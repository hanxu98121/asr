// NODE_PATH must include Playwright; run against a local ASR server.
const assert = require('node:assert/strict');
const { chromium, expect } = require('playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.ASR_TEST_URL || 'http://localhost:3011');
    assert(await page.evaluate(() => CSS.supports('appearance', 'base-select')),
      'This regression requires a browser supporting customizable selects');
    const select = page.locator('#asr-backend');
    for (const width of [1327, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const zoom of [1, 1.75]) {
        await page.evaluate(value => { document.body.style.zoom = value; }, zoom);
        await select.scrollIntoViewIfNeeded();
        await select.click();
        const option = select.locator('option[value="gladia"]');
        await option.hover();
        const geometry = await select.evaluate(element => {
          const option = element.querySelector('option[value="gladia"]');
          const row = option.getBoundingClientRect();
          const control = element.getBoundingClientRect();
          const picker = getComputedStyle(element, '::picker(select)');
          return { rowWidth: row.width, controlWidth: control.width,
            pickerWidth: parseFloat(picker.width), background: getComputedStyle(option).backgroundColor };
        });
        assert(geometry.rowWidth >= geometry.controlWidth - 12 * zoom,
          `Highlight must span the menu at width ${width}, zoom ${zoom}: ${JSON.stringify(geometry)}`);
        assert.equal(geometry.background, 'rgb(229, 231, 235)');
        await option.click();
        await expect(select).toHaveValue('gladia');
        await select.selectOption('elevenlabs');
      }
    }
    await page.evaluate(() => { document.body.style.zoom = 1; });
    await select.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(select).toHaveValue('soniox');
    await page.reload();
    await expect(select).toHaveValue('soniox');
    await select.click();
    await page.keyboard.press('Escape');
    assert.equal(await select.evaluate(element => element.matches(':open')), false);
    await select.evaluate(element => { element.disabled = true; });
    await expect(select).toBeDisabled();
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    const aiSelect = page.locator('.backend-select').last();
    await aiSelect.click();
    const aiOption = aiSelect.locator('option[value="openai"]');
    await aiOption.hover();
    assert.equal(await aiOption.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(75, 85, 99)');
    await aiOption.click();
    await expect(aiSelect).toHaveValue('openai');
    console.log('Backend menus: full-width hover at desktop/mobile widths and zoom, keyboard, persistence, disabled state, dark mode passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
