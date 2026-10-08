// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildViewReport, parseViewRequest } from '../shared/export-views.mjs';
import { seedState, emptyState } from '../server/seed.mjs';
import { createApp } from '../server/app.mjs';

const date = '2026-10-08', now = new Date(`${date}T01:00:00Z`);
const report = (state, request = {}) => buildViewReport(state, { view: 'volunteer-timeline', dateFrom: date, dateTo: date, ...request }, { now, mode: 'demo' });
function fixture() {
  const state = seedState(date); state.events = []; state.shifts = [];
  return state;
}
function shift(state, id, from, to, people = ['vol-1'], extra = {}) {
  const value = { id, title: `Activity ${id}`, date, start: from, end: to, locationId: 'entrance', volunteerIds: people, requiredCount: 2, status: 'confirmed', notes: '', requiredSkills: [], version: 1, ...extra };
  state.shifts.push(value); return value;
}

test('view requests reject malformed dates, oversized ranges, empty statuses and incompatible selectors', () => {
  for (const input of [
    { view: 'other' }, { view: 'volunteer-timeline', dateFrom: '2026-02-30' },
    { view: 'weekly-roster', dateFrom: date, dateTo: '2026-11-08' },
    { view: 'weekly-roster', dateFrom: date, dateTo: '2026-10-07' },
    { view: 'event-agenda', statuses: [] }, { view: 'event-agenda', statuses: ['draft', 'draft'] },
    { view: 'station-timeline', timeFrom: '18:00', timeTo: '08:00' },
    { view: 'station-timeline', timeFrom: '24:00' }, { view: 'station-timeline', eventIds: ['x'] },
    { view: 'event-brief' }, { view: 'event-brief', eventId: 'x', volunteerIds: [] },
    { view: 'event-agenda', volunteerIds: ['x', 'x'] }, { view: 'event-agenda', includeContacts: true },
  ]) assert.throws(() => parseViewRequest(input), error => error.status === 400);
  assert.equal(parseViewRequest({ view: 'weekly-roster', timeFrom: '00:00', timeTo: '24:00' }).timeTo, '24:00');
});

test('timeline retains exact off-grid times, overlap lanes, reference keys and staffing gaps without mutating state', () => {
  const state = fixture(); shift(state, 'a', '09:07', '10:17'); shift(state, 'b', '10:00', '11:00'); shift(state, 'c', '11:00', '12:00');
  const before = JSON.stringify(state), result = report(state), person = result.timelines[0].rows.find(row => row.id === 'vol-1');
  assert.equal(person.lanes.length, 2); assert.equal(person.lanes[0][0].startMinute, 547);
  assert.equal(person.lanes[0][0].start, '09:07'); assert.equal(result.items.filter(item => item.conflict).length, 2);
  assert.equal(result.items.find(item => item.id === 'c').conflict, false, 'touching endpoints do not overlap');
  assert.equal(person.hours, 2.88, 'occupied hours count a union of intervals');
  assert.equal(result.timelines[0].rows.find(row => row.id === '_open').lanes.flat().length, 3);
  assert.equal(result.items.reduce((sum, item) => sum + item.openPlaces, 0), 3);
  assert.equal(JSON.stringify(state), before);
});

test('cancelled bookings remain printable on explicit request but do not count hours, gaps or conflicts', () => {
  const state = fixture(); shift(state, 'active', '09:00', '10:00'); shift(state, 'cancelled', '09:00', '13:00', ['vol-1'], { status: 'cancelled' });
  assert.equal(report(state).items.length, 1);
  const result = report(state, { statuses: ['confirmed', 'cancelled'] });
  assert.equal(result.items.length, 2); assert.equal(result.items[1].openPlaces, 0);
  assert.ok(result.items.every(item => !item.conflict));
  assert.equal(result.timelines[0].rows.find(row => row.id === 'vol-1').hours, 1);
});

test('linked events avoid duplicate conflict flags and weekly occupied hours count each minute once', () => {
  const state = fixture(); shift(state, 'linked', '09:00', '11:00');
  const event = seedState(date).events[0]; Object.assign(event, { date, endDate: date, start: '09:30', end: '10:30', volunteerIds: ['vol-1'], shiftIds: ['linked'] }); state.events = [event];
  const result = report(state, { view: 'weekly-roster' });
  assert.ok(result.items.every(item => !item.conflict));
  assert.equal(result.weekly.find(row => row.id === 'vol-1').totalHours, 2);
  event.shiftIds = []; assert.equal(report(state).items.filter(item => item.conflict).length, 2);
});

test('multi-day and overnight events split at midnight; exact full intervals survive a clipped view', () => {
  const state = fixture(), event = seedState(date).events[0];
  Object.assign(event, { date, endDate: '2026-10-10', start: '23:45', end: '00:00', volunteerIds: ['vol-1'], shiftIds: [] }); state.events = [event];
  const allDay = report(state, { dateTo: '2026-10-10', timeFrom: '00:00', timeTo: '24:00' });
  assert.equal(allDay.timelines[0].rows[0].lanes[0][0].startMinute, 1425);
  assert.equal(allDay.timelines[1].rows[0].lanes[0][0].endMinute, 1440);
  assert.equal(allDay.timelines[2].rows.length, 0, 'end at midnight has no phantom next-day block');
  const clipped = report(state, { dateTo: '2026-10-10' });
  assert.equal(clipped.timelines[0].rows.length, 0);
  assert.equal(clipped.items[0].start, '23:45'); assert.equal(clipped.items[0].endDate, '2026-10-10');
  assert.match(clipped.warnings.join(' '), /1 fall outside/);
});

