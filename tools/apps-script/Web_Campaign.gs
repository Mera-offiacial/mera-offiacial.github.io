/**
 * Mera Seller — แคมเปญ: แบรนด์ติ๊กเลือกรุ่นเข้าแคมเปญจากหน้าแบรนด์ + ดูยอดขายแคมเปญ
 * ------------------------------------------------------------
 * วางเป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Inventory + GB" (โปรเจกต์เดียวกับ Web_Order.gs / Web_BrandStock.gs)
 * ไม่ต้องแก้ webRoute_ เพิ่ม: Web_BrandStock.gs ส่ง action brandCampaign / brandCampaignSave มาที่ไฟล์นี้ให้เอง
 * ติดตั้ง: วางไฟล์ → Run campSetup 1 ครั้ง (สร้างแท็บ Campaigns / Campaign Entries + ตัวตั้งเวลา campTick ทุกชั่วโมง) → Deploy New version
 *
 * กติกา (Palm 27 พ.ย. 2026)
 *  - แบรนด์ที่เข้าร่วมแล้วติ๊กรุ่นที่อยากโปรโมตได้เลย (ทีละสินค้า = ทุกสี/ไซซ์ของสินค้านั้น) · ใช้สต็อกที่มีอยู่
 *  - ทุกชิ้นต้องกรอกราคาออนไลน์ของแบรนด์ช่วงแคมเปญ
 *  - ราคาแคมเปญ 2 แบบ: ส่วนลดมีร่า (% ในแท็บ Campaigns คิดจากราคาบนมีร่าตอนนี้) หรือแบรนด์ตั้งเอง
 *    ต้องต่ำกว่าราคาบนมีร่าตอนนี้ และต่ำกว่าราคาออนไลน์ของแบรนด์
 *  - มีร่าอนุมัติทุกชิ้น: แท็บ Campaign Entries → Status = Approved / Rejected (ใส่เหตุผลใน Admin Note ก่อนเลือก Rejected)
 *  - ถึงวันเริ่ม: ระบบเปลี่ยน Sale Price ใน Product Database เป็นราคาแคมเปญ (จำราคาเดิมไว้ในช่อง Price Before)
 *    หลังวันจบ / ถอน / ไม่ผ่าน: เปลี่ยนกลับเป็นราคาเดิมเอง (ทำทุกชั่วโมงโดย campTick)
 *  - ระหว่างที่สินค้าอยู่ในแคมเปญ แบรนด์ขอแก้ราคาขาย/ราคาเต็มไม่ได้
 *  - ค่าบริการ: 5% สำหรับ 5 ชิ้นแรกที่ขายสำเร็จต่อแบรนด์ในแคมเปญ · 4% ตั้งแต่ชิ้นที่ 6 · คิดจากราคาสินค้า ไม่รวมค่าส่ง · ไม่มี VAT
 *    ลงทะเบียนภายในวัน Free Until = ไม่หักค่าบริการทั้งแคมเปญ
 *
 * ใช้ของเดิม: webSS_, webHeads_, webWithLock_, webErr_, webProp_ (Web_Order.gs) · bst* (Web_BrandStock.gs)
 */
const CAMP = {
  LIST: 'Campaigns',
  LIST_HEADS: ['Campaign ID', 'Name', 'Status', 'Register From', 'Free Until', 'Register Until', 'Start', 'End',
    'Fixed Discount %', 'Fee First %', 'Fee First Count', 'Fee Rest %', 'Description', 'Note'],
  ENTRIES: 'Campaign Entries',
  ENTRY_HEADS: ['Entry ID', 'Campaign ID', 'Brand', 'Product', 'SKUs', 'Mera Price', 'Online Price', 'Mode', 'Campaign Price', 'Discount %',
    'Submitted At', 'Updated At', 'Status', 'Admin Note', 'Decided At', 'Applied', 'Price Before', 'Result', 'Notified Status', 'Client Ref'],
  STATUSES: ['Pending', 'Approved', 'Rejected', 'Withdrawn'],
  NOT_SOLD: ['Pending Slip', 'Slip Rejected', 'Cancelled', 'Error'],   // ออเดอร์เว็บที่ไม่นับเป็นยอดขาย
  SHOW_AFTER_END_DAYS: 30,
  MAX_ITEMS: 60,
  TZ: 'Asia/Bangkok',
};
const CE = {}; CAMP.ENTRY_HEADS.forEach((h, i) => { CE[h] = i; });

