/**
 * Mera Seller — แท็บ "สินค้า": แบรนด์ดูสินค้าของตัวเอง + เพิ่ม/ลดสต็อกเอง
 * ------------------------------------------------------------
 * วางเป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Inventory + GB" (โปรเจกต์เดียวกับ Web_Order.gs)
 * แก้ไฟล์เดิมแค่ 1 บรรทัด: ในฟังก์ชัน webRoute_(b) ของ Web_Order.gs ใส่บรรทัดนี้ไว้ใกล้ ๆ บรรทัดของ Web_Admin
 *
 *     const bst = webBrandStockRoute_(b); if (bst) return bst;
 *
 * แล้ว Deploy → Manage deployments → Edit → New version (ห้ามกด New deployment)
 *
 * สิ่งที่ไฟล์นี้ทำ
 *  - brandProducts {key}                          สินค้าทุก SKU ของแบรนด์ (จาก Product Database)
 *  - brandStock {key, clientRef, changes[{sku, delta}], note}
 *       เพิ่ม/ลดสต็อก → แก้คอลัมน์ Stock (+ Remaining / Inventory Status) ใต้ LockService
 *       ลดได้ไม่ต่ำกว่าของที่ลูกค้าจองไว้ (ออเดอร์เว็บที่รอตรวจสลิป)
 *       ทุกครั้งลงแท็บ Stock Log และส่ง LINE เข้ากลุ่มแอดมิน (ADMIN_GROUP_ID) ทั้งเพิ่มและลด · ลดจนหมดมีป้ายเตือน
 *  - brandCampaign / brandCampaignSave → Web_Campaign.gs (แคมเปญ + ยอดขายแคมเปญ)
 *  - brandEdit {key, clientRef, product, changes{name,category,price,orig,description,material,size}, photos[], newVariants[], note}
 *       แบรนด์ขอแก้ข้อมูลสินค้า (ทุกอย่างยกเว้นชื่อแบรนด์) → แถวใหม่ในแท็บ Product Edits (Status = Pending) + แจ้งกลุ่มแอดมิน
 *       ยังไม่ขึ้นเว็บจนทีมเลือก Status = Approved (ระบบแก้ชีตให้ + แจ้งกลุ่มแบรนด์) · Rejected = แจ้งกลุ่มแบรนด์พร้อม Admin Note
 *       ต้อง Run bstSetup 1 ครั้ง (สร้างแท็บ + ตัวจับการเลือก Status)
 *
 * กติกา
 *  - แบรนด์เข้าด้วย Portal Key ใน Brand Master (Active = TRUE) · Web Settings "Brand Portal" ต้องเป็น TRUE
 *  - ปิดเฉพาะแท็บสินค้า: Web Settings "Brand Stock" = FALSE (ไม่มีแถวนี้ = เปิด)
 *  - เห็นเฉพาะแถวที่ Brand ตรงกับชื่อแบรนด์ใน Brand Master และมี Product Status (แถวเก่า MRA001–029 ไม่มี → ไม่แสดง)
 *  - เปลี่ยนที่ Stock (จำนวนที่ลงไว้ทั้งหมด) · Sold ไม่แตะ (มาจากออเดอร์) · Remaining = Stock − Sold
 *    ช่อง Remaining ที่เป็นสูตร ปล่อยให้สูตรคำนวณเอง · ช่องที่เป็นตัวเลข ระบบเขียนให้
 *  - เพิ่มได้ไม่เกิน BST.MAX_ADD ชิ้นต่อ SKU ต่อครั้ง · ครั้งละไม่เกิน BST.MAX_CHANGES SKU
 *  - ปุ่ม "+ ลงสินค้าใหม่" ในหน้าแบรนด์ = Google Form ที่ส่งคำตอบเข้าแท็บ Product Responses (หาให้เอง)
 *    และเติมชื่อแบรนด์ในข้อ "ชื่อแบรนด์" ให้ · ต้อง Run bstFormCheck 1 ครั้งเพื่ออนุญาต Google Forms
 *    อยากใช้ลิงก์อื่น: ใส่ Web Settings "Product Form URL" · ไม่อยากให้มีปุ่ม: ใส่ none
 *
 * ใช้ของเดิมใน Web_Order.gs: webSS_, webHeads_, webWithLock_, webErr_, webProp_
 * Script Properties เดิม: LINE_CHANNEL_ACCESS_TOKEN, ADMIN_GROUP_ID
 */
const BST = {
  EDITS: 'Product Edits',
  EDIT_HEADS: ['Request ID', 'Created At', 'Brand', 'Product', 'Changes', 'Status', 'Admin Note', 'Decided At', 'Result', 'Brand Notified', 'Payload'],
  MAX_PHOTOS: 5,
  MAX_PHOTO_BYTES: 5 * 1024 * 1024,
  CATEGORIES: ['เสื้อผ้า', 'เสื้อ', 'กางเกง', 'กระโปรง', 'เดรส', 'กระเป๋า', 'รองเท้า', 'เครื่องประดับ'],
  DB: 'Product Database',
  LOG: 'Stock Log',
  LOG_HEADS: ['Time', 'Brand', 'SKU', 'Product', 'Color', 'Size', 'Before', 'Change', 'After', 'Remaining After', 'Note', 'Client Ref', 'Admin Notified'],
  MAX_ADD: 100,
  MAX_CHANGES: 60,
  HOLD_STATUSES: ['Pending Slip', 'Slip Rejected'],   // ออเดอร์เว็บที่ยังกันสต็อกไว้
  TZ: 'Asia/Bangkok',
};

function webBrandStockRoute_(b) {
  switch (b && b.action) {
    case 'brandProducts': return bstProducts_(b);
    case 'brandStock': return bstSave_(b);
    case 'brandEdit': return bstEdit_(b);
    case 'brandCampaign': return campBrandView_(b);       // Web_Campaign.gs
    case 'brandCampaignSave': return campSave_(b);        // Web_Campaign.gs
    default: return null;
  }
}

