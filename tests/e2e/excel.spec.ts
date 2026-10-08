// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import type { Workbook, CellValue } from 'exceljs';

// Load this CommonJS package without routing its dependency graph through
// Playwright's ESM transform loader on Node 22.
const { Workbook: ExcelWorkbook } = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');

test.setTimeout(90000);

async function open(page: Page, route: string, username = 'admin') {
  expect((await page.request.post('/api/demo-login', { data: { username } })).ok()).toBe(true);
  await page.goto(`/#/${route}`);
  await expect(page.locator('main h1')).toBeVisible();
}
async function go(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
  await expect(page.locator('main h1')).toBeVisible();
}
async function workbookDownload(page: Page, label = 'Export Excel') {
  const requested = page.waitForRequest(request => request.url().endsWith('/api/export/xlsx') && request.method() === 'POST');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const [request, download] = await Promise.all([requested, downloading]);
  expect(download.suggestedFilename()).toMatch(/^shuori-[a-z-]+-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const workbook = new ExcelWorkbook();
  await workbook.xlsx.readFile((await download.path())!);
  expect(workbook.getWorksheet('Overview')).toBeDefined();
  return { workbook, request: request.postDataJSON(), filename: download.suggestedFilename() };
}
function rows(workbook: Workbook, sheetName: string) {
  const sheet = workbook.getWorksheet(sheetName);
  expect(sheet, `${sheetName} worksheet`).toBeDefined();
  const headers: string[] = [];
  sheet!.getRow(5).eachCell((cell, column) => { headers[column] = cell.text; });
  const result: Record<string, CellValue>[] = [];
  for (let index = 6; index <= sheet!.rowCount; index++) {
    const row = sheet!.getRow(index);
    if (!row.hasValues) continue;
    const item: Record<string, CellValue> = {};
    headers.forEach((header, column) => { item[header] = row.getCell(column).value; });
    result.push(item);
  }
  return result;
}
const sorted = (values: unknown[]) => [...values].sort();

test('viewer roster exports respect the exact filter, preserve native cells and retain an empty scope', async ({ page }) => {
  await open(page, 'volunteers', 'viewer');
  const state = await (await page.request.get('/api/state')).json();
  const volunteer = state.volunteers[0];
  await page.getByRole('textbox', { name: 'Search volunteers', exact: true }).fill(volunteer.name);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Export Excel', exact: true })).toContainText('1 filtered volunteers');
  const exported = await workbookDownload(page);
  expect(exported.request).toMatchObject({ kind: 'volunteers', ids: [volunteer.id] });
  const roster = rows(exported.workbook, 'Volunteers');
  expect(roster).toHaveLength(1);
  expect(roster[0]).toMatchObject({ 'Record ID': volunteer.id, 'Volunteer name': volunteer.name, 'Weekly hour cap': volunteer.maxHoursPerWeek });
  expect(typeof roster[0]['Weekly hour cap']).toBe('number');
  expect(roster[0]['Joined date']).toBeInstanceOf(Date);
  const sheet = exported.workbook.getWorksheet('Volunteers')!;
  expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 5 });
  expect(sheet.autoFilter).toBeTruthy();
  expect(sheet.getCell('A1').text).toContain('SHUORI');

  await page.getByRole('textbox', { name: 'Search volunteers', exact: true }).fill('No matching volunteer for export review');
  const empty = await workbookDownload(page);
  expect(empty.request.ids).toEqual([]);
  expect(rows(empty.workbook, 'Volunteers')).toEqual([]);
  expect(empty.workbook.getWorksheet('Volunteers')!.getCell('A4').text).toContain('No matching records');
});

