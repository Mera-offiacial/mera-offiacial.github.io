/**
 * Mera Traffic — บันทึกที่มาของคนเข้าเว็บ meraofficial.co ลง KPI Tracker (21 พ.ย. 2026)
 * ---------------------------------------------------------------------------
 * โปรเจกต์ Apps Script แยกใหม่ (ไม่ใช่ "Inventory + GB") · ไม่แตะ doPost / webhook LINE เดิม
 * หน้าเว็บ (assets/track.*.js) ส่ง { action: 'traffic', events: [...], idToken? } มาที่ /exec ของโปรเจกต์นี้
 *
 * เขียน 2 แท็บใน KPI Tracker (หัวตารางแถว 4 เหมือนแท็บอื่น):
 *   Traffic           แถวละ 1 เหตุการณ์: visit / view / login / order
 *   Traffic Visitors  แถวละ 1 เครื่อง (Visitor ID): ที่มาครั้งแรก/ล่าสุด, จำนวนครั้ง, LINE ID, Member ID
 * แท็บ Traffic Summary เป็นสูตรล้วน (ไม่ต้องรันอะไร)
 *
 * ติดตั้ง:
 *   1. script.google.com → New project → ตั้งชื่อ "Mera Traffic" → วางไฟล์นี้แทนโค้ดเดิม → Save
 *   2. เลือกฟังก์ชัน trafficSetup → Run → อนุญาตสิทธิ์ (สร้าง/ตรวจหัวตารางให้)
 *   3. Deploy → New deployment → ⚙ Web app · Execute as: Me · Who has access: Anyone → Deploy
 *   4. ก๊อปลิงก์ Web app (…/exec) ส่งให้ทีมเว็บใส่ใน index.html (window.MERA_TRACK.api)
 *   แก้โค้ดทีหลัง: Deploy → Manage deployments → ✏️ → Version: New version (ลิงก์เดิม) — ห้าม New deployment
 *
 * ทดสอบ: Run trafficTest → ดูแถว [test] ในแท็บ Traffic แล้วลบทิ้งได้
 */

var TR = {
  KPI_ID: '1GtC2svH0nGe8c3pn6Hijg3kdpBqCToSH6pbzB0BXeQM',   // Mera Group Buy KPI Tracker
  LINE_CHANNEL_ID: '2011928469',                            // LINE Login channel ของเว็บ (ตรวจ idToken)
  TAB: 'Traffic',
  VTAB: 'Traffic Visitors',
  MEMBERS: 'Members',
  HEADER_ROW: 4,
  MAX_EVENTS: 20,
  EVENTS: ['visit', 'view', 'login', 'order'],
};

var TR_COLS = ['Time', 'Event', 'Source', 'Medium', 'Campaign', 'Content', 'This Visit Via', 'First Source', 'First Campaign',
  'Visitor ID', 'Session ID', 'LINE User ID', 'Member ID', 'Product / Deal', 'Brand', 'Order ID', 'Order Total (฿)', 'Items',
  'Coupon / Code', 'Page', 'Landing Query', 'Referrer', 'Device', 'Language'];
var TV_COLS = ['Visitor ID', 'First Seen', 'First Source', 'First Campaign', 'Last Seen', 'Last Source', 'Last Campaign',
  'Visits', 'Views', 'Orders', 'Sales (฿)', 'LINE User ID', 'Member ID', 'Logged In At'];

/* ============================== Web app ============================== */
function doGet() {
  return ContentService.createTextOutput('Mera Traffic OK');
}

