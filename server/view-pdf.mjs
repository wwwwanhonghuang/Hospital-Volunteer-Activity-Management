// SPDX-License-Identifier: AGPL-3.0-only
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { openSync } from 'fontkit';
import { HttpError } from './validation.mjs';

export const PDF_MIME = 'application/pdf';
const FONT = fileURLToPath(new URL('./fonts/NotoSansJP-Regular.ttf', import.meta.url));
const COVERAGE_FONT = openSync(FONT);
const C = { ink: '#183C4A', muted: '#526E78', aqua: '#007F9D', pale: '#E8F6FA', line: '#CFDFE5', white: '#FFFFFF', shade: '#F5F9FB', danger: '#A73143' };
const STATUSES = { draft: ['#F4EACF', '#715409'], scheduled: ['#DDEFF7', '#185B78'], confirmed: ['#DDEFF7', '#185B78'], active: ['#DDEFF7', '#185B78'], completed: ['#DDF2E7', '#245E43'], cancelled: ['#EEEFF2', '#626D76'] };
const string = value => value === null || value === undefined ? '' : String(value);
const time = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const dateLabel = date => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

/** Measured line breaking is shared by prose, cards and tables. Explicit line
 * breaks, CJK names and unbroken identifiers are preserved; no text is clipped. */
function wrap(doc, value, width, size = 9) {
  doc.font('Body').fontSize(size);
  const result = [];
  for (const paragraph of string(value).replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\t', '    ').split('\n')) {
    if (!paragraph) { result.push(''); continue; }
    let line = '';
    for (const character of paragraph) {
      if (line && doc.widthOfString(line + character) > width) {
        const space = line.lastIndexOf(' ');
        if (space > line.length / 3 && character !== ' ') {
          result.push(line.slice(0, space));
          line = line.slice(space + 1) + character;
        } else { result.push(line); line = character === ' ' ? '' : character; }
      } else line += character;
    }
    if (line) result.push(line);
  }
  return result;
}

function paintLines(doc, lines, x, y, size = 9, leading = 14, color = C.ink) {
  doc.font('Body').fontSize(size).fillColor(color);
  for (const [index, line] of lines.entries()) if (line) doc.text(line, x, y + index * leading, { lineBreak: false });
}

function ellipsis(doc, value, width, size) {
  const full = string(value);
  doc.font('Body').fontSize(size);
  if (doc.widthOfString(full) <= width) return full;
  let result = '';
  for (const character of full) {
    if (doc.widthOfString(result + character + '…') > width) break;
    result += character;
  }
  return result ? `${result}…` : '';
}

