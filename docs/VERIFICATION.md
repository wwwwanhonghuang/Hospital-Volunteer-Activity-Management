# Release verification · 守織 SHUORI 1.3.1

Verified on **8 October 2026 (Asia/Tokyo)** in the Windows workspace with Node.js **22.17.0**, npm **10.9.2**, and installed Google Chrome driven through Playwright.

## Results

| Check | Observed result |
| --- | --- |
| TypeScript and production compilation | Passed; Vite emitted the compiled application into `dist/` |
| API and domain tests | **45 passed**, zero failures, including 13 Excel cases, seven event/record/storage groups, two calendar/conflict cases and eight spatial-scenario cases |
| Browser acceptance | **23 workflows passed**, zero failed, skipped or flaky tests; includes complete event workspaces, flexible volunteer records, viewer permissions and existing spatial workflows |
| General application accessibility | **15 views**, zero automated WCAG rule violations across ten existing routes and five forms |
| Events and records accessibility | **30 desktop/mobile states**, zero automated violations, no browser errors or horizontal overflow; nine keyboard tab checks pass and saved records remain unchanged |
| Spatial Studio accessibility scan | **12 desktop/mobile states**, zero automated WCAG 2 A/AA and 2.1 AA rule violations; no browser errors, unexpected operational writes or horizontal overflow |
| Login identity accessibility | **2 desktop/mobile views**, zero automated violations or horizontal overflow; independent-project notice visible at both sizes |
| Excel examples | Five genuine XLSX downloads, **55 worksheets** in total; parsed by ExcelJS and independently inspected with Python ZIP/XML; monthly totals agree |
| Runtime browser errors | None during the captured navigation and spatial acceptance flows |
| Mobile layout | 390 px viewport inspected; tested management routes and spatial view had no document-level horizontal overflow |
| Detailed geometry | **590 registered objects**, 15 catalog kinds and **10,358 modeled asset components**; original assemblies use 2,470 mesh instances and 346,424 triangles |
| 3D export | Valid GLB 2.0; eight source floor roots, **144 shared mesh definitions** and **3,078 nodes**; 590 unique object identifiers, component manifests, vertex colors and source metadata preserved |
| 3D artifact size | **1,844,492 bytes** for the complete original building; **909,912 bytes** for the example 1F study with one added wheelchair |
| WebGL fallback | Forced WebGL initialization failure produced the usable 2D floor interface |
| Dependency advisory scan | Zero known vulnerabilities reported across runtime and development dependencies at verification time |

The browser acceptance suite verifies actual persistence and server responses. The ten existing management workflows cover:

1. Overview metrics, search and main-route navigation without runtime exceptions.
2. Project creation, dependent tasks, calculated duration and saved what-if changes.
3. Suggested assignments, atomic application, reload, coverage and calendar download.
4. Mobile navigation and content width.
5. Volunteer onboarding, typing focus, availability and readiness persistence.
6. Activity correction, report totals and filtered CSV download.
7. Required support-resolution notes and persisted resolved status.
8. Resource quantity validation, maintenance, deletion and audit.
9. Administrator account creation, role changes and secret-free backup download.
10. Read-only controls and server enforcement of viewer restrictions.

The three new browser workflows exercise custom event type creation, meeting links, multi-module event editing, checklist ownership/due dates, attendance notes, linked volunteers/shifts, file upload and byte-exact download, Drive links, calendar/Excel export and reload. Volunteer workflows add typed custom fields, emergency contacts, tags, dated notes and per-record attachments; viewer inspection confirms write controls remain unavailable.

The new backend tests cover required/type-safe fields, archived values, prevention of destructive definition changes, 100-field scope limits, relation protection, stale writes, upload role/CSRF checks, filename/content signatures, exact 10 MiB uploads, byte-identical backup recovery, corrupt backup rejection, destination-lock checks and 200-attachment target limits. Calendar tests validate JST conversion, multi-day intervals, Unicode folding and cancellation status; overlap tests distinguish touching times, cancellations, other participants and explicitly linked work.

