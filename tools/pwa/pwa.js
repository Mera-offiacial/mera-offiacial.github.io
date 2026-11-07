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
 * LINE ในโหมดแอป (เปิดจากไอคอนบนหน้าจอ) — เชื่อม LINE ครั้งเดียว แล้วจำไว้
 *
 * ปัญหาเดิม: ในแอปที่ติดตั้งจากเว็บ การล็อกอิน LINE ต้องออกไปหน้า LINE แล้ว "ไม่กลับมาที่แอป"
 * (iPhone เปิดต่อใน Safari/LINE ซึ่งเก็บข้อมูลแยกกับแอป) → เดิมต้องเปิดใน LINE ทุกครั้ง
 *
 * ตอนนี้: ครั้งแรกกด "เชื่อม LINE" → ยืนยันในแอป LINE 1 ครั้ง → กลับมาที่แอป Mera
 * แอปได้ "บัตรผ่าน" (Apps Script Inventory + GB ออกให้ action appPairLink / appPairPoll)
 * เก็บไว้ในเครื่อง แล้วใช้แทน token ของ LINE ไปจนหมดอายุ (APP_SESSION_DAYS, ค่าเริ่มต้น 180 วัน)
 * ไม่ต้องแก้ app.js / checkout.js: ไฟล์นี้ปรับ liff.isLoggedIn / getIDToken / getProfile ให้ใช้บัตรผ่าน
 *
 * ขาในแอป LINE: เปิด liff.line.me/<LIFF>?pair=<รหัส> → ลูกค้ากด "เชื่อมเลย" → appPairLink
 * เปิดผ่านลิงก์ปกติ (Safari, Chrome, LINE) ทำงานเหมือนเดิมทุกอย่าง
 * ===================================================================== */
