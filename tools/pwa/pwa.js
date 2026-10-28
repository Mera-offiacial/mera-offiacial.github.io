/* Mera – ติดตั้งเป็นแอป (PWA)
 * 1) ลงทะเบียน service worker
 * 2) แบนเนอร์เล็ก "ติดตั้งแอป Mera" ด้านล่าง เฉพาะมือถือ
 *    - ไม่ขึ้นตอนเปิดเว็บทันที: รอให้ลูกค้าเลื่อนดูสินค้าก่อน หรือ 25 วินาที
 *    - ปิดแล้วไม่ขึ้นอีก 14 วัน · ติดตั้งแล้วไม่ขึ้นอีก
 *    - Android: ปุ่ม "ติดตั้ง" กดทีเดียว · iPhone: บอกวิธีกด แชร์ → เพิ่มไปยังหน้าจอโฮม
 *    - เปิดในแอป LINE/Facebook/IG: บอกให้เปิดในเบราว์เซอร์ก่อน
 */
(function () {
  'use strict';

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  var KEY = 'mera-pwa-hide-until';
  var SNOOZE_DAYS = 14;
  var ua = navigator.userAgent || '';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function lang() { var l = store('mera-lang') || document.documentElement.lang || 'th'; return /^en/i.test(l) ? 'en' : 'th'; }
  function T(th, en) { return lang() === 'en' ? en : th; }

  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var inApp = /\bLine\//i.test(ua) ? 'line' : (/FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly/i.test(ua) ? 'other' : '');
  var isLine = inApp === 'line';

  if (standalone) { store(KEY, String(Date.now() + 3650 * 864e5)); return; }
  if (!isIOS && !isAndroid) return; // คอมพิวเตอร์ไม่ต้องขึ้น
  if (/^\/(admin|staging|brand)/.test(location.pathname)) return;
  var until = Number(store(KEY) || 0);
  if (until && Date.now() < until) return;

  var deferred = null, shown = false, el = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', function () { store(KEY, String(Date.now() + 3650 * 864e5)); hide(); });

  var shareIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

  function css() {
    if (document.getElementById('mera-pwa-css')) return;
    var s = document.createElement('style');
    s.id = 'mera-pwa-css';
    s.textContent =
      '#mera-pwa{position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom));transform:translate(-50%,140%);' +
      'width:min(496px,calc(100vw - 24px));z-index:70;background:#fff;color:#2a0a14;border:1px solid #efe2d8;border-radius:18px;' +
      'box-shadow:0 12px 32px rgba(42,10,20,.22);padding:12px 12px 12px 14px;display:flex;gap:12px;align-items:center;' +
      'font:14px/1.4 Poppins,"Noto Sans Thai",system-ui,sans-serif;transition:transform .35s cubic-bezier(.2,.8,.2,1)}' +
      '#mera-pwa.on{transform:translate(-50%,0)}' +
      '#mera-pwa img{width:44px;height:44px;border-radius:11px;flex:none}' +
      '#mera-pwa .t{flex:1;min-width:0}#mera-pwa b{display:block;font-weight:600;color:#841132}' +
      '#mera-pwa small{display:block;font-size:12.5px;color:#8a6a72}' +
      '#mera-pwa .go{flex:none;border:0;border-radius:999px;background:#841132;color:#fff;font:600 13px Poppins,system-ui,sans-serif;padding:9px 16px;cursor:pointer}' +
      '#mera-pwa .x{flex:none;border:0;background:none;color:#8a6a72;font-size:20px;line-height:1;padding:6px;cursor:pointer;align-self:flex-start;margin:-6px -6px 0 0}';
    document.head.appendChild(s);
  }

  function hide(snooze) {
    if (snooze) store(KEY, String(Date.now() + SNOOZE_DAYS * 864e5));
    if (!el) return;
    el.classList.remove('on');
    var n = el; el = null;
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 400);
  }

  function openExternal() {
    var u = location.href.split('#')[0];
    u += (u.indexOf('?') < 0 ? '?' : '&') + 'openExternalBrowser=1';
    try { if (window.liff && liff.openWindow) { liff.openWindow({ url: location.origin + '/', external: true }); return; } } catch (e) {}
    location.href = u;
  }

  function show() {
    if (shown) return; shown = true;
    if (isAndroid && !deferred && !inApp) {
      // Chrome ยังไม่พร้อมให้ติดตั้ง (เช่น ติดตั้งไปแล้ว หรือเบราว์เซอร์ไม่รองรับ) → รออีกนิด
      setTimeout(function () { if (deferred) { shown = false; show(); } }, 8000);
      return;
    }
    css();
    var title = T('ติดตั้งแอป Mera', 'Get the Mera app');
    var sub, btn = '';
    if (inApp) {
      sub = isLine
        ? T('เปิดในเบราว์เซอร์ก่อน แล้วเพิ่มไอคอน Mera ไว้บนหน้าจอ', 'Open in your browser first, then add Mera to your home screen')
        : T('กด ⋯ แล้วเลือก "เปิดในเบราว์เซอร์" เพื่อติดตั้ง', 'Tap ⋯ and choose "Open in browser" to install');
      if (isLine) btn = '<button class="go" data-a="ext">' + T('เปิดเบราว์เซอร์', 'Open browser') + '</button>';
    } else if (isIOS) {
      sub = T('กด ', 'Tap ') + shareIcon + T(' แชร์ แล้วเลือก "เพิ่มไปยังหน้าจอโฮม"', ' Share, then "Add to Home Screen"');
    } else {
      sub = T('มีไอคอนบนหน้าจอ เปิดดูดีลได้ไวกว่าเดิม', 'One tap from your home screen to the latest deals');
      btn = '<button class="go" data-a="install">' + T('ติดตั้ง', 'Install') + '</button>';
    }
    el = document.createElement('div');
    el.id = 'mera-pwa';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title);
    el.innerHTML = '<img src="/icons/icon-192.png" alt="">' +
      '<div class="t"><b>' + title + '</b><small>' + sub + '</small></div>' + btn +
      '<button class="x" data-a="close" aria-label="' + T('ปิด', 'Close') + '">×</button>';
    el.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-a]');
      if (!a) return;
      var act = a.getAttribute('data-a');
      if (act === 'close') hide(true);
      else if (act === 'ext') openExternal();
      else if (act === 'install' && deferred) {
        deferred.prompt();
        deferred.userChoice.then(function (r) { hide(r && r.outcome !== 'accepted'); deferred = null; }).catch(function () { hide(true); });
      }
    });
    document.body.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (el) el.classList.add('on'); }); });
  }

  // รอให้ลูกค้าเริ่มดูสินค้าก่อน: เลื่อนหน้าลงพอสมควร หรือผ่านไป 25 วินาที
  var timer = setTimeout(show, 25000);
  function onScroll() {
    if ((window.scrollY || document.documentElement.scrollTop) > window.innerHeight * 1.2) {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
      setTimeout(show, 1200);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();
