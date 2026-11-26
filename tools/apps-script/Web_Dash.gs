/**
 * Mera Dashboard — ตัวเลขสำหรับหน้า dash.html (26 พ.ย. 2026)
 * ---------------------------------------------------------------------------
 * วางเป็นไฟล์ใหม่ในโปรเจกต์ Apps Script "Inventory + GB" (โปรเจกต์เดียวกับ Web_Order.gs / Web_Admin.gs)
 * แก้ไฟล์เดิมแค่ 1 บรรทัด: ในฟังก์ชัน webRoute_(b) ของ Web_Order.gs ใส่บรรทัดนี้ต่อจากบรรทัด webAdminRoute_
 *
 *     const dash = webDashRoute_(b); if (dash) return dash;
 *
 * เข้าได้เฉพาะทีมมีร่า: ใช้ token เดียวกับหน้าแอดมิน (adminAuth ด้วย ADMIN_PASSWORD หรือ LINE ที่อยู่ใน ADMIN_LINE_IDS)
 *
 * อ่านอย่างเดียว ไม่แก้แท็บเดิม:
 *   KPI Tracker  · Traffic           คนเข้าเว็บ (visit), กดแอด OA (view ที่ Product / Deal = "Add LINE OA"), ที่มา/แคมเปญ
 *                · Activity_Log      แอด OA (Member Signup · welcome), ตอบ waiting list (Member Signup · profile_complete / Waitlist Joined),
 *                                    สมัคร Mera Member (Member Profile Complete), มัดจำ Group Buy (Deposit Paid)
 *   Mera Inventory · Web Orders     ออเดอร์เว็บ (ไม่นับ Cancelled / Slip Rejected)
 * เขียนแท็บใหม่ 1 แท็บ:
 *   KPI Tracker  · OA Daily          สถิติเพื่อน LINE OA รายวันจาก LINE (เพื่อนทั้งหมด / บล็อก) · dashOaSync เติมให้ทุกเช้า
 *
 * ติดตั้ง: วางไฟล์ → Save → เลือกฟังก์ชัน dashSetup → Run (สร้างแท็บ OA Daily, ดึงสถิติย้อนหลัง, ตั้ง trigger 9 โมงทุกวัน)
 *          → Deploy → Manage deployments → ✏️ → Version: New version → Deploy (ห้าม New deployment)
 */
var DASH = {
  KPI_ID: '1GtC2svH0nGe8c3pn6Hijg3kdpBqCToSH6pbzB0BXeQM',
  HEADER_ROW: 4,
  TZ: 'Asia/Bangkok',
  OA_TAB: 'OA Daily',
  OA_COLS: ['Date', 'Followers (รวมที่เคยแอด)', 'Blocks (รวม)', 'Friends (เพื่อนตอนนี้)', 'New Adds', 'New Blocks', 'Targeted Reaches', 'Fetched At'],
  OA_FROM: '2026-09-01',          // วันแรกที่ดึงสถิติย้อนหลัง
  MIN_DATE: '2026-09-01',         // เลือกวันที่ในหน้าแดชบอร์ดได้ตั้งแต่วันนี้
  MAX_DAYS: 180,
  CACHE_SEC: 300,
  OA_CLICK: 'Add LINE OA',
};

function webDashRoute_(b) {
  if (!b || b.action !== 'adminDash') return null;
  admRequire_(b);                                     // ไม่มี token / หมดอายุ → ADMIN_AUTH
  return dashGet_(String(b.from || ''), String(b.to || ''), b.fresh === true);
}