function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action !== 'traffic') throw new Error('BAD_ACTION');
    out = trafficHandle_(body);
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================== หลัก ============================== */
function trafficHandle_(body) {
  var raw = Array.isArray(body.events) ? body.events.slice(0, TR.MAX_EVENTS) : [];
  var evs = raw.map(trClean_).filter(function (x) { return x; });
  if (!evs.length) return { ok: true, saved: 0 };

  // LINE ID: ตรวจ idToken กับ LINE (มีเฉพาะคนที่ล็อกอิน) · ไม่ผ่าน = บันทึกแบบไม่มี LINE ID
  var lineId = body.idToken ? trVerify_(String(body.idToken)) : '';

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.openById(TR.KPI_ID);
    var sh = trSheet_(ss, TR.TAB, TR_COLS), vs = trSheet_(ss, TR.VTAB, TV_COLS);
    var members = trMembers_(ss);

    // ออเดอร์ซ้ำ (กดรีเฟรช / ส่งซ้ำ) ไม่นับ
    var seen = trRecentOrders_(sh);
    evs = evs.filter(function (x) {
      if (x.e !== 'order') return true;
      if (!x.order || seen[x.order]) return false;
      seen[x.order] = 1; return true;
    });
    if (!evs.length) return { ok: true, saved: 0 };

    var rows = evs.map(function (x) {
      var mid = lineId ? (members[lineId] || '') : '';
      return [new Date(x.t), x.e, x.src, x.med, x.cmp, x.cnt, x.e === 'visit' ? x.via : '', x.fsrc, x.fcmp,
        x.vid, x.sid, lineId, mid, x.product || x.deal || '', x.brand, x.order, x.e === 'order' ? x.total : '', x.items,
        x.code || x.coupon || '', x.page, x.land, x.ref, x.dev, x.lang];
    });
    var at = trLastRow_(sh) + 1; trRoom_(sh, at + rows.length);
    sh.getRange(at, 1, rows.length, TR_COLS.length).setValues(rows);

    var linked = trUpsertVisitors_(vs, evs, lineId, members);
    if (linked.length) trBackfill_(sh, linked, lineId, members[lineId] || '');
    return { ok: true, saved: rows.length };
  } finally {
    lock.releaseLock();
  }
}

/** ตรวจ/ตัดข้อมูลจากหน้าเว็บ · ไม่ผ่าน = null */
function trClean_(x) {
  if (!x || typeof x !== 'object') return null;
  var e = String(x.e || '');
  if (TR.EVENTS.indexOf(e) < 0) return null;
  var vid = String(x.vid || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(vid)) return null;
  var t = Number(x.t), now = Date.now();
  if (!t || Math.abs(now - t) > 2 * 864e5) t = now;    // นาฬิกาเครื่องเพี้ยน → ใช้เวลาหลังบ้าน
  var s = function (v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/^[=+\-@]/, "'$&").trim().slice(0, n || 80); };
  var low = function (v, n) { return s(v, n).toLowerCase(); };
  var order = s(x.order, 20).toUpperCase();
  if (e === 'order' && !/^[A-Z]{2,4}-\d{1,8}$/.test(order)) return null;
  return {
    e: e, t: t, vid: vid, sid: s(x.sid, 16),
    src: low(x.src, 60) || 'direct', med: low(x.med, 40), cmp: low(x.cmp, 80), cnt: s(x.cnt, 80), via: low(x.via, 60),
    fsrc: low(x.fsrc, 60), fcmp: low(x.fcmp, 80), fat: Number(x.fat) || 0,
    product: s(x.product, 120), brand: s(x.brand, 60), deal: s(x.deal, 40),
    order: order, total: Math.max(0, Math.min(Number(x.total) || 0, 1e6)), items: s(x.items, 400), coupon: s(x.coupon, 40), code: s(x.code, 40).toUpperCase(),
    page: s(x.page, 80), land: s(x.land, 300), ref: low(x.ref, 80), dev: s(x.dev, 40), lang: s(x.lang, 10),
  };
}

/** idToken → LINE User ID (cache 10 นาที) · ใช้ไม่ได้ = '' */
function trVerify_(tok) {
  if (tok.length < 20 || tok.length > 4000) return '';
  var key = 'tv_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, tok)).slice(0, 40);
  var cache = CacheService.getScriptCache(), hit = cache.get(key);
  if (hit !== null) return hit;
  var sub = '';
  try {
    var r = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'post', payload: { id_token: tok, client_id: TR.LINE_CHANNEL_ID }, muteHttpExceptions: true,
    });
    if (r.getResponseCode() === 200) sub = String(JSON.parse(r.getContentText()).sub || '');
  } catch (err) { console.warn('verify', err); return ''; }
  cache.put(key, sub, 600);
  return sub;
}

