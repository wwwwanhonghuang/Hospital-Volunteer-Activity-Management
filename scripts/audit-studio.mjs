// SPDX-License-Identifier: AGPL-3.0-only
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';

const baseURL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3001';
const outputPath = resolve(process.env.STUDIO_AUDIT_OUTPUT || 'artifacts/qa/studio-accessibility.json');
const desktop = { width: 1440, height: 1000 }, mobile = { width: 390, height: 844 };
const report = {
  generatedAt: new Date().toISOString(), baseURL,
  browser: 'Installed Chrome via Playwright', tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
  scope: 'Spatial Studio states in the compiled demo application. No operational changes are saved. Local draft fields and route points are exercised and discarded. Automated results do not establish WCAG conformance; manual keyboard, screen-reader and spatial interpretation review remains necessary.',
  health: {}, engine: {}, views: [], pageErrors: [], unexpectedWrites: [], screenshots: [],
};
const health = await (await fetch(`${baseURL}/api/health`)).json();
if (health.mode !== 'demo') throw new Error('Studio accessibility audit requires a demo workspace; production is never opened.');
report.health = health;
await mkdir(dirname(outputPath), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: desktop, locale: 'en-GB', timezoneId: 'Asia/Tokyo' });
  // Guard the application itself against any unintended operational write.
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !request.url().endsWith('/api/demo-login')) {
      report.unexpectedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
      await route.abort('blockedbyclient'); return;
    }
    await route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  const login = await context.request.post(`${baseURL}/api/demo-login`, { data: { username: 'admin' } });
  if (!login.ok()) throw new Error(`Demo sign-in failed: ${login.status()}`);
  await page.goto(`${baseURL}/#/spatial`);
  await page.getByRole('heading', { name: /^Hospital in perspective/ }).waitFor();
  await page.locator('.studio-object-row').first().waitFor();
  const state = await (await context.request.get(`${baseURL}/api/state`)).json();
  const operationalFingerprint = value => createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'audit')))).digest('hex');
  report.operationalStateBefore = operationalFingerprint(state);
  report.clientAssets = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));

  async function audit(name, { screenshot = false } = {}) {
    await page.evaluate(async () => { await document.fonts.ready; });
    const result = await new AxeBuilder({ page }).withTags(report.tags).analyze();
    report.engine = result.testEngine;
    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      visibleDialogs: [...document.querySelectorAll('[role="dialog"]')].filter(node => node.getBoundingClientRect().width > 0).length,
    }));
    const entry = { name, viewport: page.viewportSize(), timestamp: result.timestamp, passes: result.passes.length, violations: result.violations, incomplete: result.incomplete, layout };
    report.views.push(entry);
    console.log(`${name}: ${result.violations.length} rules, ${result.violations.reduce((n, rule) => n + rule.nodes.length, 0)} nodes, overflow ${layout.horizontalOverflow}`);
    for (const violation of result.violations) {
      console.log(`  ${violation.id} [${violation.impact}]: ${violation.nodes.length} nodes`);
      for (const node of violation.nodes.slice(0, 4)) console.log(`    ${JSON.stringify(node.target)} ${node.failureSummary || ''}`);
    }
    if (screenshot) {
      const filename = `studio-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      const destination = resolve(dirname(outputPath), filename);
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: destination, fullPage: true });
      report.screenshots.push(relative(process.cwd(), destination).replaceAll('\\', '/'));
    }
  }
  async function panel(name) { await page.getByRole('group', { name: 'Spatial studio panels' }).getByRole('button', { name, exact: true }).click(); }
  async function floor(id) {
    await page.getByRole('group', { name: 'Choose hospital floor' }).getByRole('button', { name: id, exact: true }).click();
    await page.locator('.studio-object-row').first().waitFor();
  }
  async function selectChair() {
    await page.getByRole('searchbox', { name: 'Search scene objects' }).fill('chair');
    await page.getByRole('region', { name: 'Scene objects', exact: true }).getByRole('button', { name: /^Select / }).first().click();
    await page.getByRole('region', { name: 'Object inspector', exact: true }).getByRole('spinbutton', { name: 'Position X', exact: true }).waitFor();
  }

  await audit('Desktop building objects');
  await floor('1F'); await selectChair();
  await audit('Desktop floor object inspector', { screenshot: true });
  await panel('Assets'); await audit('Desktop asset library');
  await panel('People');
  const today = await page.getByLabel('Workspace date', { exact: true }).inputValue();
  const candidates = state.shifts.filter(shift => !['draft', 'cancelled'].includes(shift.status) && shift.volunteerIds.length && shift.start <= '10:00' && shift.end > '10:00' && state.locations.find(location => location.id === shift.locationId)?.floor === '1F');
  const shift = candidates.find(value => value.date === today) || candidates[0];
  if (!shift) throw new Error('Demo contains no assigned 1F shift active at 10:00 for the route audit.');
  await page.getByLabel('Simulation date', { exact: true }).fill(shift.date);
  await page.getByRole('slider', { name: 'Simulation time', exact: true }).fill('600');
  await page.locator('.studio-person-card').first().waitFor();
  await audit('Desktop people');
  await page.getByRole('button', { name: 'Draw rehearsal route', exact: true }).first().click();
  const editor = page.getByRole('region', { name: 'Rehearsal route editor', exact: true });
  await editor.waitFor(); await audit('Desktop route editor empty');
  for (const [x, z] of [[-9, 0], [-4, 0], [-4, 5]]) {
    await page.getByLabel('Route point X', { exact: true }).fill(String(x));
    await page.getByLabel('Route point Z', { exact: true }).fill(String(z));
    await editor.getByRole('button', { name: 'Add route point', exact: true }).click();
  }
  await audit('Desktop route editor with points', { screenshot: true });
  await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click();
  await page.locator('.studio-file-menu summary').click();
  await audit('Desktop scenario file menu');
  await page.locator('.studio-file-menu summary').click();

  // Exercise the discard dialog using an unsaved local field only.
  const originalName = await page.getByRole('textbox', { name: 'Scenario name', exact: true }).inputValue();
  await page.getByRole('textbox', { name: 'Scenario name', exact: true }).fill('Temporary accessibility review');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog').waitFor(); await audit('Desktop unsaved changes dialog');
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page.getByRole('textbox', { name: 'Scenario name', exact: true }).fill(originalName);

  await page.setViewportSize(mobile);
  await panel('Objects'); await selectChair();
  await audit('Mobile floor object inspector', { screenshot: true });
  await panel('Assets'); await audit('Mobile asset library');
  await panel('People'); await audit('Mobile people');
  await page.getByRole('button', { name: 'Draw rehearsal route', exact: true }).first().click();
  await editor.waitFor(); await audit('Mobile route editor');
  await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click();
  const after = await (await context.request.get(`${baseURL}/api/state`)).json();
  report.operationalStateAfter = operationalFingerprint(after);
  report.operationalStateUnchanged = report.operationalStateBefore === report.operationalStateAfter;
} catch (error) {
  report.error = error.stack || error.message; console.error(report.error); process.exitCode = 1;
} finally {
  report.summary = {
    viewCount: report.views.length,
    viewsWithViolations: report.views.filter(view => view.violations.length).length,
    ruleOccurrences: report.views.reduce((n, view) => n + view.violations.length, 0),
    affectedNodeOccurrences: report.views.reduce((n, view) => n + view.violations.reduce((count, rule) => count + rule.nodes.length, 0), 0),
    uniqueRules: [...new Set(report.views.flatMap(view => view.violations.map(rule => rule.id)))],
    incompleteRuleOccurrences: report.views.reduce((n, view) => n + view.incomplete.length, 0),
    horizontalOverflowViews: report.views.filter(view => view.layout.horizontalOverflow).map(view => view.name),
    pageErrorCount: report.pageErrors.length, unexpectedWriteCount: report.unexpectedWrites.length,
  };
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Saved ${outputPath}`); console.log(JSON.stringify(report.summary));
  await browser.close();
  if (report.summary.ruleOccurrences || report.summary.horizontalOverflowViews.length || report.pageErrors.length || report.unexpectedWrites.length || report.operationalStateUnchanged === false) process.exitCode = 1;
}
