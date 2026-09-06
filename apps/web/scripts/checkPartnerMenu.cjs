const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/e0AAAAASUVORK5CYII=';
      let items = [{ id: 'test-product', vendorId: 'test-vendor', name: 'Passion Juice', description: 'Fresh passion fruit juice', price: 195, category: 'Drinks', unitLabel: 'glass', available: true, popular: true, imageUrl: image, sortOrder: 3 }];
      let updates = 0, deletions = 0, uploads = 0;
      let rejectDelete = false;
      await context.addInitScript(() => localStorage.setItem('sokoeats.auth', JSON.stringify({ token: 'test-only-token', expiresAt: '2099-01-01', user: { id: 'test-owner', name: 'Test Merchant', email: 'merchant@example.invalid', role: 'merchant', status: 'active' } })));
      await page.route('**/api/**', async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!pathname.startsWith('/api/')) return route.continue();
        let body = {}, status = 200;
        if (pathname === '/api/vendor/menu') body = { menu: { vendor: { name: 'Test Shop', address: 'Nairobi' }, items, sections: ['Drinks', 'Meals'].map((title, index) => ({ id: String(index), title, items: items.filter(item => item.category === title) })) } };
        else if (pathname === '/api/deliveries') body = { orders: [] };
        else if (pathname === '/api/vendor/media/presign') { uploads++; throw new Error('Existing image must not be uploaded again'); }
        else if (request.method() === 'PUT') {
          const payload = request.postDataJSON();
          assert.equal(payload.imageUrl, image);
          assert.equal(payload.popular, true);
          assert.equal(payload.sortOrder, 3);
          items = [{ ...items[0], ...payload, category: payload.sectionTitle }];
          updates++;
          body = { item: items[0], categorization: { category: payload.sectionTitle } };
        } else if (request.method() === 'DELETE') {
          if (rejectDelete) { status = 503; body = { message: 'Temporary test failure. Please retry.' }; }
          else { deletions++; items = []; body = { deletedId: 'test-product' }; }
        } else throw new Error(`Unexpected request: ${request.method()} ${pathname}`);
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(process.env.PARTNER_URL || 'http://127.0.0.1:5173');
      await page.getByRole('button', { name: 'Edit Passion Juice', exact: true }).click();
      await page.getByLabel('Specific product name').fill('Mango Juice');
      await page.getByLabel('Price in KES').fill('250');
      await page.getByRole('combobox').selectOption('Meals');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.getByRole('button', { name: 'Edit Mango Juice', exact: true }).waitFor();
      assert.equal(updates, 1);
      assert.equal(uploads, 0);
      await page.getByRole('button', { name: 'Edit Mango Juice', exact: true }).click();
      await page.getByLabel('Specific product name').fill('Unsaved change');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(await page.getByLabel('Specific product name').inputValue(), '');
      assert.equal(updates, 1);
      await page.getByRole('button', { name: 'Delete Mango Juice', exact: true }).click();
      await page.getByRole('button', { name: 'Keep product', exact: true }).click();
      assert.equal(deletions, 0);
      await page.getByRole('button', { name: 'Delete Mango Juice', exact: true }).click();
      await page.screenshot({ path: path.join(os.tmpdir(), `sokoeats-delete-${viewport.width}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, 'Page must fit viewport');
      rejectDelete = true;
      await page.getByRole('button', { name: 'Delete product', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Temporary test failure' }).waitFor();
      assert.equal(deletions, 0);
      rejectDelete = false;
      await page.getByRole('button', { name: 'Delete product', exact: true }).click();
      await page.getByRole('heading', { name: 'Your catalogue is empty' }).waitFor();
      assert.equal(deletions, 1);
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}px: edit, preserve image, cancel, delete confirmation, error/retry, no overflow or runtime errors.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
