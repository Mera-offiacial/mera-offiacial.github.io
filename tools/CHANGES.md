# หน้าแบรนด์: แคมเปญ "ช้อปได้ไม่ต้องรองาน Sale" + ยอดขายแคมเปญ (27 พ.ย. 2026)
- Apps Script ไฟล์ใหม่ `tools/apps-script/Web_Campaign.gs` (วางในโปรเจกต์ "Inventory + GB") + `Web_BrandStock.gs` ตัวใหม่ (ส่ง action แคมเปญต่อให้ · ไม่ต้องแก้ webRoute_ เพิ่ม)
- ติดตั้ง: วาง 2 ไฟล์ → Run `campSetup` 1 ครั้ง (สร้างแท็บ `Campaigns` พร้อมแถว CP-001 + แท็บ `Campaign Entries` + ตัวตั้งเวลา `campTick` ทุกชั่วโมง) → Deploy New version
- แท็บ `Campaigns`: วันเปิดรับ / Free Until (ลงทะเบียนภายในวันนี้ไม่หักค่าบริการ) / ปิดรับ / เริ่ม / จบ · Fixed Discount % (ส่วนลดมีร่า · ว่าง = ตั้งเองอย่างเดียว) · ค่าบริการ 5% / 5 ชิ้น / 4% · Status Open = แบรนด์เห็น, Closed = ปิดรับแต่ยังดูยอดได้, Draft = ซ่อน
- `brandCampaign {key}` แคมเปญ + สินค้า (รวมสี/ไซซ์) + สถานะที่ส่ง + ยอดขาย · `brandCampaignSave {key, campaignId, clientRef, agree, items[{product, mode, price, online}]}`
- กติกา: ทุกชิ้นต้องกรอกราคาออนไลน์ของแบรนด์ · ราคาแคมเปญต้องต่ำกว่าราคาบนมีร่าตอนนี้และต่ำกว่าราคาออนไลน์ · หมดสต็อกเลือกไม่ได้ · ไม่ติ๊ก = ถอนออก · แก้ราคา = รอตรวจใหม่ · แจ้งกลุ่มแอดมินทุกครั้ง
- ทีมอนุมัติที่แท็บ Campaign Entries: Status = Approved / Rejected (ใส่ Admin Note ก่อน) → แจ้งกลุ่ม LINE แบรนด์
- ถึงวันเริ่ม `campTick` เปลี่ยน Sale Price ของทุก SKU เป็นราคาแคมเปญ (จำราคาเดิมใน Price Before) · จบ / ถอน / ไม่ผ่าน → คืนราคาเดิม (ถ้ามีคนแก้ราคาไปแล้วจะไม่ทับ และเขียนใน Result) · อนุมัติระหว่างแคมเปญ = ขึ้นทันที
- ระหว่างอยู่ในแคมเปญ brandEdit แก้ราคาขาย/ราคาเต็มไม่ได้ (CAMP_LOCKED)
- ยอดขาย: Web Orders ที่ชำระแล้ว (ไม่นับ Pending Slip / Slip Rejected / Cancelled / Error) ในช่วงแคมเปญ ของรุ่นที่อนุมัติ · ค่าบริการนับชิ้นตามเวลาที่จ่าย
- `brand.html`: ป้ายแคมเปญบนแท็บต้องส่ง / สินค้า → หน้าแคมเปญ (เลือกสินค้า | ยอดขาย) · ยังไม่ติดตั้ง Apps Script = ไม่มีป้าย
- **ยังไม่ได้ทำ:** กันคูปองกับสินค้าราคาแคมเปญ (โค้ดคูปองอยู่ใน Web_Order.gs / Web_Cart.gs ซึ่งไม่อยู่ใน repo · มีฟังก์ชัน `campHasCampaignSku_(skus)` ให้ใส่) · หักค่าบริการในรอบโอน (Web_Payout.gs)
- ทดสอบ: `node tools/apps-script/test_campaign.js tools/apps-script/Web_BrandStock.gs tools/apps-script/Web_Campaign.gs` (73 กรณี) · `python3 tools/apps-script/e2e_campaign.py <โฟลเดอร์เว็บที่แตก zip>` (40 กรณี)