/* ---------- วันที่ (เวลาไทย) ---------- */
// ช่องวันที่ในชีต: Date หรือข้อความ yyyy-mm-dd · endOfDay = นับถึง 23:59 ของวันนั้น
function campDay_(v, endOfDay) {
  if (v === '' || v == null) return 0;
  let ms;
  if (v instanceof Date) ms = v.getTime();
  else {
    const m = String(v).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return 0;
    ms = Date.UTC(+m[1], +m[2] - 1, +m[3]) - 7 * 3600e3;
  }
  if (!endOfDay) return ms;
  const bkk = new Date(ms + 7 * 3600e3);
  if (bkk.getUTCHours() || bkk.getUTCMinutes()) return ms;   // ใส่เวลาไว้เอง = ใช้เวลานั้น
  return ms + 864e5 - 1;
}
function campYmd_(ms) { const x = new Date(ms + 7 * 3600e3); return x.getUTCFullYear() + '-' + String(x.getUTCMonth() + 1).padStart(2, '0') + '-' + String(x.getUTCDate()).padStart(2, '0'); }
function campNow_() { return Date.now(); }

/* ---------- ชีต ---------- */
function campSheet_(name, heads) {
  const ss = webSS_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, heads.length).setValues([heads]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function campList_() {
  const sh = campSheet_(CAMP.LIST, CAMP.LIST_HEADS), heads = webHeads_(sh), n = sh.getLastRow() - 1, ix = h => heads.indexOf(h);
  if (n < 1) return [];
  const num = (v, d) => { const x = Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return String(v).trim() === '' || !isFinite(x) ? d : x; };
  return sh.getRange(2, 1, n, heads.length).getValues().map(r => {
    const g = h => ix(h) >= 0 ? r[ix(h)] : '';
    const c = { id: String(g('Campaign ID')).trim(), name: String(g('Name')).trim(), status: String(g('Status')).trim(),
      registerFrom: campDay_(g('Register From')), freeUntil: campDay_(g('Free Until'), true), registerUntil: campDay_(g('Register Until'), true),
      start: campDay_(g('Start')), end: campDay_(g('End'), true), fixedPct: num(g('Fixed Discount %'), 0),
      feeFirst: num(g('Fee First %'), 5), feeCount: num(g('Fee First Count'), 5), feeRest: num(g('Fee Rest %'), 4),
      description: String(g('Description') || '').trim() };
    if (c.fixedPct > 0 && c.fixedPct < 1) c.fixedPct = Math.round(c.fixedPct * 100);   // ช่องเป็น % ในชีต (0.15)
    if (c.feeFirst > 0 && c.feeFirst < 1) c.feeFirst *= 100;
    if (c.feeRest > 0 && c.feeRest < 1) c.feeRest *= 100;
    if (!c.registerUntil) c.registerUntil = c.end;
    return c;
  }).filter(c => /^CP-/i.test(c.id) && c.name && c.start && c.end);
}
function campPhase_(c, now) {
  if (now > c.end) return 'ended';
  if (now >= c.start) return 'live';
  return 'soon';
}
function campCanRegister_(c, now) {
  return /^open$/i.test(c.status) && now <= c.registerUntil && now <= c.end && (!c.registerFrom || now >= c.registerFrom);
}
// แคมเปญที่แบรนด์เห็น: Status = Open (หรือ Closed = ปิดรับแต่ยังให้ดูยอด) และยังไม่จบเกิน 30 วัน
function campVisible_(now) {
  return campList_().filter(c => /^(open|closed)$/i.test(c.status) && now <= c.end + CAMP.SHOW_AFTER_END_DAYS * 864e5)
    .sort((a, b) => (campPhase_(a, now) === 'ended') - (campPhase_(b, now) === 'ended') || a.start - b.start);
}
function campEntrySheet_() {
  const ss = webSS_(), had = !!ss.getSheetByName(CAMP.ENTRIES), sh = campSheet_(CAMP.ENTRIES, CAMP.ENTRY_HEADS);
  if (!had) try {
    sh.getRange(2, CE['Status'] + 1, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CAMP.STATUSES, true).build());
  } catch (e) {}
  return sh;
}
function campEntries_() {
  const sh = campEntrySheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, CAMP.ENTRY_HEADS.length).getValues().map((r, i) => ({ row: i + 2, r: r,
    id: String(r[CE['Entry ID']]), camp: String(r[CE['Campaign ID']]).trim(), brand: String(r[CE['Brand']]).trim(), product: String(r[CE['Product']]).trim(),
    skus: String(r[CE['SKUs']] || '').split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean),
    meraPrice: bstNum_(r[CE['Mera Price']]), online: bstNum_(r[CE['Online Price']]), mode: String(r[CE['Mode']]).trim() === 'Own' ? 'own' : 'fixed',
    price: bstNum_(r[CE['Campaign Price']]), submittedAt: r[CE['Submitted At']] instanceof Date ? r[CE['Submitted At']].getTime() : 0,
    status: String(r[CE['Status']]).trim() || 'Pending', note: String(r[CE['Admin Note']] || '').trim(),
    applied: String(r[CE['Applied']] || '').trim(), before: bstNum_(r[CE['Price Before']]), notified: String(r[CE['Notified Status']] || '').trim(),
    ref: String(r[CE['Client Ref']] || '') }));
}
function campSet_(sh, row, vals) { Object.keys(vals).forEach(h => sh.getRange(row, CE[h] + 1).setValue(vals[h])); }

