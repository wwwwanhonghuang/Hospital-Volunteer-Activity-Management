// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildViewExcel, VIEW_EXCEL_MIME } from '../server/view-excel.mjs';

const day = '2026-10-08';
function fixture(view = 'volunteer-timeline') {
  const people = [{ id: 'vol-1', name: '守織 太郎' }];
  const items = [
    { key: 'shift:one', id: 'one', kind: 'shift', title: 'Library support', date: day, endDate: day, start: '09:07', end: '10:08', status: 'confirmed', location: 'Library', people, notes: '', requiredCount: 2, openPlaces: 1, conflict: false, conflictWith: [] },
    { key: 'event:two', id: 'two', kind: 'event', title: '=SUM(A1:A2)', date: day, endDate: day, start: '10:08', end: '10:16', status: 'confirmed', location: 'Meeting room', people, notes: '', requiredCount: null, openPlaces: 0, conflict: false, conflictWith: [] },
  ];
  const bars = items.map(item => ({ ...item, key: `${item.key}:${day}`, itemKey: item.key, people: item.people.map(person => person.name), startMinute: Number(item.start.slice(0, 2)) * 60 + Number(item.start.slice(3)), endMinute: Number(item.end.slice(0, 2)) * 60 + Number(item.end.slice(3)), clippedStart: false, clippedEnd: false }));
  return {
    schemaVersion: 1, view, title: 'Volunteer timeline', subtitle: 'Selected date and people', generatedAt: '2026-10-08T01:02:03.000Z', timezone: 'Asia/Tokyo', mode: 'demo', paper: 'A3',
    range: { dateFrom: day, dateTo: day, timeFrom: '08:00', timeTo: '20:00', startMinute: 480, endMinute: 1200, slotMinutes: 30 }, request: { view },
    privacy: 'Names only. Access credentials excluded.', summary: [{ label: 'Items', value: '2' }], legend: [], warnings: [], days: [day], people, items,
    timelines: [{ date: day, rows: [{ id: 'vol-1', label: people[0].name, detail: 'Library team', hours: 61 / 60, lanes: [bars] }] }],
    weekly: [{ id: 'vol-1', label: people[0].name, totalHours: 61 / 60, cells: [{ date: day, hours: 61 / 60, items: bars }] }], tables: [],
  };
}
async function render(report) {
  const result = await buildViewExcel(report), book = new ExcelJS.Workbook();
  assert.equal(result.buffer.readUInt32LE(0), 0x04034b50);
  await book.xlsx.load(result.buffer); return { book, result };
}
function values(book) { const result = []; book.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => { if (!cell.isMerged || cell.master.address === cell.address) result.push(cell.value); }))); return result; }
function masterCells(sheet) {
  const result = [];
  sheet.eachRow(row => row.eachCell(cell => { if ((!cell.isMerged || cell.master.address === cell.address) && typeof cell.value === 'string') result.push(cell); }));
  return result;
}
function tableRows(sheet) {
  return Array.from({ length: sheet.rowCount - 5 }, (_, index) => sheet.getRow(index + 6).values.slice(1));
}

test('visual Excel renders rounded timelines without merging adjacent exact-time assignments over one another', async () => {
  const { book, result } = await render(fixture());
  assert.equal(result.mime, VIEW_EXCEL_MIME); assert.equal(result.filename, `shuori-volunteer-timeline-${day}.xlsx`);
  const first = book.getWorksheet(`${day} 1`), second = book.getWorksheet(`${day} 2`);
  assert.ok(first && second, 'Twelve hours must be divided into readable six-hour panels');
  const shift = masterCells(first).find(cell => cell.text.startsWith('US001'));
  const event = masterCells(first).find(cell => cell.text.startsWith('E002'));
  assert.ok(shift && event); assert.notEqual(shift.row, event.row, 'Touching exact times share a rounded cell and need distinct lanes');
  assert.match(shift.text, /09:07–10:08/);
  assert.match(event.text, /10:08/); assert.match(event.text, /10:16/);
  assert.equal(shift.fill.fgColor.argb, 'FFFFE8B5'); assert.equal(event.fill.fgColor.argb, 'FFE8F6FB', 'Rounding alone must not create a red conflict');
  assert.equal(first.views[0].xSplit, 2); assert.equal(first.views[0].ySplit, 5);
  assert.equal(first.pageSetup.paperSize, 8); assert.equal(first.pageSetup.orientation, 'landscape'); assert.equal(first.pageSetup.printTitlesRow, '1:5');
  assert.ok(first.pageSetup.printArea); assert.match(first.headerFooter.oddFooter, /Page &P of &N/);
  const row = tableRows(book.getWorksheet('Item register'))[0];
  assert.equal(row[1], 'S001'); assert.ok(row[5] instanceof Date); assert.equal(row[5].toISOString().slice(0, 10), day);
  assert.equal(row[6].getUTCHours(), 9); assert.equal(row[6].getUTCMinutes(), 7);
  assert.equal(row[8].getUTCHours(), 10); assert.equal(row[8].getUTCMinutes(), 8);
  assert.equal(typeof first.getCell('B6').value, 'number');
});

