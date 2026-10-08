// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { AppState } from '../../src/types';
import type { ViewReport } from '../../shared/export-views.mjs';

const { Workbook } = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');
test.setTimeout(90000);

async function open(page: Page, route: string, username = 'viewer'): Promise<AppState> {
  expect((await page.request.post('/api/demo-login', { data: { username } })).ok()).toBe(true);
  await page.goto(`/#/${route}`);
  await expect(page.locator('main h1')).toBeVisible();
  return (await page.request.get('/api/state')).json();
}
function nextPreview(page: Page) {
  return page.waitForResponse(response => response.url().endsWith('/api/export/view-preview') && response.request().method() === 'POST');
}
async function download(page: Page, format: 'PDF' | 'Excel') {
  const downloading = page.waitForEvent('download');
  const request = page.waitForRequest(value => value.url().endsWith('/api/export/view') && value.method() === 'POST');
  await page.getByRole('dialog', { name: 'Export views', exact: true }).getByRole('button', { name: `Download ${format}`, exact: true }).click();
  return { download: await downloading, request: (await request).postDataJSON() };
}

test('viewer exports a person by time schedule as PDF and an editable weekly Excel roster', async ({ page }) => {
  const state = await open(page, 'schedule');
  const day = state.shifts.find(shift => shift.volunteerIds.length > 0 && shift.status !== 'cancelled')!.date;
  await page.getByLabel('Workspace date', { exact: true }).fill(day);
  const previewing = nextPreview(page);
  await page.getByRole('button', { name: 'Export views', exact: true }).click();
  const response = await previewing; expect(response.ok()).toBe(true);
  const report: ViewReport = await response.json();
  expect(report.view).toBe('volunteer-timeline');
  expect(report.range.dateFrom).toBe(day); expect(report.range.dateTo).toBe(day);
  expect(report.request.includeNotes).toBe(false); expect(report.request.includeCustomFields).toBe(false);
  expect(report.timelines[0].rows.some(row => row.lanes.some(lane => lane.length))).toBe(true);
  const dialog = page.getByRole('dialog', { name: 'Export views', exact: true });
  await expect(dialog.getByRole('article', { name: 'Saved report preview' })).toBeVisible();
  await expect(dialog.locator('.view-export-bar').first()).toBeVisible();
  const exportedPdf = await download(page, 'PDF');
  expect(exportedPdf.request).toMatchObject({ format: 'pdf', view: 'volunteer-timeline', dateFrom: day, dateTo: day, includeNotes: false });
  expect(exportedPdf.download.suggestedFilename()).toMatch(/\.pdf$/);
  expect((await readFile((await exportedPdf.download.path())!)).subarray(0, 5).toString()).toBe('%PDF-');
  await dialog.getByRole('radio', { name: /Excel/ }).check();
  const weeklyPreview = nextPreview(page);
  await dialog.getByRole('button', { name: /Weekly roster/ }).click();
  const weekly: ViewReport = await (await weeklyPreview).json();
  expect(weekly.weekly.length).toBeGreaterThan(0);
  await expect(dialog.getByRole('button', { name: 'Download Excel', exact: true })).toBeEnabled();
  const exportedExcel = await download(page, 'Excel');
  expect(exportedExcel.request).toMatchObject({ format: 'xlsx', view: 'weekly-roster' });
  const workbook = new Workbook(); await workbook.xlsx.readFile((await exportedExcel.download.path())!);
  expect(workbook.worksheets.length).toBeGreaterThanOrEqual(2);
  const cellText = workbook.worksheets.flatMap(sheet => { const rows: string[] = []; sheet.eachRow(row => row.eachCell(cell => rows.push(cell.text))); return rows; }).join('\n');
  expect(cellText).toContain('SHUORI');
  expect(cellText).toContain(weekly.weekly[0].label);
  for (const volunteer of state.volunteers) { if (volunteer.email) expect(cellText).not.toContain(volunteer.email); if (volunteer.phone) expect(cellText).not.toContain(volunteer.phone); }
});

test('event agenda preserves exact filters including an empty selection', async ({ page }) => {
  const state = await open(page, 'events'); const event = state.events[0];
  await page.getByRole('textbox', { name: 'Search events', exact: true }).fill(event.title);
  let previewing = nextPreview(page);
  await page.getByRole('button', { name: 'Export views', exact: true }).click();
  let response = await previewing; expect(response.ok()).toBe(true);
  let report: ViewReport = await response.json();
  expect(report.view).toBe('event-agenda'); expect(report.request.eventIds).toEqual([event.id]); expect(report.items.every(item => item.id === event.id)).toBe(true);
  const exported = await download(page, 'PDF'); expect(exported.request.eventIds).toEqual([event.id]);
  await page.getByRole('dialog', { name: 'Export views', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search events', exact: true }).fill('There are no matching export view events');
  previewing = nextPreview(page); await page.getByRole('button', { name: 'Export views', exact: true }).click();
  response = await previewing; expect(response.ok()).toBe(true); report = await response.json();
  expect(report.request.eventIds).toEqual([]); expect(report.items).toEqual([]);
  await expect(page.getByRole('dialog').getByText('No activities in this scope', { exact: true })).toBeVisible();
  expect((await download(page, 'PDF')).request.eventIds).toEqual([]);
});

test('individual event brief preserves keyboard focus and supports explicit detail choices', async ({ page }) => {
  const state = await open(page, 'events'); const event = state.events[0];
  await page.getByRole('button', { name: `Open event ${event.title}`, exact: true }).click();
  const eventDialog = page.getByRole('dialog', { name: event.title, exact: true });
  const previewing = nextPreview(page); await eventDialog.getByRole('button', { name: 'Export brief', exact: true }).click();
  const report: ViewReport = await (await previewing).json(); expect(report.view).toBe('event-brief'); expect(report.event?.title).toBe(event.title);
  const dialog = page.getByRole('dialog', { name: 'Export views', exact: true });
  await expect(dialog.getByRole('checkbox', { name: /Include operational notes/ })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /Include event custom fields/ })).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: /Include event custom fields/ }).check();
  await dialog.getByRole('checkbox', { name: /Include operational notes/ }).check();
  await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
  const exported = await download(page, 'PDF'); expect(exported.request).toMatchObject({ eventId: event.id, includeNotes: true, includeCustomFields: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(eventDialog).toBeVisible();
  await expect(eventDialog.getByRole('button', { name: 'Export brief', exact: true })).toBeFocused();
});

test('mobile export settings recover from preview errors without downloading a stale report', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await open(page, 'schedule'); const day = state.shifts[0].date;
  await page.getByLabel('Workspace date', { exact: true }).fill(day);
  await page.route('**/api/export/view-preview', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The preview service is temporarily unavailable.' }) }));
  await page.getByRole('button', { name: 'Export views', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export views', exact: true });
  await expect(dialog.getByRole('alert')).toHaveText('The preview service is temporarily unavailable.');
  await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeDisabled();
  await page.unroute('**/api/export/view-preview');
  await dialog.getByRole('button', { name: 'Retry preview', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
  await dialog.getByLabel('Day ends (JST)', { exact: true }).fill('07:00');
  await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel('Day ends (JST)', { exact: true }).fill('18:00');
  await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