class Pages {
  constructor(doc, report) {
    this.doc = doc; this.report = report; this.margin = 36; this.y = 0; this.pageCount = 0;
    this.landscape = ['volunteer-timeline', 'station-timeline', 'weekly-roster'].includes(report.view);
    this.size = report.paper || 'A4';
  }
  page(section = '', continued = false) {
    if (++this.pageCount > 240) throw new HttpError(413, 'PDF exceeds 240 pages. Choose a smaller export scope. No document was downloaded.');
    const doc = this.doc;
    doc.addPage({ size: this.size, layout: this.landscape ? 'landscape' : 'portrait', margins: { top: 36, left: 36, right: 36, bottom: 36 } });
    this.width = doc.page.width - 72; this.bottom = doc.page.height - 48;
    doc.rect(0, 0, doc.page.width, 6).fill(C.aqua);
    paintLines(doc, ['守織 SHUORI'], 36, 19, 13, 17, C.aqua);
    const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(this.report.generatedAt));
    paintLines(doc, [`${stamp} · ${this.report.timezone || 'Asia/Tokyo'}`], 36, 41, 7.5, 11, C.muted);
    paintLines(doc, [this.report.mode === 'demo' ? 'DEMONSTRATION DATA' : 'OPERATIONS COPY'], doc.page.width - 195, 23, 8, 11, C.muted);
    const title = wrap(doc, this.report.title || 'Volunteer operations', this.width, 20);
    paintLines(doc, title, 36, 63, 20, 27);
    this.y = 66 + title.length * 27;
    if (section) {
      const lines = wrap(doc, `${section}${continued ? ' · continued' : ''}`, this.width, 10);
      paintLines(doc, lines, 36, this.y, 10, 15, C.aqua); this.y += lines.length * 15 + 8;
    }
    doc.moveTo(36, this.y).lineTo(doc.page.width - 36, this.y).lineWidth(0.7).stroke(C.line);
    this.y += 12;
    this.section = section;
    if (this.pageCount === 1 || !continued) doc.outline.addItem(section || this.report.title || 'Report');
  }
  ensure(height, section = this.section) { if (this.y + height > this.bottom) this.page(section, true); }
  prose(value, { size = 9, color = C.ink, gap = 9 } = {}) {
    const lines = wrap(this.doc, value, this.width, size), leading = size + 5;
    while (lines.length) {
      this.ensure(leading);
      const count = Math.max(1, Math.floor((this.bottom - this.y) / leading));
      const part = lines.splice(0, count);
      paintLines(this.doc, part, 36, this.y, size, leading, color); this.y += part.length * leading;
    }
    this.y += gap;
  }
  heading(value) {
    const lines = wrap(this.doc, value, this.width - 18, 11);
    this.ensure(lines.length * 16 + 40);
    const h = lines.length * 16 + 12;
    this.doc.roundedRect(36, this.y, this.width, h, 4).fill(C.pale);
    paintLines(this.doc, lines, 45, this.y + 6, 11, 16, C.aqua); this.y += h + 10;
  }
  table(columns, rows, { size = 8, leading = 12, empty = 'No records in this scope.' } = {}) {
    const widths = columns.map(column => column.width * this.width), left = 36, padding = 7;
    const headings = columns.map((column, index) => wrap(this.doc, column.label, widths[index] - padding * 2, size));
    const headerHeight = Math.max(...headings.map(lines => lines.length)) * leading + padding * 2;
    const header = () => {
      this.doc.rect(left, this.y, this.width, headerHeight).fill(C.aqua);
      let x = left;
      headings.forEach((lines, index) => { paintLines(this.doc, lines, x + padding, this.y + padding, size, leading, C.white); x += widths[index]; });
      this.y += headerHeight;
    };
    this.ensure(headerHeight + leading + padding * 2); header();
    if (!rows.length) { this.prose(empty); return; }
    for (const [rowIndex, row] of rows.entries()) {
      const lines = columns.map((column, index) => wrap(this.doc, typeof column.value === 'function' ? column.value(row) : row[column.key], widths[index] - padding * 2, size));
      let offset = 0, total = Math.max(...lines.map(value => value.length), 1);
      const fullHeight = total * leading + padding * 2;
      if (fullHeight <= this.bottom - 145 - headerHeight && this.y + fullHeight > this.bottom) { this.page(this.section, true); header(); }
      while (offset < total) {
        if (this.y + leading + padding * 2 > this.bottom) {
          this.page(this.section, true); header();
          if (offset) { paintLines(this.doc, [`Record ${rowIndex + 1} · continued`], left + padding, this.y + 4, 7, 10, C.muted); this.y += 17; }
        }
        const count = Math.min(total - offset, Math.max(1, Math.floor((this.bottom - this.y - padding * 2) / leading)));
        const height = count * leading + padding * 2;
        this.doc.rect(left, this.y, this.width, height).fill(rowIndex % 2 ? C.white : C.shade);
        let x = left;
        lines.forEach((part, index) => {
          paintLines(this.doc, part.slice(offset, offset + count), x + padding, this.y + padding, size, leading);
          if (index) this.doc.moveTo(x, this.y).lineTo(x, this.y + height).lineWidth(0.4).stroke(C.line);
          x += widths[index];
        });
        this.doc.moveTo(left, this.y + height).lineTo(left + this.width, this.y + height).lineWidth(0.4).stroke(C.line);
        this.y += height; offset += count;
      }
    }
    this.y += 12;
  }
  finish() {
    const doc = this.doc, range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      doc.switchToPage(index);
      const y = doc.page.height - 30;
      doc.moveTo(36, y - 8).lineTo(doc.page.width - 36, y - 8).lineWidth(0.6).stroke(C.line);
      paintLines(doc, ['SHUORI · Independent volunteer coordination · Internal planning copy'], 36, y, 7, 10, C.muted);
      const text = `${index + 1} / ${range.count}`;
      doc.font('Body').fontSize(8);
      paintLines(doc, [text], doc.page.width - 36 - doc.widthOfString(text), y, 8, 11, C.muted);
    }
  }
}

function legend(pages) {
  pages.prose('Draft: amber  ·  Confirmed / active: blue  ·  Completed: green  ·  Cancelled: grey  ·  Conflict: red outline', { size: 8, color: C.muted, gap: 5 });
}

