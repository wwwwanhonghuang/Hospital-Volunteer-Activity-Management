// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const read=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const [pkg,browser,accessibility,studio,spatial,assets,advisories,handles,excel]=await Promise.all([
  'package.json','artifacts/qa/browser-tests.json','artifacts/qa/accessibility.json','artifacts/qa/studio-accessibility.json',
  'artifacts/spatial-validation.json','artifacts/qa/spatial-assets.json','artifacts/qa/dependency-audit.json','artifacts/qa/scene-handles.json','artifacts/qa/excel-examples.json'
].map(read));
assert.equal(browser.stats.unexpected,0);assert.equal(browser.stats.skipped,0);assert.equal(browser.stats.flaky,0);assert.equal(browser.stats.expected,23);
assert.equal(accessibility.summary.viewsWithViolations,0);assert.equal(spatial.errors.length,0);assert.equal(advisories.metadata.vulnerabilities.total,0);
assert.ok(studio.views.every(view=>view.violations.length===0));assert.equal(spatial.model.registeredObjects,590);
const unitOutput=await fs.readFile('artifacts/qa/api-tests.txt','utf8');
const apiPassed=Number(unitOutput.match(/# pass (\d+)/)?.[1]);assert.ok(apiPassed>=45);assert.match(unitOutput,/# fail 0/);
const [brand,ooxml,buildingExtraction,assetExtraction]=await Promise.all(['artifacts/qa/brand-accessibility.json','artifacts/qa/excel-ooxml.json','artifacts/qa/building-content-equivalence.json','artifacts/qa/asset-content-equivalence.json'].map(read));
const rich=await read('artifacts/qa/rich-records-accessibility.json');
const identity=await read('artifacts/qa/neutral-identity.json');
assert.equal(identity.version,pkg.version);assert.equal(identity.passed,true);
assert.equal(identity.operationalStateUnchanged,true);assert.deepEqual(identity.unexpectedWrites,[]);
assert.equal(rich.summary.viewCount,30);assert.equal(rich.summary.ruleOccurrences,0);
assert.deepEqual(rich.summary.horizontalOverflowViews,[]);assert.equal(rich.summary.pageErrorCount,0);
assert.equal(rich.summary.unexpectedWriteCount,0);assert.equal(rich.summary.operationalStateUnchanged,true);
assert.equal(await hash('content/spatial/building.json'),buildingExtraction.content.publishedSha256);
assert.equal(await hash('content/spatial/assets.json'),assetExtraction.content.publishedSha256);
assert.ok(brand.views.every(view=>view.violations.length===0&&!view.overflow));assert.equal(ooxml.passed,true);
assert.equal(excel.version,pkg.version);assert.deepEqual(excel.errors,[]);assert.equal(excel.files.length,5);
for(const file of excel.files)assert.equal(await hash(file.file),file.sha256);
const report={clientDate:'2026-10-08',timeZone:'Asia/Tokyo',recordedAt:new Date().toISOString(),version:pkg.version,build:'passed',
  apiDomainTests:{passed:apiPassed,failed:0,evidence:'artifacts/qa/api-tests.txt'},browserTests:browser.stats,contentExtraction:{building:buildingExtraction,assets:assetExtraction},
  excelExamples:excel,independentExcelInspection:ooxml,brandAccessibility:{views:brand.views.length,violations:0},accessibility:accessibility.summary,
  richRecordsAccessibility:rich.summary,independentIdentity:identity,retainedV12Evidence:['Original content extraction equivalence','Pointer handle checks'],
  studioAccessibility:studio.summary,geometry:assets,spatial:spatial.model,pointerHandles:handles,dependencyVulnerabilities:advisories.metadata.vulnerabilities,
  sha256:{compiledEntry:await hash('dist/index.html'),model:await hash(spatial.model.file),lockfile:await hash('package-lock.json')},
  notExecuted:['Docker/Compose runtime','Institutional HTTPS deployment','Formal accessibility conformance audit']};
await fs.writeFile('artifacts/qa/release-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:pkg.version,browserPassed:browser.stats.expected,apiPassed,modelObjects:spatial.model.registeredObjects,sha256:report.sha256},null,2));
