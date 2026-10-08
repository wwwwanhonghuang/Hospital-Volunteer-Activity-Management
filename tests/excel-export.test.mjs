// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildExcelExport, EXCEL_MIME, parseExcelRequest } from '../server/excel-export.mjs';
import { seedState, emptyState } from '../server/seed.mjs';
import { createApp } from '../server/app.mjs';
import { calculateCPM } from '../shared/cpm.mjs';

const now = new Date('2026-10-07T15:05:06.000Z');
async function workbook(state, request) {
  const result = await buildExcelExport(state, request, { now, mode: 'demo', version: '1.2.0' });
  assert.equal(result.buffer.readUInt32LE(0), 0x04034b50, 'XLSX must be a ZIP archive, not renamed CSV');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(result.buffer);
  return { result, book };
}
function rows(sheet) {
  const headers = sheet.getRow(5).values.slice(1);
  return Array.from({ length: Math.max(0, sheet.rowCount - 5) }, (_, index) => Object.fromEntries(headers.map((title, col) => [title, sheet.getCell(index + 6, col + 1).value])));
}
function cell(sheet, row, title) {
  const index = sheet.getRow(5).values.indexOf(title);
  assert.ok(index > 0, `Header ${title} was not found`); return sheet.getCell(row, index);
}
function allValues(book) {
  const values = []; book.eachSheet(sheet => sheet.eachRow(row => row.eachCell(value => { values.push(value.value); }))); return values;
}

test('Excel volunteer exports retain Unicode, string identity, exact scope and typed/styled cells', async () => {
  const state = seedState('2026-10-08'), original = state.volunteers[0];
  Object.assign(original, { name: '守織 太郎・患者案内', kana: 'シュオリ タロウ', phone: '09001234567', email: 'text@example.invalid', notes: '=HYPERLINK("https://example.invalid","never execute")' });
  const { result, book } = await workbook(state, { kind: 'volunteers', ids: [original.id], date: '2026-10-08', scopeLabel: '検索: 守織' });
  assert.equal(result.mime, EXCEL_MIME); assert.equal(result.filename, 'shuori-volunteers-2026-10-08.xlsx');
  const sheet = book.getWorksheet('Volunteers'), exported = rows(sheet);
  assert.equal(exported.length, 1); assert.equal(exported[0]['Record ID'], original.id); assert.equal(exported[0]['Volunteer name'], original.name);
  assert.equal(exported[0]['Phone (text)'], '09001234567'); assert.equal(cell(sheet, 6, 'Phone (text)').type, ExcelJS.ValueType.String);
  assert.equal(exported[0]['Administrative notes'], original.notes); assert.equal(cell(sheet, 6, 'Administrative notes').type, ExcelJS.ValueType.String); assert.equal(cell(sheet, 6, 'Administrative notes').formula, undefined);
  assert.ok(exported[0]['Joined date'] instanceof Date); assert.equal(exported[0]['Joined date'].toISOString().slice(0, 10), original.joinedDate);
  assert.equal(typeof exported[0]['Weekly hour cap'], 'number');
  assert.ok(exported[0]['Available from'] instanceof Date, 'ExcelJS reads time-formatted numeric cells as dates'); assert.equal(exported[0]['Available from'].getUTCHours(), 8);
  assert.match(sheet.getCell('A1').text, /守織 SHUORI/); assert.match(sheet.getCell('A2').text, /2026-10-08 00:05:06 JST/);
  assert.match(sheet.getCell('A3').text, /Exact selected IDs: 1.*検索: 守織/);
  assert.equal(sheet.getCell('A5').fill.fgColor.argb, 'FF006B88'); assert.equal(sheet.views[0].ySplit, 5); assert.equal(sheet.views[0].state, 'frozen');
  assert.ok(sheet.autoFilter); assert.equal(sheet.pageSetup.printTitlesRow, '1:5'); assert.equal(sheet.pageSetup.orientation, 'landscape');
  assert.match(sheet.headerFooter.oddHeader, /守織 SHUORI/); assert.ok(sheet.getColumn(2).width >= 25);
  assert.equal(rows(book.getWorksheet('Overview'))[0]['Data rows'], 1);
});

