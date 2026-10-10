// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3020';
const output = 'artifacts/showcase';
const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = state => hash(JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'audit'))));
const report = { capturedAt: new Date().toISOString(), baseURL, demoDate: '2026-10-08', viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, screenshots: [], errors: [], unexpectedWrites: [] };
await mkdir(`${output}/images`, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Asia/Tokyo' });
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !['/api/demo-login', '/api/export/view-preview'].includes(new URL(request.url()).pathname)) {
      report.unexpectedWrites.push(request.url()); return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  assert.equal((await (await context.request.get(`${baseURL}/api/health`)).json()).mode, 'demo');
  assert.ok((await context.request.post(`${baseURL}/api/demo-login`, { data: { username: 'viewer' } })).ok());
  const state = await (await context.request.get(`${baseURL}/api/state`)).json();
  report.stateBefore = fingerprint(state);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  const dialog = page.getByRole('dialog', { name: 'Export views', exact: true });
  async function capture(name, description) {
    await dialog.getByRole('button', { name: 'Download PDF', exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some(button => button.textContent === 'Download PDF' && !button.disabled));
    await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); });
    const bounds = await dialog.boundingBox();
    const choices = await page.locator('.view-export-choices').boundingBox();
    const clip = { x: Math.ceil(bounds.x + 1), y: Math.ceil(choices.y), width: Math.floor(bounds.width - 2), height: 660 };
    const bytes = await page.screenshot({ path: `${output}/images/${name}.png`, clip, animations: 'disabled' });
    report.screenshots.push({ file: `images/${name}.png`, description, clip, sha256: hash(bytes), bytes: bytes.length });
    console.log(`Captured ${name}`);
  }
  await page.goto(`${baseURL}/#/schedule`);
  await page.getByLabel('Workspace date', { exact: true }).fill(report.demoDate);
  await page.getByRole('button', { name: 'Export views', exact: true }).click();
  await capture('19-export-studio', 'PDF and Excel export studio with a volunteer-by-time report preview.');
  await page.keyboard.press('Escape');
  const meeting = state.events.find(event => event.modules.includes('meeting'));
  await page.goto(`${baseURL}/#/events?id=${meeting.id}`);
  await page.getByRole('button', { name: 'Export brief', exact: true }).click();
  await capture('20-event-brief', 'Event brief preview with metadata and participant summary; cropped to the upper part of the export studio.');
  report.stateAfter = fingerprint(await (await context.request.get(`${baseURL}/api/state`)).json());
  report.operationalStateUnchanged = report.stateBefore === report.stateAfter;
  assert.ok(report.operationalStateUnchanged);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unexpectedWrites, []);
} finally {
  await browser.close();
  await writeFile(`${output}/exports-capture.json`, `${JSON.stringify(report, null, 2)}\n`);
}