/* ============================== คำนวณ ============================== */
function dashGet_(from, to, fresh) {
  var today = dashDay_(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || to > today) to = today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) from = dashAdd_(to, -6);
  if (from > to) { var t = from; from = to; to = t; }
  if (from < DASH.MIN_DATE) from = DASH.MIN_DATE;
  var n = dashDiff_(from, to) + 1;
  if (n > DASH.MAX_DAYS) throw webErr_('BAD_RANGE', 'เลือกได้สูงสุด ' + DASH.MAX_DAYS + ' วัน');

  var key = 'dash_' + from + '_' + to, cache = CacheService.getScriptCache();
  if (!fresh) { var hit = cache.get(key); if (hit) return JSON.parse(hit); }

  var prevTo = dashAdd_(from, -1), prevFrom = dashAdd_(from, -n);
  var chartFrom = n < 7 ? dashAdd_(to, -6) : from;   // เลือกช่วงสั้น กราฟยังโชว์ 7 วัน
  var lo = prevFrom < chartFrom ? prevFrom : chartFrom;

  var kpi = SpreadsheetApp.openById(DASH.KPI_ID);
  var tr = dashTraffic_(kpi, lo, to);
  var act = dashActivity_(kpi, lo, to);
  var ord = dashOrders_(lo, to);
  var oa = dashOaRead_(kpi);

  // รายวันสำหรับกราฟ
  var days = [];
  for (var d = chartFrom; d <= to; d = dashAdd_(d, 1)) {
    var tv = tr.byDay[d] || {}, av = act.byDay[d] || {}, ov = ord.byDay[d] || {}, od = oa.byDay[d];
    days.push({
      d: d,
      visitors: tv.v ? Object.keys(tv.v).length : 0,
      oaClicks: tv.c || 0,
      oaAdds: av.add || 0,
      waitlist: av.wl ? Object.keys(av.wl).length : 0,
      members: av.mem ? Object.keys(av.mem).length : 0,
      orders: ov.n || 0,
      sales: ov.s || 0,
      deposits: av.dep || 0,
      blocks: od ? od.newBlocks : null,
    });
  }

  var out = {
    ok: true,
    from: from, to: to, prevFrom: prevFrom, prevTo: prevTo, days: days, today: today, minDate: DASH.MIN_DATE,
    totals: dashTotals_(tr, act, ord, from, to),
    prev: prevFrom >= DASH.MIN_DATE ? dashTotals_(tr, act, ord, prevFrom, prevTo) : null,
    oa: dashOaSummary_(oa, from, to),
    sources: dashSources_(tr, from, to),
    campaigns: tr.campStart,
    updatedAt: new Date().getTime(),
  };
  try { cache.put(key, JSON.stringify(out), DASH.CACHE_SEC); } catch (e) {}
  return out;
}

function dashTotals_(tr, act, ord, a, b) {
  var vis = {}, clicks = 0, adds = 0, wl = {}, mem = {}, orders = 0, sales = 0, dep = 0;
  for (var d = a; d <= b; d = dashAdd_(d, 1)) {
    var tv = tr.byDay[d], av = act.byDay[d], ov = ord.byDay[d];
    if (tv) { Object.keys(tv.v || {}).forEach(function (k) { vis[k] = 1; }); clicks += tv.c || 0; }
    if (av) {
      adds += av.add || 0; dep += av.dep || 0;
      Object.keys(av.wl || {}).forEach(function (k) { wl[k] = 1; });
      Object.keys(av.mem || {}).forEach(function (k) { mem[k] = 1; });
    }
    if (ov) { orders += ov.n || 0; sales += ov.s || 0; }
  }
  return { visitors: Object.keys(vis).length, oaClicks: clicks, oaAdds: adds, waitlist: Object.keys(wl).length,
    members: Object.keys(mem).length, orders: orders, sales: sales, deposits: dep };
}

