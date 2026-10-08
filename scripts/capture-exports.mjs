// SPDX-License-Identifier: AGPL-3.0-only
import { chromium } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const target = process.env.PREVIEW_URL || 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, timezoneId: 'Asia/Tokyo' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const health = await (await page.request.get(`${target}/api/health`)).json();
  assert.equal(health.mode, 'demo', 'Only fictional demo data may be packaged as examples.');
  await mkdir('artifacts/exports', { recursive: true });
  await mkdir('artifacts/previews', { recursive: true });
  await page.goto(target);
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.getByRole('heading', { name: 'Operations overview' }).waitFor();
  const date = await page.getByLabel('Workspace date', { exact: true }).inputValue();
  const files = [];
  async function download(label, stem) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    const item = await pending;
    const file = `artifacts/exports/shuori-demo-${stem}.xlsx`;
    await item.saveAs(file);
    const bytes = await readFile(file), workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    assert.ok(workbook.getWorksheet('Overview'));
    const sheets = workbook.worksheets.map(sheet => ({ name: sheet.name, rows: Math.max(0, sheet.rowCount - 5) }));
    files.push({ file, downloadName: item.suggestedFilename(), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sheets });
  }
  async function clearTransientUI() {
    const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
    if (await dismiss.isVisible()) await dismiss.click();
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  }
  await download('Export monthly report', 'monthly-report');
  await page.getByRole('navigation').getByRole('button', { name: 'Reports & insights', exact: true }).click();
  await page.getByRole('button', { name: 'Monthly report Excel', exact: true }).waitFor();
  await clearTransientUI();
  await page.screenshot({ path: 'artifacts/previews/06-reports.png', fullPage: true });
  await page.getByRole('navigation').getByRole('button', { name: 'Projects & planning', exact: true }).click();
  await page.locator('.project-card').first().click();
  await download('Project plan Excel', 'project-plan');
  await page.getByRole('navigation').getByRole('button', { name: 'Workspace settings', exact: true }).click();
  await download('Readiness workbook', 'readiness');
  await download('Workspace workbook', 'workspace');
  await clearTransientUI();
  await page.screenshot({ path: 'artifacts/previews/07-excel-exports.png', fullPage: true });
  assert.deepEqual(errors, []);
  const result = { generatedAt: new Date().toISOString(), version: health.version, sourceMode: health.mode, workspaceDate: date, note: 'Fictional demonstration data only. Downloaded through the compiled application.', errors, files };
  await writeFile('artifacts/qa/excel-examples.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