function coverContext(pages, report, compact = false) {
  if (!compact) pages.prose(report.subtitle, { size: 9, color: C.muted });
  if (report.summary.length) {
    pages.prose(report.summary.map(entry => `${entry.label}: ${entry.value}`).join('  ·  '), { size: 9, color: C.aqua, gap: compact ? 4 : 9 });
  }
  pages.prose(report.privacy, { size: 8, color: C.muted, gap: compact ? 4 : 9 });
}

function timeline(pages, report) {
  const doc = pages.doc, range = report.range, stationView = report.view === 'station-timeline';
  const labelWidth = pages.size === 'A3' ? 166 : 142;
  for (const day of report.timelines) {
    for (let start = range.startMinute; start < range.endMinute; start += 360) {
      const end = Math.min(start + 360, range.endMinute);
      const section = `${dateLabel(day.date)} · ${time(start)}–${time(end)} · ${stationView ? 'Station coverage' : 'Volunteer assignments'}`;
      pages.page(section);
      if (pages.pageCount === 1) coverContext(pages, report, true);
      legend(pages);
      pages.prose('Exact minute positions; six-hour panels. Activity references resolve to full details in the register. Continuation arrows mark work extending beyond this panel.', { size: 8, color: C.muted, gap: 8 });
      const gridX = 36 + labelWidth, gridWidth = pages.width - labelWidth, unit = gridWidth / (end - start);
      const header = () => {
        pages.ensure(47); const y = pages.y;
        doc.rect(36, y, pages.width, 30).fill(C.aqua);
        paintLines(doc, [stationView ? 'Station / coverage lanes' : 'Volunteer / duty lanes'], 43, y + 8, 8, 12, C.white);
        const points = [start];
        for (let value = Math.ceil(start / 60) * 60; value < end; value += 60) if (value > start) points.push(value);
        if ((end - points.at(-1)) * unit > 33) points.push(end);
        let lastRight = -Infinity;
        for (const value of points) {
          doc.font('Body').fontSize(7.5); const width = doc.widthOfString(time(value));
          const x = Math.min(gridX + gridWidth - width - 4, Math.max(gridX + 4, gridX + (value - start) * unit - width / 2));
          if (x > lastRight + 4) { paintLines(doc, [time(value)], x, y + 9, 7.5, 10, C.white); lastRight = x + width; }
        }
        pages.y += 30;
      };
      header();
      if (!day.rows.length) pages.prose('No assignments in this scope.');
      for (const [index, row] of day.rows.entries()) {
        const allLabelLines = wrap(doc, row.label, labelWidth - 14, 8);
        const labelLines = allLabelLines.length <= 4 ? allLabelLines : [...allLabelLines.slice(0, 3), '… full label in register'];
        const allDetailLines = wrap(doc, row.detail || `${row.hours} scheduled hours`, labelWidth - 14, 7);
        const detailLines = allDetailLines.slice(0, 3);
        const minHeight = Math.max(39, labelLines.length * 12 + detailLines.length * 10 + 17), laneHeight = 38;
        // Empty panel lanes are collapsed while all overlaps remain separate.
        const visibleLanes = row.lanes.map(lane => lane.filter(bar => bar.startMinute < end && bar.endMinute > start)).filter(lane => lane.length);
        const lanes = visibleLanes.length ? visibleLanes : [[]];
        let laneStart = 0;
        do {
          if (pages.y + Math.max(laneHeight + 8, minHeight) > pages.bottom) { pages.page(section, true); legend(pages); header(); }
          const fits = Math.max(1, Math.floor((pages.bottom - pages.y - 8) / laneHeight));
          const laneCount = Math.min(lanes.length - laneStart, fits), height = Math.max(minHeight, laneCount * laneHeight + 8), y = pages.y;
          doc.rect(36, y, pages.width, height).fill(index % 2 ? C.white : C.shade);
          paintLines(doc, labelLines, 43, y + 7, 8, 12);
          paintLines(doc, detailLines, 43, y + 9 + labelLines.length * 12, 7, 10, C.muted);
          if (laneStart) paintLines(doc, ['(continued)'], 43, y + height - 12, 6.5, 9, C.muted);
          for (let minute = start; minute <= end; minute += range.slotMinutes) {
            const x = gridX + (minute - start) * unit;
            doc.moveTo(x, y).lineTo(x, y + height).lineWidth(minute % 60 ? 0.25 : 0.6).stroke(C.line);
          }
          for (let lane = laneStart; lane < laneStart + laneCount; lane++) for (const bar of lanes[lane]) {
            if (bar.startMinute >= end || bar.endMinute <= start) continue;
            const x = gridX + (Math.max(start, bar.startMinute) - start) * unit + 1;
            const width = Math.max(0.6, (Math.min(end, bar.endMinute) - Math.max(start, bar.startMinute)) * unit - 2);
            const barY = y + 5 + (lane - laneStart) * laneHeight;
            const [fill, ink] = STATUSES[bar.status] || STATUSES.confirmed;
            doc.roundedRect(x, barY, width, 30, Math.min(3, width / 2)).fill(fill);
            if (bar.conflict) doc.roundedRect(x, barY, width, 30, Math.min(3, width / 2)).lineWidth(1.3).stroke(C.danger);
            if (width > 12) {
              const prefix = `${bar.clippedStart || bar.startMinute < start ? '‹ ' : ''}${bar.itemKey}${bar.clippedEnd || bar.endMinute > end ? ' ›' : ''}`;
              const first = ellipsis(doc, `${prefix}  ${bar.title}`, width - 8, 7.5);
              const second = ellipsis(doc, `${bar.start}–${bar.end} · ${stationView ? `${bar.people.length} assigned${bar.openPlaces ? ` / ${bar.openPlaces} open` : ''}` : bar.location}`, width - 8, 6.5);
              paintLines(doc, [first], x + 4, barY + 3, 7.5, 10, ink);
              paintLines(doc, [second], x + 4, barY + 17, 6.5, 9, ink);
            }
          }
          doc.moveTo(36, y + height).lineTo(36 + pages.width, y + height).lineWidth(0.5).stroke(C.line);
          pages.y += height; laneStart += laneCount;
        } while (laneStart < lanes.length);
      }
    }
  }
}

