/**
 * Mera — หน้าแอดมิน (แบนเนอร์หน้าแรก + ข้อความบนหน้า Catalog + รูปสินค้า/โลโก้แบรนด์)
 * ------------------------------------------------------------
 * วางเป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Inventory + GB" (โปรเจกต์เดียวกับ Web_Order.gs)
 * แก้ไฟล์เดิมแค่ 1 บรรทัด: ในฟังก์ชัน webRoute_(b) ของ Web_Order.gs ใส่บรรทัดนี้เป็นบรรทัดแรก
 *
 *     const adm = webAdminRoute_(b); if (adm) return adm;
 *
 * สิ่งที่ไฟล์นี้ทำ
 *  - content          (สาธารณะ) ส่งแบนเนอร์ที่เปิดใช้ + ข้อความที่แอดมินแก้ ให้หน้า Catalog (banners = เฉพาะแบนเนอร์)
 *  - adminCheck       (LINE)    บอกหน้า Catalog ว่าบัญชี LINE นี้เป็นแอดมินไหม (ใช้โชว์ปุ่ม "หน้าแอดมิน")
 *  - adminAuth        เข้าหน้าแอดมินด้วยรหัส (ADMIN_PASSWORD) หรือด้วย LINE (ADMIN_LINE_IDS) → ได้ token ใช้ 6 ชั่วโมง
 *  - adminBanners / adminBannerSave / adminBannerDelete / adminUpload  จัดการแบนเนอร์และอัปโหลดรูป
 *  - adminTexts / adminTextSave  แก้ข้อความบนหน้า Catalog (ไทย / อังกฤษ) · ช่องว่าง = ใช้ข้อความเดิมของเว็บ
 *  - adminImages / adminImageSave  รูปสินค้าและโลโก้แบรนด์ที่แอดมินอัปโหลด (แท็บ Images) · ใช้แทนรูปจากชีตสินค้า/ฟอร์ม
 *      ส่งไปหน้า Catalog พร้อม content เป็น images: { products: {'แบรนด์|ชื่อสินค้า': [url…]}, brands: {'แบรนด์': url} }
 *  - ข้อมูลสินค้า (ตารางไซซ์ / รายละเอียด) ส่งไปพร้อม content อ่านจาก 2 ที่:
 *      1) แท็บ "Product Details" ในชีต Mera Admin (ทีมกรอก/แก้เองได้ ช่องไหนกรอก ใช้ช่องนั้นก่อน)
 *      2) แท็บ "Product Responses" ในชีต Mera Inventory (ฟอร์มที่แบรนด์กรอก) · อ่านเฉพาะคอลัมน์ข้อมูลสินค้า
 *         ไม่ส่งชื่อผู้ติดต่อ เบอร์โทร หรือบัญชีรับเงินออกไปหน้าเว็บ
 *
 * ที่เก็บข้อมูล (สร้างให้อัตโนมัติครั้งแรก หรือกด Run → admSetup)
 *  - Google Sheet ใหม่ชื่อ "Mera Admin" แท็บ Banners, Texts, Product Details และ Images → เก็บ ID ไว้ใน Script Property ADMIN_SHEET_ID
 *  - โฟลเดอร์ Drive ใหม่ชื่อ "Mera Banners" (แชร์ Anyone with the link · View) → BANNER_FOLDER_ID
 *
 * Script Properties ที่ต้องตั้งเอง (Project Settings → Script Properties) · ห้ามส่งค่าจริงในแชต
 *  ADMIN_PASSWORD   รหัสเข้าหน้าแอดมินบนคอม (ยาวอย่างน้อย 10 ตัว)
 *  ADMIN_LINE_IDS   LINE User ID ของทีมแอดมิน คั่นด้วย , (หน้าแอดมินจะโชว์ ID ของคนที่ยังไม่อยู่ในรายชื่อให้คัดลอกมาใส่)
 *  ใช้ของเดิม: LINE_LOGIN_CHANNEL_ID (ตรวจ LINE ผ่าน webAuth_ ใน Web_Order.gs)
 */
