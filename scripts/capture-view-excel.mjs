// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { seedState } from '../server/seed.mjs';
import { buildViewReport } from '../shared/export-views.mjs';
import { buildViewExcel } from '../server/view-excel.mjs';

const now = new Date('2026-10-08T01:02:03.000Z');
const state = seedState('2026-10-08');
const examples = [
  { view: 'volunteer-timeline', dateFrom: '2026-10-08', dateTo: '2026-10-08' },
  { view: 'station-timeline', dateFrom: '2026-10-08', dateTo: '2026-10-08' },
  { view: 'weekly-roster', dateFrom: '2026-10-05', dateTo: '2026-10-11' },
  { view: 'event-brief', eventId: 'event-briefing' },
  { view: 'event-agenda', dateFrom: '2026-10-08', dateTo: '2026-10-14' },
];
await mkdir('artifacts/exports', { recursive: true });
await mkdir('artifacts/qa', { recursive: true });
const report = { status: 'pass', generatedAt: now.toISOString(), source: 'Synthetic seedState(2026-10-08), no live database or personal records', examples: [], checks: {} };
for (const request of examples) {
  const model = buildViewReport(state, { ...request, paper: 'A4', timeFrom: '08:00', timeTo: '18:00', slotMinutes: 30 }, { now, mode: 'demo' });
  const result = await buildViewExcel(model), workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer);
  const file = `artifacts/exports/shuori-demo-${request.view}.xlsx`;
  await writeFile(file, result.buffer);
  let cells = 0, formulaCells = 0, hyperlinks = 0;
  const sheets = workbook.worksheets.map(sheet => {
    let minFont = 100, maxHeight = 0;
    sheet.eachRow(row => {
      maxHeight = Math.max(maxHeight, row.height || 21);
      assert.ok(row.height <= 150, `${sheet.name}: excessively tall row`);
      row.eachCell(cell => { cells++; if (cell.formula) formulaCells++; if (cell.hyperlink) hyperlinks++; if (row.number >= 5 && cell.value !== null) minFont = Math.min(minFont, cell.font?.size || 10); });
    });
    assert.equal(sheet.pageSetup.printTitlesRow, '1:5');
    assert.equal(sheet.views[0].state, 'frozen');
    assert.ok(sheet.pageSetup.printArea);
    // A conservative normal-style width estimate: seven pixels per character
    // plus five pixels per column at 96 dpi. Actual spreadsheet fonts/printers
    // can vary, so this is an estimate, not an asserted physical measurement.
    const widthPoints = sheet.columns.reduce((sum, column) => sum + ((column.width ?? 9) * 7 + 5) * .75, 0);
    const paperWidth = sheet.pageSetup.paperSize === 8 ? 1190.55 : 841.89;
    const printable = paperWidth - (sheet.pageSetup.margins.left + sheet.pageSetup.margins.right) * 72;
    const scale = Math.min(1, printable / widthPoints), estimatedFont = minFont * scale;
    assert.ok(estimatedFont >= 8, `${sheet.name}: print estimate below an 8pt font (${estimatedFont})`);
    return { name: sheet.name, rows: sheet.rowCount, columns: sheet.columnCount, paper: sheet.pageSetup.paperSize === 8 ? 'A3' : 'A4', orientation: sheet.pageSetup.orientation, repeatedHeadings: sheet.pageSetup.printTitlesRow, frozenColumns: sheet.views[0].xSplit, printArea: sheet.pageSetup.printArea, mergedRanges: sheet.model.merges.length, maxRowHeightPoints: maxHeight, estimatedPrintScale: Number(scale.toFixed(3)), estimatedMinimumFontPoints: Number(estimatedFont.toFixed(2)) };
  });
  assert.equal(formulaCells, 0); assert.equal(hyperlinks, 0);
  const register = workbook.getWorksheet('Item register');
  for (const row of model.items) {
    let found = false;
    register.eachRow((value, number) => { if (number >= 6 && value.getCell(3).value === row.id) found = true; });
    assert.ok(found, `Missing source item ${row.id}`);
  }
  report.examples.push({ view: request.view, file, bytes: result.buffer.length, sha256: createHash('sha256').update(result.buffer).digest('hex'), items: model.items.length, people: model.people.length, cells, formulaCells, hyperlinks, timeBandsMinutes: model.range.slotMinutes, dateFrom: model.range.dateFrom, dateTo: model.range.dateTo, sheets });
}

// Demonstrate lossless long-text continuation using only a synthetic report.
const long = '=HYPERLINK("https://example.invalid")\n' + '準備・当日案内・振り返り。🙂  A  B\n'.repeat(170);
const check = buildViewReport(state, { view: 'event-brief', eventId: 'event-briefing' }, { now, mode: 'demo' });
check.event.description = long;
const validated = new ExcelJS.Workbook(); await validated.xlsx.load((await buildViewExcel(check)).buffer);
const parts = [];
validated.getWorksheet('Event brief').eachRow((row, number) => { if (number >= 6 && row.getCell(2).value === 'Description') parts.push(row.getCell(3).value || ''); });
assert.ok(parts.length > 1); assert.equal(parts.join(''), long);
report.checks = { allSourceItemsPresent: true, frozenPanesAndRepeatedPrintHeadings: true, a4PrintAreas: true, formulaAndHyperlinkObjectsAbsent: true, longTextContinuationLossless: true, longTextParts: parts.length, unicodeAndWhitespacePreserved: true, referenceTest: 'node --test tests/view-excel.test.mjs (5 cases)' };
await writeFile('artifacts/qa/view-excel.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Validated ${report.examples.length} visual Excel examples; lossless text across ${parts.length} continuation rows.`);
