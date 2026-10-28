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

/* =====================================================================
 * LINE ในโหมดแอป (เปิดจากไอคอนบนหน้าจอ)
 *
 * ปัญหา: ในแอปที่ติดตั้งจากเว็บ การล็อกอิน LINE ต้องออกไปหน้า LINE แล้ว "ไม่กลับมาที่แอป"
 * (iPhone เปิดต่อใน Safari/LINE ซึ่งเก็บข้อมูลแยกกับแอป) → ค้าง ต้องรีเฟรช และดูออเดอร์ไม่ได้
 *
 * ทางแก้: ในโหมดแอป ไม่พาไปหน้าล็อกอินอีก แต่เปิดเรื่องนั้นต่อใน "แอป LINE" (LIFF)
 * ซึ่งยืนยันตัวตนให้อัตโนมัติ ไม่ต้องล็อกอิน
 *   - ออเดอร์ของฉัน → เปิดหน้าออเดอร์ใน LINE
 *   - ซื้อ / ตะกร้า / จองดีล → เปิดใน LINE พร้อมสินค้าที่เลือกไว้ ทำต่อได้ทันที
 * เปิดผ่านลิงก์ปกติ (Safari, Chrome, LINE) ทำงานเหมือนเดิมทุกอย่าง
 * ===================================================================== */