/* ---------- สินค้าของแบรนด์ (รวมสี/ไซซ์เป็นสินค้าเดียว) ---------- */
function campProducts_(brand) {
  const { rows } = bstRows_(brand), by = {}, order = [];
  rows.forEach(v => {
    const k = bstNorm_(v.name);
    if (!by[k]) { by[k] = { name: v.name, price: v.price, orig: v.orig, left: 0, skus: [], img: '' }; order.push(k); }
    by[k].left += Math.max(0, v.remain); by[k].skus.push(v.sku);
    if (!by[k].img && v.img.length) by[k].img = v.img[0];
  });
  return order.map(k => by[k]);
}

/* ---------- ยอดขายแคมเปญของแบรนด์ (จาก Web Orders) ---------- */
function campSales_(c, brand, entries, free) {
  const skus = {}, nameOf = {};
  entries.forEach(e => { if (e.status === 'Approved' || e.applied) e.skus.forEach(s => { skus[s] = 1; nameOf[s] = e.product; }); });
  const out = { pcs: 0, orders: 0, gross: 0, fee: 0, feeFull: 0, free: free, daily: [], products: [] };
  const sh = webSS_().getSheetByName('Web Orders');
  const days = {}; for (let t = c.start; t <= c.end; t += 864e5) days[campYmd_(t)] = { date: campYmd_(t), pcs: 0, amount: 0 };
  if (sh && sh.getLastRow() > 1 && Object.keys(skus).length) {
    const heads = webHeads_(sh), ix = h => heads.indexOf(h);
    const cSt = ix('Status'), cAt = ix('Created At'), cPaid = ix('Paid At'), cJson = ix('Items JSON'), cSku = ix('SKU'), cQty = ix('Qty'), cUnit = ix('Unit Price');
    const pieces = [], ords = {};
    sh.getRange(2, 1, sh.getLastRow() - 1, heads.length).getValues().forEach(r => {
      const st = String(cSt >= 0 ? r[cSt] : '').trim();
      if (!st || CAMP.NOT_SOLD.indexOf(st) >= 0) return;
      const tv = (cPaid >= 0 && r[cPaid] instanceof Date) ? r[cPaid] : r[cAt];
      const at = tv instanceof Date ? tv.getTime() : 0;
      if (!at || at < c.start || at > c.end) return;
      let items = null;
      if (cJson >= 0 && String(r[cJson] || '').trim()) { try { items = JSON.parse(r[cJson]); } catch (e) { items = null; } }
      if (!Array.isArray(items)) items = [{ sku: r[cSku], qty: cQty >= 0 ? r[cQty] : 1, unit: cUnit >= 0 ? r[cUnit] : 0 }];
      items.forEach(it => {
        const s = String(it.sku || '').trim().toUpperCase(); if (!skus[s]) return;
        const q = Math.max(0, Math.floor(bstNum_(it.qty) || 0)), unit = bstNum_(it.unit);
        for (let i = 0; i < q; i++) pieces.push({ at, sku: s, unit });
        if (q) ords[String(r[0])] = 1;
      });
    });
    pieces.sort((a, b) => a.at - b.at);
    const byP = {};
    pieces.forEach((p, i) => {
      const rate = (i < c.feeCount ? c.feeFirst : c.feeRest) / 100;
      out.pcs++; out.gross += p.unit; out.feeFull += p.unit * rate;
      const d = days[campYmd_(p.at)]; if (d) { d.pcs++; d.amount += p.unit; }
      const k = nameOf[p.sku]; byP[k] = byP[k] || { name: k, sold: 0, amount: 0 }; byP[k].sold++; byP[k].amount += p.unit;
    });
    out.orders = Object.keys(ords).length;
    out.products = Object.keys(byP).map(k => byP[k]).sort((a, b) => b.amount - a.amount);
  }
  const r2 = x => Math.round(x * 100) / 100;
  out.gross = r2(out.gross); out.feeFull = r2(out.feeFull); out.fee = free ? 0 : out.feeFull; out.net = r2(out.gross - out.fee);
  out.daily = Object.keys(days).sort().map(k => days[k]);
  return out;
}

