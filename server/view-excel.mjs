// SPDX-License-Identifier: AGPL-3.0-only
import ExcelJS from 'exceljs';
import { HttpError } from './validation.mjs';

export const VIEW_EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const C = Object.freeze({ ink: 'FF173F57', muted: 'FF506E7D', aqua: 'FF006B88', pale: 'FFE8F6FB', line: 'FFD0E5EE', white: 'FFFFFFFF', blue: 'FFCCEAF5', green: 'FFDDF1E4', gray: 'FFF0F3F5', amber: 'FFFFE8B5', red: 'FFF9DADF' });
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const dateCell = value => value ? new Date(`${value}T00:00:00Z`) : null;

// A CJK glyph generally occupies two Latin character widths. Explicit wrapping
// keeps both Excel and printed rows readable without relying on auto-fit.
function widthOf(value) { return [...String(value)].reduce((n, char) => n + (/[^\u0000-\u00ff]/.test(char) ? 2 : 1), 0); }
function linesOf(value, width) {
  return String(value).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(widthOf(line) / Math.max(5, width - 2))), 0);
}
function parts(value, width, maxLines = 7) {
  if (typeof value !== 'string') return [value ?? null];
  const result = []; let part = '', lineWidth = 0, lines = 1;
  for (const char of value) {
    const advance = /[^\u0000-\u00ff]/.test(char) ? 2 : 1;
    const newLine = char === '\n' || lineWidth + advance > Math.max(5, width - 2);
    if (newLine && lines >= maxLines && part) { result.push(part); part = ''; lineWidth = 0; lines = 1; }
    else if (newLine) { lines++; lineWidth = 0; }
    part += char;
    if (char !== '\n') lineWidth += advance;
  }
  if (part || !result.length) result.push(part);
  return result;
}
function short(value, length = 56) {
  const points = [...String(value || '')];
  return points.length <= length ? points.join('') : `${points.slice(0, length - 1).join('')}…`;
}
function barColor(item) {
  if (item.status === 'cancelled') return C.gray;
  if (item.conflict) return C.red;
  if (item.openPlaces > 0) return C.amber;
  if (item.status === 'draft') return C.gray;
  return item.status === 'completed' ? C.green : item.status === 'active' ? C.blue : C.pale;
}
function safeFilename(kind, date) { return `shuori-${String(kind).replace(/[^a-z0-9-]/g, '')}-${String(date).replace(/[^0-9-]/g, '')}.xlsx`; }

/** Render only an explicitly normalized operational report. User-supplied text
 * is never passed as an Excel formula or hyperlink object. */
