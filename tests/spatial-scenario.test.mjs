// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createApp } from '../server/app.mjs';
import { seedState } from '../server/seed.mjs';
import { parseEntity, validateDelete } from '../server/validation.mjs';
import { validateScenario, SPATIAL_FLOORS, SPATIAL_ASSET_KINDS, SCENARIO_LIMITS } from '../shared/spatial-scenario.mjs';

const transform = { x: 2, y: 0, z: -3, rotation: Math.PI / 2, hidden: false };
const fixture = () => ({
  name: 'Welcome desk rehearsal', description: 'Compare a revised visitor waiting area.',
  objects: { '1F:chair:1': { ...transform } },
  additions: [{ id: 'added-chair-1', kind: 'chair', floor: '1F', name: 'Accessible waiting seat', x: 4, y: 0, z: 6, rotation: 0 }],
  routes: [],
});
const route = () => ({ id: 'route-1', volunteerId: 'vol-1', shiftId: 'shift-1', floor: '1F', points: [{ x: -10, z: 8 }, { x: 0, z: 5 }] });
const state = () => ({ volunteers: [{ id: 'vol-1', status: 'archived' }], shifts: [{ id: 'shift-1', volunteerIds: ['vol-1'], locationId: 'entrance', status: 'completed' }], locations: [{ id: 'entrance', floor: '1F' }] });

test('scenario transforms retain exact bounds and all supported asset kinds and floors', () => {
  const value = fixture();
  value.objects.boundaries = { x: -45, y: 6, z: 22, rotation: -2 * Math.PI, hidden: true };
  value.additions = SPATIAL_ASSET_KINDS.map((kind, index) => ({ ...value.additions[0], id: `added-${index}`, kind, floor: SPATIAL_FLOORS[index % SPATIAL_FLOORS.length] }));
  assert.equal(validateScenario(value).valid, true);
  const parsed = parseEntity('scenarios', { ...value, id: 'scenario-1', version: 1 });
  assert.deepEqual(parsed.objects.boundaries, value.objects.boundaries);
  assert.equal(parsed.additions.length, SPATIAL_ASSET_KINDS.length);
});

test('scenario validation rejects malformed geometry, unsafe keys and unsupported levels', () => {
  for (const patch of [{ x: 45.01 }, { x: -45.01 }, { y: -0.1 }, { y: 6.1 }, { z: 22.1 }, { rotation: 7 }, { x: Infinity }, { z: NaN }, { hidden: 'false' }]) {
    assert.equal(validateScenario({ ...fixture(), objects: { chair: { ...transform, ...patch } } }).valid, false, JSON.stringify(patch));
  }
  for (const unsafeId of ['__proto__', 'prototype', 'constructor', 'space name', 'a'.repeat(161)]) {
    const objects = JSON.parse(`{${JSON.stringify(unsafeId)}:${JSON.stringify(transform)}}`);
    assert.equal(validateScenario({ ...fixture(), objects }).valid, false, unsafeId);
    assert.throws(() => parseEntity('scenarios', { ...fixture(), objects }), /identifier/);
  }
  for (const patch of [{ floor: '5F' }, { kind: 'unknown' }, { id: 'constructor' }, { name: '' }]) {
    assert.equal(validateScenario({ ...fixture(), additions: [{ ...fixture().additions[0], ...patch }] }).valid, false);
  }
  assert.equal(validateScenario({ ...fixture(), objects: [] }).valid, false);
  assert.equal({}.polluted, undefined);
});

test('scenario capacity bounds apply to overrides, additions, routes and waypoints', () => {
  const value = fixture();
  const objects = Object.fromEntries(Array.from({ length: SCENARIO_LIMITS.objects + 1 }, (_, index) => [`object-${index}`, transform]));
  assert.equal(validateScenario({ ...value, objects }).valid, false);
  assert.equal(validateScenario({ ...value, additions: Array.from({ length: SCENARIO_LIMITS.additions + 1 }, (_, index) => ({ ...value.additions[0], id: `added-${index}` })) }).valid, false);
  assert.equal(validateScenario({ ...value, routes: Array.from({ length: SCENARIO_LIMITS.routes + 1 }, (_, index) => ({ ...route(), id: `route-${index}`, shiftId: `shift-${index}` })) }).valid, false);
  for (const count of [1, 51]) assert.equal(validateScenario({ ...value, routes: [{ ...route(), points: Array.from({ length: count }, (_, index) => ({ x: index % 40, z: 1 })) }] }).valid, false);
  assert.equal(validateScenario({ ...value, name: 'x'.repeat(161) }).valid, false);
  assert.equal(validateScenario({ ...value, description: 'x'.repeat(4001) }).valid, false);
});

