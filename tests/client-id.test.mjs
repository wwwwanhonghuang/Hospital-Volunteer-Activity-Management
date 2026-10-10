// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createClientId } from '../shared/client-id.mjs';

test('client IDs use the native API when available', () => {
  assert.equal(createClientId({ randomUUID() { return 'native-id'; } }), 'native-id');
});
test('HTTP-compatible IDs encode the UUID v4 version and variant', () => {
  assert.equal(createClientId({ getRandomValues(bytes) { return bytes.fill(255); } }), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(createClientId({ getRandomValues(bytes) { return bytes.fill(0); } }), '00000000-0000-4000-8000-000000000000');
});
test('HTTP-compatible IDs retain independent cryptographic entropy', () => {
  const provider = { getRandomValues: bytes => webcrypto.getRandomValues(bytes) };
  const ids = Array.from({ length: 1000 }, () => createClientId(provider));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('missing randomness never falls back to predictable identifiers', () => {
  assert.throws(() => createClientId({}), /secure random values/);
});