test('Excel never infers formulas or links from user text, including leading symbols and URLs', async () => {
  const state = seedState('2026-10-08'), samples = ['=1+2', '+SUM(A1:A2)', '-2+3', '@SUM(A1:A2)', '\t=1+1', 'https://example.invalid', "'plain", '日本語・図書館'];
  state.requests = samples.map((title, index) => ({ ...state.requests[0], id: `request-test-${index}`, title, description: title, resolution: title }));
  const { book } = await workbook(state, { kind: 'requests' });
  const sheet = book.getWorksheet('Support requests');
  for (let index = 0; index < samples.length; index++) {
    const value = cell(sheet, index + 6, 'Title'); assert.equal(value.value, samples[index]); assert.equal(value.type, ExcelJS.ValueType.String); assert.equal(value.hyperlink, undefined); assert.equal(value.formula, undefined);
  }
});

test('empty explicit scope remains empty with valid headers and workbook index', async () => {
  const state = seedState('2026-10-08');
  const { book } = await workbook(state, { kind: 'schedule', ids: [], scopeLabel: 'No matching visible shifts' });
  for (const name of ['Shifts', 'Assignment roster']) {
    const sheet = book.getWorksheet(name); assert.equal(rows(sheet).length, 0); assert.equal(sheet.rowCount, 5); assert.ok(sheet.autoFilter); assert.match(sheet.getCell('A4').text, /No matching records/);
  }
  assert.deepEqual(rows(book.getWorksheet('Overview')).map(row => row['Data rows']), [0, 0]);
  const { book: empty } = await workbook(emptyState(), { kind: 'workspace' });
  assert.equal(rows(empty.getWorksheet('Volunteers')).length, 0); assert.ok(rows(empty.getWorksheet('Locations')).length > 0, 'Installed station references remain available in an empty workspace');
});

test('monthly workbook matches report totals, categories, recognition and six-month trend', async () => {
  const state = seedState('2026-10-08'), month = '2026-10';
  const selected = state.records.filter(row => row.date.startsWith(month));
  const { book } = await workbook(state, { kind: 'monthly-report', month });
  const summary = Object.fromEntries(rows(book.getWorksheet('Monthly summary')).map(row => [row.Metric, row.Value]));
  assert.equal(summary['Volunteer hours'], selected.reduce((n, row) => n + row.hours, 0));
  assert.equal(summary['Service interactions'], selected.reduce((n, row) => n + row.serviceCount, 0));
  assert.equal(summary['Participating volunteers'], new Set(selected.map(row => row.volunteerId)).size);
  assert.equal(summary['Completed shifts'], state.shifts.filter(row => row.date.startsWith(month) && row.status === 'completed').length);
  assert.equal(summary['Non-cancelled shifts'], state.shifts.filter(row => row.date.startsWith(month) && row.status !== 'cancelled').length);
  const people = rows(book.getWorksheet('Participation'));
  assert.equal(people.reduce((n, row) => n + row['Recorded hours'], 0), summary['Volunteer hours']);
  assert.equal(people.reduce((n, row) => n + row['Service interactions'], 0), summary['Service interactions']);
  assert.deepEqual(rows(book.getWorksheet('Recognition planning')), people);
  assert.equal(rows(book.getWorksheet('Service categories')).reduce((n, row) => n + row['Recorded hours'], 0), summary['Volunteer hours']);
  assert.equal(rows(book.getWorksheet('Six month trend')).length, 6); assert.equal(rows(book.getWorksheet('Six month trend')).at(-1).Month, month);
  assert.deepEqual(rows(book.getWorksheet('Activity records')).map(row => row['Record ID']), selected.map(row => row.id));
  const { book: empty } = await workbook(emptyState(), { kind: 'monthly-report', month });
  const emptySummary = Object.fromEntries(rows(empty.getWorksheet('Monthly summary')).map(row => [row.Metric, row.Value]));
  assert.equal(emptySummary['Volunteer hours'], 0); assert.equal(emptySummary['Change from previous month (%)'], null);
});

