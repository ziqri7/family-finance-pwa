"""Hanya menyiapkan LABEL dari workbook sumber yang telah dipetakan, tanpa nominal."""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import hashlib, json
source=Path('Keu.xlsx')
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with ZipFile(source) as book:
    strings=[]
    if 'xl/sharedStrings.xml' in book.namelist():
        strings=[''.join(n.itertext()) for n in ET.fromstring(book.read('xl/sharedStrings.xml')).findall('m:si',ns)]
    sheet=ET.fromstring(book.read('xl/worksheets/sheet1.xml'))
    cells={c.attrib['r']:c for c in sheet.findall('.//m:sheetData/m:row/m:c',ns)}
    rows=[]
    for index in range(16):
        c=cells['A'+str(index+2)]
        v=c.find('m:v',ns)
        label=strings[int(v.text)] if c.attrib.get('t')=='s' else ''.join(c.find('m:is',ns).itertext()) if c.attrib.get('t')=='inlineStr' else v.text
        rows.append({'label':label,'kind':'income' if index<2 else 'transfer_out' if index==10 else 'allocation'})
template=json.loads(Path('data/template.json').read_text(encoding='utf-8'))
template['partner-a']=rows
Path('private').mkdir(exist_ok=True)
Path('private/template.json').write_text(json.dumps(template,ensure_ascii=False,indent=2),encoding='utf-8')
print('16 label sumber disiapkan secara privat; nominal tidak disalin.')
print('SHA256 workbook:',hashlib.sha256(source.read_bytes()).hexdigest())
