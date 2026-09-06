const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  let exchanges = 0;
  try {
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/auth/google/web/exchange') {
        exchanges++;
        assert.equal(request.postDataJSON().code, 'single-use-test-code');
        return route.fulfill({ status: exchanges === 1 ? 200 : 401, contentType: 'application/json', body: JSON.stringify(exchanges === 1 ? {
          token: 'test-session-token', expiresAt: '2099-01-01T00:00:00.000Z',
          user: { id: 'test-buyer', name: 'Test Buyer', email: 'buyer@example.invalid', role: 'customer', status: 'active', profileComplete: true },
        } : { message: 'Google sign-in link is invalid or expired' }) });
      }
      if (path === '/api/vendors') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vendors: [] }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto(`${process.env.WEB_URL || 'http://127.0.0.1:3000'}/?auth_code=single-use-test-code`);
    await page.waitForFunction(() => Boolean(localStorage.getItem('sokoeats.auth')));
    await page.waitForTimeout(500);
    assert.equal(exchanges, 1, 'Strict Mode must not exchange the single-use code twice');
    assert.equal(new URL(page.url()).search, '');
    const session = JSON.parse(await page.evaluate(() => localStorage.getItem('sokoeats.auth')));
    assert.equal(session.user.role, 'customer');
    console.log('PASS: Google handoff exchanged once, buyer session saved, callback URL cleaned.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