test('readiness workbook uses inclusive administrative due dates and excludes archived follow-ups', async () => {
  const state = seedState('2026-10-08');
  state.volunteers = [
    { ...state.volunteers[0], id: 'current', healthDueDate: '2026-10-08' },
    { ...state.volunteers[0], id: 'overdue', healthDueDate: '2026-10-07' },
    { ...state.volunteers[0], id: 'unknown', healthDueDate: '' },
    { ...state.volunteers[0], id: 'archived', status: 'archived', healthStatus: 'pending' },
  ];
  const { book } = await workbook(state, { kind: 'readiness', date: '2026-10-08' });
  const exported = rows(book.getWorksheet('Readiness'));
  assert.equal(exported.find(row => row['Record ID'] === 'current')['Administratively ready'], true);
  assert.equal(exported.find(row => row['Record ID'] === 'overdue')['Review overdue'], true);
  assert.deepEqual(rows(book.getWorksheet('Readiness follow-ups')).map(row => row['Record ID']), ['overdue', 'unknown']);
  assert.match(book.getWorksheet('Readiness').getCell('A4').text, /No diagnoses, test results or vaccination details/);
});

test('project plans export complete CPM context, dependent tasks and numeric yen budgets', async () => {
  const state = seedState('2026-10-08'), project = state.projects[0], tasks = state.tasks.filter(task => task.projectId === project.id), cpm = calculateCPM(tasks);
  const { book } = await workbook(state, { kind: 'project-plan', projectId: project.id });
  const summary = Object.fromEntries(rows(book.getWorksheet('Project plan summary')).map(row => [row.Metric, row.Value]));
  assert.equal(summary['Planned duration (days)'], cpm.duration);
  assert.equal(summary['Critical tasks'], cpm.tasks.filter(task => task.critical).length);
  const exported = rows(book.getWorksheet('Tasks and CPM'));
  for (const row of exported) { const expected = cpm.tasks.find(task => task.id === row['Record ID']); assert.equal(row['Earliest start day'], expected.es); assert.equal(row['Float (days)'], expected.slack); assert.equal(row['Critical task'], expected.critical); }
  assert.equal(rows(book.getWorksheet('Task dependencies')).length, tasks.reduce((n, task) => n + task.dependencies.length, 0));
  const budget = cell(book.getWorksheet('Projects'), 6, 'Budget (JPY)'); assert.equal(budget.value, project.budget); assert.match(budget.numFmt, /¥/);
  const lastTask = tasks.at(-1), { book: filtered } = await workbook(state, { kind: 'tasks', ids: [lastTask.id] });
  assert.equal(rows(filtered.getWorksheet('Tasks and CPM')).length, 1); assert.equal(rows(filtered.getWorksheet('Tasks and CPM'))[0]['Earliest start day'], cpm.tasks.find(task => task.id === lastTask.id).es);
});

test('workspace scenarios flatten objects, additions, routes and points without credential or audit exports', async () => {
  const state = seedState('2026-10-08'), shift = state.shifts.find(value => value.volunteerIds.length);
  state.scenarios = [{ id: 'scene-1', version: 2, name: '図書館 案内計画', description: 'Spatial proposal', objects: { '1F:chair:1': { x: -3, y: .5, z: 2, rotation: Math.PI, hidden: true } }, additions: [{ id: 'added-1', name: '入口案内', kind: 'sign', floor: '1F', x: 2, y: 0, z: 3, rotation: 0 }], routes: [{ id: 'route-1', volunteerId: shift.volunteerIds[0], shiftId: shift.id, floor: '1F', points: [{ x: -9, z: 0 }, { x: 2, z: 3 }] }] }];
  state.users = [{ username: 'DO-NOT-EXPORT-ACCOUNT', password_hash: 'DO-NOT-EXPORT-PASSWORD' }]; state.audit[0].summary = 'DO-NOT-EXPORT-AUDIT';
  const { book } = await workbook(state, { kind: 'workspace' });
  assert.equal(rows(book.getWorksheet('Scene object overrides'))[0]['Hidden'], true);
  assert.equal(rows(book.getWorksheet('Scene additions'))[0]['Object name'], '入口案内');
  assert.equal(rows(book.getWorksheet('Scene routes'))[0]['Volunteer'], state.volunteers.find(value => value.id === shift.volunteerIds[0]).name);
  assert.deepEqual(rows(book.getWorksheet('Route points')).map(row => [row['Point sequence'], row['Local X'], row['Local Z']]), [[1, -9, 0], [2, 2, 3]]);
  assert.doesNotMatch(JSON.stringify(allValues(book)), /DO-NOT-EXPORT/);
  assert.equal(book.getWorksheet('Accounts'), undefined); assert.equal(book.getWorksheet('Audit'), undefined);
  const index = rows(book.getWorksheet('Overview'));
  assert.equal(index.length, book.worksheets.length - 1);
  for (const row of index) assert.equal(row['Data rows'], rows(book.getWorksheet(row.Worksheet)).length);
});

