/* Mera – service worker
 * ทำให้ติดตั้งเป็นแอปได้ และเปิดเร็วขึ้น
 * - หน้าเว็บ: ดึงใหม่จากเน็ตทุกครั้ง (ใช้ของในเครื่องเฉพาะตอนไม่มีเน็ต)
 * - data/*.json (สินค้า ราคา สต็อก แบนเนอร์): ดึงใหม่ทุกครั้ง ใช้ของเดิมเฉพาะตอนไม่มีเน็ต
 * - assets/, img/, icons/: ชื่อไฟล์ตามเนื้อหา เก็บในเครื่องได้
 * - LINE / Apps Script / รูปจาก Google: ไม่แตะเลย
 */
const VERSION = 'mera-v1';
const STATIC = VERSION + '-static';
const PAGES = VERSION + '-pages';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.add('/')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req, cacheName, fallbackUrl) {
  return fetch(req).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(fallbackUrl || req, copy)).catch(() => {});
    }
    return res;
  }).catch(() =>
    caches.match(fallbackUrl || req).then((hit) => hit || caches.match('/'))
  );
}

function cacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(STATIC).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // LINE, Apps Script, Google images → ปล่อยผ่าน

  if (req.mode === 'navigate') {
    // หน้า admin และ staging ไม่เก็บ
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/staging')) return;
    // เก็บเป็น "/" ชุดเดียว (ตัด ?code=... ของ LINE ทิ้ง)
    const key = (url.pathname === '/' || url.pathname === '/index.html') ? '/' : url.pathname;
    e.respondWith(networkFirst(req, PAGES, key));
    return;
  }
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(networkFirst(req, PAGES, url.pathname));
    return;
  }
  if (/^\/(assets|img|icons)\//.test(url.pathname)) {
    e.respondWith(cacheFirst(req));
  }
});
