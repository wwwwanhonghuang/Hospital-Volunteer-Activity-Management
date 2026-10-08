// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const baseURL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3001';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const expectedSource = process.env.EXPECTED_SOURCE_URL || `https://github.com/wwwwanhonghuang/Hospital-Volunteer-Activity-Management/tree/v${version}`;
const institutionalName = /utokyo|university\s+of\s+tokyo|\u6771\u4eac\u5927\u5b66|\u6771\u5927|nikoniko|kodama/i;
const floorGuide = 'https://www.h.u-tokyo.ac.jp/english/international-patients/floor-guide/index.html';
const publicSourceURLs = [floorGuide, 'https://www.h.u-tokyo.ac.jp/patient/library/', ...['b3', 'b1', 'f1', 'f2', 'f3', 'f4', 'f6', 'f7'].map(floor => `https://www.h.u-tokyo.ac.jp/english/images/international-patients/floor-guide/${floor}.gif`)];
const brand = {
  checkedAt: new Date().toISOString(), baseURL, browser: 'Installed Chrome via Playwright',
  scope: 'Independent SHUORI identity, desktop/mobile login, original artwork and software/source notice. Automated checks do not establish WCAG conformance.',
  errors: [], views: [],
};
const identity = {
  checkedAt: brand.checkedAt, version, baseURL,
  scope: 'Rendered login, dashboard, workspace guide and spatial demo copy; source links are retained only as explicit model provenance. Demo authentication is the only permitted API write.',
  provenancePolicy: {
    allowedPublicSourceURLs: publicSourceURLs,
    allowedContexts: ['README warning and demo floor-source documentation', 'Explicit demo model provenance links', 'Model source/reference metadata'],
    institutionalNameException: 'The README warning and source documentation identify the source institution for attribution; it is not the application or workspace identity.',
  },
  views: [], pageErrors: [], unexpectedWrites: [],
};
const health = await (await fetch(`${baseURL}/api/health`)).json();
assert.equal(health.mode, 'demo', 'Identity audit requires a synthetic demo workspace.');
const fingerprint = state => createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'audit')))).digest('hex');
await mkdir('artifacts/qa', { recursive: true });
await mkdir('artifacts/previews', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, timezoneId: 'Asia/Tokyo', locale: 'en-GB' });
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && new URL(request.url()).pathname !== '/api/demo-login') {
      identity.unexpectedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
      await route.abort('blockedbyclient'); return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => { brand.errors.push(error.message); identity.pageErrors.push(error.message); });

  async function checkIdentity(name, notice) {
    const text = await page.locator('body').innerText();
    assert.doesNotMatch(text, institutionalName, `${name}: institution-specific names remain in the rendered interface.`);
    assert.match(text, notice, `${name}: independent/demo notice is missing.`);
    const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent.trim(), href: node.href })).filter(link => /u-tokyo\.ac\.jp/i.test(link.href)));
    for (const link of links) {
      assert.ok(publicSourceURLs.includes(link.href), `${name}: unexpected institutional link ${link.href}`);
      assert.match(link.text, /source|reference/i, `${name}: institutional URL is not labeled as a source.`);
    }
    identity.views.push({ name, institutionalNames: 0, requiredNoticePresent: true, sourceLinks: links });
  }

  for (const [name, viewport, screenshot] of [
    ['Desktop login', { width: 1440, height: 1080 }, '00-login.png'],
    ['Mobile login', { width: 390, height: 844 }, '00-login-mobile.png'],
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(baseURL);
    await page.getByRole('heading', { name: 'Welcome to SHUORI' }).waitFor();
    await page.evaluate(async () => { await document.fonts.ready; });
    await checkIdentity(name, /independent personal project[\s\S]*no hospital or organizational affiliation/i);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const details = await page.evaluate(() => {
      const card = document.querySelector('.login-card').getBoundingClientRect();
      const footer = document.querySelector('.login-bottom').getBoundingClientRect();
      return {
        title: document.title,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        footerGap: Math.round((footer.top - card.bottom) * 100) / 100,
        footerWithinPage: footer.bottom <= document.documentElement.scrollHeight + 1,
        artwork: [...document.querySelectorAll('img')].map(node => ({ src: node.getAttribute('src'), loaded: node.complete && node.naturalWidth > 0 })),
        links: [...document.querySelectorAll('.software-notice a')].map(node => {
          const box = node.getBoundingClientRect();
          return { text: node.textContent, href: node.getAttribute('href'), visible: box.width > 0 && box.height > 0 };
        }),
      };
    });
    const license = await context.request.get(`${baseURL}/software-license.txt`);
    const softwareLicense = { status: license.status(), containsAGPL: (await license.text()).includes('GNU AFFERO GENERAL PUBLIC LICENSE') };
    assert.equal(softwareLicense.status, 200);
    assert.equal(softwareLicense.containsAGPL, true);
    assert.ok(details.links.some(link => link.text === 'Source code' && link.href === expectedSource && link.visible));
    assert.ok(details.artwork.length > 0 && details.artwork.every(item => item.loaded));
    assert.equal(details.overflow, false);
    assert.equal(details.footerWithinPage, true);
    assert.equal(result.violations.length, 0, `${name}: accessibility violations.`);
    brand.views.push({ name, ...details, viewport, softwareLicense, violations: result.violations, incomplete: result.incomplete });
    await page.screenshot({ path: `artifacts/previews/${screenshot}`, fullPage: true, animations: 'disabled' });
  }

  const login = await context.request.post(`${baseURL}/api/demo-login`, { data: { username: 'admin' } });
  assert.equal(login.ok(), true);
  // An API sign-in changes cookies; reload so the mounted login view reads the new session.
  await page.reload();
  const before = await (await context.request.get(`${baseURL}/api/state`)).json();
  identity.operationalStateBefore = fingerprint(before);
  await page.setViewportSize({ width: 1440, height: 1080 });
  for (const [route, heading, notice] of [
    ['dashboard', 'Operations overview', /Hospital workspace/],
    ['settings', 'Demo model provenance', /general-purpose system developed independently in a personal capacity/],
    ['spatial', 'Hospital in perspective.', /An independently reconstructed demo model/],
  ]) {
    await page.goto(`${baseURL}/#/${route}`);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    await checkIdentity(route, notice);
    if (route === 'spatial') {
      await page.getByRole('group', { name: 'Choose hospital floor' }).getByRole('button', { name: '6F', exact: true }).click();
      await checkIdentity('spatial-6F', /Patient library|Demo library/i);
    }
  }
  const after = await (await context.request.get(`${baseURL}/api/state`)).json();
  identity.operationalStateAfter = fingerprint(after);
  identity.operationalStateUnchanged = identity.operationalStateBefore === identity.operationalStateAfter;
  assert.equal(identity.operationalStateUnchanged, true);
  assert.deepEqual(identity.pageErrors, []);
  assert.deepEqual(identity.unexpectedWrites, []);
  identity.passed = true;
} catch (error) {
  identity.passed = false;
  identity.failure = error.message;
  brand.errors.push(error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile('artifacts/qa/brand-accessibility.json', `${JSON.stringify(brand, null, 2)}\n`);
  await writeFile('artifacts/qa/neutral-identity.json', `${JSON.stringify(identity, null, 2)}\n`);
}
console.log(JSON.stringify({ passed: identity.passed, loginViews: brand.views.length, identityViews: identity.views.length, errors: brand.errors, unexpectedWrites: identity.unexpectedWrites, operationalStateUnchanged: identity.operationalStateUnchanged }, null, 2));
