# SHUORI visual tour

A ten-page, portrait A4 visual tour of the working application, with twenty selected screenshots and an individual figure caption for every image. The document presents fictional demonstration records and an illustrative spatial model. It is an independent personal project without hospital or organizational affiliation.

## Files

- `shuori-visual-tour.pdf`: the completed ten-page A4 document.
- `shuori-visual-tour.tex`: editable XeLaTeX source.
- `images/`: twenty numbered source PNGs, referenced by the TeX source.
- `shuori-visual-tour-source.zip`: portable package with the PDF, source, all images, the Japanese font and license notices.
- `validation.json` and `visual-review.json`: structural checks and review of every rendered page, tied to the PDF's SHA-256.
- `SHA256SUMS`: hashes of the final PDF and source package.

Each page contains two `figure` environments positioned with `[H]`. Every image uses the same **176 × 90 mm** internal frame. `keepaspectratio` fits each screenshot without stretching or cropping it in TeX; any intentional interface crop is present in its source PNG. The document uses explicit page breaks, 9 pt captions and A4 pages. There is no separate cover page.

## Rebuild

From this folder, with a full TeX installation providing XeLaTeX, `fontspec`, `geometry`, `graphicx`, `float`, `caption`, `fancyhdr` and `hyperref`:

```bash
xelatex -interaction=nonstopmode -halt-on-error shuori-visual-tour.tex
xelatex -interaction=nonstopmode -halt-on-error shuori-visual-tour.tex
```

The document prefers **TeX Gyre Heros**, falling back to **Latin Modern Sans**. The Japanese wordmark uses `fonts/NotoSansJP-Regular.ttf` in the portable package, or the repository's font at `../../server/fonts/NotoSansJP-Regular.ttf`. Extract the entire source ZIP before compiling. No font download or network request is needed during compilation.

On Windows with an existing WSL TeX installation, enter this folder through its `/mnt/c/.../artifacts/showcase` path and run the same commands. Generated `.aux`, `.log` and `.out` files are rebuild intermediates, not required reading material.

After a rebuild, confirm that the result has **exactly 10 A4 pages** and **20 numbered figures**, inspect every rendered page for clipping and unreadable detail, and review the TeX log for layout or missing-glyph warnings. Captions describe the recorded view; changing the screenshots may require updating their text.

## Recapture and verify in the repository

Build SHUORI with `npm.cmd run build`, then run `node scripts/showcase-server.mjs` from the repository root. This starts a separate in-memory demo at `http://127.0.0.1:3020`; it never opens an existing workspace database. The example schedule is anchored to **8 October 2026**, while the actual captures were made on **10 October 2026**. In another terminal, run:

```powershell
node scripts/capture-showcase-operations.mjs
node scripts/capture-showcase-spatial.mjs
node scripts/capture-showcase-exports.mjs
```

These scripts use installed Google Chrome through Playwright and capture real interface excerpts at 2× pixel density. Figures 5 and 9 show unsaved field/link drafts; figure 18 shows an unsaved rehearsal route. Figure 8 has a configured meeting provider and agenda but no joining URL. No external link is opened and no operational record is changed. Stop the disposable server with Ctrl+C when finished.

After recompiling, run `python scripts/validate-showcase.py` from the repository root. It requires `pypdf`, `pypdfium2` and `Pillow`, verifies page size, figure order, font embedding, capture hashes and logs, and renders all pages to `qa/`. Review every new render and update `visual-review.json` for the exact PDF before `python scripts/package-showcase.py` creates the portable archive. The archive includes a SHA-256 file manifest; it excludes runtime databases and dependencies. Structural checks do not establish PDF/UA accessibility conformance.

## Scope and attribution

The source application is SHUORI 1.4.0. The tour is dated **10 October 2026, Asia/Tokyo**. All displayed personal and activity data are fictional. Interface captures may show scrollable panels or a selected part of a workspace to retain legibility in the printed tour. They do not imply that every record or control is visible at once.

The demo floor geometry was independently reconstructed from the University of Tokyo Hospital's publicly available official floor-guide maps, with invented geometry, furnishings and routes. It is an illustrative example, not an official or surveyed building model, and is unsuitable for real-world navigation, evacuation or clinical decisions. The reference establishes provenance only; the project is not affiliated with, commissioned by or endorsed by the source hospital or any organization. See [floor sources](https://github.com/wwwwanhonghuang/Hospital-Volunteer-Activity-Management/blob/main/docs/FLOOR-SOURCES.md).

Copyright © 2026 HUANG WANHONG and contributors, for their respective original contributions. Original authored prose, layout and creative assets use **CC BY-NC-SA 4.0**. Software remains **AGPL-3.0-only**. Screenshots can contain several components whose licenses remain separate. Third-party fonts and components retain their own notices; Noto Sans JP is under SIL OFL 1.1. The portable archive includes software/creative license texts under `licenses/` and font notices under `fonts/`. See [licensing](https://github.com/wwwwanhonghuang/Hospital-Volunteer-Activity-Management/blob/main/docs/LICENSING.md) and [third-party notices](https://github.com/wwwwanhonghuang/Hospital-Volunteer-Activity-Management/blob/main/docs/THIRD-PARTY-NOTICES.md).

Source: [SHUORI — Hospital Volunteer Activity Management](https://github.com/wwwwanhonghuang/Hospital-Volunteer-Activity-Management).