test('Excel validates filters, dates, IDs and cell text limits without dropping data', async () => {
  for (const invalid of [{ kind: 'audit' }, { kind: 'users' }, { kind: 'monthly-report' }, { kind: 'monthly-report', month: '2026-13' }, { kind: 'monthly-report', month: '26-10' }, { kind: 'project-plan' }, { kind: 'schedule', date: '2026-02-30' }, { kind: 'volunteers', ids: ['x', 'x'] }, { kind: 'workspace', ids: [] }, { kind: 'volunteers', path: '/etc/secrets' }, { kind: 'records', ids: Array(10001).fill('id') }]) assert.throws(() => parseExcelRequest(invalid), error => error.status === 400, JSON.stringify(invalid).slice(0, 120));
  const state = seedState('2026-10-08');
  await assert.rejects(buildExcelExport(state, { kind: 'volunteers', ids: ['missing'] }), error => error.status === 400 && /no longer exist/.test(error.message));
  await assert.rejects(buildExcelExport(state, { kind: 'project-plan', projectId: 'missing' }), error => error.status === 400);
  await assert.rejects(buildExcelExport(state, { kind: 'schedule', ids: [state.shifts[0].id], date: '2026-12-01' }), error => error.status === 400);
  state.volunteers[0].notes = 'あ'.repeat(32768);
  await assert.rejects(buildExcelExport(state, { kind: 'volunteers', ids: [state.volunteers[0].id] }), error => error.status === 413 && /no text was truncated/.test(error.message));
});

