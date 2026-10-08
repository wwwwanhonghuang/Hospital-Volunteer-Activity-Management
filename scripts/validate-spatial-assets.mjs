// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

// Transpile these pure model modules in memory. No browser, temporary files,
// bundler child processes, network requests or application server are required.
const root = new URL('../', import.meta.url);
async function moduleURL(path, replacements = {}) {
  let source = await fs.readFile(new URL(path, root), 'utf8');
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`'${from}'`, `'${to}'`);
  const result = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error).length || 0, 0, `Transpile ${path}`);
  return `data:text/javascript;base64,${Buffer.from(result.outputText).toString('base64')}`;
}

// Browser content is emitted as independent JSON resources. The pure Node audit
// maps the same URLs to local JSON without a server or network dependency.
const localContentLoader = `data:text/javascript;base64,${Buffer.from(`import fs from 'node:fs/promises'; export async function loadSpatialContent(url) { return JSON.parse(await fs.readFile(new URL(url), 'utf8')); }`).toString('base64')}`;
const contentURL = path => `data:text/javascript;base64,${Buffer.from(`export default ${JSON.stringify(new URL(path, root).href)};`).toString('base64')}`;
const contentImports = {
  './loadSpatialContent': localContentLoader,
  '../../content/spatial/catalog.json?url': contentURL('content/spatial/catalog.json'),
  '../../content/spatial/assets.json?url': contentURL('content/spatial/assets.json'),
  '../../content/spatial/building.json?url': contentURL('content/spatial/building.json'),
};
const typesURL = await moduleURL('src/components/spatialTypes.ts', contentImports);
const assetsURL = await moduleURL('src/components/spatialAssets.ts', {
  ...contentImports,
  three: import.meta.resolve('three'),
  './spatialTypes': typesURL,
  'three/addons/utils/BufferGeometryUtils.js': import.meta.resolve('three/addons/utils/BufferGeometryUtils.js'),
});
const modelURL = await moduleURL('src/components/hospitalModel.ts', {
  ...contentImports,
  three: import.meta.resolve('three'), './spatialTypes': typesURL, './spatialAssets': assetsURL,
});
const { ASSET_CATALOG } = await import(typesURL);
const { createSpatialAsset, createVolunteerFigure } = await import(assetsURL);
const { buildFullHospital, HOSPITAL_FLOORS } = await import(modelURL);
const model = buildFullHospital('all');
const geometries = new Set();
const materials = new Set();
let meshes = 0, triangles = 0, modeledAssetComponents = 0;
model.root.traverse(object => {
  if (!object.isMesh) return;
  meshes++;
  geometries.add(object.geometry.uuid);
  materials.add(object.material.uuid);
  triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
});
assert.ok(model.objects.size >= 590, 'Detailed assembly registry');
assert.ok(meshes <= 3500, 'Complete-building mesh budget');
assert.ok(triangles <= 500000, 'Complete-building triangle budget');
const categories = {}, floors = {};
for (const [id, { object, info }] of model.objects) {
  assert.match(id, /^[A-Za-z0-9:_.-]{1,160}$/, `Backend-compatible ID: ${id}`);
  assert.equal(object.userData.spatialId, id);
  assert.equal(object.parent, model.floorGroups.get(info.floor), `Floor-local parent: ${id}`);
  assert.deepEqual(object.position.toArray(), [info.position.x, info.position.y, info.position.z], `Floor-local position: ${id}`);
  assert.equal(object.rotation.y, info.rotation, `Rotation: ${id}`);
  if (info.category === 'architecture') assert.equal(info.editable, false, `Fixed reference structure: ${id}`);
  categories[info.category] = (categories[info.category] || 0) + 1;
  floors[info.floor] = (floors[info.floor] || 0) + 1;
  modeledAssetComponents += object.userData.componentCount || 0;
}
for (const floor of HOSPITAL_FLOORS) {
  const isolated = buildFullHospital(floor.id);
  assert.equal(isolated.objects.size, floors[floor.id], `Same number of objects: ${floor.id}`);
  for (const [id, entry] of isolated.objects) assert.deepEqual(entry.info, model.objects.get(id)?.info, `Stable ID and metadata across views: ${id}`);
}
model.setExplode(14);
let index = 0;
for (const group of model.floorGroups.values()) assert.equal(group.position.y, index++ * 14);
for (const { object, info } of model.objects.values()) assert.equal(object.position.y, info.position.y, 'Exploded spacing leaves floor-local transforms unchanged');

const catalog = [];
for (const definition of ASSET_CATALOG) {
  const instance = createSpatialAsset(definition.kind);
  assert.ok(instance.children.length > 0 && instance.children.length <= 2, `At most two material batches per ${definition.kind}`);
  assert.ok(instance.userData.componentCount > 0);
  assert.equal(instance.userData.componentNames.length, instance.userData.componentCount);
  assert.ok(instance.userData.componentNames.every(name => typeof name === 'string' && name.length));
  for (const mesh of instance.children) assert.ok(mesh.geometry.getAttribute('color'), 'Original part colors preserved');
  const size = new THREE.Box3().setFromObject(instance).getSize(new THREE.Vector3());
  for (const axis of ['x', 'y', 'z']) assert.ok(size[axis] <= definition.size[axis] + .0001, `Catalog bounds cover ${definition.kind} on ${axis}`);
  catalog.push({ kind: definition.kind, category: definition.category, components: instance.userData.componentCount, meshes: instance.children.length, measuredSize: size.toArray().map(value => Number(value.toFixed(3))) });
}
assert.throws(() => createSpatialAsset('unrecognized-asset'), /Unknown spatial asset/);
const figure = createVolunteerFigure(0x7e9871, 3);
for (const joint of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
  assert.equal(figure[joint].parent, figure.root);
  assert.ok(figure[joint].children.length > 0);
}
figure.leftLeg.rotation.x = .4;
assert.equal(figure.rightLeg.rotation.x, 0, 'Independent leg articulation');

const report = {
  checkedAt: new Date().toISOString(), scope: 'Pure procedural geometry and original object registry; no GPU required',
  objects: model.objects.size, meshes, triangles, modeledAssetComponents,
  uniqueGeometries: geometries.size, uniqueMaterials: materials.size, categories, floors, catalog,
  verified: [
    'All eight floors and source object registry', 'Backend-compatible deterministic object IDs',
    'Identical metadata in full-building and single-floor views', 'Floor-local transforms under exploded spacing',
    'Fixed architectural reference geometry', 'Complete-building mesh and triangle budgets',
    'Two material batches maximum per catalog asset', 'Detailed component manifests and original vertex colors',
    'Catalog dimensions enclose actual geometry', 'Unknown catalog kinds rejected', 'Independent articulated volunteer limbs',
  ],
};
await fs.mkdir(new URL('artifacts/qa/', root), { recursive: true });
const destination = new URL('artifacts/qa/spatial-assets.json', root);
await fs.writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, artifact: fileURLToPath(destination) }, null, 2));