export async function buildViewExcel(report) {
  const book = new ExcelJS.Workbook(), index = [];
  const generated = new Date(report.generatedAt);
  if (!Number.isFinite(generated.getTime())) throw new HttpError(422, 'The view has an invalid generation date.');
  book.creator = '守織 SHUORI'; book.lastModifiedBy = '守織 SHUORI';
  book.created = generated; book.modified = generated; book.title = `守織 SHUORI · ${report.title}`;
  book.subject = 'Volunteer operations visual view';
  book.description = 'Operational planning view. Asia/Tokyo. Planned assignments are not attendance or live location.';
  let cellCount = 0, textCount = 0, rowCount = 0;
  const put = (cell, value) => {
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) value = String(value);
    if (typeof value === 'string') {
      if (value.length > 32767) throw new HttpError(413, 'A visual export cell exceeds the Excel text limit. No text was truncated.');
      textCount += value.length;
    }
    if (++cellCount > 400000 || textCount > 8000000) throw new HttpError(413, 'This view is too large. Choose a smaller date range or selection.');
    cell.value = value ?? null;
    cell.font = { name: 'Yu Gothic', size: 10, color: { argb: C.ink } };
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.numFmt = typeof value === 'string' ? '@' : 'General';
    return cell;
  };
  const band = (sheet, row, first, last, value, options = {}) => {
    if (last > first) sheet.mergeCells(row, first, row, last);
    const cell = put(sheet.getCell(row, first), value);
    cell.fill = fill(options.color || C.pale);
    cell.font = { name: 'Yu Gothic', size: options.size || 10, bold: !!options.bold, color: { argb: options.ink || C.ink }, strike: !!options.strike };
    cell.alignment = { vertical: 'middle', wrapText: true, horizontal: options.center ? 'center' : 'left' };
    return cell;
  };
  function sheet(name, title, widths, note, paper = 9) {
    const value = book.addWorksheet(name), columns = widths.length;
    widths.forEach((width, index) => { value.getColumn(index + 1).width = width; });
    value.properties.defaultRowHeight = 21;
    band(value, 1, 1, columns, `守織 SHUORI  /  ${title}`, { color: C.aqua, ink: C.white, size: 18, bold: true });
    value.getRow(1).height = 36;
    band(value, 2, 1, columns, report.subtitle || '', { color: C.white, bold: true });
    value.getRow(2).height = 30;
    band(value, 3, 1, columns, `Generated ${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(generated)} JST  ·  ${report.range.dateFrom} – ${report.range.dateTo}  ·  ${report.mode}`, { color: C.white });
    value.getRow(3).height = 30;
    band(value, 4, 1, columns, note, { color: C.pale });
    value.getRow(4).height = Math.min(60, Math.max(34, linesOf(note, widths.reduce((a, b) => a + b, 0)) * 15));
    value.views = [{ state: 'frozen', xSplit: 1, ySplit: 5, topLeftCell: 'B6', showGridLines: false, zoomScale: 85 }];
    value.pageSetup = { paperSize: paper, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:5', margins: { left: .3, right: .3, top: .45, bottom: .45, header: .2, footer: .2 } };
    value.headerFooter.oddHeader = '&L守織 SHUORI&CVolunteer operations&RAsia/Tokyo';
    value.headerFooter.oddFooter = '&LInternal operational view&C&A&RPage &P of &N';
    index.push({ name, title, sheet: value, columns });
    return value;
  }
  function headers(sheet, labels) {
    labels.forEach((label, index) => {
      const cell = put(sheet.getCell(5, index + 1), label);
      cell.fill = fill(C.aqua); cell.font = { name: 'Yu Gothic', size: 10, bold: true, color: { argb: C.white } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    sheet.getRow(5).height = 34;
  }
  function table(name, title, columns, rows, note = '') {
    const target = sheet(name, title, [9, ...columns.map(column => column.width)], note || 'Complete selected records. Long text continues in numbered parts; concatenate consecutive parts without adding separators.', report.paper === 'A3' ? 8 : 9);
    headers(target, ['Part', ...columns.map(column => column.label)]);
    // A dedicated continuation index makes the lossless wrapping explicit.
    target.getColumn(1).width = 9;
    columns.forEach((column, index) => { target.getColumn(index + 2).width = column.width; });
    const meta = index.at(-1);
    let row = 6;
    for (const values of rows) {
      const chunks = columns.map((column, index) => parts(values[index], column.width));
      const count = Math.max(1, ...chunks.map(value => value.length));
      for (let part = 0; part < count; part++) {
        put(target.getCell(row, 1), `${part + 1}/${count}`);
        let height = 24;
        columns.forEach((column, i) => {
          const value = chunks[i][part] ?? (i === 0 ? values[i] : null);
          const cell = put(target.getCell(row, i + 2), value);
          cell.fill = fill(row % 2 ? C.white : 'FFF5FAFD');
          cell.border = { bottom: { style: 'hair', color: { argb: C.line } } };
          if (column.format) cell.numFmt = column.format;
          height = Math.max(height, linesOf(value ?? '', column.width) * 14 + 9);
        });
        target.getRow(row).height = Math.min(150, height); row++; rowCount++;
      }
    }
    if (row === 6) { band(target, 6, 1, meta.columns, 'No records in this scope.', { color: C.white }); target.getRow(6).height = 30; }
    target.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, row - 1), column: meta.columns } };
    return target;
  }

  const references = new Map(report.items.map((item, index) => [item.key, /^[SE]\d+$/.test(item.key) ? item.key : `${item.kind === 'shift' ? 'S' : 'E'}${String(index + 1).padStart(3, '0')}`]));
  const ref = key => references.get(key) || key;
  const marker = item => item.status === 'cancelled' ? 'X' : `${item.conflict ? '!' : ''}${item.openPlaces > 0 ? 'U' : ''}${item.status === 'draft' ? 'D' : item.status === 'completed' ? '✓' : ''}`;
  const status = item => [item.status, item.conflict && 'CONFLICT', item.openPlaces > 0 && `${item.openPlaces} OPEN`].filter(Boolean).join(' · ');
  const col = (label, width = 24, format) => ({ label, width, format });
  const legend = 'JST · ! conflict · U unfilled · D draft · X cancelled · ✓ completed. Times on bars are exact; colored cells round outward to the chosen interval. See Guide and registers.';
  function drawBar(target, row, first, last, item, compact = false) {
    const width = (last - first + 1) * target.getColumn(first).width;
    const narrow = width < 13;
    const id = `${marker(item)}${ref(item.itemKey || item.key)}`;
    const times = `${item.clippedStart ? '← ' : ''}${item.start}–${item.end}${item.clippedEnd ? ' →' : ''}`;
    const label = narrow ? `${id}\n${item.start}\n${item.end}` : `${id}  ${times}\n${short(item.title, compact ? 36 : Math.max(18, Math.min(90, width * 1.8)))}${width > 22 ? `\n${short(item.location, 48)}` : ''}`;
    const cell = band(target, row, first, last, label, { color: barColor(item), strike: item.status === 'cancelled' });
    cell.font.size = 9;
    cell.border = { top: { style: item.kind === 'event' ? 'dashed' : 'thin', color: { argb: C.aqua } }, bottom: { style: 'thin', color: { argb: C.line } }, left: { style: 'thin', color: { argb: C.line } }, right: { style: 'thin', color: { argb: C.line } } };
    return Math.max(70, Math.min(112, linesOf(label, width) * 13 + 12));
  }
  if (report.view === 'volunteer-timeline' || report.view === 'station-timeline') {
    const slots = report.range.slotMinutes;
    const panelMinutes = Math.min(360, (report.paper === 'A3' ? 24 : 16) * slots);
    for (const timeline of report.timelines) {
      let panel = 0;
      for (let from = report.range.startMinute; from < report.range.endMinute; from += panelMinutes) {
        panel++;
        const to = Math.min(from + panelMinutes, report.range.endMinute), count = Math.ceil((to - from) / slots);
        const target = sheet(`${timeline.date} ${panel}`, `${report.title} · ${timeline.date} · ${clock(from)}–${clock(to)}`, [27, 8, ...Array(count).fill(5.4)], legend, report.paper === 'A3' ? 8 : 9);
        headers(target, [report.view === 'station-timeline' ? 'Service station / lane' : 'Volunteer / lane', 'Occupied h', ...Array.from({ length: count }, (_, index) => clock(from + index * slots))]);
        for (let slot = 0; slot < count; slot++) { target.getCell(5, slot + 3).value = (from + slot * slots) / 1440; target.getCell(5, slot + 3).numFmt = 'hh:mm'; target.getCell(5, slot + 3).font.size = 8; }
        target.views = [{ state: 'frozen', xSplit: 2, ySplit: 5, topLeftCell: 'C6', showGridLines: false, zoomScale: 85 }];
        let row = 6;
        for (const person of timeline.rows) {
          // Exact-time lanes may touch inside the same rounded spreadsheet slot.
          // Repack by occupied cells to guarantee no overwritten merged bars.
          const bars = person.lanes.flat().filter(item => item.startMinute < to && item.endMinute > from).map(item => ({ item, first: Math.max(0, Math.floor((item.startMinute - from) / slots)), last: Math.min(count - 1, Math.ceil((item.endMinute - from) / slots) - 1) })).sort((a, b) => a.first - b.first || a.last - b.last || a.item.key.localeCompare(b.item.key));
          const lanes = [];
          for (const bar of bars) { let lane = lanes.find(value => value.at(-1).last < bar.first); if (!lane) { lane = []; lanes.push(lane); } lane.push(bar); }
          if (!lanes.length) lanes.push([]);
          lanes.forEach((lane, laneIndex) => {
            const name = put(target.getCell(row, 1), `${short(person.label, 44)}${laneIndex ? `\nLane ${laneIndex + 1}` : person.detail ? `\n${short(person.detail, 40)}` : ''}`);
            name.fill = fill(laneIndex ? C.white : C.pale); name.font.bold = !laneIndex;
            const hours = put(target.getCell(row, 2), laneIndex === 0 ? person.hours : null); hours.numFmt = '0.00';
            hours.fill = fill(C.white);
            for (let slot = 0; slot < count; slot++) { const cell = put(target.getCell(row, slot + 3), null); cell.fill = fill(slot % 2 ? C.white : 'FFF7FBFD'); cell.border = { left: { style: 'hair', color: { argb: C.line } }, bottom: { style: 'hair', color: { argb: C.line } } }; }
            let height = 72;
            for (const bar of lane) height = Math.max(height, drawBar(target, row, bar.first + 3, bar.last + 3, bar.item));
            if (!lane.length) { band(target, row, 3, count + 2, 'No assignment in this time panel', { color: C.white }); height = 52; }
            target.getRow(row).height = height; row++; rowCount++;
          });
        }
        if (row === 6) { band(target, 6, 1, count + 2, 'No matching people or service stations in this scope.', { color: C.white }); target.getRow(6).height = 40; }
      }
    }
  }
  if (report.view === 'weekly-roster') {
    for (let offset = 0; offset < report.days.length; offset += 7) {
      const days = report.days.slice(offset, offset + 7);
      const target = sheet(`Roster ${offset / 7 + 1}`, `${report.title} · ${days[0]} – ${days.at(-1)}`, [26, 9, ...days.map(() => 18)], 'One activity per continuation lane. Occupied hours count non-cancelled activity time within the selected window, with overlapping time counted once. Totals cover the full selected date range. ' + legend, report.paper === 'A3' ? 8 : 9);
      headers(target, ['Volunteer / lane', 'Occupied h', ...days]);
      days.forEach((day, index) => { target.getCell(5, index + 3).value = dateCell(day); target.getCell(5, index + 3).numFmt = 'ddd\nmm-dd'; });
      target.views = [{ state: 'frozen', xSplit: 2, ySplit: 5, topLeftCell: 'C6', showGridLines: false, zoomScale: 85 }];
      let row = 6;
      for (const person of report.weekly) {
        const cells = days.map(day => person.cells.find(cell => cell.date === day));
        const count = Math.max(1, ...cells.map(cell => cell?.items.length || 0));
        for (let lane = 0; lane < count; lane++) {
          const name = put(target.getCell(row, 1), `${short(person.label, 52)}${lane ? `\nLane ${lane + 1}` : ''}`); name.font.bold = lane === 0; name.fill = fill(C.pale);
          const hours = put(target.getCell(row, 2), lane === 0 ? person.totalHours : null); hours.numFmt = '0.00';
          let height = 70;
          cells.forEach((cell, index) => {
            const item = cell?.items[lane];
            if (item) height = Math.max(height, drawBar(target, row, index + 3, index + 3, item, true));
            else { const empty = put(target.getCell(row, index + 3), lane === 0 ? '—' : null); empty.fill = fill('FFF7FBFD'); empty.border = { bottom: { style: 'hair', color: { argb: C.line } } }; }
          });
          target.getRow(row).height = height; row++; rowCount++;
        }
      }
      if (row === 6) { band(target, 6, 1, days.length + 2, 'No matching volunteers in this scope.', { color: C.white }); target.getRow(6).height = 40; }
    }
  }
  if (report.view === 'event-brief' && report.event) {
    table('Event brief', 'Event brief', [col('Field', 28), col('Detail', 105)], [
      ['Event', report.event.title], ...report.event.metadata.map(value => [value.label, value.value]), ['Description', report.event.description],
    ], 'Event details and associated modules. Long descriptions continue in numbered parts; no narrative text is discarded. ' + report.privacy);
  }
  if (report.view === 'event-agenda') {
    table('Event agenda', report.title, [col('Reference', 12), col('Date', 14, 'yyyy-mm-dd'), col('Time / end date (JST)', 26), col('Event', 36), col('Location', 26), col('Participants', 32), col('Status', 20)], report.items.map(item => [ref(item.key), dateCell(item.date), `${item.start} – ${item.end}${item.endDate !== item.date ? `\nEnds ${item.endDate}` : ''}`, item.title, item.location, item.people.map(person => person.name).join('\n'), status(item)]), 'Date order; multi-day entries keep their exact end date. Participants are planned names, not attendance. Full source IDs and exact typed time cells appear in the Item register.');
  }

  const guidance = [
    ['Purpose', 'A planning snapshot for internal coordination. Scheduled assignments are not actual attendance, eligibility approval or live location.'],
    ['Time zone', 'Asia/Tokyo (JST). Date cells represent the written calendar date; time cells are numeric fractions of one day.'],
    ['Scope', report.subtitle], ['Privacy', report.privacy],
    ['Timeline grid', `${report.range.slotMinutes}-minute cells. Bars occupy every cell touched by an assignment, rounding the start down and end up. This is a visual approximation only; printed labels and the Item register retain exact times. Short bars show a reference and exact start/end; use the registers for complete titles and locations.`],
    ['Panel continuation', 'Daily panels contain up to six hours, fewer on A4 at 15-minute resolution. Assignments crossing a panel boundary appear in both panels with exact segment times. Arrows identify activities continuing beyond the day or selected time window. Occupied hours cover the full selected daily window and repeat across panels; do not add the same row across panels.'],
    ['Collision lanes', 'Items sharing rounded spreadsheet cells are placed on separate continuation lanes. A continuation lane by itself does not imply a real conflict. Only the ! marker and red fill indicate a conflict identified by the report model.'],
    ['Occupied hours', 'Occupied h is the union of non-cancelled activity intervals within the selected time window. Shifts and events both occupy time; overlaps count once. Daily totals cover that day, and weekly totals cover the full selected date range, repeated if the range spans multiple roster sheets. This is not actual service time, attendance or a workload/eligibility approval.'],
    ['Status key', '! = scheduling conflict (red); U = open shift positions (amber); D = draft (gray); X = cancelled (gray, struck through); ✓ = completed (green). Event bars have a dashed top border. Read text as well as color.'],
    ['Text fidelity', 'Bar labels are compact summaries. Registers and detail tables preserve complete text. Part n/m marks continuation rows; concatenate each field in part order without inserting a separator. The first identifying field repeats for orientation.'],
    ['Privacy of downloaded files', 'Exported files may contain volunteer names and any explicitly selected coordination notes/custom fields. Share only with intended recipients. Meeting access credentials and attachment contents are excluded.'],
    ...report.summary.map(value => [value.label, value.value]), ...report.warnings.map((value, index) => [`Review ${index + 1}`, value]),
  ];
  table('Guide', 'Reading this workbook', [col('Topic', 30), col('Explanation', 110)], guidance);
  table('Item register', 'Exact assignment and event register', [col('Reference', 12), col('Source ID', 30), col('Kind', 10), col('Title', 38), col('Start date', 14, 'yyyy-mm-dd'), col('Start JST', 12, 'hh:mm'), col('End date', 14, 'yyyy-mm-dd'), col('End JST', 12, 'hh:mm'), col('Status / review', 23)], report.items.map(item => [ref(item.key), item.id, item.kind, item.title, dateCell(item.date), Number(item.start.slice(0, 2)) / 24 + Number(item.start.slice(3)) / 1440, dateCell(item.endDate), Number(item.end.slice(0, 2)) / 24 + Number(item.end.slice(3)) / 1440, status(item)]), 'Exact source times are typed date/time cells. Multiple-day events retain their full span. Reference IDs connect the visual bars to this register; continuation rows preserve long titles.');
  table('Assignment register', 'People, stations and staffing', [col('Reference', 12), col('Location', 36), col('Volunteer ID', 32), col('Volunteer', 33), col('Required', 12, '0'), col('Open', 12, '0'), col('Conflicts with', 30)], report.items.flatMap(item => (item.people.length ? item.people : [{ id: '', name: item.kind === 'shift' ? 'Unassigned shift' : 'No named participants' }]).map(person => [ref(item.key), item.location, person.id, person.name, item.requiredCount, item.openPlaces, item.conflictWith.map(ref).join('\n')])), 'One row per item/person. Required and Open are item-level counts repeated on each assignment row: do not sum repeated counts. No contact or health details are included.');
  const rowDirectory = new Map();
  for (const timeline of report.timelines) for (const row of timeline.rows) rowDirectory.set(row.id, [row.id, row.label, row.detail]);
  for (const person of report.weekly) if (!rowDirectory.has(person.id)) rowDirectory.set(person.id, [person.id, person.label, 'Volunteer']);
  if (rowDirectory.size) table('Row directory', 'Complete row labels', [col('Row ID', 40), col('Name / station', 60), col('Detail', 55)], [...rowDirectory.values()], 'Complete names and descriptions, including idle rows. Main visual panels may abbreviate long labels for readability.');
  if (report.items.some(item => item.notes)) table('Coordination notes', 'Complete selected coordination notes', [col('Reference', 12), col('Title', 45), col('Notes', 100)], report.items.filter(item => item.notes).map(item => [ref(item.key), item.title, item.notes]), 'Notes were explicitly included in this export. Numbered continuation rows preserve every character; concatenate parts without a separator.');
  for (let i = 0; i < report.tables.length; i++) {
    const source = report.tables[i];
    table(`Detail ${String(i + 1).padStart(2, '0')}`, source.title, source.columns.map(label => col(label, /notes|description|detail|value|agenda/i.test(label) ? 55 : /title|name|participant|location/i.test(label) ? 32 : 23)), source.rows.map(values => values.map((value, column) => source.columns[column] === 'Ref' && typeof value === 'string' ? ref(value) : value)), source.note);
  }

  for (const entry of index) entry.sheet.pageSetup.printArea = `A1:${entry.sheet.getColumn(entry.columns).letter}${entry.sheet.rowCount}`;
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  if (buffer.length > 16 * 1024 * 1024) throw new HttpError(413, 'This visual workbook exceeds 16 MiB. Export a smaller scope.');
  return { buffer, mime: VIEW_EXCEL_MIME, filename: safeFilename(report.view, report.range.dateFrom), sheets: index.map(({ name, title }) => ({ name, title })), rows: rowCount };
}