Domain/API tests additionally cover session revocation, CSRF and origin validation, malformed requests, login throttling, last-administrator protection, optimistic concurrency, reference integrity, dependency cycles, spreadsheet-formula escaping, readiness changes, transfer-buffer boundaries, weekly workload accounting, production/demo isolation, restart persistence and backup restoration.

The spatial additions cover validated transforms and all 15 asset kinds, coordinate and capacity bounds, unsafe object identifiers, unique same-floor rehearsal assignments, role enforcement, CSRF, version conflicts, scenario CSV/backup export, SQLite restart and restore, and atomic rejection of roster changes that would invalidate a saved route. Scenario operations are checked against the original volunteer and shift records to confirm that editing a spatial study does not change the roster.

The five studio browser workflows verify adding and transforming an asset, undo/redo, rotation, hiding, save/reload and JSON exchange; authoring, editing and persisting a volunteer rehearsal route; mobile exploration with editing disabled for a viewer; actual mouse selection, focus, hide/show and reset of source furniture; and malformed/minimal JSON handling. Regression checks confirm that unsaved geometry survives navigating away and back, and that saved studies reopen with an accurate saved status.

A separate pointer check drags the rendered translation arrow and rotation ring. It confirms a changed X coordinate snapped to 0.25 units and a changed rotation snapped to 15 degrees, with no operational API writes.

The 1.3.1 release reruns the complete 23-workflow browser suite, management/event/record accessibility checks, studio and login audits, geometry validation and model exports. Display names and the model's independence disclaimer were updated without changing geometry, materials, transforms, coordinates or stable object identifiers. Original content-extraction comparisons and pointer-handle checks remain baseline evidence from 1.2; their original dates and scope are retained. Published content hashes are checked by the release recorder.

## Excel and identity acceptance

The five Excel browser workflows download and read actual XLSX files. They check filtered viewer rosters and empty selections, every page of filtered activity records, the displayed schedule week, project CPM with the full task graph, support/resource filters, monthly totals, readiness and complete-workspace exports, CSV compatibility, saved-only scenario data, error recovery and mobile layout. Export failures leave the action usable.

Thirteen Excel API/domain cases verify Unicode and leading zeros, numeric/date cells and styling, formula-like text stored literally, empty worksheets, monthly definitions and trends, shared CPM calculations, normalized scenario tables, invalid requests and limits, and authenticated role/CSRF behavior. Backup tests explicitly exercise both new `shuori-backup` exports and legacy `komorebi-backup` restoration with original IDs and content intact. The scene browser tests import the legacy scene format and export the new one.

The five downloadable examples contain fictional data. An independent Python standard-library ZIP/XML reader checks archive CRCs, XML structure, Unicode branding, frozen panes and filters, worksheet-index row counts, numeric date storage, text phone numbers, absence of formulas/macros/external links, and monthly totals recomputed from the activity rows. Microsoft Excel and LibreOffice desktop applications were not used; interoperability evidence is OOXML inspection and ExcelJS readback.

The original woven logo, Chinese name and English wordmark were visually reviewed on desktop and mobile. The independent SHUORI aqua palette is documented in [BRAND.md](BRAND.md). The woven logo is original; no institutional mark is bundled. The 1.3.1 application and current screenshots use generic hospital branding and an explicit independent-project notice.

## Content extraction verification

The final software/content split preserves the original design in separately emitted JSON resources. Original building geometry was compared against the pre-extraction release: all 2,470 mesh transforms, geometry attribute/index buffers, material definitions, world bounds, 590 registry records and eight floor views match within the recorded numeric tolerance. Articulated figure comparisons cover all four skin/hair variants, body and joint transforms, per-person uniform colors and shared geometry/material behavior. Their 222,336 geometry attribute values match numerically; maximum transform deviation is approximately 1.11e-16, with a 1e-12 comparison tolerance.