test('exact empty selections stay empty; missing IDs fail; station identity and unbooked rows remain distinct', () => {
  const state = fixture(); shift(state, 'a', '09:00', '10:00');
  state.locations.push({ ...state.locations[0], id: 'same-name', name: state.locations[0].name });
  shift(state, 'b', '11:00', '12:00', ['vol-2'], { locationId: 'same-name' });
  assert.equal(report(state, { volunteerIds: [] }).items.length, 0);
  assert.equal(report(state, { locationIds: [] }).items.length, 0);
  assert.throws(() => report(state, { volunteerIds: ['missing'] }), error => error.status === 400);
  const station = report(state, { view: 'station-timeline', includeIdle: true });
  assert.equal(station.timelines[0].rows.length, state.locations.length);
  assert.equal(station.timelines[0].rows.filter(row => row.label === state.locations[0].name).length, 2);
  const idle = report(state, { includeIdle: true }); assert.ok(idle.timelines[0].rows.some(row => !row.lanes.length));
});

test('event brief preserves modules, zero and false values while excluding contacts and access secrets', () => {
  const state = seedState(date), event = state.events[0];
  event.meeting.url = 'https://example.invalid/join?pwd=SECRET_URL'; event.meeting.passcode = 'SECRET_PASSCODE'; event.meeting.meetingId = 'SECRET_MEETING';
  state.volunteers.forEach(person => { person.phone = 'SECRET_PHONE'; person.emergencyContact = { name: 'SECRET_EMERGENCY' }; person.healthDueDate = '2099-01-01'; });
  event.customFields = { zero: 0, false: false, note: 'PRIVATE_CUSTOM' };
  event.modules.push('attendance'); event.attendance = [{ volunteerId: event.volunteerIds[0], status: 'confirmed', notes: 'OPTIONAL_NOTE' }];
  const minimal = report(state, { view: 'event-brief', eventId: event.id, statuses: ['cancelled'], dateFrom: '2025-01-01' });
  assert.equal(minimal.event.title, event.title); assert.equal(minimal.range.dateFrom, event.date);
  const first = JSON.stringify(minimal); for (const secret of ['SECRET_', '2099-01-01', 'PRIVATE_CUSTOM', 'OPTIONAL_NOTE']) assert.ok(!first.includes(secret));
  const detailed = report(state, { view: 'event-brief', eventId: event.id, includeCustomFields: true, includeNotes: true });
  assert.ok(detailed.tables.find(table => table.title === 'Additional event fields').rows.some(row => row[1] === 0));
  assert.ok(detailed.tables.find(table => table.title === 'Additional event fields').rows.some(row => row[1] === false));
  assert.ok(JSON.stringify(detailed).includes('OPTIONAL_NOTE')); assert.ok(!JSON.stringify(detailed).includes('SECRET_'));
});

test('empty reports are explicit and oversized output is rejected rather than dropped', () => {
  const empty = report(emptyState()); assert.equal(empty.items.length, 0); assert.match(empty.warnings.join(' '), /No saved activities/);
  const state = fixture(); for (let i = 0; i < 501; i++) shift(state, String(i), '09:00', '10:00', []);
  assert.throws(() => report(state), error => error.status === 413);
  state.shifts.length = 1; state.shifts[0].notes = 'x'.repeat(600001);
  assert.throws(() => report(state, { includeNotes: true }), error => error.status === 413);
});

test('agenda auto-range follows filtered events and includes evening times without a hidden chart window', () => {
  const state = seedState(date), event = state.events[0];
  Object.assign(event, { status: 'confirmed', start: '22:00', end: '23:30' });
  state.events.push({ ...event, id: 'old-cancelled', date: '2025-01-01', endDate: '2025-01-01', status: 'cancelled' });
  const result = buildViewReport(state, { view: 'event-agenda', statuses: ['confirmed'] }, { now });
  assert.equal(result.range.dateFrom, date); assert.equal(result.items.length, 1);
  assert.equal(result.range.endMinute, 1440); assert.doesNotMatch(result.subtitle, /08:00/);
  assert.ok(!result.warnings.some(value => value.includes('outside')));
});

test('view endpoints enforce sessions, CSRF and origin, allow viewer downloads and leave records unchanged', async t => {
  const app = createApp({ dbPath: ':memory:', mode: 'demo', demoDate: date });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); app.locals.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = { view: 'volunteer-timeline', dateFrom: date, dateTo: date };
  const post = (path, data, headers = {}) => fetch(`${base}/api/export/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  assert.equal((await post('view-preview', body)).status, 401);
  const login = await fetch(`${base}/api/demo-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'viewer' }) });
  const session = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0], headers = { Cookie: cookie, 'X-CSRF-Token': session.csrfToken };
  const before = JSON.stringify(app.locals.getState());
  assert.equal((await post('view-preview', body, { Cookie: cookie })).status, 403);
  assert.equal((await post('view', { ...body, format: 'pdf' }, { ...headers, Origin: 'https://outside.invalid' })).status, 403);
  const preview = await post('view-preview', body, headers); assert.equal(preview.status, 200); assert.match(preview.headers.get('cache-control'), /no-store/); assert.equal((await preview.json()).view, body.view);
  for (const format of ['pdf', 'xlsx']) {
    const response = await post('view', { ...body, format }, headers); assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length > 1000);
    assert.equal(bytes.subarray(0, format === 'pdf' ? 5 : 2).toString(), format === 'pdf' ? '%PDF-' : 'PK');
    assert.match(response.headers.get('content-disposition'), new RegExp(`\\.${format}"$`));
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await post('view', { ...body, format: 'csv' }, headers)).status, 400);
  assert.equal((await post('view-preview', { ...body, includeContacts: true }, headers)).status, 400);
  assert.equal(JSON.stringify(app.locals.getState()), before);
});