(function () {
  'use strict';
  var LIFF_ID = '2011928469-icqhLzdN';
  var qs = new URLSearchParams(location.search);

  function T(th, en) { var l = ''; try { l = localStorage.getItem('mera-lang') || ''; } catch (e) {} return /^en/i.test(l) ? en : th; }
  function cleanUrl(keys) {
    try {
      var u = new URL(location.href); keys.forEach(function (k) { u.searchParams.delete(k); });
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  // --- 1) ขากลับ: เปิดใน LINE พร้อมสินค้าที่เลือก (?mc=...) → ให้ระบบสั่งซื้อทำต่อเอง
  //     (ต้องรันก่อน checkout.js จึงโหลดไฟล์นี้แบบไม่ defer)
  var mc = qs.get('mc');
  if (mc) {
    try { JSON.parse(mc); sessionStorage.setItem('mc_resume', mc); } catch (e) {}
    cleanUrl(['mc']);
  }
  var wantOrders = qs.get('mera') === 'orders';
  if (wantOrders) cleanUrl(['mera']);

  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
  }
  function token() { try { return window.liff && liff.getIDToken && liff.getIDToken(); } catch (e) { return ''; } }

  if (wantOrders) whenReady(function () {
    var n = 0;
    (function wait() {
      if (window.MeraCheckout && (token() || n > 40)) return window.MeraCheckout.openOrders();
      n++; setTimeout(wait, 250);
    })();
  });

  // --- 2) โหมดแอปเท่านั้น
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (!standalone) return;

  var intent = { kind: 'home' };   // ลูกค้ากำลังจะทำอะไร (ใช้สร้างลิงก์เปิดใน LINE)

  function lineUrl() {
    var q = '';
    if (intent.kind === 'orders') q = '?mera=orders';
    else if (intent.kind === 'order' && intent.id) q = '?order=' + encodeURIComponent(intent.id);
    else if (intent.kind === 'checkout' || intent.kind === 'deal') {
      var items = (intent.items || []).map(function (x) { var o = {}; for (var k in x) if (k !== 'img') o[k] = x[k]; return o; });
      var s = JSON.stringify({ cart: !!intent.cart, items: items, deal: intent.deal || '' });
      if (s.length < 6000) q = '?mc=' + encodeURIComponent(s);
    }
    return 'https://liff.line.me/' + LIFF_ID + q;
  }

  var LINE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 3.5C6.8 3.5 2.6 6.9 2.6 11.1c0 3.7 3.3 6.9 7.8 7.5.3.1.7.2.8.5.1.2.1.6 0 .9l-.1.8c0 .2-.2.9.8.5s5.5-3.3 7.5-5.6c1.4-1.5 2-3 2-4.6 0-4.2-4.2-7.6-9.4-7.6z"/></svg>';
  var sheet = null;

  function css() {
    if (document.getElementById('mera-line-css')) return;
    var s = document.createElement('style'); s.id = 'mera-line-css';
    s.textContent =
      '#mera-line{position:fixed;inset:0;z-index:10001;display:flex;align-items:flex-end;justify-content:center;background:rgba(42,10,20,.45);opacity:0;transition:opacity .2s}' +
      '#mera-line.on{opacity:1}' +
      '#mera-line .s{width:100%;max-width:520px;background:#FFFBED;border-radius:24px 24px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;' +
      'font:14px/1.5 Poppins,Prompt,system-ui,sans-serif;color:#2a0a14;transform:translateY(30px);transition:transform .25s}' +
      '#mera-line.on .s{transform:none}' +
      '#mera-line img{width:56px;height:56px;border-radius:14px;align-self:center}' +
      '#mera-line h2{margin:0;font-size:18px;font-weight:600;text-align:center;color:#841132}' +
      '#mera-line p{margin:0 0 4px;text-align:center;color:#5e2a37;font-size:14px}' +
      '#mera-line .go{display:flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;background:#06C755;color:#fff;font-weight:700;font-size:15px;min-height:50px;text-decoration:none}' +
      '#mera-line .no{border:0;background:none;color:#841132;font:600 14px Poppins,Prompt,system-ui,sans-serif;min-height:44px;cursor:pointer}';
    document.head.appendChild(s);
  }

  function closeSheet() {
    if (!sheet) return;
    var n = sheet; sheet = null; n.classList.remove('on');
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 250);
  }

  function openSheet() {
    if (sheet) return;
    css();
    var title, text, btn;
    if (intent.kind === 'orders' || intent.kind === 'order') {
      title = T('ดูออเดอร์ใน LINE', 'View orders in LINE');
      text = T('ออเดอร์ผูกกับบัญชี LINE ของคุณ<br>เปิดใน LINE ได้เลย ไม่ต้องล็อกอิน', 'Your orders are linked to your LINE account. Open in LINE to see them, no sign-in needed.');
      btn = T('เปิดออเดอร์ใน LINE', 'Open orders in LINE');
    } else if (intent.kind === 'checkout' || intent.kind === 'deal') {
      title = T('สั่งซื้อต่อใน LINE', 'Continue in LINE');
      text = T('LINE ยืนยันตัวตนให้อัตโนมัติ<br>สินค้าที่เลือกไว้จะรออยู่ในหน้าสั่งซื้อ', 'LINE signs you in automatically. Your selected items will be waiting at checkout.');
      btn = T('สั่งซื้อต่อใน LINE', 'Continue in LINE');
    } else {
      title = T('เข้าสู่ระบบด้วย LINE', 'Sign in with LINE');
      text = T('เปิด Mera ใน LINE เพื่อเข้าสู่ระบบอัตโนมัติ', 'Open Mera in LINE to sign in automatically.');
      btn = T('เปิดใน LINE', 'Open in LINE');
    }
    sheet = document.createElement('div');
    sheet.id = 'mera-line';
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', title);
    sheet.innerHTML = '<div class="s"><img src="/icons/icon-192.png" alt=""><h2>' + title + '</h2><p>' + text + '</p>' +
      '<a class="go" href="' + lineUrl() + '">' + LINE_SVG + btn + '</a>' +
      '<button class="no" type="button">' + T('ไว้ทีหลัง', 'Not now') + '</button></div>';
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || (e.target.closest && e.target.closest('.no'))) {
        closeSheet();
        try { if (window.MeraCheckout && window.MeraCheckout.close) window.MeraCheckout.close(); } catch (er) {}
      } else if (e.target.closest && e.target.closest('.go')) {
        setTimeout(closeSheet, 800);
        try { if (window.MeraCheckout && window.MeraCheckout.close) window.MeraCheckout.close(); } catch (er) {}
      }
    });
    document.body.appendChild(sheet);
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (sheet) sheet.classList.add('on'); }); });
  }

  // liff.login() ในโหมดแอป → แสดงหน้าต่าง "เปิดใน LINE" แทนการออกไปหน้าล็อกอิน
  function patchLiff() {
    var l = window.liff;
    if (!l || !l.login || l.__meraPatched) return !!(l && l.__meraPatched);
    l.login = function () {
      try { var r = JSON.parse(sessionStorage.getItem('mc_resume') || 'null'); sessionStorage.removeItem('mc_resume');
        if (r && (r.items && r.items.length || r.deal)) intent = { kind: r.deal ? 'deal' : 'checkout', items: r.items, cart: r.cart, deal: r.deal };
      } catch (e) {}
      openSheet();
    };
    l.__meraPatched = true;
    return true;
  }
  (function poll(n) { if (!patchLiff() && n < 600) setTimeout(function () { poll(n + 1); }, 100); })(0);

  function notLoggedIn() {
    try { return !!(window.liff && liff.isLoggedIn && !liff.isLoggedIn() && !token()); } catch (e) { return false; }
  }

  // จำว่าลูกค้ากดอะไร และถ้ารู้แล้วว่ายังไม่ล็อกอิน เปิดหน้าต่าง LINE ทันที (ไม่ต้องรอหมุน 5 วินาที)
  whenReady(function () {
    var MC = window.MeraCheckout; if (!MC) return;
    function wrap(name, mk, guard) {
      var orig = MC[name]; if (typeof orig !== 'function') return;
      MC[name] = function () {
        var args = arguments, it = mk.apply(null, args);
        if (it) intent = it;
        if (it && (!guard || guard.apply(null, args)) && notLoggedIn()) { openSheet(); return; }
        return orig.apply(this, args);
      };
    }
    wrap('openOrders', function () { return { kind: 'orders' }; });
    wrap('openOrder', function (id) { return { kind: 'order', id: id }; });
    wrap('open', function (item) { return { kind: 'checkout', items: item ? [item] : [], cart: false }; });
    wrap('openCart', function (items) {
      var cart = items; if (!Array.isArray(cart)) { try { cart = JSON.parse(localStorage.getItem('mera_cart_v1') || '[]'); } catch (e) { cart = []; } }
      return { kind: 'checkout', items: cart, cart: true };
    });
    wrap('add', function (item, opts) { return opts && opts.open === false ? null : { kind: 'checkout', items: item ? [item] : [], cart: true }; });
    wrap('requireMember', function (onReady, dealUrl) { return { kind: 'deal', deal: dealUrl || '', items: [] }; });
  });
})();
