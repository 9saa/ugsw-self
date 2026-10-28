/* Spotify page. Needs common.js loaded first. */
(function () {
  'use strict';

  var IDLE = 'Search for music, or paste a Spotify link.';
  var RECENT_KEY = 'ugsw:spotify';
  var MAX_RECENT = 8;
  var TYPES = ['all', 'track', 'album', 'playlist', 'artist'];
  var TYPE_NAME = {
    track: 'Track',
    album: 'Album',
    playlist: 'Playlist',
    artist: 'Artist',
    episode: 'Episode',
    show: 'Show'
  };
  var TYPE_PLURAL = {
    track: 'Tracks',
    album: 'Albums',
    playlist: 'Playlists',
    artist: 'Artists'
  };
  var DEFAULT_NOTE = 'Paste any open.spotify.com link to play it directly. Search uses the ' +
                     'backend\'s Spotify API when configured, then a public web index.';

  var $ = function (id) { return document.getElementById(id); };
  var form = $('spotifyForm');
  var input = $('spotifyInput');
  var tabs = document.querySelectorAll('#spotifyTabs [data-type]');
  var results = $('spotifyResults');
  var count = $('spotifyCount');
  var state = $('spotifyState');
  var note = $('spotifyNote');
  var searchState = $('spotifySearchState');
  var featuredSection = $('spotifyFeatured');
  var featuredList = $('spotifyFeaturedList');
  var recentSection = $('spotifyRecent');
  var recentList = $('spotifyRecentList');
  var clearRecent = $('spotifyClearRecent');
  var player = $('spotifyPlayer');
  var playerTitle = $('spotifyPlayerTitle');
  var playerFrame = $('spotifyFrame');
  var playerIframe = $('spotifyIframe');
  var playerOpen = $('spotifyOpen');
  var heading = $('spotifyHeading');

  var type = 'all';
  var query = '';
  var inFlight = null;
  var backendReady = null;

  var FEATURED = [
    { id: '37i9dQZF1DXcBWIGoYBM5M', title: 'Today’s Top Hits' },
    { id: '37i9dQZEVXbMDoHDwVN2tF', title: 'Top 50 - Global' },
    { id: '37i9dQZF1DX0XUsuxWHRQd', title: 'RapCaviar' },
    { id: '37i9dQZF1DWXRqgorJj26U', title: 'Rock Classics' },
    { id: '37i9dQZF1DWWQRwui0ExPn', title: 'lofi beats' },
    { id: '37i9dQZF1DX4sWSpwq3LiO', title: 'Peaceful Piano' },
    { id: '37i9dQZF1DX76Wlfdnj7AP', title: 'Beast Mode' },
    { id: '37i9dQZF1DX4UtSsGT1Sbe', title: 'All Out 80s' }
  ];

  /* ---------- saved items ---------- */
  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    var kind = String(item.type || '').toLowerCase();
    if (!TYPE_NAME[kind] || !item.id) return null;
    var id = String(item.id);
    return {
      id: id,
      type: kind,
      title: typeof item.title === 'string' && item.title ? item.title : TYPE_NAME[kind],
      subtitle: typeof item.subtitle === 'string' ? item.subtitle : '',
      thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : '',
      url: typeof item.url === 'string' && item.url
        ? item.url
        : 'https://open.spotify.com/' + kind + '/' + id,
      embed: typeof item.embed === 'string' && item.embed
        ? item.embed
        : 'https://open.spotify.com/embed/' + kind + '/' + id
    };
  }

  function readRecent() {
    try {
      var list = JSON.parse(localStorage.getItem(RECENT_KEY));
      if (!Array.isArray(list)) return [];
      return list.map(normalizeItem).filter(Boolean).slice(0, MAX_RECENT);
    } catch (e) {
      return [];
    }
  }

  function writeRecent(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch (e) {}
  }

  function addRecent(item) {
    var list = [item].concat(readRecent().filter(function (entry) {
      return !(entry.type === item.type && entry.id === item.id);
    }));
    writeRecent(list);
    renderRecent();
  }

  function renderRecent() {
    var list = readRecent();
    recentList.textContent = '';

    list.forEach(function (item) {
      var button = el('button', 'recent__item recent__item--button');
      button.type = 'button';
      button.title = item.title;
      button.appendChild(el('span', 'recent__code', TYPE_NAME[item.type] || 'Spotify'));
      button.appendChild(el('span', 'recent__name', item.title));

      var go = button.appendChild(el('span', 'recent__go'));
      go.appendChild(document.createTextNode('Play'));
      var arrow = go.appendChild(el('span', '', '→'));
      arrow.setAttribute('aria-hidden', 'true');

      button.addEventListener('click', function () { play(item); });
      recentList.appendChild(button);
    });

    recentSection.hidden = !!query || !list.length;
  }

  function renderFeatured() {
    featuredList.textContent = '';
    FEATURED.forEach(function (entry) {
      var node = card({
        id: entry.id,
        type: 'playlist',
        title: entry.title,
        subtitle: 'Spotify editorial',
        thumbnail: '',
        url: 'https://open.spotify.com/playlist/' + entry.id,
        embed: 'https://open.spotify.com/embed/playlist/' + entry.id
      });
      if (node) featuredList.appendChild(node);
    });
  }

  clearRecent.addEventListener('click', function () {
    try { localStorage.removeItem(RECENT_KEY); } catch (e) {}
    renderRecent();
    clearRecent.blur();
  });

  /* ---------- link parsing ---------- */
  function parseSpotifyInput(raw) {
    var value = String(raw == null ? '' : raw).trim();
    var match = value.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)$/i);
    if (!match) {
      match = value.match(/(?:https?:\/\/)?(?:open\.spotify\.com|play\.spotify\.com)\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/i);
    }
    if (!match) return null;

    var kind = match[1].toLowerCase();
    var id = match[2];
    return {
      id: id,
      type: kind,
      title: '',
      subtitle: '',
      thumbnail: '',
      url: 'https://open.spotify.com/' + kind + '/' + id,
      embed: 'https://open.spotify.com/embed/' + kind + '/' + id
    };
  }

  function looksLikeLink(value) {
    return /^(https?:\/\/|spotify:)/i.test(value) || /open\.spotify\.com|spotify\.link/i.test(value);
  }

  /* ---------- states ---------- */
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

  function render(items) {
    var cards = [];
    items.forEach(function (item) {
      var node = card(item);
      if (node) cards.push(node);
    });

    if (!cards.length) {
      showState('No results for “' + query + '”.');
      return;
    }

    state.hidden = true;
    results.textContent = '';
    count.textContent = String(cards.length).padStart(2, '0') +
      (cards.length === 1 ? ' result' : ' results');
    cards.forEach(function (node) { results.appendChild(node); });
  }

  function card(item) {
    var normalized = normalizeItem(item);
    if (!normalized) return null;

    var c = el('button', 'card is-sq');
    c.type = 'button';
    c.title = normalized.title;

    var thumb = c.appendChild(el('span', 'card__thumb'));
    if (normalized.thumbnail) {
      var img = thumb.appendChild(el('img'));
      img.loading = 'lazy';
      img.alt = '';
      img.src = normalized.thumbnail;
      img.onerror = function () {
        img.remove();
        thumb.classList.add('is-empty');
      };
    } else {
      thumb.classList.add('is-empty');
    }
    thumb.appendChild(el('span', 'card__badge', TYPE_NAME[normalized.type] || 'Spotify'));

    var body = c.appendChild(el('span', 'card__body'));
    body.appendChild(el('span', 'card__title', normalized.title));
    var meta = [normalized.subtitle, TYPE_NAME[normalized.type]].filter(Boolean).join(' · ');
    if (meta) body.appendChild(el('span', 'card__meta', meta));

    c.addEventListener('click', function () { play(normalized); });
    return c;
  }

  /* ---------- player ---------- */
  function play(item) {
    var normalized = normalizeItem(item);
    if (!normalized) return;

    playerTitle.textContent = normalized.title || TYPE_NAME[normalized.type] || 'Spotify';
    playerOpen.href = normalized.url;
    playerFrame.dataset.kind = normalized.type;
    playerIframe.src = normalized.embed + '?utm_source=generator&theme=0';
    if (!player.open) player.showModal();
    addRecent(normalized);
    writeURL(true, normalized.url);

    // A pasted link has no title until the backend resolves its oEmbed data.
    if (!normalized.title || normalized.title === TYPE_NAME[normalized.type]) {
      if (backendReady !== true) return;
      UGSW.apiJSON('/api/spotify/resolve?url=' + encodeURIComponent(normalized.url))
        .then(function (meta) {
          if (!meta || !meta.title) return;
          normalized.title = meta.title;
          if (meta.thumbnail) normalized.thumbnail = meta.thumbnail;
          playerTitle.textContent = meta.title;
          addRecent(normalized);
        })
        .catch(function () {});
    }
  }

  UGSW.onDialogClose(player, function () {
    playerIframe.src = 'about:blank';
    writeURL(true);
  });
  player.addEventListener('click', function (event) {
    if (event.target === player) player.close();
  });

  /* ---------- URL / history ---------- */
  function writeURL(replace, playURL) {
    var params = new URLSearchParams();
    if (query) params.set('q', query);
    if (type !== 'all') params.set('type', type);
    if (playURL) params.set('play', playURL);
    var search = params.toString().replace(/\+/g, '%20');
    var next = location.pathname + (search ? '?' + search : '');
    if (next === location.pathname + location.search) return;
    if (replace) history.replaceState(null, '', next);
    else history.pushState(null, '', next);
  }

  function setType(next) {
    type = TYPES.indexOf(next) !== -1 ? next : 'all';
    tabs.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.type === type));
    });
    heading.textContent = 'Results' + (type === 'all' ? '' : ' · ' + (TYPE_PLURAL[type] || ''));
  }

  function hydrate() {
    var params = new URLSearchParams(location.search);
    var playRaw = params.get('play') || '';
    var nextType = params.get('type') || 'all';
    var nextQuery = (params.get('q') || '').trim();

    setType(nextType);
    query = nextQuery;
    input.value = query;
    renderRecent();
    featuredSection.hidden = !!query;

    if (playRaw) {
      var link = parseSpotifyInput(playRaw);
      if (link) {
        if (query) load();
        play(link);
        return;
      }
    }

    if (query) load();
    else {
      showState(IDLE);
      recentSection.hidden = !readRecent().length;
    }
  }

  /* ---------- search ---------- */
  function load() {
    if (inFlight) inFlight.abort();
    if (!query) {
      renderRecent();
      featuredSection.hidden = false;
      showState(IDLE);
      return;
    }

    featuredSection.hidden = true;
    recentSection.hidden = true;
    var link = parseSpotifyInput(query);
    if (link) {
      play(link);
      return;
    }

    if (looksLikeLink(query)) {
      showState('That does not look like a Spotify link. Use an open.spotify.com track, album, playlist or artist link.');
      return;
    }

    if (backendReady === false) {
      showState('Spotify search is not available on this backend build. Paste an open.spotify.com link to play it directly.');
      return;
    }

    var controller = inFlight = new AbortController();
    showState('Searching Spotify…', true);

    UGSW.apiJSON('/api/spotify/search?q=' + encodeURIComponent(query) +
      '&type=' + encodeURIComponent(type) + '&limit=12', { signal: controller.signal })
      .then(function (data) {
        if (inFlight === controller) inFlight = null;
        note.textContent = data.source === 'web'
          ? 'Results come from a public web index. Playback still uses Spotify’s embed. Paste an exact link if a result is wrong.'
          : DEFAULT_NOTE;
        render(data.items || []);
      })
      .catch(function (error) {
        if (inFlight === controller) inFlight = null;
        if (error.name === 'AbortError') return;
        if (error.status === 404) {
          backendReady = false;
          searchState.dataset.state = 'offline';
          searchState.textContent = 'Needs update';
          showState('This backend build does not expose Spotify search. Paste an open.spotify.com link to play it directly.');
          return;
        }
        if (error.status === 502) {
          showState('Spotify search is unavailable right now (the public index is rate-limited). Paste an open.spotify.com link to play it directly.');
          return;
        }
        showState('Spotify search failed (' + error.message + '). Paste an open.spotify.com link to play it directly.');
      });
  }

  /* ---------- capability probe ---------- */
  function probe() {
    return UGSW.status().then(function (status) {
      var features = status && status.features;
      backendReady = status ? (!features || features.spotify !== false) : null;

      if (!status) {
        searchState.dataset.state = 'offline';
        searchState.textContent = 'Offline';
      } else if (!features || features.spotify === false) {
        searchState.dataset.state = 'offline';
        searchState.textContent = 'Needs update';
      } else if (!features.spotifySearch) {
        searchState.dataset.state = 'idle';
        searchState.textContent = 'Link only';
      } else {
        searchState.dataset.state = 'online';
        searchState.textContent = features.spotifyApi ? 'Spotify API' : 'Web index';
      }
      return status;
    });
  }

  /* ---------- events ---------- */
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var value = input.value.trim();
    if (!value) return;

    var link = parseSpotifyInput(value);
    if (link) {
      play(link);
      return;
    }

    query = value;
    writeURL();
    load();
  });

  tabs.forEach(function (button) {
    button.addEventListener('click', function () {
      if (button.dataset.type === type) return;
      setType(button.dataset.type);
      if (query) {
        writeURL();
        load();
      }
    });
  });

  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !input.value) return;
    event.preventDefault();
    if (inFlight) { inFlight.abort(); inFlight = null; }
    input.value = '';
    query = '';
    writeURL(true);
    renderRecent();
    featuredSection.hidden = false;
    showState(IDLE);
  });

  window.addEventListener('popstate', hydrate);

  /* ---------- boot ---------- */
  renderFeatured();
  renderRecent();
  var params = new URLSearchParams(location.search);
  if (params.get('q') || params.get('play')) {
    probe().then(hydrate);
  } else {
    hydrate();
    probe();
  }
})();
