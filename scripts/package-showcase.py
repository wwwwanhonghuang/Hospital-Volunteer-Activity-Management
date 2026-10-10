# SPDX-License-Identifier: AGPL-3.0-only
"""Bundle the reviewed PDF, editable LaTeX, images, font and license notices."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parents[1]
source = root / "artifacts/showcase"
digest = lambda content: hashlib.sha256(content).hexdigest()
validation = json.loads((source / "validation.json").read_text(encoding="utf-8"))
review = json.loads((source / "visual-review.json").read_text(encoding="utf-8"))
assert review["pdfSha256"] == validation["sha256"] == digest((source / "shuori-visual-tour.pdf").read_bytes())
assert review["reviewedPages"] == list(range(1, 11)) and review["status"] == "pass"
files = {name: (source / name).read_bytes() for name in (
    "shuori-visual-tour.pdf", "shuori-visual-tour.tex", "README.md", "validation.json", "visual-review.json",
    "operations-capture.json", "spatial-capture.json", "exports-capture.json")}
for record in validation["images"]:
    content = (source / record["file"]).read_bytes()
    assert digest(content) == record["sha256"]
    files[record["file"]] = content
for name in ("NotoSansJP-Regular.ttf", "OFL.txt", "provenance.json"):
    files[f"fonts/{name}"] = (root / "server/fonts" / name).read_bytes()
files["licenses/AGPL-3.0.txt"] = (root / "LICENSE").read_bytes()
files["licenses/CC-BY-NC-SA-4.0.txt"] = (root / "LICENSES/CC-BY-NC-SA-4.0.txt").read_bytes()
files["MANIFEST.sha256"] = ("".join(f"{digest(data)}  {name}\n" for name, data in sorted(files.items()))).encode()
archive = source / "shuori-visual-tour-source.zip"
with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as output:
    for name, data in sorted(files.items()):
        output.writestr(f"shuori-visual-tour/{name}", data)
with ZipFile(archive) as packaged:
    assert packaged.testzip() is None
    assert len(packaged.namelist()) == len(files)
    for name, data in files.items():
        assert packaged.read(f"shuori-visual-tour/{name}") == data
(source / "SHA256SUMS").write_text(
    f"{digest((source / 'shuori-visual-tour.pdf').read_bytes())}  shuori-visual-tour.pdf\n"
    f"{digest(archive.read_bytes())}  {archive.name}\n", encoding="utf-8")
print(json.dumps({"archive": archive.name, "files": len(files), "bytes": archive.stat().st_size,
                  "sha256": digest(archive.read_bytes()), "validation": "All packaged bytes verified"}))