/** LINE User ID → Customer ID จากแท็บ Members (cache 5 นาที) */
function trMembers_(ss, fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) { var c = cache.get('tr_members'); if (c) return JSON.parse(c); }
  var sh = ss.getSheetByName(TR.MEMBERS), map = {};
  if (sh && sh.getLastRow() > TR.HEADER_ROW) {
    var head = sh.getRange(TR.HEADER_ROW, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var ci = head.indexOf('Customer ID'), li = head.indexOf('LINE User ID');
    if (ci >= 0 && li >= 0) {
      var w = Math.max(ci, li) + 1;
      sh.getRange(TR.HEADER_ROW + 1, 1, sh.getLastRow() - TR.HEADER_ROW, w).getValues().forEach(function (r) {
        if (r[li] && r[ci]) map[String(r[li]).trim()] = String(r[ci]).trim();
      });
    }
  }
  try { cache.put('tr_members', JSON.stringify(map), 300); } catch (err) {}
  return map;
}

/** อัปเดตแท็บ Traffic Visitors · คืนรายการ Visitor ID ที่เพิ่งผูก LINE ID (ต้องเติมย้อนหลังในแท็บ Traffic) */
function trUpsertVisitors_(vs, evs, lineId, members) {
  var n = Math.max(0, trLastRow_(vs) - TR.HEADER_ROW);
  var data = n ? vs.getRange(TR.HEADER_ROW + 1, 1, n, TV_COLS.length).getValues() : [];
  var idx = {}; data.forEach(function (r, i) { if (r[0]) idx[r[0]] = i; });
  var touched = {}, added = [], linked = [];
  evs.forEach(function (x) {
    var i = idx[x.vid], r;
    if (i === undefined) {
      var fat = x.fat ? new Date(x.fat) : new Date(x.t);
      r = [x.vid, fat, x.fsrc || x.src, x.fcmp || x.cmp, new Date(x.t), x.src, x.cmp, 0, 0, 0, 0, '', '', ''];
      i = data.length; data.push(r); idx[x.vid] = i; added.push(i);
    }
    r = data[i];
    if (new Date(x.t) > new Date(r[4])) { r[4] = new Date(x.t); r[5] = x.src; r[6] = x.cmp; }
    if (x.e === 'visit') r[7] = Number(r[7] || 0) + 1;
    if (x.e === 'view') r[8] = Number(r[8] || 0) + 1;
    if (x.e === 'order') { r[9] = Number(r[9] || 0) + 1; r[10] = Number(r[10] || 0) + x.total; }
    if (lineId && r[11] !== lineId) { r[11] = lineId; r[13] = new Date(x.t); linked.push(x.vid); }
    if (lineId && !r[12] && members[lineId]) r[12] = members[lineId];
    touched[i] = 1;
  });
  // เขียนเฉพาะแถวที่เปลี่ยน (แถวใหม่ต่อท้าย)
  trRoom_(vs, TR.HEADER_ROW + data.length);
  Object.keys(touched).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) {
    vs.getRange(TR.HEADER_ROW + 1 + i, 1, 1, TV_COLS.length).setValues([data[i]]);
  });
  return linked.filter(function (v, k, a) { return a.indexOf(v) === k; });
}

/** เครื่องที่เพิ่งล็อกอิน: เติม LINE User ID / Member ID ให้แถวเก่าในแท็บ Traffic ของเครื่องนั้น */
function trBackfill_(sh, vids, lineId, memberId) {
  var n = trLastRow_(sh) - TR.HEADER_ROW; if (n <= 0) return;
  var range = sh.getRange(TR.HEADER_ROW + 1, 10, n, 4);   // J: Visitor ID, K: Session, L: LINE User ID, M: Member ID
  var v = range.getValues(), changed = false, want = {};
  vids.forEach(function (x) { want[x] = 1; });
  v.forEach(function (r) {
    if (want[r[0]] && !r[2]) { r[2] = lineId; if (!r[3]) r[3] = memberId; changed = true; }
  });
  if (changed) sh.getRange(TR.HEADER_ROW + 1, 12, n, 2).setValues(v.map(function (r) { return [r[2], r[3]]; }));
}