The checks caught and corrected stale transform matrices and serialization of transformed parametric geometry. The final content uses explicit BufferGeometry data. Evidence is recorded in `artifacts/qa/building-content-equivalence.json` and `artifacts/qa/asset-content-equivalence.json`, including the earlier ZIP/source hashes and final published content hashes. Original generator snapshots used for comparison remain outside the published repository and release.

## Spatial acceptance

The spatial validation ran against the compiled application and its persistent demo API. It exercised all eight published floor selectors, floor separation, facade visibility, density overlays, playback/pause/reset, zero scheduled activity after the end of the day in the Guide panel, 2D/3D switching, PNG download, GLB download and forced WebGL failure. The GLB header, declared binary size, parsed glTF document, floor metadata and source disclaimer were checked. Source floor roots are identified by their guide source and geometry metadata, so independently registered objects carrying a floor identifier are not mistaken for additional floors.

The validator checks all 590 original spatial identifiers, all 15 catalog kinds, construction manifests, and vertex-color attributes used to preserve the original component finishes after batching. It adds a wheelchair in an unsaved 1F study, focuses the view, exports it, verifies the added object's 44-component construction alongside the original floor geometry, and removes the addition. The example study has its own GLB; the complete-building artifact contains only original model objects.

The browser-free geometry validator confirms deterministic object IDs and identical metadata across complete-building and isolated-floor views; floor-local transforms that remain unchanged when floors separate; fixed reference architecture; catalog dimensions that enclose actual geometry; and independently articulated volunteer limb pivots. Every catalog assembly uses at most two material batches. The model retains detailed construction while sharing geometry and materials across instances; the scene's 2,470 mesh instances and the exported file's 144 shared mesh definitions describe different quantities.

Screenshots were visually inspected for the dashboard, project timeline, scheduling board, full building model and mobile view, plus desktop/mobile login, reporting and Excel controls, the detailed library, wheelchair, animated volunteer, asset palette and rehearsal-route editor. They are captures of the running application. Final previews are in [`artifacts/previews/`](../artifacts/previews/).

## Accessibility scope

The current Spatial Studio audit covers 12 states: desktop building objects, the floor inspector, asset library, people, empty and populated route editors, the scenario file menu, the unsaved-changes dialog, and mobile inspector, assets, people and route editor. It also records page errors, document overflow and unexpected API writes, and compares operational-state fingerprints before and after the audit. The final recorded studio scan has zero automated violations across those states.

The refreshed general-application audit covers all ten main routes and five create forms with zero automated violations. Earlier low-contrast labels were darkened, normal metadata text was enlarged, progress indicators received accessible names, and the modal focus trap was corrected to preserve typing focus across rerenders. The studio review also corrected the mobile search button's accessible name and gave the scenario toolbar a semantic group role.

Some axe checks remain marked **incomplete**, including short compass text or non-text marks over the rendered canvas; the detailed reports retain their targets and reasons. Automated canvas interpretation is limited. Text overlays use opaque surfaces, and the detailed scene can also be explored through the searchable object list and numeric controls. These results do not establish formal WCAG conformance: a screen-reader audit, comprehensive keyboard study, high-zoom review and institutional accessibility acceptance have not been completed.

## Reproduce

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
node scripts/validate-spatial-assets.mjs
```

The browser suite uses installed Chrome and launches its own server on port 3010 with a temporary database. It does not touch normal application databases. The geometry validator runs directly in Node, transpiles the model modules in memory, and writes `artifacts/qa/spatial-assets.json`; it needs no GPU or server.

For the additional audits, start a demo server at `http://127.0.0.1:3001`, then run:

```powershell
node scripts/audit-accessibility.mjs
node scripts/audit-studio.mjs
node scripts/audit-rich-records.mjs
node scripts/audit-neutral-identity.mjs
node scripts/validate-spatial.mjs
node scripts/validate-scene-handles.mjs
node scripts/capture-preview.mjs
node scripts/capture-studio.mjs
node scripts/capture-exports.mjs
python scripts/validate-excel-artifacts.py
node scripts/sanitize-qa-paths.mjs
```