function richState() {
  const state = seedState('2026-10-08'), person = state.volunteers[0], other = state.volunteers[1];
  for (const volunteer of state.volunteers) volunteer.customFields = {};
  const base = id => ({ id, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() });
  state.fieldDefinitions = [
    { ...base('field-zero'), scope: 'volunteers', label: 'Travel allowance', type: 'number', options: [], active: true, required: false, order: 1 },
    { ...base('field-false'), scope: 'volunteers', label: 'Newsletter consent', type: 'boolean', options: [], active: true, required: false, order: 2 },
    { ...base('field-date'), scope: 'volunteers', label: 'Former review date', type: 'date', options: [], active: false, required: false, order: 3 },
    { ...base('field-text'), scope: 'volunteers', label: 'Preferred role', type: 'select', options: ['Library', '=1+2'], active: true, required: false, order: 4 },
    { ...base('field-event'), scope: 'events', label: 'Expected participants', type: 'number', options: [], active: true, required: true, order: 1 },
    { ...base('field-entry'), scope: 'entries', label: 'Follow-up', type: 'textarea', options: [], active: true, required: false, order: 1 },
    { ...base('field-record'), scope: 'records', label: 'Department', type: 'text', options: [], active: true, required: false, order: 1 },
  ];
  Object.assign(person, { contactPreference: 'email', address: 'Tokyo, sample district', emergencyContact: { name: 'Sample Contact', relationship: 'Family', phone: '001234' }, tags: ['Library', '=tag'], customFields: { 'field-zero': 0, 'field-false': false, 'field-date': '2025-10-08', 'field-text': '=1+2', 'old-field': '@SUM(A1:A2)' } });
  other.customFields = {};
  state.eventTypes = [{ ...base('type-meeting'), name: 'Planning meeting', description: 'A custom planning type', color: 'blue', defaultModules: ['meeting', 'checklist'], active: true }, { ...base('type-private'), name: 'Unrelated type', description: '', color: 'green', defaultModules: [], active: true }];
  state.events = [
    { ...base('event-one'), title: '=Planning meeting', typeId: 'type-meeting', date: '2026-10-08', endDate: '2026-10-10', start: '09:00', end: '11:00', status: 'confirmed', description: 'Programme review', owner: 'Coordinator', locationId: state.locations[0].id, locationText: 'Sample venue', projectId: state.projects[0].id, volunteerIds: [person.id, other.id], shiftIds: [state.shifts[0].id], resourceIds: [state.resources[0].id], modules: ['meeting', 'checklist', 'attendance'], meeting: { provider: 'zoom', url: 'https://example.invalid/j/123?pwd=DO-NOT-EXPORT-MEETING-SECRET#DO-NOT-EXPORT-MEETING-FRAGMENT', meetingId: '00123', passcode: 'DO-NOT-EXPORT-PASSCODE', agenda: '+Agenda' }, attendance: [{ volunteerId: person.id, status: 'attended', notes: '=Attendance' }], checklist: [{ id: 'check-one', title: '=Finish report', done: false, owner: 'Coordinator', dueDate: '2026-10-11' }], customFields: { 'field-event': 12 } },
    { ...base('event-other'), title: 'Unrelated event', typeId: 'type-private', date: '2026-10-20', endDate: '2026-10-20', start: '09:00', end: '10:00', status: 'draft', volunteerIds: [], shiftIds: [], resourceIds: [], modules: [], attendance: [], checklist: [], customFields: {} },
  ];
  state.entries = [
    { ...base('entry-one'), volunteerId: person.id, eventId: 'event-one', title: 'Review notes', category: 'Meeting notes', status: 'open', date: '2026-10-08', dueDate: '2026-10-12', body: '=HYPERLINK("example.invalid")', customFields: { 'field-entry': '@FOLLOWUP' } },
    { ...base('entry-other'), volunteerId: other.id, eventId: 'event-other', title: 'Unrelated note', category: 'Follow-up', status: 'complete', date: '2026-10-20', dueDate: '', body: 'Private to another selected scope', customFields: {} },
  ];
  state.records = [
    { ...state.records[0], id: 'record-one', volunteerId: person.id, eventId: 'event-one', customFields: { 'field-record': '=Hospital services' } },
    { ...state.records[0], id: 'record-other', volunteerId: other.id, eventId: 'event-other', customFields: {} },
  ];
  state.attachments = [
    { ...base('file-one'), targetType: 'events', targetId: 'event-one', kind: 'file', name: '=report.pdf', url: '', contentType: 'application/pdf', size: 123, sha256: 'a'.repeat(64), uploadedBy: 'Coordinator', description: 'Final report', storagePath: 'DO-NOT-EXPORT-PHYSICAL-PATH', data: 'DO-NOT-EXPORT-FILE-BYTES' },
    { ...base('link-one'), targetType: 'entries', targetId: 'entry-one', kind: 'link', name: 'Cloud report', url: 'https://drive.google.com/file/d/sample/view?usp=sharing', contentType: '', size: 0, sha256: '', uploadedBy: 'Coordinator', description: 'Existing cloud document' },
    { ...base('file-record'), targetType: 'records', targetId: 'record-one', kind: 'file', name: 'record.txt', size: 5, uploadedBy: 'Coordinator' },
    { ...base('link-volunteer'), targetType: 'volunteers', targetId: person.id, kind: 'link', name: 'Profile form', url: 'https://example.invalid/forms', uploadedBy: 'Coordinator' },
    { ...base('file-other'), targetType: 'events', targetId: 'event-other', kind: 'file', name: 'Unrelated.pdf', size: 14, uploadedBy: 'Coordinator' },
  ];
  return state;
}

