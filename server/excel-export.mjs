// SPDX-License-Identifier: AGPL-3.0-only
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { collections, dateSchema, HttpError } from './validation.mjs';
import { tokyoDate } from './seed.mjs';
import { calculateCPM } from '../shared/cpm.mjs';
import { eligibility, minutes, shiftHours } from '../shared/scheduling.mjs';

export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const EXCEL_LIMITS = Object.freeze({ rows: 30000, cells: 400000, textCharacters: 8000000, cellCharacters: 32767, bytes: 16 * 1024 * 1024 });
const dataKinds = [...new Set([...collections, 'events', 'eventTypes', 'entries', 'fieldDefinitions', 'attachments'])];
const kinds = [...dataKinds, 'locations', 'workspace', 'monthly-report', 'readiness', 'project-plan', 'schedule'];
const exportSchema = z.object({
  kind: z.enum(kinds), ids: z.array(z.string().min(1).max(160)).max(10000).optional(),
  month: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, 'Use a valid YYYY-MM month.').optional(),
  date: dateSchema.optional(), projectId: z.string().min(1).max(100).optional(),
  scopeLabel: z.string().trim().max(240).optional(),
}).strict().superRefine((value, context) => {
  const fail = message => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.ids && new Set(value.ids).size !== value.ids.length) fail('Export IDs must be unique.');
  if (value.kind === 'monthly-report' && !value.month) fail('Choose a reporting month.');
  if (value.kind === 'project-plan' && !value.projectId) fail('Choose a project for the plan.');
  if (value.month && value.kind !== 'monthly-report') fail('Month is supported only for a monthly report.');
  if (value.projectId && value.kind !== 'project-plan') fail('Project ID is supported only for a project plan.');
  if (value.date && !['schedule', 'shifts', 'events', 'readiness', 'volunteers'].includes(value.kind)) fail('Date is supported only for schedule, event or volunteer readiness exports.');
  if (value.ids && ['workspace', 'monthly-report', 'project-plan'].includes(value.kind)) fail('This export kind does not accept a row ID filter.');
});
export function parseExcelRequest(value) {
  const parsed = exportSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map(issue => issue.message).join(' '));
  return parsed.data;
}
const column = (key, title, type = 'text', width = 22) => ({ key, title, type, width });
const idColumn = column('id', 'Record ID', 'text', 39);
const commonColumns = [column('version', 'Version', 'integer', 10), column('createdAt', 'Created (JST)', 'timestamp', 23), column('updatedAt', 'Updated (JST)', 'timestamp', 23)];
const titleColumn = column('title', 'Title', 'text', 36);
const noteColumn = column('notes', 'Administrative notes', 'text', 55);
const list = value => (value || []).join('\n');
const sum = (values, key) => values.reduce((total, value) => total + value[key], 0);
const byId = (values = []) => new Map(values.map(value => [value.id, value]));
function* mapped(values, fn) { for (const value of values) yield fn(value); }
function selectRows(values, ids) {
  if (ids === undefined) return values;
  const map = byId(values);
  const missing = ids.filter(id => !map.has(id));
  if (missing.length) throw new HttpError(400, `Some selected records no longer exist (${missing.length}). Refresh the view and export again.`);
  return ids.map(id => map.get(id));
}
function monthOffset(month, delta) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
}
function readiness(volunteer, date) {
  const current = volunteer.healthStatus === 'cleared' && !!volunteer.healthDueDate && volunteer.healthDueDate >= date;
  const reasons = [];
  if (volunteer.status !== 'active') reasons.push('Programme status is not active');
  if (volunteer.trainingStatus !== 'complete') reasons.push('Training follow-up');
  if (volunteer.healthStatus !== 'cleared') reasons.push('Administrative clearance follow-up');
  if (!volunteer.healthDueDate) reasons.push('Set administrative review date');
  else if (volunteer.healthDueDate < date) reasons.push('Administrative review overdue');
  return { ready: volunteer.status === 'active' && volunteer.trainingStatus === 'complete' && current,
    reviewNeeded: volunteer.status !== 'archived' && (volunteer.trainingStatus !== 'complete' || !current),
    clearanceCurrent: current, reviewOverdue: !!volunteer.healthDueDate && volunteer.healthDueDate < date, reasons: reasons.join('\n') };
}

/** Creates actual OOXML with typed cells. User strings are always string values,
 * never formula/hyperlink objects; oversized text is rejected without truncation.
 */
