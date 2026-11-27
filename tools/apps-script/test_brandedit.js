// ทดสอบคำขอแก้ข้อมูลสินค้า (brandEdit) + อนุมัติ (bstDecide_) ด้วยชีตจำลอง
const fs = require('fs'), vm = require('vm');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
function mkSheet(name, rows) {
  const sh = { name, rows: rows.map(r => r.slice()), id: 77 };
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
function world() {
  const PD = ['SKU', 'Brand', 'Product Name', 'Size', 'Color', 'Stock', 'Original Price', 'Sale Price', 'รวมค่าส่ง', 'ลดไปกี่ %', 'Product Status', 'Product Category', 'Sold Qauntity', 'Inventory Status', 'Remaining', 'Brand SKU', 'Source Form', 'Source Row', 'Created At', 'LINE Status', 'LINE Sent At', 'Error Message', 'Image URL'];
  const pd = (sku, brand, name, size, color, stock, orig, price, cat, sold, img) => { const r = new Array(PD.length).fill(''); Object.assign(r, { 0: sku, 1: brand, 2: name, 3: size, 4: color, 5: stock, 6: orig, 7: price, 9: 1 - price / orig, 10: 'ACTIVE', 11: cat, 12: sold, 13: 'IN STOCK', 14: stock - sold, 22: img || '' }); return r; };
  const sheets = {
    'Product Database': mkSheet('Product Database', [PD,
      pd('MRA078', 'Narris', 'Hobo Bag', '-', 'น้ำตาล', 19, 1690, 890, 'กระเป๋า', 0, 'https://drive.google.com/open?id=AAAAAAAAAAAAAAAAAAAAAAAA'),
      pd('MRA079', 'Narris', 'Hobo Bag', '-', 'สีเงิน', 24, 1690, 890, 'กระเป๋า', 1),
      pd('MRA123', 'Narris', 'Soft Boston', '-', 'Black', 5, 990, 300, 'กระเป๋า', 0),
      pd('MRA034', 'Kome.offi', 'Ruby skirt', 'M', 'ดำ', 5, 520, 250, 'กระโปรง', 1)]),
    'Brand Master': mkSheet('Brand Master', [['Brand Name', 'LINE Group ID', 'Active', 'Dashboard Sheet', 'Notes', 'Logo URL', 'Portal Key'],
      ['Narris', 'Cnarris', 'TRUE', '', '', '', 'narriskey0000000000000000000000a'], ['Kome.offi', 'Ckome', 'TRUE', '', '', '', 'komekey00000000000000000000000000']]),
    'Web Settings': mkSheet('Web Settings', [['Setting', 'Value'], ['Brand Portal', true], ['Product Form URL', 'none']]),
    'Web Orders': mkSheet('Web Orders', [['Order ID', 'Created At', 'Status', 'Slip Status', 'x', 'y', 'z', 'SKU', 'Brand', 'n', 'c', 's', 'Qty']]),
  };
  const admin = {
    'Images': mkSheet('Images', [['Kind', 'Key', 'Image URLs', 'Updated At', 'Updated By'],
      ['product', 'narris|hobo bag', 'https://lh3.googleusercontent.com/d/IMG1\nhttps://lh3.googleusercontent.com/d/IMG2', '', ''],
      ['color', 'narris|hobo bag|สีเงิน', 'https://lh3.googleusercontent.com/d/IMG3', '', '']]),
    'Product Details': mkSheet('Product Details', [['Brand', 'Product Name', 'Size Chart', 'Description', 'Material', 'Fit / Feel', 'Care', 'Note', 'Updated At'],
      ['Narris', 'Hobo Bag', '', 'กระเป๋าใช้ทุกวัน', '', '', '', '', '']]),
    'New Tags': mkSheet('New Tags', [['Key', 'Mode', 'Date', 'Updated At', 'Updated By'], ['narris|hobo bag', 'on', '2026-11-20', '', '']]),
  };
  const pushes = [], cacheStore = {}, props = {}, files = [];
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n, [])), getUrl: () => 'https://sheet' };
  const adm = { getSheetByName: n => admin[n] || null };
  const norm = v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const ctx = {
    console: { log() {}, warn() {}, error: (...a) => process.env.DBG && console.error(...a) },
    webSS_: () => ss, webHeads_: sh => (sh.rows[0] || []).map(h => String(h).trim()), webWithLock_: fn => fn(),
    webErr_: (code, msg) => { const e = new Error(msg); e.code = code; return e; },
    webProp_: (k, d) => ({ ADMIN_GROUP_ID: 'Cadmin', LINE_CHANNEL_ACCESS_TOKEN: 'T', ADMIN_SHEET_ID: 'A' })[k] || d,
    ADM: { INFO_TAB: 'Product Details', PUB_CACHE: 'pub' },
    admSheet_: () => adm, admImgTab_: () => admin.Images, admNewTab_: () => admin['New Tags'], admNorm_: norm,
    admKey_: (b, n) => [b, n].map(norm).join('|'),
    admReadImages_: () => { const out = { products: {}, colors: {} }; admin.Images.rows.slice(1).forEach(r => { if (r[0] === 'product') out.products[norm(r[1])] = String(r[2]).split('\n'); }); return out; },
    admProductInfo_: () => { const out = {}; admin['Product Details'].rows.slice(1).forEach(r => { out[[r[0], r[1]].map(norm).join('|')] = { size: r[2], description: r[3], material: r[4] }; });
      out['narris|hobo bag'] = Object.assign({ size: 'กว้าง 30 ซม. (จากฟอร์ม)' }, Object.fromEntries(Object.entries(out['narris|hobo bag'] || {}).filter(([, v]) => v))); return out; },
    admFolder_: () => ({ createFile: blob => { const id = 'NEW' + files.length; files.push(blob); return { setSharing() {}, getId: () => id }; } }),
    DriveApp: { Access: {}, Permission: {} },
    CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; }, remove: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    UrlFetchApp: { fetch: (u, o) => { pushes.push(JSON.parse(o.payload)); return { getResponseCode: () => 200, getContentText: () => '' }; } },
    Utilities: { formatDate: () => '26 Nov', newBlob: (d, m, n) => ({ m, n }), base64Decode: s => s },
    SpreadsheetApp: { flush() {}, newDataValidation: () => ({ requireValueInList() { return this; }, build() { return {}; } }) },
    FormApp: { ItemType: {}, openByUrl: () => { throw new Error('no'); } },
    Date, JSON, Math, Number, String, Array, Object, isFinite,
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  const call = b => { try { return ctx.webBrandStockRoute_(b); } catch (e) { return { ok: false, code: e.code, error: e.message }; } };
  return { ctx, sheets, admin, pushes, files, call };
}
let pass = 0, fail = 0;
function t(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL', name, info !== undefined ? JSON.stringify(info) : ''); } }
const NK = 'narriskey0000000000000000000000a';
const col = (w, sku, h) => { const s = w.sheets['Product Database'], i = s.rows[0].indexOf(h); return s.rows.find(r => r[0] === sku)[i]; };
const editRow = w => w.sheets['Product Edits'].rows[w.sheets['Product Edits'].rows.length - 1];
const decide = (w, status, note) => { const sh = w.sheets['Product Edits'], row = sh.rows.length; if (note) sh.rows[row - 1][6] = note; sh.rows[row - 1][5] = status;
  w.ctx.bstOnEdit({ range: sh.getRange(row, 6) }); return sh.rows[row - 1]; };

// 1 สินค้ามีรูป/รายละเอียด/หมวด
{ const w = world(), r = w.call({ action: 'brandProducts', key: NK }), hb = r.products.find(p => p.name === 'Hobo Bag');
  t('images from admin Images tab', hb.images.length === 2 && hb.images[0].endsWith('/IMG1'), hb.images);
  t('description + form size', hb.description === 'กระเป๋าใช้ทุกวัน' && hb.size === 'กว้าง 30 ซม. (จากฟอร์ม)', hb);
  const sb = r.products.find(p => p.name === 'Soft Boston');
  t('no images → empty', Array.isArray(sb.images) && sb.images.length === 0);
  t('categories list', r.categories.indexOf('กระเป๋า') >= 0 && r.categories.indexOf('รองเท้า') >= 0);
  t('no review yet', hb.review === null); }
// 2 ส่งคำขอแก้: ชื่อ ราคา รายละเอียด รูป (ใหม่ 1 ลบ 1) สีใหม่ → Pending, แจ้งแอดมิน, ยังไม่แก้ชีต
{ const w = world();
  const r = w.call({ action: 'brandEdit', key: NK, clientRef: 'e1', product: 'Hobo Bag',
    changes: { name: 'Hobo Bag XL', price: 790, orig: 1690, description: 'ใบใหญ่ ใส่โน้ตบุ๊กได้', category: 'กระเป๋า' },
    photos: [{ url: 'https://lh3.googleusercontent.com/d/IMG2' }, { mime: 'image/jpeg', data: 'AAAA' }],
    newVariants: [{ color: 'ดำ', size: '', stock: 5 }], note: 'รุ่นใหม่' });
  t('edit ok', r.ok && r.requestId === 'PE-0001' && r.notified, r);
  const row = editRow(w);
  t('pending row', row[0] === 'PE-0001' && row[2] === 'Narris' && row[3] === 'Hobo Bag' && row[5] === 'Pending');
  t('changes text', /ชื่อสินค้า: Hobo Bag → Hobo Bag XL/.test(row[4]) && /ราคาขาย: 890 → 790/.test(row[4]) && /รูป: 2 → 2 รูป · ใหม่ 1 · ลบ 1/.test(row[4]) && /เพิ่มสี\/ไซซ์: ดำ · 5 ชิ้น/.test(row[4]) && !/ราคาเต็ม/.test(row[4]) && !/หมวด/.test(row[4]), row[4]);
  t('photo uploaded to drive', w.files.length === 1);
  t('admin notified', w.pushes.length === 1 && w.pushes[0].to === 'Cadmin' && /✏️ แบรนด์ขอแก้ข้อมูลสินค้า · Narris/.test(w.pushes[0].messages[0].text));
  t('sheet not changed yet', col(w, 'MRA078', 'Product Name') === 'Hobo Bag' && col(w, 'MRA078', 'Sale Price') === 890);
  const hb = r.products.find(p => p.name === 'Hobo Bag');
  t('review pending in view', hb.review && hb.review.status === 'Pending' && hb.review.id === 'PE-0001', hb.review);
  // อนุมัติ
  const done = decide(w, 'Approved');
  t('approved result', /อัปเดตแล้ว/.test(done[8]) && done[9] === 'Sent', done);
  t('name + price applied', col(w, 'MRA078', 'Product Name') === 'Hobo Bag XL' && col(w, 'MRA079', 'Sale Price') === 790 && Math.abs(col(w, 'MRA079', 'ลดไปกี่ %') - (1 - 790 / 1690)) < 1e-9);
  const nv = w.sheets['Product Database'].rows.find(r => r[0] === 'MRA124');
  t('new variant row', nv && nv[1] === 'Narris' && nv[2] === 'Hobo Bag XL' && nv[4] === 'ดำ' && nv[3] === '-' && nv[5] === 5 && nv[7] === 790 && nv[10] === 'ACTIVE' && nv[14] === 5 && nv[16] === 'Mera Seller', nv);
  const img = w.admin.Images.rows;
  t('images replaced under new key', img[1][1] === 'narris|hobo bag xl' && img[1][2] === 'https://lh3.googleusercontent.com/d/IMG2\nhttps://lh3.googleusercontent.com/d/NEW0', img[1]);
  t('color image key migrated', img[2][1] === 'narris|hobo bag xl|สีเงิน', img[2]);
  const det = w.admin['Product Details'].rows;
  t('details renamed + desc + form size kept', det.length === 2 && det[1][1] === 'Hobo Bag XL' && det[1][3] === 'ใบใหญ่ ใส่โน้ตบุ๊กได้' && det[1][2] === 'กว้าง 30 ซม. (จากฟอร์ม)', det[1]);
  t('new tag migrated', w.admin['New Tags'].rows[1][0] === 'narris|hobo bag xl');
  t('brand group notified', w.pushes.length === 2 && w.pushes[1].to === 'Cnarris' && /✅ ทีม Mera อนุมัติ/.test(w.pushes[1].messages[0].text));
  // เลือกซ้ำไม่ทำซ้ำ
  decide(w, 'Approved'); t('no double apply', w.pushes.length === 2 && !w.sheets['Product Database'].rows.find(r => r[0] === 'MRA125'));
  const v2 = w.call({ action: 'brandProducts', key: NK });
  t('view shows new name + approved', v2.products.some(p => p.name === 'Hobo Bag XL' && p.review && p.review.status === 'Approved' && p.variants.length === 3), v2.products.map(p => [p.name, p.review]));
}
// 3 ไม่ผ่าน → แจ้งแบรนด์พร้อมเหตุผล ชีตไม่เปลี่ยน
{ const w = world();
  w.call({ action: 'brandEdit', key: NK, clientRef: 'r1', product: 'Soft Boston', changes: { price: 100 } });
  const row = decide(w, 'Rejected', 'ราคาต่ำกว่าที่ตกลง');
  t('rejected', row[8] === 'ไม่ผ่าน' && col(w, 'MRA123', 'Sale Price') === 300 && /เหตุผล: ราคาต่ำกว่าที่ตกลง/.test(w.pushes[1].messages[0].text) && w.pushes[1].to === 'Cnarris');
  const v = w.call({ action: 'brandProducts', key: NK }).products.find(p => p.name === 'Soft Boston');
  t('view shows rejected + note', v.review.status === 'Rejected' && v.review.note === 'ราคาต่ำกว่าที่ตกลง'); }
// 4 คำขอใหม่แทนคำขอเดิมที่ยังรอ
{ const w = world();
  w.call({ action: 'brandEdit', key: NK, clientRef: 's1', product: 'Soft Boston', changes: { price: 250 } });
  w.call({ action: 'brandEdit', key: NK, clientRef: 's2', product: 'Soft Boston', changes: { price: 280 } });
  const rows = w.sheets['Product Edits'].rows;
  t('older superseded', rows[1][5] === 'Superseded' && rows[2][5] === 'Pending' && rows[2][0] === 'PE-0002'); }
// 5 ตรวจข้อมูล
{ const w = world();
  t('not yours', w.call({ action: 'brandEdit', key: NK, product: 'Ruby skirt', changes: { price: 1 } }).code === 'NOT_YOURS');
  t('no change', w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', changes: { price: 890, name: 'Hobo Bag' } }).code === 'BAD_EDIT');
  t('price > orig', /ไม่เกินราคาเต็ม/.test(w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', changes: { price: 2000 } }).error));
  t('empty name', /ใส่ชื่อสินค้า/.test(w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', changes: { name: '  ' } }).error));
  t('duplicate name', /มีสินค้าชื่อนี้อยู่แล้ว/.test(w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', changes: { name: 'soft boston' } }).error));
  t('no photos', /อย่างน้อย 1 รูป/.test(w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', photos: [] }).error));
  t('too many photos', /ไม่เกิน 5/.test(w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', photos: [1, 2, 3, 4, 5, 6].map(() => ({ mime: 'image/jpeg', data: 'A' })) }).error));
  t('foreign url rejected', /ไม่ตรงกับในระบบ/.test(w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', photos: [{ url: 'https://evil/x.jpg' }] }).error));
  t('bad mime', /JPG/.test(w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', photos: [{ mime: 'image/gif', data: 'A' }] }).error));
  t('dup variant', /มีสี\/ไซซ์/.test(w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', newVariants: [{ color: 'น้ำตาล', size: '-', stock: 1 }] }).error));
  t('same photos only → no change', w.call({ action: 'brandEdit', key: NK, product: 'Hobo Bag', photos: [{ url: 'https://lh3.googleusercontent.com/d/IMG1' }, { url: 'https://lh3.googleusercontent.com/d/IMG2' }] }).code === 'BAD_EDIT');
  const re = w.call({ action: 'brandEdit', key: NK, clientRef: 'o', product: 'Hobo Bag', photos: [{ url: 'https://lh3.googleusercontent.com/d/IMG2' }, { url: 'https://lh3.googleusercontent.com/d/IMG1' }] });
  t('reorder only', re.ok && /เรียงใหม่/.test(editRow(w)[4]));
  const again = w.call({ action: 'brandEdit', key: NK, clientRef: 'o', product: 'Hobo Bag', photos: [{ url: 'https://lh3.googleusercontent.com/d/IMG1' }] });
  t('duplicate clientRef', again.ok && again.duplicate && w.sheets['Product Edits'].rows.length === 2);
  t('drive link converted when no admin image', w.call({ action: 'brandProducts', key: NK }).products.length === 2); }
// 6 อนุมัติแต่สินค้าหายไปแล้ว → กลับเป็น Pending พร้อมข้อความ
{ const w = world(); w.call({ action: 'brandEdit', key: NK, clientRef: 'x', product: 'Soft Boston', changes: { price: 250 } });
  w.sheets['Product Database'].rows.find(r => r[0] === 'MRA123')[2] = 'Renamed by team';
  const row = decide(w, 'Approved');
  t('apply error → back to Pending', row[5] === 'Pending' && /ผิดพลาด/.test(row[8]), row);
  w.sheets['Product Database'].rows.find(r => r[0] === 'MRA123')[2] = 'Soft Boston';
  const row2 = decide(w, 'Approved');
  t('retry after fix applies', /อัปเดตแล้ว/.test(row2[8]) && col(w, 'MRA123', 'Sale Price') === 250, row2); }
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