/* ---------- หน้าแบรนด์: brandCampaign ---------- */
function campView_(brand) {
  const now = campNow_(), list = campVisible_(now), all = campEntries_(), prods = campProducts_(brand);
  const campaigns = list.map(c => {
    const mine = all.filter(e => e.camp === c.id && bstNorm_(e.brand) === bstNorm_(brand));
    const regAt = mine.reduce((m, e) => e.submittedAt && (!m || e.submittedAt < m) ? e.submittedAt : m, 0);
    const free = !!c.freeUntil && (regAt ? regAt <= c.freeUntil : now <= c.freeUntil);
    const entries = {};
    mine.filter(e => e.status !== 'Withdrawn').forEach(e => {
      entries[bstNorm_(e.product)] = { id: e.id, status: e.status, mode: e.mode, price: e.price, online: e.online, meraPrice: e.meraPrice,
        note: e.status === 'Rejected' ? e.note : '', applied: e.applied === 'Applied' };
    });
    return { id: c.id, name: c.name, description: c.description, phase: campPhase_(c, now), canRegister: campCanRegister_(c, now),
      registerFrom: c.registerFrom, freeUntil: c.freeUntil, registerUntil: c.registerUntil, start: c.start, end: c.end,
      fixedPct: c.fixedPct, fee: { first: c.feeFirst, count: c.feeCount, rest: c.feeRest }, free: free, registeredAt: regAt,
      entries: entries, sales: campSales_(c, brand, mine, free) };
  });
  // สินค้าที่อยู่ในแคมเปญและขึ้นราคาแคมเปญแล้ว: ราคาบนมีร่าก่อนแคมเปญ = Price Before
  const before = {};
  all.forEach(e => { if (e.applied === 'Applied' && bstNorm_(e.brand) === bstNorm_(brand)) before[bstNorm_(e.product)] = e.before; });
  return { ok: true, brand: brand, now: now, campaigns: campaigns,
    products: prods.map(p => ({ name: p.name, price: before[bstNorm_(p.name)] || p.price, orig: p.orig, left: p.left, skus: p.skus, img: p.img })) };
}
function campBrandView_(b) { const who = bstBrand_(b); return campView_(who.name); }