# แท็บสินค้า: แดชบอร์ดรูปสินค้า + แบรนด์ขอแก้ข้อมูลสินค้า (ทีม Mera อนุมัติ) (26 พ.ย. 2026)
- Palm: แก้ได้ทุกอย่างยกเว้นชื่อแบรนด์ · แจ้งทีมทุกครั้ง · ข้อมูลใหม่ต้องรอ Mera อนุมัติ · จำนวน (สต็อก) แค่แจ้ง
- หน้าแบรนด์: แท็บสินค้าเป็นการ์ดรูป 2 คอลัมน์ (สรุป 3 ช่อง, ค้นหา, กรอง ทั้งหมด/ต้องเติม/รอตรวจ, ป้ายหมด/ใกล้หมด/รอตรวจ/ไม่ผ่าน) → แตะเข้าหน้าแก้ไข: รูป ≤5 (เพิ่ม/ลบ/ตั้งหน้าปก), ชื่อ, หมวด, ราคาขาย, ราคาเต็ม, รายละเอียด, วัสดุ, ขนาด, สต็อกรายสี/ไซซ์, เพิ่มสี/ไซซ์ใหม่ · ปุ่มบันทึกเดียว: สต็อก → brandStock (ขึ้นทันที) + ข้อมูลอื่น → brandEdit (รออนุมัติ)
- Apps Script (Web_BrandStock.gs): `brandEdit` → แท็บใหม่ `Product Edits` (PE-0001…, Status Pending) + LINE กลุ่มแอดมิน · คำขอใหม่ของสินค้าเดิมทำให้อันเก่าเป็น Superseded · รูปใหม่อัปโหลดเข้าโฟลเดอร์ Mera Banners ตอนส่ง
- ทีมเลือก Status = Approved → แก้ Product Database (ชื่อ/หมวด/ราคา/% ลด), แถว SKU ใหม่ (MRA เลขสูงสุด+1, Source Form = Mera Seller), Mera Admin: Images (รูป), Product Details (รายละเอียด/วัสดุ/ขนาด), ย้ายคีย์ Images/Product Details/New Tags ตามชื่อใหม่ (ข้อมูลจากฟอร์มเดิมคัดลอกไปไว้) + LINE แจ้งกลุ่มแบรนด์ · Rejected → LINE แจ้งกลุ่มแบรนด์พร้อม Admin Note · ผิดพลาด → กลับเป็น Pending + ข้อความในช่อง Result
- ต้อง Run `bstSetup` 1 ครั้ง (สร้างแท็บ + ตัวจับการเลือก Status `bstOnEdit`) แล้ว Deploy New version
- ทดสอบ: test_brandstock.js 54 · test_brandedit.js 41 · e2e_brandedit.py 22

# แท็บสินค้า: แจ้งทีม Mera ทุกครั้งที่แบรนด์แก้สต็อก (26 พ.ย. 2026)
- Palm ขอให้แจ้งทั้งเพิ่มและลด: หัวข้อความ "📦 แบรนด์เพิ่มสต็อก" / "📉 แบรนด์ลดสต็อก" / "📦 แบรนด์แก้สต็อก" (มีทั้งสองอย่าง)
- ลดจนเหลือ 0 → "⚠️ หมดแล้ว" ท้ายบรรทัด + สรุป "หมด N รายการ"
- หน้าแบรนด์: ข้อความ "ทีม Mera จะได้รับแจ้ง" ทุกการแก้ · ช่องหมายเหตุขึ้นทุกครั้ง
- ต้องวาง Web_BrandStock.gs ใหม่ + Deploy New version · ทดสอบ 54 + 20 กรณี

# หน้าแบรนด์: แท็บ "สินค้า" — แบรนด์ดูสินค้า + เพิ่ม/ลดสต็อกเอง (26 พ.ย. 2026)
- Apps Script ไฟล์ใหม่ `tools/apps-script/Web_BrandStock.gs` (วางในโปรเจกต์ "Inventory + GB") + ใส่ 1 บรรทัดใน `webRoute_` ของ Web_Order.gs:
  `const bst = webBrandStockRoute_(b); if (bst) return bst;` แล้ว Deploy → Edit → New version
