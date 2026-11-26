// ทดสอบ Web_BrandStock.gs ด้วยชีตจำลอง
const fs = require('fs'), vm = require('vm');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
function mkSheet(name, rows, formulas) {
  const sh = { name, rows: rows.map(r => r.slice()), formulas: formulas || {}, id: Math.floor(Math.random() * 1e6) };
  sh.getLastRow = () => sh.rows.length;
  sh.getSheetId = () => sh.id;
  sh.getRange = (r, c, nr = 1, nc = 1) => { const R = {
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (sh.rows[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
    getFormulas: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.formulas[(r + i) + ':' + (c + j)] || '')),
    setValue: v => { while (sh.rows.length < r) sh.rows.push([]); sh.rows[r - 1][c - 1] = v; delete sh.formulas[r + ':' + c]; },
    setValues: vs => vs.forEach((row, i) => row.forEach((v, j) => { while (sh.rows.length < r + i) sh.rows.push([]); sh.rows[r - 1 + i][c - 1 + j] = v; })),
    setFontWeight: () => R,
  }; const sv = R.setValues; R.setValues = vs => { sv(vs); return R; }; return R; };
  sh.setFrozenRows = () => {};
  return sh;
}
function mkFormApp(f) {
  const T = { TEXT: 'TEXT', PARAGRAPH_TEXT: 'PARA', LIST: 'LIST', MULTIPLE_CHOICE: 'MC', CHECKBOX: 'CB' };
  return { ItemType: T, openByUrl: () => {
    if (!f || f.denied) throw new Error('You do not have permission to call FormApp.openByUrl');
    const resp = (id, v) => ({ id, v });
    const mkItem = (id, title, type, choices) => {
      const wrap = { createResponse: v => resp(id, v), getChoices: () => (choices || []).map(c => ({ getValue: () => c })) };
      return { getTitle: () => title, getType: () => type, asTextItem: () => wrap, asParagraphTextItem: () => wrap, asListItem: () => wrap, asMultipleChoiceItem: () => wrap };
    };
    const items = [mkItem(111, 'ชื่อผู้ติดต่อ', T.TEXT), mkItem(222, f.title || 'ชื่อแบรนด์', T[f.type || 'TEXT'], f.choices)];
    return { getTitle: () => 'ฟอร์มลงสินค้า', getItems: () => items,
      createResponse: () => ({ withItemResponse: r => ({ toPrefilledUrl: () => 'https://docs.google.com/forms/d/e/PUB/viewform?usp=pp_url&entry.' + r.id + '=' + encodeURIComponent(r.v) }) }) };
  } };
}
function world(opts = {}) {
  const PD = ['SKU', 'Brand', 'Product Name', 'Size', 'Color', 'Stock', 'Original Price', 'Sale Price', 'รวมค่าส่ง', 'ลดไปกี่ %', 'Product Status', 'Product Category', 'Sold Qauntity', 'Inventory Status', 'Remaining'];
  const sheets = {
    'Product Database': mkSheet('Product Database', [PD,
      ['MRA002', '', '', 'M', 'Black', 5, '', 250, 285, '', '', 'กระโปรง'],                          // แถวเก่า ไม่มีสถานะ
      ['MRA079', 'Narris', 'Hobo Bag', '-', 'สีเงิน PU', 24, 1690, 890, '', 0.47, 'ACTIVE', 'กระเป๋า', 1, 'IN STOCK', 23],
      ['MRA080', 'Narris', 'Hobo Bag', '-', 'คาราเมล', 12, 1690, 890, '', 0.47, 'ACTIVE', 'กระเป๋า', 0, 'IN STOCK', 12],
      ['MRA091', 'Narris', 'Soft boston', '-', 'น้ำตาล', 0, 990, 300, '', 0.7, 'ACTIVE', 'กระเป๋า', 0, 'OUT OF STOCK', 0],
      ['MRA034', 'Kome.offi', 'Ruby skirt', 'M', 'สีดำ', 5, 520, 250, '', 0.5, 'ACTIVE', 'กระโปรง', 1, 'IN STOCK', 4],
      ['MRA033', 'Kome.offi', 'Ruby skirt', 'S', 'สีดำ', 5, 520, 250, '', 0.5, 'ACTIVE', 'กระโปรง', 0, 'IN STOCK', 5],
    ], { '7:15': '=MAX(0,F7-M7)' }),
    'Brand Master': mkSheet('Brand Master', [['Brand Name', 'LINE Group ID', 'Active', 'Dashboard Sheet', 'Notes', 'Logo URL', 'Portal Key'],
      ['Narris', 'C1', 'TRUE', '', '', '', 'narriskey0000000000000000000000a'],
      ['Kome.offi', 'C2', 'TRUE', '', '', '', 'komekey00000000000000000000000000'],
      ['Old', 'C3', 'FALSE', '', '', '', 'oldkey0000000000000000000000000000']]),
    'Web Settings': mkSheet('Web Settings', [['Setting', 'Value'], ['Brand Portal', opts.portal === undefined ? true : opts.portal], ['Product Form URL', opts.formSetting === undefined ? 'https://forms.gle/x' : opts.formSetting]].concat(opts.stock !== undefined ? [['Brand Stock', opts.stock]] : [])),
    'Web Orders': mkSheet('Web Orders', [['Order ID', 'Created At', 'Status', 'Slip Status', 'Reject Reason', 'LINE User ID', 'LINE Name', 'SKU', 'Brand', 'Product Name', 'Color', 'Size', 'Qty', 'x', 'y', 'z', 'Items JSON'],
      ['MO-1', '', 'Pending Slip', 'Pending', '', '', '', 'MRA080', 'Narris', '', '', '', 2, '', '', '', ''],
      ['MO-2', '', 'Pending Slip', 'Pending', '', '', '', 'MRA080, MRA079', 'Narris', '', '', '', 3, '', '', '', JSON.stringify([{ sku: 'MRA080', qty: 1 }, { sku: 'MRA079', qty: 2 }])],
      ['MO-3', '', 'Confirmed', 'Paid', '', '', '', 'MRA080', 'Narris', '', '', '', 5, '', '', '', '']]),
  };
  sheets['Product Responses'] = mkSheet('Product Responses', [['Timestamp']]);
  sheets['Product Responses'].getFormUrl = () => opts.linkedForm || '';
  const pushes = [], cacheStore = {};
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n, [])), getUrl: () => 'https://docs.google.com/spreadsheets/d/X' };
  const ctx = {
    console: { log() {}, warn() {}, error: (...a) => process.env.DBG && console.error(...a) },
    webSS_: () => ss,
    webHeads_: sh => (sh.rows[0] || []).map(h => String(h).trim()),
    webWithLock_: fn => fn(),
    webErr_: (code, msg) => { const e = new Error(msg); e.code = code; return e; },
    webProp_: (k, d) => ({ ADMIN_GROUP_ID: 'Cadmin', LINE_CHANNEL_ACCESS_TOKEN: opts.noToken ? '' : 'T' })[k] || d,
    CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; } }) },
    UrlFetchApp: { fetch: (u, o) => { pushes.push(JSON.parse(o.payload)); return { getResponseCode: () => opts.pushFail ? 500 : 200, getContentText: () => '' }; } },
    Utilities: { formatDate: () => '26 Nov 13:40' },
    FormApp: mkFormApp(opts.form),
    SpreadsheetApp: { flush() {} },
    Date, JSON, Math, Number, String, Array, Object, isFinite,
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { ctx, sheets, pushes, call: b => { try { return ctx.webBrandStockRoute_(b); } catch (e) { return { ok: false, code: e.code, error: e.message }; } } };
}
let pass = 0, fail = 0;
function t(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL', name, info !== undefined ? JSON.stringify(info) : ''); } }
const NK = 'narriskey0000000000000000000000a', KK = 'komekey00000000000000000000000000';
const cell = (w, sku, col) => { const PD = w.sheets['Product Database']; const h = PD.rows[0]; const r = PD.rows.find(x => x[0] === sku); return r[h.indexOf(col)]; };

// 1 ไม่ใช่ action ของไฟล์นี้
{ const w = world(); t('other action → null', w.ctx.webBrandStockRoute_({ action: 'brandOrders' }) === null); }
// 2 อ่านสินค้า
{ const w = world(); const r = w.call({ action: 'brandProducts', key: NK });
  t('products ok', r.ok && r.brand === 'Narris', r);
  t('grouped by name', r.products.length === 2 && r.products[0].name === 'Hobo Bag' && r.products[0].variants.length === 2);
  t('held counts pending only (2+1 MRA080, 2 MRA079)', r.products[0].variants[1].held === 3 && r.products[0].variants[0].held === 2, r.products[0].variants);
  t('form url', r.formUrl === 'https://forms.gle/x');
  t('only own brand', JSON.stringify(r).indexOf('MRA034') < 0 && JSON.stringify(r).indexOf('MRA002') < 0); }
// 3 สิทธิ์
{ const w = world(); t('bad key', w.call({ action: 'brandProducts', key: 'x' }).code === 'BRAND_AUTH');
  t('unknown key', w.call({ action: 'brandProducts', key: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz' }).code === 'BRAND_AUTH');
  t('inactive brand', w.call({ action: 'brandProducts', key: 'oldkey0000000000000000000000000000' }).code === 'BRAND_AUTH'); }
{ const w = world({ portal: false }); t('portal off', w.call({ action: 'brandProducts', key: NK }).code === 'BRAND_OFF'); }
{ const w = world({ stock: false }); t('stock switch off', w.call({ action: 'brandProducts', key: NK }).code === 'BRAND_OFF'); }
{ const w = world({ stock: 'TRUE' }); t('stock switch TRUE string', w.call({ action: 'brandProducts', key: NK }).ok); }
// 4 เพิ่มสต็อก → Stock, Remaining, แจ้ง LINE, log
{ const w = world(); const r = w.call({ action: 'brandStock', key: NK, clientRef: 'a1', changes: [{ sku: 'MRA079', delta: 5 }], note: 'ของเข้าใหม่' });
  t('add ok', r.ok && r.saved === 1 && r.notified, r);
  t('stock 24→29', cell(w, 'MRA079', 'Stock') === 29);
  t('remaining 23→28', cell(w, 'MRA079', 'Remaining') === 28);
  t('sold untouched', cell(w, 'MRA079', 'Sold Qauntity') === 1);
  t('one LINE push to admin group', w.pushes.length === 1 && w.pushes[0].to === 'Cadmin');
  t('push text', /เพิ่มสต็อก · Narris/.test(w.pushes[0].messages[0].text) && /23 → 28 \(\+5\)/.test(w.pushes[0].messages[0].text) && /ของเข้าใหม่/.test(w.pushes[0].messages[0].text), w.pushes[0].messages[0].text);
  const log = w.sheets['Stock Log']; t('log row', log && log.rows.length === 2 && log.rows[1][2] === 'MRA079' && log.rows[1][7] === 5 && log.rows[1][12] === 'Sent', log && log.rows);
  t('response has fresh view', r.products[0].variants[0].stock === 29);
  // กดซ้ำ clientRef เดิม
  const r2 = w.call({ action: 'brandStock', key: NK, clientRef: 'a1', changes: [{ sku: 'MRA079', delta: 5 }] });
  t('duplicate not applied', r2.ok && r2.duplicate && cell(w, 'MRA079', 'Stock') === 29 && w.pushes.length === 1); }
// 5 สินค้าหมด → เติม → IN STOCK
{ const w = world(); w.call({ action: 'brandStock', key: NK, clientRef: 'b', changes: [{ sku: 'MRA091', delta: 3 }] });
  t('restock sold out → IN STOCK', cell(w, 'MRA091', 'Inventory Status') === 'IN STOCK' && cell(w, 'MRA091', 'Remaining') === 3); }
// 6 ลด: ไม่แจ้ง LINE, log, OUT OF STOCK
{ const w = world(); const r = w.call({ action: 'brandStock', key: NK, clientRef: 'c', changes: [{ sku: 'MRA079', delta: -21 }] });
  t('decrease ok no push', r.ok && !r.notified && w.pushes.length === 0, r);
  t('decrease stock 24→3 remaining 2', cell(w, 'MRA079', 'Stock') === 3 && cell(w, 'MRA079', 'Remaining') === 2);
  t('log no notify flag', w.sheets['Stock Log'].rows[1][12] === ''); }
// 7 ลดต่ำกว่าที่จอง
{ const w = world(); const r = w.call({ action: 'brandStock', key: NK, clientRef: 'd', changes: [{ sku: 'MRA080', delta: -10 }] });
  t('below reserved rejected', !r.ok && r.code === 'BELOW_RESERVED' && /ลดได้มากสุด 9 ชิ้น/.test(r.error) && /จองไว้ 3/.test(r.error), r);
  t('nothing written', cell(w, 'MRA080', 'Stock') === 12 && !w.sheets['Stock Log']);
  const ok = w.call({ action: 'brandStock', key: NK, clientRef: 'd2', changes: [{ sku: 'MRA080', delta: -9 }] });
  t('exactly to reserved ok', ok.ok && cell(w, 'MRA080', 'Remaining') === 3); }
// 8 ลดจนติดลบไม่ได้
{ const w = world(); const r = w.call({ action: 'brandStock', key: NK, clientRef: 'e', changes: [{ sku: 'MRA091', delta: -1 }] });
  t('below zero rejected', !r.ok && r.code === 'BELOW_RESERVED', r); }
// 9 SKU ของแบรนด์อื่น / แถวเก่า
{ const w = world(); const r = w.call({ action: 'brandStock', key: NK, clientRef: 'f', changes: [{ sku: 'MRA034', delta: 1 }] });
  t('other brand sku rejected', !r.ok && r.code === 'NOT_YOURS' && cell(w, 'MRA034', 'Stock') === 5, r);
  const r2 = w.call({ action: 'brandStock', key: NK, clientRef: 'f2', changes: [{ sku: 'MRA002', delta: 1 }] });
  t('legacy row rejected', !r2.ok && r2.code === 'NOT_YOURS'); }
// 10 ทั้งชุดล้มถ้ามีตัวไหนผิด (ไม่แก้ครึ่งเดียว)
{ const w = world(); const r = w.call({ action: 'brandStock', key: NK, clientRef: 'g', changes: [{ sku: 'MRA079', delta: 2 }, { sku: 'MRA080', delta: -12 }] });
  t('all-or-nothing', !r.ok && cell(w, 'MRA079', 'Stock') === 24 && w.pushes.length === 0, r); }
// 11 เพิ่มเกินเพดาน / ค่าแปลก
{ const w = world(); t('over max add', w.call({ action: 'brandStock', key: NK, changes: [{ sku: 'MRA079', delta: 101 }] }).code === 'TOO_MANY');
  t('fraction rejected', w.call({ action: 'brandStock', key: NK, changes: [{ sku: 'MRA079', delta: 1.5 }] }).code === 'BAD_SKU');
  t('empty changes', w.call({ action: 'brandStock', key: NK, changes: [] }).code === 'BAD_STOCK');
  t('all zero', w.call({ action: 'brandStock', key: NK, changes: [{ sku: 'MRA079', delta: 0 }] }).code === 'BAD_STOCK'); }
// 12 Remaining เป็นสูตร → ไม่เขียนทับ
{ const w = world(); const r = w.call({ action: 'brandStock', key: KK, clientRef: 'h', changes: [{ sku: 'MRA033', delta: 2 }] });
  const PD = w.sheets['Product Database'];
  t('formula remaining kept', r.ok && PD.formulas['7:15'] === '=MAX(0,F7-M7)' && cell(w, 'MRA033', 'Stock') === 7, r); }
// 13 หลาย SKU เพิ่ม+ลด → แจ้งครั้งเดียว
{ const w = world(); const r = w.call({ action: 'brandStock', key: NK, clientRef: 'i', changes: [{ sku: 'MRA079', delta: 1 }, { sku: 'MRA091', delta: 4 }, { sku: 'MRA080', delta: -2 }] });
  t('mixed ok one push', r.ok && r.saved === 3 && w.pushes.length === 1, r);
  t('push lists cuts', /ลดด้วย 1 รายการ/.test(w.pushes[0].messages[0].text));
  t('log 3 rows', w.sheets['Stock Log'].rows.length === 4); }
// 14 ส่ง LINE ไม่ได้ → ยังบันทึกสต็อก, log Failed
{ const w = world({ pushFail: true }); const r = w.call({ action: 'brandStock', key: NK, clientRef: 'j', changes: [{ sku: 'MRA079', delta: 1 }] });
  t('push fail still saves', r.ok && !r.notified && cell(w, 'MRA079', 'Stock') === 25 && w.sheets['Stock Log'].rows[1][12] === 'Failed', r); }
// 15 SKU ซ้ำในคำขอ → รวม
{ const w = world(); const r = w.call({ action: 'brandStock', key: NK, clientRef: 'k', changes: [{ sku: 'mra079', delta: 1 }, { sku: 'MRA079', delta: 2 }] });
  t('duplicate sku merged', r.ok && cell(w, 'MRA079', 'Stock') === 27, r); }
// 16 ลิงก์ฟอร์มลงสินค้าใหม่
{ const w = world({ formSetting: '', linkedForm: 'https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit' });
  t('form auto from Product Responses', w.call({ action: 'brandProducts', key: NK }).formUrl === 'https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/viewform'); }
{ const w = world({ formSetting: '', linkedForm: 'https://docs.google.com/forms/d/e/1FAIpQLSdXyZ0123456789abcdefghij/viewform' });
  t('form auto published url', w.call({ action: 'brandProducts', key: NK }).formUrl === 'https://docs.google.com/forms/d/e/1FAIpQLSdXyZ0123456789abcdefghij/viewform'); }
{ const w = world({ formSetting: 'none', linkedForm: 'https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit' });
  t('form none hides button', w.call({ action: 'brandProducts', key: NK }).formUrl === ''); }
{ const w = world({ formSetting: '' }); t('no linked form → no button', w.call({ action: 'brandProducts', key: NK }).formUrl === ''); }
// 17 เติมชื่อแบรนด์ในฟอร์ม
const LF = 'https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit';
{ const w = world({ formSetting: '', linkedForm: LF, form: { type: 'TEXT' } });
  t('prefill text', w.call({ action: 'brandProducts', key: NK }).formUrl === 'https://docs.google.com/forms/d/e/PUB/viewform?usp=pp_url&entry.222=Narris'); }
{ const w = world({ formSetting: '', linkedForm: LF, form: { type: 'LIST', choices: ['narris', 'Kome.offi'] } });
  t('prefill dropdown matching choice', w.call({ action: 'brandProducts', key: NK }).formUrl.endsWith('entry.222=narris')); }
{ const w = world({ formSetting: '', linkedForm: LF, form: { type: 'LIST', choices: ['Other'] } });
  t('dropdown no choice → plain link', w.call({ action: 'brandProducts', key: NK }).formUrl === 'https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/viewform'); }
{ const w = world({ formSetting: '', linkedForm: LF, form: { denied: true } });
  t('not authorized → plain link', w.call({ action: 'brandProducts', key: NK }).formUrl === 'https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/viewform'); }
{ const w = world({ formSetting: '', linkedForm: LF, form: { title: 'Brand name (ชื่อร้าน)' } });
  t('prefill by brand keyword', /entry\.222=Narris$/.test(w.call({ action: 'brandProducts', key: NK }).formUrl)); }
{ const w = world({ formSetting: 'https://forms.gle/custom', linkedForm: LF, form: { type: 'TEXT' } });
  t('setting wins over prefill', w.call({ action: 'brandProducts', key: NK }).formUrl === 'https://forms.gle/custom'); }
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