function weekly(pages, report) {
  for (let offset = 0; offset < report.days.length; offset += 7) {
    const days = report.days.slice(offset, offset + 7);
    pages.page(`${dateLabel(days[0])} – ${dateLabel(days.at(-1))}`);
    if (pages.pageCount === 1) coverContext(pages, report, true);
    pages.prose('A person-by-day roster with exact times and statuses. Short activity labels resolve to complete titles and locations in the register. Conflict flags identify assignments requiring review.', { size: 8, color: C.muted });
    pages.table([
      { label: 'Volunteer / hours', width: 0.18, value: row => `${row.label}\n${row.totalHours}h in selected range` },
      ...days.map(date => ({ label: dateLabel(date).replace(/ \d{4}$/, ''), width: 0.82 / days.length, value: row => {
        const cell = row.cells.find(value => value.date === date);
        return cell?.items.length ? cell.items.map(item => `${item.start}–${item.end}\n${ellipsis(pages.doc, `${item.itemKey} · ${item.title}`, pages.width * 0.82 / days.length - 14, 7.5)}\n${item.status}${item.conflict ? '\nCONFLICT' : ''}`).join('\n\n') : '—';
      } })),
    ], report.weekly, { size: 7.5, leading: 11.5 });
  }
}

function tableWidths(table) {
  // The title, description and people columns receive room in proportion to
  // real content, while dates, flags and references remain compact.
  const lengths = table.columns.map((label, index) => {
    const values = table.rows.slice(0, 100).map(row => Math.min(90, string(row[index]).length));
    return Math.max(label.length, values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  });
  const weights = lengths.map(length => Math.min(3.4, Math.max(1, Math.sqrt(length / 8))));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(weight => weight / total);
}

function reportTables(pages, report) {
  for (const [tableIndex, table] of report.tables.entries()) {
    if (!table.columns.length) continue;
    pages.section = table.title;
    const newRegisterPage = !tableIndex && ['volunteer-timeline', 'station-timeline', 'weekly-roster'].includes(report.view);
    if (newRegisterPage) pages.page(table.title);
    if (table.rows.length <= 6 && table.columns.length <= (pages.landscape ? 7 : 5)) {
      const widths = tableWidths(table);
      const rowHeight = row => Math.max(...row.map((value, index) => wrap(pages.doc, value, pages.width * widths[index] - 14, 8).length)) * 12 + 14;
      const estimate = 46 + rowHeight(table.columns) + table.rows.reduce((sum, row) => sum + rowHeight(row), 0)
        + (table.note ? wrap(pages.doc, table.note, pages.width, 8).length * 13 + 9 : 0);
      if (estimate < 320) pages.ensure(estimate, table.title);
    }
    if (!newRegisterPage) pages.heading(table.title);
    if (table.note) pages.prose(table.note, { size: 8, color: C.muted });
    if (!pages.landscape && table.title === 'Activity register' && table.columns.length === 6) {
      pages.table([
        { label: 'Reference / time', width: 0.25, value: row => `${row[0]}\n${row[2]}` },
        { label: 'Activity / location', width: 0.48, value: row => `${row[1]}\n${row[3]}` },
        { label: 'Status / staffing', width: 0.27, value: row => `${row[4]}\n${row[5]}` },
      ], table.rows);
      continue;
    }
    // Very wide registers are printed as readable record cards in portrait;
    // landscape sheets can hold up to seven data columns without tiny type.
    if (table.columns.length > (pages.landscape ? 7 : 5)) {
      for (const [index, row] of table.rows.entries()) {
        pages.heading(`${table.title} · ${index + 1} of ${table.rows.length}`);
        pages.table([{ label: 'Field', key: 'label', width: 0.24 }, { label: 'Value', key: 'value', width: 0.76 }], table.columns.map((label, column) => ({ label, value: row[column] })));
      }
      if (!table.rows.length) pages.prose('No records in this scope.');
    } else {
      const widths = tableWidths(table);
      pages.table(table.columns.map((label, index) => ({ label, width: widths[index], value: row => row[index] })), table.rows);
    }
  }
}

function eventBrief(pages, report) {
  pages.page('Event operations brief');
  coverContext(pages, report);
  const event = report.event;
  if (!event) { pages.prose('The selected event is unavailable.'); return; }
  pages.heading(event.title);
  pages.table([{ label: 'Field', key: 'label', width: 0.27 }, { label: 'Detail', key: 'value', width: 0.73 }], event.metadata);
  if (event.description) { pages.heading('Purpose / description'); pages.prose(event.description); }
}

/** Receives an explicitly minimised operational view model, never raw workspace
 * state. Embedded Noto Sans JP keeps Japanese names selectable and searchable. */
export async function buildViewPdf(report) {
  const characters = new Set();
  const collect = value => {
    if (typeof value === 'string') { for (const character of value) characters.add(character.codePointAt(0)); }
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect({ title: report.title, subtitle: report.subtitle, privacy: report.privacy, summary: report.summary, warnings: report.warnings,
    people: report.people, items: report.items, timelines: report.timelines, weekly: report.weekly, event: report.event, tables: report.tables });
  const missing = [...characters].filter(code => ![9, 10, 13].includes(code) && !COVERAGE_FONT.hasGlyphForCodePoint(code));
  if (missing.length) throw new HttpError(422, `The PDF font cannot represent ${missing.slice(0, 8).map(code => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}${missing.length > 8 ? ' and other characters' : ''}. Export Excel to preserve the original text, or use characters supported by Noto Sans JP. No text was silently substituted.`);
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, compress: true, pdfVersion: '1.7', info: { Title: `SHUORI · ${report.title}`, Author: '守織 SHUORI', Subject: 'Volunteer operations · internal planning copy', Creator: 'SHUORI', CreationDate: new Date(report.generatedAt), ModDate: new Date(report.generatedAt) } });
  doc.registerFont('Body', FONT);
  const chunks = [];
  const output = new Promise((resolve, reject) => { doc.on('data', chunk => chunks.push(chunk)); doc.once('end', () => resolve(Buffer.concat(chunks))); doc.once('error', reject); });
  try {
    const pages = new Pages(doc, report);
    if (['volunteer-timeline', 'station-timeline'].includes(report.view)) timeline(pages, report);
    else if (report.view === 'weekly-roster') weekly(pages, report);
    else if (report.view === 'event-brief') eventBrief(pages, report);
    else {
      pages.page('Chronological event agenda');
      coverContext(pages, report);
      if (!report.tables.length) pages.prose('No events in this scope.');
    }
    if (!pages.pageCount) { pages.page(); coverContext(pages, report); pages.prose('No records in this scope.'); }
    if (report.warnings.length) {
      pages.heading('Review before distribution');
      for (const warning of report.warnings) pages.prose(warning, { size: 8, color: C.danger });
    }
    reportTables(pages, report);
    pages.finish(); doc.end();
    const buffer = await output;
    if (buffer.length > 16 * 1024 * 1024) throw new HttpError(413, 'PDF exceeds 16 MiB. Choose a smaller export scope.');
    return { buffer, mime: PDF_MIME, filename: `shuori-${report.view}-${report.range.dateFrom}.pdf`, pages: pages.pageCount };
  } catch (error) { doc.destroy(); throw error; }
}
