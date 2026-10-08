// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { buildViewPdf, PDF_MIME } from '../server/view-pdf.mjs';

// Read the PDF's actual content and Unicode CMap streams without relying on a
// renderer implementation or an operating-system PDF installation.
function inspectPdf(buffer) {
  const text = buffer.toString('latin1'), streams = [];
  for (const match of text.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const streamAt = match[2].indexOf('stream\n');
    if (streamAt < 0) continue;
    const data = match[2].slice(streamAt + 7, match[2].lastIndexOf('\nendstream'));
    const bytes = Buffer.from(data, 'latin1');
    streams.push(/\/FlateDecode/.test(match[2].slice(0, streamAt)) ? inflateSync(bytes).toString('latin1') : data);
  }
  const cmap = new Map();
  for (const stream of streams.filter(value => value.includes('begincmap'))) {
    for (const block of stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const match of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
      cmap.set(match[1].toLowerCase(), String.fromCharCode(...match[2].match(/.{4}/g).map(value => parseInt(value, 16))));
    }
    for (const block of stream.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const match of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*\[([^\]]+)\]/gi)) {
      let code = parseInt(match[1], 16);
      for (const value of match[3].matchAll(/<([\da-f\s]+)>/gi)) cmap.set((code++).toString(16).padStart(4, '0'), String.fromCharCode(...value[1].replaceAll(/\s/g, '').match(/.{4}/g).map(part => parseInt(part, 16))));
    }
  }
  const contents = streams.filter(value => value.includes('BT'));
  const extracted = contents.map(stream => [...stream.matchAll(/<([\da-f]+)>/gi)].map(match => (match[1].match(/.{4}/g) || []).map(code => cmap.get(code.toLowerCase()) || '').join('')).join('')).join('\n');
  return { text, extracted, contents, pageCount: [...text.matchAll(/\/Type \/Page\b/g)].length };
}

function sample(view = 'volunteer-timeline') {
  const bar = { key: 'S001-2026-10-08', itemKey: 'S001', title: '図書館の活動', kind: 'shift', status: 'confirmed', date: '2026-10-08', start: '09:00', end: '15:30', startMinute: 540, endMinute: 930, clippedStart: false, clippedEnd: false, location: 'Library', people: ['守織 太郎'], conflict: true, openPlaces: 1 };
  return {
    schemaVersion: 1, view, title: 'Volunteer timeline', subtitle: 'Selected duties and scheduled events', generatedAt: '2026-10-08T00:30:00.000Z', timezone: 'Asia/Tokyo', mode: 'demo', paper: 'A4',
    range: { dateFrom: '2026-10-08', dateTo: '2026-10-08', timeFrom: '08:00', timeTo: '20:00', startMinute: 480, endMinute: 1200, slotMinutes: 30 }, request: { view },
    privacy: 'Volunteer names only. Contact and health fields are excluded.', summary: [{ label: 'Activities', value: '1' }], legend: [], warnings: ['Review overlapping assignments.'], days: ['2026-10-08'], people: [{ id: 'v1', name: '守織 太郎' }],
    items: [{ key: 'S001', id: 'shift-1', kind: 'shift', title: bar.title, date: bar.date, endDate: bar.date, start: bar.start, end: bar.end, status: bar.status, location: bar.location, people: [{ id: 'v1', name: '守織 太郎' }], notes: '', requiredCount: 2, openPlaces: 1, conflict: true, conflictWith: ['E001'] }],
    timelines: [{ date: bar.date, rows: [{ id: 'v1', label: '守織 太郎', detail: '1 activity', lanes: [[bar]], hours: 6.5 }] }],
    weekly: [{ id: 'v1', label: '守織 太郎', totalHours: 6.5, cells: [{ date: bar.date, hours: 6.5, items: [bar] }] }],
    event: { title: '図書館の活動', description: '日本語の活動説明。', metadata: [{ label: 'Coordinator', value: '守織 太郎' }] },
    tables: [{ title: 'Activity register', columns: ['Reference', 'Activity', 'Volunteer'], rows: [['S001', bar.title, '守織 太郎']] }],
  };
}