/** เลขออเดอร์ที่บันทึกแล้ว (ดู 1000 แถวล่าสุด) */
function trRecentOrders_(sh) {
  var last = trLastRow_(sh), from = Math.max(TR.HEADER_ROW + 1, last - 999), seen = {};
  if (last < from) return seen;
  sh.getRange(from, 16, last - from + 1, 1).getValues().forEach(function (r) { if (r[0]) seen[String(r[0])] = 1; });
  return seen;
}

/** แท็บมีแถวไม่พอ → เพิ่มทีละ 1000 */
function trRoom_(sh, needRow) {
  var max = sh.getMaxRows();
  if (needRow > max) sh.insertRowsAfter(max, needRow - max + 1000);
}

/** แถวสุดท้ายที่มีข้อมูลจริง (ดูคอลัมน์ A) */
function trLastRow_(sh) {
  var last = sh.getLastRow(); if (last <= TR.HEADER_ROW) return TR.HEADER_ROW;
  var a = sh.getRange(TR.HEADER_ROW + 1, 1, last - TR.HEADER_ROW, 1).getValues();
  for (var i = a.length - 1; i >= 0; i--) if (a[i][0] !== '' && a[i][0] !== null) return TR.HEADER_ROW + 1 + i;
  return TR.HEADER_ROW;
}

/** หาแท็บ · ไม่มีก็สร้างพร้อมหัวตาราง · หัวตารางต้องตรงกับที่โค้ดเขียน */
function trSheet_(ss, name, cols) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(2, 1).setValue(name === TR.TAB ? 'Mera Website Traffic' : 'Mera Website Visitors');
    sh.getRange(3, 1).setValue('Script "Mera Traffic" เขียนให้เอง — ห้ามแก้หรือสลับคอลัมน์');
  }
  var head = sh.getRange(TR.HEADER_ROW, 1, 1, cols.length).getValues()[0];
  if (head.join('|') !== cols.join('|')) {
    if (head.join('') === '') sh.getRange(TR.HEADER_ROW, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    else throw new Error('หัวตารางแท็บ ' + name + ' ไม่ตรง (ห้ามสลับคอลัมน์)');
  }
  return sh;
}

/* ============================== ใช้เอง ============================== */
/** Run ครั้งแรก: ตรวจ/สร้างแท็บ Traffic และ Traffic Visitors */
function trafficSetup() {
  var ss = SpreadsheetApp.openById(TR.KPI_ID);
  trSheet_(ss, TR.TAB, TR_COLS); trSheet_(ss, TR.VTAB, TV_COLS);
  UrlFetchApp.fetch('https://api.line.me/', { muteHttpExceptions: true });   // ขอสิทธิ์เรียกเว็บภายนอกไว้ก่อน
  console.log('พร้อมใช้ · Deploy เป็น Web app (Anyone) แล้วส่งลิงก์ /exec ให้ทีมเว็บ');
}

/** ทดสอบ: เขียนแถว [test] 1 แถว (ลบทิ้งได้) */
function trafficTest() {
  var r = trafficHandle_({ events: [{ e: 'visit', t: Date.now(), vid: 'test-' + Utilities.getUuid().slice(0, 8), sid: 'test',
    src: 'instagram', med: 'social', cmp: 'zensation', via: 'instagram', fsrc: 'instagram', fcmp: 'zensation', page: '/', land: '[test]', dev: 'test' }] });
  console.log(JSON.stringify(r));
}

/** เติม Member ID ที่ยังว่าง (คนที่สมัครสมาชิกทีหลังล็อกอิน) · ตั้ง trigger รายวันได้ */
function trafficRelinkMembers() {
  var ss = SpreadsheetApp.openById(TR.KPI_ID), members = trMembers_(ss, true);
  [[TR.VTAB, 12, 13], [TR.TAB, 12, 13]].forEach(function (t) {
    var sh = ss.getSheetByName(t[0]); if (!sh) return;
    var n = trLastRow_(sh) - TR.HEADER_ROW; if (n <= 0) return;
    var rg = sh.getRange(TR.HEADER_ROW + 1, t[1], n, 2), v = rg.getValues(), ch = false;
    v.forEach(function (r) { if (r[0] && !r[1] && members[r[0]]) { r[1] = members[r[0]]; ch = true; } });
    if (ch) rg.setValues(v);
  });
}
