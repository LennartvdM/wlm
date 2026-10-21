#!/usr/bin/env python3
"""Render page 1 of every publication PDF to a small WebP cover + record PDF facts.

    python3 scripts/make-covers.py            # only PDFs without a cover yet
    python3 scripts/make-covers.py --force    # re-render everything

Needs poppler (pdftoppm, pdfinfo) and Pillow. Output:
    publicaties/covers/<pdf-name-without-.pdf>.webp
    publicaties/pdf-meta.json   { "<file>.pdf": { "pages", "bytes", "cover": {w, h, plain} } }
CROP takes the front half of a cover that was exported as a back+front spread.
"plain" marks a bare title page (no colour): the page draws its own cover for those.
"""
import json, os, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDFS = os.path.join(ROOT, 'publicaties', 'pdf')
OUT = os.path.join(ROOT, 'publicaties', 'covers')
META = os.path.join(ROOT, 'publicaties', 'pdf-meta.json')
WIDTH = 480
CROP = {
    '101-vragen-over-vrouwen-en-techniek.pdf': 'right',
    'alle-troeven-in-handen.pdf': 'right',
    'dealing-with-an-ageing-labour-force.pdf': 'right',
    'sleutels-tot-succes.pdf': 'right',
    'werken-aan-gelijke-kansen-en-non-discriminatie.pdf': 'right',
    'working-and-ageing-cedefop.pdf': 'right',
    'scherven-brengen-geluk.pdf': 'center',
}

force = '--force' in sys.argv
os.makedirs(OUT, exist_ok=True)
meta = {}
for name in sorted(os.listdir(PDFS)):
    if not name.lower().endswith('.pdf'):
        continue
    path = os.path.join(PDFS, name)
    info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    pages = next((int(l.split()[-1]) for l in info.splitlines() if l.startswith('Pages:')), None)
    target = os.path.join(OUT, name[:-4] + '.webp')
    if force or not os.path.exists(target):
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-scale-to-x', str(WIDTH * 4), '-scale-to-y', '-1',
                            '-png', path, os.path.join(tmp, 'p')], check=True, stderr=subprocess.DEVNULL)
            png = os.path.join(tmp, sorted(os.listdir(tmp))[0])
            im = Image.open(png).convert('RGB')
            w, h = im.size
            crop = CROP.get(name)
            if crop == 'right':
                im = im.crop((w // 2, 0, w, h))
            elif crop == 'center':
                im = im.crop((w // 4, 0, w - w // 4, h))
            im.thumbnail((WIDTH, WIDTH * 2), Image.LANCZOS)
            im.save(target, 'WEBP', quality=80, method=6)
        print('cover', name)
    im = Image.open(target)
    sat = sum(p[1] for p in im.convert('HSV').resize((60, 80)).getdata()) / (60 * 80)
    meta[name] = {'pages': pages, 'bytes': os.path.getsize(path),
                  'cover': {'w': im.width, 'h': im.height, 'plain': sat < 2}}

with open(META, 'w') as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)
    f.write('\n')
print(f'{len(meta)} pdfs → {os.path.relpath(META, ROOT)}')
