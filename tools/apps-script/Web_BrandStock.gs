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
 *       ทุกครั้งลงแท็บ Stock Log · มีการ "เพิ่ม" → ส่ง LINE เข้ากลุ่มแอดมิน (ADMIN_GROUP_ID)
 *
 * กติกา
 *  - แบรนด์เข้าด้วย Portal Key ใน Brand Master (Active = TRUE) · Web Settings "Brand Portal" ต้องเป็น TRUE
 *  - ปิดเฉพาะแท็บสินค้า: Web Settings "Brand Stock" = FALSE (ไม่มีแถวนี้ = เปิด)
 *  - เห็นเฉพาะแถวที่ Brand ตรงกับชื่อแบรนด์ใน Brand Master และมี Product Status (แถวเก่า MRA001–029 ไม่มี → ไม่แสดง)
 *  - เปลี่ยนที่ Stock (จำนวนที่ลงไว้ทั้งหมด) · Sold ไม่แตะ (มาจากออเดอร์) · Remaining = Stock − Sold
 *    ช่อง Remaining ที่เป็นสูตร ปล่อยให้สูตรคำนวณเอง · ช่องที่เป็นตัวเลข ระบบเขียนให้
 *  - เพิ่มได้ไม่เกิน BST.MAX_ADD ชิ้นต่อ SKU ต่อครั้ง · ครั้งละไม่เกิน BST.MAX_CHANGES SKU
 *  - ปุ่ม "+ ลงสินค้าใหม่" ในหน้าแบรนด์ = Google Form ที่ส่งคำตอบเข้าแท็บ Product Responses (หาให้เอง)
 *    อยากใช้ลิงก์อื่น: ใส่ Web Settings "Product Form URL" · ไม่อยากให้มีปุ่ม: ใส่ none
 *
 * ใช้ของเดิมใน Web_Order.gs: webSS_, webHeads_, webWithLock_, webErr_, webProp_
 * Script Properties เดิม: LINE_CHANNEL_ACCESS_TOKEN, ADMIN_GROUP_ID
 */
const BST = {
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
    sold: heads.findIndex(h => /^sold\s*q/i.test(h)), inv: ix('Inventory Status'), remain: ix('Remaining') };
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
      remainFormula: !!(forms && forms[i][0]) });
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
  rows.forEach(v => {
    const k = bstNorm_(v.name);
    if (!by[k]) { by[k] = { name: v.name, cat: v.cat, price: v.price, orig: v.orig, variants: [] }; order.push(k); }
    by[k].variants.push({ sku: v.sku, color: v.color, size: v.size, stock: v.stock, sold: v.sold, remaining: v.remain,
      held: held[v.sku] || 0, active: v.active });
  });
  return { ok: true, brand: brand, products: order.map(k => by[k]), maxAdd: BST.MAX_ADD,
    formUrl: bstFormUrl_(settings), updatedAt: Date.now() };
}
// ลิงก์ฟอร์มลงสินค้าใหม่: ใช้ Web Settings "Product Form URL" ถ้ากรอกไว้
// ไม่กรอก = หาเองจากฟอร์มที่ส่งคำตอบเข้าแท็บ Product Responses (ฟอร์มเดียวกับที่แบรนด์ใช้ลงสินค้าอยู่แล้ว)
function bstFormUrl_(settings) {
  const set = String(settings['Product Form URL'] || '').trim();
  if (/^https:\/\//.test(set)) return set;
  if (/^(none|off|false)$/i.test(set)) return '';
  const cache = CacheService.getScriptCache(), hit = cache.get('bst_form_url');
  if (hit !== null) return hit;
  let url = '';
  try {
    const sh = webSS_().getSheetByName('Product Responses');
    const raw = sh && sh.getFormUrl ? String(sh.getFormUrl() || '') : '';
    const m = raw.match(/\/forms\/d\/(e\/)?([A-Za-z0-9_-]{20,})/);
    if (m) url = m[1] ? 'https://docs.google.com/forms/d/e/' + m[2] + '/viewform' : 'https://docs.google.com/forms/d/' + m[2] + '/viewform';
  } catch (e) { console.warn('bstFormUrl_ ' + e); }
  cache.put('bst_form_url', url, 3600);
  return url;
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

    const adds = plan.filter(p => p.d > 0);
    let notified = false;
    if (adds.length) notified = bstNotify_(who.name, plan, note);
    const now = new Date(), log = bstLogSheet_();
    log.getRange(log.getLastRow() + 1, 1, plan.length, BST.LOG_HEADS.length).setValues(plan.map(p => [
      now, who.name, p.v.sku, p.v.name, p.v.color, p.v.size, p.v.stock, p.d, p.after, p.remainAfter, note, ref,
      p.d > 0 ? (notified ? 'Sent' : 'Failed') : '']));
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
  const adds = plan.filter(p => p.d > 0), cuts = plan.filter(p => p.d < 0);
  const line = p => '• ' + p.v.name + ([p.v.color, p.v.size].filter(Boolean).length ? ' · ' + [p.v.color, p.v.size].filter(Boolean).join(' / ') : '') +
    ' (' + p.v.sku + ')\n   เหลือ ' + Math.max(0, p.v.stock - p.v.sold) + ' → ' + p.remainAfter + ' (' + (p.d > 0 ? '+' : '') + p.d + ')';
  let t = '📦 แบรนด์เพิ่มสต็อก · ' + brand + '\n\n' + adds.map(line).join('\n');
  if (cuts.length) t += '\n\nลดด้วย ' + cuts.length + ' รายการ:\n' + cuts.map(line).join('\n');
  if (note) t += '\n\nหมายเหตุจากแบรนด์: ' + note;
  t += '\n\n' + Utilities.formatDate(new Date(), BST.TZ, 'd MMM HH:mm') + ' · ขึ้นหน้าเว็บภายใน 10 นาที';
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
