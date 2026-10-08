# PDF font

`NotoSansJP-Regular.ttf` is a static weight-400 instance of Noto Sans JP from Google Fonts. The pinned upstream URL, original and derived SHA-256 values and modification are recorded in [provenance.json](provenance.json). The full character set is retained; PDFKit embeds only the glyphs used by each document.

This third-party font is licensed under the **SIL Open Font License 1.1**, reproduced in [OFL.txt](OFL.txt). It is excluded from the project's AGPL software and CC creative-asset license grants. The font's copyright and reserved-font-name notice remain intact.

The static instance was generated with `fontTools.varLib.instancer.instantiateVariableFont(font, {'wght': 400}, inplace=True)` and saved as a TrueType font. This preparation tool is not needed to run SHUORI. No system fonts, font downloads or browser executable are required for PDF export.