test('rehearsal routes require unique assignments and valid same-floor operational references', () => {
  const value = { ...fixture(), routes: [route()] };
  assert.deepEqual(validateScenario(value, state()), { valid: true, errors: [] }, 'Archived volunteers and completed shifts remain available for historical rehearsal');
  for (const patch of [{ volunteerId: 'missing' }, { shiftId: 'missing' }, { floor: '6F' }, { points: [{ x: 0, z: 0 }, { x: 0, z: 0 }] }]) assert.equal(validateScenario({ ...value, routes: [{ ...route(), ...patch }] }, state()).valid, false);
  assert.match(validateScenario({ ...value, routes: [route(), { ...route(), id: 'route-2' }] }, state()).errors.join(' '), /one rehearsal route/);
  assert.match(validateScenario({ ...value, routes: [route(), { ...route(), shiftId: 'shift-2' }] }).errors.join(' '), /identifier/);
  assert.match(validateScenario({ ...value, additions: [value.additions[0], value.additions[0]] }).errors.join(' '), /identifier/);
  const unassigned = state(); unassigned.shifts[0].volunteerIds = [];
  assert.match(validateScenario(value, unassigned).errors.join(' '), /assigned/);
  const withScenario = { ...state(), records: [], projects: [], tasks: [], scenarios: [value] };
  assert.throws(() => validateDelete(withScenario, 'volunteers', 'vol-1'), /rehearsal routes/);
  assert.throws(() => validateDelete(withScenario, 'shifts', 'shift-1'), /rehearsal routes/);
});

async function runServer(options = {}) {
  const app = createApp({ dbPath: ':memory:', mode: 'demo', demoDate: '2026-10-08', ...options });
  const server = await new Promise(resolve => { const result = app.listen(0, '127.0.0.1', () => resolve(result)); });
  return { app, url: `http://127.0.0.1:${server.address().port}`, async close() { await new Promise(resolve => server.close(resolve)); app.locals.close(); } };
}
async function client(server, username = 'admin', password) {
  const login = await fetch(`${server.url}/api/${password ? 'login' : 'demo-login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(login.status, 200);
  const session = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0];
  return async (path, { method = 'GET', body, csrf = true } = {}) => {
    const response = await fetch(`${server.url}/api${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': session.csrfToken } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  };
}
function temporaryDirectory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'komorebi-spatial-'));
  t.after(() => { const target = resolve(dir); assert.ok(target.startsWith(resolve(tmpdir()) + sep)); rmSync(target, { recursive: true, force: true }); });
  return dir;
}

test('scenario CRUD enforces roles, CSRF and optimistic concurrency without changing the roster', async t => {
  const server = await runServer(); t.after(() => server.close());
  const admin = await client(server), coordinator = await client(server, 'coordinator'), viewer = await client(server, 'viewer');
  const before = (await admin('/state')).data;
  assert.deepEqual(before.scenarios, []);
  assert.equal((await viewer('/scenarios', { method: 'POST', body: fixture() })).status, 403);
  assert.equal((await admin('/scenarios', { method: 'POST', body: fixture(), csrf: false })).status, 403);
  const created = await coordinator('/scenarios', { method: 'POST', body: fixture() });
  assert.equal(created.status, 201); assert.equal(created.data.version, 1);
  assert.equal((await viewer('/state')).data.scenarios[0].id, created.data.id);
  assert.equal((await viewer(`/scenarios/${created.data.id}`, { method: 'PUT', body: { version: 1, name: 'Forbidden' } })).status, 403);
  const updated = await coordinator(`/scenarios/${created.data.id}`, { method: 'PUT', body: { version: 1, name: 'Revised rehearsal' } });
  assert.equal(updated.status, 200); assert.equal(updated.data.version, 2);
  const auditCount = (await admin('/state')).data.audit.length;
  assert.equal((await admin(`/scenarios/${created.data.id}`, { method: 'PUT', body: { version: 1, name: 'Stale update' } })).status, 409);
  assert.equal((await admin(`/scenarios/${created.data.id}`, { method: 'DELETE', body: { version: 1 } })).status, 409);
  assert.equal((await admin('/state')).data.audit.length, auditCount);
  const exported = await admin('/export/scenarios.csv');
  assert.equal(exported.status, 200); assert.match(exported.data, /Accessible waiting seat/); assert.doesNotMatch(exported.data, /\[object Object\]/);
  const backup = await admin('/backup'); assert.deepEqual(backup.data.state.scenarios, [updated.data]);
  const after = (await admin('/state')).data;
  assert.deepEqual(after.shifts, before.shifts); assert.deepEqual(after.volunteers, before.volunteers);
  assert.ok(after.audit.some(entry => entry.entity === 'scenarios' && entry.action === 'update'));
  assert.equal((await admin(`/scenarios/${created.data.id}`, { method: 'DELETE', body: { version: 2 } })).status, 200);
  assert.deepEqual((await admin('/state')).data.scenarios, []);
});