/* ---------- ตั้งค่า + สิทธิ์แบรนด์ ---------- */
function bstSettings_() {
  const out = {}, sh = webSS_().getSheetByName('Web Settings');
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    const k = String(r[0] || '').trim(); if (k) out[k] = r[1];
  });
  return out;
}
function bstOn_(v, dflt) {
  if (v === '' || v == null) return dflt;
  if (v === true || v === false) return v;
  return /^(true|1|yes|on)$/i.test(String(v).trim());
}
function bstNorm_(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function bstBrand_(b) {
  const set = bstSettings_();
  if (!bstOn_(set['Brand Portal'], false)) throw webErr_('BRAND_OFF', 'หน้าแบรนด์ยังไม่เปิดใช้งาน ติดต่อทีม Mera ในกลุ่ม LINE ค่ะ');
  if (!bstOn_(set['Brand Stock'], true)) throw webErr_('BRAND_OFF', 'ส่วนจัดการสต็อกยังไม่เปิดใช้งาน ติดต่อทีม Mera ในกลุ่ม LINE ค่ะ');
  const key = String(b.key || '').trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw webErr_('BRAND_AUTH', 'ลิงก์ไม่ถูกต้อง เปิดจากลิงก์ที่ทีม Mera ส่งให้ในกลุ่ม LINE นะคะ');
  const sh = webSS_().getSheetByName('Brand Master'), heads = webHeads_(sh), ix = n => heads.indexOf(n);
  const cName = ix('Brand Name'), cKey = ix('Portal Key'), cAct = ix('Active');
  if (cName < 0 || cKey < 0) throw webErr_('SETUP', 'ระบบยังตั้งค่าไม่ครบ (Brand Master) แจ้งทีม Mera นะคะ');
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, heads.length).getValues() : [];
  const hit = rows.find(r => String(r[cKey] || '').trim() === key && (cAct < 0 || bstOn_(r[cAct], true)));
  if (!hit) throw webErr_('BRAND_AUTH', 'ลิงก์นี้ใช้ไม่ได้แล้ว ขอลิงก์ใหม่จากทีม Mera ในกลุ่ม LINE นะคะ');
  return { name: String(hit[cName]).trim(), settings: set };
}

