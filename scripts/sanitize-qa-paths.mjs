// SPDX-License-Identifier: AGPL-3.0-only
// Keep published QA evidence portable without altering recorded checksums or source URLs.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const checkOnly = process.argv.includes('--check');
const workspace = resolve('.');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const prefix = workspace.split(/[\\/]/).map(escape).join('[\\\\/]');
const absoluteWorkspace = new RegExp(`${prefix}(?=[\\\\/]|$)`, 'gi');
const changed = [];
let replacements = 0;

function sanitize(value) {
  if (typeof value === 'string') return value.replace(absoluteWorkspace, () => { replacements += 1; return '.'; });
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  return value;
}

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'reference-local' || entry.name === 'release-check' || entry.name === 'node_modules') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) { await visit(path); continue; }
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const raw = await readFile(path, 'utf8');
    const before = replacements;
    const result = sanitize(JSON.parse(raw.replace(/^\uFEFF/, '')));
    if (before === replacements) continue;
    changed.push(relative(workspace, path).replaceAll('\\', '/'));
    if (!checkOnly) await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
  }
}

await visit(resolve('artifacts'));
console.log(JSON.stringify({ mode: checkOnly ? 'check' : 'sanitize', replacements, files: changed }, null, 2));
if (checkOnly && changed.length) process.exitCode = 1;
