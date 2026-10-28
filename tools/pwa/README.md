# Mera web app (PWA)

ไฟล์ต้นฉบับของส่วน "ติดตั้งเป็นแอป" ที่ใส่ไว้ใน `meracatalogue-site.zip`

| ไฟล์ | หน้าที่ |
|---|---|
| `manifest.webmanifest` | ชื่อแอป สี และไอคอน |
| `sw.js` | ให้ติดตั้งได้ และเปิดเร็วขึ้น (ไม่เก็บราคา/สต็อกค้าง ไม่แตะ LINE หรือ Apps Script) |
| `pwa.js` | ลงทะเบียน sw.js + แบนเนอร์ "ติดตั้งแอป Mera" บนมือถือ |
| `mera-round-logo.png` | โลโก้กลมที่ใช้ทำไอคอน |
| `build.py` | สร้างไอคอนทุกขนาดและใส่ไฟล์ทั้งหมดลงในโฟลเดอร์เว็บ |

## แก้แล้วใส่กลับ
```bash
mkdir site && unzip -q meracatalogue-site.zip -d site
python3 tools/pwa/build.py tools/pwa/mera-round-logo.png site
(cd site && rm -f ../meracatalogue-site.zip && zip -qrX ../meracatalogue-site.zip .)
```
ถ้าแก้ `sw.js` ให้เปลี่ยน `VERSION` ในไฟล์ด้วย เพื่อให้มือถือลูกค้าโหลดชุดใหม่