/** Traffic: คนเข้าเว็บรายวัน (Visitor ID ไม่ซ้ำ), กดแอด OA, ที่มา × แคมเปญ */
function dashTraffic_(ss, lo, hi) {
  var out = { byDay: {}, rows: [], campStart: [] };
  var sh = ss.getSheetByName('Traffic'); if (!sh) return out;
  var v = dashRows_(sh, DASH.HEADER_ROW); if (!v) return out;
  var h = v.head, I = { t: h.indexOf('Time'), e: h.indexOf('Event'), s: h.indexOf('Source'), c: h.indexOf('Campaign'),
    vid: h.indexOf('Visitor ID'), p: h.indexOf('Product / Deal'), o: h.indexOf('Order ID'), tot: h.indexOf('Order Total (฿)') };
  var first = {};
  v.rows.forEach(function (r) {
    var day = dashDay_(r[I.t]); if (!day) return;
    var ev = String(r[I.e] || ''), camp = String(r[I.c] || '').trim();
    if (camp && (!first[camp] || day < first[camp])) first[camp] = day;
    if (day < lo || day > hi) return;
    var vid = String(r[I.vid] || ''); if (/^test-/.test(vid)) return;
    var src = String(r[I.s] || 'direct').trim() || 'direct';
    var b = out.byDay[day] || (out.byDay[day] = { v: {}, c: 0 });
    var row = { d: day, src: src, camp: camp, vid: vid, visit: 0, click: 0, order: 0, total: 0 };
    if (ev === 'visit') { b.v[vid] = 1; row.visit = 1; }
    else if (ev === 'view' && String(r[I.p] || '') === DASH.OA_CLICK) { b.c++; row.click = 1; }
    else if (ev === 'order') { row.order = 1; row.total = Number(r[I.tot]) || 0; }
    else return;
    out.rows.push(row);
  });
  out.campStart = Object.keys(first).map(function (k) { return { name: k, start: first[k] }; })
    .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  return out;
}

function dashSources_(tr, a, b) {
  var g = {};
  tr.rows.forEach(function (r) {
    if (r.d < a || r.d > b) return;
    var k = r.src + '|' + r.camp, x = g[k] || (g[k] = { src: r.src, camp: r.camp, v: {}, clicks: 0, orders: 0, sales: 0 });
    if (r.visit) x.v[r.vid] = 1;
    x.clicks += r.click; x.orders += r.order; x.sales += r.total;
  });
  return Object.keys(g).map(function (k) {
    var x = g[k];
    return { src: x.src, camp: x.camp, visitors: Object.keys(x.v).length, oaClicks: x.clicks, orders: x.orders, sales: x.sales };
  }).sort(function (x, y) { return y.visitors - x.visitors || y.orders - x.orders; }).slice(0, 30);
}

/** Activity_Log: แอด OA, waiting list, สมาชิก, มัดจำ Group Buy */
function dashActivity_(ss, lo, hi) {
  var out = { byDay: {} };
  var sh = ss.getSheetByName('Activity_Log'); if (!sh) return out;
  var v = dashRows_(sh, DASH.HEADER_ROW); if (!v) return out;
  var h = v.head, I = { t: h.indexOf('Timestamp'), id: h.indexOf('Customer ID'), ev: h.indexOf('Event Type'), mt: h.indexOf('Message Type'), c: h.indexOf('Campaign ID') };
  v.rows.forEach(function (r) {
    var day = dashDay_(r[I.t]); if (!day || day < lo || day > hi) return;
    if (/^TEST/i.test(String(r[I.c] || ''))) return;
    var ev = String(r[I.ev] || ''), mt = String(r[I.mt] || ''), who = String(r[I.id] || '') || ('row' + Math.random());
    var b = out.byDay[day] || (out.byDay[day] = { add: 0, wl: {}, mem: {}, dep: 0 });
    if (ev === 'Member Signup' && mt === 'welcome') b.add++;
    else if ((ev === 'Member Signup' && mt === 'profile_complete') || ev === 'Waitlist Joined') b.wl[who] = 1;
    else if (ev === 'Member Profile Complete') b.mem[who] = 1;
    else if (ev === 'Deposit Paid') b.dep++;
  });
  return out;
}

/** Web Orders (Mera Inventory): ออเดอร์และยอดขายตามวันที่สร้าง */
function dashOrders_(lo, hi) {
  var out = { byDay: {} };
  var sh = webSS_().getSheetByName('Web Orders'); if (!sh) return out;
  var v = dashRows_(sh, 1); if (!v) return out;
  var h = v.head, I = { t: h.indexOf('Created At'), s: h.indexOf('Status'), tot: h.indexOf('Total'), id: h.indexOf('Order ID') };
  v.rows.forEach(function (r) {
    if (!String(r[I.id] || '')) return;
    var st = String(r[I.s] || '');
    if (/cancel|reject|error/i.test(st)) return;
    var day = dashDay_(r[I.t]); if (!day || day < lo || day > hi) return;
    var b = out.byDay[day] || (out.byDay[day] = { n: 0, s: 0 });
    b.n++; b.s += Number(r[I.tot]) || 0;
  });
  return out;
}