(function () {
  'use strict';
  var LIFF_ID = '2011928469-icqhLzdN';
  var SES_KEY = 'mera-app-session';
  var PAIR_KEY = 'mera-app-pair';
  var qs = new URLSearchParams(location.search);

  function T(th, en) { var l = ''; try { l = localStorage.getItem('mera-lang') || ''; } catch (e) {} return /^en/i.test(l) ? en : th; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cleanUrl(keys) {
    try {
      var u = new URL(location.href); keys.forEach(function (k) { u.searchParams.delete(k); });
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  function apiUrl() { return (window.MERA_CHECKOUT && window.MERA_CHECKOUT.api) || ''; }
  function post(body) {
    // text/plain → ไม่ต้องมี preflight (เหมือน checkout.js)
    return fetch(apiUrl(), { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
  }
  function lineToken() { try { return window.liff && liff.getIDToken && liff.getIDToken(); } catch (e) { return ''; } }

  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  // ---------- บัตรผ่านของแอป (เก็บในเครื่อง) ----------
  function readSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SES_KEY) || 'null');
      if (s && s.token && Number(s.exp) > Date.now() + 60000) return s;
      if (s) localStorage.removeItem(SES_KEY);
    } catch (e) {}
    return null;
  }
  function writeSession(s) { try { localStorage.setItem(SES_KEY, JSON.stringify(s)); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem(SES_KEY); } catch (e) {} }
  var session = standalone ? readSession() : null;

  // --- 1) ขากลับ: เปิดใน LINE พร้อมสินค้าที่เลือก (?mc=...) → ให้ระบบสั่งซื้อทำต่อเอง
  //     (ต้องรันก่อน checkout.js จึงโหลดไฟล์นี้แบบไม่ defer)
  var mc = qs.get('mc');
  if (mc) {
    try { JSON.parse(mc); sessionStorage.setItem('mc_resume', mc); } catch (e) {}
    cleanUrl(['mc']);
  }
  var wantOrders = qs.get('mera') === 'orders';
  if (wantOrders) cleanUrl(['mera']);
  function token() { return (session && session.token) || lineToken(); }

  if (wantOrders) whenReady(function () {
    var n = 0;
    (function wait() {
      if (window.MeraCheckout && (token() || n > 40)) return window.MeraCheckout.openOrders();
      n++; setTimeout(wait, 250);
    })();
  });

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
      '#mera-line .go{display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;background:#06C755;color:#fff;font:700 15px Poppins,Prompt,system-ui,sans-serif;min-height:50px;text-decoration:none;cursor:pointer}' +
      '#mera-line .go[disabled]{opacity:.6}' +
      '#mera-line .no{border:0;background:none;color:#841132;font:600 14px Poppins,Prompt,system-ui,sans-serif;min-height:44px;cursor:pointer}' +
      '#mera-line .spin{width:26px;height:26px;border:3px solid #f0d9c9;border-top-color:#841132;border-radius:50%;align-self:center;animation:meraspin 0.9s linear infinite}' +
      '@keyframes meraspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

  function closeSheet() {
    if (!sheet) return;
    var n = sheet; sheet = null; n.classList.remove('on');
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 250);
  }

  function showSheet(html, onClick) {
    css();
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'mera-line';
      sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
      document.body.appendChild(sheet);
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (sheet) sheet.classList.add('on'); }); });
    }
    sheet.innerHTML = '<div class="s"><img src="/icons/icon-192.png" alt="">' + html + '</div>';
    sheet.onclick = function (e) { onClick(e, e.target.closest && e.target.closest('[data-a]')); };
  }

  /* =================================================================
   * ขา A: ในแอป LINE / เบราว์เซอร์ (ไม่ใช่โหมดแอป) — ลูกค้ายืนยันการเชื่อม
   * ================================================================= */
  var pairCode = qs.get('pair');
  if (!standalone && pairCode) {
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(pairCode)) return;
    whenReady(function () {
      var n = 0;
      (function wait() {
        var l = window.liff, tok = lineToken();
        if (tok) return confirmPair(tok);
        n++;
        // รอ app.js เปิด LIFF ~15 วินาที · ถ้ายังไม่ล็อกอิน (เปิดนอกแอป LINE) → ล็อกอิน LINE แล้วกลับมาที่ลิงก์นี้
        if (n > 60) {
          try { if (l && l.isLoggedIn && !l.isLoggedIn()) return l.login({ redirectUri: location.origin + '/?pair=' + encodeURIComponent(pairCode) }); } catch (e) {}
          return;
        }
        setTimeout(wait, 250);
      })();
    });
    return;
  }

  function confirmPair(tok) {
    function ask(err) {
      showSheet(
        '<h2>' + T('เชื่อมแอป Mera กับ LINE นี้', 'Connect the Mera app to this LINE') + '</h2>' +
        '<p>' + T('ใช้เมื่อคุณกด "เชื่อม LINE" จากแอป Mera บนมือถือของคุณเอง<br>ถ้าไม่ได้กดเอง ให้กด "ยกเลิก"', 'Only continue if you tapped "Connect LINE" in your own Mera app.<br>If not, tap "Cancel".') + '</p>' +
        (err ? '<p style="color:#b3261e">' + esc(err) + '</p>' : '') +
        '<button class="go" data-a="ok" type="button">' + LINE_SVG + T('เชื่อมเลย', 'Connect') + '</button>' +
        '<button class="no" data-a="no" type="button">' + T('ยกเลิก', 'Cancel') + '</button>',
        function (e, a) {
          var act = a && a.getAttribute('data-a');
          if (act === 'no' || e.target === sheet) return closeSheet();
          if (act !== 'ok') return;
          a.disabled = true;
          post({ action: 'appPairLink', idToken: lineToken() || tok, code: pairCode }).then(function (r) {
            if (r && r.ok) done(); else ask((r && r.error) || T('เชื่อมไม่สำเร็จ ลองใหม่อีกครั้ง', 'Could not connect. Please try again.'));
          }).catch(function () { ask(T('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', 'Network error. Please try again.')); });
        });
    }
    function done() {
      cleanUrl(['pair']);
      showSheet(
        '<h2>' + T('เชื่อมเรียบร้อยแล้ว ✓', 'Connected ✓') + '</h2>' +
        '<p>' + T('กลับไปที่แอป Mera ได้เลย<br>ครั้งต่อไปสั่งซื้อและดูออเดอร์ในแอปได้ทันที', 'Go back to the Mera app.<br>From now on you can order and see your orders right there.') + '</p>' +
        '<button class="no" data-a="close" type="button">' + T('ปิด', 'Close') + '</button>',
        function (e, a) {
          if ((a && a.getAttribute('data-a') === 'close') || e.target === sheet) {
            closeSheet();
            try { if (window.liff && liff.isInClient && liff.isInClient() && liff.closeWindow) liff.closeWindow(); } catch (er) {}
          }
        });
    }
    ask('');
  }

  // ---------- ที่เหลือเฉพาะโหมดแอป ----------
  if (!standalone) return;

  // --- ปรับ liff ให้ใช้บัตรผ่านของแอป (app.js / checkout.js เห็นเหมือนล็อกอิน LINE แล้ว)
  var intent = { kind: 'home' };   // ลูกค้ากำลังจะทำอะไร (ใช้ทำต่อหลังเชื่อมเสร็จ)
  function decoded() { return { sub: session.sub, name: session.name || '', picture: session.picture || '' }; }
  function patchLiff(l) {
    if (!l || typeof l !== 'object' || l.__meraApp) return;
    var orig = {};
    ['isLoggedIn', 'getIDToken', 'getDecodedIDToken', 'getProfile', 'logout', 'login'].forEach(function (k) { orig[k] = l[k]; });
    l.isLoggedIn = function () { return !!session || (orig.isLoggedIn ? orig.isLoggedIn.apply(l, arguments) : false); };
    l.getIDToken = function () { return session ? session.token : (orig.getIDToken ? orig.getIDToken.apply(l, arguments) : null); };
    l.getDecodedIDToken = function () { return session ? decoded() : (orig.getDecodedIDToken ? orig.getDecodedIDToken.apply(l, arguments) : null); };
    l.getProfile = function () {
      if (session) return Promise.resolve({ userId: session.sub, displayName: session.name || '', pictureUrl: session.picture || '' });
      return orig.getProfile ? orig.getProfile.apply(l, arguments) : Promise.reject(new Error('no profile'));
    };
    l.logout = function () { session = null; clearSession(); try { return orig.logout && orig.logout.apply(l, arguments); } catch (e) {} };
    // liff.login() ในโหมดแอป → หน้าต่าง "เชื่อม LINE" แทนการออกไปหน้าล็อกอิน
    l.login = function () {
      try { var r = JSON.parse(sessionStorage.getItem('mc_resume') || 'null'); sessionStorage.removeItem('mc_resume');
        if (r && (r.items && r.items.length || r.deal)) intent = { kind: r.deal ? 'deal' : 'checkout', items: r.items, cart: r.cart, deal: r.deal };
      } catch (e) {}
      if (session) { session = null; clearSession(); }   // ระบบขอให้ล็อกอินใหม่ = บัตรผ่านใช้ไม่ได้แล้ว
      openPair();
    };
    l.__meraApp = true;
  }
  // checkout.js ขอ token ผ่านตัวนี้ (ใช้ได้ทันที แม้ LINE SDK ยังโหลดไม่เสร็จ)
  try {
    window.MERA_CHECKOUT = window.MERA_CHECKOUT || {};
    window.MERA_CHECKOUT.getIdToken = function () { return session ? session.token : lineToken(); };
  } catch (e) {}
  // จับ window.liff ทันทีที่ SDK โหลด (ก่อน app.js เรียก liff.init)
  (function hook() {
    var cur = window.liff;
    try {
      Object.defineProperty(window, 'liff', {
        configurable: true, enumerable: true,
        get: function () { return cur; },
        set: function (v) { cur = v; patchLiff(v); },
      });
    } catch (e) {}
    if (cur) patchLiff(cur);
    (function poll(n) { patchLiff(window.liff); if (n < 600) setTimeout(function () { poll(n + 1); }, 100); })(0);
  })();

  // ระบบตอบว่าบัตรผ่านใช้ไม่ได้ (หมดอายุ / ถูกยกเลิก) → ลบทิ้ง แล้วให้เชื่อมใหม่ครั้งหน้า
  (function watchFetch() {
    var f = window.fetch; if (!f) return;
    window.fetch = function (input, init) {
      var p = f.apply(this, arguments);
      try {
        var body = init && typeof init.body === 'string' ? init.body : '';
        if (session && body.indexOf(session.token) >= 0) {
          p.then(function (res) {
            res.clone().json().then(function (j) {
              if (j && j.ok === false && (j.code === 'AUTH' || j.error === 'login_expired')) { session = null; clearSession(); }
            }).catch(function () {});
          }).catch(function () {});
        }
      } catch (e) {}
      return p;
    };
  })();

  // --- หน้าต่าง "เชื่อม LINE ครั้งเดียว" + รอผลจากแอป LINE
  function randomCode() {
    var a = new Uint8Array(24);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function readPair() {
    try { var p = JSON.parse(localStorage.getItem(PAIR_KEY) || 'null'); if (p && p.code && Date.now() - p.at < 9 * 60000) return p; } catch (e) {}
    return null;
  }
  function savePair(p) { try { if (p) localStorage.setItem(PAIR_KEY, JSON.stringify(p)); else localStorage.removeItem(PAIR_KEY); } catch (e) {} }

  var polling = null;
  function startPolling(p) {
    if (polling) return;
    var busy = false;
    polling = setInterval(function () {
      if (document.hidden || busy) return;
      if (Date.now() - p.at > 10 * 60000) { stopPolling(); savePair(null); if (sheet) openPair(); return; }
      busy = true;
      post({ action: 'appPairPoll', code: p.code }).then(function (r) {
        busy = false;
        if (r && r.ok && r.token) paired(r, p);
      }).catch(function () { busy = false; });
    }, 2000);
  }
  function stopPolling() { if (polling) { clearInterval(polling); polling = null; } }

  function paired(r, p) {
    stopPolling(); savePair(null);
    session = { token: r.token, exp: r.exp, sub: r.sub, name: r.name || '', picture: r.picture || '' };
    writeSession(session);
    showSheet('<h2>' + T('เชื่อม LINE เรียบร้อย ✓', 'LINE connected ✓') + '</h2><p>' + T('ครั้งต่อไปไม่ต้องเชื่อมอีก', 'You will stay signed in.') + '</p>', function () {});
    // โหลดหน้าใหม่ให้ทุกส่วนเห็นว่าล็อกอินแล้ว แล้วทำต่อจากที่ลูกค้ากดไว้
    var it = p.intent || { kind: 'home' }, q = '';
    if (it.kind === 'orders') q = '?mera=orders';
    else if (it.kind === 'order' && it.id) q = '?order=' + encodeURIComponent(it.id);
    else if ((it.kind === 'checkout' || it.kind === 'deal') && ((it.items && it.items.length) || it.deal)) {
      var s = JSON.stringify({ cart: !!it.cart, items: it.items || [], deal: it.deal || '' });
      if (s.length < 6000) q = '?mc=' + encodeURIComponent(s);
    }
    setTimeout(function () { location.replace(location.pathname + q); }, 900);
  }

  function slimIntent(it) {
    var o = { kind: it.kind, id: it.id, cart: it.cart, deal: it.deal };
    o.items = (it.items || []).map(function (x) { var y = {}; for (var k in x) if (k !== 'img') y[k] = x[k]; return y; });
    return o;
  }

  function openPair() {
    var p = readPair();
    if (!p) { p = { code: randomCode(), at: Date.now(), intent: slimIntent(intent) }; savePair(p); }
    else { p.intent = slimIntent(intent); savePair(p); }
    var link = 'https://liff.line.me/' + LIFF_ID + '?pair=' + encodeURIComponent(p.code);
    var waiting = !!p.opened;
    showSheet(
      '<h2>' + T('เชื่อม LINE ครั้งเดียว', 'Connect LINE once') + '</h2>' +
      (waiting
        ? '<div class="spin" aria-hidden="true"></div><p>' + T('กด "เชื่อมเลย" ในแอป LINE<br>แล้วกลับมาที่แอปนี้ ระบบจะไปต่อให้เอง', 'Tap "Connect" in LINE,<br>then come back here — we will continue automatically.') + '</p>'
        : '<p>' + T('ยืนยันในแอป LINE 1 ครั้ง แล้วกลับมาที่แอปนี้<br>ครั้งต่อไปสั่งซื้อและดูออเดอร์ได้เลย ไม่ต้องเชื่อมอีก', 'Confirm once in the LINE app, then come back here.<br>After that you can order and see your orders without signing in again.') + '</p>') +
      '<a class="go" data-a="go" href="' + link + '">' + LINE_SVG + (waiting ? T('เปิด LINE อีกครั้ง', 'Open LINE again') : T('เชื่อม LINE', 'Connect LINE')) + '</a>' +
      '<button class="no" data-a="no" type="button">' + T('ไว้ทีหลัง', 'Not now') + '</button>',
      function (e, a) {
        var act = a && a.getAttribute('data-a');
        if (act === 'no' || e.target === sheet) {
          stopPolling(); closeSheet();
          try { if (window.MeraCheckout && window.MeraCheckout.close) window.MeraCheckout.close(); } catch (er) {}
        } else if (act === 'go') {
          p.opened = true; savePair(p); startPolling(p);
          setTimeout(function () { if (sheet && !session) openPair(); }, 600);   // เปลี่ยนเป็นหน้าจอ "รอยืนยัน"
        }
      });
    if (waiting) startPolling(p);
  }

  // เปิดแอปกลับมาระหว่างรอ (เช่น iPhone ปิดแอปไปแล้ว) → ถามผลต่อ
  (function resume() {
    var p = readPair();
    if (!session && p && p.opened) whenReady(function () { intent = p.intent || intent; openPair(); });
  })();
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !session) { var p = readPair(); if (p && p.opened && !polling && sheet) startPolling(p); }
  });

  // จำว่าลูกค้ากดอะไร และถ้ายังไม่ได้เชื่อม LINE เปิดหน้าต่างเชื่อมทันที (ไม่ต้องรอหมุน 5 วินาที)
  function notLoggedIn() { return !session && !lineToken(); }
  whenReady(function () {
    var MC = window.MeraCheckout; if (!MC) return;
    function wrap(name, mk) {
      var orig = MC[name]; if (typeof orig !== 'function') return;
      MC[name] = function () {
        var args = arguments, it = mk.apply(null, args);
        if (it) intent = it;
        if (it && notLoggedIn()) { openPair(); return; }
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