export async function buildExcelExport(state, input, options = {}) {
  const request = parseExcelRequest(input), referenceDate = request.date || tokyoDate();
  const generated = options.now || new Date();
  const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(generated);
  const dateStamp = stamp.slice(0, 10);
  const scope = [request.kind, request.ids !== undefined ? `Exact selected IDs: ${request.ids.length}` : 'All records in the stated scope', request.month && `Month: ${request.month}`, request.date && `Date: ${request.date}`, request.projectId && `Project: ${request.projectId}`, request.scopeLabel && `View label: ${request.scopeLabel}`].filter(Boolean).join(' | ');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '守織 SHUORI'; workbook.lastModifiedBy = '守織 SHUORI';
  workbook.created = generated; workbook.modified = generated;
  workbook.title = `守織 SHUORI · ${request.kind}`;
  workbook.subject = 'Volunteer operations export'; workbook.description = `English operational workbook. Dates and times use Asia/Tokyo. ${scope}`;
  const overview = workbook.addWorksheet('Overview');
  const counters = { rows: 0, cells: 0, textCharacters: 0 }, index = [];
  const names = Object.fromEntries(['volunteers', 'projects', 'locations', 'shifts', 'tasks', 'events', 'eventTypes', 'resources', 'records', 'entries'].map(key => [key, byId(state[key])]));
  const volunteerName = id => names.volunteers.get(id)?.name || id;
  const projectName = id => names.projects.get(id)?.title || id || '';
  const locationName = id => names.locations.get(id)?.name || id;
  const shiftName = id => names.shifts.get(id)?.title || id;
  const taskName = id => names.tasks.get(id)?.title || id;
  const eventName = id => names.events.get(id)?.title || id || '';
  const usedFields = new Map();
  let includeFieldDictionary = false;

  function customColumns(scope, values) {
    includeFieldDictionary = true;
    const definitions = (state.fieldDefinitions || []).filter(value => value.scope === scope).map(value => ({ ...value, provenance: 'Registered field' }));
    const known = new Set(definitions.map(value => value.id));
    // Preserve old values even if a definition was removed outside the application.
    for (const id of new Set(values.flatMap(value => Object.keys(value.customFields || {})))) {
      if (known.has(id)) continue;
      const samples = values.map(value => value.customFields?.[id]).filter(value => value !== null && value !== undefined && value !== '');
      const type = samples.length && samples.every(value => typeof value === 'number') ? 'number' : samples.length && samples.every(value => typeof value === 'boolean') ? 'boolean' : 'text';
      definitions.push({ id, scope, label: `Unregistered field ${id}`, type, options: [], required: false, active: false, order: Number.MAX_SAFE_INTEGER, provenance: 'Definition missing; original field ID and values retained' });
    }
    definitions.sort((a, b) => (a.order || 0) - (b.order || 0) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    if (values.length) for (const definition of definitions) usedFields.set(`${scope}:${definition.id}`, definition);
    return definitions.map(value => column(`custom:${value.id}`, `${value.label} [${value.id}]${value.active === false ? ' (archived)' : ''}`, ['number', 'date', 'boolean'].includes(value.type) ? value.type : 'text', value.type === 'textarea' ? 55 : 30));
  }
  const customValues = value => Object.fromEntries(Object.entries(value.customFields || {}).map(([id, content]) => [`custom:${id}`, content]));
  function meetingAddress(value) {
    if (!value) return '';
    try { const url = new URL(value); return `${url.origin}${url.pathname}`; }
    catch { return '[Invalid stored meeting address]'; }
  }

  function safeValue(value, type, address) {
    if (value === undefined || value === null || value === '') return null;
    if (type === 'date') {
      if (!dateSchema.safeParse(value).success) throw new HttpError(422, `Invalid stored date at ${address}. Correct the source record before exporting.`);
      return new Date(`${value}T00:00:00Z`);
    }
    if (type === 'timestamp') {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) throw new HttpError(422, `Invalid stored timestamp at ${address}.`);
      return new Date(date.getTime() + 9 * 60 * 60 * 1000);
    }
    if (type === 'time') {
      if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new HttpError(422, `Invalid stored time at ${address}.`);
      return minutes(value) / 1440;
    }
    if (['number', 'integer', 'currency', 'percent'].includes(type)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new HttpError(422, `Invalid stored numeric value at ${address}.`);
      return value;
    }
    if (type === 'boolean') {
      if (typeof value !== 'boolean') throw new HttpError(422, `Invalid stored Boolean value at ${address}.`);
      return value;
    }
    // ExcelJS only infers formulas or hyperlinks from objects, never strings.
    const text = String(value);
    if (text.length > EXCEL_LIMITS.cellCharacters) throw new HttpError(413, `Text at ${address} exceeds Excel's 32,767-character cell limit. Shorten the source field or choose a smaller export; no text was truncated.`);
    counters.textCharacters += text.length;
    if (counters.textCharacters > EXCEL_LIMITS.textCharacters) throw new HttpError(413, 'This workbook contains too much text. Export a smaller filtered selection.');
    return text;
  }
  const formats = { text: '@', date: 'yyyy-mm-dd', timestamp: 'yyyy-mm-dd hh:mm:ss', time: 'hh:mm', integer: '#,##0', number: '#,##0.00;[Red]-#,##0.00', currency: '"¥"#,##0.00;[Red]-"¥"#,##0.00', percent: '0.0%', boolean: 'General', auto: 'General' };
  function populate(sheet, title, columns, rows, note = '') {
    sheet.properties.defaultRowHeight = 24;
    sheet.properties.tabColor = { argb: 'FF00A7CB' };
    sheet.columns = columns.map(value => ({ key: value.key, width: value.width }));
    const last = columns.length;
    for (const row of [1, 2, 3, 4]) sheet.mergeCells(row, 1, row, last);
    sheet.getCell(1, 1).value = safeValue(`守織 SHUORI · ${title}`, 'text', `${title}!A1`);
    sheet.getCell(2, 1).value = safeValue(`Generated ${stamp} JST · Asia/Tokyo · ${options.mode || 'workspace'} · version ${options.version || '1.3.0'}`, 'text', `${title}!A2`);
    sheet.getCell(3, 1).value = safeValue(scope, 'text', `${title}!A3`);
    sheet.getCell(4, 1).value = safeValue(note || 'Dates are Tokyo civil dates. User-entered text is stored as text. No rows are omitted silently.', 'text', `${title}!A4`);
    sheet.getRow(1).height = 34; sheet.getRow(2).height = 23; sheet.getRow(3).height = 32; sheet.getRow(4).height = 36;
    for (let row = 1; row <= 4; row++) {
      const cell = sheet.getCell(row, 1);
      cell.font = { name: 'Yu Gothic', size: row === 1 ? 18 : 10, bold: row === 1, color: { argb: row === 1 ? 'FFFFFFFF' : 'FF173F57' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row === 1 ? 'FF006B88' : 'FFE6F7FB' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
    const header = sheet.getRow(5); header.values = columns.map(value => value.title); header.height = 32;
    header.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B88' } };
      cell.font = { name: 'Yu Gothic', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    let count = 0;
    for (const value of rows) {
      if (++counters.rows > EXCEL_LIMITS.rows || (counters.cells += columns.length) > EXCEL_LIMITS.cells) throw new HttpError(413, 'This workbook exceeds the export row or cell limit. Export a smaller filtered selection.');
      count++;
      const row = sheet.addRow(columns.map((definition, col) => {
        const raw = value[definition.key];
        return safeValue(raw, definition.type === 'auto' ? typeof raw === 'number' ? 'number' : 'text' : definition.type, `${title}!${count + 5}:${col + 1}`);
      }));
      row.height = Math.max(25, Math.min(64, 14 * Math.max(1, ...columns.map(definition => {
        const text = String(value[definition.key] ?? ''); return Math.max(text.split('\n').length, Math.ceil(text.length / Math.max(12, definition.width)));
      }))));
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const definition = columns[col - 1];
        cell.font = { name: 'Yu Gothic', size: 10, color: { argb: 'FF173F57' } };
        cell.alignment = { vertical: 'top', wrapText: true, horizontal: ['number', 'integer', 'currency', 'percent'].includes(definition.type) ? 'right' : 'left' };
        cell.numFmt = formats[definition.type] || '@';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: count % 2 ? 'FFF5FAFD' : 'FFFFFFFF' } };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFD8E9F1' } } };
      });
    }
    if (count === 0) sheet.getCell(4, 1).value = `No matching records. Column headers are retained. ${note}`;
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 5, topLeftCell: 'B6', showGridLines: false, zoomScale: 85 }];
    sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, count + 5), column: last } };
    sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:5', margins: { left: .3, right: .3, top: .5, bottom: .5, header: .2, footer: .2 } };
    sheet.pageSetup.printArea = `A1:${sheet.getColumn(last).letter}${Math.max(5, count + 5)}`;
    sheet.headerFooter.oddHeader = '&L守織 SHUORI&CVolunteer operations&RAsia/Tokyo';
    sheet.headerFooter.oddFooter = '&LInternal operational export&C&A&RPage &P of &N';
    return count;
  }
  function sheet(name, columns, rows, note = '') {
    const count = populate(workbook.addWorksheet(name), name, columns, rows, note);
    index.push({ sheet: name, rows: count, purpose: note || 'Operational data in the selected scope.' });
  }
  const summaryColumns = [column('metric', 'Metric', 'text', 37), column('value', 'Value', 'auto', 24), column('meaning', 'Definition', 'text', 76)];
  const personColumns = [column('volunteerId', 'Volunteer ID', 'text', 39), column('volunteer', 'Volunteer', 'text', 30)];
  const locationColumns = [column('locationId', 'Location ID'), column('location', 'Service location', 'text', 30), column('floor', 'Floor', 'text', 10)];
  const dateColumn = column('date', 'Date', 'date', 15);

  function volunteers(values) {
    sheet('Volunteers', [idColumn, column('name', 'Volunteer name', 'text', 28), column('kana', 'Name reading', 'text', 25), column('email', 'Email', 'text', 32), column('phone', 'Phone (text)', 'text', 22), column('contactPreference', 'Contact preference'), column('address', 'Postal address', 'text', 45), column('emergencyName', 'Emergency contact name', 'text', 28), column('emergencyRelationship', 'Emergency contact relationship', 'text', 30), column('emergencyPhone', 'Emergency contact phone (text)', 'text', 30), column('tags', 'Profile tags', 'text', 30), column('status', 'Programme status'), column('skills', 'Skills', 'text', 30), column('languages', 'Languages'), column('trainingStatus', 'Training status'), column('healthStatus', 'Administrative clearance'), column('healthDueDate', 'Next clearance review', 'date', 20), column('ready', 'Administratively ready', 'boolean', 23), column('availability', 'Available weekdays'), column('availableFrom', 'Available from', 'time', 16), column('availableTo', 'Available until', 'time', 16), column('maxHoursPerWeek', 'Weekly hour cap', 'number', 18), column('joinedDate', 'Joined date', 'date', 15), noteColumn, ...customColumns('volunteers', values), ...commonColumns], mapped(values, value => ({ ...value, ...customValues(value), emergencyName: value.emergencyContact?.name, emergencyRelationship: value.emergencyContact?.relationship, emergencyPhone: value.emergencyContact?.phone, tags: list(value.tags), skills: list(value.skills), languages: list(value.languages), availability: list(value.availability), ready: readiness(value, referenceDate).ready })), `Administrative readiness as of ${referenceDate}. Actual shift eligibility also depends on skills, availability, workload and conflicts. No clinical findings are modeled.`);
  }
  function projects(values) {
    sheet('Projects', [idColumn, titleColumn, column('category', 'Category'), column('description', 'Purpose and approach', 'text', 55), column('owner', 'Owner'), column('department', 'Department'), column('status', 'Status'), column('startDate', 'Start date', 'date', 15), column('dueDate', 'Due date', 'date', 15), column('budget', 'Budget (JPY)', 'currency', 20), column('spent', 'Spent (JPY)', 'currency', 20), column('remaining', 'Budget remaining (JPY)', 'currency', 24), column('goals', 'Goals', 'text', 55), column('risks', 'Risks', 'text', 55), ...commonColumns], mapped(values, value => ({ ...value, remaining: value.budget - value.spent })));
  }
  const cpmCache = new Map();
  function projectCPM(projectId) {
    if (!cpmCache.has(projectId)) {
      try { cpmCache.set(projectId, calculateCPM(state.tasks.filter(task => task.projectId === projectId))); }
      catch { throw new HttpError(422, 'A project dependency graph is invalid. Correct the project tasks before exporting its plan.'); }
    }
    return cpmCache.get(projectId);
  }
  function tasks(values) {
    sheet('Tasks and CPM', [idColumn, column('projectId', 'Project ID', 'text', 39), column('project', 'Project', 'text', 32), titleColumn, column('duration', 'Duration (calendar days)', 'integer', 24), column('dependencies', 'Predecessor IDs', 'text', 39), column('predecessors', 'Predecessor tasks', 'text', 38), column('status', 'Status'), column('assignee', 'Owner'), column('progress', 'Progress', 'percent', 14), column('es', 'Earliest start day', 'integer', 20), column('ef', 'Earliest finish day', 'integer', 20), column('ls', 'Latest start day', 'integer', 20), column('lf', 'Latest finish day', 'integer', 20), column('slack', 'Float (days)', 'integer', 16), column('critical', 'Critical task', 'boolean', 16), ...commonColumns], mapped(values, value => ({ ...value, ...projectCPM(value.projectId).tasks.find(task => task.id === value.id), project: projectName(value.projectId), dependencies: list(value.dependencies), predecessors: list(value.dependencies.map(taskName)), progress: value.progress / 100 })), 'CPM uses the complete project graph, even when task rows are filtered. Day zero is project start; durations include weekends and holidays. Progress does not alter planned duration.');
    sheet('Task dependencies', [column('taskId', 'Task ID', 'text', 39), column('task', 'Task', 'text', 35), column('predecessorId', 'Predecessor ID', 'text', 39), column('predecessor', 'Predecessor task', 'text', 35)], (function* () { for (const value of values) for (const id of value.dependencies) yield { taskId: value.id, task: value.title, predecessorId: id, predecessor: taskName(id) }; })());
  }
  function shifts(values) {
    sheet('Shifts', [idColumn, titleColumn, dateColumn, column('start', 'Start (JST)', 'time', 16), column('end', 'End (JST)', 'time', 16), ...locationColumns, column('requiredSkills', 'Required skills', 'text', 30), column('requiredCount', 'Required people', 'integer', 18), column('assigned', 'Assigned people', 'integer', 18), column('gap', 'Unfilled positions', 'integer', 20), column('duration', 'Shift hours', 'number', 16), column('status', 'Status'), column('projectId', 'Project ID', 'text', 39), column('project', 'Project', 'text', 32), noteColumn, ...commonColumns], mapped(values, value => ({ ...value, location: locationName(value.locationId), floor: names.locations.get(value.locationId)?.floor || '', requiredSkills: list(value.requiredSkills), assigned: value.volunteerIds.length, gap: Math.max(0, value.requiredCount - value.volunteerIds.length), duration: shiftHours(value), project: projectName(value.projectId) })), 'Times are Japan Standard Time. Counts describe scheduled assignments, not attendance or live location. Cancelled and draft shifts retain their recorded status.');
    sheet('Assignment roster', [column('shiftId', 'Shift ID', 'text', 39), column('shift', 'Shift', 'text', 32), dateColumn, column('start', 'Start (JST)', 'time', 16), column('end', 'End (JST)', 'time', 16), ...personColumns, ...locationColumns, column('status', 'Shift status'), column('hours', 'Scheduled person-hours', 'number', 25), column('eligibility', 'Current eligibility check', 'text', 30), column('reasons', 'Review reasons', 'text', 58)], (function* () {
      for (const shift of values) for (const volunteerId of shift.volunteerIds) {
        const historical = ['completed', 'cancelled'].includes(shift.status), check = historical ? null : eligibility(names.volunteers.get(volunteerId), shift, state.shifts, state.records);
        yield { shiftId: shift.id, shift: shift.title, date: shift.date, start: shift.start, end: shift.end, volunteerId, volunteer: volunteerName(volunteerId), locationId: shift.locationId, location: locationName(shift.locationId), floor: names.locations.get(shift.locationId)?.floor || '', status: shift.status, hours: shiftHours(shift), eligibility: historical ? 'Historical; not reassessed' : check.eligible ? 'Eligible' : 'Review required', reasons: check ? list(check.reasons) : '' };
      }
    })(), 'One row per volunteer/shift assignment. Historical completed or cancelled shifts are preserved without applying current readiness retroactively.');
  }
  function records(values) {
    sheet('Activity records', [idColumn, ...personColumns, column('shiftId', 'Shift ID', 'text', 39), column('shift', 'Shift', 'text', 32), column('eventId', 'Event ID', 'text', 39), column('event', 'Event', 'text', 32), dateColumn, column('hours', 'Recorded hours', 'number', 18), column('serviceCount', 'Service interactions', 'integer', 22), column('category', 'Service category', 'text', 28), noteColumn, ...customColumns('records', values), ...commonColumns], mapped(values, value => ({ ...value, ...customValues(value), volunteer: volunteerName(value.volunteerId), shift: shiftName(value.shiftId), event: eventName(value.eventId) })), 'Service interactions are aggregate recorded interactions, not unique patients or visitors.');
  }
  function requests(values) {
    sheet('Support requests', [idColumn, titleColumn, column('category', 'Category'), column('priority', 'Priority'), column('status', 'Status'), column('owner', 'Owner'), column('department', 'Department'), column('dueDate', 'Due date', 'date', 15), column('description', 'Description', 'text', 60), column('resolution', 'Resolution', 'text', 60), ...commonColumns], values);
  }
  function resources(values) {
    sheet('Resources', [idColumn, column('name', 'Resource', 'text', 35), column('category', 'Category'), ...locationColumns, column('quantity', 'Total quantity', 'integer', 18), column('available', 'Available quantity', 'integer', 20), column('inspectedDate', 'Last inspection', 'date', 18), column('status', 'Status'), noteColumn, ...commonColumns], mapped(values, value => ({ ...value, location: locationName(value.locationId), floor: names.locations.get(value.locationId)?.floor || '' })));
  }
  function locations(values) {
    sheet('Locations', [idColumn, column('name', 'Location', 'text', 34), column('floor', 'Floor', 'text', 10), column('building', 'Building', 'text', 32), column('x', 'Scene X', 'number', 14), column('z', 'Scene Z', 'number', 14), column('capacity', 'Planning capacity', 'integer', 20), column('source', 'Reference provenance'), column('description', 'Source and planning notes', 'text', 70)], values, 'Coordinates and capacity are illustrative planning assumptions, not surveyed dimensions or approved capacity limits.');
  }
  function scenarios(values) {
    const scene = [column('scenarioId', 'Scenario ID', 'text', 39), column('scenario', 'Scenario', 'text', 35)];
    const transform = [column('x', 'Local X', 'number', 14), column('y', 'Local height', 'number', 16), column('z', 'Local Z', 'number', 14), column('rotation', 'Rotation (radians)', 'number', 22)];
    sheet('Scenarios', [idColumn, column('name', 'Scenario', 'text', 35), column('description', 'Description', 'text', 60), column('overrides', 'Object overrides', 'integer', 20), column('additions', 'Added objects', 'integer', 18), column('routes', 'Rehearsal routes', 'integer', 20), ...commonColumns], mapped(values, value => ({ ...value, overrides: Object.keys(value.objects).length, additions: value.additions.length, routes: value.routes.length })), 'Spatial studies are independent of the operational roster. Coordinates are illustrative floor-local units.');
    sheet('Scene object overrides', [...scene, column('objectId', 'Object ID', 'text', 55), ...transform, column('hidden', 'Hidden', 'boolean', 14)], (function* () { for (const value of values) for (const [objectId, item] of Object.entries(value.objects)) yield { scenarioId: value.id, scenario: value.name, objectId, ...item }; })());
    sheet('Scene additions', [...scene, column('id', 'Added object ID', 'text', 43), column('name', 'Object name', 'text', 30), column('kind', 'Asset kind'), column('floor', 'Floor', 'text', 10), ...transform], (function* () { for (const value of values) for (const item of value.additions) yield { scenarioId: value.id, scenario: value.name, ...item }; })());
    sheet('Scene routes', [...scene, column('id', 'Route ID', 'text', 43), ...personColumns, column('shiftId', 'Shift ID', 'text', 39), column('shift', 'Shift', 'text', 32), column('floor', 'Floor', 'text', 10), column('points', 'Waypoints', 'integer', 15)], (function* () { for (const value of values) for (const item of value.routes) yield { scenarioId: value.id, scenario: value.name, ...item, volunteer: volunteerName(item.volunteerId), shift: shiftName(item.shiftId), points: item.points.length }; })(), 'Illustrative floor-local rehearsal. A round trip is 24 simulation minutes; no collision detection, measured walking speed or cross-floor routing.');
    sheet('Route points', [...scene, column('routeId', 'Route ID', 'text', 43), column('sequence', 'Point sequence', 'integer', 19), column('x', 'Local X', 'number', 14), column('z', 'Local Z', 'number', 14)], (function* () { for (const value of values) for (const route of value.routes) for (let point = 0; point < route.points.length; point++) yield { scenarioId: value.id, scenario: value.name, routeId: route.id, sequence: point + 1, ...route.points[point] }; })());
  }
  function eventTypes(values) {
    sheet('Event types', [idColumn, column('name', 'Type name', 'text', 30), column('description', 'Description', 'text', 55), column('color', 'Display color'), column('defaultModules', 'Default modules', 'text', 30), column('active', 'Active', 'boolean', 12), ...commonColumns], mapped(values, value => ({ ...value, defaultModules: list(value.defaultModules) })), 'Custom event classifications and module defaults. A type does not grant additional access permissions.');
  }
  function events(values) {
    const eventColumns = [column('eventId', 'Event ID', 'text', 39), column('event', 'Event', 'text', 35)];
    sheet('Events', [idColumn, titleColumn, column('typeId', 'Event type ID', 'text', 39), column('type', 'Event type', 'text', 28), dateColumn, column('endDate', 'End date', 'date', 15), column('start', 'Start (JST)', 'time', 16), column('end', 'End (JST)', 'time', 16), column('status', 'Status'), column('owner', 'Owner'), column('description', 'Description', 'text', 60), ...locationColumns, column('locationText', 'Venue or access details', 'text', 40), column('projectId', 'Project ID', 'text', 39), column('project', 'Project', 'text', 32), column('modules', 'Enabled modules', 'text', 30), column('meetingProvider', 'Meeting provider'), column('meetingUrl', 'Meeting address (without query)', 'text', 55), column('meetingId', 'Meeting ID (text)', 'text', 24), column('agenda', 'Meeting agenda', 'text', 60), ...customColumns('events', values), ...commonColumns], mapped(values, value => ({ ...value, ...customValues(value), endDate: value.endDate || value.date, type: names.eventTypes.get(value.typeId)?.name || value.typeId, location: locationName(value.locationId), floor: names.locations.get(value.locationId)?.floor || '', project: projectName(value.projectId), modules: list(value.modules), meetingProvider: value.meeting?.provider, meetingUrl: meetingAddress(value.meeting?.url), meetingId: value.meeting?.meetingId, agenda: value.meeting?.agenda })), 'Tokyo civil dates and times. Meeting passcodes and URL query/fragment data are excluded; use the event in SHUORI for its complete join link. Attendance does not create service hours.');
    sheet('Event attendance', [...eventColumns, ...personColumns, column('status', 'Attendance status'), column('notes', 'Attendance notes', 'text', 55)], (function* () { for (const value of values) for (const item of value.attendance || []) yield { eventId: value.id, event: value.title, ...item, volunteer: volunteerName(item.volunteerId) }; })(), 'Recorded invitation, confirmation and attendance states. Assigned participants without an attendance entry remain in Event relationships.');
    sheet('Event checklist', [...eventColumns, column('id', 'Checklist item ID', 'text', 39), titleColumn, column('done', 'Complete', 'boolean', 14), column('owner', 'Owner'), column('dueDate', 'Due date', 'date', 15)], (function* () { for (const value of values) for (const item of value.checklist || []) yield { eventId: value.id, event: value.title, ...item }; })());
    sheet('Event relationships', [...eventColumns, column('targetType', 'Linked collection'), column('targetId', 'Linked record ID', 'text', 39), column('target', 'Linked record', 'text', 40)], (function* () {
      for (const value of values) {
        const links = [['volunteers', value.volunteerIds || []], ['shifts', value.shiftIds || []], ['resources', value.resourceIds || []], ['projects', value.projectId ? [value.projectId] : []]];
        for (const [targetType, ids] of links) for (const targetId of ids) { const target = names[targetType].get(targetId); yield { eventId: value.id, event: value.title, targetType, targetId, target: target?.title || target?.name || targetId }; }
      }
    })(), 'Explicit links to participants, shifts, resources and project. A resource link is a planning reference, not an inventory reservation.');
  }
  function entries(values) {
    sheet('Journal entries', [idColumn, titleColumn, column('category', 'Category'), column('status', 'Status'), dateColumn, column('dueDate', 'Follow-up date', 'date', 18), ...personColumns, column('eventId', 'Event ID', 'text', 39), column('event', 'Event', 'text', 35), column('body', 'Record body', 'text', 70), ...customColumns('entries', values), ...commonColumns], mapped(values, value => ({ ...value, ...customValues(value), volunteer: volunteerName(value.volunteerId), event: eventName(value.eventId) })), 'Flexible journal and follow-up records. These entries are not counted as service hours; activity records remain the source for hours and interactions.');
  }
  function attachments(values) {
    sheet('Files and links', [idColumn, column('targetType', 'Parent collection'), column('targetId', 'Parent record ID', 'text', 39), column('target', 'Parent record', 'text', 35), column('name', 'File or link name', 'text', 40), column('kind', 'Storage kind'), column('url', 'External URL (text)', 'text', 60), column('downloadPath', 'Authenticated download path', 'text', 60), column('contentType', 'Content type', 'text', 35), column('size', 'Size (bytes)', 'integer', 18), column('sha256', 'SHA-256', 'text', 68), column('uploadedBy', 'Uploaded by', 'text', 30), column('description', 'Description', 'text', 60), ...commonColumns], mapped(values, value => { const target = names[value.targetType]?.get(value.targetId); return { ...value, target: target?.title || target?.name || value.targetId, url: value.kind === 'link' ? value.url : '', downloadPath: value.kind === 'file' ? `/api/attachments/${encodeURIComponent(value.id)}/download` : '' }; }), 'Metadata only: file bytes, physical storage paths and credentials are excluded. File download paths require a signed-in session on the originating SHUORI installation. External URLs remain literal text and retain their saved query parameters.');
  }
  function fieldDefinitions(values) {
    includeFieldDictionary = true;
    for (const value of values) usedFields.set(`${value.scope}:${value.id}`, { ...value, provenance: 'Registered field' });
  }
  function relatedRecords(targetType, values) {
    const ids = new Set(values.map(value => value.id));
    const relatedEntries = (state.entries || []).filter(value => ids.has(targetType === 'volunteers' ? value.volunteerId : value.eventId));
    const relatedActivity = state.records.filter(value => ids.has(targetType === 'volunteers' ? value.volunteerId : value.eventId));
    records(relatedActivity); entries(relatedEntries);
    const activityIds = new Set(relatedActivity.map(value => value.id)), entryIds = new Set(relatedEntries.map(value => value.id));
    attachments((state.attachments || []).filter(value => (value.targetType === targetType && ids.has(value.targetId)) || (value.targetType === 'records' && activityIds.has(value.targetId)) || (value.targetType === 'entries' && entryIds.has(value.targetId))));
  }
  const writers = { volunteers, projects, tasks, shifts, records, requests, resources, scenarios, locations, events, eventTypes, entries, fieldDefinitions, attachments };

  if (request.kind === 'workspace') {
    for (const key of [...dataKinds, 'locations']) writers[key](state[key] || []);
  } else if (request.kind === 'monthly-report') {
    const month = request.month, monthly = state.records.filter(value => value.date.startsWith(month));
    const monthlyShifts = state.shifts.filter(value => value.date.startsWith(month) && value.status !== 'cancelled');
    const hours = sum(monthly, 'hours'), interactions = sum(monthly, 'serviceCount'), people = [...new Set(monthly.map(value => value.volunteerId))].map(id => {
      const rows = monthly.filter(value => value.volunteerId === id);
      return { volunteerId: id, volunteer: volunteerName(id), hours: sum(rows, 'hours'), interactions: sum(rows, 'serviceCount'), shifts: new Set(rows.map(value => value.shiftId)).size, share: hours ? sum(rows, 'hours') / hours : 0 };
    }).sort((a, b) => b.hours - a.hours || a.volunteer.localeCompare(b.volunteer));
    const previous = sum(state.records.filter(value => value.date.startsWith(monthOffset(month, -1))), 'hours');
    sheet('Monthly summary', summaryColumns, [
      { metric: 'Reporting month', value: month, meaning: 'Tokyo civil month.' },
      { metric: 'Volunteer hours', value: hours, meaning: 'Sum of recorded activity hours.' },
      { metric: 'Service interactions', value: interactions, meaning: 'Aggregate interactions; not unique visitors.' },
      { metric: 'Participating volunteers', value: people.length, meaning: 'Distinct volunteer IDs in activity records.' },
      { metric: 'Average hours per person', value: people.length ? hours / people.length : 0, meaning: 'Recorded hours divided by participating volunteers.' },
      { metric: 'Completed shifts', value: monthlyShifts.filter(value => value.status === 'completed').length, meaning: 'Completed shifts in the month.' },
      { metric: 'Non-cancelled shifts', value: monthlyShifts.length, meaning: 'Includes draft, confirmed, active and completed shifts, matching the report UI.' },
      { metric: 'Activity records', value: monthly.length, meaning: 'Number of submitted records in the month.' },
      { metric: 'Shifts with records', value: new Set(monthly.map(value => value.shiftId)).size, meaning: 'Distinct shift IDs linked to submitted records.' },
      { metric: 'Previous month hours', value: previous, meaning: 'Recorded hours in the preceding month.' },
      { metric: 'Change from previous month (%)', value: previous ? (hours - previous) / previous * 100 : null, meaning: previous ? 'Percentage change in recorded hours.' : 'No prior-month comparison; denominator is zero.' },
    ]);
    const participationColumns = [...personColumns, column('shifts', 'Recorded shifts', 'integer', 20), column('hours', 'Recorded hours', 'number', 20), column('interactions', 'Service interactions', 'integer', 24), column('share', 'Share of recorded hours', 'percent', 25)];
    sheet('Participation', participationColumns, people, 'Sorted by recorded hours and name. These totals do not evaluate contribution quality.');
    sheet('Recognition planning', participationColumns, people, 'All recorded participants are included. Combine participation totals with peer feedback and service milestones; no automatic award threshold is applied.');
    const categories = [...new Set(monthly.map(value => value.category))].map(category => {
      const rows = monthly.filter(value => value.category === category); return { category, hours: sum(rows, 'hours'), interactions: sum(rows, 'serviceCount') };
    }).sort((a, b) => b.hours - a.hours);
    sheet('Service categories', [column('category', 'Service category', 'text', 34), column('hours', 'Recorded hours', 'number', 20), column('interactions', 'Service interactions', 'integer', 24)], categories);
    sheet('Six month trend', [column('month', 'Month', 'text', 18), column('hours', 'Recorded hours', 'number', 24)], Array.from({ length: 6 }, (_, index) => { const period = monthOffset(month, index - 5); return { month: period, hours: sum(state.records.filter(value => value.date.startsWith(period)), 'hours') }; }));
    records(monthly); shifts(monthlyShifts);
  } else if (request.kind === 'readiness') {
    const selected = selectRows(state.volunteers, request.ids), rows = selected.map(value => ({ ...value, ...readiness(value, referenceDate) }));
    const readinessColumns = [idColumn, column('name', 'Volunteer', 'text', 30), column('status', 'Programme status'), column('trainingStatus', 'Training status'), column('healthStatus', 'Administrative clearance'), column('healthDueDate', 'Next clearance review', 'date', 23), column('clearanceCurrent', 'Clearance current', 'boolean', 22), column('reviewOverdue', 'Review overdue', 'boolean', 20), column('ready', 'Administratively ready', 'boolean', 25), column('reviewNeeded', 'Training or clearance follow-up', 'boolean', 30), column('reasons', 'Administrative follow-up', 'text', 60)];
    sheet('Readiness summary', summaryColumns, [{ metric: 'Reference date', value: referenceDate, meaning: 'Clearance review date is inclusive.' }, { metric: 'Volunteers in scope', value: rows.length, meaning: 'Exact selected volunteer scope.' }, { metric: 'Administratively ready', value: rows.filter(row => row.ready).length, meaning: 'Active, training complete, clearance cleared and review date current.' }, { metric: 'Training or clearance review', value: rows.filter(row => row.reviewNeeded).length, meaning: 'Non-archived people with incomplete training or non-current clearance.' }]);
    sheet('Readiness', readinessColumns, rows, `Administrative status as of ${referenceDate}. No diagnoses, test results or vaccination details. Skills, time availability and conflicts must also be checked for each shift.`);
    sheet('Readiness follow-ups', readinessColumns, rows.filter(value => value.reviewNeeded), 'Non-archived volunteers requiring training or administrative clearance follow-up.');
  } else if (request.kind === 'project-plan') {
    const project = names.projects.get(request.projectId);
    if (!project) throw new HttpError(400, 'Project was not found. Refresh the project list.');
    const result = projectCPM(project.id);
    sheet('Project plan summary', summaryColumns, [{ metric: 'Project', value: project.title, meaning: project.id }, { metric: 'Planned duration (days)', value: result.duration, meaning: 'Longest finish-to-start dependency path in calendar days.' }, { metric: 'Critical tasks', value: result.tasks.filter(task => task.critical).length, meaning: 'All zero-float tasks, including tied branches.' }, { metric: 'One critical path', value: result.criticalPath.map(taskName).join(' → '), meaning: 'One connected longest path; not all tied critical paths.' }]);
    projects([project]); tasks(state.tasks.filter(value => value.projectId === project.id)); shifts(state.shifts.filter(value => value.projectId === project.id));
  } else if (request.kind === 'schedule') {
    let selected = selectRows(state.shifts, request.ids);
    if (request.date) {
      if (request.ids && selected.some(value => value.date !== request.date)) throw new HttpError(400, 'Selected shifts must match the requested schedule date.');
      selected = selected.filter(value => value.date === request.date);
    }
    shifts(selected);
  } else {
    let selected = selectRows(state[request.kind] || [], request.ids);
    if (request.kind === 'shifts' && request.date) {
      if (request.ids && selected.some(value => value.date !== request.date)) throw new HttpError(400, 'Selected shifts must match the requested date.');
      selected = selected.filter(value => value.date === request.date);
    }
    if (request.kind === 'events' && request.date) {
      const containsDate = value => value.date <= request.date && (value.endDate || value.date) >= request.date;
      if (request.ids && selected.some(value => !containsDate(value))) throw new HttpError(400, 'Selected events must include the requested date.');
      selected = selected.filter(containsDate);
    }
    writers[request.kind](selected);
    if (request.kind === 'projects') { const selectedIds = new Set(selected.map(value => value.id)); tasks(state.tasks.filter(value => selectedIds.has(value.projectId))); }
    if (['volunteers', 'events'].includes(request.kind)) relatedRecords(request.kind, selected);
    if (request.kind === 'events') { const typeIds = new Set(selected.map(value => value.typeId)); eventTypes((state.eventTypes || []).filter(value => typeIds.has(value.id))); }
    if (['entries', 'records'].includes(request.kind)) { const selectedIds = new Set(selected.map(value => value.id)); attachments((state.attachments || []).filter(value => value.targetType === request.kind && selectedIds.has(value.targetId))); }
  }
  if (includeFieldDictionary) sheet('Field dictionary', [idColumn, column('scope', 'Applies to'), column('label', 'Field label', 'text', 40), column('type', 'Value type'), column('options', 'Select options', 'text', 45), column('required', 'Required', 'boolean', 14), column('active', 'Active', 'boolean', 14), column('order', 'Display order', 'integer', 18), column('provenance', 'Definition status', 'text', 65), ...commonColumns], mapped([...usedFields.values()], value => ({ ...value, options: list(value.options) })), 'Custom columns retain stable field IDs, labels and native value types. Archived definitions and existing values remain exportable. An empty selected scope includes headers only.');
  populate(overview, 'Workbook overview', [column('sheet', 'Worksheet', 'text', 32), column('rows', 'Data rows', 'integer', 16), column('purpose', 'Contents and interpretation', 'text', 90)], index, 'Snapshot export. User accounts, passwords, sessions and audit logs are excluded. This workbook is not a restorable workspace backup. Dates and times are Japan Standard Time.');
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  if (buffer.length > EXCEL_LIMITS.bytes) throw new HttpError(413, 'This workbook exceeds the 16 MiB export limit. Export a smaller filtered selection.');
  return { buffer, filename: `shuori-${request.kind}-${dateStamp}.xlsx`, mime: EXCEL_MIME, sheets: index, rows: counters.rows };
}