- `brandProducts {key}` สินค้าทุก SKU ของแบรนด์ (แถวที่มี Product Status) + จำนวนที่ลูกค้าจองรอโอน
- `brandStock {key, clientRef, changes[{sku,delta}], note}` แก้ Stock (+ Remaining ถ้าไม่ใช่สูตร + Inventory Status) ใต้ lock · ลดต่ำกว่าที่จองไม่ได้ · เพิ่มไม่เกิน 100/SKU · ผิดตัวเดียว = ไม่บันทึกทั้งชุด · กดซ้ำไม่บวกซ้ำ
- มีการเพิ่ม → ข้อความ LINE เข้ากลุ่มแอดมิน (ADMIN_GROUP_ID) ครั้งเดียวต่อการบันทึก · ลดอย่างเดียวไม่แจ้ง · ทุกครั้งลงแท็บใหม่ `Stock Log`
- ปุ่ม "+ ลงสินค้าใหม่" = Google Form ที่ส่งคำตอบเข้าแท็บ Product Responses (ระบบหาลิงก์ให้เอง + เติมชื่อแบรนด์ในข้อ "ชื่อแบรนด์" · ต้อง Run `bstFormCheck` 1 ครั้งเพื่ออนุญาต Google Forms · ยังไม่อนุญาต = ฟอร์มเปล่า) · Web Settings (ไม่บังคับ): `Product Form URL` = ใช้ลิงก์อื่น / `none` = ไม่มีปุ่ม · `Brand Stock` = FALSE ปิดเฉพาะแท็บนี้
- `brand.html`: แท็บที่ 5 "สินค้า" (ตัวเลขบนแท็บ = แบบที่หมด) · สรุปจำนวน · ปุ่ม − / + หรือพิมพ์จำนวน "เหลือ" · แถบบันทึกด้านล่าง + หมายเหตุถึงทีม · ยังไม่ติดตั้ง Apps Script = ขึ้น "ยังไม่เปิดใช้งาน"
- ทดสอบ: `node tools/apps-script/test_brandstock.js tools/apps-script/Web_BrandStock.gs` (52 กรณี) · `python3 tools/apps-script/e2e_brandstock.py <โฟลเดอร์เว็บที่แตก zip>` (20 กรณี)

# ที่มาของคนเข้าเว็บ → KPI Tracker (21 พ.ย. 2026)
- ไฟล์ใหม่ `assets/track.5a01a9fa.js`: จำที่มา (utm / เว็บที่ส่งต่อ / แอป IG-FB-TikTok-LINE / direct) ครั้งแรกและล่าสุด แล้วส่ง visit / view / login / order ไป Apps Script "Mera Traffic" (`tools/apps-script/Traffic.gs`) → แท็บ Traffic + Traffic Visitors ใน KPI Tracker
- `assets/app.29f7b090.js` = app.64da4c68.js + 2 บรรทัด (MeraTrack.view ใน trackView, MeraTrack.login หลังได้ idToken) · checkout.js ไม่แก้ (ใช้ event `mera:order` เดิม)
- `index.html` และ `staging/index.html`: เพิ่ม `window.MERA_TRACK = { api: "" }` + track.js ก่อน checkout.js · api = ลิงก์ /exec ของ Mera Traffic (บัญชี mera.officialteam) · ว่าง = ไม่ส่ง
- ย้อนกลับ: เปลี่ยน app.29f7b090.js → app.64da4c68.js และลบ 2 บรรทัด MERA_TRACK / track.js
- ลิงก์: `https://meraofficial.co/?utm_source=instagram&utm_medium=social&utm_campaign=zensation` (ใส่ `&code=XXX` ต่อได้)
- `oa.html` (ใหม่): ลิงก์ให้คนกดแอดเพื่อน LINE OA แบบนับที่มาได้ → บันทึก visit + view (Product / Deal = "Add LINE OA") แล้วพาไป `line.me/R/ti/p/@652glcdn` · เช่น `https://meraofficial.co/oa.html?utm_source=instagram&utm_medium=social&utm_campaign=zensation`

