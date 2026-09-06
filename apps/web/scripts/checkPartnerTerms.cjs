const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  try {
    const page = await browser.newPage();
    const output = path.join(process.env.TEMP || '.', 'sokoeats-terms-check');
    fs.mkdirSync(output, { recursive: true });
    for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto('http://127.0.0.1:3000', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Create account', exact: true }).first().click();
      await page.screenshot({ path: path.join(output, `signup-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Rider', exact: true }).click();
      await page.getByRole('button', { name: 'Read rider terms of service' }).click();
      const dialog = page.getByRole('dialog', { name: 'SokoEats Rider Terms of Service' });
      await dialog.waitFor({ state: 'visible' });
      await page.getByText('EkaziConnect Solutions Ltd', { exact: true }).waitFor();
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1);
      await page.screenshot({ path: path.join(output, `rider-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Back to account', exact: true }).click();
      await page.getByRole('checkbox', { name: /I have read and agree/ }).check();
      await page.getByRole('button', { name: 'Store Partner', exact: true }).click();
      await page.getByRole('button', { name: 'Read vendor terms of service' }).waitFor();
      assert.equal(await page.getByRole('checkbox', { name: /I have read and agree/ }).isChecked(), false);
      await page.getByRole('button', { name: 'Read vendor terms of service' }).click();
      await page.getByRole('dialog', { name: 'SokoEats Vendor Terms of Service' }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Close terms', exact: true }).click();
      await page.getByRole('button', { name: 'Merchant', exact: true }).click();
      await page.getByRole('button', { name: 'Read merchant terms of service' }).click();
      await page.getByRole('dialog', { name: 'SokoEats Merchant Terms of Service' }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Back to account', exact: true }).click();
    }
    console.log(`PASS: terms dialogs on desktop/mobile web; explicit unchecked consent resets across roles. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