These scripts sign into the demo and inspect/render it. The studio audit rejects non-demo servers and blocks operational API writes. Spatial validation and studio captures exercise unsaved layout or route drafts without saving operational changes. Spatial validation regenerates the original standalone GLB, the separate example-study GLB and model previews. The additional studio audit covers interactions, responsive layouts and incomplete accessibility findings. `SPATIAL_BASE_URL`, `AUDIT_BASE_URL` and `PREVIEW_URL` can respectively override the default validation, studio-audit and studio-capture URL.

## Evidence

- [`artifacts/qa/rich-records-accessibility.json`](../artifacts/qa/rich-records-accessibility.json): 30 event/profile/storage views, keyboard checks and saved-state guard.
- [`artifacts/qa/api-tests.txt`](../artifacts/qa/api-tests.txt): complete API/domain test output.
- [`artifacts/qa/browser-tests.json`](../artifacts/qa/browser-tests.json): Playwright's final suite status.
- [`artifacts/qa/brand-accessibility.json`](../artifacts/qa/brand-accessibility.json): desktop/mobile login findings.
- [`artifacts/qa/neutral-identity.json`](../artifacts/qa/neutral-identity.json): generic rendered identity, visible independence notices, source-link attribution and unchanged operational records.
- [`artifacts/qa/excel-examples.json`](../artifacts/qa/excel-examples.json): actual demo downloads, worksheet counts and file hashes.
- [`artifacts/qa/excel-ooxml.json`](../artifacts/qa/excel-ooxml.json): independent ZIP/XML and monthly-total validation.
- [`artifacts/qa/accessibility.json`](../artifacts/qa/accessibility.json): detailed axe findings, incomplete checks and typography probes.
- [`artifacts/qa/studio-accessibility.json`](../artifacts/qa/studio-accessibility.json): the 12-state Spatial Studio audit, incomplete findings, responsive-layout checks and operational-write guard.
- [`artifacts/qa/spatial-assets.json`](../artifacts/qa/spatial-assets.json): reproducible geometry counts, per-kind component/batch counts, measured dimensions and registry checks.
- [`artifacts/qa/scene-handles.json`](../artifacts/qa/scene-handles.json): pointer manipulation of actual move/rotate handles and snapping checks.
- [`artifacts/qa/dependency-audit.json`](../artifacts/qa/dependency-audit.json): npm advisory scan output.
- [`artifacts/spatial-validation.json`](../artifacts/spatial-validation.json): model parsing and spatial acceptance results.
- [`artifacts/models/hospital-public-floors.glb`](../artifacts/models/hospital-public-floors.glb): detailed complete-building model with original source metadata.
- [`artifacts/models/hospital-spatial-study-example.glb`](../artifacts/models/hospital-spatial-study-example.glb): 1F example export demonstrating a detailed scenario addition.
- [`artifacts/previews/studio-equipment-detail.png`](../artifacts/previews/studio-equipment-detail.png), [`studio-library-detail.png`](../artifacts/previews/studio-library-detail.png) and [`studio-volunteer-detail.png`](../artifacts/previews/studio-volunteer-detail.png): actual close views of independent equipment, furniture and a scheduled figure.
- [`artifacts/qa/release-verification.json`](../artifacts/qa/release-verification.json): compiled-entry and model hashes and summarized results.

## Limits of validation

Docker/Compose configuration is supplied but was not executed because Docker was unavailable in the environment. A real HTTPS reverse proxy, institutional identity service and hospital network were not available for deployment acceptance. No claim is made that institutional privacy, clinical, operational or regulatory approval has occurred.

The production build reports a non-failing size advisory for the separately loaded Three.js chunk. Node.js 22.17 prints an experimental warning for its built-in SQLite driver. Neither prevented compilation, startup or the completed tests. Geometry budgets are checked automatically; rendering performance remains device-dependent and has not been certified against a hospital hardware fleet.

The public floor model is intentionally schematic. The model's provenance is recorded in [FLOOR-SOURCES.md](FLOOR-SOURCES.md); its successful rendering and export do not establish physical building accuracy.
