// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function importPureClientModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { eventCalendar } = await importPureClientModule('../src/event-calendar.ts');
const { eventConflicts } = await importPureClientModule('../src/event-conflicts.ts');
const event = { id: 'event-test', version: 3, title: 'Orientation', date: '2026-10-08', endDate: '2026-10-09', start: '23:00', end: '01:00', description: '', locationText: '', locationId: '', status: 'confirmed', volunteerIds: ['a'], shiftIds: [], modules: ['meeting'], meeting: { url: 'https://example.org/join', agenda: '' } };

test('event calendars preserve multiday JST instants, status, escaping and UTF-8 line limits', () => {
  const title = '研修, preparation; together\\again\n'.repeat(6);
  const text = eventCalendar([{ ...event, title, status: 'cancelled' }], []);
  const unfolded = text.replace(/\r\n /g, '');
  assert.match(unfolded, /DTSTART:20261008T140000Z/);
  assert.match(unfolded, /DTEND:20261008T160000Z/);
  assert.match(unfolded, /STATUS:CANCELLED/);
  assert.match(unfolded, /SEQUENCE:3/);
  assert.ok(unfolded.includes('研修\\, preparation\\; together\\\\again\\n'));
  assert.ok(!text.includes('\uFFFD'));
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
});

test('participant advisories find multiday overlaps while excluding touching times, cancellations and linked work', () => {
  const shift = (id, date, start, end, other = {}) => ({ id, title: id, date, start, end, status: 'confirmed', volunteerIds: ['a'], ...other });
  const state = {
    volunteers: [{ id: 'a', name: 'Aiko' }],
    shifts: [shift('overlap', '2026-10-09', '00:30', '02:00'), shift('touching', '2026-10-09', '01:00', '02:00'), shift('linked', '2026-10-08', '23:00', '23:30'), shift('cancelled', '2026-10-09', '00:00', '00:30', { status: 'cancelled' }), shift('other-person', '2026-10-09', '00:00', '00:30', { volunteerIds: ['b'] })],
    events: [{ ...event }, { ...event, id: 'other-event', start: '22:00' }, { ...event, id: 'cancelled-event', status: 'cancelled' }],
  };
  const conflicts = eventConflicts({ ...event, shiftIds: ['linked'] }, state);
  assert.deepEqual(conflicts.map(item => item.id), ['other-event', 'overlap']);
  assert.deepEqual(conflicts[0].people, ['Aiko']);
  assert.deepEqual(eventConflicts({ ...event, status: 'cancelled' }, state), []);
  assert.deepEqual(eventConflicts({ ...event, volunteerIds: [] }, state), []);
});
