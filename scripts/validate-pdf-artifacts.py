# SPDX-License-Identifier: AGPL-3.0-only
"""Parse every sample PDF and render all pages for a visual review contact sheet.

Requires pypdf, pypdfium2 and Pillow. These are QA-only dependencies; SHUORI's
runtime uses PDFKit and the bundled font, without a browser or Python.
"""
from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone

from pypdf import PdfReader
import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'artifacts' / 'qa'
QA.mkdir(parents=True, exist_ok=True)
for old_sheet in QA.glob('pdf-views-contact-sheet-*.png'):
    old_sheet.unlink()
VIEWS = ['volunteer-timeline', 'station-timeline', 'weekly-roster', 'event-brief', 'event-agenda']
report = {'status': 'pass', 'generatedAt': datetime.now(timezone.utc).isoformat(), 'documents': []}
font = ImageFont.load_default(size=14)
previews = []

for view in VIEWS:
    file = ROOT / 'artifacts' / 'exports' / f'shuori-demo-{view}.pdf'
    data = file.read_bytes()
    reader = PdfReader(file, strict=True)
    texts = [page.extract_text() for page in reader.pages]
    assert not reader.is_encrypted, f'{view}: unexpectedly encrypted'
    assert reader.metadata.title.startswith('SHUORI'), f'{view}: missing title'
    assert all(text.strip() for text in texts), f'{view}: blank page'
    assert all('守織 SHUORI' in text for text in texts), f'{view}: missing page header'
    for index, (page, text) in enumerate(zip(reader.pages, texts)):
        assert f'{index + 1} / {len(reader.pages)}' in text, f'{view}: missing page number'
        for resource in page['/Resources']['/Font'].values():
            resource = resource.get_object()
            if resource.get('/Subtype') == '/Type0':
                assert '/ToUnicode' in resource, f'{view}: font lacks a Unicode map'
                descriptor = resource['/DescendantFonts'][0].get_object()['/FontDescriptor']
                assert '/FontFile2' in descriptor or '/FontFile3' in descriptor, f'{view}: unembedded font'
    full = '\n'.join(texts)
    assert 'Names only;' in full, f'{view}: missing privacy scope'
    assert 'example.invalid' not in full, f'{view}: contact email leaked'
    assert 'healthDueDate' not in full, f'{view}: health record leaked'
    expected = 'Event briefing sheet' if view == 'event-brief' else 'Activity register'
    assert expected in full, f'{view}: missing primary contents'
    pdf = pdfium.PdfDocument(file)
    for index in range(len(pdf)):
        page = pdf[index]
        text_page = page.get_textpage()
        for char_index in range(text_page.count_chars()):
            char = text_page.get_text_range(char_index, 1)
            if not char.strip():
                continue
            left, bottom, right, top = text_page.get_charbox(char_index)
            assert left >= 0 and bottom >= 0 and right <= page.get_width() and top <= page.get_height(), f'{view}: off-page text on page {index + 1}'
        text_page.close()
        bitmap = page.render(scale=1.25)
        image = bitmap.to_pil().convert('RGB')
        if index == 0:
            image.save(QA / f'pdf-{view}-first-page.png')
        image.thumbnail((540, 710))
        tile = Image.new('RGB', (568, image.height + 43), '#e7eff2')
        tile.paste(image, ((568 - image.width) // 2, 29))
        draw = ImageDraw.Draw(tile)
        draw.text((14, 7), f'{view}  /  {index + 1} of {len(pdf)}', fill='#183c4a', font=font)
        previews.append(tile)
        bitmap.close()
        page.close()
    pdf.close()
    report['documents'].append({
        'file': file.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(data).hexdigest(),
        'bytes': len(data), 'pages': len(reader.pages), 'textCharacters': len(full),
        'unicodeSearchable': True, 'embeddedFont': True, 'numberedPages': True,
        'allGlyphBoundsInsidePage': True,
        'pageSizePoints': list(map(float, reader.pages[0].mediabox[2:])),
    })

for offset in range(0, len(previews), 6):
    tiles = previews[offset:offset + 6]
    heights = [max(tile.height for tile in tiles[row:row + 3]) for row in range(0, len(tiles), 3)]
    sheet = Image.new('RGB', (568 * 3, sum(heights)), '#d4e4e9')
    for index, tile in enumerate(tiles):
        sheet.paste(tile, ((index % 3) * 568, sum(heights[:index // 3])))
    sheet.save(QA / f'pdf-views-contact-sheet-{offset // 6 + 1}.png')
report['renderedPages'] = len(previews)
report['visualReview'] = 'All pages rendered into contact sheets; visual inspection is a separate reviewer action.'
(QA / 'pdf-view-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': report['status'], 'documents': len(VIEWS), 'pages': len(previews)}))