test('rich volunteer export preserves zero, false, archived definitions, orphan values and exact journal scope', async () => {
  const state = richState(), person = state.volunteers[0];
  const { book } = await workbook(state, { kind: 'volunteers', ids: [person.id] });
  const sheet = book.getWorksheet('Volunteers'), row = rows(sheet)[0];
  assert.equal(row['Travel allowance [field-zero]'], 0); assert.equal(cell(sheet, 6, 'Travel allowance [field-zero]').type, ExcelJS.ValueType.Number);
  assert.equal(row['Newsletter consent [field-false]'], false); assert.equal(cell(sheet, 6, 'Newsletter consent [field-false]').type, ExcelJS.ValueType.Boolean);
  assert.ok(row['Former review date [field-date] (archived)'] instanceof Date);
  assert.equal(row['Preferred role [field-text]'], '=1+2'); assert.equal(cell(sheet, 6, 'Preferred role [field-text]').formula, undefined);
  assert.equal(row['Unregistered field old-field [old-field] (archived)'], '@SUM(A1:A2)');
  assert.equal(row['Emergency contact phone (text)'], '001234'); assert.equal(row['Profile tags'], 'Library\n=tag');
  assert.deepEqual(rows(book.getWorksheet('Journal entries')).map(row => row['Record ID']), ['entry-one']);
  assert.deepEqual(rows(book.getWorksheet('Activity records')).map(row => row['Record ID']), ['record-one']);
  assert.deepEqual(rows(book.getWorksheet('Files and links')).map(row => row['Record ID']), ['link-one', 'file-record', 'link-volunteer']);
  const fields = rows(book.getWorksheet('Field dictionary'));
  assert.equal(fields.find(row => row['Record ID'] === 'field-date').Active, false);
  assert.match(fields.find(row => row['Record ID'] === 'old-field')['Definition status'], /Definition missing/);
  assert.ok(!fields.some(row => row['Applies to'] === 'events'));
});

test('event workbook scopes modules, attendance, checklist, child records and attachment references without file bytes or meeting secrets', async () => {
  const state = richState(), { book } = await workbook(state, { kind: 'events', ids: ['event-one'], date: '2026-10-09' });
  const main = book.getWorksheet('Events'), row = rows(main)[0];
  assert.equal(row['Record ID'], 'event-one'); assert.equal(row['Expected participants [field-event]'], 12);
  assert.equal(row['Meeting address (without query)'], 'https://example.invalid/j/123'); assert.equal(row['Meeting ID (text)'], '00123');
  assert.equal(row.Title, '=Planning meeting'); assert.equal(cell(main, 6, 'Title').type, ExcelJS.ValueType.String);
  assert.equal(rows(book.getWorksheet('Event attendance'))[0]['Attendance status'], 'attended');
  assert.equal(rows(book.getWorksheet('Event checklist'))[0].Complete, false);
  assert.equal(rows(book.getWorksheet('Event relationships')).length, 5);
  assert.deepEqual(rows(book.getWorksheet('Event types')).map(row => row['Record ID']), ['type-meeting']);
  assert.deepEqual(rows(book.getWorksheet('Journal entries')).map(row => row['Record ID']), ['entry-one']);
  assert.deepEqual(rows(book.getWorksheet('Activity records')).map(row => row['Record ID']), ['record-one']);
  const files = book.getWorksheet('Files and links'), fileRows = rows(files);
  assert.deepEqual(fileRows.map(row => row['Record ID']), ['file-one', 'link-one', 'file-record']);
  assert.equal(fileRows[0]['Authenticated download path'], '/api/attachments/file-one/download'); assert.equal(fileRows[0]['SHA-256'], 'a'.repeat(64));
  assert.equal(fileRows[1]['External URL (text)'], state.attachments[1].url); assert.equal(cell(files, 7, 'External URL (text)').hyperlink, undefined);
  assert.doesNotMatch(JSON.stringify(allValues(book)), /DO-NOT-EXPORT|Unrelated/);
  await assert.rejects(buildExcelExport(state, { kind: 'events', ids: ['event-one'], date: '2026-10-11' }), error => error.status === 400);
  const { book: dated } = await workbook(state, { kind: 'events', date: '2026-10-10' });
  assert.deepEqual(rows(dated.getWorksheet('Events')).map(row => row['Record ID']), ['event-one']);
});

test('new rich exports preserve empty scopes, direct collection filters and complete workspace dictionaries', async () => {
  const state = richState();
  for (const kind of ['volunteers', 'events', 'entries', 'records', 'eventTypes', 'fieldDefinitions', 'attachments']) {
    const { book } = await workbook(state, { kind, ids: [] });
    for (const sheet of book.worksheets.filter(sheet => sheet.name !== 'Overview')) assert.equal(rows(sheet).length, 0, `${kind}: ${sheet.name} must not leak unrelated rows`);
  }
  for (const [kind, name, id] of [['entries', 'Journal entries', 'entry-other'], ['eventTypes', 'Event types', 'type-private'], ['fieldDefinitions', 'Field dictionary', 'field-date'], ['attachments', 'Files and links', 'file-other']]) {
    const { book } = await workbook(state, { kind, ids: [id] });
    assert.deepEqual(rows(book.getWorksheet(name)).map(row => row['Record ID']), [id]);
  }
  const { book } = await workbook(state, { kind: 'workspace' });
  assert.equal(rows(book.getWorksheet('Events')).length, 2); assert.equal(rows(book.getWorksheet('Journal entries')).length, 2);
  assert.equal(rows(book.getWorksheet('Files and links')).length, 5);
  assert.equal(rows(book.getWorksheet('Field dictionary')).length, state.fieldDefinitions.length + 1);
  for (const row of rows(book.getWorksheet('Overview'))) assert.equal(row['Data rows'], rows(book.getWorksheet(row.Worksheet)).length);
});