/* ============================== เพื่อน LINE OA (สถิติจาก LINE) ============================== */
function dashOaRead_(ss) {
  var out = { byDay: {}, list: [] };
  var sh = ss.getSheetByName(DASH.OA_TAB); if (!sh) return out;
  var v = dashRows_(sh, DASH.HEADER_ROW); if (!v) return out;
  v.rows.forEach(function (r) {
    var d = dashDay_(r[0]); if (!d || r[1] === '' || r[1] === null) return;
    var x = { d: d, followers: Number(r[1]) || 0, blocks: Number(r[2]) || 0, friends: Number(r[3]) || 0,
      newAdds: r[4] === '' ? null : Number(r[4]), newBlocks: r[5] === '' ? null : Number(r[5]) };
    out.byDay[d] = x; out.list.push(x);
  });
  out.list.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
  return out;
}

function dashOaSummary_(oa, from, to) {
  if (!oa.list.length) return { ready: false };
  var last = null, before = null;
  oa.list.forEach(function (x) { if (x.d <= to) last = x; if (x.d < from) before = x; });
  if (!last) return { ready: false };
  var latest = oa.list[oa.list.length - 1];
  return {
    ready: true,
    friends: latest.friends, asOf: latest.d,
    blocks: before ? last.blocks - before.blocks : null,
    statAdds: before ? last.followers - before.followers : null,
    rangeEnd: last.d,
  };
}

