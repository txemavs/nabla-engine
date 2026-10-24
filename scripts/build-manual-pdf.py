"""Build the Spanish reading edition. Requires ReportLab and the fonts selected below.

Run from any directory. Translation is maintained in docs/manual/es/lectura.md;
regeneration does not translate later changes to the English prose automatically.
"""

from pathlib import Path
import hashlib
import html
import json
import re
import textwrap

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfdoc import PDFString
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, XPreformatted, Flowable, KeepTogether,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/manual/es/lectura.md'
OUT = ROOT / 'output/pdf'
OUT.mkdir(parents=True, exist_ok=True)
PDF = OUT / 'manual-nabla-engine-es.pdf'
FONT_DIR = Path('C:/Windows/Fonts')
for name, filename in [
    ('Book', 'arial.ttf'), ('BookBold', 'arialbd.ttf'),
    ('BookItalic', 'ariali.ttf'), ('BookBoldItalic', 'arialbi.ttf'),
    ('Code', 'consola.ttf'), ('CodeBold', 'consolab.ttf'),
]:
    pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / filename)))
pdfmetrics.registerFontFamily('Book', normal='Book', bold='BookBold',
                              italic='BookItalic', boldItalic='BookBoldItalic')
pdfmetrics.registerFontFamily('Code', normal='Code', bold='CodeBold', italic='Code', boldItalic='CodeBold')

NAVY = colors.HexColor('#102D3D')
TEAL = colors.HexColor('#007F7A')
INK = colors.HexColor('#263B46')
MUTED = colors.HexColor('#586D77')
PALE = colors.HexColor('#F0F5F6')
LINE = colors.HexColor('#CFDDE1')
PAGE_W, PAGE_H = A4
LEFT, RIGHT, TOP, BOTTOM = 56, 56, 61, 53
WIDTH = PAGE_W - LEFT - RIGHT

styles = {
    'body': ParagraphStyle('body', fontName='Book', fontSize=10.2, leading=14.4,
                           textColor=INK, spaceAfter=7, allowWidows=0, allowOrphans=0),
    'h1': ParagraphStyle('h1', fontName='BookBold', fontSize=23, leading=28,
                         textColor=NAVY, spaceAfter=16, keepWithNext=True),
    'h2': ParagraphStyle('h2', fontName='BookBold', fontSize=12.3, leading=17,
                         textColor=TEAL, spaceBefore=12, spaceAfter=6, keepWithNext=True),
    'bullet': ParagraphStyle('bullet', fontName='Book', fontSize=10.2, leading=15,
                             leftIndent=14, firstLineIndent=-10, textColor=INK,
                             spaceAfter=6, allowWidows=0, allowOrphans=0),
    'source': ParagraphStyle('source', fontName='Book', fontSize=8.2, leading=11.6,
                             textColor=MUTED, spaceBefore=6, spaceAfter=8),
    'cell': ParagraphStyle('cell', fontName='Book', fontSize=8.4, leading=11.7,
                           textColor=INK, splitLongWords=True),
    'headcell': ParagraphStyle('headcell', fontName='BookBold', fontSize=8.5,
                               leading=11.7, textColor=colors.white),
    'code': ParagraphStyle('code', fontName='Code', fontSize=7.5, leading=10.6,
                           textColor=NAVY, backColor=PALE, borderPadding=8,
                           spaceBefore=5, spaceAfter=10),
    'toc': ParagraphStyle('tocentry', fontName='Book', fontSize=10.1, leading=16.5,
                          textColor=INK, spaceBefore=2, leftIndent=0, firstLineIndent=0),
}
styles['compact'] = ParagraphStyle('compact', parent=styles['body'], fontSize=9.8, leading=13.4, spaceAfter=6)
styles['terrain'] = ParagraphStyle('terrain', parent=styles['body'], fontSize=9.7, leading=12.8, spaceAfter=5)


def normalized(text):
    return text.replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '-')