test('PDF timelines embed searchable Japanese, exact-time panels and complete numbered pages', async () => {
  const result = await buildViewPdf(sample()), pdf = inspectPdf(result.buffer);
  assert.equal(result.mime, PDF_MIME); assert.equal(result.filename, 'shuori-volunteer-timeline-2026-10-08.pdf');
  assert.equal(result.buffer.subarray(0, 8).toString(), '%PDF-1.7');
  assert.match(pdf.text, /\/FontFile2\b/); assert.match(pdf.text, /\/ToUnicode\b/);
  assert.match(pdf.extracted, /守織 太郎/); assert.match(pdf.extracted, /図書館の活動/);
  assert.match(pdf.extracted, /08:00–14:00/); assert.match(pdf.extracted, /14:00–20:00/);
  assert.match(pdf.extracted, /2026-10-08 09:30/); // UTC source timestamp is displayed in Tokyo.
  assert.equal(result.pages, pdf.pageCount); assert.ok(result.pages >= 3);
  for (let page = 1; page <= result.pages; page++) assert.ok(pdf.extracted.includes(`${page} / ${result.pages}`));
  assert.match(pdf.extracted, /Review overlapping assignments/);
});

test('All five PDF views produce actual vector documents with their complete register', async () => {
  for (const view of ['volunteer-timeline', 'station-timeline', 'weekly-roster', 'event-brief', 'event-agenda']) {
    const result = await buildViewPdf(sample(view)), pdf = inspectPdf(result.buffer);
    assert.ok(result.buffer.length > 5000); assert.equal(result.pages, pdf.pageCount);
    assert.match(pdf.extracted, /S001/); assert.match(pdf.extracted, /図書館の活動/);
    assert.ok(!pdf.text.includes('/Subtype /Image'), 'Operational export is selectable vector text, not a screenshot');
  }
});

test('PDF prose and a single long table cell paginate without dropping terminal text', async () => {
  const report = sample('event-brief');
  report.event.description = 'Long preparation paragraph with measured wrapping. '.repeat(350) + 'PROSE-END-日本語';
  report.tables = [{ title: 'Preparation notes', columns: ['Record', 'Full note'], rows: [['Row 1', 'A long unbroken identifier must retain every character. '.repeat(420) + 'TABLE-END-守織']] }];
  const result = await buildViewPdf(report), pdf = inspectPdf(result.buffer);
  assert.ok(result.pages > 6); assert.equal(result.pages, pdf.pageCount);
  assert.match(pdf.extracted, /PROSE-END-日本語/); assert.match(pdf.extracted, /TABLE-END-守織/);
  assert.ok((pdf.extracted.match(/Full note/g) || []).length > 1, 'Column headers repeat on continuation pages');
  assert.ok((pdf.extracted.match(/SHUORI · Independent volunteer coordination/g) || []).length === result.pages);
});

test('A3 export uses real A3 landscape page dimensions, and an empty scope still has a readable PDF', async () => {
  const report = sample(); report.paper = 'A3'; report.timelines = []; report.tables = []; report.warnings = [];
  const result = await buildViewPdf(report), pdf = inspectPdf(result.buffer);
  assert.equal(result.pages, 1); assert.match(pdf.text, /\/MediaBox \[0 0 1190\.55 841\.89\]/);
  assert.match(pdf.extracted, /No records in this scope/);
});

test('PDF rejects unsupported glyphs instead of substituting invisible boxes or dropping characters', async () => {
  for (const value of ['Volunteer 😀', 'متطوع', 'Variant \uFE0F']) {
    const report = sample('event-brief'); report.event.title = value;
    await assert.rejects(buildViewPdf(report), error => error.status === 422 && /U\+[0-9A-F]+/.test(error.message) && /Export Excel/.test(error.message));
  }
  const report = sample('event-brief'); report.event.description = '説明\t準備\n守織';
  const pdf = inspectPdf((await buildViewPdf(report)).buffer);
  assert.match(pdf.extracted, /説明\s+準備/);
});

test('A long station label stays inside the timeline and is retained in full in the register', async () => {
  const report = sample('station-timeline'), label = 'Long station description '.repeat(130) + 'STATION-END-守織';
  report.timelines[0].rows[0].label = label;
  report.tables = [{ title: 'Activity register', columns: ['Reference', 'Location'], rows: [['S001', label]] }];
  const result = await buildViewPdf(report), pdf = inspectPdf(result.buffer);
  assert.match(pdf.extracted, /full label in register/); assert.match(pdf.extracted, /STATION-END-守織/);
  for (const stream of pdf.contents) for (const match of stream.matchAll(/1 0 0 1 [\d.]+ ([-\d.]+) Tm/g)) {
    assert.ok(Number(match[1]) > 0 && Number(match[1]) < 595.29, 'Every text anchor stays on the landscape page');
  }
});