test('activity export includes every matching page and schedule export follows the displayed week', async ({ page }) => {
  await open(page, 'records');
  const state = await (await page.request.get('/api/state')).json();
  await page.getByRole('button', { name: 'All dates', exact: true }).click();
  expect(state.records.length).toBeGreaterThan(12);
  await expect(page.locator('tbody tr')).toHaveCount(12);
  const activity = await workbookDownload(page);
  expect(activity.request.kind).toBe('records');
  expect(sorted(activity.request.ids)).toEqual(sorted(state.records.map((value: any) => value.id)));
  const records = rows(activity.workbook, 'Activity records');
  expect(records).toHaveLength(state.records.length);
  const source = state.records[0];
  expect(records.find(value => value['Record ID'] === source.id)).toMatchObject({
    'Recorded hours': source.hours,
    'Service interactions': source.serviceCount,
    Volunteer: state.volunteers.find((value: any) => value.id === source.volunteerId).name,
    Shift: state.shifts.find((value: any) => value.id === source.shiftId).title,
  });

  await go(page, 'Schedule');
  const day = await page.getByLabel('Workspace date', { exact: true }).inputValue();
  const monday = new Date(`${day}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const sunday = new Date(monday); sunday.setUTCDate(sunday.getUTCDate() + 6);
  const first = monday.toISOString().slice(0, 10), last = sunday.toISOString().slice(0, 10);
  const expected = state.shifts.filter((value: any) => value.date >= first && value.date <= last && value.status !== 'cancelled');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  const schedule = await workbookDownload(page);
  expect(schedule.request.kind).toBe('schedule');
  expect(sorted(schedule.request.ids)).toEqual(sorted(expected.map((value: any) => value.id)));
  expect(sorted(rows(schedule.workbook, 'Shifts').map(value => value['Record ID']))).toEqual(sorted(expected.map((value: any) => value.id)));
  expect(rows(schedule.workbook, 'Assignment roster')).toHaveLength(expected.reduce((total: number, value: any) => total + value.volunteerIds.length, 0));
});

test('project, support and resource workbooks follow their filters and project plans retain the full task graph', async ({ page }) => {
  await open(page, 'projects');
  const state = await (await page.request.get('/api/state')).json();
  const project = state.projects.find((value: any) => state.tasks.some((task: any) => task.projectId === value.id));
  await page.getByRole('textbox', { name: 'Search projects', exact: true }).fill(project.title);
  const projects = await workbookDownload(page);
  expect(projects.request).toMatchObject({ kind: 'projects', ids: [project.id] });
  expect(rows(projects.workbook, 'Projects')).toHaveLength(1);
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: project.title, exact: true }) }).click();
  await page.getByRole('checkbox', { name: 'Critical only', exact: true }).check();
  const plan = await workbookDownload(page, 'Project plan Excel');
  expect(plan.request).toMatchObject({ kind: 'project-plan', projectId: project.id });
  const tasks = state.tasks.filter((value: any) => value.projectId === project.id);
  const taskRows = rows(plan.workbook, 'Tasks and CPM');
  expect(sorted(taskRows.map(value => value['Record ID']))).toEqual(sorted(tasks.map((value: any) => value.id)));
  expect(typeof taskRows[0]['Earliest start day']).toBe('number');
  expect(typeof taskRows[0]['Float (days)']).toBe('number');
  expect(rows(plan.workbook, 'Project plan summary').some(value => value.Metric === 'Planned duration (days)' && typeof value.Value === 'number')).toBe(true);

  await go(page, 'Support & improvement');
  const request = state.requests[0];
  await page.getByRole('textbox', { name: 'Search support requests', exact: true }).fill(request.title);
  const support = await workbookDownload(page);
  expect(support.request).toMatchObject({ kind: 'requests', ids: [request.id] });
  expect(rows(support.workbook, 'Support requests')).toHaveLength(1);
  await go(page, 'Resources');
  const resource = state.resources[0];
  await page.getByRole('textbox', { name: 'Search resources', exact: true }).fill(resource.name);
  const inventory = await workbookDownload(page);
  expect(inventory.request).toMatchObject({ kind: 'resources', ids: [resource.id] });
  expect(rows(inventory.workbook, 'Resources')[0]).toMatchObject({ 'Record ID': resource.id, 'Total quantity': resource.quantity, 'Available quantity': resource.available });
});

test('monthly, readiness and workspace workbooks remain available to viewers alongside CSV', async ({ page }) => {
  await open(page, 'reports', 'viewer');
  const state = await (await page.request.get('/api/state')).json();
  const month = state.records[0].date.slice(0, 7);
  await page.getByLabel('Reporting period', { exact: true }).fill(month);
  const report = await workbookDownload(page, 'Monthly report Excel');
  expect(report.request).toMatchObject({ kind: 'monthly-report', month });
  const expected = state.records.filter((value: any) => value.date.startsWith(month));
  expect(rows(report.workbook, 'Activity records')).toHaveLength(expected.length);
  const summary = rows(report.workbook, 'Monthly summary');
  expect(summary.find(value => value.Metric === 'Volunteer hours')?.Value).toBeCloseTo(expected.reduce((total: number, value: any) => total + value.hours, 0));
  expect(report.workbook.worksheets.map(sheet => sheet.name)).toEqual(expect.arrayContaining(['Participation', 'Recognition planning', 'Service categories', 'Six month trend', 'Assignment roster']));

  await go(page, 'Workspace settings');
  await expect(page.getByRole('combobox', { name: 'Export format', exact: true })).toHaveValue('xlsx');
  await expect(page.getByRole('button', { name: 'Download backup', exact: true })).toHaveCount(0);
  const collection = await workbookDownload(page, 'Export collection');
  expect(rows(collection.workbook, 'Volunteers')).toHaveLength(state.volunteers.length);
  const workspace = await workbookDownload(page, 'Workspace workbook');
  expect(workspace.request.kind).toBe('workspace');
  expect(workspace.workbook.worksheets.map(sheet => sheet.name)).toEqual(expect.arrayContaining(['Volunteers', 'Projects', 'Tasks and CPM', 'Activity records', 'Resources', 'Locations', 'Scenarios']));
  expect(workspace.workbook.worksheets.map(sheet => sheet.name).join(' ')).not.toMatch(/password|sessions|accounts/i);
  const readiness = await workbookDownload(page, 'Readiness workbook');
  const date = await page.getByLabel('Workspace date', { exact: true }).inputValue();
  expect(readiness.request).toMatchObject({ kind: 'readiness', date });
  expect(rows(readiness.workbook, 'Readiness')).toHaveLength(state.volunteers.length);
  expect(rows(readiness.workbook, 'Readiness summary').find(value => value.Metric === 'Reference date')?.Value).toBe(date);
  await page.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('csv');
  const csvEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export collection', exact: true }).click();
  expect((await csvEvent).suggestedFilename()).toMatch(/^volunteers-.*\.csv$/);
});

test('saved-scene Excel excludes unsaved changes and export failures leave the download action usable', async ({ page }) => {
  await open(page, 'spatial');
  const name = `Saved Excel study ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Scenario name', exact: true }).fill(name);
  const savedResponse = page.waitForResponse(response => response.url().endsWith('/api/scenarios') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save scenario', exact: true }).click();
  const saved = await (await savedResponse).json();
  await expect(page.getByRole('combobox', { name: 'Load saved scenario' })).toHaveValue(saved.id);
  await page.getByRole('textbox', { name: 'Scenario name', exact: true }).fill(`${name} unsaved change`);
  await page.locator('.studio-file-menu summary').click();
  const exported = await workbookDownload(page, 'Saved scenarios Excel');
  expect(exported.request.kind).toBe('scenarios');
  expect(exported.request.ids).toContain(saved.id);
  expect(rows(exported.workbook, 'Scenarios').find(value => value['Record ID'] === saved.id)?.Scenario).toBe(name);
  await go(page, 'Volunteers');
  await page.route('**/api/export/xlsx', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Export review service is temporarily unavailable.' }) }));
  await page.getByRole('button', { name: 'Export Excel', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Export review service is temporarily unavailable.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export Excel', exact: true })).toBeEnabled();
  await page.unroute('**/api/export/xlsx');
  const recovered = await workbookDownload(page);
  expect(rows(recovered.workbook, 'Volunteers').length).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Export Excel', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
