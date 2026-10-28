/* UGSW player. Needs common.js; the game manifest loads before the file is trusted. */
(function () {
  'use strict';

  UGSW.gamesReady(start);

  function manifestError(err) {
    var loading = document.getElementById('loading');
    var box = document.getElementById('error');
    var kicker = document.getElementById('errorKicker');
    var title = document.getElementById('errorTitle');
    var text = document.getElementById('errorText');
    if (loading) loading.hidden = true;
    if (box) { box.hidden = false; box.classList.remove('is-hidden'); }
    if (kicker) kicker.textContent = 'Catalogue unavailable';
    if (title) title.textContent = 'Could not load games.json';
    if (text) {
      text.textContent = 'The game list did not load (' +
        (err && err.message ? err.message : 'unknown error') +
        '). Reload the page, or check that games.json sits next to play.html.';
    }
  }

  function start(err) {
    if (err) return manifestError(err);

  
    var $ = function (id) { return document.getElementById(id); };
    var frame = $('frame');
    var loading = $('loading');
    var loadingName = $('loadingName');
    var loadingHint = $('loadingHint');
    var loadingStandalone = $('loadingStandalone');
    var error = $('error');
    var errorKicker = $('errorKicker');
    var errorTitle = $('errorTitle');
    var errorText = $('errorText');
    var errorBack = $('errorBack');
    var gameName = $('gameName');
    var gameCode = $('gameCode');
    var backLink = $('backLink');
    var standalone = $('standalone');
    var reload = $('reload');
    var pin = $('pin');
    var shuffle = $('shuffle');
    var copy = $('copy');
    var fullscreen = $('fullscreen');
    var metaDescription = $('metaDescription');
    var copyTimer = null;
  
    var params = new URLSearchParams(location.search);
    var raw = params.get('game') || '';
    var loaded = false;
    var stuckTimer = null;
    var hideTimer = null;
    var gameURL = '';
  
    /* The catalogue keeps the last query and scroll position. */
    var view = UGSW.view();
    backLink.href = 'index.html' + (view && view.q ? '?q=' + encodeURIComponent(view.q) : '');
    if (errorBack) errorBack.href = backLink.href;
  
    document.querySelectorAll('[data-random]').forEach(function (button) {
      button.addEventListener('click', function () {
        var pick = UGS_FILES[Math.floor(Math.random() * UGS_FILES.length)];
        location.assign(UGSW.playURL(pick));
      });
    });
  
    function showLoading(label) {
      clearTimeout(hideTimer);
      clearTimeout(stuckTimer);
      error.hidden = true;
      error.classList.add('is-hidden');
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
  
    function ready() {
      if (loaded) {
        UGSW.remember(raw);
        return;
      }
      loaded = true;
      clearTimeout(stuckTimer);
      UGSW.remember(raw);
      loading.classList.add('is-hidden');
      hideTimer = setTimeout(function () { loading.hidden = true; }, 220);
      try { frame.focus(); } catch (e) {}
    }
  
    function showError(title, text, kicker, keepGame) {
      loaded = true;
      clearTimeout(stuckTimer);
      clearTimeout(hideTimer);
      loading.hidden = true;
      frame.hidden = true;
      error.hidden = false;
      error.classList.remove('is-hidden');
      errorKicker.textContent = kicker || 'Not in the stash';
      errorTitle.textContent = title;
      errorText.textContent = text;
      if (!keepGame) {
        gameName.textContent = 'No game';
        gameCode.textContent = '';
        document.title = 'Game not found — UGSW';
        standalone.hidden = true;
        reload.hidden = true;
        pin.hidden = true;
        copy.hidden = true;
      }
      fullscreen.hidden = true;
    }
  
    /* ---------- pin, shuffle, copy ---------- */
    function paintPin() {
      if (!pin || !raw) return;
      var on = UGSW.isPinned(raw);
      pin.setAttribute('aria-pressed', String(on));
      pin.setAttribute('aria-label', on ? 'Unpin this game' : 'Pin this game');
      pin.setAttribute('title', on ? 'Unpin this game' : 'Pin this game');
    }
  
    function togglePin() {
      if (!raw || !UGSW.exists(raw)) return;
      UGSW.togglePin(raw);
      paintPin();
    }
  
    function shuffleGame() {
      if (!UGS_FILES.length) return;
      var pick = UGS_FILES[Math.floor(Math.random() * UGS_FILES.length)];
      for (var guard = 0; guard < 5 && UGS_FILES.length > 1 && pick === raw; guard++) {
        pick = UGS_FILES[Math.floor(Math.random() * UGS_FILES.length)];
      }
      location.assign(UGSW.playURL(pick));
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
      if (!copy) return;
      var label = copy.querySelector('.btn__text');
  
      function done(ok) {
        if (!label) return;
        label.textContent = ok ? 'Copied' : 'Copy failed';
        copy.setAttribute('aria-label', ok ? 'Link copied' : 'Could not copy the link');
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () {
          label.textContent = 'Copy link';
          copy.setAttribute('aria-label', 'Copy a link to this game');
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
  
    if (!raw) {
      var last = UGSW.last();
      if (last) {
        location.replace(UGSW.playURL(last.raw));
        return;
      }
      showError('No game selected', 'Open the catalogue and pick a file, or let the stash choose one for you.', 'Nothing selected');
      return;
    }
  
    if (!UGSW.exists(raw)) {
      showError('That file isn’t in the stash', 'The link may point to a game that is not in this mirror. Try the catalogue or pick a random file.', 'Not in the stash');
      return;
    }
  
    var name = UGSW.name(raw);
    var code = UGSW.code(raw);
    gameURL = UGSW.gameURL(raw);
  
    gameName.textContent = name;
    gameName.title = name;
    gameCode.textContent = (code ? code + ' · ' : '') + 'mirrored file';
    document.title = name + ' — UGSW';
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Play ' + name + ' in the browser, from the Ultimate Game Stash.');
    }
  
    standalone.href = gameURL;
    standalone.setAttribute('aria-label', 'Open ' + name + ' standalone in a new tab');
    standalone.hidden = false;
    reload.hidden = false;
    pin.hidden = false;
    copy.hidden = false;
    loadingName.textContent = name;
    loadingStandalone.href = gameURL;
    loadingStandalone.setAttribute('aria-label', 'Open ' + name + ' standalone in a new tab');
    frame.title = name;
  
    frame.addEventListener('load', ready);
    frame.addEventListener('error', function () {
      showError('This file did not load', 'The mirror may be incomplete. Open it standalone or try another game.', 'Load error', true);
    });
  
    paintPin();
  
    pin.addEventListener('click', togglePin);
    shuffle.addEventListener('click', shuffleGame);
    copy.addEventListener('click', copyLink);
  
    showLoading(name);
    frame.src = gameURL;
  
    reload.addEventListener('click', function () {
      loaded = false;
      showLoading('Reloading…');
      try {
        frame.contentWindow.location.reload();
      } catch (e) {
        frame.src = gameURL;
      }
    });
  
    if (document.documentElement.requestFullscreen && document.exitFullscreen) {
      fullscreen.hidden = false;
      fullscreen.addEventListener('click', function () {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(function () {});
        } else {
          document.documentElement.requestFullscreen().catch(function () {});
        }
      });
      document.addEventListener('fullscreenchange', function () {
        var on = !!document.fullscreenElement;
        fullscreen.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
        fullscreen.setAttribute('title', on ? 'Exit full screen' : 'Enter full screen');
      });
    }
  
    /* The iframe keeps its own focus, so these only apply until you click into
       the game — which is exactly when they are useful. */
    document.addEventListener('keydown', function (event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      var tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
          (event.target && event.target.isContentEditable)) return;
  
      var key = String(event.key || '').toLowerCase();
      if (key === 'r') {
        event.preventDefault();
        reload.click();
      } else if (key === 's') {
        event.preventDefault();
        shuffleGame();
      } else if (key === 'p') {
        event.preventDefault();
        togglePin();
      } else if (key === 'f') {
        if (fullscreen.hidden) return;
        event.preventDefault();
        fullscreen.click();
      }
    });
  
  }
})();