test('event brief preserves Unicode and long text in readable numbered continuations without formulas', async () => {
  const report = fixture('event-brief');
  const long = '=HYPERLINK("https://example.invalid")\n' + '書架の準備と活動記録。🙂  A  B\n'.repeat(180);
  report.event = { title: '=Volunteer briefing', description: long, metadata: [{ label: 'Status', value: 'confirmed' }] };
  report.items[0].notes = long;
  report.tables = [{ title: 'Selected custom fields', columns: ['Field', 'Value'], rows: [['+SUM(A1:A2)', '@SUM(A1:A2)'], ['Zero', 0], ['Consent', false]] }];
  const { book } = await render(report);
  const brief = book.getWorksheet('Event brief'), parts = tableRows(brief).filter(row => row[1] === 'Description');
  assert.ok(parts.length > 1); assert.equal(parts.map(row => row[2] || '').join(''), long, 'No spaces, newlines, surrogate pairs or punctuation may disappear');
  assert.match(parts.at(-1)[0], new RegExp(`^${parts.length}/${parts.length}$`));
  assert.equal(tableRows(book.getWorksheet('Coordination notes')).map(row => row[3] || '').join(''), long);
  book.eachSheet(sheet => sheet.eachRow(row => {
    assert.ok(row.height <= 150, `A row must remain printable: ${sheet.name} ${row.number}`);
    row.eachCell(cell => { assert.equal(cell.formula, undefined); assert.equal(cell.hyperlink, undefined); });
  }));
  assert.ok(values(book).includes('@SUM(A1:A2)')); assert.ok(values(book).includes(false)); assert.ok(values(book).includes(0));
  assert.equal(book.creator, '守織 SHUORI');
});

test('weekly workbook marks cancelled, draft and conflict items distinctly and preserves idle volunteers', async () => {
  const report = fixture('weekly-roster'), bars = report.weekly[0].cells[0].items;
  bars[0].conflict = true;
  bars[1].status = 'cancelled'; bars[1].conflict = true;
  const draft = { ...bars[0], key: 'shift:draft', itemKey: 'shift:one', status: 'draft', conflict: false, openPlaces: 0 };
  bars.push(draft);
  report.weekly.push({ id: 'idle', label: 'No allocation yet', totalHours: 0, cells: [{ date: day, hours: 0, items: [] }] });
  const { book } = await render(report), sheet = book.getWorksheet('Roster 1');
  assert.equal(sheet.getCell('C6').fill.fgColor.argb, 'FFF9DADF'); assert.match(sheet.getCell('C6').text, /^!US001/);
  assert.equal(sheet.getCell('C7').fill.fgColor.argb, 'FFF0F3F5'); assert.match(sheet.getCell('C7').text, /^XE002/); assert.equal(sheet.getCell('C7').font.strike, true);
  assert.match(sheet.getCell('C8').text, /^DS001/); assert.equal(sheet.getCell('C8').fill.fgColor.argb, 'FFF0F3F5');
  assert.equal(sheet.getCell('A9').value, 'No allocation yet'); assert.equal(sheet.getCell('B9').value, 0);
  assert.equal(sheet.getCell('C5').value.toISOString().slice(0, 10), day);
  assert.ok(values(book).includes('No allocation yet'));
});

test('A4 timelines stay bounded and empty scopes retain structured print-ready sheets', async () => {
  const report = fixture(); report.paper = 'A4'; report.range.slotMinutes = 15;
  report.items = []; report.timelines[0].rows = []; report.weekly = []; report.people = [];
  const { book } = await render(report);
  const panels = book.worksheets.filter(sheet => sheet.name.startsWith(day));
  assert.equal(panels.length, 3);
  assert.ok(panels.every(sheet => sheet.columnCount <= 18 && sheet.pageSetup.paperSize === 9));
  assert.match(panels[0].getCell('A6').text, /No matching/);
  assert.ok(book.getWorksheet('Item register').autoFilter);
});

test('agenda and station views retain exact multi-day times and full IDs without contact fields', async () => {
  const report = fixture('event-agenda'); report.items[1].endDate = '2026-10-10';
  const { book } = await render(report);
  assert.match(tableRows(book.getWorksheet('Event agenda'))[1][3], /Ends 2026-10-10/);
  assert.equal(tableRows(book.getWorksheet('Item register'))[1][7].toISOString().slice(0, 10), '2026-10-10');
  const all = JSON.stringify(values(book)); assert.doesNotMatch(all, /password_hash|emergencyPhone|healthStatus/);
  const station = fixture('station-timeline'); station.title = 'Station coverage'; station.timelines[0].rows[0].label = 'Library desk';
  const rendered = await render(station);
  assert.equal(rendered.book.worksheets[0].getCell('A5').value, 'Service station / lane');
  assert.equal(rendered.book.getWorksheet('Row directory').getCell('C6').value, 'Library desk');
});
