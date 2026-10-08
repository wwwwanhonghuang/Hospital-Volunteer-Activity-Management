// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A changed screenshot needs a changed URL: README renderers can cache images
// independently of the Markdown. Keep capture-script filenames stable and publish
// byte-identical, content-addressed copies for the four embedded screenshots.
const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const previews = [
  ['Operations overview', '01-overview.png', 'overview'],
  ['Export preview', '12-export-views.png', 'export-views'],
  ['Events and meetings', '08-events.png', 'events'],
  ['Eight-floor hospital model', '04-spatial.png', 'spatial'],
];
const readmePath = resolve(root, 'README.md');
let readme = await readFile(readmePath, 'utf8');
const manifest = [];
if (!check) await mkdir(resolve(root, 'artifacts/previews/readme'), { recursive: true });

for (const [label, filename, slug] of previews) {
  const source = `artifacts/previews/${filename}`;
  const bytes = await readFile(resolve(root, source));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const published = `artifacts/previews/readme/${slug}-${sha256.slice(0, 16)}.png`;
  const pattern = new RegExp(`!\\[${label}\\]\\([^\\r\\n)]+\\)`, 'g');
  assert.equal([...readme.matchAll(pattern)].length, 1, `Expected one README image: ${label}`);
  const markdown = `![${label}](${published})`;
  if (check) {
    assert.ok(readme.includes(markdown), `Refresh the README image URL: ${label}`);
    assert.deepEqual(await readFile(resolve(root, published)), bytes, `Published bytes differ: ${label}`);
  } else {
    await writeFile(resolve(root, published), bytes);
    readme = readme.replace(pattern, markdown);
  }
  manifest.push({ label, source, published, sha256, bytes: bytes.length });
}

const manifestPath = resolve(root, 'artifacts/previews/readme/manifest.json');
if (check) {
  assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), manifest);
} else {
  await writeFile(readmePath, readme);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(`${check ? 'Verified' : 'Published'} ${manifest.length} README screenshots with content-specific URLs.`);
