/* YouTube page. Needs common.js loaded first. */
(function () {
  'use strict';

  var IDLE = 'Type a query above and press Enter.';

  var $ = function (id) { return document.getElementById(id); };
  var form = $('searchForm');
  var input = $('searchInput');
  var results = $('results');
  var count = $('resultCount');
  var state = $('state');
  var tabs = document.querySelectorAll('#resultTabs [data-tab]');
  var player = $('player');
  var playerTitle = $('playerTitle');
  var playerIframe = $('playerIframe');
  var playerOpen = $('playerOpen');
  var feedButton = $('openFeed');

  var searchDisabled = false;

  var SAVED_KEY = 'ugsw:yt';
  var tab = 'videos';
  var query = '';
  var inFlight = null;
  var lastItems = [];
  var booted = false;

  function readSaved() {
    try {
      var value = JSON.parse(localStorage.getItem(SAVED_KEY));
      return value && typeof value === 'object' ? value : null;
    } catch (e) {
      return null;
    }
  }

  function saveState() {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify({ q: query, tab: tab })); } catch (e) {}
  }

  /* ---------- URL state ---------- */
  function writeURL(replace) {
    var p = new URLSearchParams();
    if (query) p.set('q', query);
    if (tab !== 'videos') p.set('tab', tab);
    var search = p.toString().replace(/\+/g, '%20');
    var next = location.pathname + (search ? '?' + search : '');
    if (next === location.pathname + location.search) return;
    if (replace) history.replaceState(null, '', next);
    else history.pushState(null, '', next);
  }

  function hydrate() {
    var p = new URLSearchParams(location.search);
    var nextTab = p.get('tab') === 'shorts' ? 'shorts' : 'videos';
    var q = (p.get('q') || '').trim();
    var restored = false;
    if (!booted && !q && !p.has('tab')) {
      var saved = readSaved();
      if (saved && typeof saved.q === 'string' && saved.q.trim()) {
        q = saved.q.trim();
        nextTab = saved.tab === 'shorts' ? 'shorts' : 'videos';
        restored = true;
      }
    }
    setTab(nextTab);
    query = q;
    input.value = query;
    booted = true;
    if (restored) writeURL(true);
    saveState();
    load();
  }

  function setTab(next) {
    tab = next;
    tabs.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === tab)); });
  }

  /* ---------- states ---------- */
  // textContent only: the query comes straight from the URL.
  function showState(text, loading) {
    results.textContent = '';
    count.textContent = '';
    state.hidden = false;
    state.textContent = text;
    if (loading) {
      var bar = el('div', 'progress');
      bar.setAttribute('aria-hidden', 'true');
      bar.appendChild(el('span'));
      state.prepend(bar);
    }
  }

  /* ---------- data ---------- */
  function load() {
    if (searchDisabled) return;
    if (inFlight) inFlight.abort();
    if (!query) { showState(IDLE); return; }

    var ctrl = inFlight = new AbortController();
    showState('Searching ' + (tab === 'shorts' ? 'Shorts' : 'videos') + '…', true);

    fetch(API_BASE + '/api/search?q=' + encodeURIComponent(query) + '&tab=' + tab, { signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { render(data.items || []); })
      .catch(function (err) {
        if (err.name !== 'AbortError') showState('Search failed (' + err.message + '). The server may be waking up, try again in a few seconds.');
      });
  }

  function render(items) {
    if (!items.length) { showState('No results for “' + query + '”.'); return; }
    state.hidden = true;
    results.textContent = '';
    results.classList.toggle('is-shorts', tab === 'shorts');
    lastItems = items;
    count.textContent = String(items.length).padStart(2, '0') + (items.length === 1 ? ' result' : ' results');
    items.forEach(function (item) { results.appendChild(card(item)); });
  }

  function card(item) {
    var c = el('button', 'card' + (item.type === 'short' ? ' is-short' : ''));
    c.type = 'button';
    c.title = item.title;

    var thumb = c.appendChild(el('span', 'card__thumb'));
    var img = thumb.appendChild(el('img'));
    img.loading = 'lazy';
    img.alt = '';
    img.src = item.thumbnail;
    img.onerror = function () { img.remove(); };
    if (item.length) thumb.appendChild(el('span', 'card__duration', item.length));

    var body = c.appendChild(el('span', 'card__body'));
    body.appendChild(el('span', 'card__title', item.title));
    var meta = [item.channel, item.views, item.published].filter(Boolean).join(' · ');
    if (meta) body.appendChild(el('span', 'card__meta', meta));

    c.addEventListener('click', function () {
      if (item.type !== 'short') { play(item); return; }
      // Tapped short first, the rest of the results shuffled, then random topics.
      openFeed([item].concat(shuffle(lastItems.filter(function (x) { return x !== item; }))));
    });
    return c;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /* ---------- video player (native <dialog>: Esc, focus trap + focus return for free) ---------- */
  function play(item) {
    playerTitle.textContent = item.title;
    playerOpen.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(item.id);
    playerIframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(item.id) + '?autoplay=1&rel=0';
    player.showModal();
  }

  UGSW.onDialogClose(player, function () { playerIframe.src = 'about:blank'; });
  player.addEventListener('click', function (e) { if (e.target === player) player.close(); });

  /* ---------- Shorts feed ----------
     Vertical snap scroller like YouTube Shorts. The current short plays, the next
     two are mounted ahead (paused) so swiping is instant, and players more than one
     behind are torn down. When the queue runs low it pulls a random topic. Playback
     goes over the embed's postMessage API, so no YouTube script has to load. */
  var TOPICS = ['funny', 'satisfying', 'cooking', 'animals', 'gaming', 'sports', 'music',
                'science', 'art', 'travel', 'dance', 'comedy', 'cats', 'dogs', 'magic',
                'skateboarding', 'football', 'minecraft', 'life hacks', 'nature'];
  var feed = $('feed');
  var scroller = $('feedScroller');
  var slides = [];
  var seen = {};
  var current = -1;
  var loadingMore = false;
  var misses = 0;

  function addSlide(item) {
    if (seen[item.id]) return false;
    seen[item.id] = true;

    var s = { item: item, el: el('section', 'short'), iframe: null, ready: false, paused: false, want: 'pauseVideo' };
    s.frame = s.el.appendChild(el('div', 'short__frame'));
    var img = s.frame.appendChild(el('img', 'short__thumb'));
    img.alt = '';
    img.loading = 'lazy';
    img.src = item.thumbnail;
    s.tap = s.frame.appendChild(el('button', 'short__tap'));
    s.tap.type = 'button';
    s.tap.setAttribute('aria-label', 'Play or pause');
    s.tap.addEventListener('click', function () { setPaused(s, !s.paused); });
    var info = s.frame.appendChild(el('div', 'short__info'));
    info.appendChild(el('span', 'short__title', item.title));
    if (item.views) info.appendChild(el('span', '', item.views));

    slides.push(s);
    scroller.appendChild(s.el);
    return true;
  }

  function send(s) {
    if (s.iframe && s.ready) {
      s.iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: s.want, args: [] }), '*');
    }
  }

  function setPaused(s, paused) {
    s.paused = paused;
    s.el.classList.toggle('is-paused', paused);
    s.want = paused ? 'pauseVideo' : 'playVideo';
    send(s);
  }

  function mount(s) {
    if (s.iframe) return;
    var id = encodeURIComponent(s.item.id);
    var f = el('iframe', 'short__video');
    f.title = s.item.title;
    f.tabIndex = -1;
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?enablejsapi=1&controls=0&playsinline=1&rel=0' +
            '&loop=1&playlist=' + id + '&origin=' + encodeURIComponent(location.origin);
    // The embed only reports in (and takes commands) once it hears "listening".
    f.addEventListener('load', function () {
      var tries = 0;
      clearInterval(s.timer);
      s.timer = setInterval(function () {
        if (s.ready || s.iframe !== f || ++tries > 40) { clearInterval(s.timer); return; }
        f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
      }, 250);
    });
    s.frame.insertBefore(f, s.tap);
    s.iframe = f;
  }

  function unmount(s) {
    if (!s.iframe) return;
    clearInterval(s.timer);
    s.iframe.remove();
    s.iframe = null;
    s.ready = false;
  }

  window.addEventListener('message', function (e) {
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || typeof e.data !== 'string') return;
    var s = slides.filter(function (x) { return x.iframe && x.iframe.contentWindow === e.source; })[0];
    if (!s || s.ready) return;
    var d;
    try { d = JSON.parse(e.data); } catch (err) { return; }
    if (d.event === 'onReady') { s.ready = true; send(s); }
  });

  function activate(i) {
    if (i === current || !slides[i]) return;
    current = i;
    slides.forEach(function (s, j) {
      if (j < i - 1 || j > i + 2) { unmount(s); return; }
      mount(s);
      if (j === i) { setPaused(s, false); return; }
      s.want = 'pauseVideo';
      send(s);
    });
    if (i >= slides.length - 4) loadMore();
  }

  function loadMore() {
    if (searchDisabled || loadingMore) return;
    loadingMore = true;
    var topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    fetch(API_BASE + '/api/search?tab=shorts&q=' + encodeURIComponent(topic))
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (data) {
        loadingMore = false;
        var added = 0;
        shuffle(data.items || []).forEach(function (item) { if (addSlide(item)) added++; });
        misses = added ? 0 : misses + 1;
        if (feed.open && current === -1) activate(0);
        // Keep topping up while the queue is short; give up after a few dry pulls.
        if (!feed.open || current < slides.length - 4) return;
        if (misses < 3) loadMore();
        else if (!slides.length) scroller.dataset.msg = 'Couldn’t load shorts. Close and try again.';
      });
  }

  function openFeed(items) {
    slides.forEach(unmount);
    slides = [];
    seen = {};
    current = -1;
    misses = 0;
    scroller.textContent = '';
    scroller.dataset.msg = 'Loading shorts…';
    items.forEach(addSlide);
    feed.showModal();
    if (slides.length) activate(0);
    else loadMore();
  }

  function go(step) {
    var s = slides[current + step];
    if (s) s.el.scrollIntoView();
  }

  UGSW.onDialogClose(feed, function () { slides.forEach(unmount); current = -1; });
  scroller.addEventListener('scroll', function () {
    activate(Math.round(scroller.scrollTop / scroller.clientHeight));
  });

  feed.addEventListener('keydown', function (e) {
    var s = slides[current];
    if (e.key === 'ArrowDown') go(1);
    else if (e.key === 'ArrowUp') go(-1);
    else if ((e.key === ' ' || e.key === 'k') && s) setPaused(s, !s.paused);
    else return;
    e.preventDefault();
  });
  $('feedUp').addEventListener('click', function () { go(-1); });
  $('feedDown').addEventListener('click', function () { go(1); });
  $('openFeed').addEventListener('click', function () { openFeed([]); });

  // Do not call a search endpoint this backend build has turned off.
  UGSW.status().then(function (s) {
    if (!s || !s.features || s.features.search !== false) return;
    searchDisabled = true;
    input.disabled = true;
    feedButton.disabled = true;
    var submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    showState('Search is disabled on this backend build.');
  });

  /* ---------- events ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    query = input.value.trim();
    if (!query) return;
    writeURL();
    saveState();
    load();
  });

  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.tab === tab) return;
      setTab(b.dataset.tab);
      writeURL();
      saveState();
      load();
    });
  });

  window.addEventListener('popstate', hydrate);
  hydrate();
})();