/* ---------- หน้าแบรนด์: brandCampaignSave ---------- */
function campSave_(b) {
  const who = bstBrand_(b), brand = who.name, now = campNow_();
  const ref = String(b.clientRef || '').slice(0, 64), cache = CacheService.getScriptCache();
  const c = campList_().filter(x => x.id === String(b.campaignId || '').trim())[0];
  if (!c) throw webErr_('CAMP_NONE', 'ไม่พบแคมเปญนี้ โหลดหน้าใหม่แล้วลองอีกครั้งนะคะ');
  if (!campCanRegister_(c, now)) throw webErr_('CAMP_CLOSED', 'แคมเปญนี้ปิดรับสินค้าแล้วค่ะ');
  if (b.agree !== true) throw webErr_('CAMP_AGREE', 'ติ๊กยืนยันเงื่อนไขแคมเปญก่อนส่งนะคะ');
  const items = Array.isArray(b.items) ? b.items : [];
  if (items.length > CAMP.MAX_ITEMS) throw webErr_('TOO_MANY', 'ส่งได้ครั้งละไม่เกิน ' + CAMP.MAX_ITEMS + ' สินค้าค่ะ');

  const result = webWithLock_(() => {
    const doneKey = ref ? 'camp_' + bstNorm_(brand) + '_' + ref : '';
    if (doneKey && cache.get(doneKey)) return { duplicate: true };
    const prods = campProducts_(brand), byName = {}; prods.forEach(p => { byName[bstNorm_(p.name)] = p; });
    const all = campEntries_(), mine = all.filter(e => e.camp === c.id && bstNorm_(e.brand) === bstNorm_(brand) && e.status !== 'Withdrawn');
    const cur = {}; mine.forEach(e => { cur[bstNorm_(e.product)] = e; });
    const want = {}, problems = [];
    items.forEach(it => {
      const k = bstNorm_(it && it.product), p = byName[k], old = cur[k];
      if (!p) return problems.push((it && it.product || '?') + ': ไม่ใช่สินค้าของแบรนด์นี้');
      if (want[k]) return;
      const base = old && old.applied === 'Applied' ? old.before : p.price;   // ขึ้นราคาแคมเปญแล้ว → ใช้ราคาก่อนแคมเปญ
      const mode = it.mode === 'own' ? 'own' : 'fixed';
      if (mode === 'fixed' && !(c.fixedPct > 0)) return problems.push(p.name + ': แคมเปญนี้ไม่มีส่วนลดมีร่า ตั้งราคาเองนะคะ');
      const online = Math.round(bstNum_(it.online));
      const price = mode === 'fixed' ? Math.round(base * (1 - c.fixedPct / 100)) : Math.round(bstNum_(it.price));
      if (!old && p.left <= 0) return problems.push(p.name + ': หมดสต็อก เติมสต็อกก่อนจึงเข้าแคมเปญได้');
      if (!(online > 0) || online > 100000) return problems.push(p.name + ': กรอกราคาออนไลน์ของแบรนด์ช่วงแคมเปญ');
      if (!(price > 0)) return problems.push(p.name + ': ใส่ราคาแคมเปญ');
      if (price >= base) return problems.push(p.name + ': ราคาแคมเปญต้องต่ำกว่าราคาบนมีร่าตอนนี้ (' + base + ' บาท)');
      if (price >= online) return problems.push(p.name + ': ราคาบนมีร่าต้องต่ำกว่าราคาออนไลน์ของแบรนด์ (' + online + ' บาท)');
      want[k] = { p, mode, price, online, base, old };
    });
    if (problems.length) { const e = webErr_('CAMP_BAD', problems.join(' · ')); e.items = problems; throw e; }

    const sh = campEntrySheet_(), lines = [], toRestore = [];
    const pct = (price, base) => base ? Math.round((1 - price / base) * 100) / 100 : '';
    Object.keys(want).forEach(k => {
      const w = want[k], o = w.old;
      if (o && o.mode === w.mode && o.price === w.price && o.online === w.online) return;   // ไม่เปลี่ยน = คงสถานะเดิม
      const label = '• ' + w.p.name + ' ' + w.base + ' → ' + w.price + ' บาท (' + (w.mode === 'own' ? 'ตั้งเอง' : 'ส่วนลดมีร่า −' + c.fixedPct + '%') +
        ' · ออนไลน์แบรนด์ ' + w.online + ')';
      if (o) {
        if (o.applied === 'Applied') toRestore.push(o);
        campSet_(sh, o.row, { 'SKUs': w.p.skus.join(', '), 'Mera Price': w.base, 'Online Price': w.online, 'Mode': w.mode === 'own' ? 'Own' : 'Fixed',
          'Campaign Price': w.price, 'Discount %': pct(w.price, w.base), 'Updated At': new Date(now), 'Status': 'Pending', 'Admin Note': '', 'Decided At': '',
          'Result': '', 'Notified Status': '', 'Client Ref': ref });
        lines.push(label + ' · แก้ไข' + (o.status === 'Approved' ? ' (เดิมอนุมัติแล้ว ต้องตรวจใหม่)' : ''));
      } else {
        const props = PropertiesService.getScriptProperties(), seq = Number(props.getProperty('camp_entry_seq') || 0) + 1;
        props.setProperty('camp_entry_seq', String(seq));
        const row = new Array(CAMP.ENTRY_HEADS.length).fill('');
        const put = (h, v) => { row[CE[h]] = v; };
        put('Entry ID', 'CE-' + String(seq).padStart(4, '0')); put('Campaign ID', c.id); put('Brand', brand); put('Product', w.p.name);
        put('SKUs', w.p.skus.join(', ')); put('Mera Price', w.base); put('Online Price', w.online); put('Mode', w.mode === 'own' ? 'Own' : 'Fixed');
        put('Campaign Price', w.price); put('Discount %', pct(w.price, w.base)); put('Submitted At', new Date(now)); put('Updated At', new Date(now));
        put('Status', 'Pending'); put('Client Ref', ref);
        sh.appendRow(row);
        lines.push(label + ' · ใหม่');
      }
    });
    mine.forEach(o => {
      if (want[bstNorm_(o.product)]) return;
      if (o.applied === 'Applied') toRestore.push(o);
      campSet_(sh, o.row, { 'Status': 'Withdrawn', 'Updated At': new Date(now), 'Notified Status': 'Withdrawn' });
      lines.push('• ' + o.product + ' · ถอนออก');
    });
    toRestore.forEach(o => campRestore_(sh, o));
    SpreadsheetApp.flush();
    let notified = false;
    if (lines.length) notified = bstNotifyText_(webProp_('ADMIN_GROUP_ID', ''),
      '🏷️ แบรนด์ส่งสินค้าเข้าแคมเปญ · ' + brand + '\n' + c.name + ' (' + c.id + ')\n\n' + lines.join('\n') +
      '\n\nตรวจราคาออนไลน์ของแบรนด์ แล้วเลือก Status ในแท็บ Campaign Entries\nอนุมัติ: Approved · ไม่ผ่าน: ใส่เหตุผลใน Admin Note แล้วเลือก Rejected\n' +
      webSS_().getUrl() + '#gid=' + sh.getSheetId());
    if (doneKey) cache.put(doneKey, '1', 21600);
    return { duplicate: false, changed: lines.length, notified };
  });
  const view = campView_(brand);
  view.saved = result.duplicate ? 0 : result.changed;
  view.duplicate = !!result.duplicate;
  view.notified = !!result.notified;
  return view;
}

