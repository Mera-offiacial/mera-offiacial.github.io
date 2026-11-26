const fs = require('fs'), vm = require('vm'), assert = require('assert');
function sheet(name, headRow, head, rows) {
  const g = []; for (let i = 1; i < headRow; i++) g.push([]); g.push(head); rows.forEach(r => g.push(r));
  const sh = { name, g,
    getLastRow: () => g.length, getLastColumn: () => Math.max(...g.map(r => r.length)), getMaxRows: () => Math.max(1000, g.length),
    insertRowsAfter() {}, setFrozenRows() {},
    getRange(r, c, nr = 1, nc = 1) {
      if (typeof r === 'string') return { setNumberFormat() { return this; } };
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = g[r - 1 + i] || []; const v = row[c - 1 + j]; return v === undefined ? '' : v; })),
        setValues(v) { v.forEach((row, i) => { g[r - 1 + i] = g[r - 1 + i] || []; row.forEach((x, j) => g[r - 1 + i][c - 1 + j] = x); }); return this; },
        setValue(x) { (g[r - 1] = g[r - 1] || [])[c - 1] = x; return this; },
        setFontWeight() { return this; },
        sort() { const head = g.slice(0, r - 1), body = g.slice(r - 1, r - 1 + nr), rest = g.slice(r - 1 + nr); body.sort((a, b) => String(a[0]) < String(b[0]) ? -1 : 1); g.length = 0; g.push(...head, ...body, ...rest); },
      };
    } };
  return sh;
}
// activity.json = ดึงแท็บ Activity_Log!A5:N เป็น JSON ({values:[...]}) มาวางไว้ก่อนรัน (ไม่แนบในชุดนี้เพราะมีชื่อลูกค้า)
const act = JSON.parse(fs.readFileSync('activity.json')).values;
const AH = ['Activity ID','Timestamp','Campaign ID','Customer ID','Customer Name','Channel','Event Type','Stage','Result','Drop Reason','Owner','Notes','Match Group','Message Type'];
const TH = ['Time','Event','Source','Medium','Campaign','Content','This Visit Via','First Source','First Campaign','Visitor ID','Session ID','LINE User ID','Member ID','Product / Deal','Brand','Order ID','Order Total (฿)'];
const bkk = (s) => new Date(s + '+07:00');
const traffic = [
  [bkk('2026-11-20T10:00:00'), 'visit', 'instagram', 'social', 'zensation', '', '', '', '', 'v1', 's'],
  [bkk('2026-11-20T10:01:00'), 'visit', 'instagram', 'social', 'zensation', '', '', '', '', 'v1', 's'],
  [bkk('2026-11-20T10:02:00'), 'view', 'instagram', 'social', 'zensation', '', '', '', '', 'v1', 's', '', '', 'Add LINE OA'],
  [bkk('2026-11-21T23:30:00'), 'visit', 'tiktok', 'social', 'zensation', '', '', '', '', 'v2', 's'],
  ['22/11/26 10:57', 'visit', 'direct', '', '', '', '', '', '', 'v3', 's'],
  [bkk('2026-11-22T11:00:00'), 'order', 'tiktok', 'social', 'zensation', '', '', '', '', 'v2', 's', '', '', '', '', 'MO-0009', 590],
  [bkk('2026-11-22T11:00:00'), 'visit', 'direct', '', '', '', '', '', '', 'test-abc', 's'],
  [bkk('2026-11-25T23:59:00'), 'visit', 'facebook', 'social', 'zensation', '', '', '', '', 'v4', 's'],
];
const WH = ['Order ID','Created At','Status','Slip Status','Reject Reason','LINE User ID','Total'];
const orders = [['MO-0001','10/13/2026','Shipped','Paid','','',500],['MO-0003','11/9/2026','Pending Slip','Pending','','',300],['MO-0004', bkk('2026-11-23T09:00:00'),'Shipped','Paid','','',690],['MO-0005','11/24/2026','Cancelled','Cancelled','','',999]];
const kpi = { Traffic: sheet('Traffic', 4, TH, traffic), Activity_Log: sheet('Activity_Log', 4, AH, act) };
const inv = { 'Web Orders': sheet('Web Orders', 1, WH, orders) };
const ss = { getSheetByName: n => kpi[n] || null, insertSheet: n => (kpi[n] = sheet(n, 1, [], [])) };
const pad = n => String(n).padStart(2, '0');
const ctx = {
  console, JSON, Math, Date, Number, String, Object, Array, RegExp, isNaN,
  SpreadsheetApp: { openById: () => ss },
  Utilities: { sleep() {}, formatDate: (d, tz, f) => { const t = new Date(d.getTime() + 7 * 3600e3); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); } },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  webSS_: () => ({ getSheetByName: n => inv[n] || null }),
  webErr_: (c, m) => { const e = new Error(m); e.code = c; return e; },
  webProp_: (k, d) => k === 'LINE_CHANNEL_ACCESS_TOKEN' ? 'tok' : d,
  admRequire_: b => { if (b.token !== 'ok') throw ctx.webErr_('ADMIN_AUTH', 'x'); return { by: 't' }; },
  UrlFetchApp: { fetch: (url) => { const d = url.match(/date=(\d+)/)[1]; const k = Number(d.slice(4)) ; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(d === '20261124' ? { status: 'unready' } : { status: 'ready', followers: 1000 + k, blocks: 50 + Math.floor(k / 100), targetedReaches: 900 }) }; } },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ inTimezone: () => ({ create() {} }) }) }) }) }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2] || 'Web_Dash.gs', 'utf8'), ctx);
