// SPDX-License-Identifier: AGPL-3.0-only
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Run against a built application with a disposable/demo workspace.
const baseURL = process.env.SPATIAL_BASE_URL || 'http://127.0.0.1:3001';
const floorIds = ['B3', 'B1', '1F', '2F', '3F', '4F', '6F', '7F'];
await fs.mkdir('artifacts/models', { recursive: true });
await fs.mkdir('artifacts/previews', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];

function parseGLB(raw) {
  assert.equal(raw.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(raw.readUInt32LE(4), 2, 'GLB version');
  assert.equal(raw.readUInt32LE(8), raw.length, 'GLB file length');
  assert.equal(raw.readUInt32LE(16), 0x4e4f534a, 'GLB first chunk is JSON');
  return JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString());
}

async function enterWorkspace(page) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/#/spatial`);
  const demo = page.getByRole('button', { name: 'Explore demo workspace' });
  const heading = page.getByRole('heading', { name: 'Hospital in perspective.' });
  await demo.or(heading).first().waitFor();
  if (await demo.isVisible()) await demo.click();
  await heading.waitFor();
}

async function downloadGLB(page, destination) {
  const download = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: 'Download 3D model (GLB)', exact: true }).click();
  await (await download).saveAs(destination);
  const raw = await fs.readFile(destination);
  return { raw, json: parseGLB(raw) };
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(20000);
  await enterWorkspace(page);
  await expect.poll(async () => {
    const text = await page.locator('.studio-viewport-tools').textContent();
    return Number(text.match(/(\d+) objects/)?.[1] || 0);
  }, { timeout: 30000 }).toBeGreaterThanOrEqual(590);
  const { raw, json } = await downloadGLB(page, 'artifacts/models/hospital-public-floors.glb');
  // Every registered object has a floor. Only actual floor roots also carry a
  // guide source and geometry disclaimer, so extras.floor alone over-counts.
  const floors = json.nodes.filter(node => node.extras?.floor && node.extras?.source && node.extras?.geometry);
  assert.deepEqual(floors.map(node => node.extras.floor).sort(), [...floorIds].sort());
  assert.ok(json.nodes.some(node => node.extras?.disclaimer), 'Source disclaimer survives export');
  const registeredNodes = json.nodes.filter(node => node.extras?.spatialId);
  assert.ok(registeredNodes.length >= 590, 'All original independently selectable assemblies are exported');
  assert.equal(new Set(registeredNodes.map(node => node.extras.spatialId)).size, registeredNodes.length, 'Exported spatial identifiers are unique');
  const catalogNodes = registeredNodes.filter(node => node.extras.assetKind);
  const catalogKinds = [...new Set(catalogNodes.map(node => node.extras.assetKind))].sort();
  assert.equal(catalogKinds.length, 15, 'All detailed asset kinds appear in the complete model');
  const detailedComponents = catalogNodes.reduce((sum, node) => sum + node.extras.componentCount, 0);
  assert.ok(detailedComponents >= 10000, 'Detailed component manifests survive export');
  assert.ok(catalogNodes.every(node => node.extras.componentNames.length === node.extras.componentCount));
  assert.ok(json.meshes.some(mesh => mesh.primitives.some(primitive => primitive.attributes.COLOR_0 !== undefined)), 'Batched assets preserve their finish colors');

  const imageDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save view as PNG', exact: true }).click();
  await (await imageDownload).saveAs('artifacts/previews/hospital-building-render.png');
  await page.screenshot({ path: 'artifacts/previews/spatial-building-desktop.png', fullPage: true });
  await page.getByRole('slider', { name: 'Floor separation' }).fill('14');
  await expect(page.locator('.spatial-model-settings output')).toHaveText('14');
  await page.getByRole('button', { name: 'Hide facade', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show facade', exact: true })).toHaveAttribute('aria-pressed', 'false');

  const floorTabs = page.getByRole('group', { name: 'Choose hospital floor' });
  const studioTabs = page.getByRole('group', { name: 'Spatial studio panels' });
  const floorsVisited = [];
  for (const floor of floorIds) {
    await floorTabs.getByRole('button', { name: floor, exact: true }).click();
    await expect(page.locator('.scene-stage canvas')).toHaveCount(1);
    await expect(floorTabs.getByRole('button', { name: floor, exact: true })).toHaveAttribute('aria-pressed', 'true');
    floorsVisited.push(floor);
  }
  await floorTabs.getByRole('button', { name: '1F', exact: true }).click();
  await page.getByRole('button', { name: 'Assignment density', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Assignment density', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Simulation time', exact: true }).inputValue())).toBeGreaterThan(600);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Simulation time', exact: true })).toHaveValue('600');
  await studioTabs.getByRole('button', { name: 'Guide', exact: true }).click();
  await page.getByRole('slider', { name: 'Simulation time', exact: true }).fill('1080');
  await expect(page.locator('.spatial-floor-stats')).toHaveText(/^0\/0/);
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await page.screenshot({ path: 'artifacts/previews/spatial-floor1-desktop.png', fullPage: true });

  // Add a detailed instance in an unsaved study, prove that it is in the exported
  // floor, then remove it. The original complete-building artifact stays clean.
  await studioTabs.getByRole('button', { name: 'Assets', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Asset library' }).locator('.studio-asset-card')).toHaveCount(15);
  await page.getByRole('button', { name: 'Add Wheelchair', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Object inspector', exact: true });
  await expect(inspector.getByRole('heading', { name: 'Wheelchair', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Focus selected object', exact: true }).click();
  await page.screenshot({ path: 'artifacts/previews/spatial-studio-object-closeup.png', fullPage: true });
  const addedExport = await downloadGLB(page, 'artifacts/models/hospital-spatial-study-example.glb');
  const addedNodes = addedExport.json.nodes.filter(node => node.extras?.spatialId?.startsWith('added-'));
  assert.equal(addedNodes.length, 1, 'Scenario-added object is exported exactly once');
  assert.equal(addedNodes[0].extras.assetKind, 'wheelchair');
  assert.equal(addedNodes[0].extras.componentCount, 44, 'Added wheelchairs retain the same detailed construction as source instances');
  assert.ok(addedExport.json.nodes.some(node => node.extras?.spatialId === '1F:room:first-visit-information'), 'Original source geometry remains alongside additions');
  await inspector.getByRole('button', { name: 'Remove added object', exact: true }).click();

  await page.getByRole('button', { name: 'Show 2D plan', exact: true }).click();
  await expect(page.locator('.scene-fallback')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show 3D model', exact: true }).click();
  await expect(page.locator('.scene-stage canvas')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await floorTabs.getByRole('button', { name: 'Building', exact: true }).click();
  await expect(page.locator('.scene-stage canvas')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/previews/spatial-building-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'No mobile horizontal overflow');

  const fallback = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
      return original.call(this, kind, ...args);
    };
  });
  await enterWorkspace(fallback);
  await fallback.locator('.scene-floor-fallback').waitFor();
  await fallback.getByRole('group', { name: 'Choose hospital floor' }).getByRole('button', { name: '1F', exact: true }).click();
  await fallback.locator('.scene-fallback').waitFor();
  await expect(fallback.locator('.scene-stage canvas')).toHaveCount(0);
  await fallback.screenshot({ path: 'artifacts/previews/spatial-webgl-fallback.png', fullPage: true });
  const report = {
    checkedAt: new Date().toISOString(),
    scope: 'Built application, original geometry, and one unsaved detailed scenario addition',
    errors,
    model: {
      file: 'artifacts/models/hospital-public-floors.glb', bytes: raw.length,
      gltfVersion: json.asset.version, floors: floors.map(node => node.extras.floor),
      registeredObjects: registeredNodes.length, detailedComponents, catalogKinds,
      meshes: json.meshes.length, nodes: json.nodes.length, sourceMetadataPresent: true,
    },
    scenarioExport: { file: 'artifacts/models/hospital-spatial-study-example.glb', bytes: addedExport.raw.length, addedObjects: addedNodes.length, detailPreserved: true },
    verified: [
      'All 8 floor selectors', 'GLB 2.0 structure and exactly 8 source floor roots',
      '590 original object identifiers', 'Detailed component manifests and vertex colors',
      'PNG download', 'Floor separation', 'Facade visibility', 'Assignment density',
      'Time playback and reset', 'Guide tab shift counts after end of day',
      '15-kind asset palette', 'Added asset focus and detailed GLB export',
      '2D toggle and 3D restoration', 'Mobile no horizontal overflow', 'Automatic WebGL failure fallback',
    ],
    floorsVisited, mobileHorizontalOverflow: overflow,
  };
  await fs.writeFile('artifacts/spatial-validation.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(errors.length, 0, 'No browser runtime errors');
} finally {
  await browser.close();
}
