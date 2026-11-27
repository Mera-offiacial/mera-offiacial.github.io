// ทดสอบแคมเปญ (Web_Campaign.gs + Web_BrandStock.gs) ด้วยชีตจำลอง
// node tools/apps-script/test_campaign.js tools/apps-script/Web_BrandStock.gs tools/apps-script/Web_Campaign.gs
const fs = require('fs'), vm = require('vm');
const SRC = process.argv.slice(2).map(f => fs.readFileSync(f, 'utf8')).join('\n');
function mkSheet(name, rows) {
  const sh = { name, rows: rows.map(r => r.slice()), id: 55 };
  sh.getName = () => name; sh.getLastRow = () => sh.rows.length; sh.getSheetId = () => sh.id;
  sh.getRange = (r, c, nr = 1, nc = 1) => { const R = {
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (sh.rows[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
    getDisplayValues: () => R.getValues().map(x => x.map(String)),
    getFormulas: () => Array.from({ length: nr }, () => Array.from({ length: nc }, () => '')),
    getValue: () => R.getValues()[0][0],
    setValue: v => { while (sh.rows.length < r) sh.rows.push([]); sh.rows[r - 1][c - 1] = v; return R; },
    setValues: vs => { vs.forEach((row, i) => row.forEach((v, j) => { while (sh.rows.length < r + i) sh.rows.push([]); sh.rows[r - 1 + i][c - 1 + j] = v; })); return R; },
    setFontWeight: () => R, setDataValidation: () => R, getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc, getSheet: () => sh };
    return R; };
  sh.appendRow = row => { sh.rows.push(row.slice()); };
  sh.setFrozenRows = () => {}; sh.setColumnWidth = () => {};
  return sh;
}
const BKK = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h) - 7 * 3600e3;
function world(opts = {}) {
  const PD = ['SKU', 'Brand', 'Product Name', 'Size', 'Color', 'Stock', 'Original Price', 'Sale Price', 'รวมค่าส่ง', 'ลดไปกี่ %', 'Product Status', 'Product Category', 'Sold Qauntity', 'Inventory Status', 'Remaining', 'Brand SKU', 'Source Form', 'Source Row', 'Created At', 'LINE Status', 'LINE Sent At', 'Error Message', 'Image URL'];
  const pd = (sku, brand, name, color, stock, orig, price, sold) => { const r = new Array(PD.length).fill(''); Object.assign(r, { 0: sku, 1: brand, 2: name, 3: '-', 4: color, 5: stock, 6: orig, 7: price, 9: 1 - price / orig, 10: 'ACTIVE', 11: 'กระเป๋า', 12: sold, 13: 'IN STOCK', 14: stock - sold }); return r; };
  const WO = ['Order ID', 'Created At', 'Status', 'Slip Status', 'Paid At', 'SKU', 'Qty', 'Unit Price', 'Items JSON'];
  const sheets = {
    'Product Database': mkSheet('Product Database', [PD,
      pd('MRA078', 'Narris', 'Hobo Bag', 'น้ำตาล', 19, 1690, 890, 0),
      pd('MRA079', 'Narris', 'Hobo Bag', 'สีเงิน', 24, 1690, 890, 1),
      pd('MRA123', 'Narris', 'Soft Boston', 'Black', 5, 990, 300, 0),
      pd('MRA124', 'Narris', 'Merlin', 'แดง', 2, 1090, 300, 2),
      pd('MRA034', 'Kome.offi', 'Ruby skirt', 'ดำ', 5, 520, 250, 1)]),
    'Brand Master': mkSheet('Brand Master', [['Brand Name', 'LINE Group ID', 'Active', 'Dashboard Sheet', 'Notes', 'Logo URL', 'Portal Key'],
      ['Narris', 'Cnarris', 'TRUE', '', '', '', 'narriskey0000000000000000000000a'], ['Kome.offi', 'Ckome', 'TRUE', '', '', '', 'komekey00000000000000000000000000']]),
    'Web Settings': mkSheet('Web Settings', [['Setting', 'Value'], ['Brand Portal', true], ['Product Form URL', 'none']]),
    'Web Orders': mkSheet('Web Orders', [WO]),
  };
  const pushes = [], cacheStore = {}, props = {}, triggers = [];
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n, [])), getUrl: () => 'https://docs.google.com/spreadsheets/d/X' };
  const ctx = {
    console: { log() {}, warn() {}, error: (...a) => process.env.DBG && console.error(...a) },
    webSS_: () => ss, webHeads_: sh => (sh.rows[0] || []).map(h => String(h).trim()), webWithLock_: fn => fn(),
    webErr_: (code, msg) => { const e = new Error(msg); e.code = code; return e; },
    webProp_: (k, d) => ({ ADMIN_GROUP_ID: 'Cadmin', LINE_CHANNEL_ACCESS_TOKEN: 'T' })[k] || d,
    CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; }, remove() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    UrlFetchApp: { fetch: (u, o) => { pushes.push(JSON.parse(o.payload)); return { getResponseCode: () => 200, getContentText: () => '' }; } },
    Utilities: { formatDate: () => '4 Dec 01:00' },
    SpreadsheetApp: { flush() {}, newDataValidation: () => ({ requireValueInList() { return { build: () => ({}) }; } }) },
    ScriptApp: { getProjectTriggers: () => triggers.map(h => ({ getHandlerFunction: () => h })),
      newTrigger: h => { const b = { timeBased: () => b, everyHours: () => b, forSpreadsheet: () => b, onEdit: () => b, create: () => triggers.push(h) }; return b; } },
    Date, JSON, Math, Number, String, Array, Object, isFinite,
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  let now = opts.now || BKK(2026, 11, 28, 10);
  ctx.campNow_ = () => now;
  ctx.campSetup();
  const call = b => { try { return ctx.webBrandStockRoute_(b); } catch (e) { return { ok: false, code: e.code, error: e.message }; } };
  const E = () => sheets['Campaign Entries'], heads = () => E().rows[0];
  const ent = (id, h) => { const r = E().rows.find(x => x[0] === id); return r ? r[heads().indexOf(h)] : undefined; };
  const setStatus = (id, st, note) => {
    const row = E().rows.findIndex(x => x[0] === id) + 1, H = heads();
    if (note !== undefined) E().rows[row - 1][H.indexOf('Admin Note')] = note;
    E().rows[row - 1][H.indexOf('Status')] = st;
    ctx.bstOnEdit({ range: E().getRange(row, H.indexOf('Status') + 1) });
  };
  const price = sku => { const P = sheets['Product Database']; return P.rows.find(r => r[0] === sku)[7]; };
  return { ctx, sheets, pushes, triggers, call, ent, setStatus, price, setNow: t => { now = t; }, order: row => sheets['Web Orders'].rows.push(row) };
}
let pass = 0, fail = 0;
function t(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL', name, info !== undefined ? JSON.stringify(info) : ''); } }
const NK = 'narriskey0000000000000000000000a', KK = 'komekey00000000000000000000000000';

// ติดตั้ง
{ const w = world();
  t('setup creates campaign row', w.sheets['Campaigns'].rows.length === 2 && w.sheets['Campaigns'].rows[1][0] === 'CP-001');
  t('setup trigger campTick + bstOnEdit', w.triggers.indexOf('campTick') >= 0 && w.triggers.indexOf('bstOnEdit') >= 0);
  w.ctx.campSetup(); t('setup twice no dup row', w.sheets['Campaigns'].rows.length === 2);
  t('setup twice no dup trigger', w.triggers.filter(x => x === 'campTick').length === 1);
}
// ดูแคมเปญ
{ const w = world(), v = w.call({ action: 'brandCampaign', key: NK });
  t('view ok', v.ok && v.campaigns.length === 1, v);
  const c = v.campaigns[0];
  t('phase soon', c.phase === 'soon'); t('can register', c.canRegister === true); t('free before deadline', c.free === true);
  t('fixed 15', c.fixedPct === 15); t('fee 5/5/4', c.fee.first === 5 && c.fee.count === 5 && c.fee.rest === 4);
  t('products grouped', v.products.length === 3 && v.products[0].skus.length === 2, v.products);
  t('merlin left 0', v.products.find(p => p.name === 'Merlin').left === 0);
  t('only own brand', !v.products.some(p => p.name === 'Ruby skirt'));
  t('bad key', w.call({ action: 'brandCampaign', key: 'x' }).code === 'BRAND_AUTH');
  t('daily 12 days', c.sales.daily.length === 12 && c.sales.daily[0].date === '2026-12-04' && c.sales.daily[11].date === '2026-12-15', c.sales.daily.map(d => d.date));
}
// ส่งสินค้า: ตรวจราคา
{ const w = world();
  const save = (items, extra) => w.call(Object.assign({ action: 'brandCampaignSave', key: NK, campaignId: 'CP-001', agree: true, items }, extra || {}));
  t('need agree', save([{ product: 'Hobo Bag', mode: 'fixed', online: 990 }], { agree: false }).code === 'CAMP_AGREE');
  t('need online', save([{ product: 'Hobo Bag', mode: 'fixed' }]).code === 'CAMP_BAD');
  t('fixed not below online', /ต่ำกว่าราคาออนไลน์/.test(save([{ product: 'Hobo Bag', mode: 'fixed', online: 700 }]).error));
  t('own not below mera', /ต่ำกว่าราคาบนมีร่า/.test(save([{ product: 'Soft Boston', mode: 'own', price: 300, online: 400 }]).error));
  t('own equal online', /ออนไลน์/.test(save([{ product: 'Soft Boston', mode: 'own', price: 280, online: 280 }]).error));
  t('out of stock', /หมดสต็อก/.test(save([{ product: 'Merlin', mode: 'own', price: 200, online: 300 }]).error));
  t('not yours', /ไม่ใช่สินค้า/.test(save([{ product: 'Ruby skirt', mode: 'own', price: 200, online: 300 }]).error));
  t('bad camp', w.call({ action: 'brandCampaignSave', key: NK, campaignId: 'CP-9', agree: true, items: [] }).code === 'CAMP_NONE');
  t('nothing written on error', w.sheets['Campaign Entries'].rows.length === 1);
  const r = save([{ product: 'Hobo Bag', mode: 'fixed', online: 890 }, { product: 'Soft Boston', mode: 'own', price: 249, online: 290 }], { clientRef: 'r1' });
  t('save ok', r.ok && r.saved === 2 && r.notified, r);
  t('2 entries', w.sheets['Campaign Entries'].rows.length === 3);
  t('fixed price 757', w.ent('CE-0001', 'Campaign Price') === 757 && w.ent('CE-0001', 'Mode') === 'Fixed');
  t('skus stored', w.ent('CE-0001', 'SKUs') === 'MRA078, MRA079');
  t('own 249', w.ent('CE-0002', 'Campaign Price') === 249 && w.ent('CE-0002', 'Online Price') === 290);
  t('pending', w.ent('CE-0002', 'Status') === 'Pending');
  t('admin notified', w.pushes.length === 1 && w.pushes[0].to === 'Cadmin' && /Hobo Bag 890 → 757/.test(w.pushes[0].messages[0].text), w.pushes[0]);
  t('view entries', r.campaigns[0].entries['hobo bag'].status === 'Pending' && r.campaigns[0].entries['soft boston'].price === 249);
  const dup = save([{ product: 'Hobo Bag', mode: 'fixed', online: 890 }], { clientRef: 'r1' });
  t('dup ref no change', dup.duplicate && w.sheets['Campaign Entries'].rows.length === 3 && w.ent('CE-0002', 'Status') === 'Pending');
  // ส่งซ้ำแบบไม่เปลี่ยน → ไม่แจ้ง
  const same = save([{ product: 'Hobo Bag', mode: 'fixed', online: 890 }, { product: 'Soft Boston', mode: 'own', price: 249, online: 290 }], { clientRef: 'r2' });
  t('same no change', same.saved === 0 && w.pushes.length === 1);
  // อนุมัติ → แจ้งแบรนด์
  w.setStatus('CE-0001', 'Approved');
  t('approved notify brand', w.pushes.length === 2 && w.pushes[1].to === 'Cnarris' && /อนุมัติ/.test(w.pushes[1].messages[0].text));
  t('notified status', w.ent('CE-0001', 'Notified Status') === 'Approved');
  w.setStatus('CE-0001', 'Approved'); t('no double notify', w.pushes.length === 2);
  t('price not changed before start', w.price('MRA078') === 890);
  // ไม่ผ่าน
  w.setStatus('CE-0002', 'Rejected', 'ร้านออนไลน์ลดเหลือ 240');
  t('reject notify reason', w.pushes.length === 3 && /ร้านออนไลน์ลดเหลือ 240/.test(w.pushes[2].messages[0].text));
  const v2 = w.call({ action: 'brandCampaign', key: NK });
  t('reject note shown', v2.campaigns[0].entries['soft boston'].note === 'ร้านออนไลน์ลดเหลือ 240');
  // แก้ราคาหลังไม่ผ่าน → Pending ใหม่
  const fix = save([{ product: 'Hobo Bag', mode: 'fixed', online: 890 }, { product: 'Soft Boston', mode: 'own', price: 229, online: 240 }], { clientRef: 'r3' });
  t('resubmit pending', fix.saved === 1 && w.ent('CE-0002', 'Status') === 'Pending' && w.ent('CE-0002', 'Admin Note') === '' && w.ent('CE-0002', 'Notified Status') === '');
  t('approved untouched', w.ent('CE-0001', 'Status') === 'Approved');
  // ล็อกราคาใน brandEdit
  const ed = w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', changes: { price: 850 } });
  t('price locked', ed.code === 'CAMP_LOCKED', ed);
  // ถอน
  const wd = save([{ product: 'Hobo Bag', mode: 'fixed', online: 890 }], { clientRef: 'r4' });
  t('withdraw', wd.saved === 1 && w.ent('CE-0002', 'Status') === 'Withdrawn' && !wd.campaigns[0].entries['soft boston']);
  t('withdraw notify admin', /ถอนออก/.test(w.pushes[w.pushes.length - 1].messages[0].text));
  // แบรนด์อื่นไม่เห็นของ Narris
  const kv = w.call({ action: 'brandCampaign', key: KK });
  t('other brand clean', Object.keys(kv.campaigns[0].entries).length === 0);
}
// ช่วงแคมเปญ: ขึ้นราคา / ยอดขาย / ค่าบริการ / คืนราคา
{ const w = world();
  w.call({ action: 'brandCampaignSave', key: NK, campaignId: 'CP-001', agree: true, items: [
    { product: 'Hobo Bag', mode: 'fixed', online: 890 }, { product: 'Soft Boston', mode: 'own', price: 249, online: 290 }] });
  w.setStatus('CE-0001', 'Approved');
  w.setNow(BKK(2026, 12, 4, 0) + 60e3); w.ctx.campTick();
  t('applied at start', w.price('MRA078') === 757 && w.price('MRA079') === 757, [w.price('MRA078')]);
  t('applied flag + before', w.ent('CE-0001', 'Applied') === 'Applied' && w.ent('CE-0001', 'Price Before') === 890);
  t('pending not applied', w.price('MRA123') === 300);
  w.ctx.campTick(); t('tick idempotent', w.price('MRA078') === 757);
  // อนุมัติระหว่างแคมเปญ → ขึ้นทันที
  w.setStatus('CE-0002', 'Approved');
  t('approve live applies', w.price('MRA123') === 249 && /10 นาที/.test(w.pushes[w.pushes.length - 1].messages[0].text));
  // view ใช้ราคาก่อนแคมเปญ
  const v = w.call({ action: 'brandCampaign', key: NK });
  t('view base price = before', v.products.find(p => p.name === 'Hobo Bag').price === 890);
  t('phase live', v.campaigns[0].phase === 'live');
  t('cannot fixed below again (same)', w.call({ action: 'brandCampaignSave', key: NK, campaignId: 'CP-001', agree: true, clientRef: 'z', items: [
    { product: 'Hobo Bag', mode: 'fixed', online: 890 }, { product: 'Soft Boston', mode: 'own', price: 249, online: 290 }] }).saved === 0);
  // ออเดอร์
  const J = items => JSON.stringify(items);
  w.order(['MO-1', new Date(BKK(2026, 12, 4, 9)), 'Confirmed', 'Paid', new Date(BKK(2026, 12, 4, 10)), '', '', '', J([{ sku: 'MRA078', qty: 2, unit: 757 }, { sku: 'MRA034', qty: 1, unit: 250 }])]);
  w.order(['MO-2', new Date(BKK(2026, 12, 5, 9)), 'Shipped', 'Paid', new Date(BKK(2026, 12, 5, 9)), '', '', '', J([{ sku: 'MRA123', qty: 3, unit: 249 }])]);
  w.order(['MO-3', new Date(BKK(2026, 12, 6, 9)), 'Pending Slip', 'Pending', '', '', '', '', J([{ sku: 'MRA079', qty: 5, unit: 757 }])]);
  w.order(['MO-4', new Date(BKK(2026, 12, 7, 9)), 'Confirmed', 'Paid', new Date(BKK(2026, 12, 7, 9)), 'MRA079', 1, 757, '']);
  w.order(['MO-5', new Date(BKK(2026, 12, 3, 9)), 'Confirmed', 'Paid', new Date(BKK(2026, 12, 3, 9)), '', '', '', J([{ sku: 'MRA078', qty: 1, unit: 890 }])]);
  const s = w.call({ action: 'brandCampaign', key: NK }).campaigns[0].sales;
  t('pcs 6', s.pcs === 6, s); t('orders 3', s.orders === 3, s);
  t('gross', s.gross === 757 * 3 + 249 * 3, s.gross);
  // ชิ้น 1-5: 757,757,249,249,249 @5% · ชิ้น 6: 757 @4%
  const ff = Math.round(((757 * 2 + 249 * 3) * 0.05 + 757 * 0.04) * 100) / 100;
  t('fee tiers', s.feeFull === ff, [s.feeFull, ff]);
  t('free → fee 0', s.free === true && s.fee === 0 && s.net === s.gross);
  t('daily', s.daily.find(d => d.date === '2026-12-04').pcs === 2 && s.daily.find(d => d.date === '2026-12-05').pcs === 3);
  t('per product', s.products[0].name === 'Hobo Bag' && s.products[0].sold === 3);
  // คูปอง
  t('coupon check live sku', w.ctx.campHasCampaignSku_(['mra078']) === true && w.ctx.campHasCampaignSku_(['MRA034']) === false);
  // ไม่ผ่านระหว่างแคมเปญ → คืนราคา
  w.setStatus('CE-0002', 'Rejected', 'x');
  t('reject live restores', w.price('MRA123') === 300 && w.ent('CE-0002', 'Applied') === 'Restored');
  // จบแคมเปญ → คืนราคา
  w.setNow(BKK(2026, 12, 16, 0) + 60e3); w.ctx.campTick();
  t('restore after end', w.price('MRA078') === 890 && w.price('MRA079') === 890 && w.ent('CE-0001', 'Applied') === 'Restored');
  const pct = w.sheets['Product Database'].rows.find(r => r[0] === 'MRA078')[9];
  t('pct restored', Math.abs(pct - (1 - 890 / 1690)) < 1e-9);
  t('ended phase visible', w.call({ action: 'brandCampaign', key: NK }).campaigns[0].phase === 'ended');
  t('closed register after end', w.call({ action: 'brandCampaignSave', key: NK, campaignId: 'CP-001', agree: true, items: [] }).code === 'CAMP_CLOSED');
  t('unlocked after end', w.ctx.campLocked_('Narris', 'Hobo Bag') === false);
}
// ลงทะเบียนหลัง Free Until → คิดค่าบริการ · ราคาถูกแก้ระหว่างแคมเปญ → ไม่ทับ
{ const w = world({ now: BKK(2026, 12, 6, 10) });
  w.call({ action: 'brandCampaignSave', key: NK, campaignId: 'CP-001', agree: true, items: [{ product: 'Soft Boston', mode: 'own', price: 250, online: 290 }] });
  w.setStatus('CE-0001', 'Approved');
  t('late applies live', w.price('MRA123') === 250);
  w.order(['MO-9', new Date(BKK(2026, 12, 6, 11)), 'Confirmed', 'Paid', new Date(BKK(2026, 12, 6, 11)), '', '', '', JSON.stringify([{ sku: 'MRA123', qty: 2, unit: 250 }])]);
  const s = w.call({ action: 'brandCampaign', key: NK }).campaigns[0];
  t('late not free', s.free === false && s.sales.fee === 25 && s.sales.net === 475, s.sales);
  w.sheets['Product Database'].rows.find(r => r[0] === 'MRA123')[7] = 199;   // ทีมแก้ราคาเอง
  w.setNow(BKK(2026, 12, 16, 1)); w.ctx.campTick();
  t('manual price kept', w.price('MRA123') === 199 && /เช็กเอง/.test(w.ent('CE-0001', 'Result')));
}
// ไม่มีส่วนลดมีร่า
{ const w = world(); w.sheets['Campaigns'].rows[1][8] = '';
  const r = w.call({ action: 'brandCampaignSave', key: NK, campaignId: 'CP-001', agree: true, items: [{ product: 'Hobo Bag', mode: 'fixed', online: 990 }] });
  t('no fixed option', /ไม่มีส่วนลดมีร่า/.test(r.error), r);
}
// Status Draft → แบรนด์ไม่เห็น
{ const w = world(); w.sheets['Campaigns'].rows[1][2] = 'Draft';
  t('draft hidden', w.call({ action: 'brandCampaign', key: NK }).campaigns.length === 0);
}
console.log('campaign tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
