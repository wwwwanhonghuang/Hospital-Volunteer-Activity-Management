# SPDX-License-Identifier: AGPL-3.0-only
"""Validate the A4 visual tour and render all pages for manual inspection."""
from pathlib import Path
import hashlib
import json
import re

from PIL import Image, ImageOps, ImageDraw
from pypdf import PdfReader
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "artifacts/showcase"
PDF = DIRECTORY / "shuori-visual-tour.pdf"
QA = DIRECTORY / "qa"
QA.mkdir(exist_ok=True)
sha256 = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
source = (DIRECTORY / "shuori-visual-tour.tex").read_text(encoding="utf-8")
assert source.count(r"\begin{figure}[H]") == 20
assert source.count(r"\end{figure}") == 20
assert source.count(r"\caption{") == 20
log = (DIRECTORY / "shuori-visual-tour.log").read_text(encoding="utf-8")
warnings = re.findall(r".*(?:Overfull|Underfull|Missing character|Warning:).*", log)
assert not warnings, warnings
reader = PdfReader(PDF, strict=True)
assert len(reader.pages) == 10
document = pdfium.PdfDocument(PDF)
pages = []
for index, page in enumerate(reader.pages):
    dimensions = [float(page.mediabox.width), float(page.mediabox.height)]
    assert abs(dimensions[0] - 595.276) < 0.1
    assert abs(dimensions[1] - 841.890) < 0.1
    text = page.extract_text()
    figures = [int(value) for value in re.findall(r"FIG\.\s*(\d+)", text)]
    assert figures == [2 * index + 1, 2 * index + 2], (index, figures)
    assert len(page.images) == 2, (index, len(page.images))
    assert "SHUORI" in text
    fonts = []
    for reference in page["/Resources"].get("/Font", {}).values():
        font = reference.get_object()
        descendants = font.get("/DescendantFonts", [font])
        for descendant in descendants:
            descriptor = descendant.get_object().get("/FontDescriptor")
            assert descriptor, "Missing font descriptor"
            assert any(key in descriptor.get_object() for key in ("/FontFile", "/FontFile2", "/FontFile3")), "Font not embedded"
        fonts.append(str(font.get("/BaseFont")))
    rendered = document[index].render(scale=150 / 72).to_pil().convert("RGB")
    destination = QA / f"page-{index+1:02d}.png"
    rendered.save(destination)
    pages.append({"page": index + 1, "sizePoints": dimensions, "figures": figures,
                  "embeddedImages": len(page.images), "fonts": fonts,
                  "render": destination.relative_to(DIRECTORY).as_posix(), "sha256": sha256(destination)})
image_records = []
for filename in re.findall(r"\\tourimage\{([^}]+)\}", source):
    path = DIRECTORY / "images" / filename
    with Image.open(path) as image:
        assert image.width >= 1500 and image.height >= 750, filename
        image_records.append({"file": f"images/{filename}", "pixels": list(image.size), "sha256": sha256(path)})
assert len(image_records) == 20
capture_count = 0
for manifest_name in ("operations-capture.json", "spatial-capture.json", "exports-capture.json"):
    capture = json.loads((DIRECTORY / manifest_name).read_text(encoding="utf-8"))
    assert capture.get("operationalStateUnchanged", capture.get("unchangedOperationalState")) is True
    for key in ("errors", "pageErrors", "consoleErrors", "unexpectedWrites", "operationalMutations"):
        assert not capture.get(key), (manifest_name, key)
    for record in capture.get("screenshots", capture.get("captures", [])):
        filename = Path(record.get("path", record.get("file", ""))).name
        assert sha256(DIRECTORY / "images" / filename) == record["sha256"], filename
        capture_count += 1
assert capture_count == 20
for group in range(2):
    sheet = Image.new("RGB", (1050, 2220), "#e7eff3")
    draw = ImageDraw.Draw(sheet)
    for position, page in enumerate(pages[group * 5:(group + 1) * 5]):
        with Image.open(DIRECTORY / page["render"]) as image:
            preview = ImageOps.contain(image, (500, 700))
            x, y = 15 + (position % 2) * 520, 30 + (position // 2) * 730
            sheet.paste(preview, (x, y))
            draw.text((x, y - 18), f"Page {page['page']}", fill="#183b50")
    sheet.save(QA / f"contact-sheet-{group+1}.jpg", quality=90)
report = {"status": "pass", "pdf": PDF.name, "sha256": sha256(PDF), "bytes": PDF.stat().st_size,
          "pageCount": 10, "figureCount": 20, "pageSize": "A4 portrait", "captionSizePt": 9,
          "fixedImageFrameMm": [176, 90], "texWarnings": warnings,
          "captureHashesVerified": capture_count, "operationalStateUnchanged": True,
          "pages": pages, "images": image_records,
          "manualReview": "Required separately after each final compilation; see visual-review.json."}
(DIRECTORY / "validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: report[key] for key in ("status", "pageCount", "figureCount", "pageSize", "bytes", "sha256")}))