test('linked rehearsal routes block destructive assignment changes and schedule batches atomically', async t => {
  const server = await runServer(); t.after(() => server.close()); const admin = await client(server);
  const original = (await admin('/state')).data;
  const shift = original.shifts.find(item => item.date === '2026-10-08' && item.volunteerIds.length);
  const floor = original.locations.find(location => location.id === shift.locationId).floor;
  const linkedRoute = { ...route(), volunteerId: shift.volunteerIds[0], shiftId: shift.id, floor };
  const created = await admin('/scenarios', { method: 'POST', body: { ...fixture(), routes: [linkedRoute] } });
  assert.equal(created.status, 201);
  const invalid = await admin('/scenarios', { method: 'POST', body: { ...fixture(), routes: [{ ...linkedRoute, floor: '7F' }] } });
  assert.equal(invalid.status, 400); assert.match(invalid.data.error, /floor/);
  assert.equal((await admin(`/shifts/${shift.id}`, { method: 'DELETE', body: { version: shift.version } })).status, 409);
  const removed = await admin(`/shifts/${shift.id}`, { method: 'PUT', body: { version: shift.version, volunteerIds: [] } });
  assert.equal(removed.status, 409); assert.match(removed.data.error, /scenario/);
  const other = original.shifts.find(item => item.id !== shift.id && item.date === '2026-10-08');
  const scheduled = await admin('/schedule/apply', { method: 'POST', body: { changes: [other, shift].map(value => ({ id: value.id, version: value.version, volunteerIds: [] })) } });
  assert.equal(scheduled.status, 409);
  assert.deepEqual((await admin('/state')).data.shifts, original.shifts);
  assert.equal((await admin(`/scenarios/${created.data.id}`, { method: 'PUT', body: { version: 1, routes: [] } })).status, 200);
  assert.equal((await admin(`/shifts/${shift.id}`, { method: 'PUT', body: { version: shift.version, volunteerIds: [] } })).status, 200);
});

test('large bounded scenarios are accepted and over-limit JSON is rejected', async t => {
  const server = await runServer(); t.after(() => server.close()); const admin = await client(server);
  const value = { ...fixture(), objects: Object.fromEntries(Array.from({ length: SCENARIO_LIMITS.objects }, (_, index) => [`object-${index}-${'x'.repeat(90)}`, transform])) };
  assert.ok(Buffer.byteLength(JSON.stringify(value)) > 256 * 1024);
  const created = await admin('/scenarios', { method: 'POST', body: value });
  assert.equal(created.status, 201); assert.equal(Object.keys(created.data.objects).length, 2000);
  const oversized = await admin('/scenarios', { method: 'POST', body: { ...fixture(), description: 'x'.repeat(1024 * 1024) } });
  assert.equal(oversized.status, 413); assert.equal(oversized.data.error, 'Request is too large.');
});

