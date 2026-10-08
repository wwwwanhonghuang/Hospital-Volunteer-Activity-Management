# Licensing and attribution

**守織 SHUORI separates its software from its creative assets.** Copyright © 2026 HUANG WANHONG ([wwwwanhonghuang](https://github.com/wwwwanhonghuang)) and contributors, for their respective original contributions.

The software uses **GNU Affero General Public License version 3 only**, SPDX `AGPL-3.0-only`. The designated original creative material uses **Creative Commons Attribution–NonCommercial–ShareAlike 4.0 International**, SPDX `CC-BY-NC-SA-4.0`. These are licenses for different components, not alternative licenses for the same file.

The complete [AGPL text](../LICENSE) and [CC legal code](../LICENSES/CC-BY-NC-SA-4.0.txt) govern their respective material. [LICENSES/README.md](../LICENSES/README.md) is the path map; [NOTICE](../NOTICE) records the project credit and exclusions. This guide explains the arrangement without adding license conditions.

## Component boundaries

| Component | Applicable terms |
| --- | --- |
| Original code in `src/`, `server/`, `shared/`, `scripts/` and `tests/`; original build, launch and CI configuration | AGPL-3.0-only |
| Generic Three.js rendering, animation, selection, transformation and asset-loading code | AGPL-3.0-only |
| Original non-executable model and furnishing descriptions in `content/spatial/*.json` | CC BY-NC-SA 4.0 |
| Original `public/*.svg` artwork, `artifacts/models/*.glb` models and `artifacts/previews/*.png` artwork | CC BY-NC-SA 4.0, for original creative elements |
| Authored project prose, including README and documentation; original authored content/layout in the fictional example workbooks | CC BY-NC-SA 4.0 |
| Dependencies, bundled fonts/icons, copied license texts and external source material | Their own terms; see [third-party notices](THIRD-PARTY-NOTICES.md) |

The model descriptions are separate data resources, not source-code files with a noncommercial restriction. They describe geometry, placement and appearance; the AGPL rendering software reads them. The original SHUORI SVG artwork is also loaded separately. [Content guidance](../content/README.md) explains their structure and replacement.

Builds, release archives and screenshots can contain multiple components. Their constituents retain their respective licenses; an archive does not turn all assets into AGPL software or all software into CC material. Copyleft requirements still apply to software modifications. Keep both sets of notices when redistributing the supplied combination.

## Software: commercial use and source access

AGPL permits commercial use and redistribution of the software. Preserve copyright and license notices, identify modifications and dates, and meet its source-distribution and copyleft requirements when conveying covered software. Its Section 11 includes a contributor patent grant; the CC asset license does not supply patent or trademark rights. [AGPL Sections 4–6 and 11](https://www.gnu.org/licenses/agpl-3.0.en.html)

If you modify the program and users interact with that version remotely over a network, Section 13 requires a prominent, no-charge opportunity for those users to obtain that version's **Corresponding Source**. A link to an unchanged upstream repository cannot supply undisclosed deployment modifications. Preserve and update the application's source offer for the exact version you deploy, including required build and installation material. This does not require publication of volunteer databases, passwords or other operational records merely because the application processes them. [AGPL Sections 1 and 13](https://www.gnu.org/licenses/agpl-3.0.en.html)

The supplied noncommercial assets impose conditions on their own use. They do not add an AGPL restriction to the software. A commercial adaptation may use replacement assets under suitable terms or obtain separate permission for the supplied creative assets. Whether a particular use is noncommercial depends on its purpose, not simply the organization's nonprofit status.

## Creative assets: attribution and ShareAlike

CC BY-NC-SA permits use within its noncommercial grant. When sharing covered creative material, preserve supplied attribution and notices, identify modifications and provide the license link or text. Shared adaptations must use the same license elements under Section 3(b); using CC BY-NC-SA 4.0 is the straightforward option. Do not impose additional legal or technical restrictions on recipients' licensed rights. Exceptions, public-domain elements and uses that need no copyright permission remain unaffected. [CC legal code](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en)

An attribution example for a reused model or illustration:

> Model/artwork adapted from 守織 SHUORI — Hospital Volunteer Activity Management, by HUANG WANHONG (wwwwanhonghuang) and contributors. Source: https://github.com/wwwwanhonghuang/Hospital-Volunteer-Activity-Management. CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/. Changes: [describe your modifications].

This is an example, not a mandatory wording or placement rule. Keep any additional credits that accompany the reused material. Software copies retain their AGPL notices; the asset attribution does not replace them.

## Exclusions and generated output

`meta/JOB-BACKGROUND.md` is an externally supplied job-description excerpt. Official hospital diagrams, names, marks and linked pages remain their owners' material. The original schematic reconstruction is bundled solely as an illustrative demo, with attribution and assumptions documented in [floor sources](FLOOR-SOURCES.md). Neither license implies affiliation, commissioning or endorsement by any hospital, university or other organization. SHUORI is developed independently as a personal project.

Later operator-entered records and uploaded content are not automatically licensed under either project license. An exported workbook, screenshot or model may combine those records with licensed project material; rights in each part remain separate. AGPL does not automatically license every output of a program. Original model/artwork carried into an export retains its asset license.

Factual test results, generated QA logs, checksums and operational metadata are not claimed as exclusive creative works merely because they appear in this repository. The project grants only rights its contributors hold. Third-party components retain their notices and licenses, including those embedded in example workbooks, previews or compiled distributions.

This separation follows Creative Commons' [guidance to use software-specific licenses for software](https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software). It does not modify either standard license.
