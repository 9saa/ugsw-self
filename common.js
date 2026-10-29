/* Shared by every UGSW page: API base, helpers, theme, shared storage. */
var API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'http://localhost:3000'
  : 'https://api.ugsw.fun';

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* Catalogue helpers and the small amount of state UGSW keeps. */
var UGSW = (function () {
  'use strict';

  var KEYS = {
    recent: 'ugsw:recent',
    last: 'ugsw:last',
    view: 'ugsw:view',
    pins: 'ugsw:pins',
    layout: 'ugsw:layout'
  };
  var OLD_RECENT = 'ugs-recent';
  var SMALL_WORDS = {
    of: 1, the: 1, and: 1, in: 1, a: 1, an: 1, on: 1, at: 1, to: 1, for: 1,
    by: 1, with: 1, or: 1, vs: 1, is: 1, as: 1, from: 1, into: 1, over: 1, up: 1
  };

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function normalize(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function pad3(n) {
    return String(n).padStart(3, '0');
  }

  function displayName(raw) {
    if (typeof UGS_NAMES !== 'undefined' && UGS_NAMES && UGS_NAMES[raw]) return UGS_NAMES[raw];
    var s = String(raw).replace(/^cl/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ').trim();
    if (!s) return raw;
    return s.split(' ').map(function (w, i) {
      if (w.length <= 5 && /^[A-Z]+$/.test(w)) return w;
      var lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.hasOwnProperty(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }

  function exists(raw) {
    return typeof UGS_FILES !== 'undefined' && Array.isArray(UGS_FILES) &&
      UGS_FILES.indexOf(raw) !== -1;
  }

  /* ---------- catalogue manifest ---------- */
  // games.json is the single source of truth for what the site can play:
  // [{ id, name, file, path }]. Pages that already have the list inlined
  // (the single-file build) resolve immediately instead of fetching.
  var manifest = null;
  var manifestPromise = null;

  function hasInlineCatalogue() {
    return typeof UGS_FILES !== 'undefined' && Array.isArray(UGS_FILES) && UGS_FILES.length > 0;
  }

  /* The single-file build cannot fetch a sibling JSON file, so it embeds the
     manifest in an element with id="ugsw-games" and type application/json. */
  function inlineManifest() {
    var node = document.getElementById('ugsw-games');
    if (!node) return null;
    try {
      return JSON.parse(node.textContent || '');
    } catch (e) {
      return null;
    }
  }

  function adoptManifest(data) {
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.games) ? data.games : []);
    var ids = [];
    var names = {};
    var paths = {};
    var seen = Object.create(null);

    list.forEach(function (entry) {
      if (!entry) return;
      var file = String(entry.file || entry.path || '');
      var id = entry.id != null ? String(entry.id)
        : file.replace(/^.*[\\/]/, '').replace(/\.html$/i, '');
      if (!id || seen[id]) return;
      seen[id] = true;
      ids.push(id);
      if (entry.name) names[id] = String(entry.name);
      paths[id] = entry.path ? String(entry.path) : 'games/' + file;
    });

    window.UGS_FILES = ids;
    window.UGS_NAMES = names;
    window.UGS_PATHS = paths;
    manifest = {
      count: ids.length,
      generated: data && data.generated ? String(data.generated) : '',
      games: list
    };
    return manifest;
  }

  function loadGames() {
    if (manifestPromise) return manifestPromise;
    if (hasInlineCatalogue()) {
      manifestPromise = Promise.resolve({ count: UGS_FILES.length, generated: '', games: [] });
      return manifestPromise;
    }
    var embedded = inlineManifest();
    if (embedded) {
      manifestPromise = Promise.resolve(adoptManifest(embedded));
      return manifestPromise;
    }
    manifestPromise = fetch('games.json', { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('games.json: HTTP ' + response.status);
        return response.json();
      })
      .then(adoptManifest)
      .catch(function (error) {
        manifestPromise = null;
        throw error;
      });
    return manifestPromise;
  }

  function gamesReady(callback) {
    loadGames().then(
      function () { callback(null); },
      function (error) { callback(error || new Error('Catalogue unavailable')); }
    );
  }

  function groupOf(raw) {
    var value = String(raw);
    var rest = /^cl/.test(value) ? value.slice(2) : value;
    var c = rest.normalize('NFD').charAt(0).toUpperCase();
    return /^[A-Z0-9]$/.test(c) ? c : '#';
  }

  /* Same code the catalogue prints: letter + position inside that letter. */
  function code(raw) {
    if (typeof UGS_FILES === 'undefined' || !Array.isArray(UGS_FILES)) return '';
    var group = groupOf(raw);
    var index = 0;
    for (var i = 0; i < UGS_FILES.length; i++) {
      if (groupOf(UGS_FILES[i]) !== group) continue;
      if (UGS_FILES[i] === raw) return group + pad3(index + 1);
      index++;
    }
    return '';
  }

  function gameURL(raw) {
    var path = typeof UGS_PATHS !== 'undefined' && UGS_PATHS ? UGS_PATHS[raw] : '';
    if (path) {
      return path.split('/').map(function (part) { return encodeURIComponent(part); }).join('/');
    }
    return 'games/' + encodeURIComponent(raw) + '.html';
  }

  function recent() {
    var list = readJSON(KEYS.recent, null);
    if (!Array.isArray(list)) {
      // Carry over recents from the earlier build once.
      try {
        var old = JSON.parse(localStorage.getItem(OLD_RECENT));
        if (Array.isArray(old)) list = old;
      } catch (e) {}
    }
    if (!Array.isArray(list)) list = [];
    var seen = Object.create(null);
    var out = [];
    list.forEach(function (raw) {
      if (typeof raw === 'string' && exists(raw) && !seen[raw]) {
        seen[raw] = true;
        out.push(raw);
      }
    });
    return out.slice(0, 8);
  }

  function remember(raw) {
    if (!exists(raw)) return;
    var list = [raw].concat(recent().filter(function (r) { return r !== raw; }));
    writeJSON(KEYS.recent, list.slice(0, 8));
    writeJSON(KEYS.last, { raw: raw, at: Date.now() });
  }

  function last() {
    var value = readJSON(KEYS.last, null);
    if (value && typeof value.raw === 'string' && exists(value.raw)) {
      return { raw: value.raw, at: Number(value.at) || 0 };
    }
    var first = recent()[0];
    return first ? { raw: first, at: 0 } : null;
  }

  function clearHistory() {
    remove(KEYS.recent);
    remove(KEYS.last);
    remove(OLD_RECENT);
  }

  function view() {
    var value = readJSON(KEYS.view, null);
    if (!value || typeof value !== 'object') return null;
    return {
      q: typeof value.q === 'string' ? value.q : '',
      y: Number(value.y) || 0,
      mode: value.mode === 'pinned' ? 'pinned' : 'all'
    };
  }

  function saveView(q, y, mode) {
    writeJSON(KEYS.view, {
      q: String(q || ''),
      y: Math.max(0, Math.round(y || 0)),
      mode: mode === 'pinned' ? 'pinned' : 'all'
    });
  }

  /* ---------- pinned files ---------- */
  function pinned() {
    var list = readJSON(KEYS.pins, null);
    if (!Array.isArray(list)) list = [];
    var seen = Object.create(null);
    var out = [];
    list.forEach(function (raw) {
      if (typeof raw === 'string' && exists(raw) && !seen[raw]) {
        seen[raw] = true;
        out.push(raw);
      }
    });
    return out;
  }

  function isPinned(raw) {
    return pinned().indexOf(raw) !== -1;
  }

  function togglePin(raw) {
    if (!exists(raw)) return false;
    var list = pinned();
    var index = list.indexOf(raw);
    if (index === -1) list.unshift(raw);
    else list.splice(index, 1);
    writeJSON(KEYS.pins, list);
    return index === -1;
  }

  /* ---------- catalogue layout ---------- */
  function layout() {
    var value = readJSON(KEYS.layout, null);
    return value === 'grid' ? 'grid' : 'list';
  }

  function saveLayout(value) {
    writeJSON(KEYS.layout, value === 'grid' ? 'grid' : 'list');
  }

  function formatInt(n) {
    try { return Number(n).toLocaleString('en-US'); } catch (e) { return String(n); }
  }

  function formatDate(ts) {
    var d = new Date(Number(ts));
    if (!ts || isNaN(d.getTime())) return '';
    try {
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  /* ---------- backend ---------- */
  function apiURL(path) {
    return API_BASE + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function apiJSON(path, options) {
    return fetch(apiURL(path), options).then(function (response) {
      var type = response.headers.get('content-type') || '';
      if (type.indexOf('application/json') !== -1) {
        return response.json().then(function (data) {
          if (response.ok) return data;
          var error = new Error((data && data.error) || ('HTTP ' + response.status));
          error.status = response.status;
          error.data = data;
          throw error;
        });
      }
      return response.text().then(function (text) {
        if (response.ok) return text;
        var error = new Error('HTTP ' + response.status);
        error.status = response.status;
        throw error;
      });
    });
  }

  // One capability probe per page load. Older backend builds without
  // /api/status fall back to /api/health and are treated as legacy.
  var statusPromise = null;
  function status(force) {
    if (statusPromise && !force) return statusPromise;

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 10000) : null;
    var options = controller ? { signal: controller.signal } : undefined;
    function stop() { if (timer) clearTimeout(timer); }

    statusPromise = fetch(apiURL('/api/status'), options)
      .then(function (response) {
        if (response.ok) { stop(); return response.json(); }
        return fetch(apiURL('/api/health'), options).then(function (health) {
          stop();
          if (!health.ok) return null;
          return {
            ok: true,
            legacy: true,
            features: {
              search: true,
              proxy: true,
              proxyAuth: false,
              spotify: false,
              spotifyApi: false,
              spotifySearch: false,
              ai: false,
              aiModel: ''
            }
          };
        });
      })
      .catch(function () {
        stop();
        statusPromise = null;
        return null;
      });
    return statusPromise;
  }

  function onDialogClose(dialog, fn) {
    if (!dialog) return;
    new MutationObserver(function () {
      if (!dialog.open) fn();
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }

  return {
    displayName: displayName,
    name: displayName,
    normalize: normalize,
    exists: exists,
    loadGames: loadGames,
    gamesReady: gamesReady,
    groupOf: groupOf,
    code: code,
    gameURL: gameURL,
    recent: recent,
    remember: remember,
    last: last,
    clearHistory: clearHistory,
    view: view,
    saveView: saveView,
    pinned: pinned,
    isPinned: isPinned,
    togglePin: togglePin,
    layout: layout,
    saveLayout: saveLayout,
    formatInt: formatInt,
    formatDate: formatDate,
    apiURL: apiURL,
    apiJSON: apiJSON,
    status: status,
    onDialogClose: onDialogClose
  };
})();

(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'ugsw:theme';

  function storedTheme() {
    try {
      var value = localStorage.getItem(THEME_KEY);
      return value === 'light' || value === 'dark' ? value : '';
    } catch (e) {
      return '';
    }
  }



  function applyTheme(theme) {
    var isDark = theme === 'dark';
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    var meta = document.getElementById('themeColor');
    if (meta) meta.setAttribute('content', isDark ? '#14130f' : '#f4f0e5');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
      button.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    });
  }

  var current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  applyTheme(current);

  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyTheme(next);
    });
  });

  try {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function (event) {
      if (storedTheme()) return;
      applyTheme(event.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  } catch (e) {}

  /* Backend health: the free host sleeps, so this also warms it up. */
  var statusNodes = document.querySelectorAll('[data-backend-status]');
  if (statusNodes.length) {
    statusNodes.forEach(function (node) {
      node.dataset.state = 'checking';
      node.textContent = 'Checking';
    });
    UGSW.status().then(function (status) {
      var ok = !!status;
      statusNodes.forEach(function (node) {
        node.dataset.state = ok ? 'online' : 'offline';
        node.textContent = ok ? 'Online' : 'Offline';
      });
    });
  }

  /* "/" jumps to the page's search box. */
  var search = document.querySelector('input[type="search"]');
  if (search) {
    document.addEventListener('keydown', function (event) {
      var tag = event.target && event.target.tagName;
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
          (event.target && event.target.isContentEditable)) return;
      event.preventDefault();
      search.focus();
      if (typeof search.select === 'function') search.select();
    });
  }
})();