test('scenario data survives SQLite restart and a validated backup restore', async t => {
  const dir = temporaryDirectory(t), source = join(dir, 'source.sqlite'), target = join(dir, 'target.sqlite'), snapshot = join(dir, 'backup.json');
  let server = await runServer({ mode: 'production', dbPath: source, adminPassword: 'Source-Password123!', secureCookies: false });
  t.after(async () => { if (server) await server.close(); });
  const admin = await client(server, 'admin', 'Source-Password123!');
  assert.deepEqual((await admin('/state')).data.scenarios, []);
  const created = await admin('/scenarios', { method: 'POST', body: fixture() }); assert.equal(created.status, 201);
  await server.close(); server = undefined;
  server = await runServer({ mode: 'production', dbPath: source, secureCookies: false });
  assert.deepEqual(server.app.locals.getState().scenarios, [created.data]);
  await server.close(); server = undefined;
  const exported = spawnSync(process.execPath, ['scripts/backup.mjs', snapshot], { encoding: 'utf8', env: { ...process.env, APP_MODE: 'production', DATABASE_PATH: source } });
  assert.equal(exported.status, 0, exported.stderr);
  const restored = spawnSync(process.execPath, ['scripts/backup.mjs', '--restore', snapshot], { encoding: 'utf8', env: { ...process.env, APP_MODE: 'production', DATABASE_PATH: target, ADMIN_PASSWORD: 'Restore-Password123!' } });
  assert.equal(restored.status, 0, restored.stderr);
  const restoredApp = createApp({ mode: 'production', dbPath: target });
  try { assert.deepEqual(restoredApp.locals.getState().scenarios, [created.data]); } finally { restoredApp.locals.close(); }
  const linkedBackup = JSON.parse(readFileSync(snapshot, 'utf8'));
  const sample = seedState('2026-10-08');
  linkedBackup.state.volunteers = [{ ...sample.volunteers[0], id: 'vol-1', status: 'archived' }];
  // Current demo profiles contain custom values; their definitions are part of
  // the corresponding backup, just as linked shift and volunteer IDs are.
  linkedBackup.state.fieldDefinitions = sample.fieldDefinitions.filter(field => field.scope === 'volunteers');
  linkedBackup.state.shifts = [{ ...sample.shifts[0], id: 'shift-1', date: '2000-01-03', status: 'completed', volunteerIds: ['vol-1'], projectId: '', locationId: 'entrance' }];
  linkedBackup.state.scenarios[0].routes = [route()];
  const linkedFile = join(dir, 'linked.json'), linkedTarget = join(dir, 'linked.sqlite'); writeFileSync(linkedFile, JSON.stringify(linkedBackup));
  const linkedRestore = spawnSync(process.execPath, ['scripts/backup.mjs', '--restore', linkedFile], { encoding: 'utf8', env: { ...process.env, APP_MODE: 'production', DATABASE_PATH: linkedTarget, ADMIN_PASSWORD: 'Linked-Password123!' } });
  assert.equal(linkedRestore.status, 0, linkedRestore.stderr);
  const linkedApp = createApp({ mode: 'production', dbPath: linkedTarget });
  try { assert.deepEqual(linkedApp.locals.getState().scenarios[0].routes, [route()]); } finally { linkedApp.locals.close(); }
  linkedBackup.state.scenarios[0].routes[0].volunteerId = 'missing-volunteer';
  const invalidFile = join(dir, 'invalid.json'), invalidTarget = join(dir, 'invalid.sqlite'); writeFileSync(invalidFile, JSON.stringify(linkedBackup));
  const invalidRestore = spawnSync(process.execPath, ['scripts/backup.mjs', '--restore', invalidFile], { encoding: 'utf8', env: { ...process.env, APP_MODE: 'production', DATABASE_PATH: invalidTarget, ADMIN_PASSWORD: 'Invalid-Password123!' } });
  assert.notEqual(invalidRestore.status, 0); assert.match(invalidRestore.stderr, /rehearsal routes/);
  const invalidApp = createApp({ mode: 'production', dbPath: invalidTarget });
  try { assert.deepEqual(invalidApp.locals.getState().scenarios, []); assert.deepEqual(invalidApp.locals.getState().volunteers, []); } finally { invalidApp.locals.close(); }
  const oldBackup = JSON.parse(readFileSync(snapshot, 'utf8'));
  assert.equal(oldBackup.format, 'shuori-backup');
  oldBackup.format = 'komorebi-backup';
  oldBackup.state.projects = [sample.projects[0]];
  delete oldBackup.state.scenarios;
  const legacy = join(dir, 'legacy.json'), legacyTarget = join(dir, 'legacy.sqlite'); writeFileSync(legacy, JSON.stringify(oldBackup));
  const legacyRestore = spawnSync(process.execPath, ['scripts/backup.mjs', '--restore', legacy], { encoding: 'utf8', env: { ...process.env, APP_MODE: 'production', DATABASE_PATH: legacyTarget, ADMIN_PASSWORD: 'Legacy-Password123!' } });
  assert.equal(legacyRestore.status, 0, legacyRestore.stderr);
  const legacyApp = createApp({ mode: 'production', dbPath: legacyTarget });
  try {
    assert.deepEqual(legacyApp.locals.getState().scenarios, []);
    assert.deepEqual(legacyApp.locals.getState().projects, oldBackup.state.projects, 'Legacy format restores original IDs and content while missing scenarios default to an empty collection');
  } finally { legacyApp.locals.close(); }
});
