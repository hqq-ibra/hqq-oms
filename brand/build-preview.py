"""Assemble the self-contained HQQ site preview: inline fonts + images, no external requests."""
from PIL import Image
import base64, io, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
C = r'C:\Users\Lenovo\Desktop\Claude App\hqq-oms\.superpowers\brainstorm\1715-1785073632\content'
OUT = r'C:\Users\Lenovo\Desktop\Claude App\hqq-oms\brand\site-preview.html'
NAVY = (5, 14, 27)      # --g0, the card image ground
PANEL = (243, 245, 248)  # the light customer-logo panel


def enc(src, width, fmt='JPEG', q=80, bg=NAVY):
    im = Image.open(os.path.join(C, src))
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        if fmt != 'PNG':
            flat = Image.new('RGB', im.size, bg)
            flat.paste(im, mask=im.split()[-1])
            im = flat
    else:
        im = im.convert('RGB')
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    if fmt == 'PNG':
        im.save(buf, 'PNG', optimize=True); mime = 'image/png'
    else:
        im.save(buf, 'JPEG', quality=q, optimize=True, progressive=True); mime = 'image/jpeg'
    d = buf.getvalue()
    return f'data:{mime};base64,' + base64.b64encode(d).decode(), len(d)


JOBS = {
 'logo':      ('logo2.png',        240, 'PNG',  0,  NAVY),
 'vacuum':    ('c-vacuum.png',    1000, 'JPEG', 80, NAVY),
 'sorting':   ('c-sorting.png',   1000, 'JPEG', 80, NAVY),
 'brush':     ('c-brush.png',      900, 'JPEG', 80, NAVY),
 'pitting':   ('c-pitting.png',    900, 'JPEG', 80, NAVY),
 'silicone':  ('c-silicone.png',   900, 'JPEG', 80, NAVY),
 'measuring': ('c-measuring.png', 1100, 'JPEG', 78, NAVY),
 'blades':    ('c-blades.png',     900, 'JPEG', 80, NAVY),
 'spares':    ('cut-spares.png',   860, 'JPEG', 80, NAVY),
 'chains':    ('m-chains.png',     860, 'JPEG', 80, NAVY),
}
for i, n in enumerate(['alemtyaz', 'khammash', 'basqat', 'alameen', 'ruwad', 'altayyar', 'tamra', 'thimar'], 1):
    JOBS[f'c{i}'] = (f'cust-{n}.png', 260, 'JPEG', 86, PANEL)

WA = ('<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 '
      '3.46 1.32 4.96L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 '
      '18.02a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.25-4.35c0-4.54 3.7-8.23 8.23-8.23 '
      '2.2 0 4.26.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.24 8.22zm4.43-6.64c-.3-.15-1.76-.87-2.03-.97-.27'
      '-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17'
      '-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5'
      '-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26'
      '.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/></svg>')
TEL = ('<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 '
       '1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 '
       '1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z"/></svg>')

imgs, total = {}, 0
for key, (src, w, fmt, q, bg) in JOBS.items():
    uri, n = enc(src, w, fmt, q, bg)
    imgs[key] = uri
    total += n

html = io.open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
html = html.replace('{{FONTS}}', io.open(os.path.join(HERE, 'fonts.css'), encoding='utf-8').read())
html = html.replace('{{WA}}', WA).replace('{{TEL}}', TEL)
for k, v in imgs.items():
    html = html.replace('{{IMG:%s}}' % k, v)

leftover = re.findall(r'\{\{[^}\n]*\}\}', html)
assert not leftover, f'unreplaced placeholders: {leftover[:3]}'
assert 'html{direction:rtl}' in html, 'RTL rule missing — artifact host owns <html>'
io.open(OUT, 'w', encoding='utf-8').write(html)
print(f'images {total // 1024} KB raw -> page {len(html) // 1024} KB')
print(OUT)
