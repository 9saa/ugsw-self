/* ---------- single-file shell: tools and static pages ---------- */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var baseTitle = document.title;

  var toolView = $('toolView');
  var staticViews = { 'view-privacy': $('view-privacy'), 'view-terms': $('view-terms'), 'view-ai': $('view-ai') };
  var TOOL_TITLES = { yt: 'YouTube search', spotify: 'Spotify', proxy: 'Web proxy' };
  var STATIC_TITLES = { 'view-privacy': 'Privacy', 'view-terms': 'Terms', 'view-ai': 'AI chat' };

  var currentTool = '';

  /* ---------- shared ---------- */
  function anyOpen() {
    if (!toolView.hidden) return true;
    return Object.keys(staticViews).some(function (key) { return !staticViews[key].hidden; });
  }

  function syncLock() {
    root.classList.toggle('ugsw-locked', anyOpen());
  }

  function clearHash() {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
      try { location.hash = ''; } catch (e2) {}
    }
  }

  function broadcastTheme() {
    var theme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var frames = toolView.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try { frames[i].contentWindow.postMessage({ ugswTheme: theme }, '*'); } catch (e) {}
    }
  }

  function setTheme(theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', theme);
    var meta = $('themeColor');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#14130f' : '#f4f0e5');
    try { localStorage.setItem('ugsw:theme', theme); } catch (e) {}
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      button.setAttribute('title', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
    broadcastTheme();
  }

  /* ---------- tools ---------- */
  function closeTool() {
    if (toolView.hidden && !toolView.firstChild) {
      currentTool = '';
      return;
    }
    toolView.hidden = true;
    toolView.textContent = '';
    currentTool = '';
    syncLock();
  }

  function openTool(kind) {
    if (currentTool === kind && !toolView.hidden) return;
    Object.keys(staticViews).forEach(function (key) { staticViews[key].hidden = true; });
    toolView.textContent = '';
    var tpl = $('tpl-' + kind);
    if (!tpl) return;
    toolView.appendChild(tpl.content.cloneNode(true));
    currentTool = kind;
    toolView.hidden = false;
    document.title = (TOOL_TITLES[kind] || 'Tool') + ' — UGSW';
    syncLock();
    broadcastTheme();
  }

  /* ---------- static pages ---------- */
  function openStatic(key) {
    if (!staticViews[key]) return;
    closeTool();
    Object.keys(staticViews).forEach(function (name) { staticViews[name].hidden = name !== key; });
    staticViews[key].scrollTop = 0;
    document.title = (STATIC_TITLES[key] || 'Info') + ' — UGSW';
    syncLock();
    if (key === 'view-ai') {
      var chatInput = staticViews[key].querySelector('#chatInput');
      if (chatInput) setTimeout(function () {
        try { chatInput.focus({ preventScroll: true }); } catch (e) { try { chatInput.focus(); } catch (e2) {} }
      }, 0);
    }
  }

  function closeAll() {
    var hadTitle = document.title;
    closeTool();
    Object.keys(staticViews).forEach(function (key) { staticViews[key].hidden = true; });
    if (hadTitle !== baseTitle) document.title = baseTitle;
    syncLock();
  }

  /* ---------- routing ---------- */
  /* Games are not routed here: every catalogue entry links to
     ../games/<file>.html and opens in its own tab. */
  function route() {
    var hash = location.hash || '';
    if (hash === '#tool-yt' || hash === '#tool-spotify' || hash === '#tool-proxy') {
      openTool(hash.slice(6));
    } else if (hash === '#view-privacy' || hash === '#view-terms' || hash === '#view-ai') {
      openStatic(hash.slice(1));
    } else {
      closeAll();
    }
  }

  window.addEventListener('hashchange', route);

  /* ---------- theme + close plumbing ---------- */
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;

    if (target.closest('[data-theme-toggle]')) setTimeout(broadcastTheme, 0);

    if (target.closest('[data-ugsw-close]')) {
      event.preventDefault();
      closeAll();
      clearHash();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'Escape' || !anyOpen()) return;
    event.preventDefault();
    closeAll();
    clearHash();
  });

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg) return;
    if (msg.ugswRoute) {
      if (msg.ugswRoute === 'catalogue') {
        closeAll();
        clearHash();
      } else {
        location.hash = '#' + msg.ugswRoute;
      }
      return;
    }
    if (msg.ugswTheme) setTheme(msg.ugswTheme);
  });

  route();
})();