# แก้โค้ด meraofficial.co: เร็วขึ้น + ถามข้อมูลสมาชิกครั้งเดียว
> **อัปเดต:** ไม่ต้องติดตั้ง `publish-snapshot.gs` แล้ว GitHub Actions (`.github/workflows/pages.yml`) ดึงข้อมูลจาก Apps Script มาเก็บเป็น `data/catalog.json` และ `data/content.json` ทุก 10 นาทีเอง ไม่ต้องใช้ token และไม่ต้องแก้ Apps Script
> หน้าหลักใช้ไฟล์ชุดใหม่แล้ว ถ้าต้องย้อนกลับ แก้ `index.html` ใน zip กลับไปใช้ `app.35fb4581.js`, `checkout.c3b75fab.js`, `app.00ce9518.css` (ไฟล์เดิมยังอยู่)


ใช้คู่กับ `publish-snapshot.gs` (สร้าง `data/catalog.json` และ `data/content.json` ใน repo)

แก้ 2 ไฟล์: `assets/app.js` (A1–A7) และ `assets/checkout.js` (C1–C4)
แต่ละจุด "ค้นหา" ข้อความเดิมแล้ว "แทนที่" หลังแก้ต้องเปลี่ยนชื่อไฟล์หรือเลข `?v=` ใน `index.html` ด้วย เพราะ GitHub Pages ให้เบราว์เซอร์จำไฟล์ไว้ 10 นาที

**ผลลัพธ์ที่ได้**
- เปิดเว็บแล้วเห็นสินค้าทันที ไม่มีป๊อปอัป ไม่รอ Apps Script
- คำถามสมาชิกเหลือชุดเดียว 6 ข้อ ไม่มีข้อซ้ำ
- ถามครั้งเดียว ตอนกด "ซื้อเลย / สั่งซื้อ" หรือ "จองดีลผ่าน LINE" ครั้งแรก
- สมาชิกที่ตอบแล้ว ไม่ถูกถามอีก

---

## ส่วน A: `assets/app.js`

### A1. ใส่รหัส LINE ไว้ในโค้ด
ค้นหา
```js
const LIFF_ID = '';
```
แทนที่
```js
const LIFF_ID = '2011928469-icqhLzdN';
```

### A2. ไม่ขึ้นหน้าหมุนรอตอนเปิดเว็บ
ค้นหา (ใน `initGate`)
```js
  S.gate = { mode: cached ? 'off' : 'loading', step: 0, ans: {} }; render();
```
แทนที่
```js
  S.gate = { mode: 'off', step: 0, ans: {} }; render();
```

### A3. ลูกค้าที่ยังไม่ล็อกอินดูสินค้าได้เลย
ค้นหา
```js
      if (!cached && !browse) setGate({ mode: 'login' }); else if (S.gate && S.gate.mode === 'loading') setGate({ mode: 'off' });
```
แทนที่
```js
      setGate({ mode: 'off' });
```

### A4. ปิดชุดคำถาม 4 ข้อตอนเปิดเว็บ (ย้ายไปรวมกับชุดในหน้าสั่งซื้อแล้ว ดู C1)
ค้นหา (ใน `initGate`)
```js
    else if (r.ok && r.member) setGate({ mode: 'quiz', step: DEMO_START, demoOnly: true, ans: {} });
    else if (r.error === 'login_expired') { liff.logout(); setGate({ mode: 'login' }); }
    else if (r.ok) setGate({ mode: 'quiz', step: 0 });
    else setGate({ mode: 'error', err: L('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งนะคะ', 'Could not connect. Please try again') });
```
แทนที่
```js
    else if (r.error === 'login_expired') { liff.logout(); }
    setGate({ mode: 'off' });
```
และในส่วน `catch (e)` ท้าย `initGate` ค้นหา
```js
    if (!cached) setGate({ mode: 'error', err: L('เชื่อมต่อ LINE ไม่สำเร็จ ลองใหม่อีกครั้งนะคะ', 'Could not connect to LINE. Please try again') });
```
แทนที่
```js
    setGate({ mode: 'off' });
```

