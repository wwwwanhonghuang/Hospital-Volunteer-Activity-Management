// SPDX-License-Identifier: AGPL-3.0-only
// Fresh, read-only photographs of the running spatial studio for the A4 portfolio.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const base = process.env.SHOWCASE_URL || 'http://127.0.0.1:3020';
const directory = 'artifacts/showcase/images';
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const captures = [], errors = [], mutations = [];
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
// Other independent capture sessions may sign in concurrently. Authentication
// audit entries are intentionally omitted; all operational collections remain.
const operationalDigest = raw => { const { audit, ...state } = JSON.parse(raw); return digest(JSON.stringify(state)); };
try {
  const page = await browser.newPage({ viewport: { width: 1580, height: 1350 }, deviceScaleFactor: 2, timezoneId: 'Asia/Tokyo', locale: 'en-US' });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !request.url().includes('/api/auth/demo')) mutations.push({ method: request.method(), url: request.url() }); });
  await page.goto(`${base}/#/spatial`);
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.getByRole('heading', { name: 'Hospital in perspective.' }).waitFor();
  await page.getByLabel('Workspace date', { exact: true }).fill('2026-10-08');
  await expect.poll(async () => Number((await page.locator('.studio-viewport-tools').textContent()).match(/(\d+) objects/)?.[1] || 0), { timeout: 90000 }).toBeGreaterThanOrEqual(590);
  const before = await (await page.request.get(`${base}/api/state`)).text();
  const panels = page.getByRole('group', { name: 'Spatial studio panels' });
  const floorTabs = page.getByRole('group', { name: 'Choose hospital floor' });
  const settle = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(20, 20);
    await page.waitForTimeout(1700);
  };
  const capture = async (name, caption, kind = 'workspace') => {
    await page.locator('.spatial-workspace').scrollIntoViewIfNeeded();
    await settle();
    const work = await page.locator('.spatial-workspace').boundingBox();
    const scene = await page.locator('.hospital-scene').boundingBox();
    const clip = kind === 'scene' ? scene : { x: work.x, y: work.y, width: work.width, height: scene.y + scene.height - work.y };
    const file = `${directory}/${name}.png`;
    await page.screenshot({ path: file, clip });
    const bytes = await fs.readFile(file);
    captures.push({ file, caption, bytes: bytes.length, sha256: digest(bytes), cssPixels: { width: clip.width, height: clip.height }, pixelWidth: bytes.readUInt32BE(16), pixelHeight: bytes.readUInt32BE(20), route: '#/spatial', actualWebGL: true, framing: kind });
  };
  const orbit = async (dx, dy) => {
    const bounds = await page.locator('.scene-stage canvas').boundingBox();
    const x = bounds.x + bounds.width * .25, y = bounds.y + bounds.height * .6;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 24 }); await page.mouse.up(); await settle();
  };
  await panels.getByRole('button', { name: 'Guide', exact: true }).click();
  await capture('02-building', 'Eight published levels form an exploded, independently reconstructed demo building. Floor selectors connect the schematic model with scheduled coverage.');

  await floorTabs.getByRole('button', { name: '6F', exact: true }).click();
  await page.getByRole('button', { name: 'Hide zone labels', exact: true }).click();
  await panels.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByLabel('Search scene objects', { exact: true }).fill('book collection');
  await page.locator('.studio-object-select').nth(1).click();
  await page.getByRole('button', { name: 'Focus selected object', exact: true }).click();
  await orbit(270, 0);
  await capture('15-library-detail', 'A close view of the library shows individually modeled books, shelving, furniture and plants. The selected book collection has its own object identity and editable transform.');

  await page.getByRole('button', { name: 'Zoom out', exact: true }).click({ clickCount: 2 });
  await page.getByRole('button', { name: 'Clear object selection', exact: true }).click();
  await panels.getByRole('button', { name: 'Assets', exact: true }).click();
  await capture('16-asset-catalog', 'The asset palette pairs the sixth-floor model with reusable furniture and equipment. Objects can be added to a separate spatial scenario.');

  await floorTabs.getByRole('button', { name: '1F', exact: true }).click();
  await panels.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByLabel('Search scene objects', { exact: true }).fill('wheelchair');
  await page.locator('.studio-object-select').first().click();
  await page.getByRole('button', { name: 'Focus selected object', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click({ clickCount: 2 });
  await orbit(130, 0);
  await capture('17-object-inspector', 'A detailed wheelchair is selected in the model. The inspector exposes dimensions, local position and rotation, with a visible manipulation ring.');

  await panels.getByRole('button', { name: 'People', exact: true }).click();
  await expect(page.locator('.studio-person-select').first()).toBeVisible();
  await page.locator('.studio-person-select').first().click();
  await page.getByRole('button', { name: 'Draw rehearsal route', exact: true }).first().click();
  for (const [x, z] of [[-27, 15], [-27, 0], [-9, 0], [-9, 7]]) {
    await page.getByRole('spinbutton', { name: 'Route point X', exact: true }).fill(String(x));
    await page.getByRole('spinbutton', { name: 'Route point Z', exact: true }).fill(String(z));
    await page.getByRole('button', { name: 'Add route point', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Clear object selection', exact: true }).click();
  await panels.getByRole('button', { name: 'People', exact: true }).click();
  await capture('18-route-rehearsal', 'A four-point route is drawn for a scheduled volunteer in a local rehearsal. The route editor displays coordinates; paths are illustrative and do not perform obstacle or access checks.');

  const after = await (await page.request.get(`${base}/api/state`)).text();
  const operationalMutations = mutations.filter(request => !request.url.endsWith('/api/demo-login'));
  assert.equal(operationalDigest(before), operationalDigest(after), 'Capturing and drafting a route must not change persisted operational data');
  assert.deepEqual(operationalMutations, [], 'No operational writes during capture');
  assert.deepEqual(errors, [], 'No browser errors');
  const manifest = { capturedAt: new Date().toISOString(), base, workspaceDate: '2026-10-08', locale: 'en-US', timezone: 'Asia/Tokyo', browser: `Chrome ${browser.version()}`, deviceScaleFactor: 2, fictionalDemoData: true, sourceModel: 'Independent schematic reconstruction using public floor maps; no hospital affiliation; furnishings are illustrative.', noCssOrContentAlteration: true, unchangedOperationalState: true, fingerprintScope: 'All persisted state except authentication audit entries from concurrent capture logins.', beforeSha256: operationalDigest(before), afterSha256: operationalDigest(after), errors, operationalMutations, captures };
  await fs.writeFile('artifacts/showcase/spatial-capture.json', `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
} finally { await browser.close(); }
