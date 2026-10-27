# แก้โค้ด meraofficial.co: เร็วขึ้น + ถามข้อมูลสมาชิกครั้งเดียว

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