### A5. ปุ่ม "จองดีลผ่าน LINE" ต้องผ่านการสมัครสมาชิกก่อน
ปุ่มเดิมเป็นลิงก์ตรงไปหน้าจองดีล เปลี่ยนเป็นปุ่มที่ตรวจสมาชิกก่อน

ค้นหา (ใน `vDeal`)
```js
  h += '<a class="btn-line' + (ready ? '' : ' dis') + '" href="' + esc(ready ? dealLink(d) : '#') + '" target="_blank" rel="noopener">' + IC.line + (ready ? L('จองดีลผ่าน LINE', 'Book via LINE') : L('สินค้าหมด', 'Sold out')) + '</a>' +
```
แทนที่
```js
  h += '<button class="btn-line' + (ready ? '' : ' dis') + '"' + (ready ? ' data-a="bookDeal" data-v="' + esc(dealLink(d)) + '"' : ' disabled') + '>' + IC.line + (ready ? L('จองดีลผ่าน LINE', 'Book via LINE') : L('สินค้าหมด', 'Sold out')) + '</button>' +
```

แล้วเพิ่มบรรทัดนี้ **ก่อน** `case 'copyDeal':`
```js
    case 'bookDeal':
      if (!checkoutOn()) { location.href = v; return; }
      toast(L('กำลังตรวจสอบสมาชิก…', 'Checking membership…'));
      window.MeraCheckout.requireMember(() => { location.href = v; }, v);
      return;
```
> ปุ่มเปลี่ยนจาก `<a>` เป็น `<button>` ให้เช็คว่าหน้าตายังเหมือนเดิม ถ้าเพี้ยน เพิ่ม `button.btn-line{border:0;width:100%;font:inherit;cursor:pointer}` ใน CSS
> ลิงก์ "คัดลอกรหัสดีล" ยังกดได้โดยไม่ต้องเป็นสมาชิก ถ้าอยากให้ผ่านการสมัครทุกทาง ให้ลบลิงก์นั้นออก หรือให้แอดมินเช็คในแชท

### A6. โหลดข้อมูลสินค้าจากไฟล์บนเว็บก่อน แล้วค่อยอัปเดตจาก Apps Script
ค้นหา (ใน `boot`)
```js
  render();
  load();
```
แทนที่
```js
  render();
  if (!lastRaw) {
    fetch('data/catalog.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.text() : null))
      .then(t => {
        if (!t || lastRaw) return;              // ข้อมูลสดมาถึงก่อนแล้ว ไม่ต้องใช้
        const d = JSON.parse(t);
        if (applyLive(d)) { lastRaw = t; S.live = d.updatedAt; render(); }
      })
      .catch(() => {});
  }
  load();                                        // ยังดึงข้อมูลสดตามหลังเหมือนเดิม
```

### A7. แบนเนอร์และข้อความ ใช้ไฟล์บนเว็บก่อนเช่นกัน
เพิ่ม **ก่อน** บรรทัดแรกของ `loadContent` (`try { const c = JSON.parse(localStorage.getItem(CONTENT_KEY) ...`)
```js
  let hasContent = false; try { hasContent = !!localStorage.getItem(CONTENT_KEY); } catch (_) {}
  if (!hasContent) {
    fetch('data/content.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => {
      if (!j || !Array.isArray(j.banners) || (S.banners && S.banners.length)) return;
      S.banners = j.banners; S.pinfo = j.products || {}; if (!EDIT) TXT = j.texts || {}; render();
    }).catch(() => {});
  }
```

---

## ส่วน C: `assets/checkout.js`