def inline(text):
    text = html.escape(normalized(text), quote=False)
    text = re.sub(r'`([^`]+)`', lambda m: '<font name="Code" size="8.2">' + m[1] + '</font>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    return text


class Cover(Flowable):
    def __init__(self, version):
        super().__init__()
        self.width = WIDTH
        self.height = PAGE_H - TOP - BOTTOM - 2
        self.version = version

    def draw(self):
        c = self.canv
        h = self.height
        c.setFillColor(NAVY)
        c.rect(-LEFT, -BOTTOM, PAGE_W, PAGE_H, fill=1, stroke=0)
        c.setFillColor(TEAL)
        c.rect(0, h - 80, 58, 5, fill=1, stroke=0)
        c.setFont('BookBold', 10)
        c.setFillColor(colors.HexColor('#8BD7CD'))
        c.drawString(0, h - 53, 'DOCUMENTACIÓN TÉCNICA  /  EDICIÓN DE LECTURA')
        c.setFillColor(colors.white)
        c.setFont('BookBold', 38)
        c.drawString(0, h - 156, 'El Manual de')
        c.drawString(0, h - 205, 'Nabla Engine')
        c.setFont('Book', 17)
        c.setFillColor(colors.HexColor('#D5E3E8'))
        c.drawString(0, h - 259, 'Arquitectura, uso y desarrollo')
        c.drawString(0, h - 284, 'de mundos interactivos')
        c.setStrokeColor(colors.HexColor('#456471'))
        c.line(0, 183, WIDTH, 183)
        c.setFillColor(colors.white)
        c.setFont('BookBold', 12)
        c.drawString(0, 151, '26 capítulos  ·  6 apéndices  ·  ejemplos prácticos')
        c.setFont('Book', 10.5)
        c.setFillColor(colors.HexColor('#B9CED7'))
        c.drawString(0, 119, 'Edición en español · 23 de octubre de 2026')
        c.drawString(0, 98, f'Base técnica revisada: @nabla/engine {self.version}')
        c.setFont('Book', 9)
        c.drawString(0, 43, 'Para desarrolladores, creadores de contenido y agentes.')
        c.drawString(0, 26, 'Incluye índice navegable y marcadores de capítulos.')


class ManualDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=A4, leftMargin=LEFT, rightMargin=RIGHT,
                         topMargin=TOP, bottomMargin=BOTTOM,
                         title='El Manual de Nabla Engine - Edición en español',
                         author='Nabla Engine', subject='Arquitectura, uso y desarrollo de mundos interactivos')
        frame = Frame(LEFT, BOTTOM, WIDTH, PAGE_H - TOP - BOTTOM,
                      leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(PageTemplate(id='book', frames=[frame], onPage=self.page_chrome))

    def page_chrome(self, canvas, doc):
        if doc.page == 1:
            canvas.setViewerPreference('DisplayDocTitle', 'true')
            canvas._doc.Catalog.Lang = PDFString('es-ES')
            return
        canvas.saveState()
        canvas.setFont('BookBold', 7.6)
        canvas.setFillColor(MUTED)
        canvas.drawString(LEFT, PAGE_H - 32, 'NABLA ENGINE')
        canvas.setFont('Book', 7.6)
        canvas.drawRightString(PAGE_W - RIGHT, PAGE_H - 32, 'MANUAL EN ESPAÑOL')
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(LEFT, PAGE_H - 41, PAGE_W - RIGHT, PAGE_H - 41)
        canvas.line(LEFT, 39, PAGE_W - RIGHT, 39)
        canvas.setFont('Book', 8)
        canvas.drawString(LEFT, 25, 'Edición de lectura · 23/10/2026')
        canvas.drawRightString(PAGE_W - RIGHT, 25, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark'):
            title = flowable.getPlainText()
            self.canv.bookmarkPage(flowable.bookmark)
            self.canv.addOutlineEntry(title, flowable.bookmark, flowable.level, closed=False)
            if flowable.level == 0:
                self.notify('TOCEntry', (0, title, self.page, flowable.bookmark))


package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
source_text = SOURCE.read_text(encoding='utf-8')
chapters = re.findall(r'^# (\d+)\. ', source_text, re.M)
assert chapters == [str(n) for n in range(1, 27)], 'Expected all 26 chapters in order'
rows = ['| Entrada pública | Archivo fuente |', '| --- | --- |']
for suffix, target in package['exports'].items():
    imported = target if isinstance(target, str) else target['import']
    source = imported.replace('./dist/', 'src/').removesuffix('.js') + '.ts'
    assert (ROOT / source).exists(), source
    name = 'raíz' if suffix == '.' else suffix[1:]
    rows.append(f'| `{name}` | `{source}` |')
source_text = source_text.replace('{{PUBLIC_API}}', '\n'.join(rows))
for marker, name in [('SCENE', 'scene.mjs'), ('SESSION', 'session.mjs'),
                     ('CONTRACTS', 'contracts.mjs'), ('BROWSER', 'browser.ts')]:
    content = (ROOT / 'examples/manual' / name).read_text(encoding='utf-8')
    source_text = source_text.replace('{{EXAMPLE_' + marker + '}}', '```js\n' + content.rstrip() + '\n```')
assert '{{' not in source_text, 'Unresolved template marker'

toc = TableOfContents()
toc.levelStyles = [styles['toc']]
story = [Cover(package['version']), PageBreak(), Paragraph('Índice', styles['h1']),
         Paragraph('Selecciona un capítulo para ir a su página. El panel de marcadores del lector PDF permite navegar también por secciones.', styles['body']),
         Spacer(1, 12), toc, PageBreak()]

lines = source_text.splitlines()
i = 0
heading_counter = 0
first_h1 = True
current_chapter = ''
while i < len(lines):
    line = lines[i].strip()
    if not line:
        i += 1
        continue
    if line.startswith('```'):
        block = []
        i += 1
        while i < len(lines) and not lines[i].startswith('```'):
            value = normalized(lines[i]).expandtabs(4)
            block.extend(textwrap.wrap(value, width=100, replace_whitespace=False,
                                       drop_whitespace=False, break_long_words=True,
                                       break_on_hyphens=False) or [''])
            i += 1
        # Keep complete examples with their introduction when they fit on a page.
        code_group = [XPreformatted(html.escape('\n'.join(block)), styles['code'])]
        if len(block) > 15 and isinstance(story[-1], Paragraph):
            code_group.insert(0, story.pop())
            if isinstance(story[-1], Paragraph) and getattr(story[-1], 'level', None) == 1:
                code_group.insert(0, story.pop())
        story.append(KeepTogether(code_group))
        i += 1
        continue
    if line.startswith('|'):
        data = []
        while i < len(lines) and lines[i].strip().startswith('|'):
            row = [v.strip() for v in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-+:?', v.replace(' ', '')) for v in row):
                data.append(row)
            i += 1
        n = len(data[0])
        widths = ([WIDTH * 0.40, WIDTH * 0.60] if n == 2 else
                  [WIDTH * 0.30, WIDTH * 0.34, WIDTH * 0.36])
        cells = [[Paragraph(inline(v), styles['headcell'] if j == 0 else styles['cell'])
                  for v in row] for j, row in enumerate(data)]
        table = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT', spaceAfter=13)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), NAVY),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, PALE]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LINEBELOW', (0, 0), (-1, 0), 0.5, NAVY),
            ('LINEBELOW', (0, 1), (-1, -1), 0.25, LINE),
        ]))
        story.append(table)
        continue
    heading = re.match(r'^(#{1,2}) (.+)$', line)
    if heading:
        level = len(heading[1]) - 1
        if level == 0:
            current_chapter = heading[2].split('.')[0]
            if not first_h1:
                story.append(PageBreak())
            first_h1 = False
        paragraph = Paragraph(inline(heading[2]), styles['h1' if level == 0 else 'h2'])
        heading_counter += 1
        paragraph.bookmark = f'section-{heading_counter}'
        paragraph.level = level
        story.append(paragraph)
        i += 1
        continue
    bullet = re.match(r'^(-|\d+\.) (.+)$', line)
    if bullet:
        prefix = '•' if bullet[1] == '-' else bullet[1]
        story.append(Paragraph(prefix + ' ' + inline(bullet[2]), styles['bullet']))
        i += 1
        continue
    paragraph_lines = [line]
    i += 1
    while i < len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|- |\d+\. )', lines[i]):
        paragraph_lines.append(lines[i].strip())
        i += 1
    content = ' '.join(paragraph_lines)
    style = (styles['source'] if content.startswith('**Fuentes:') else
             styles['terrain'] if current_chapter == '10' else
             styles['compact'] if current_chapter == '5' else styles['body'])
    story.append(Paragraph(inline(content), style))

doc = ManualDoc(str(PDF))
doc.multiBuild(story)
manifest = {
    'pdf': PDF.name, 'language': 'es', 'package_version': package['version'],
    'source': str(SOURCE.relative_to(ROOT)),
    'translation_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'english_sources': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in sorted((ROOT / 'docs/manual').glob('*.md'))},
    'pages': doc.page, 'chapters': len(chapters), 'public_entry_points': len(package['exports']),
}
(OUT / 'manual-nabla-engine-es.provenance.json').write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest | {'english_sources': f"{len(manifest['english_sources'])} source hashes"}, ensure_ascii=False, indent=2))