/* ---------- เปลี่ยนราคาใน Product Database ---------- */
function campDbRows_(skus) {
  const db = webSS_().getSheetByName(BST.DB), heads = webHeads_(db), C = bstCols_(heads), want = {}, out = [];
  skus.forEach(s => { want[s] = 1; });
  const n = db.getLastRow() - 1;
  if (n > 0) db.getRange(2, 1, n, heads.length).getValues().forEach((r, i) => {
    const s = String(r[C.sku] || '').trim().toUpperCase();
    if (want[s]) out.push({ row: i + 2, sku: s, price: bstNum_(r[C.price]), orig: C.orig >= 0 ? bstNum_(r[C.orig]) : 0 });
  });
  return { db, C, rows: out };
}
function campApply_(sh, e) {
  const { db, C, rows } = campDbRows_(e.skus);
  if (!rows.length || C.price < 0) { campSet_(sh, e.row, { 'Result': 'ผิดพลาด: ไม่พบ SKU ใน Product Database' }); return false; }
  const before = rows[0].price;
  if (!(e.price < before)) { campSet_(sh, e.row, { 'Result': 'ผิดพลาด: ราคาแคมเปญ ' + e.price + ' ไม่ต่ำกว่าราคาตอนนี้ ' + before + ' (ยังไม่เปลี่ยนราคา)' }); return false; }
  rows.forEach(x => {
    db.getRange(x.row, C.price + 1).setValue(e.price);
    if (C.pct >= 0 && x.orig) db.getRange(x.row, C.pct + 1).setValue(1 - e.price / x.orig);
  });
  campSet_(sh, e.row, { 'Applied': 'Applied', 'Price Before': before,
    'Result': 'ขึ้นราคาแคมเปญแล้ว ' + Utilities.formatDate(new Date(), CAMP.TZ, 'd MMM HH:mm') + ' (' + rows.length + ' SKU)' });
  return true;
}
function campRestore_(sh, e) {
  const { db, C, rows } = campDbRows_(e.skus), skipped = [];
  if (C.price < 0 || !(e.before > 0)) { campSet_(sh, e.row, { 'Result': 'ผิดพลาด: ไม่มีราคาเดิม (Price Before) เช็กราคาเองนะคะ' }); return false; }
  rows.forEach(x => {
    if (x.price !== e.price) { skipped.push(x.sku); return; }   // มีคนแก้ราคาไปแล้ว → ไม่ทับ
    db.getRange(x.row, C.price + 1).setValue(e.before);
    if (C.pct >= 0 && x.orig) db.getRange(x.row, C.pct + 1).setValue(1 - e.before / x.orig);
  });
  campSet_(sh, e.row, { 'Applied': 'Restored',
    'Result': 'คืนราคาเดิม ' + e.before + ' แล้ว ' + Utilities.formatDate(new Date(), CAMP.TZ, 'd MMM HH:mm') +
      (skipped.length ? ' · ไม่ได้เปลี่ยน ' + skipped.join(', ') + ' (ราคาไม่ใช่ราคาแคมเปญแล้ว เช็กเอง)' : '') });
  return true;
}

