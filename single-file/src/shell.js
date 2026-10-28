/* ---------- single-file shell: player, tools, static pages ---------- */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var baseTitle = document.title;

  var layer = $('playerLayer');
  var frame = $('playerFrame');
  var loading = $('playerLoading');
  var loadingName = $('playerLoadingName');
  var loadingHint = $('playerLoadingHint');
  var loadingStandalone = $('playerLoadingStandalone');
  var errorBox = $('playerError');
  var errorTitle = $('playerErrorTitle');
  var errorText = $('playerErrorText');
  var nameEl = $('playerName');
  var codeEl = $('playerCode');
  var standalone = $('playerStandalone');
  var reloadBtn = $('playerReload');
  var pinBtn = $('playerPin');
  var shuffleBtn = $('playerShuffle');
  var copyBtn = $('playerCopy');
  var fullscreenBtn = $('playerFullscreen');
  var toolView = $('toolView');
  var staticViews = { 'view-privacy': $('view-privacy'), 'view-terms': $('view-terms'), 'view-ai': $('view-ai') };
  var TOOL_TITLES = { yt: 'YouTube search', spotify: 'Spotify', proxy: 'Web proxy' };
  var STATIC_TITLES = { 'view-privacy': 'Privacy', 'view-terms': 'Terms', 'view-ai': 'AI chat' };

  var current = '';
  var loaded = false;
  var stuckTimer = null;
  var hideTimer = null;
  var copyTimer = null;
  var currentTool = '';

  /* ---------- shared ---------- */
  function anyOpen() {
    if (!layer.hidden || !toolView.hidden) return true;
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

  /* ---------- player ---------- */
  function showLoading(label) {
    clearTimeout(hideTimer);
    clearTimeout(stuckTimer);
    errorBox.hidden = true;
    errorBox.classList.add('is-hidden');
    frame.hidden = false;
    loading.hidden = false;
    loading.classList.remove('is-hidden');
    loadingName.textContent = label || 'Loading…';
    loadingHint.textContent = 'The game may pull assets from a CDN. Give it a moment.';
    loadingStandalone.hidden = true;
    stuckTimer = setTimeout(function () {
      if (loaded) return;
      loadingHint.textContent = 'Still waiting. The game may be fetching a large file. Open it standalone if this stays blank.';
      loadingStandalone.hidden = false;
    }, 18000);
  }

  function showError(title, text) {
    loaded = true;
    clearTimeout(stuckTimer);
    clearTimeout(hideTimer);
    loading.hidden = true;
    frame.hidden = true;
    errorBox.hidden = false;
    errorBox.classList.remove('is-hidden');
    errorTitle.textContent = title;
    errorText.textContent = text;
    fullscreenBtn.hidden = true;
  }

  function paintPin() {
    if (!pinBtn || !current) return;
    var on = UGSW.isPinned(current);
    pinBtn.setAttribute('aria-pressed', String(on));
    pinBtn.setAttribute('aria-label', on ? 'Unpin this game' : 'Pin this game');
    pinBtn.setAttribute('title', on ? 'Unpin this game' : 'Pin this game');
  }

  function togglePin() {
    if (!current || !UGSW.exists(current)) return;
    UGSW.togglePin(current);
    paintPin();
  }

  function shuffleGame() {
    if (!UGS_FILES.length) return;
    var pick = UGS_FILES[Math.floor(Math.random() * UGS_FILES.length)];
    var guard = 0;
    while (guard < 5 && UGS_FILES.length > 1 && pick === current) {
      pick = UGS_FILES[Math.floor(Math.random() * UGS_FILES.length)];
      guard++;
    }
    location.hash = '#play:' + encodeURIComponent(pick);
  }

  function legacyCopy(text, done) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-999px';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      done(ok);
    } catch (e) {
      done(false);
    }
  }

  function copyLink() {
    var label = copyBtn.querySelector('.btn__text');

    function done(ok) {
      if (!label) return;
      label.textContent = ok ? 'Copied' : 'Copy failed';
      copyBtn.setAttribute('aria-label', ok ? 'Link copied' : 'Could not copy the link');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () {
        label.textContent = 'Copy link';
        copyBtn.setAttribute('aria-label', 'Copy a link to this game');
      }, 1600);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(function () {
        done(true);
      }, function () {
        legacyCopy(location.href, done);
      });
    } else {
      legacyCopy(location.href, done);
    }
  }

  function openPlayer(raw) {
    if (!raw) return;
    closeTool();
    Object.keys(staticViews).forEach(function (key) { staticViews[key].hidden = true; });
    layer.hidden = false;
    syncLock();

    if (!UGSW.exists(raw)) {
      current = '';
      nameEl.textContent = 'No game';
      nameEl.title = '';
      codeEl.textContent = '';
      document.title = 'Game not found — UGSW';
      standalone.hidden = true;
      reloadBtn.hidden = true;
      pinBtn.hidden = true;
      copyBtn.hidden = true;
      showError('That file isn’t in the stash', 'The link may point to a game that is not in this mirror. Pick another file from the catalogue.');
      return;
    }

    var name = UGSW.name(raw);
    var code = UGSW.code(raw);
    var src = UGSW.gameURL(raw);

    current = raw;
    loaded = false;
    nameEl.textContent = name;
    nameEl.title = name;
    codeEl.textContent = (code ? code + ' · ' : '') + 'mirrored file';
    document.title = name + ' — UGSW';
    standalone.href = src;
    standalone.setAttribute('aria-label', 'Open ' + name + ' standalone in a new tab');
    standalone.hidden = false;
    reloadBtn.hidden = false;
    pinBtn.hidden = false;
    copyBtn.hidden = false;
    loadingStandalone.href = src;
    frame.title = name;
    if (document.documentElement.requestFullscreen && document.exitFullscreen) fullscreenBtn.hidden = false;
    paintPin();
    showLoading(name);
    frame.src = src;
    try { frame.focus(); } catch (e) {}
  }

  function closePlayer() {
    if (layer.hidden) return;
    clearTimeout(stuckTimer);
    clearTimeout(hideTimer);
    layer.hidden = true;
    document.title = baseTitle;
    current = '';
    loaded = false;
    try { frame.src = 'about:blank'; } catch (e) {}
    syncLock();
  }

  frame.addEventListener('load', function () {
    if (!current) return;
    if (loaded) { UGSW.remember(current); return; }
    loaded = true;
    clearTimeout(stuckTimer);
    UGSW.remember(current);
    loading.classList.add('is-hidden');
    hideTimer = setTimeout(function () { loading.hidden = true; }, 220);
    try { frame.focus(); } catch (e) {}
  });

  reloadBtn.addEventListener('click', function () {
    if (!current) return;
    loaded = false;
    showLoading('Reloading…');
    try {
      frame.contentWindow.location.reload();
    } catch (e) {
      frame.src = UGSW.gameURL(current);
    }
  });

  pinBtn.addEventListener('click', togglePin);
  shuffleBtn.addEventListener('click', shuffleGame);
  copyBtn.addEventListener('click', copyLink);

  if (document.documentElement.requestFullscreen && document.exitFullscreen) {
    fullscreenBtn.addEventListener('click', function () {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () {});
      } else {
        document.documentElement.requestFullscreen().catch(function () {});
      }
    });
    document.addEventListener('fullscreenchange', function () {
      var on = !!document.fullscreenElement;
      fullscreenBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
      fullscreenBtn.setAttribute('title', on ? 'Exit full screen' : 'Enter full screen');
    });
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
    closePlayer();
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
    closePlayer();
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
    closePlayer();
    closeTool();
    Object.keys(staticViews).forEach(function (key) { staticViews[key].hidden = true; });
    if (hadTitle !== baseTitle) document.title = baseTitle;
    syncLock();
  }

  /* ---------- routing ---------- */
  function route() {
    var hash = location.hash || '';
    if (hash.indexOf('#play:') === 0) {
      openPlayer(decodeURIComponent(hash.slice(6)));
    } else if (hash === '#tool-yt' || hash === '#tool-spotify' || hash === '#tool-proxy') {
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

    if (event.key === 'Escape') {
      if (!anyOpen()) return;
      event.preventDefault();
      closeAll();
      clearHash();
      return;
    }

    if (layer.hidden) return;

    var target = event.target;
    var tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        (target && target.isContentEditable)) return;

    var key = String(event.key || '').toLowerCase();
    if (key === 'r') {
      event.preventDefault();
      reloadBtn.click();
    } else if (key === 's') {
      event.preventDefault();
      shuffleGame();
    } else if (key === 'p') {
      event.preventDefault();
      togglePin();
    } else if (key === 'f') {
      if (fullscreenBtn.hidden) return;
      event.preventDefault();
      fullscreenBtn.click();
    }
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

  UGSW.gamesReady(function (error) {
    if (error) {
      if (location.hash.indexOf('#play:') === 0) {
        layer.hidden = false;
        nameEl.textContent = 'Catalogue unavailable';
        codeEl.textContent = '';
        showError('Could not load the game list',
          'games.json did not load (' + (error.message || 'unknown error') + '). Reload the page.');
        syncLock();
      }
      return;
    }
    route();
  });
})();