/** ดึงสถิติเพื่อน LINE OA รายวันที่ยังไม่มี (ถึงเมื่อวาน) · trigger ทุกเช้า */
function dashOaSync() {
  var token = String(webProp_('LINE_CHANNEL_ACCESS_TOKEN', ''));
  if (!token) throw new Error('ไม่พบ LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties');
  var ss = SpreadsheetApp.openById(DASH.KPI_ID), sh = dashOaSheet_(ss);
  var have = dashOaRead_(ss).byDay, yesterday = dashAdd_(dashDay_(new Date()), -1);
  var start = DASH.OA_FROM, rows = [], got = 0, prev = null;
  for (var d = start; d <= yesterday; d = dashAdd_(d, 1)) {
    if (have[d]) { prev = have[d]; continue; }
    if (got >= 120) break;                                // รอบละไม่เกิน 120 วัน
    var r = UrlFetchApp.fetch('https://api.line.me/v2/bot/insight/followers?date=' + d.replace(/-/g, ''), {
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
    });
    got++;
    if (r.getResponseCode() === 429) { console.warn('LINE จำกัดจำนวนครั้ง หยุดไว้ก่อน ดึงต่อรอบหน้า (' + d + ')'); break; }
    if (r.getResponseCode() !== 200) { console.warn('OA ' + d + ' ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200)); continue; }
    Utilities.sleep(400);                                 // กัน LINE จำกัดจำนวนครั้ง
    var j = JSON.parse(r.getContentText());
    if (j.status !== 'ready' || j.followers == null) continue;   // ยังไม่พร้อม (LINE อัปเดตช้า) → ลองใหม่รอบหน้า
    var x = { d: d, followers: Number(j.followers) || 0, blocks: Number(j.blocks) || 0 };
    x.friends = x.followers - x.blocks;
    var p = prev && dashAdd_(prev.d, 1) === d ? prev : null;
    rows.push([d, x.followers, x.blocks, x.friends, p ? x.followers - p.followers : '', p ? x.blocks - p.blocks : '',
      j.targetedReaches == null ? '' : Number(j.targetedReaches), new Date()]);
    prev = x;
  }
  if (rows.length) {
    var at = dashLastRow_(sh, DASH.HEADER_ROW) + 1;
    if (at + rows.length > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 200);
    sh.getRange(at, 1, rows.length, DASH.OA_COLS.length).setValues(rows);
    var n = dashLastRow_(sh, DASH.HEADER_ROW) - DASH.HEADER_ROW;
    if (n > 1) sh.getRange(DASH.HEADER_ROW + 1, 1, n, DASH.OA_COLS.length).sort(1);
  }
  console.log('OA Daily: เพิ่ม ' + rows.length + ' วัน');
  return rows.length;
}

function dashOaSheet_(ss) {
  var sh = ss.getSheetByName(DASH.OA_TAB);
  if (!sh) {
    sh = ss.insertSheet(DASH.OA_TAB);
    sh.getRange(2, 1).setValue('LINE OA Friends — รายวัน');
    sh.getRange(3, 1).setValue('Script "dashOaSync" ดึงจากสถิติ LINE ทุกเช้า (ข้อมูลถึงเมื่อวาน) — ห้ามแก้ด้วยมือ');
    sh.getRange(DASH.HEADER_ROW, 1, 1, DASH.OA_COLS.length).setValues([DASH.OA_COLS]).setFontWeight('bold');
    sh.setFrozenRows(DASH.HEADER_ROW);
    sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}

/* ============================== ใช้เอง ============================== */
/** Run ครั้งแรก: สร้างแท็บ OA Daily + ดึงย้อนหลัง + ตั้ง trigger ทุกวัน 9 โมง + ทดสอบคำนวณ 7 วันล่าสุด */
function dashSetup() {
  dashOaSheet_(SpreadsheetApp.openById(DASH.KPI_ID));
  try { dashOaSync(); } catch (e) { console.warn('ดึงสถิติ LINE ไม่ได้: ' + e.message); }
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dashOaSync'; });
  if (!has) ScriptApp.newTrigger('dashOaSync').timeBased().everyDays(1).atHour(9).inTimezone(DASH.TZ).create();
  var r = dashGet_('', '', true);
  console.log('7 วันล่าสุด: ' + JSON.stringify(r.totals) + ' · เพื่อน OA: ' + JSON.stringify(r.oa));
}

/* ============================== ตัวช่วย ============================== */
function dashRows_(sh, headRow) {
  var last = dashLastRow_(sh, headRow), cols = sh.getLastColumn();
  if (last <= headRow || cols < 1) return null;
  var head = sh.getRange(headRow, 1, 1, cols).getValues()[0].map(function (x) { return String(x).trim(); });
  return { head: head, rows: sh.getRange(headRow + 1, 1, last - headRow, cols).getValues() };
}

function dashLastRow_(sh, headRow) {
  var last = sh.getLastRow(); if (last <= headRow) return headRow;
  var a = sh.getRange(headRow + 1, 1, last - headRow, 1).getValues();
  for (var i = a.length - 1; i >= 0; i--) if (a[i][0] !== '' && a[i][0] !== null) return headRow + 1 + i;
  return headRow;
}

var DASH_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** ค่าในชีต (Date หรือข้อความหลายแบบ) → 'yyyy-MM-dd' เวลาไทย · อ่านไม่ได้ = '' */
function dashDay_(v) {
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, DASH.TZ, 'yyyy-MM-dd');
  if (typeof v === 'number' && v > 1e11) return Utilities.formatDate(new Date(v), DASH.TZ, 'yyyy-MM-dd');
  var s = String(v || '').trim(); if (!s) return '';
  var m, y, mo, d;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{2,4})/))) { d = +m[1]; mo = DASH_MON[m[2].toLowerCase()]; y = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) {
    var a = +m[1], b = +m[2]; y = +m[3];
    if (b > 12 && a <= 12) { mo = a; d = b; } else { d = a; mo = b; }   // ปกติ วัน/เดือน/ปี · ถ้าเลขกลาง > 12 = เดือน/วัน/ปี
  } else return '';
  if (y < 100) y += 2000;
  if (y > 2400) y -= 543;                                               // ปี พ.ศ.
  if (!mo || mo > 12 || !d || d > 31) return '';
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}

function dashAdd_(day, n) {
  var p = day.split('-').map(Number), t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + t.getUTCDate()).slice(-2);
}
function dashDiff_(a, b) {
  var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 864e5);
}
