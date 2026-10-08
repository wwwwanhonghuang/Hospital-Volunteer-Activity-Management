// SPDX-License-Identifier: AGPL-3.0-only
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const baseURL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3001';
const report = { generatedAt: new Date().toISOString(), baseURL, browser: 'Installed Chrome via Playwright', tags: ['wcag2a', 'wcag2aa', 'wcag21aa'], scope: 'Saved report previews at desktop and mobile widths in synthetic demo mode. Only authentication, preview and download POST endpoints are allowed. Automated testing does not establish WCAG conformance.', health: {}, engine: {}, views: [], keyboardChecks: [], screenshots: [], unexpectedWrites: [], pageErrors: [], consoleErrors: [] };
const health = await (await fetch(`${baseURL}/api/health`)).json();
if (health.mode !== 'demo') throw new Error('The export-view audit requires an isolated synthetic demo workspace.');
report.health = health;
const fingerprint = state => createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'audit')))).digest('hex');
await mkdir('artifacts/qa', { recursive: true }); await mkdir('artifacts/previews', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'en-GB', timezoneId: 'Asia/Tokyo', deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !['/api/demo-login', '/api/export/view-preview', '/api/export/view'].includes(path)) { report.unexpectedWrites.push({ method: request.method(), path }); return route.abort('blockedbyclient'); }
    return route.continue();
  });
  const login = await context.request.post(`${baseURL}/api/demo-login`, { data: { username: 'viewer' } });
  if (!login.ok()) throw new Error(`Sign-in failed: ${login.status()}`);
  const state = await (await context.request.get(`${baseURL}/api/state`)).json(); report.operationalStateBefore = fingerprint(state);
  const meeting = state.events.find(event => event.modules.includes('meeting'));
  const day = meeting.date;
  const page = await context.newPage(); page.setDefaultTimeout(25000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  const dialog = page.getByRole('dialog', { name: 'Export views', exact: true });
  async function ready() { await dialog.getByRole('button', { name: 'Download PDF', exact: true }).waitFor({ state: 'visible' }); await page.waitForFunction(() => { const element = [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === 'Download PDF'); return element && !element.disabled; }); }
  async function audit(name, screenshot) {
    await ready(); await page.evaluate(async () => { await document.fonts.ready; });
    const result = await new AxeBuilder({ page }).withTags(report.tags).analyze(); report.engine = result.testEngine;
    const layout = await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, overflowingDialogs: [...document.querySelectorAll('[role="dialog"]')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => ({ label: node.querySelector('h2')?.textContent, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth })) }));
    report.views.push({ name, viewport: page.viewportSize(), timestamp: result.timestamp, passes: result.passes.length, violations: result.violations, incomplete: result.incomplete, layout });
    console.log(`${name}: ${result.violations.length} rule violations, overflow ${layout.horizontalOverflow || !!layout.overflowingDialogs.length}`);
    for (const rule of result.violations) for (const node of rule.nodes.slice(0, 4)) console.log(`  ${rule.id} ${JSON.stringify(node.target)}: ${node.failureSummary}`);
    if (screenshot) { await dialog.locator('.modal-content').evaluate(element => { element.scrollTop = 0; }); await page.screenshot({ path: screenshot, fullPage: false }); report.screenshots.push(screenshot); }
  }
  await page.goto(`${baseURL}/#/schedule`); await page.getByLabel('Workspace date', { exact: true }).fill(day);
  await page.getByRole('button', { name: 'Export views', exact: true }).click();
  await audit('Desktop volunteer timeline', 'artifacts/previews/12-export-views.png');
  await dialog.getByRole('button', { name: /Station timeline/ }).click(); await audit('Desktop station timeline');
  await dialog.getByRole('checkbox', { name: /Full day/ }).check(); await audit('Desktop full-day timeline');
  await dialog.getByRole('checkbox', { name: /Full day/ }).uncheck();
  await dialog.getByRole('button', { name: /Weekly roster/ }).click(); await audit('Desktop weekly roster');
  await dialog.getByRole('button', { name: /Event agenda/ }).click(); await audit('Desktop event agenda');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).focus(); await page.keyboard.press('Shift+Tab');
  const focusTrapped = await dialog.getByRole('button', { name: 'Download PDF', exact: true }).evaluate(element => document.activeElement === element);
  if (!focusTrapped) throw new Error('Export modal did not trap backward Tab.'); report.keyboardChecks.push({ name: 'Export modal backward Tab wraps to download', passed: true });
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Export views', exact: true }).waitFor({ state: 'visible' });
  if (!await page.getByRole('button', { name: 'Export views', exact: true }).evaluate(element => document.activeElement === element)) throw new Error('Export launcher focus was not restored.'); report.keyboardChecks.push({ name: 'Escape restores schedule export launcher focus', passed: true });
  await page.goto(`${baseURL}/#/events?id=${encodeURIComponent(meeting.id)}`);
  await page.getByRole('button', { name: 'Export brief', exact: true }).click(); await audit('Desktop event brief', 'artifacts/previews/13-event-brief-export.png');
  await dialog.getByRole('checkbox', { name: /Include operational notes/ }).check(); await dialog.getByRole('checkbox', { name: /Include event custom fields/ }).check(); await audit('Desktop event brief with reviewed details');
  await page.keyboard.press('Escape');
  const parent = page.getByRole('dialog', { name: meeting.title, exact: true });
  if (!await parent.isVisible() || !await parent.getByRole('button', { name: 'Export brief', exact: true }).evaluate(element => document.activeElement === element)) throw new Error('Nested modal lost its parent or focus.'); report.keyboardChecks.push({ name: 'Nested brief Escape preserves event and launcher focus', passed: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Export brief', exact: true }).click(); await audit('Mobile event brief');
  await page.goto(`${baseURL}/#/schedule`); await page.getByLabel('Workspace date', { exact: true }).fill(day);
  await page.getByRole('button', { name: 'Export views', exact: true }).click(); await audit('Mobile volunteer timeline', 'artifacts/previews/14-export-mobile.png');
  await dialog.getByRole('button', { name: /Weekly roster/ }).click(); await audit('Mobile weekly roster');
  const after = await (await context.request.get(`${baseURL}/api/state`)).json(); report.operationalStateAfter = fingerprint(after); report.operationalStateUnchanged = report.operationalStateBefore === report.operationalStateAfter;
} catch (error) { report.error = error.stack || error.message; console.error(report.error); process.exitCode = 1; }
finally {
  report.summary = { viewCount: report.views.length, ruleOccurrences: report.views.reduce((count, view) => count + view.violations.length, 0), viewsWithViolations: report.views.filter(view => view.violations.length).length, horizontalOverflowViews: report.views.filter(view => view.layout.horizontalOverflow || view.layout.overflowingDialogs.length).map(view => view.name), keyboardCheckCount: report.keyboardChecks.length, pageErrorCount: report.pageErrors.length, consoleErrorCount: report.consoleErrors.length, unexpectedWriteCount: report.unexpectedWrites.length, operationalStateUnchanged: report.operationalStateUnchanged ?? null };
  await writeFile('artifacts/qa/view-export-accessibility.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.summary)); await browser.close();
  if (report.summary.ruleOccurrences || report.summary.horizontalOverflowViews.length || report.pageErrors.length || report.consoleErrors.length || report.unexpectedWrites.length || report.operationalStateUnchanged === false) process.exitCode = 1;
}