### C1. คำถามสมาชิกชุดเดียว 6 ข้อ (ตัดข้อซ้ำ)
รวม 4 ข้อเดิมตอนเปิดเว็บ (อายุ เพศ จังหวัด อาชีพ) กับ 5 ข้อตอนสั่งซื้อ ตัดข้อซ้ำออก:
อายุซ้ำ, อาชีพซ้ำ, จังหวัดใช้ "พื้นที่อาศัยหลัก" แทน (จังหวัดจริงได้จากที่อยู่จัดส่งอยู่แล้ว) เหลือข้อที่ไม่ซ้ำคือเพศ

ค้นหา
```js
    { key: 'job', label: 'อาชีพ',
```
เพิ่ม **ก่อน** บรรทัดนั้น
```js
    { key: 'gender', label: 'เพศ', options: ['หญิง', 'ชาย', 'LGBTQ+', 'ไม่ระบุ'] },
```

> **สำคัญ:** ถ้าชีตหลังบ้านมีรายการคำถามสมาชิก (ที่ส่งมาเป็น `profileOptions`) เว็บจะใช้ชุดในชีตแทนชุดในโค้ด ให้เพิ่มข้อ "เพศ" ในชีตด้วย และเช็คว่าชีตไม่มีข้อซ้ำ
> คำตอบเก่าของลูกค้าที่เคยตอบชุด 4 ข้อ ระบบเติมให้อัตโนมัติอยู่แล้ว (ฟังก์ชัน `signupAnswers`) เพิ่มเพศให้เติมด้วย:

ค้นหา (ใน `signupAnswers`)
```js
    if (a.age) out.age = a.age;
```
แทนที่
```js
    if (a.age) out.age = a.age;
    if (a.gender) out.gender = a.gender;
```

### C2. เพิ่มคำสั่ง `requireMember` สำหรับปุ่มจองดีล
ค้นหา (ใน `var MeraCheckout = {`)
```js
    open: function (item) {
```
เพิ่ม **ก่อน** บรรทัดนั้น
```js
    // ตรวจสมาชิกก่อนทำอย่างอื่น (ใช้กับปุ่มจองดีล) · ยังไม่เป็นสมาชิก → หน้าสมัคร LINE → ข้อมูลสมาชิก → ทำต่อ
    requireMember: function (onReady, dealUrl) {
      return checkMember().then(function (ok) {
        if (ok) return onReady();
        S.afterMember = onReady; S.pendingDeal = dealUrl || '';
        show(); S.items = []; S.stack = []; S.view = ''; openGate();
      });
    },
```

### C3. สมัครเสร็จแล้วทำต่อทันที (ไม่ต้องผ่านหน้าต้อนรับ)
ค้นหา (ใน `saveProfile`)
```js
      S.needGate = false; S.stack = []; S.view = ''; go('welcome');
```
แทนที่
```js
      S.needGate = false; S.stack = []; S.view = '';
      if (S.afterMember) { var f = S.afterMember; S.afterMember = null; S.pendingDeal = ''; close(); f(); }
      else go('welcome');
```

### C4. ล็อกอิน LINE แล้วกลับมาจองดีลต่อ
ค้นหา (ใน `lineLogin`)
```js
      try { sessionStorage.setItem('mc_resume', JSON.stringify({ cart: S.cartMode, items: S.items })); } catch (e) {}
```
แทนที่
```js
      try { sessionStorage.setItem('mc_resume', JSON.stringify({ cart: S.cartMode, items: S.items, deal: S.pendingDeal || '' })); } catch (e) {}
```

ค้นหา (ใน `resumeAfterLogin`)
```js
    if (!r || !r.items || !r.items.length) return false;
```
แทนที่
```js
    if (r && r.deal) {
      var dt = 0;
      (function waitDeal() {
        if (CFG.testUserId || CFG.getIdToken() || dt++ > 40) return MeraCheckout.requireMember(function () { location.href = r.deal; }, r.deal);
        setTimeout(waitDeal, 250);
      })();
      return true;
    }
    if (!r || !r.items || !r.items.length) return false;
```

---

## ผลที่คาดไว้

