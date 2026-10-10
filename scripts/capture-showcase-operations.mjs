// SPDX-License-Identifier: AGPL-3.0-only
// Capture real, read-only synthetic SHUORI views for the A4 visual portfolio.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const baseURL = process.env.SHOWCASE_BASE_URL || 'http://127.0.0.1:3020';
const directory = resolve('artifacts/showcase/images');
const outputPath = resolve('artifacts/showcase/operations-capture.json');
const viewport = { width: 1360, height: 1100 };
const report = { generatedAt: new Date().toISOString(), baseURL, workspaceDate: '2026-10-08', browser: 'Installed Google Chrome via Playwright', deviceScaleFactor: 2, locale: 'en-GB', timezone: 'Asia/Tokyo', screenshots: [], pageErrors: [], consoleErrors: [], unexpectedWrites: [] };
const fingerprint = value => createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'audit')))).digest('hex');
await mkdir(directory, { recursive: true });
let health;
for (let attempt = 0; attempt < 120; attempt++) {
  try { const response = await fetch(`${baseURL}/api/health`); if (response.ok) { health = await response.json(); break; } } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!health || health.mode !== 'demo') throw new Error('An isolated running demo workspace is required.');
report.health = health;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Asia/Tokyo' });
  await context.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !['/api/demo-login', '/api/export/view-preview'].includes(path)) {
      report.unexpectedWrites.push({ method: request.method(), path }); await route.abort('blockedbyclient'); return;
    }
    await route.continue();
  });
  const login = await context.request.post(`${baseURL}/api/demo-login`, { data: { username: 'admin' } });
  if (!login.ok()) throw new Error(`Demo login failed: ${login.status()}`);
  const state = await (await context.request.get(`${baseURL}/api/state`)).json();
  report.operationalStateBefore = fingerprint(state);
  const meeting = state.events.find(event => event.modules.includes('meeting') && event.modules.includes('checklist'));
  const journal = state.entries.find(entry => entry.status === 'open') || state.entries[0];
  const person = state.volunteers.find(volunteer => volunteer.id === journal?.volunteerId);
  const project = state.projects.find(project => state.tasks.filter(task => task.projectId === project.id).length >= 5) || state.projects[0];
  if (!meeting || !journal || !person || !project) throw new Error('Expected synthetic showcase records were not found.');
  report.sampleIds = { meeting: meeting.id, journal: journal.id, volunteer: person.id, project: project.id };
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  async function ready() { await page.evaluate(async () => { await document.fonts.ready; if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }); await page.waitForTimeout(250); }
  async function navigate(path, heading) {
    await page.goto(`${baseURL}/#/${path}`);
    if (heading) await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    await page.getByLabel('Workspace date', { exact: true }).fill('2026-10-08');
    await ready();
  }
  async function capture(name, subject, clip, detail = {}) {
    await ready();
    clip = { x: Math.floor(clip.x), y: Math.floor(clip.y), width: Math.floor(clip.width), height: Math.floor(clip.height) };
    const filename = `${name}.png`, destination = resolve(directory, filename);
    await page.screenshot({ path: destination, clip, animations: 'disabled', caret: 'hide' });
    const bytes = await readFile(destination);
    report.screenshots.push({ filename, path: `artifacts/showcase/images/${filename}`, subject, url: page.url().replace(baseURL, ''), viewport: page.viewportSize(), clip, pixelWidth: clip.width * 2, pixelHeight: clip.height * 2, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, ...detail });
    console.log(`${filename}: ${clip.width} x ${clip.height} CSS pixels - ${subject}`);
  }
  async function mainFrame(name, subject, { top = '.page-header', height = 610, includeSidebar = false, bottom = null } = {}) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const node = page.locator(top).first(); await node.waitFor();
    if (!includeSidebar) await node.evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + scrollY - 20));
    const box = await node.boundingBox();
    const main = await page.locator('#main-content').boundingBox();
    const y = Math.max(0, box.y - 12);
    if (bottom) { const end = await page.locator(bottom).first().boundingBox(); height = end.y + end.height + 12 - y; }
    await capture(name, subject, { x: includeSidebar ? 0 : main.x + 22, y: includeSidebar ? 0 : y, width: includeSidebar ? page.viewportSize().width : main.width - 44, height: Math.min(height, page.viewportSize().height - y) });
  }
  async function modalFrame(name, subject, { height = 580, top = null, bottom = null } = {}) {
    const modal = page.getByRole('dialog').last(); await modal.waitFor();
    await modal.locator('.modal-content').evaluate(node => { node.scrollTop = 0; });
    if (top) await page.locator(top).first().scrollIntoViewIfNeeded();
    await ready();
    const box = await modal.boundingBox();
    let y = box.y, h = Math.min(box.height, height);
    if (top) { const target = await page.locator(top).first().boundingBox(); y = Math.max(box.y, target.y - 14); h = Math.min(height, box.y + box.height - y); }
    if (bottom) { const target = await page.locator(bottom).first().boundingBox(); h = Math.min(h, target.y + target.height + 18 - y); }
    await capture(name, subject, { x: box.x - 2, y: y - 2, width: box.width + 4, height: h + 4 }, { crop: 'Actual dialog region; no interface elements altered.' });
  }
  async function openVolunteer() { await navigate(`volunteers?id=${encodeURIComponent(person.id)}`); await page.getByRole('dialog', { name: 'Volunteer profile', exact: true }).waitFor(); }
  async function profileTab(label) { await page.getByRole('tablist', { name: 'Volunteer profile sections', exact: true }).getByRole('tab', { name: label, exact: true }).click(); }
  async function openMeeting() { await navigate(`events?id=${encodeURIComponent(meeting.id)}`); await page.getByRole('dialog', { name: meeting.title, exact: true }).waitFor(); }
  async function eventTab(label) { await page.getByRole('tablist', { name: 'Event workspace', exact: true }).getByRole('tab', { name: label, exact: true }).click(); }

  await navigate('dashboard', 'Operations overview');
  await mainFrame('01-overview', 'Operations overview: the SHUORI workspace, volunteer staffing, coverage and service contribution.', { includeSidebar: true, height: 626 });
  await openVolunteer();
  await modalFrame('03-volunteer-profile', 'Fictional volunteer profile: professional skills, languages, availability and coordinator notes.', { height: 560, bottom: '.op-detail-grid' });
  await profileTab('Records');
  await page.locator('.journal-entry').first().waitFor();
  await modalFrame('04-volunteer-records', 'A dated volunteer journal keeps follow-up work connected to the volunteer.', { top: '.op-tabs', height: 510, bottom: '.journal-entry' });
  await navigate('settings', 'A dependable foundation');
  await page.getByRole('tab', { name: 'Record fields', exact: true }).click();
  await page.getByLabel('Record family', { exact: true }).selectOption('volunteers');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Field label', { exact: true }).fill('Annual skills review date');
  await page.getByLabel('Field type', { exact: true }).selectOption('date');
  await mainFrame('05-custom-fields', 'An unsaved custom field draft demonstrates configurable record schemas.', { top: '.record-section-head', bottom: '.record-inline-form' });
  await page.getByRole('button', { name: 'Cancel field edit', exact: true }).click();
  await navigate('records', 'Activity records');
  await mainFrame('06-activity-records', 'Recorded volunteer participation, hours and service counts with filters and structured rows.', { top: '.op-stats', bottom: '.data-table tbody tr:nth-child(3)' });
  await navigate('events', 'Events & collaboration');
  await mainFrame('07-events', 'Event workspaces combine different event types, participant links and reusable modules.', { top: '.event-command-row', bottom: '.event-card-grid' });
  await openMeeting(); await eventTab('Meeting');
  await modalFrame('08-meeting', 'Meeting module configured for Zoom, with a preparation agenda; the fictional demo intentionally has no joining URL or passcode.', { height: 660 });
  await eventTab('Files & links');
  await page.getByRole('dialog').getByRole('button', { name: 'Add link', exact: true }).click();
  await page.getByLabel('Link title', { exact: true }).fill('Planning reports and meeting materials');
  await page.getByLabel('Sharing URL', { exact: true }).fill('https://drive.google.com/drive/folders/example');
  await modalFrame('09-event-files', 'Unsaved cloud-folder link draft: event-specific supporting materials can use external sharing links or local uploads. No file or link is saved.', { top: '.attachment-panel', height: 670, bottom: '.record-inline-form' });
  await page.getByRole('button', { name: 'Cancel attachment', exact: true }).click();
  await eventTab('Checklist');
  await modalFrame('10-event-checklist', 'Preparation checklist with completion, ownership and due dates.', { height: 620, bottom: '.event-checklist' });
  await navigate('schedule', 'Schedule & coordination');
  await page.getByRole('button', { name: 'By volunteer', exact: true }).click();
  await mainFrame('11-schedule', 'Daily schedule grouped by volunteer, with time bars and staffing coverage.', { top: '.schedule-summary', bottom: '.gantt-footer' });
  await page.getByRole('group', { name: 'Schedule view', exact: true }).getByRole('button', { name: 'Week', exact: true }).click();
  await mainFrame('12-weekly-schedule', 'Weekly schedule combines service shifts and modular events across a common calendar, 5 to 11 October 2026.', { top: '.schedule-week', bottom: '.schedule-week' });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await navigate(`projects?id=${encodeURIComponent(project.id)}`);
  await page.locator('.gantt').waitFor();
  await mainFrame('13-project-plan', 'Project task dependencies and calculated critical path, showing durations and available float.', { top: '.toolbar', bottom: '.gantt-card' });
  await page.setViewportSize(viewport);
  await navigate('reports', 'The difference we make');
  await mainFrame('14-reports', 'Monthly recorded contribution: volunteer hours, participation and service-category distribution.', { top: '.op-filters', bottom: '.op-report-layout' });

  report.operationalStateAfter = fingerprint(await (await context.request.get(`${baseURL}/api/state`)).json());
  report.operationalStateUnchanged = report.operationalStateBefore === report.operationalStateAfter;
  await context.close();
} catch (error) { report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error); }
finally {
  await browser.close();
  report.summary = { screenshots: report.screenshots.length, pageErrors: report.pageErrors.length, consoleErrors: report.consoleErrors.length, unexpectedWrites: report.unexpectedWrites.length, operationalStateUnchanged: report.operationalStateUnchanged ?? null };
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary));
  if (report.pageErrors.length || report.consoleErrors.length || report.unexpectedWrites.length || report.operationalStateUnchanged === false) process.exitCode = 1;
}