const ADM = {
  TAB: 'Banners',
  TEXT_TAB: 'Texts',
  TEXT_HEADS: ['Key', 'TH', 'EN', 'Updated At', 'Updated By'],
  INFO_TAB: 'Product Details',
  INFO_HEADS: ['Brand', 'Product Name', 'Size Chart', 'Description', 'Material', 'Fit / Feel', 'Care', 'Note', 'Updated At'],
  IMG_TAB: 'Images',
  IMG_HEADS: ['Kind', 'Key', 'Image URLs', 'Updated At', 'Updated By'],
  IMG_MAX: 15,
  HIDE_BRANDS: ['manitui'],
  HEADS: ['ID', 'Slot', 'Title', 'Image URL', 'Link', 'Start', 'End', 'Active', 'Order', 'Updated At', 'Updated By'],
  SLOTS: ['top', 'mid'],
  TOKEN_TTL: 6 * 3600,
  PUB_CACHE: 'adm_content_pub_v1',
  MAX_IMG: 8 * 1024 * 1024,
  TZ: 'Asia/Bangkok',
};

function webAdminRoute_(b) {
  switch (b.action) {
    case 'content': return admPublicContent_();
    case 'banners': return { ok: true, banners: admPublicContent_().banners };
    case 'adminCheck': return admCheck_(b);
    case 'adminAuth': return admAuth_(b);
    case 'adminBanners': admRequire_(b); return { ok: true, banners: admReadAll_(), sheetUrl: admSheet_().getUrl() };
    case 'adminBannerSave': return admSave_(b);
    case 'adminBannerDelete': return admDelete_(b);
    case 'adminUpload': return admUpload_(b);
    case 'adminTexts': admRequire_(b); return { ok: true, texts: admReadTexts_() };
    case 'adminTextSave': return admSaveTexts_(b);
    case 'adminImages': admRequire_(b); return { ok: true, images: admReadImages_(), sheetUrl: admSheet_().getUrl() };
    case 'adminImageSave': return admSaveImage_(b);
    default: return null;
  }
}

/* ---------- สิทธิ์แอดมิน ---------- */
function admIds_() { return String(webProp_('ADMIN_LINE_IDS', '')).split(',').map(s => s.trim()).filter(Boolean); }
function admCheck_(b) {
  try { const who = webAuth_(b); return { ok: true, admin: admIds_().indexOf(who.userId) >= 0 }; }
  catch (e) { return { ok: true, admin: false }; }
}
function admAuth_(b) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('adm_fail') || 0);
  if (fails >= 10) throw webErr_('ADMIN_LOCKED', 'ใส่รหัสผิดหลายครั้ง รอ 10 นาทีแล้วลองใหม่');
  let by = '';
  if (b.password != null) {
    const pass = String(webProp_('ADMIN_PASSWORD', ''));
    if (pass.length < 10) throw webErr_('SETUP', 'ยังไม่ได้ตั้ง ADMIN_PASSWORD (อย่างน้อย 10 ตัว) ใน Script Properties');
    if (!admSame_(String(b.password), pass)) { cache.put('adm_fail', String(fails + 1), 600); throw webErr_('ADMIN_AUTH', 'รหัสไม่ถูกต้อง'); }
    by = 'password';
  } else {
    const who = webAuth_(b);
    if (admIds_().indexOf(who.userId) < 0) return { ok: false, code: 'NOT_ADMIN', error: 'บัญชี LINE นี้ยังไม่อยู่ในรายชื่อแอดมิน', userId: who.userId, name: who.name };
    by = 'LINE ' + (who.name || who.userId);
  }
  const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  cache.put('adm_' + token, JSON.stringify({ by: by }), ADM.TOKEN_TTL);
  return { ok: true, token: token, by: by, ttl: ADM.TOKEN_TTL };
}
function admSame_(a, b) {
  const da = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a), db = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);
  let d = 0; for (let i = 0; i < da.length; i++) d |= da[i] ^ db[i];
  return d === 0;
}
function admRequire_(b) {
  const hit = b.token ? CacheService.getScriptCache().get('adm_' + String(b.token)) : null;
  if (!hit) throw webErr_('ADMIN_AUTH', 'เซสชันแอดมินหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return JSON.parse(hit);
}

/* ---------- ที่เก็บ: ชีต Mera Admin + โฟลเดอร์ Mera Banners ---------- */
function admSetup() {
  const ss = admSheet_(), folder = admFolder_();
  const added = admSyncProductRows_();
  console.log('Product Details: เพิ่มแถวสินค้าใหม่ ' + added + ' แถว (ช่องที่ว่าง เว็บจะใช้ข้อมูลจากฟอร์มของแบรนด์)');
  console.log('ชีต Mera Admin: ' + ss.getUrl());
  console.log('โฟลเดอร์รูปแบนเนอร์: ' + folder.getUrl());
}
function admSheet_() {
  if (admSheet_.cache) return admSheet_.cache;
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('ADMIN_SHEET_ID'), ss = null;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = webWithLock_(() => {
      const again = props.getProperty('ADMIN_SHEET_ID');
      if (again) return SpreadsheetApp.openById(again);
      const created = SpreadsheetApp.create('Mera Admin');
      props.setProperty('ADMIN_SHEET_ID', created.getId());
      return created;
    });
  }
  admEnsureTab_(ss, ADM.TAB, ADM.HEADS);
  admEnsureTab_(ss, ADM.TEXT_TAB, ADM.TEXT_HEADS);
  admEnsureTab_(ss, ADM.INFO_TAB, ADM.INFO_HEADS);
  admEnsureTab_(ss, ADM.IMG_TAB, ADM.IMG_HEADS);
  admSheet_.cache = ss;
  return ss;
}
function admEnsureTab_(ss, name, heads) {
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  const first = ss.getSheets()[0];
  sh = (first && first.getLastRow() === 0 && ss.getSheets().length === 1 && first.getName() !== ADM.TAB) ? first.setName(name) : ss.insertSheet(name);
  sh.getRange(1, 1, 1, heads.length).setValues([heads]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}
function admTab_() { return admSheet_().getSheetByName(ADM.TAB); }
function admFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BANNER_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  return webWithLock_(() => {
    const again = props.getProperty('BANNER_FOLDER_ID');
    if (again) return DriveApp.getFolderById(again);
    const f = DriveApp.createFolder('Mera Banners');
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    props.setProperty('BANNER_FOLDER_ID', f.getId());
    return f;
  });
}