/* ---------- ทุกชั่วโมง: ขึ้นราคา / คืนราคา ---------- */
function campTick() {
  webWithLock_(() => {
    const now = campNow_(), by = {}; campList_().forEach(c => { by[c.id] = c; });
    const sh = campEntrySheet_();
    let n = 0;
    campEntries_().forEach(e => {
      const c = by[e.camp], live = c && campPhase_(c, now) === 'live';
      if (live && e.status === 'Approved' && e.applied !== 'Applied') { if (campApply_(sh, e)) n++; }
      else if (e.applied === 'Applied' && (!live || e.status !== 'Approved')) { if (campRestore_(sh, e)) n++; }
    });
    if (n) { SpreadsheetApp.flush(); console.log('campTick: เปลี่ยนราคา ' + n + ' รายการ'); }
  });
}

/* ---------- ทีมเลือก Status ในแท็บ Campaign Entries ---------- */
// เรียกจาก bstOnEdit (Web_BrandStock.gs) เมื่อแก้แท็บ Campaign Entries
function campOnEdit_(e) {
  const r0 = e.range.getRow(), c0 = e.range.getColumn(), c1 = c0 + e.range.getNumColumns() - 1, col = CE['Status'] + 1;
  if (r0 < 2 || col < c0 || col > c1) return;
  for (let r = r0; r < r0 + e.range.getNumRows(); r++) campDecide_(r);
}
function campDecide_(row) {
  webWithLock_(() => {
    const e = campEntries_().filter(x => x.row === row)[0];
    if (!e || (e.status !== 'Approved' && e.status !== 'Rejected') || e.notified === e.status) return;
    const sh = campEntrySheet_(), c = campList_().filter(x => x.id === e.camp)[0], now = campNow_();
    const dmy = ms => { const x = new Date(ms + 7 * 3600e3); return x.getUTCDate() + ' ' + ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][x.getUTCMonth()]; };
    let msg;
    if (e.status === 'Approved') {
      let when = c ? 'ราคาแคมเปญขึ้นเว็บ ' + dmy(c.start) + ' และกลับเป็นราคาเดิมหลัง ' + dmy(c.end) : '';
      if (c && campPhase_(c, now) === 'live' && e.applied !== 'Applied') {
        const fresh = campEntries_().filter(x => x.row === row)[0];
        when = campApply_(sh, fresh) ? 'ราคาแคมเปญขึ้นเว็บภายใน 10 นาที' : 'ทีม Mera กำลังเช็กราคา จะแจ้งอีกครั้งค่ะ';
      }
      msg = '✅ มีร่าอนุมัติสินค้าเข้าแคมเปญแล้ว\n' + (c ? c.name + '\n' : '') + '\n• ' + e.product + ' ราคาแคมเปญ ' + e.price + ' บาท' +
        (e.note ? '\n\nจากทีม Mera: ' + e.note : '') + (when ? '\n\n' + when : '');
    } else {
      if (e.applied === 'Applied') campRestore_(sh, e);
      msg = '❌ สินค้ายังไม่ผ่านเข้าแคมเปญ\n' + (c ? c.name + '\n' : '') + '\n• ' + e.product + ' ราคาที่ส่ง ' + e.price + ' บาท\nเหตุผล: ' + (e.note || '-') +
        '\n\nแก้ราคาแล้วส่งใหม่ได้ในหน้า Mera Seller › แคมเปญ ค่ะ';
    }
    const sent = bstNotifyText_(bstBrandGroup_(e.brand), msg);
    campSet_(sh, row, { 'Decided At': new Date(), 'Notified Status': sent ? e.status : '' });
    if (!sent) campSet_(sh, row, { 'Result': (String(sh.getRange(row, CE['Result'] + 1).getValue() || '') + ' · แจ้งกลุ่มแบรนด์ไม่สำเร็จ').replace(/^ · /, '') });
  });
}

