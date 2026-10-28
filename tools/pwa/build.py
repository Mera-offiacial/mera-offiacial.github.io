"""Build Mera PWA icons from a square logo PNG and inject PWA files into the site folder.
usage: python3 build.py <logo.png> <site_dir>"""
import sys, os, re, hashlib, shutil
from PIL import Image
logo_path, site = sys.argv[1], sys.argv[2]
RED, CREAM = (132, 17, 50, 255), (255, 251, 237, 255)
here = os.path.dirname(os.path.abspath(__file__))
logo = Image.open(logo_path).convert('RGBA')  # round logo: cream circle with ME/RA
logo = logo.crop(logo.getbbox())
os.makedirs(f'{site}/icons', exist_ok=True)

def make(size, scale, bg):
    im = Image.new('RGBA', (size, size), bg)
    w = int(size * scale); l = logo.resize((w, w), Image.LANCZOS)
    im.alpha_composite(l, ((size - l.width) // 2, (size - l.height) // 2))
    return im
# app icons: cream fills the square (phone rounds the corners), ME/RA stays centred
make(192, 1.06, CREAM).save(f'{site}/icons/icon-192.png', optimize=True)
make(512, 1.06, CREAM).save(f'{site}/icons/icon-512.png', optimize=True)
make(512, 1.0, CREAM).save(f'{site}/icons/icon-maskable-512.png', optimize=True)  # letters inside Android safe zone
make(180, 1.06, CREAM).convert('RGB').save(f'{site}/apple-touch-icon.png', optimize=True)
make(180, 1.06, CREAM).convert('RGB').save(f'{site}/icons/apple-touch-icon.png', optimize=True)
# browser tab: the round logo itself on transparent
f = make(256, 1.0, (0, 0, 0, 0)); f.save(f'{site}/favicon.ico', sizes=[(48, 48), (32, 32), (16, 16)])
f.resize((192, 192), Image.LANCZOS).save(f'{site}/icons/favicon-192.png', optimize=True)

shutil.copy(f'{here}/manifest.webmanifest', f'{site}/manifest.webmanifest')
shutil.copy(f'{here}/sw.js', f'{site}/sw.js')
js = open(f'{here}/pwa.js', 'rb').read()
for old in os.listdir(f'{site}/assets'):
    if re.match(r'pwa\.[0-9a-f]{8}\.js$', old): os.remove(f'{site}/assets/{old}')
name = f'pwa.{hashlib.sha1(js).hexdigest()[:8]}.js'
open(f'{site}/assets/{name}', 'wb').write(js)

TAGS = ('<link rel="manifest" href="/manifest.webmanifest">\n'
        '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-title" content="Mera">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n')
for page in ['index.html']:
    p = f'{site}/{page}'; h = open(p, encoding='utf-8').read()
    h = re.sub(r'<!--PWA-->.*?<!--/PWA-->\n', '', h, flags=re.S)
    h = re.sub(r'<script src="assets/pwa\.[0-9a-f]{8}\.js" defer></script>\n', '', h)
    h = h.replace('<link rel="icon" href="favicon.ico">\n', '<link rel="icon" href="favicon.ico">\n<!--PWA-->\n' + TAGS + '<!--/PWA-->\n', 1)
    # not deferred, before checkout.js: must restore an order handed over from the app before checkout starts
    h = re.sub(r'<script src="assets/pwa\.[0-9a-f]{8}\.js"></script>\n', '', h)
    h = re.sub(r'(<script src="assets/checkout\.)', f'<script src="assets/{name}"></script>\n' + r'\1', h, count=1)
    assert '<!--PWA-->' in h and name in h
    open(p, 'w', encoding='utf-8').write(h)
print('built', name)
