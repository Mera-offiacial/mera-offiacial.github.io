/**
 * Mera · ส่งข้อมูลสินค้าเป็นไฟล์ JSON ไปไว้บนเว็บ (GitHub Pages)
 * --------------------------------------------------------------
 * ทำไม: ตอนนี้ลูกค้าใหม่ต้องรอ Apps Script ตื่น 5–7 วินาทีก่อนเห็นข้อมูลล่าสุด
 * สคริปต์นี้ดึงข้อมูลชุดเดียวกับที่เว็บใช้ แล้วเก็บเป็นไฟล์ data/catalog.json
 * และ data/content.json ใน repo ของเว็บ เว็บจะอ่านไฟล์นี้ได้ในเสี้ยววินาที
 * (Apps Script ยังทำงานเหมือนเดิม เว็บยังดึงข้อมูลสดมาอัปเดตตามหลังเสมอ)
 *
 * วิธีติดตั้ง (ครั้งเดียว)
 * 1) เปิดโปรเจกต์ Apps Script ตัวไหนก็ได้ของ Mera → เพิ่มไฟล์ใหม่ วางโค้ดนี้
 * 2) Project Settings → Script properties เพิ่ม 2 ค่า
 *      GH_TOKEN = Fine-grained token ของ GitHub ที่ให้สิทธิ์ Contents: Read and write
 *                 เฉพาะ repo ของเว็บเท่านั้น
 *      GH_REPO  = ชื่อ repo เช่น  mera-official/meraofficial.co
 * 3) แก้ GH_BRANCH ด้านล่างให้ตรงกับ branch ที่ GitHub Pages ใช้ (ปกติ main)
 * 4) กด Run ฟังก์ชัน publishSnapshot หนึ่งครั้งเพื่ออนุญาตสิทธิ์และทดสอบ
 * 5) กด Run ฟังก์ชัน installTrigger หนึ่งครั้ง ระบบจะรันเองทุก 10 นาที
 *
 * หมายเหตุ
 * - บันทึกลง GitHub เฉพาะตอนข้อมูลเปลี่ยนจริง จึงไม่สร้าง commit ซ้ำ ๆ
 * - GitHub Pages สร้างเว็บใหม่หลัง commit ประมาณ 1 นาที
 */

const CATALOG_URL = 'https://script.google.com/macros/s/AKfycbyLpV_gCumuBu616iKD8eA7PvwiaHMRX21nY0ePnDGuh9YyQ_NJBfh46pgsf9IRhH1vQg/exec';
const CHECKOUT_URL = 'https://script.google.com/macros/s/AKfycbxjl814hxTjMaWNE0XYW9RSrfop63fTR6GYQlKcjGBxW4R4tlHPYxwJdTCUOEN8gW5Q/exec';
const GH_BRANCH = 'main';

function publishSnapshot() {
  const catalog = fetchJson_(CATALOG_URL, null);
  const content = fetchJson_(CHECKOUT_URL, { action: 'content' });

  const results = [];
  if (catalog) results.push(saveIfChanged_('data/catalog.json', catalog, 'updatedAt'));
  if (content && content.ok) results.push(saveIfChanged_('data/content.json', content, null));
  console.log(results.join(' | ') || 'ไม่มีข้อมูลให้บันทึก');
}

function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'publishSnapshot')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('publishSnapshot').timeBased().everyMinutes(10).create();
  console.log('ตั้งเวลาให้รันทุก 10 นาทีแล้ว');
}

/* ---------------- ส่วนช่วย ---------------- */

function fetchJson_(url, postBody) {
  const opt = { muteHttpExceptions: true, followRedirects: true };
  if (postBody) { opt.method = 'post'; opt.payload = JSON.stringify(postBody); opt.contentType = 'text/plain'; }
  const res = UrlFetchApp.fetch(url, opt);
  if (res.getResponseCode() !== 200) { console.warn('ดึงข้อมูลไม่สำเร็จ ' + res.getResponseCode() + ' ' + url); return null; }
  try { return JSON.parse(res.getContentText()); }
  catch (e) { console.warn('ข้อมูลไม่ใช่ JSON: ' + url); return null; }
}

// เทียบข้อมูลโดยไม่นับช่องเวลา (เช่น updatedAt) ที่เปลี่ยนทุกครั้งที่เรียก
function saveIfChanged_(path, data, ignoreKey) {
  const forHash = Object.assign({}, data);
  if (ignoreKey) delete forHash[ignoreKey];
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(forHash)));
  const props = PropertiesService.getScriptProperties();
  const key = 'hash:' + path;
  if (props.getProperty(key) === hash) return path + ' ไม่เปลี่ยน';

  const body = JSON.stringify(data);
  putGithubFile_(path, body, 'Update ' + path + ' from Sheet');
  props.setProperty(key, hash);
  return path + ' บันทึกแล้ว (' + Math.round(body.length / 1024) + ' KB)';
}

function putGithubFile_(path, text, message) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GH_TOKEN'), repo = props.getProperty('GH_REPO');
  if (!token || !repo) throw new Error('ยังไม่ได้ตั้ง GH_TOKEN หรือ GH_REPO ใน Script properties');
  const api = 'https://api.github.com/repos/' + repo + '/contents/' + path;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };

  // ต้องส่ง sha ของไฟล์เดิม (ถ้ามี) เพื่อเขียนทับ
  let sha;
  const cur = UrlFetchApp.fetch(api + '?ref=' + GH_BRANCH, { headers, muteHttpExceptions: true });
  if (cur.getResponseCode() === 200) sha = JSON.parse(cur.getContentText()).sha;

  const payload = { message, branch: GH_BRANCH, content: Utilities.base64Encode(text, Utilities.Charset.UTF_8) };
  if (sha) payload.sha = sha;
  const res = UrlFetchApp.fetch(api, { method: 'put', headers, contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('บันทึกลง GitHub ไม่สำเร็จ: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
}