const R = (b) => ctx.webDashRoute_(b);
// route & auth
assert.strictEqual(R({ action: 'other' }), null);
assert.throws(() => R({ action: 'adminDash', token: 'bad' }), /x/);
// date parser
const P = ctx.dashDay_;
assert.strictEqual(P('23-Sep-26 07:29'), '2026-09-23');
assert.strictEqual(P('23/11/2026'), '2026-11-23');
assert.strictEqual(P('11/23/2026'), '2026-11-23');
assert.strictEqual(P('21/11/26 10:57'), '2026-11-21');
assert.strictEqual(P(bkk('2026-11-21T23:30:00')), '2026-11-21');
assert.strictEqual(P('25/11/2569'), '2026-11-25');
assert.strictEqual(P(''), ''); assert.strictEqual(P('abc'), '');
// OA sync
const added = ctx.dashOaSync();
const oa = kpi['OA Daily'];
assert.ok(added > 50, 'oa rows ' + added);
assert.ok(!oa.g.some(r => r[0] === '2026-11-24'), 'unready skipped');
const again = ctx.dashOaSync();
console.log('oa added', added, 'second run', again);
// totals
let r = ctx.dashGet_('2026-11-20', '2026-11-25', true);
console.log(JSON.stringify(r.totals), JSON.stringify(r.oa));
assert.strictEqual(r.days.length, 7);               // short range → 7 days
assert.strictEqual(r.totals.visitors, 4);           // v1,v2,v3,v4 (test- excluded)
assert.strictEqual(r.totals.oaClicks, 1);
assert.strictEqual(r.totals.orders, 1);             // MO-0004 only (cancelled excluded)
assert.strictEqual(r.totals.sales, 690);
assert.strictEqual(r.days.find(d => d.d === '2026-11-21').visitors, 1); // 23:30 BKK stays on 21st
assert.strictEqual(r.days.find(d => d.d === '2026-11-20').visitors, 1);
const ig = r.sources.find(s => s.src === 'instagram'); assert.strictEqual(ig.visitors, 1); assert.strictEqual(ig.oaClicks, 1);
const tk = r.sources.find(s => s.src === 'tiktok'); assert.strictEqual(tk.orders, 1); assert.strictEqual(tk.sales, 590);
assert.strictEqual(JSON.stringify(r.campaigns), JSON.stringify([{ name: 'zensation', start: '2026-11-20' }]));
assert.ok(r.oa.ready && r.oa.friends > 0 && r.oa.blocks !== null);
// activity counts vs raw
const rawAdds = act.filter(x => P(x[1]) >= '2026-11-20' && P(x[1]) <= '2026-11-25' && x[6] === 'Member Signup' && x[13] === 'welcome' && !/^TEST/i.test(x[2] || '')).length;
assert.strictEqual(r.totals.oaAdds, rawAdds);
// whole range Sep 1 → today
r = ctx.dashGet_('2026-09-01', ctx.dashDay_(new Date()), true);
console.log('all-time', JSON.stringify(r.totals), 'prev', r.prev);
assert.strictEqual(r.prev, null);
r = ctx.dashGet_('2026-01-01', '2026-11-25', true); assert.strictEqual(r.from, '2026-09-01');
r = ctx.dashGet_('2026-11-25', '2026-11-20', true); assert.strictEqual(r.from, '2026-11-20');
r = ctx.dashGet_('x', '2099-01-01', true); assert.strictEqual(r.to, ctx.dashDay_(new Date()));
console.log('ALL PASS');