/* ---------- อ่าน / เขียนแบนเนอร์ ---------- */
function admDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, ADM.TZ, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function admReadAll_() {
  const sh = admTab_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const heads = webHeads_(sh), vals = sh.getRange(2, 1, n, heads.length).getValues();
  const col = name => heads.indexOf(name);
  return vals.filter(r => String(r[col('ID')]).trim()).map(r => ({
    id: String(r[col('ID')]).trim(),
    slot: String(r[col('Slot')]).trim().toLowerCase(),
    title: String(r[col('Title')] || ''),
    img: String(r[col('Image URL')] || '').trim(),
    link: String(r[col('Link')] || '').trim(),
    start: admDate_(r[col('Start')]),
    end: admDate_(r[col('End')]),
    active: r[col('Active')] === true || /^(true|yes|1|on|เปิด)$/i.test(String(r[col('Active')]).trim()),
    order: Number(r[col('Order')]) || 0,
  })).sort((a, b) => a.order - b.order);
}
function admPublicContent_() {
  const cache = CacheService.getScriptCache(), hit = cache.get(ADM.PUB_CACHE);
  if (hit) return JSON.parse(hit);
  const today = Utilities.formatDate(new Date(), ADM.TZ, 'yyyy-MM-dd');
  let list = [], texts = {}, products = {}, images = { products: {}, brands: {} };
  try { products = admProductInfo_(); } catch (e) { console.error('product info', e); }
  if (webProp_('ADMIN_SHEET_ID', '')) {
    list = admReadAll_().filter(x => x.active && x.img && ADM.SLOTS.indexOf(x.slot) >= 0 && (!x.start || x.start <= today) && (!x.end || x.end >= today))
      .map(x => ({ id: x.id, slot: x.slot, title: x.title, img: x.img, link: x.link, start: x.start, end: x.end, order: x.order }));
    texts = admReadTexts_();
    try { images = admReadImages_(); } catch (e) { console.error('images', e); }
  }
  const out = { ok: true, banners: list, texts: texts, products: products, images: images };
  try { cache.put(ADM.PUB_CACHE, JSON.stringify(out), 300); } catch (e) {}
  return out;
}