| | ตอนนี้ | หลังแก้ |
|---|---|---|
| ลูกค้าใหม่เห็นสินค้าล่าสุด | 5–7 วินาที | ประมาณ 0.5 วินาที |
| ป๊อปอัปบังหน้าแรก | ขึ้นทันที รอ 3–9 วินาที | ไม่มี |
| คำถามที่ลูกค้าใหม่ตอบ | 4 + 5 ข้อ (ซ้ำ 2–3 ข้อ) | 6 ข้อ ครั้งเดียว |
| จองดีลโดยไม่เป็นสมาชิก | ได้ | ต้องสมัครก่อน (ครั้งแรกครั้งเดียว) |

ราคาและสต็อกในไฟล์อาจช้ากว่าชีตได้สูงสุดราว 10–15 นาที แต่เว็บดึงข้อมูลสดมาแทนที่ภายในไม่กี่วินาที และหน้า checkout ตรวจราคาและสต็อกกับระบบหลังบ้านทุกครั้งก่อนรับออเดอร์

## ทดสอบหลังขึ้นเว็บ

1. เปิดเว็บใน incognito บนมือถือ: เห็นสินค้าทันที ไม่มีป๊อปอัป
2. กด "ซื้อเลย" โดยยังไม่ล็อกอิน: สมัคร LINE → กลับมาที่สินค้าเดิม → ตอบ 6 ข้อ + ยอมรับนโยบาย → หน้าต้อนรับ → ที่อยู่ → ชำระเงิน
3. ล้างข้อมูลเว็บ แล้วกด "จองดีลผ่าน LINE": สมัคร LINE → ตอบ 6 ข้อ → ไปหน้าจองดีลทันที
4. กดจองดีลอีกครั้งด้วยบัญชีเดิม: ไปหน้าจองดีลเลย ไม่ถูกถามซ้ำ
5. เปิดลิงก์ LIFF จากแชท LINE: ล็อกอินอัตโนมัติ ไม่มีป๊อปอัปตอนเปิด
6. แก้ราคาสินค้า 1 ตัวในชีต รอ 10 นาที แล้วเปิด `meraofficial.co/data/catalog.json` ว่าราคาเปลี่ยนตาม

---

## รูปสำรองเมื่อรูปโหลดไม่ได้ (พ.ย. 2026)
ใส่สคริปต์สั้น ๆ ใน `<head>` ของ `index.html` และ `staging/index.html` (ใน zip): ถ้ารูปไหนโหลดไม่ได้ เช่น ไฟล์ใน Google Drive ไม่ได้เปิดแชร์ "Anyone with the link" จะสลับเป็นรูปสำรอง MERA สีชมพูแทนไอคอนรูปแตก
ไม่ได้แก้ `assets/app.*.js` (`brand.html` มีตัวจัดการรูปเสียของตัวเองอยู่แล้ว)

> **แก้เพิ่ม:** `assets/app.*.js` มีตัวจัดการรูปเสียอยู่แล้ว (ใน `boot()`) จึงเอาสคริปต์ใน `<head>` ที่เพิ่มไว้ด้านบนออก

---

## หน้าแอดมิน: รูปสินค้าและโลโก้แบรนด์ (พ.ย. 2026)
- `admin.html` → เมนูใหม่ "รูปสินค้าและโลโก้" อัปโหลดหลายรูป (ครอปจัตุรัสอัตโนมัติ หรือย่อเติมพื้นขาว) เรียงลำดับ ลบ บันทึก "กลับไปใช้รูปเดิม"
- `assets/app.*.js` → อ่าน `images` จาก content (`products['แบรนด์|ชื่อสินค้า']` = รายการรูป, `brands['แบรนด์']` = โลโก้) ใช้แทนรูปจากชีต/ฟอร์ม/รูปเดิมในเว็บ
- หลังบ้าน: `tools/apps-script/Web_Admin.gs` (เพิ่ม `adminImages`, `adminImageSave`, แท็บ Images ในชีต Mera Admin และส่ง `images` ไปกับ `content`) ต้องวางทับไฟล์ Web_Admin.gs ในโปรเจกต์ Apps Script "Inventory + GB" แล้ว Deploy → Manage deployments → แก้ deployment เดิม → New version (ห้ามสร้าง deployment ใหม่ ลิงก์จะเปลี่ยน)
- เพิ่ม: รูปแยกตามสี · หน้าแอดมินกด "แยกรูปตามสี" ใต้สินค้าที่มีหลายสี · เก็บเป็น Kind = color, Key = แบรนด์|ชื่อสินค้า|สี · ส่งไปหน้าเว็บเป็น `images.colors` · ลูกค้าเลือกสีไหนเห็นรูปของสีนั้นก่อน ตามด้วยรูปชุด "ทุกสี"

