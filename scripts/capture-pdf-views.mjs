// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, writeFile } from 'node:fs/promises';
import { buildViewReport } from '../shared/export-views.mjs';
import { buildViewPdf } from '../server/view-pdf.mjs';
import { seedState } from '../server/seed.mjs';

const state = seedState('2026-10-08'), now = new Date('2026-10-08T01:02:03.000Z');
const scopes = [
  { view: 'volunteer-timeline', dateFrom: '2026-10-08', dateTo: '2026-10-08' },
  { view: 'station-timeline', dateFrom: '2026-10-08', dateTo: '2026-10-08' },
  { view: 'weekly-roster', dateFrom: '2026-10-05', dateTo: '2026-10-11' },
  { view: 'event-brief', eventId: 'event-briefing' },
  { view: 'event-agenda', dateFrom: '2026-10-08', dateTo: '2026-10-14' },
];
await mkdir('artifacts/exports', { recursive: true });
for (const scope of scopes) {
  const request = { ...scope, paper: 'A4', timeFrom: '08:00', timeTo: '18:00', slotMinutes: 30 };
  const report = buildViewReport(state, request, { now, mode: 'demo' });
  const result = await buildViewPdf(report), file = `artifacts/exports/shuori-demo-${scope.view}.pdf`;
  await writeFile(file, result.buffer);
  console.log(`${file}: ${result.pages} pages, ${result.buffer.length} bytes`);
}
if (process.argv.includes('--stress')) {
  const report = buildViewReport(state, { view: 'event-brief', eventId: 'event-briefing', includeNotes: true }, { now, mode: 'demo' });
  report.event.title = '守織 太郎 · Long-text pagination review';
  report.event.description = '日本語の活動説明。 Preserve complete preparation notes and instructions. '.repeat(100) + 'PROSE-END-守織';
  report.tables.push({ title: 'Long preparation notes', columns: ['Record', 'Full note'], rows: [
    ['QA note', 'A long unbroken identifier and full details must remain readable. '.repeat(180) + 'TABLE-END-日本語'],
  ] });
  const result = await buildViewPdf(report);
  await mkdir('data', { recursive: true });
  await writeFile('data/pdf-pagination-review.pdf', result.buffer);
  console.log(`data/pdf-pagination-review.pdf: ${result.pages} pages`);
}
