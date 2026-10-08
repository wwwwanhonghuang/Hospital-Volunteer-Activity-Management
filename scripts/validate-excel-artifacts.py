# SPDX-License-Identifier: AGPL-3.0-only
"""Independently inspect the example OOXML archives using Python's standard library."""
import json
import math
import posixpath
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'p': 'http://schemas.openxmlformats.org/package/2006/relationships'}


def inspect(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, 'ZIP CRC failure'
        names = archive.namelist()
        assert not any('vbaProject' in name or '/externalLinks/' in name for name in names)
        for name in names:
            if name.endswith(('.xml', '.rels')):
                ET.fromstring(archive.read(name))
        shared = ET.fromstring(archive.read('xl/sharedStrings.xml'))
        strings = [''.join(item.itertext()) for item in shared.findall('s:si', NS)]
        assert any('\u5b88\u7e54 SHUORI' in value for value in strings)
        relations = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        targets = {item.attrib['Id']: item.attrib['Target'] for item in relations}
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        tables = {}
        for sheet in workbook.findall('s:sheets/s:sheet', NS):
            target = targets[sheet.attrib['{' + NS['r'] + '}id']]
            source = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
            xml = ET.fromstring(archive.read(source))
            assert xml.find('s:autoFilter', NS) is not None
            assert xml.find('s:sheetViews/s:sheetView/s:pane', NS).attrib['state'] == 'frozen'
            assert not xml.findall('.//s:f', NS), 'No generated workbook should contain formulas'
            assert xml.find('s:hyperlinks', NS) is None
            rows = {}
            for row in xml.findall('s:sheetData/s:row', NS):
                values = {}
                for cell in row.findall('s:c', NS):
                    column = ''.join(character for character in cell.attrib['r'] if character.isalpha())
                    value = cell.find('s:v', NS)
                    if value is None or value.text is None:
                        continue
                    kind = cell.attrib.get('t', 'n')
                    values[column] = strings[int(value.text)] if kind == 's' else bool(int(value.text)) if kind == 'b' else float(value.text)
                rows[int(row.attrib['r'])] = values
            headers = rows[5]
            tables[sheet.attrib['name']] = [
                {header: values.get(column) for column, header in headers.items()}
                for number, values in rows.items() if number >= 6 and values
            ]
        for entry in tables['Overview']:
            assert entry['Data rows'] == len(tables[entry['Worksheet']])
        if 'Monthly summary' in tables:
            metrics = {entry['Metric']: entry['Value'] for entry in tables['Monthly summary']}
            records = tables['Activity records']
            assert math.isclose(metrics['Volunteer hours'], sum(entry['Recorded hours'] for entry in records))
            assert metrics['Service interactions'] == sum(entry['Service interactions'] for entry in records)
            assert metrics['Participating volunteers'] == len({entry['Volunteer ID'] for entry in records})
        if 'Volunteers' in tables:
            for volunteer in tables['Volunteers']:
                assert isinstance(volunteer['Phone (text)'], (str, type(None)))
                assert isinstance(volunteer['Joined date'], float), 'Dates must be Excel serial numbers'
        return {'file': path.as_posix(), 'worksheets': len(tables),
                'dataRows': sum(len(rows) for name, rows in tables.items() if name != 'Overview')}


results = [inspect(path) for path in sorted(Path('artifacts/exports').glob('*.xlsx'))]
assert len(results) == 5
report = {'passed': True, 'reader': 'Python stdlib ZIP and XML, independent of ExcelJS',
          'checks': ['ZIP CRC and XML well-formedness', 'Unicode brand text', 'Frozen headings and filters',
                     'Workbook index counts', 'No formulas, macros or external links',
                     'Independent monthly totals', 'Phone text and numeric date storage'], 'files': results}
Path('artifacts/qa/excel-ooxml.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
