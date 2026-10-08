# Third-party assets and dependencies

The complete dependency versions and resolved package hashes are recorded in `package-lock.json`. Their license files are distributed in the respective npm packages.

The project's original software uses [AGPL-3.0-only](../LICENSE); its designated original creative assets and prose use [CC BY-NC-SA 4.0](../LICENSES/CC-BY-NC-SA-4.0.txt). Neither replaces third-party terms. The external job-description excerpt in `meta/JOB-BACKGROUND.md`, official hospital reference material and later user-entered operational data are outside that original-project licensing claim. See the [component path map](../LICENSES/README.md) and [licensing guide](LICENSING.md).

| Component | License / source |
| --- | --- |
| React and React DOM | MIT; Meta and contributors |
| Three.js and example utilities | MIT; Three.js contributors |
| Lucide icons | ISC; Lucide contributors |
| Express | MIT; Express contributors |
| Zod | MIT; Colin McDonnell and contributors |
| ExcelJS | MIT; ExcelJS contributors; direct license included in `docs/licenses/exceljs.txt` |
| Vite, TypeScript and Playwright | Respective MIT / Apache-2.0 package licenses |
| DM Sans | SIL Open Font License 1.1; bundled through Fontsource |
| Manrope | SIL Open Font License 1.1; bundled through Fontsource |

The hospital's official floor-guide diagrams were consulted as references. They are copyrighted by their original owner and are **not included as redistributed map assets** in the release. The application uses original schematic geometry, descriptive service labels and direct source links. Non-executable geometry descriptions reside in `content/spatial/` under the creative-asset license; the generic rendering code is AGPL software. See `FLOOR-SOURCES.md` for provenance and assumptions.

The application symbol and favicon are original vector graphics created for 守織 SHUORI. The aqua palette is informed by the hospital's published communication mark; that official mark is not redistributed or represented as the application's own. See `BRAND.md` for the color reference and identity decisions.

ExcelJS 4.4.0 writes the server-generated XLSX files. Its UUID dependency is overridden to the CommonJS-compatible 11.1.1 release, resolving the advisory on older UUID versions while preserving the `v4` API ExcelJS uses. The locked dependency tree is audited and workbook generation is tested after this override.
