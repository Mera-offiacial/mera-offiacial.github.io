import sys
from PIL import Image, ImageDraw, ImageFont
src = Image.open(sys.argv[1]).convert('RGBA')
out = sys.argv[2]
CREAM=(255,251,237,255); RED=(132,17,50,255); PINK=(254,191,199,255)
S=1024
def make(maskable=False):
    im = Image.new('RGBA',(S,S),CREAM)
    logo = src.crop((70,70,450,450))       # ตัวอักษร ME/RA + ประกาย
    sz = 560 if not maskable else 470
    logo = logo.resize((sz,sz), Image.LANCZOS)
    top = 105 if not maskable else 190
    im.alpha_composite(logo, ((S-sz)//2, top))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype('/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf', 112 if not maskable else 96)
    t='SELLER'; w = d.textlength(t, font=f)
    ph = 168 if not maskable else 144; pw = w + 150
    y0 = 700 if not maskable else 680
    x0=(S-pw)/2
    d.rounded_rectangle((x0,y0,x0+pw,y0+ph), radius=ph/2, fill=RED)
    bb = d.textbbox((0,0),t,font=f)
    d.text(((S-w)/2, y0+(ph-(bb[3]-bb[1]))/2-bb[1]), t, font=f, fill=CREAM)
    return im
a = make(); m = make(True)
a.resize((512,512),Image.LANCZOS).save(out+'/seller-512.png')
a.resize((192,192),Image.LANCZOS).save(out+'/seller-192.png')
a.convert('RGB').resize((180,180),Image.LANCZOS).save(out+'/seller-apple-touch-icon.png')
m.resize((512,512),Image.LANCZOS).save(out+'/seller-maskable-512.png')