/* ---------- ข้อมูลสินค้า: ตารางไซซ์ + รายละเอียด (key = แบรนด์|ชื่อสินค้า ตัวพิมพ์เล็ก) ---------- */
function admKey_(brand, name) { return [brand, name].map(v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|'); }
function admVal_(v) { const t = String(v == null ? '' : v).replace(/\r/g, '').trim(); return /^[-–—.\s]*$/.test(t) || /^(ไม่มี|none|n\/a)$/i.test(t) ? '' : t.slice(0, 3000); }
function admProductInfo_() {
  const out = {};
  // 1) ฟอร์มของแบรนด์ (Product Responses) · อ่านเฉพาะคอลัมน์ข้อมูลสินค้า
  const sh = webSS_().getSheetByName('Product Responses');
  if (sh && sh.getLastRow() > 1) {
    const heads = webHeads_(sh), col = p => heads.findIndex(h => h.replace(/\s+/g, ' ').indexOf(p) === 0);
    const C = { brand: col('ชื่อแบรนด์'), name: col('ชื่อสินค้า'), cat: col('หมวดหมู่สินค้า'), occ: col('โอกาสหรือลักษณะการใช้งาน'), size: col('ขนาดและสัดส่วนสินค้า'),
      source: col('ที่มาของสินค้า'), ship: col('แบรนด์สามารถจัดส่งสินค้าให้ทัน'), detail: col('รายละเอียดเพิ่มเติม'), sub: col('ประเภทสินค้าย่อย'), mat: col('วัสดุ / เนื้อผ้า') };
    if (C.brand >= 0 && C.name >= 0) {
      sh.getRange(2, 1, sh.getLastRow() - 1, heads.length).getValues().forEach(r => {
        const brand = String(r[C.brand] || '').trim(), name = String(r[C.name] || '').trim();
        if (!brand || !name || ADM.HIDE_BRANDS.indexOf(brand.toLowerCase()) >= 0) return;
        const k = admKey_(brand, name), cur = out[k] || {};
        const g = key => C[key] >= 0 ? admVal_(r[C[key]]) : '';
        const x = { size: g('size'), detail: g('detail'), material: g('mat'), sub: g('sub'), occasion: g('occ'), source: g('source'), ship: /รับทราบ|ได้/.test(g('ship')) ? '1' : '' };
        Object.keys(x).forEach(f => { if (x[f]) cur[f] = x[f]; });   // แถวที่ส่งทีหลังทับแถวเก่า
        out[k] = cur;
      });
    }
  }
  // 2) แท็บ Product Details (ทีม Mera กรอกเอง) ทับข้อมูลจากฟอร์มเฉพาะช่องที่กรอก
  if (webProp_('ADMIN_SHEET_ID', '')) {
    const t = admSheet_().getSheetByName(ADM.INFO_TAB);
    if (t && t.getLastRow() > 1) {
      const heads = webHeads_(t), ix = n => heads.indexOf(n);
      t.getRange(2, 1, t.getLastRow() - 1, heads.length).getValues().forEach(r => {
        const brand = String(r[ix('Brand')] || '').trim(), name = String(r[ix('Product Name')] || '').trim();
        if (!brand || !name) return;
        const k = admKey_(brand, name), cur = out[k] || {};
        [['Size Chart', 'size'], ['Description', 'description'], ['Material', 'material'], ['Fit / Feel', 'fit'], ['Care', 'care'], ['Note', 'note']].forEach(([h, f]) => {
          const v = ix(h) >= 0 ? admVal_(r[ix(h)]) : ''; if (v) cur[f] = v;
        });
        if (Object.keys(cur).length) out[k] = cur;
      });
    }
  }
  return out;
}
// เพิ่มแถวสินค้าที่ยังไม่มีในแท็บ Product Details (จาก Product Database) ให้ทีมกรอกต่อ · ไม่แก้แถวเดิม
function admSyncProductRows_() {
  const db = webSS_().getSheetByName('Product Database'); if (!db || db.getLastRow() < 2) return 0;
  const heads = webHeads_(db), b = heads.indexOf('Brand'), n = heads.indexOf('Product Name'); if (b < 0 || n < 0) return 0;
  const t = admSheet_().getSheetByName(ADM.INFO_TAB), have = {};
  if (t.getLastRow() > 1) t.getRange(2, 1, t.getLastRow() - 1, 2).getValues().forEach(r => { have[admKey_(r[0], r[1])] = 1; });
  const rows = [];
  db.getRange(2, 1, db.getLastRow() - 1, heads.length).getValues().forEach(r => {
    const brand = String(r[b] || '').trim(), name = String(r[n] || '').trim(), k = admKey_(brand, name);
    if (!brand || !name || have[k] || ADM.HIDE_BRANDS.indexOf(brand.toLowerCase()) >= 0) return;
    have[k] = 1; rows.push([brand, name, '', '', '', '', '', '', '']);
  });
  if (rows.length) t.getRange(t.getLastRow() + 1, 1, rows.length, ADM.INFO_HEADS.length).setValues(rows);
  return rows.length;
}

/* ---------- รูปสินค้า / โลโก้แบรนด์ (แท็บ Images) ----------
 * Kind = product → Key = แบรนด์|ชื่อสินค้า (ตัวพิมพ์เล็ก) · Image URLs = ลิงก์รูป บรรทัดละ 1 รูป (รูปแรก = หน้าปก)
 * Kind = brand   → Key = ชื่อแบรนด์ (ตัวพิมพ์เล็ก)     · Image URLs = ลิงก์โลโก้ 1 รูป
 * ลบแถว = กลับไปใช้รูปจากชีตสินค้า/ฟอร์ม */
function admImgTab_() { return admSheet_().getSheetByName(ADM.IMG_TAB); }
function admNorm_(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function admReadImages_() {
  const out = { products: {}, brands: {} }, sh = admImgTab_(), n = sh.getLastRow() - 1;
  if (n < 1) return out;
  sh.getRange(2, 1, n, 3).getValues().forEach(r => {
    const kind = String(r[0] || '').trim().toLowerCase(), key = String(r[1] || '').trim();
    const urls = String(r[2] || '').split(/[\n,\s]+/).map(u => u.trim()).filter(u => /^https:\/\/\S+$/.test(u)).slice(0, ADM.IMG_MAX);
    if (!key || !urls.length) return;
    if (kind === 'product' && key.indexOf('|') > 0) { const i = key.indexOf('|'); out.products[admNorm_(key.slice(0, i)) + '|' + admNorm_(key.slice(i + 1))] = urls; }
    else if (kind === 'brand') out.brands[admNorm_(key)] = urls[0];
  });
  return out;
}
function admSaveImage_(b) {
  const who = admRequire_(b);
  const kind = b.kind === 'brand' ? 'brand' : b.kind === 'product' ? 'product' : '';
  if (!kind) throw webErr_('BAD_IMAGE', 'ชนิดรูปไม่ถูกต้อง');
  let key = String(b.key || '').trim().slice(0, 300);
  if (kind === 'product') { const i = key.indexOf('|'); if (i < 1) throw webErr_('BAD_IMAGE', 'ไม่พบชื่อสินค้า'); key = admNorm_(key.slice(0, i)) + '|' + admNorm_(key.slice(i + 1)); }
  else key = admNorm_(key);
  if (!key) throw webErr_('BAD_IMAGE', 'ไม่พบชื่อแบรนด์');
  const urls = (Array.isArray(b.images) ? b.images : []).map(u => String(u || '').trim()).filter(Boolean);
  if (urls.some(u => !/^https:\/\/\S{5,500}$/.test(u))) throw webErr_('BAD_IMAGE', 'ลิงก์รูปต้องขึ้นต้นด้วย https://');
  if (urls.length > ADM.IMG_MAX) throw webErr_('BAD_IMAGE', 'ใส่รูปได้สูงสุด ' + ADM.IMG_MAX + ' รูปต่อสินค้า');
  const list = kind === 'brand' ? urls.slice(0, 1) : urls;
  webWithLock_(() => {
    const sh = admImgTab_(), n = sh.getLastRow() - 1;
    const rows = n > 0 ? sh.getRange(2, 1, n, 2).getValues() : [];
    let at = -1;
    rows.forEach((r, i) => { if (String(r[0]).trim().toLowerCase() === kind && admNorm_(r[1]) === key) at = i + 2; });
    if (!list.length) { if (at > 0) sh.deleteRow(at); return; }
    const row = [kind, key, list.join('\n'), new Date(), who.by];
    if (at > 0) sh.getRange(at, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  });
  CacheService.getScriptCache().remove(ADM.PUB_CACHE);
  return { ok: true, images: admReadImages_() };
}

/* ---------- ข้อความบนหน้าเว็บ (Key = ข้อความภาษาไทยเดิมของเว็บ) ---------- */
function admTextTab_() { return admSheet_().getSheetByName(ADM.TEXT_TAB); }
function admReadTexts_() {
  const sh = admTextTab_(), n = sh.getLastRow() - 1, out = {};
  if (n < 1) return out;
  sh.getRange(2, 1, n, 3).getValues().forEach(r => {
    const k = String(r[0] || ''), th = String(r[1] || '').trim(), en = String(r[2] || '').trim();
    if (k && (th || en)) out[k] = { th: th, en: en };
  });
  return out;
}
function admSaveTexts_(b) {
  const who = admRequire_(b), items = Array.isArray(b.items) ? b.items.slice(0, 500) : [];
  const s = v => String(v == null ? '' : v).replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
  webWithLock_(() => {
    const sh = admTextTab_(), n = sh.getLastRow() - 1;
    const keys = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
    const del = [];
    items.forEach(it => {
      const k = String(it.key || '').slice(0, 400); if (!k) return;
      const th = s(it.th), en = s(it.en), i = keys.indexOf(k);
      if (!th && !en) { if (i >= 0) del.push(i + 2); return; }
      const row = [k, th, en, new Date(), who.by];
      if (i >= 0) sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
      else { sh.appendRow(row); keys.push(k); }
    });
    del.sort((a, c) => c - a).forEach(r => sh.deleteRow(r));
  });
  CacheService.getScriptCache().remove(ADM.PUB_CACHE);
  return { ok: true, texts: admReadTexts_() };
}
function admCleanLink_(v) {
  const s = String(v || '').trim();
  if (/^zone:(gb|shop)$/.test(s)) return s;
  if (/^(brand|product|deal):.{1,120}$/.test(s)) return s;
  if (/^url:https:\/\/\S{3,500}$/.test(s)) return s;
  if (!s) return 'zone:gb';
  throw webErr_('BAD_BANNER', 'ลิงก์ของแบนเนอร์ไม่ถูกต้อง (ลิงก์ภายนอกต้องขึ้นต้นด้วย https://)');
}
function admSave_(b) {
  const who = admRequire_(b), x = b.banner || {};
  const slot = String(x.slot || '').toLowerCase();
  if (ADM.SLOTS.indexOf(slot) < 0) throw webErr_('BAD_BANNER', 'ตำแหน่งแบนเนอร์ไม่ถูกต้อง');
  const img = String(x.img || '').trim();
  if (img && !/^https:\/\//.test(img)) throw webErr_('BAD_BANNER', 'ลิงก์รูปต้องขึ้นต้นด้วย https://');
  const start = admDate_(x.start), end = admDate_(x.end);
  if (start && end && end < start) throw webErr_('BAD_BANNER', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
  const row = {
    'ID': String(x.id || '').trim() || ('BN' + Date.now().toString(36).toUpperCase()),
    'Slot': slot, 'Title': String(x.title || '').slice(0, 120), 'Image URL': img, 'Link': admCleanLink_(x.link),
    'Start': start, 'End': end, 'Active': x.active === true, 'Order': Number(x.order) || 0,
    'Updated At': new Date(), 'Updated By': who.by,
  };
  webWithLock_(() => {
    const sh = admTab_(), heads = webHeads_(sh);
    const values = heads.map(h => row.hasOwnProperty(h) ? row[h] : '');
    const found = webFindRow_(sh, 'ID', row['ID']);
    if (found) sh.getRange(found, 1, 1, heads.length).setValues([values]);
    else sh.appendRow(values);
  });
  CacheService.getScriptCache().remove(ADM.PUB_CACHE);
  return { ok: true, id: row['ID'], banners: admReadAll_() };
}
function admDelete_(b) {
  admRequire_(b);
  const id = String(b.id || '').trim();
  webWithLock_(() => { const sh = admTab_(), r = webFindRow_(sh, 'ID', id); if (r) sh.deleteRow(r); });
  CacheService.getScriptCache().remove(ADM.PUB_CACHE);
  return { ok: true, banners: admReadAll_() };
}
function admUpload_(b) {
  admRequire_(b);
  const mime = String(b.mime || '');
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw webErr_('BAD_IMAGE', 'รองรับเฉพาะไฟล์ JPG / PNG / WEBP');
  const data = String(b.data || '').replace(/^data:[^,]+,/, '');
  if (!data || data.length * 0.75 > ADM.MAX_IMG) throw webErr_('BAD_IMAGE', 'รูปใหญ่เกินไป (สูงสุด 8 MB)');
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const pre = /^(product|brand)$/.test(String(b.purpose || '')) ? String(b.purpose) : 'banner';
  const name = pre + '_' + Utilities.formatDate(new Date(), ADM.TZ, 'yyyyMMdd_HHmmss') + '.' + ext;
  const file = admFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(data), mime, name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: 'https://lh3.googleusercontent.com/d/' + file.getId(), fileId: file.getId() };
}

/* ---------- ตั้งรหัสเข้าหน้าแอดมิน (หน้า Script Properties แก้ไม่ได้เมื่อมีเกิน 50 รายการ) ----------
 * เลือกฟังก์ชัน admNewPassword แล้วกด Run → ระบบสุ่มรหัสใหม่ 16 ตัวให้ และแสดงใน Execution log ครั้งเดียว
 * จดเก็บไว้ในที่ปลอดภัย · กด Run อีกครั้ง = เปลี่ยนรหัสใหม่ (รหัสเก่าใช้ไม่ได้ทันที)
 */
function admNewPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now());
  let pw = '';
  for (let i = 0; i < 16; i++) pw += abc[(bytes[i] + 256) % abc.length];
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', pw);
  CacheService.getScriptCache().remove('adm_fail');
  console.log('รหัสเข้าหน้าแอดมินใหม่ (จดเก็บไว้): ' + pw);
}
/* เพิ่ม LINE User ID ของแอดมิน: ใส่ ID ในเครื่องหมายคำพูดด้านล่าง (ขึ้นต้นด้วย U) แล้วเลือก admAddLineAdmin กด Run */
function admAddLineAdmin() {
  const id = '';   // ← วาง LINE User ID ตรงนี้ เช่น 'U1234...'
  if (!/^U[0-9a-f]{32}$/.test(id)) throw new Error('ใส่ LINE User ID (ขึ้นต้นด้วย U ตามด้วย 32 ตัว) ในบรรทัด const id = ...');
  const ids = admIds_(); if (ids.indexOf(id) < 0) ids.push(id);
  PropertiesService.getScriptProperties().setProperty('ADMIN_LINE_IDS', ids.join(','));
  console.log('แอดมิน LINE ทั้งหมด ' + ids.length + ' คน');
}
/* แชร์ชีต Mera Admin + โฟลเดอร์ Mera Banners ให้เจ้าของไฟล์ชีต Mera Inventory (= บัญชีที่เว็บแอปทำงานในนาม)
 * ใช้เมื่อคนที่รัน admSetup ไม่ใช่เจ้าของโปรเจกต์ · เลือก admShareWithOwner แล้วกด Run */
function admShareWithOwner() {
  const owner = DriveApp.getFileById(webSS_().getId()).getOwner();
  if (!owner) throw new Error('หาเจ้าของชีต Mera Inventory ไม่เจอ');
  const email = owner.getEmail();
  DriveApp.getFileById(admSheet_().getId()).addEditor(email);
  admFolder_().addEditor(email);
  console.log('แชร์ชีต Mera Admin และโฟลเดอร์ Mera Banners ให้ ' + email + ' (Editor) แล้ว');
}
