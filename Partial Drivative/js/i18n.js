/* ==========================================================================
   i18n.js — 双语切换 / bilingual switch
   The static prose uses <span data-lang="zh|en"> pairs in the HTML and is
   toggled by a class on <body>.  This module holds the runtime language and
   lets JS-built widgets re-render themselves on change.
   ========================================================================== */
window.DC = window.DC || {};
(function (D) {
  'use strict';

  /* surface any runtime error into the page title (headless debugging aid) */
  window.addEventListener('error', function (e) {
    var where = (e.filename || '').split('/').pop();
    document.title = 'ERR ' + (e.message || 'error') + ' @ ' + where + ':' + e.lineno;
    var pre = document.getElementById('selftest');
    if (pre) pre.textContent += '\nERROR ' + (e.message || '') + ' @ ' + where + ':' + e.lineno;
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var msg = r && (r.message || r);
    document.title = 'REJ ' + msg;
    var pre = document.getElementById('selftest');
    if (pre) pre.textContent += '\nREJECTED ' + msg;
  });

  var KEY = 'pd.lang.v1';
  var lang = 'zh';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'zh') lang = saved;
  } catch (e) { /* private mode */ }

  var listeners = [];

  var api = {
    get lang() { return lang; },
    get isZh() { return lang === 'zh'; },
    /* pick the string for the active language */
    t: function (zh, en) { return lang === 'zh' ? zh : en; },
    onChange: function (fn) { listeners.push(fn); },
    set: function (next) {
      if (next !== 'zh' && next !== 'en') return;
      lang = next;
      try { localStorage.setItem(KEY, lang); } catch (e) {}
      api.paint();
      for (var i = 0; i < listeners.length; i++) { listeners[i](lang); }
    },
    toggle: function () { api.set(lang === 'zh' ? 'en' : 'zh'); },
    paint: function () {
      document.body.className = 'lang-' + lang;
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
      var btn = document.getElementById('langBtn');
      if (btn) {
        btn.querySelector('.btn__caps').textContent = lang === 'zh' ? 'EN' : '中文';
        btn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
      }
    }
  };

  D.i18n = api;
  api.paint();
})(window.DC);