/* ---------- อ่าน Product Database ---------- */
function bstCols_(heads) {
  const ix = n => heads.indexOf(n);
  const C = { sku: ix('SKU'), brand: ix('Brand'), name: ix('Product Name'), size: ix('Size'), color: ix('Color'), stock: ix('Stock'),
    orig: ix('Original Price'), price: ix('Sale Price'), status: ix('Product Status'), cat: ix('Product Category'),
    sold: heads.findIndex(h => /^sold\s*q/i.test(h)), inv: ix('Inventory Status'), remain: ix('Remaining'), img: ix('Image URL'),
    pct: heads.findIndex(h => /ลดไปกี่/.test(h)), created: ix('Created At'), source: ix('Source Form') };
  ['sku', 'brand', 'name', 'stock'].forEach(k => { if (C[k] < 0) throw webErr_('SETUP', 'Product Database ไม่มีคอลัมน์ ' + k + ' แจ้งทีม Mera นะคะ'); });
  return C;
}
function bstNum_(v) { const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; }
// แถวของแบรนด์ (รวมเลขแถวในชีต) · ข้ามแถวไม่มี SKU / ไม่มี Product Status
function bstRows_(brand) {
  const sh = webSS_().getSheetByName(BST.DB), heads = webHeads_(sh), C = bstCols_(heads), want = bstNorm_(brand);
  const n = sh.getLastRow() - 1, out = [];
  if (n < 1) return { sh, C, rows: out };
  const vals = sh.getRange(2, 1, n, heads.length).getValues();
  const forms = C.remain >= 0 ? sh.getRange(2, C.remain + 1, n, 1).getFormulas() : null;
  vals.forEach((r, i) => {
    const sku = String(r[C.sku] || '').trim().toUpperCase();
    if (!/^MRA\d+$/.test(sku) || bstNorm_(r[C.brand]) !== want) return;
    if (C.status >= 0 && !String(r[C.status] || '').trim()) return;
    const stock = bstNum_(r[C.stock]), sold = C.sold >= 0 ? bstNum_(r[C.sold]) : 0;
    const remain = C.remain >= 0 && String(r[C.remain]).trim() !== '' ? bstNum_(r[C.remain]) : Math.max(0, stock - sold);
    out.push({ row: i + 2, sku, name: String(r[C.name] || '').trim(), color: C.color >= 0 ? String(r[C.color] || '').trim() : '',
      size: C.size >= 0 ? String(r[C.size] || '').trim() : '', stock, sold, remain,
      price: C.price >= 0 ? bstNum_(r[C.price]) : 0, orig: C.orig >= 0 ? bstNum_(r[C.orig]) : 0,
      cat: C.cat >= 0 ? String(r[C.cat] || '').trim() : '', active: C.status < 0 || /^active$/i.test(String(r[C.status]).trim()),
      remainFormula: !!(forms && forms[i][0]), img: C.img >= 0 ? bstImgs_(r[C.img]) : [] });
  });
  return { sh, C, rows: out };
}
// จำนวนที่ลูกค้าจองไว้ (ออเดอร์เว็บที่ยังรอตรวจสลิป) ต่อ SKU
function bstHeld_() {
  const sh = webSS_().getSheetByName('Web Orders'), held = {};
  if (!sh || sh.getLastRow() < 2) return held;
  const heads = webHeads_(sh), ix = n => heads.indexOf(n), cSt = ix('Status'), cSku = ix('SKU'), cQty = ix('Qty'), cJson = ix('Items JSON');
  if (cSt < 0) return held;
  sh.getRange(2, 1, sh.getLastRow() - 1, heads.length).getValues().forEach(r => {
    if (BST.HOLD_STATUSES.indexOf(String(r[cSt]).trim()) < 0) return;
    let items = null;
    if (cJson >= 0 && String(r[cJson] || '').trim()) { try { items = JSON.parse(r[cJson]); } catch (e) { items = null; } }
    if (!Array.isArray(items)) items = [{ sku: r[cSku], qty: cQty >= 0 ? r[cQty] : 1 }];
    items.forEach(it => {
      const s = String(it.sku || '').trim().toUpperCase(); if (!s) return;
      held[s] = (held[s] || 0) + Math.max(0, bstNum_(it.qty) || 0);
    });
  });
  return held;
}
function bstView_(brand, settings) {
  const { rows } = bstRows_(brand), held = bstHeld_(), by = {}, order = [];
  const extra = bstExtras_(brand), reviews = bstReviews_(brand);
  rows.forEach(v => {
    const k = bstNorm_(v.name);
    if (!by[k]) {
      const ex = extra.info[k] || {};
      by[k] = { name: v.name, cat: v.cat, price: v.price, orig: v.orig, variants: [],
        images: extra.images[k] || [], description: ex.description || ex.detail || '', material: ex.material || '', size: ex.size || '',
        review: reviews[k] || null };
      order.push(k);
    }
    if (!by[k].images.length && v.img.length) by[k].images = v.img.slice(0, 5);
    by[k].variants.push({ sku: v.sku, color: v.color, size: v.size, stock: v.stock, sold: v.sold, remaining: v.remain,
      held: held[v.sku] || 0, active: v.active });
  });
  const cats = {}; rows.forEach(v => { if (v.cat) cats[v.cat] = 1; }); BST.CATEGORIES.forEach(c => { cats[c] = 1; });
  return { ok: true, brand: brand, products: order.map(k => by[k]), maxAdd: BST.MAX_ADD, maxPhotos: BST.MAX_PHOTOS,
    categories: Object.keys(cats), formUrl: bstFormUrl_(settings, brand), updatedAt: Date.now() };
}
// ลิงก์ฟอร์มลงสินค้าใหม่: ใช้ Web Settings "Product Form URL" ถ้ากรอกไว้
// ไม่กรอก = หาเองจากฟอร์มที่ส่งคำตอบเข้าแท็บ Product Responses แล้วเติมชื่อแบรนด์ในข้อ "ชื่อแบรนด์" ให้
// (เติมชื่อต้องใช้สิทธิ์ Google Forms: Run bstFormCheck ในหน้าแก้โค้ด 1 ครั้งแล้วกดอนุญาต · ยังไม่อนุญาต = ได้ลิงก์ฟอร์มเปล่า)
function bstFormUrl_(settings, brand) {
  const set = String(settings['Product Form URL'] || '').trim();
  if (/^https:\/\//.test(set)) return set;
  if (/^(none|off|false)$/i.test(set)) return '';
  const cache = CacheService.getScriptCache(), ck = 'bst_form_' + bstNorm_(brand).replace(/[^a-z0-9ก-๙]/g, '').slice(0, 80);
  const hit = cache.get(ck);
  if (hit !== null) return hit;
  let url = '', prefilled = false;
  try {
    const sh = webSS_().getSheetByName('Product Responses');
    const raw = sh && sh.getFormUrl ? String(sh.getFormUrl() || '') : '';
    const m = raw.match(/\/forms\/d\/(e\/)?([A-Za-z0-9_-]{20,})/);
    if (m) url = 'https://docs.google.com/forms/d/' + (m[1] ? 'e/' : '') + m[2] + '/viewform';
    if (raw && brand) {
      try { const pre = bstPrefill_(raw, brand); if (pre) { url = pre; prefilled = true; } }
      catch (e) { console.warn('bstPrefill_ (ยังไม่ได้อนุญาต Google Forms?) ' + e); }
    }
  } catch (e) { console.warn('bstFormUrl_ ' + e); }
  cache.put(ck, url, prefilled ? 21600 : 300);   // ยังเติมชื่อไม่ได้ → ลองใหม่ใน 5 นาที
  return url;
}
// ลิงก์ฟอร์มที่เติมชื่อแบรนด์ไว้แล้ว · ข้อ "ชื่อแบรนด์" เป็นช่องพิมพ์ หรือตัวเลือก (ต้องมีชื่อนี้ในตัวเลือก) · หาไม่เจอ = ''
function bstPrefill_(formUrl, brand) {
  const form = FormApp.openByUrl(formUrl), T = FormApp.ItemType;
  const items = form.getItems(), title = it => String(it.getTitle() || '').trim();
  const item = items.find(it => /^ชื่อแบรนด์/.test(title(it))) || items.find(it => /แบรนด์|brand/i.test(title(it)));
  if (!item) return '';
  const pick = choices => { const c = choices.find(x => bstNorm_(x.getValue()) === bstNorm_(brand)); return c ? c.getValue() : ''; };
  let resp = null;
  switch (item.getType()) {
    case T.TEXT: resp = item.asTextItem().createResponse(brand); break;
    case T.PARAGRAPH_TEXT: resp = item.asParagraphTextItem().createResponse(brand); break;
    case T.LIST: { const v = pick(item.asListItem().getChoices()); if (v) resp = item.asListItem().createResponse(v); break; }
    case T.MULTIPLE_CHOICE: { const v = pick(item.asMultipleChoiceItem().getChoices()); if (v) resp = item.asMultipleChoiceItem().createResponse(v); break; }
    default: return '';
  }
  return resp ? form.createResponse().withItemResponse(resp).toPrefilledUrl() : '';
}
// Run ครั้งเดียวในหน้าแก้โค้ด → กดอนุญาต Google Forms · แล้วดูลิงก์ของแต่ละแบรนด์ใน log
function bstFormCheck() {
  const sh = webSS_().getSheetByName('Product Responses');
  const raw = sh ? sh.getFormUrl() : '';
  if (!raw) { console.log('แท็บ Product Responses ไม่ได้ผูกกับ Google Form'); return; }
  const form = FormApp.openByUrl(raw);
  console.log('ฟอร์ม: ' + form.getTitle());
  const bm = webSS_().getSheetByName('Brand Master'), heads = webHeads_(bm), c = heads.indexOf('Brand Name');
  bm.getRange(2, 1, bm.getLastRow() - 1, heads.length).getValues().forEach(r => {
    const name = String(r[c] || '').trim(); if (!name) return;
    let u = ''; try { u = bstPrefill_(raw, name); } catch (e) { u = 'ผิดพลาด: ' + e; }
    console.log(name + ': ' + (u || 'เติมชื่อไม่ได้ (หาข้อ "ชื่อแบรนด์" ไม่เจอ หรือไม่มีชื่อนี้ในตัวเลือก) → ใช้ลิงก์ฟอร์มเปล่า'));
  });
  CacheService.getScriptCache().removeAll(bm.getRange(2, c + 1, bm.getLastRow() - 1, 1).getValues()
    .map(r => 'bst_form_' + bstNorm_(r[0]).replace(/[^a-z0-9ก-๙]/g, '').slice(0, 80)));
}
function bstProducts_(b) {
  const who = bstBrand_(b);
  return bstView_(who.name, who.settings);
}

/* ---------- บันทึกการเปลี่ยนสต็อก ---------- */
function bstSave_(b) {
  const who = bstBrand_(b);
  const ref = String(b.clientRef || '').slice(0, 64), cache = CacheService.getScriptCache();
  const changes = Array.isArray(b.changes) ? b.changes : [];
  if (!changes.length) throw webErr_('BAD_STOCK', 'ยังไม่ได้เปลี่ยนจำนวนสินค้าค่ะ');
  if (changes.length > BST.MAX_CHANGES) throw webErr_('TOO_MANY', 'เปลี่ยนได้ครั้งละไม่เกิน ' + BST.MAX_CHANGES + ' รายการค่ะ');
  const note = String(b.note || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
  const want = {};
  changes.forEach(c => {
    const sku = String(c && c.sku || '').trim().toUpperCase(), d = Number(c && c.delta);
    if (!/^MRA\d+$/.test(sku) || !isFinite(d) || Math.floor(d) !== d) throw webErr_('BAD_SKU', 'ข้อมูลสินค้าไม่ถูกต้อง โหลดหน้าใหม่แล้วลองอีกครั้งนะคะ');
    want[sku] = (want[sku] || 0) + d;
  });

  const result = webWithLock_(() => {
    const doneKey = ref ? 'bst_' + bstNorm_(who.name) + '_' + ref : '';
    if (doneKey && cache.get(doneKey)) return { duplicate: true, notified: cache.get(doneKey) === 'n' };
    const { sh, C, rows } = bstRows_(who.name), held = bstHeld_(), bySku = {};
    rows.forEach(v => { bySku[v.sku] = v; });
    const plan = [], problems = [];
    Object.keys(want).forEach(sku => {
      const d = want[sku], v = bySku[sku];
      if (!v) return problems.push({ sku, code: 'NOT_YOURS', error: sku + ' ไม่ใช่สินค้าของแบรนด์นี้' });
      if (d === 0) return;
      if (d > BST.MAX_ADD) return problems.push({ sku, code: 'TOO_MANY', error: 'เพิ่มได้ครั้งละไม่เกิน ' + BST.MAX_ADD + ' ชิ้น' });
      const h = held[sku] || 0, left = Math.max(0, v.stock - v.sold);   // Remaining ใหม่ (Stock − Sold) ต้อง ≥ ของที่ลูกค้าจองไว้
      if (left + d < h) {
        const can = Math.max(0, left - h);
        return problems.push({ sku, code: 'BELOW_RESERVED', max: can,
          error: (v.color || v.size ? [v.color, v.size].filter(Boolean).join(' · ') + ': ' : '') + 'ลดได้มากสุด ' + can + ' ชิ้น' + (h ? ' (ลูกค้าจองไว้ ' + h + ' ชิ้น รอโอน)' : '') });
      }
      plan.push({ v, d, after: v.stock + d, remainAfter: Math.max(0, v.stock + d - v.sold) });
    });
    if (problems.length) { const e = webErr_(problems[0].code, problems.length > 1 ? problems.map(p => p.error).join(' · ') : problems[0].error); e.items = problems; throw e; }
    if (!plan.length) throw webErr_('BAD_STOCK', 'ยังไม่ได้เปลี่ยนจำนวนสินค้าค่ะ');

    plan.forEach(p => {
      sh.getRange(p.v.row, C.stock + 1).setValue(p.after);
      if (C.remain >= 0 && !p.v.remainFormula) sh.getRange(p.v.row, C.remain + 1).setValue(p.remainAfter);
      if (C.inv >= 0) sh.getRange(p.v.row, C.inv + 1).setValue(p.remainAfter > 0 ? 'IN STOCK' : 'OUT OF STOCK');
    });
    SpreadsheetApp.flush();

    const notified = bstNotify_(who.name, plan, note);   // แจ้งทีมทุกครั้งที่มีการเปลี่ยน (Palm 26 พ.ย.)
    const now = new Date(), log = bstLogSheet_();
    log.getRange(log.getLastRow() + 1, 1, plan.length, BST.LOG_HEADS.length).setValues(plan.map(p => [
      now, who.name, p.v.sku, p.v.name, p.v.color, p.v.size, p.v.stock, p.d, p.after, p.remainAfter, note, ref,
      notified ? 'Sent' : 'Failed']));
    if (doneKey) cache.put(doneKey, notified ? 'n' : '1', 21600);
    return { duplicate: false, notified, changed: plan.length };
  });

  const view = bstView_(who.name, who.settings);
  view.saved = result.duplicate ? 0 : result.changed;
  view.duplicate = !!result.duplicate;
  view.notified = !!result.notified;
  return view;
}
function bstLogSheet_() {
  const ss = webSS_();
  let sh = ss.getSheetByName(BST.LOG);
  if (!sh) {
    sh = ss.insertSheet(BST.LOG);
    sh.getRange(1, 1, 1, BST.LOG_HEADS.length).setValues([BST.LOG_HEADS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------- แจ้งทีม Mera (กลุ่มแอดมิน) ---------- */
function bstNotify_(brand, plan, note) {
  const to = webProp_('ADMIN_GROUP_ID', ''), token = webProp_('LINE_CHANNEL_ACCESS_TOKEN', '');
  if (!to || !token) { console.warn('bstNotify_: ไม่มี ADMIN_GROUP_ID หรือ LINE_CHANNEL_ACCESS_TOKEN'); return false; }
  try { return bstPush_(to, token, bstText_(brand, plan, note)); }
  catch (e) { console.error('bstNotify_ ' + e); return false; }
}
function bstText_(brand, plan, note) {
  const adds = plan.filter(p => p.d > 0), cuts = plan.filter(p => p.d < 0), gone = cuts.filter(p => p.remainAfter <= 0);
  const head = adds.length && cuts.length ? '📦 แบรนด์แก้สต็อก' : adds.length ? '📦 แบรนด์เพิ่มสต็อก' : '📉 แบรนด์ลดสต็อก';
  const line = p => '• ' + p.v.name + ([p.v.color, p.v.size].filter(x => x && x !== '-').length ? ' · ' + [p.v.color, p.v.size].filter(x => x && x !== '-').join(' / ') : '') +
    ' (' + p.v.sku + ')\n   เหลือ ' + Math.max(0, p.v.stock - p.v.sold) + ' → ' + p.remainAfter + ' (' + (p.d > 0 ? '+' : '') + p.d + ')' +
    (p.d < 0 && p.remainAfter <= 0 ? '  ⚠️ หมดแล้ว' : '');
  let t = head + ' · ' + brand;
  if (adds.length) t += '\n\n' + (cuts.length ? 'เพิ่ม ' + adds.length + ' รายการ:\n' : '') + adds.map(line).join('\n');
  if (cuts.length) t += '\n\n' + (adds.length ? 'ลด ' + cuts.length + ' รายการ:\n' : '') + cuts.map(line).join('\n');
  if (gone.length) t += '\n\n⚠️ หมด ' + gone.length + ' รายการ · ลูกค้าจะเห็น "สินค้าหมด" บนหน้าเว็บ';
  if (note) t += '\n\nหมายเหตุจากแบรนด์: ' + note;
  t += '\n\n' + Utilities.formatDate(new Date(), BST.TZ, 'd MMM HH:mm') + ' · หน้าเว็บอัปเดตภายใน 10 นาที';
  t += '\nดูประวัติ: ' + webSS_().getUrl() + '#gid=' + bstLogSheet_().getSheetId();
  return t.slice(0, 4900);
}
function bstPush_(to, token, text) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
  });
  const ok = res.getResponseCode() === 200;
  if (!ok) console.error('LINE push ' + res.getResponseCode() + ' ' + res.getContentText());
  return ok;
}

/* ---------- ทดสอบในโปรเจกต์จริง (Run จากเมนู) ----------
 * bstTestView: ดูว่าแต่ละแบรนด์เห็นสินค้ากี่รายการ (ไม่แก้อะไร) */
function bstTestView() {
  const sh = webSS_().getSheetByName('Brand Master'), heads = webHeads_(sh), c = heads.indexOf('Brand Name');
  sh.getRange(2, 1, sh.getLastRow() - 1, heads.length).getValues().forEach(r => {
    const name = String(r[c] || '').trim(); if (!name) return;
    const v = bstView_(name, bstSettings_()), skus = v.products.reduce((n, p) => n + p.variants.length, 0);
    console.log(name + ': สินค้า ' + v.products.length + ' รายการ · ' + skus + ' SKU');
  });
}


/* =====================================================================
 * แบรนด์ขอแก้ข้อมูลสินค้า → ทีม Mera อนุมัติก่อนขึ้นเว็บ (Palm 26 พ.ย.)
 *  - แก้ได้ทุกอย่างยกเว้นชื่อแบรนด์: ชื่อสินค้า หมวด ราคาขาย ราคาเต็ม รายละเอียด วัสดุ ขนาด รูป (≤5) เพิ่มสี/ไซซ์ใหม่
 *  - จำนวนสต็อกใช้ brandStock (ขึ้นทันที + แจ้ง) · ข้อมูลอื่นใช้ brandEdit (รออนุมัติ + แจ้ง)
 *  - ทีมอนุมัติที่แท็บ Product Edits: เลือก Status = Approved / Rejected (ใส่เหตุผลใน Admin Note ก่อนเลือก Rejected)
 * ===================================================================== */

// ลิงก์รูปจากชีต (Drive / lh3 / https อื่น) → รายการลิงก์ที่หน้าเว็บโหลดได้
function bstImgs_(v) {
  return String(v || '').split(/[\n,\s]+/).map(u => u.trim()).filter(Boolean).map(u => {
    const m = u.match(/drive\.google\.com\/(?:open\?id=|file\/d\/|uc\?(?:export=\w+&)?id=)([A-Za-z0-9_-]{20,})/);
    return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : u;
  }).filter(u => /^https:\/\/\S+$/.test(u));
}
// รูป + รายละเอียดที่แสดงบนเว็บตอนนี้ (แท็บ Images / Product Details ในชีต Mera Admin + ฟอร์มของแบรนด์)
function bstExtras_(brand) {
  const out = { images: {}, info: {} }, b = bstNorm_(brand);
  if (!webProp_('ADMIN_SHEET_ID', '')) return out;
  try {
    const im = admReadImages_();
    Object.keys(im.products || {}).forEach(k => { const i = k.indexOf('|'); if (k.slice(0, i) === b) out.images[k.slice(i + 1)] = im.products[k].slice(0, BST.MAX_PHOTOS); });
  } catch (e) { console.warn('bstExtras_ images ' + e); }
  try {
    const info = admProductInfo_();
    Object.keys(info).forEach(k => { const i = k.indexOf('|'); if (k.slice(0, i) === b) out.info[k.slice(i + 1)] = info[k]; });
  } catch (e) { console.warn('bstExtras_ info ' + e); }
  return out;
}
function bstEditSheet_() {
  const ss = webSS_();
  let sh = ss.getSheetByName(BST.EDITS);
  if (!sh) {
    sh = ss.insertSheet(BST.EDITS);
    sh.getRange(1, 1, 1, BST.EDIT_HEADS.length).setValues([BST.EDIT_HEADS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    try {
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Pending', 'Approved', 'Rejected', 'Superseded'], true).build();
      sh.getRange(2, 6, 999, 1).setDataValidation(rule);
      sh.setColumnWidth(5, 380); sh.setColumnWidth(11, 120);
    } catch (e) {}
  }
  return sh;
}
function bstEditRows_() {
  const sh = bstEditSheet_(), n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, BST.EDIT_HEADS.length).getValues().map((r, i) => ({
    row: i + 2, id: String(r[0]), at: r[1] instanceof Date ? r[1].getTime() : 0, brand: String(r[2]), product: String(r[3]), changes: String(r[4]),
    status: String(r[5]).trim(), note: String(r[6] || ''), decidedAt: r[7] instanceof Date ? r[7].getTime() : 0, payload: String(r[10] || '') }));
}
// คำขอล่าสุดของแต่ละสินค้า: รออนุมัติ / ไม่ผ่าน (14 วัน) / อนุมัติแล้ว (3 วัน)
function bstReviews_(brand) {
  const out = {}, b = bstNorm_(brand), now = Date.now();
  bstEditRows_().forEach(r => {
    if (bstNorm_(r.brand) !== b || r.status === 'Superseded') return;
    let p = {}; try { p = JSON.parse(r.payload || '{}'); } catch (e) {}
    const k = bstNorm_(r.status === 'Approved' && p.changes && p.changes.name ? p.changes.name : r.product);
    const age = now - (r.decidedAt || r.at);
    if (r.status === 'Rejected' && age > 14 * 864e5) return;
    if (r.status === 'Approved' && age > 3 * 864e5) return;
    if (!out[k] || out[k].at < r.at) out[k] = { id: r.id, status: r.status || 'Pending', at: r.at, decidedAt: r.decidedAt, changes: r.changes, note: r.note };
  });
  return out;
}

function bstEdit_(b) {
  const who = bstBrand_(b), brand = who.name;
  const ref = String(b.clientRef || '').slice(0, 64), cache = CacheService.getScriptCache();
  const prodName = String(b.product || '').trim();
  const ch = b.changes && typeof b.changes === 'object' ? b.changes : {};
  const result = webWithLock_(() => {
    const doneKey = ref ? 'bse_' + bstNorm_(brand) + '_' + ref : '';
    if (doneKey && cache.get(doneKey)) return { duplicate: true, id: cache.get(doneKey) };
    const { rows } = bstRows_(brand), mine = rows.filter(v => bstNorm_(v.name) === bstNorm_(prodName));
    if (!mine.length) throw webErr_('NOT_YOURS', 'ไม่พบสินค้านี้ของแบรนด์ โหลดหน้าใหม่แล้วลองอีกครั้งนะคะ');
    const cur = mine[0], extra = bstExtras_(brand), info = extra.info[bstNorm_(prodName)] || {};
    const curImgs = extra.images[bstNorm_(prodName)] || (cur.img.length ? cur.img.slice(0, BST.MAX_PHOTOS) : []);
    const before = { name: cur.name, category: cur.cat, price: cur.price, orig: cur.orig,
      description: info.description || info.detail || '', material: info.material || '', size: info.size || '' };
    const diff = {}, lines = [];
    const txt = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
    const LABEL = { name: 'ชื่อสินค้า', category: 'หมวด', price: 'ราคาขาย', orig: 'ราคาเต็ม', description: 'รายละเอียด', material: 'วัสดุ', size: 'ขนาด / ตารางไซซ์' };
    Object.keys(LABEL).forEach(f => {
      if (!(f in ch)) return;
      let v = ch[f];
      if (f === 'price' || f === 'orig') {
        v = Number(String(v).replace(/[^\d.]/g, ''));
        if (!isFinite(v) || v <= 0 || v > 100000) throw webErr_('BAD_EDIT', LABEL[f] + 'ไม่ถูกต้อง');
        if (v === Number(before[f])) return;
      } else {
        v = txt(v, f === 'name' ? 120 : f === 'category' ? 40 : 2000);
        if (f === 'name' && !v) throw webErr_('BAD_EDIT', 'ใส่ชื่อสินค้าด้วยนะคะ');
        if (f === 'name' && bstNorm_(v) !== bstNorm_(cur.name) && rows.some(x => bstNorm_(x.name) === bstNorm_(v))) throw webErr_('BAD_EDIT', 'แบรนด์มีสินค้าชื่อนี้อยู่แล้ว ใช้ชื่ออื่นนะคะ');
        if (v === String(before[f] || '').trim()) return;
      }
      diff[f] = v;
      const short = x => { x = String(x == null ? '' : x).replace(/\s+/g, ' '); return x.length > 60 ? x.slice(0, 60) + '…' : (x || '(ว่าง)'); };
      lines.push(LABEL[f] + ': ' + short(before[f]) + ' → ' + short(v));
    });
    const np = Number(diff.price || before.price), no = Number(diff.orig || before.orig);
    if (('price' in diff || 'orig' in diff) && no && np > no) throw webErr_('BAD_EDIT', 'ราคาขายบน Mera ต้องไม่เกินราคาเต็มค่ะ');
    if (('price' in diff || 'orig' in diff) && typeof campLocked_ === 'function' && campLocked_(brand, cur.name))
      throw webErr_('CAMP_LOCKED', 'สินค้านี้อยู่ในแคมเปญ แก้ราคาได้หลังแคมเปญจบ หรือถอนออกจากแคมเปญก่อนนะคะ (แก้ข้อมูลอื่นได้ตามปกติ)');

    // รูป: รายการเรียงใหม่ทั้งหมด · {url} = รูปเดิม · {mime,data} = รูปใหม่ (อัปโหลดตอนนี้ ยังไม่ขึ้นเว็บจนอนุมัติ)
    let photos = null;
    if (Array.isArray(b.photos)) {
      if (!b.photos.length) throw webErr_('BAD_EDIT', 'สินค้าต้องมีรูปอย่างน้อย 1 รูปค่ะ');
      if (b.photos.length > BST.MAX_PHOTOS) throw webErr_('BAD_EDIT', 'ใส่รูปได้ไม่เกิน ' + BST.MAX_PHOTOS + ' รูปค่ะ');
      const list = [];
      let added = 0;
      b.photos.forEach(p => {
        if (p && p.url) {
          if (curImgs.indexOf(String(p.url)) < 0) throw webErr_('BAD_EDIT', 'รูปเดิมไม่ตรงกับในระบบ โหลดหน้าใหม่แล้วลองอีกครั้งนะคะ');
          list.push(String(p.url));
        } else if (p && p.data) {
          const mime = String(p.mime || '');
          if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw webErr_('BAD_EDIT', 'รองรับรูป JPG / PNG / WEBP เท่านั้นค่ะ');
          const data = String(p.data).replace(/^data:[^,]+,/, '');
          if (data.length * 0.75 > BST.MAX_PHOTO_BYTES) throw webErr_('BAD_EDIT', 'รูปใหญ่เกิน 5 MB ค่ะ');
          list.push({ mime, data }); added++;
        } else throw webErr_('BAD_EDIT', 'รูปไม่ถูกต้อง');
      });
      const same = !added && list.length === curImgs.length && list.every((u, i) => u === curImgs[i]);
      if (!same) {
        photos = list.map((p, i) => typeof p === 'string' ? p : bstUpload_(p, brand, i));
        const removed = curImgs.filter(u => photos.indexOf(u) < 0).length;
        lines.push('รูป: ' + curImgs.length + ' → ' + photos.length + ' รูป' + [added ? 'ใหม่ ' + added : '', removed ? 'ลบ ' + removed : '', !added && !removed ? 'เรียงใหม่' : ''].filter(Boolean).map(x => ' · ' + x).join(''));
      }
    }
    // เพิ่มสี/ไซซ์ใหม่
    const nv = [];
    (Array.isArray(b.newVariants) ? b.newVariants : []).slice(0, 10).forEach(v => {
      const color = txt(v && v.color, 40), size = txt(v && v.size, 40), stock = Math.floor(Number(v && v.stock));
      if (!color && !size) return;
      if (!isFinite(stock) || stock < 0 || stock > BST.MAX_ADD) throw webErr_('BAD_EDIT', 'จำนวนของสี/ไซซ์ใหม่ต้องอยู่ระหว่าง 0–' + BST.MAX_ADD + ' ชิ้นค่ะ');
      if (mine.some(x => bstNorm_(x.color) === bstNorm_(color) && bstNorm_(x.size) === bstNorm_(size)) || nv.some(x => bstNorm_(x.color) === bstNorm_(color) && bstNorm_(x.size) === bstNorm_(size)))
        throw webErr_('BAD_EDIT', 'มีสี/ไซซ์ "' + [color, size].filter(Boolean).join(' / ') + '" อยู่แล้วค่ะ');
      nv.push({ color, size, stock });
    });
    nv.forEach(v => lines.push('เพิ่มสี/ไซซ์: ' + [v.color, v.size].filter(Boolean).join(' / ') + ' · ' + v.stock + ' ชิ้น'));
    if (!lines.length) throw webErr_('BAD_EDIT', 'ยังไม่ได้แก้อะไรค่ะ');

    const note = String(b.note || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
    const sh = bstEditSheet_();
    // คำขอเดิมที่ยังรอของสินค้านี้ → Superseded (ใช้คำขอใหม่แทน)
    bstEditRows_().forEach(r => { if (r.status === 'Pending' && bstNorm_(r.brand) === bstNorm_(brand) && bstNorm_(r.product) === bstNorm_(cur.name)) sh.getRange(r.row, 6).setValue('Superseded'); });
    const props = PropertiesService.getScriptProperties(), seq = Number(props.getProperty('bst_edit_seq') || 0) + 1;
    props.setProperty('bst_edit_seq', String(seq));
    const id = 'PE-' + String(seq).padStart(4, '0');
    const payload = { brand, product: cur.name, changes: diff, photos, newVariants: nv, note, before: Object.assign({}, before, { images: curImgs }) };
    const changesText = lines.join('\n') + (note ? '\nหมายเหตุ: ' + note : '');
    sh.appendRow([id, new Date(), brand, cur.name, changesText, 'Pending', '', '', '', '', JSON.stringify(payload)]);
    const notified = bstNotifyText_(webProp_('ADMIN_GROUP_ID', ''),
      '✏️ แบรนด์ขอแก้ข้อมูลสินค้า · ' + brand + '\n' + id + ' · ' + cur.name + '\n\n' + lines.map(l => '• ' + l).join('\n') +
      (note ? '\n\nหมายเหตุจากแบรนด์: ' + note : '') +
      '\n\nยังไม่ขึ้นเว็บจนกว่าทีมจะอนุมัติ\nอนุมัติ: แท็บ Product Edits → Status = Approved\nไม่ผ่าน: ใส่เหตุผลใน Admin Note แล้วเลือก Rejected\n' +
      webSS_().getUrl() + '#gid=' + sh.getSheetId());
    if (doneKey) cache.put(doneKey, id, 21600);
    return { duplicate: false, id, notified };
  });
  const view = bstView_(brand, who.settings);
  view.requestId = result.id; view.duplicate = !!result.duplicate; view.notified = !!result.notified;
  return view;
}
function bstUpload_(p, brand, i) {
  const ext = p.mime.split('/')[1].replace('jpeg', 'jpg');
  const name = 'brandedit_' + bstNorm_(brand).replace(/[^a-z0-9]+/g, '') + '_' + Utilities.formatDate(new Date(), BST.TZ, 'yyyyMMdd_HHmmss') + '_' + i + '.' + ext;
  const file = admFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(p.data), p.mime, name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}
function bstNotifyText_(to, text) {
  const token = webProp_('LINE_CHANNEL_ACCESS_TOKEN', '');
  if (!to || !token) return false;
  try { return bstPush_(to, token, String(text).slice(0, 4900)); } catch (e) { console.error('bstNotifyText_ ' + e); return false; }
}
function bstBrandGroup_(brand) {
  const sh = webSS_().getSheetByName('Brand Master'), heads = webHeads_(sh), c = heads.indexOf('Brand Name'), g = heads.indexOf('LINE Group ID');
  if (c < 0 || g < 0 || sh.getLastRow() < 2) return '';
  const hit = sh.getRange(2, 1, sh.getLastRow() - 1, heads.length).getValues().find(r => bstNorm_(r[c]) === bstNorm_(brand));
  return hit ? String(hit[g] || '').trim() : '';
}

/* ---------- ทีมเลือก Status ในแท็บ Product Edits ---------- */
// Run ครั้งเดียว: สร้างแท็บ Product Edits + ตัวจับการแก้ชีต (bstOnEdit)
function bstSetup() {
  bstEditSheet_();
  const ss = webSS_(), have = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'bstOnEdit');
  if (!have) ScriptApp.newTrigger('bstOnEdit').forSpreadsheet(ss).onEdit().create();
  console.log('พร้อมแล้ว: แท็บ ' + BST.EDITS + (have ? ' (มีตัวจับการแก้อยู่แล้ว)' : ' + ตัวจับการแก้ bstOnEdit'));
}
function bstOnEdit(e) {
  try {
    const sh = e && e.range && e.range.getSheet();
    if (sh && typeof CAMP !== 'undefined' && sh.getName() === CAMP.ENTRIES) return campOnEdit_(e);   // Web_Campaign.gs
    if (!sh || sh.getName() !== BST.EDITS || e.range.getRow() < 2) return;
    const c0 = e.range.getColumn(), c1 = c0 + e.range.getNumColumns() - 1;
    if (6 < c0 || 6 > c1) return;
    for (let r = e.range.getRow(); r < e.range.getRow() + e.range.getNumRows(); r++) bstDecide_(r);
  } catch (err) { console.error('bstOnEdit ' + err); }
}
function bstDecide_(row) {
  webWithLock_(() => {
    const sh = bstEditSheet_(), r = sh.getRange(row, 1, 1, BST.EDIT_HEADS.length).getValues()[0];
    const status = String(r[5]).trim(), done = String(r[8] || '').trim();
    if ((done && !/^ผิดพลาด/.test(done)) || (status !== 'Approved' && status !== 'Rejected')) return;
    let p; try { p = JSON.parse(r[10]); } catch (e) { sh.getRange(row, 9).setValue('ผิดพลาด: อ่าน Payload ไม่ได้'); return; }
    const id = String(r[0]), note = String(r[6] || '').trim();
    let result, msg;
    if (status === 'Approved') {
      try { result = bstApply_(p); }
      catch (e) { sh.getRange(row, 9).setValue('ผิดพลาด: ' + e.message + ' (แก้แล้วเลือก Approved ใหม่)'); sh.getRange(row, 6).setValue('Pending'); return; }
      msg = '✅ ทีม Mera อนุมัติการแก้ไขสินค้าแล้ว\n' + id + ' · ' + p.product + '\n\n' + String(r[4]).split('\n').map(l => '• ' + l).join('\n') +
        (note ? '\n\nจากทีม Mera: ' + note : '') + '\n\nขึ้นหน้าเว็บภายใน 10 นาทีค่ะ';
    } else {
      result = 'ไม่ผ่าน';
      msg = '❌ การแก้ไขสินค้ายังไม่ผ่าน\n' + id + ' · ' + p.product + '\n\nเหตุผล: ' + (note || '-') + '\n\nแก้ไขแล้วส่งใหม่ได้ในหน้า Mera Seller ค่ะ';
    }
    const sent = bstNotifyText_(bstBrandGroup_(p.brand), msg);
    sh.getRange(row, 8, 1, 3).setValues([[new Date(), result, sent ? 'Sent' : 'Failed']]);
  });
}
// แก้ชีตจริงตามคำขอที่อนุมัติ
function bstApply_(p) {
  const brand = p.brand, oldName = p.product, ch = p.changes || {}, newName = ch.name || oldName, done = [];
  const db = webSS_().getSheetByName(BST.DB), { C, rows } = bstRows_(brand);
  const mine = rows.filter(v => bstNorm_(v.name) === bstNorm_(oldName));
  if (!mine.length) throw new Error('ไม่พบสินค้า ' + oldName + ' ใน Product Database');
  const set = (col, val) => { if (col >= 0) mine.forEach(v => db.getRange(v.row, col + 1).setValue(val)); };
  if (ch.name) { set(C.name, newName); done.push('ชื่อ'); }
  if (ch.category) { set(C.cat, ch.category); done.push('หมวด'); }
  if (ch.price) { set(C.price, ch.price); done.push('ราคาขาย'); }
  if (ch.orig) { set(C.orig, ch.orig); done.push('ราคาเต็ม'); }
  if ((ch.price || ch.orig) && C.pct >= 0) { const pr = Number(ch.price || mine[0].price), o = Number(ch.orig || mine[0].orig); if (o) set(C.pct, 1 - pr / o); }
  // สี/ไซซ์ใหม่ → แถวใหม่ใน Product Database (SKU = เลขสูงสุด + 1 แบบเดียวกับระบบลงสินค้า)
  if ((p.newVariants || []).length) {
    const heads = webHeads_(db), skus = db.getRange(2, C.sku + 1, Math.max(1, db.getLastRow() - 1), 1).getDisplayValues();
    let max = 0; skus.forEach(r => { const m = String(r[0]).match(/^MRA(\d+)$/i); if (m) max = Math.max(max, Number(m[1])); });
    const t = mine[0], price = Number(ch.price || t.price), orig = Number(ch.orig || t.orig);
    p.newVariants.forEach((v, i) => {
      const row = new Array(heads.length).fill(''), put = (c, x) => { if (c >= 0) row[c] = x; };
      put(C.sku, 'MRA' + String(max + 1 + i).padStart(3, '0')); put(C.brand, brand); put(C.name, newName); put(C.size, v.size || '-'); put(C.color, v.color || '-');
      put(C.stock, v.stock); put(C.orig, orig); put(C.price, price); put(C.pct, orig ? 1 - price / orig : ''); put(C.status, 'ACTIVE');
      put(C.cat, ch.category || t.cat); put(C.sold, 0); put(C.inv, v.stock > 0 ? 'IN STOCK' : 'OUT OF STOCK'); put(C.remain, v.stock);
      put(C.source, 'Mera Seller'); put(C.created, new Date());
      db.appendRow(row);
    });
    done.push('เพิ่มสี/ไซซ์ ' + p.newVariants.length);
  }
  // ชีต Mera Admin: ย้ายคีย์เมื่อเปลี่ยนชื่อ + รายละเอียด + รูป
  if (webProp_('ADMIN_SHEET_ID', '')) {
    const ok = admKey_(brand, oldName), nk = admKey_(brand, newName), adm = admSheet_();
    if (ch.name) {
      const keep = (admProductInfo_() || {})[ok] || {};   // ข้อมูลจากฟอร์มเดิมผูกกับชื่อเก่า → เก็บไว้ในแท็บ Product Details ชื่อใหม่
      bstDetailsRow_(adm, brand, oldName, newName, { size: keep.size, description: keep.description || keep.detail, material: keep.material }, true);
      const im = admImgTab_(), n = im.getLastRow() - 1;
      if (n > 0) im.getRange(2, 1, n, 2).getValues().forEach((r, i) => {
        const kind = String(r[0]).trim().toLowerCase(), key = String(r[1]);
        if ((kind === 'product' && admNorm_(key) === ok) ) im.getRange(i + 2, 2).setValue(nk);
        if (kind === 'color' && key.split('|').slice(0, 2).map(admNorm_).join('|') === ok) im.getRange(i + 2, 2).setValue(nk + '|' + key.split('|').slice(2).join('|'));
      });
      const nt = admNewTab_(), m = nt ? nt.getLastRow() - 1 : 0;
      if (m > 0) nt.getRange(2, 1, m, 1).getValues().forEach((r, i) => {
        const parts = String(r[0]).split('|'); if (parts.slice(0, 2).map(admNorm_).join('|') === ok) nt.getRange(i + 2, 1).setValue([nk].concat(parts.slice(2)).join('|'));
      });
    }
    const det = {}; if ('description' in ch) det.description = ch.description; if ('material' in ch) det.material = ch.material; if ('size' in ch) det.size = ch.size;
    if (Object.keys(det).length) { bstDetailsRow_(adm, brand, newName, newName, det, false); done.push('รายละเอียด'); }
    if (Array.isArray(p.photos) && p.photos.length) {
      const im = admImgTab_(), n = im.getLastRow() - 1, row = ['product', nk, p.photos.join('\n'), new Date(), 'Mera Seller (' + brand + ')'];
      let at = -1; if (n > 0) im.getRange(2, 1, n, 2).getValues().forEach((r, i) => { if (String(r[0]).trim().toLowerCase() === 'product' && admNorm_(r[1]) === nk) at = i + 2; });
      if (at > 0) im.getRange(at, 1, 1, row.length).setValues([row]); else im.appendRow(row);
      done.push('รูป');
    }
    CacheService.getScriptCache().remove(ADM.PUB_CACHE);
  } else if (ch.description || ch.material || ch.size || p.photos) throw new Error('ยังไม่มีชีต Mera Admin (ADMIN_SHEET_ID) สำหรับเก็บรูป/รายละเอียด');
  SpreadsheetApp.flush();
  return 'อัปเดตแล้ว: ' + done.join(', ');
}
// แถวในแท็บ Product Details (Brand, Product Name, Size Chart, Description, Material, …) · onlyBlank = เติมเฉพาะช่องว่าง
function bstDetailsRow_(adm, brand, findName, newName, vals, onlyBlank) {
  const t = adm.getSheetByName(ADM.INFO_TAB), heads = webHeads_(t), ix = n => heads.indexOf(n);
  const col = { size: ix('Size Chart'), description: ix('Description'), material: ix('Material') };
  const n = t.getLastRow() - 1;
  let at = -1;
  if (n > 0) t.getRange(2, 1, n, 2).getValues().forEach((r, i) => { if (admKey_(r[0], r[1]) === admKey_(brand, findName)) at = i + 2; });
  if (at < 0) { const row = new Array(heads.length).fill(''); row[ix('Brand')] = brand; row[ix('Product Name')] = newName; t.appendRow(row); at = t.getLastRow(); }
  else if (findName !== newName) t.getRange(at, ix('Product Name') + 1).setValue(newName);
  Object.keys(col).forEach(k => {
    if (col[k] < 0 || !(k in vals) || vals[k] == null) return;
    const cell = t.getRange(at, col[k] + 1);
    if (onlyBlank && String(cell.getValue()).trim()) return;
    cell.setValue(vals[k]);
  });
  if (ix('Updated At') >= 0) t.getRange(at, ix('Updated At') + 1).setValue(new Date());
}