---

## ป้าย NEW สินค้าใหม่ (พ.ย. 2026)
- GitHub Actions (`pages.yml` ขั้น "Track first-seen dates") บันทึกวันที่สินค้าแต่ละตัวขึ้นเว็บครั้งแรกใน `data/new.json` (อ่านของเดิมจากเว็บแล้วเติมสินค้าใหม่ · ครั้งแรกใช้ `tools/new-seed.json` = สินค้าที่มีอยู่ก่อนเปิดใช้ ไม่ขึ้นป้าย)
- หน้าเว็บ (`NEW_DAYS = 14` ใน `assets/app.*.js`) ขึ้นป้าย NEW บนการ์ดสินค้า 14 วันนับจากวันที่ขึ้นเว็บ · ป้ายดีล / หมด สำคัญกว่า
- สินค้าผูกด้วย แบรนด์|ชื่อสินค้า → เปลี่ยนชื่อสินค้าในชีต = นับเป็นสินค้าใหม่
- เพิ่ม: ป้าย NEW รายสี · `data/new.json` เก็บ key แบรนด์|ชื่อสินค้า|สี ด้วย · สีใหม่ขึ้นป้าย NEW ที่ปุ่มสีในหน้าสินค้า และการ์ดสินค้าขึ้น NEW ถ้ามีสีใหม่
- ตั้งวันที่เองได้ใน `tools/new-manual.json` (ทับวันที่อัตโนมัติ) · ตอนนี้ตั้ง Narris Soft boston สี Yellow / Black Suede = 2026-11-10
- เพิ่ม: ตั้งป้าย NEW เองในหน้าแอดมิน (หน้า "รูปสินค้าและโลโก้" ทุกสินค้า/ทุกสี มีตัวเลือก NEW: อัตโนมัติ / แสดง 14 วันนับจากวันนี้ / ไม่แสดง) · เก็บในแท็บ New Tags ของชีต Mera Admin · ส่งไปหน้าเว็บเป็น `newTags` ทับค่าอัตโนมัติ · สินค้าที่ตั้ง "ไม่แสดง" ซ่อนป้ายของทุกสีด้วย · ต้อง Deploy Web_Admin.gs เวอร์ชันนี้

## ลิงก์โซเชียลมีเดีย (พ.ย. 2026)
- `SOCIAL` ใน `assets/app.*.js`: Instagram, TikTok, LINE OA · แสดงในเมนู (ใต้ "ติดต่อเรา") และท้ายหน้าแรก ("ติดตาม Mera") · แก้/เพิ่มลิงก์ที่ตัวแปรนี้

## ก๊อปรูปจาก Google Drive มาไว้บนเว็บ (พ.ย. 2026)
- อาการ: บางเครื่อง (เปิดจากลิงก์ใน IG) รูปสินค้าไม่ขึ้น · รูปทั้งหมดที่มาจากชีต/แอดมินเป็นลิงก์ Google Drive (lh3)
- GitHub Actions ขั้น "Mirror Google Drive images" ดาวน์โหลดรูป Drive ทุกรูปใน catalog.json / content.json เป็น `gimg/<id>-s` (กว้าง 400) และ `-l` (1200) + `data/gimg.json`
- หน้าเว็บ (`imgW` ใน `assets/app.*.js`) ใช้รูปจาก `gimg/` ถ้ามี · ไม่มี = ลิงก์ Drive เหมือนเดิม · `sw.js` เก็บ `gimg/` ไว้ในเครื่อง
- รูปจากฟอร์มที่ไม่ได้เปิดแชร์ ก๊อปไม่ได้ (ข้ามไป)