test('invalid stored custom-field types and oversized journal text fail explicitly without coercion or truncation', async () => {
  const state = richState(), person = state.volunteers[0];
  person.customFields['field-false'] = 'false';
  await assert.rejects(buildExcelExport(state, { kind: 'volunteers', ids: [person.id] }), error => error.status === 422 && /Boolean/.test(error.message));
  person.customFields['field-false'] = false; person.customFields['field-zero'] = '0';
  await assert.rejects(buildExcelExport(state, { kind: 'volunteers', ids: [person.id] }), error => error.status === 422 && /numeric/.test(error.message));
  state.entries[0].body = 'x'.repeat(32768);
  await assert.rejects(buildExcelExport(state, { kind: 'entries', ids: ['entry-one'] }), error => error.status === 413 && /no text was truncated/.test(error.message));
});

async function runServer(t) {
  const app = createApp({ dbPath: ':memory:', mode: 'demo', demoDate: '2026-10-08' });
  const server = await new Promise(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); app.locals.close(); });
  return { app, url: `http://127.0.0.1:${server.address().port}` };
}
async function client(server, username) {
  const login = await fetch(`${server.url}/api/demo-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  const session = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0];
  return async (body, { csrf = true, origin } = {}) => fetch(`${server.url}/api/export/xlsx`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(csrf ? { 'X-CSRF-Token': session.csrfToken } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
}
test('authenticated Excel endpoint allows viewers while preserving CSRF, origin and read-only behavior', async t => {
  const server = await runServer(t);
  assert.equal((await fetch(`${server.url}/api/export/xlsx`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"kind":"volunteers"}' })).status, 401);
  const admin = await client(server, 'admin'), coordinator = await client(server, 'coordinator'), viewer = await client(server, 'viewer');
  const before = server.app.locals.getState();
  assert.equal((await viewer({ kind: 'volunteers' }, { csrf: false })).status, 403);
  assert.equal((await viewer({ kind: 'volunteers' }, { origin: 'https://untrusted.example' })).status, 403);
  for (const request of [admin, coordinator, viewer]) {
    const response = await request({ kind: 'volunteers', ids: [before.volunteers[0].id] });
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), EXCEL_MIME);
    assert.match(response.headers.get('content-disposition'), /^attachment; filename="shuori-volunteers-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const buffer = Buffer.from(await response.arrayBuffer()); const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
    assert.equal(rows(book.getWorksheet('Volunteers'))[0]['Record ID'], before.volunteers[0].id);
  }
  assert.equal((await viewer({ kind: 'monthly-report', month: '2026-00' })).status, 400);
  assert.equal((await viewer({ kind: 'volunteers', ids: ['missing'] })).status, 400);
  const empty = await viewer({ kind: 'records', ids: [] }); assert.equal(empty.status, 200);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await empty.arrayBuffer())); assert.equal(rows(book.getWorksheet('Activity records')).length, 0);
  for (const [kind, name] of [['events', 'Events'], ['eventTypes', 'Event types'], ['entries', 'Journal entries'], ['fieldDefinitions', 'Field dictionary'], ['attachments', 'Files and links']]) {
    const response = await viewer({ kind, ids: [] }); assert.equal(response.status, 200, kind);
    const exported = new ExcelJS.Workbook(); await exported.xlsx.load(Buffer.from(await response.arrayBuffer()));
    assert.equal(rows(exported.getWorksheet(name)).length, 0, `${kind} preserves an empty viewer selection`);
  }
  assert.deepEqual(server.app.locals.getState(), before, 'Exports must not mutate records or create audit entries');
});
