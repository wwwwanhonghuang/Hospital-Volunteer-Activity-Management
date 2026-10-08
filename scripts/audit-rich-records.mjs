// SPDX-License-Identifier: AGPL-3.0-only
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const baseURL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3001';
const outputPath = resolve(process.env.RICH_RECORDS_AUDIT_OUTPUT || 'artifacts/qa/rich-records-accessibility.json');
const previewDirectory = resolve('artifacts/previews');
const desktop = { width: 1440, height: 1080 }, mobile = { width: 390, height: 844 };
const report = {
  generatedAt: new Date().toISOString(), baseURL, browser: 'Installed Chrome via Playwright',
  tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
  scope: 'Rich events, profiles, journal records, custom fields and storage in a compiled synthetic demo workspace. Editor controls are inspected using unsaved local drafts only; all operational API writes are blocked. Automated results do not establish WCAG conformance. Keyboard, assistive-technology and human workflow review remain necessary.',
  health: {}, engine: {}, views: [], keyboardChecks: [], pageErrors: [], consoleErrors: [], unexpectedWrites: [], screenshots: [],
};
const healthResponse = await fetch(`${baseURL}/api/health`);
if (!healthResponse.ok) throw new Error(`Health check failed (${healthResponse.status}).`);
const health = await healthResponse.json();
if (health.mode !== 'demo') throw new Error('Rich record accessibility audit requires a demo workspace; production is never opened.');
report.health = health;
await mkdir(dirname(outputPath), { recursive: true });
await mkdir(previewDirectory, { recursive: true });
const fingerprint = state => createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'audit')))).digest('hex');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: desktop, locale: 'en-GB', timezoneId: 'Asia/Tokyo', deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && new URL(request.url()).pathname !== '/api/demo-login') {
      report.unexpectedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
      await route.abort('blockedbyclient'); return;
    }
    await route.continue();
  });
  const login = await context.request.post(`${baseURL}/api/demo-login`, { data: { username: 'admin' } });
  if (!login.ok()) throw new Error(`Demo sign-in failed (${login.status()}).`);
  const stateResponse = await context.request.get(`${baseURL}/api/state`);
  if (!stateResponse.ok()) throw new Error(`Demo state failed (${stateResponse.status()}).`);
  const state = await stateResponse.json();
  report.operationalStateBefore = fingerprint(state);
  const meeting = state.events.find(event => event.modules.includes('meeting') && event.modules.includes('checklist'));
  const attendanceEvent = state.events.find(event => event.modules.includes('attendance') && event.attendance.length);
  const journal = state.entries.find(entry => entry.status === 'open') || state.entries[0];
  const person = state.volunteers.find(volunteer => volunteer.id === journal?.volunteerId);
  if (!meeting || !attendanceEvent || !journal || !person) throw new Error('Use a fresh synthetic 1.3 demo with meeting, checklist, attendance and volunteer journal examples.');
  report.sampleIds = { meeting: meeting.id, attendanceEvent: attendanceEvent.id, volunteer: person.id, journal: journal.id };
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });

  async function audit(name, screenshot) {
    await page.evaluate(async () => { await document.fonts.ready; });
    const result = await new AxeBuilder({ page }).withTags(report.tags).analyze();
    report.engine = result.testEngine;
    const layout = await page.evaluate(() => ({
      viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      visibleDialogs: [...document.querySelectorAll('[role="dialog"]')].filter(node => node.getBoundingClientRect().width > 0).length,
      overflowingDialogs: [...document.querySelectorAll('[role="dialog"]')].filter(node => node.getBoundingClientRect().width > 0 && node.scrollWidth > node.clientWidth + 1).map(node => ({ label: node.getAttribute('aria-label') || node.querySelector('h2')?.textContent, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth })),
    }));
    report.views.push({ name, viewport: page.viewportSize(), timestamp: result.timestamp, passes: result.passes.length, violations: result.violations, incomplete: result.incomplete, layout });
    console.log(`${name}: ${result.violations.length} rule violations; document overflow ${layout.horizontalOverflow}; overflowing dialogs ${layout.overflowingDialogs.length}`);
    for (const violation of result.violations) for (const node of violation.nodes.slice(0, 4)) console.log(`  ${violation.id} ${JSON.stringify(node.target)}: ${node.failureSummary}`);
    if (screenshot) {
      const destination = resolve(previewDirectory, screenshot);
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); scrollTo(0, 0); for (const node of document.querySelectorAll('.modal,.modal-content')) node.scrollTop = 0; });
      await page.screenshot({ path: destination, fullPage: layout.visibleDialogs === 0, animations: 'disabled' });
      report.screenshots.push({ view: name, path: `artifacts/previews/${screenshot}` });
    }
  }
  async function events() { await page.goto(`${baseURL}/#/events`); await page.getByRole('heading', { name: 'Events & collaboration', exact: true }).waitFor(); }
  async function openEvent(event) { await page.goto(`${baseURL}/#/events?id=${encodeURIComponent(event.id)}`); await page.getByRole('dialog', { name: event.title, exact: true }).waitFor(); }
  async function eventTab(label) { await page.getByRole('tablist', { name: 'Event workspace', exact: true }).getByRole('tab', { name: label, exact: true }).click(); }
  async function volunteer() { await page.goto(`${baseURL}/#/volunteers?id=${encodeURIComponent(person.id)}`); await page.getByRole('dialog', { name: 'Volunteer profile', exact: true }).waitFor(); }
  async function profileTab(label) { await page.getByRole('tablist', { name: 'Volunteer profile sections', exact: true }).getByRole('tab', { name: label, exact: true }).click(); }
  async function settings() { await page.goto(`${baseURL}/#/settings`); await page.getByRole('heading', { name: 'A dependable foundation', exact: true }).waitFor(); }
  async function checkTabKeyboard(label) {
    const group = page.getByRole('tablist', { name: label, exact: true });
    const tabs = group.getByRole('tab');
    const labels = await tabs.allTextContents();
    await tabs.first().focus();
    for (const [key, index] of [['ArrowRight', 1], ['End', labels.length - 1], ['Home', 0]]) {
      await page.keyboard.press(key);
      await tabs.nth(index).evaluate(node => new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => { if (node.getAttribute('aria-selected') === 'true' && node.tabIndex === 0 && document.activeElement === node) resolve(true); else if (++attempts < 30) setTimeout(check, 20); else reject(new Error('Tab focus, selection or roving tabindex did not follow the key.')); };
        check();
      }));
      report.keyboardChecks.push({ group: label, key, selected: labels[index].trim(), passed: true });
    }
  }

  await events(); report.clientAssets = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
  await audit('Desktop events list', '08-events.png');
  await page.getByRole('button', { name: 'Event types', exact: true }).click();
  await page.getByLabel('Type name', { exact: true }).waitFor(); await audit('Desktop event type manager');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'New event', exact: true }).click();
  await page.getByLabel('Event title', { exact: true }).waitFor(); await audit('Desktop new event form');
  await page.getByRole('dialog', { name: 'Create an event workspace', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await openEvent(meeting); await audit('Desktop event overview', '09-event-workspace.png');
  await checkTabKeyboard('Event workspace');
  await eventTab('Meeting'); await audit('Desktop event meeting');
  await eventTab('Files & links'); await audit('Desktop event files');
  await page.getByRole('dialog').getByRole('button', { name: 'Upload file', exact: true }).click(); await audit('Desktop file upload draft');
  await page.getByRole('button', { name: 'Cancel attachment', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add link', exact: true }).click();
  await page.getByLabel('Link title', { exact: true }).fill('Planning reports and meeting materials');
  await page.getByLabel('Sharing URL', { exact: true }).fill('https://drive.google.com/drive/folders/example');
  await audit('Desktop cloud link draft'); await page.getByRole('button', { name: 'Cancel attachment', exact: true }).click();
  await eventTab('Checklist'); await audit('Desktop event checklist');
  await eventTab('Connections'); await audit('Desktop event connections');
  await eventTab('Activity'); await audit('Desktop event activity');
  await openEvent(attendanceEvent); await eventTab('Attendance'); await audit('Desktop event attendance');
  await page.getByRole('dialog').getByRole('button', { name: 'Edit event', exact: true }).click();
  await page.getByLabel('Event title', { exact: true }).waitFor(); await audit('Desktop event editor');

  await volunteer(); await audit('Desktop volunteer profile');
  await checkTabKeyboard('Volunteer profile sections');
  await profileTab('Records');
  const journalCard = page.locator('.journal-entry').filter({ has: page.getByRole('heading', { name: journal.title, exact: true }) });
  await journalCard.waitFor(); await audit('Desktop volunteer journal', '10-volunteer-records.png');
  await journalCard.getByRole('button', { name: /Fields & files/ }).click(); await audit('Desktop volunteer journal details');
  await page.getByRole('dialog').getByRole('button', { name: 'Add record', exact: true }).click();
  await page.getByLabel('Record title', { exact: true }).fill('Follow-up conversation and next steps'); await audit('Desktop volunteer journal editor');
  await page.getByRole('button', { name: 'Cancel record edit', exact: true }).click();
  await profileTab('Files'); await audit('Desktop volunteer files');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Emergency contact name', { exact: true }).waitFor(); await audit('Desktop volunteer editor');

  await settings(); await checkTabKeyboard('Settings sections'); await page.getByRole('tab', { name: 'Record fields', exact: true }).click();
  await page.getByLabel('Record family', { exact: true }).selectOption('volunteers');
  await audit('Desktop custom field manager');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Field label', { exact: true }).fill('Annual skills review date');
  await page.getByLabel('Field type', { exact: true }).selectOption('date');
  await audit('Desktop custom field editor', '11-record-fields.png');
  await page.getByRole('button', { name: 'Cancel field edit', exact: true }).click();
  await page.getByRole('tab', { name: 'File storage', exact: true }).click();
  await page.getByRole('heading', { name: 'Workspace file storage', exact: true }).waitFor();
  await page.getByText('Storage used', { exact: true }).waitFor(); await audit('Desktop workspace storage');
  await page.goto(`${baseURL}/#/records`); await page.getByRole('heading', { name: 'Activity records', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Volunteer records', exact: true }).click(); await page.locator('.journal-entry').first().waitFor();
  await audit('Desktop journal workspace');

  await page.setViewportSize(mobile);
  await events(); await audit('Mobile events list');
  await openEvent(meeting); await audit('Mobile event overview');
  await eventTab('Files & links'); await audit('Mobile event files');
  await openEvent(attendanceEvent); await eventTab('Attendance'); await audit('Mobile event attendance');
  await volunteer(); await audit('Mobile volunteer profile');
  await profileTab('Records'); await audit('Mobile volunteer journal');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click(); await audit('Mobile volunteer editor');

  const after = await (await context.request.get(`${baseURL}/api/state`)).json();
  report.operationalStateAfter = fingerprint(after);
  report.operationalStateUnchanged = report.operationalStateBefore === report.operationalStateAfter;
} catch (error) {
  report.error = error.stack || error.message; console.error(report.error); process.exitCode = 1;
} finally {
  report.summary = {
    viewCount: report.views.length,
    viewsWithViolations: report.views.filter(view => view.violations.length).length,
    ruleOccurrences: report.views.reduce((count, view) => count + view.violations.length, 0),
    affectedNodeOccurrences: report.views.reduce((count, view) => count + view.violations.reduce((n, rule) => n + rule.nodes.length, 0), 0),
    uniqueRules: [...new Set(report.views.flatMap(view => view.violations.map(rule => rule.id)))],
    incompleteRuleOccurrences: report.views.reduce((count, view) => count + view.incomplete.length, 0),
    horizontalOverflowViews: report.views.filter(view => view.layout.horizontalOverflow || view.layout.overflowingDialogs.length).map(view => view.name),
    pageErrorCount: report.pageErrors.length, consoleErrorCount: report.consoleErrors.length, unexpectedWriteCount: report.unexpectedWrites.length,
    operationalStateUnchanged: report.operationalStateUnchanged ?? null,
    keyboardCheckCount: report.keyboardChecks.length,
  };
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Saved ${outputPath}`); console.log(JSON.stringify(report.summary));
  await browser.close();
  if (report.summary.ruleOccurrences || report.summary.horizontalOverflowViews.length || report.pageErrors.length || report.consoleErrors.length || report.unexpectedWrites.length || report.operationalStateUnchanged === false) process.exitCode = 1;
}