/* ---------- ใช้จากไฟล์อื่น ---------- */
// สินค้านี้อยู่ในแคมเปญที่ยังไม่จบ (รอตรวจ / อนุมัติแล้ว) → ห้ามแก้ราคา (เรียกจาก bstEdit_)
function campLocked_(brand, product) {
  const now = campNow_(), by = {}; campList_().forEach(c => { by[c.id] = c; });
  return campEntries_().some(e => bstNorm_(e.brand) === bstNorm_(brand) && bstNorm_(e.product) === bstNorm_(product) &&
    (e.applied === 'Applied' || ((e.status === 'Pending' || e.status === 'Approved') && by[e.camp] && now <= by[e.camp].end)));
}
// SKU ที่ขายราคาแคมเปญอยู่ตอนนี้ (สำหรับกันคูปอง: ใส่ในโค้ดคูปองของ Web_Order.gs / Web_Cart.gs)
//   if (campHasCampaignSku_(skus)) throw webErr_('COUPON_CAMPAIGN', 'สินค้าราคาแคมเปญใช้คูปองร่วมไม่ได้ค่ะ');
function campHasCampaignSku_(skus) {
  const live = {}; campEntries_().forEach(e => { if (e.applied === 'Applied') e.skus.forEach(s => { live[s] = 1; }); });
  return (skus || []).some(s => live[String(s || '').trim().toUpperCase()]);
}

/* ---------- ติดตั้ง (Run ครั้งเดียว) ---------- */
function campSetup() {
  const sh = campSheet_(CAMP.LIST, CAMP.LIST_HEADS);
  if (sh.getLastRow() < 2) sh.appendRow(['CP-001', 'ช้อปได้ไม่ต้องรองาน Sale', 'Open', '2026-11-27', '2026-12-05', '2026-12-15', '2026-12-04', '2026-12-15',
    15, 5, 5, 4, 'เลือกรุ่นที่อยากโปรโมต แล้วตั้งราคาบนมีร่าให้ต่ำกว่าราคาออนไลน์ของแบรนด์ในช่วงเดียวกัน ลูกค้าที่เพิ่งช้อปออฟไลน์จะได้กลับมาดูสินค้าเพิ่มที่มีร่า',
    'Fixed Discount % = ส่วนลดมีร่า (ว่าง = แบรนด์ตั้งราคาเองอย่างเดียว) · Free Until = ลงทะเบียนภายในวันนี้ไม่หักค่าบริการ']);
  campEntrySheet_();
  const ss = webSS_(), trig = ScriptApp.getProjectTriggers();
  if (!trig.some(t => t.getHandlerFunction() === 'campTick')) ScriptApp.newTrigger('campTick').timeBased().everyHours(1).create();
  if (!trig.some(t => t.getHandlerFunction() === 'bstOnEdit')) ScriptApp.newTrigger('bstOnEdit').forSpreadsheet(ss).onEdit().create();
  console.log('พร้อมแล้ว: แท็บ ' + CAMP.LIST + ' + ' + CAMP.ENTRIES + ' · campTick ทุกชั่วโมง · ตัวจับการเลือก Status (bstOnEdit)');
}
// ดูว่าแต่ละแบรนด์เห็นแคมเปญอะไร (ไม่แก้อะไร)
function campTestView() {
  const bm = webSS_().getSheetByName('Brand Master'), heads = webHeads_(bm), c = heads.indexOf('Brand Name');
  bm.getRange(2, 1, bm.getLastRow() - 1, heads.length).getValues().forEach(r => {
    const name = String(r[c] || '').trim(); if (!name) return;
    const v = campView_(name);
    console.log(name + ': ' + v.campaigns.map(x => x.id + ' ' + x.phase + ' ส่งแล้ว ' + Object.keys(x.entries).length + ' · ขาย ' + x.sales.pcs + ' ชิ้น').join(' | ') + ' · สินค้า ' + v.products.length);
  });
}
