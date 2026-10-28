/* UGSW catalogue. Needs common.js; the game manifest loads before indexing. */
(function () {
  'use strict';

  UGSW.gamesReady(start);

  function showManifestError(error) {
    var kicker = document.getElementById('noResultsKicker');
    var title = document.getElementById('noResultsTitle');
    var text = document.getElementById('noResultsText');
    var state = document.getElementById('noResults');
    var results = document.getElementById('results');
    if (kicker) kicker.textContent = 'Catalogue unavailable';
    if (title) title.textContent = 'Could not load games.json';
    if (text) {
      text.textContent = 'The game list did not load (' +
        (error && error.message ? error.message : 'unknown error') +
        '). Reload the page, or check that games.json sits next to index.html.';
    }
    if (results) results.hidden = true;
    if (state) state.hidden = false;
  }

  function start(error) {
    if (error) return showManifestError(error);

  
    var CHARS = ['#'].concat('0123456789'.split('')).concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
    var TOTAL = UGS_FILES.length;
    var $ = function (id) { return document.getElementById(id); };
  
    var rail = $('rail');
    var input = $('searchInput');
    var clearSearch = $('clearSearch');
    var resultCount = $('resultCount');
    var noResults = $('noResults');
    var noResultsKicker = $('noResultsKicker');
    var noResultsTitle = $('noResultsTitle');
    var noResultsText = $('noResultsText');
    var resetFilters = $('resetFilters');
    var results = $('results');
    var controls = $('controls');
    var recentSection = $('recent');
    var recentList = $('recentList');
    var clearRecent = $('clearRecent');
    var resumeLink = $('resumeLink');
    var resumeName = $('resumeName');
    var resumeWhen = $('resumeWhen');
    var resumeEmpty = $('resumeEmpty');
    var pinCount = $('pinCount');
    var shortcuts = $('shortcuts');
  
    var filterButtons = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
    var layoutButtons = Array.prototype.slice.call(document.querySelectorAll('[data-layout]'));
    var shortcutButtons = Array.prototype.slice.call(document.querySelectorAll('[data-shortcuts]'));
  
    var pinSet = Object.create(null);
    UGSW.pinned().forEach(function (raw) { pinSet[raw] = true; });
  
    var state = { mode: 'all', layout: UGSW.layout() };
  
    try { history.scrollRestoration = 'manual'; } catch (e) {}
  
    /* ---------- index ---------- */
    var byChar = Object.create(null);
    CHARS.forEach(function (c) { byChar[c] = []; });
  
    UGS_FILES.forEach(function (raw) {
      var group = UGSW.groupOf(raw);
      if (!byChar[group]) group = '#';
      var name = UGSW.name(raw);
      byChar[group].push({
        raw: raw,
        name: name,
        code: '',
        key: '',
        lower: name.toLowerCase(),
        initial: initialOf(name)
      });
    });
  
    CHARS.forEach(function (c) {
      byChar[c].forEach(function (item, index) {
        item.code = c + String(index + 1).padStart(3, '0');
        item.key = UGSW.normalize(item.name + ' ' + item.code);
      });
    });
  
    function initialOf(name) {
      var text = String(name).replace(/^[\s"'“”‘’(\[]+/, '');
      var alnum = /[A-Za-z0-9]/.exec(text);
      if (alnum) return alnum[0].toUpperCase();
      var first = text.charAt(0);
      return first ? first.toUpperCase() : '#';
    }
  
    var entryByRaw = Object.create(null);
    var sections = [];
    var fragment = document.createDocumentFragment();
  
    function slug(c) { return c === '#' ? 'other' : c.toLowerCase(); }
    function gamesLabel(n) {
      return UGSW.formatInt(n) + (n === 1 ? ' game' : ' games');
    }
  
    function syncPin(item) {
      var on = pinSet[item.raw] === true;
      item.pinEl.setAttribute('aria-pressed', String(on));
      item.pinEl.setAttribute('aria-label', (on ? 'Unpin ' : 'Pin ') + item.name);
      item.pinEl.title = on ? 'Unpin' : 'Pin';
    }
  
    CHARS.forEach(function (c) {
      var items = byChar[c];
      if (!items.length) return;
  
      var section = el('section', 'group');
      section.id = 'group-' + slug(c);
      section.setAttribute('aria-labelledby', section.id + '-title');
  
      var head = el('div', 'group__head');
      var title = el('h2', '', c === '#' ? '#' : c);
      title.id = section.id + '-title';
      var count = el('span', 'group__count', gamesLabel(items.length));
      head.appendChild(title);
      head.appendChild(count);
  
      var list = el('ul', 'titles');
      items.forEach(function (item) {
        entryByRaw[item.raw] = item;
  
        var li = el('li', 'entry');
        var link = el('a', 'title');
        link.href = UGSW.playURL(item.raw);
        link.setAttribute('data-initial', item.initial);
  
        var code = el('span', 'title__code', item.code);
        var name = el('span', 'title__name', item.name);
        name.title = item.name;
        var go = el('span', 'title__go', '→');
        go.setAttribute('aria-hidden', 'true');
  
        link.appendChild(code);
        link.appendChild(name);
        link.appendChild(go);
  
        var pin = el('button', 'entry__pin');
        pin.type = 'button';
        pin.setAttribute('data-raw', item.raw);
        pin.setAttribute('aria-pressed', 'false');
        pin.setAttribute('aria-label', 'Pin ' + item.name);
        pin.title = 'Pin';
  
        li.appendChild(link);
        li.appendChild(pin);
        list.appendChild(li);
  
        item.el = li;
        item.link = link;
        item.nameEl = name;
        item.pinEl = pin;
        item.marked = false;
        syncPin(item);
      });
  
      section.appendChild(head);
      section.appendChild(list);
      fragment.appendChild(section);
  
      sections.push({
        char: c,
        el: section,
        count: count,
        items: items,
        total: items.length
      });
    });
  
    results.appendChild(fragment);
  
    /* ---------- rail ---------- */
    var sectionsByChar = Object.create(null);
    sections.forEach(function (section) { sectionsByChar[section.char] = section; });
  
    CHARS.forEach(function (c) {
      var section = sectionsByChar[c];
      var button = el('button', 'rail__btn', c === '#' ? '#' : c);
      button.type = 'button';
      if (section) {
        button.title = c + ' — ' + gamesLabel(section.total);
        button.addEventListener('click', function () {
          setCurrent(button);
          section.el.scrollIntoView();
        });
        section.rail = button;
      } else {
        button.disabled = true;
        button.title = c + ' — no files';
      }
      rail.appendChild(button);
    });
  
    var currentRail = null;
    var spyVisible = null;
    function setCurrent(button) {
      if (currentRail === button) return;
      if (currentRail) currentRail.removeAttribute('aria-current');
      currentRail = button || null;
      if (currentRail) currentRail.setAttribute('aria-current', 'true');
    }
  
    function updateRailCurrent() {
      if (!spyVisible) return;
      var best = null;
      sections.forEach(function (section) {
        if (section.el.hidden || !section.rail || !spyVisible.has(section.el)) return;
        if (!best || section.el.offsetTop < best.el.offsetTop) best = section;
      });
      setCurrent(best ? best.rail : null);
    }
  
    if ('IntersectionObserver' in window) {
      spyVisible = new Set();
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) spyVisible.add(entry.target);
          else spyVisible.delete(entry.target);
        });
        updateRailCurrent();
      }, { rootMargin: '0px 0px -82% 0px' });
      sections.forEach(function (section) { spy.observe(section.el); });
    }
  
    /* ---------- recent + last played ---------- */
    var recentItems = [];
  
    function renderRecent() {
      recentItems = UGSW.recent();
      recentList.textContent = '';
      recentItems.forEach(function (raw) {
        var item = entryByRaw[raw];
        if (!item) return;
        var link = el('a', 'recent__item');
        link.href = UGSW.playURL(raw);
        link.appendChild(el('span', 'recent__code', item.code));
        var name = el('span', 'recent__name', item.name);
        name.title = item.name;
        link.appendChild(name);
        var go = el('span', 'recent__go');
        go.appendChild(document.createTextNode('Resume'));
        var arrow = el('span', '', '→');
        arrow.setAttribute('aria-hidden', 'true');
        go.appendChild(arrow);
        link.appendChild(go);
        recentList.appendChild(link);
      });
      recentSection.hidden = !recentItems.length || !!input.value.trim() || state.mode === 'pinned';
    }
  
    function renderLast() {
      var last = UGSW.last();
      var item = last && entryByRaw[last.raw];
      if (item) {
        resumeLink.href = UGSW.playURL(item.raw);
        resumeName.textContent = item.name;
        resumeName.title = item.name;
        resumeWhen.textContent = last.at ? 'Played ' + UGSW.formatDate(last.at) : 'Ready to resume';
        resumeLink.hidden = false;
        resumeEmpty.hidden = true;
      } else {
        resumeLink.hidden = true;
        resumeEmpty.hidden = false;
      }
    }
  
    clearRecent.addEventListener('click', function () {
      UGSW.clearHistory();
      renderRecent();
      renderLast();
      clearRecent.blur();
    });
  
    /* ---------- view state ---------- */
    var savedView = UGSW.view();
    var restored = false;
  
    function saveView() {
      UGSW.saveView(input.value.trim(), window.scrollY, state.mode);
    }
  
    function restoreScroll() {
      if (restored) return;
      restored = true;
      if (!savedView || savedView.q !== input.value.trim()) return;
      if ((savedView.mode || 'all') !== state.mode) return;
      if (location.hash) return;
      var y = savedView.y;
      if (!y) return;
      window.requestAnimationFrame(function () {
        window.scrollTo(0, y);
      });
    }
  
    var saveTimer;
    window.addEventListener('scroll', function () {
      if (saveTimer) return;
      saveTimer = setTimeout(function () {
        saveTimer = null;
        saveView();
      }, 160);
    }, { passive: true });
  
    window.addEventListener('pagehide', saveView);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') saveView();
    });
  
    /* The sticky control block changes height with the viewport; groups use it
       as their scroll margin so an alphabet jump never hides the heading. */
    function measureControls() {
      if (!controls) return;
      var offset = window.innerWidth <= 900 ? 44 : 0;
      document.documentElement.style.setProperty(
        '--controls-h', (controls.offsetHeight + offset) + 'px'
      );
    }
    window.addEventListener('resize', measureControls);
  
    /* ---------- layout + filter controls ---------- */
    function setMode(mode) {
      state.mode = mode === 'pinned' ? 'pinned' : 'all';
      filterButtons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-filter') === state.mode));
      });
      applyFilter();
    }
  
    function setLayout(layout, options) {
      state.layout = layout === 'grid' ? 'grid' : 'list';
      results.classList.toggle('is-grid', state.layout === 'grid');
      layoutButtons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-layout') === state.layout));
      });
      UGSW.saveLayout(state.layout);
      measureControls();
      if (!options || options.save !== false) saveView();
    }
  
    function updatePinCount() {
      var count = Object.keys(pinSet).length;
      if (pinCount) pinCount.textContent = String(count);
      var button = filterButtons[1];
      if (button) button.title = count ? count + ' pinned' : 'No pinned games yet';
    }
  
    filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setMode(button.getAttribute('data-filter'));
        button.blur();
      });
    });
  
    layoutButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setLayout(button.getAttribute('data-layout'));
        button.blur();
      });
    });
  
    results.addEventListener('click', function (event) {
      var pin = event.target.closest ? event.target.closest('.entry__pin') : null;
      if (!pin) return;
      event.preventDefault();
      event.stopPropagation();
      var raw = pin.getAttribute('data-raw');
      if (UGSW.togglePin(raw)) pinSet[raw] = true;
      else delete pinSet[raw];
      var item = entryByRaw[raw];
      if (item) syncPin(item);
      updatePinCount();
      applyFilter();
    });
  
    /* ---------- view ---------- */
    function writeURL(q) {
      var params = new URLSearchParams(location.search);
      if (q) params.set('q', q);
      else params.delete('q');
      if (state.mode === 'pinned') params.set('pins', '1');
      else params.delete('pins');
      var search = params.toString().replace(/\+/g, '%20');
      var next = location.pathname + (search ? '?' + search : '');
      if (next === location.pathname + location.search) return;
      try { history.replaceState(null, '', next); } catch (e) {}
    }
  
    function tokenize(raw) {
      var parts = String(raw || '').toLowerCase().split(/[^a-z0-9]+/);
      var out = [];
      parts.forEach(function (part) {
        if (part) out.push(part);
      });
      return out;
    }
  
    function matches(item, tokens) {
      for (var i = 0; i < tokens.length; i++) {
        if (item.key.indexOf(tokens[i]) === -1) return false;
      }
      return true;
    }
  
    function clearPaint(item) {
      if (!item.marked) return;
      item.nameEl.textContent = item.name;
      item.marked = false;
    }
  
    function paint(item, tokens) {
      if (!tokens.length) { clearPaint(item); return; }
  
      var text = item.name;
      var ranges = [];
  
      tokens.forEach(function (token) {
        var from = 0;
        var index;
        while (token && (index = item.lower.indexOf(token, from)) !== -1) {
          ranges.push([index, index + token.length]);
          from = index + token.length;
        }
      });
  
      if (!ranges.length) { clearPaint(item); return; }
  
      ranges.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
      var merged = [ranges[0]];
      for (var i = 1; i < ranges.length; i++) {
        var last = merged[merged.length - 1];
        if (ranges[i][0] <= last[1]) {
          if (ranges[i][1] > last[1]) last[1] = ranges[i][1];
        } else {
          merged.push(ranges[i]);
        }
      }
  
      var frag = document.createDocumentFragment();
      var pos = 0;
      merged.forEach(function (range) {
        if (range[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, range[0])));
        var mark = document.createElement('mark');
        mark.textContent = text.slice(range[0], range[1]);
        frag.appendChild(mark);
        pos = range[1];
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
  
      item.nameEl.textContent = '';
      item.nameEl.appendChild(frag);
      item.marked = true;
    }
  
    function applyFilter(options) {
      var rawQuery = input.value.trim();
      var tokens = tokenize(rawQuery);
      var pinnedOnly = state.mode === 'pinned';
      var shownTotal = 0;
  
      clearSearch.hidden = !rawQuery;
  
      sections.forEach(function (section) {
        var shown = 0;
        section.items.forEach(function (item) {
          var hit = (!tokens.length || matches(item, tokens)) &&
            (!pinnedOnly || pinSet[item.raw] === true);
          if (item.el.hidden === hit) item.el.hidden = !hit;
          if (hit) {
            shown++;
            paint(item, tokens);
          } else {
            clearPaint(item);
          }
        });
  
        section.el.hidden = !shown;
        if (section.rail) {
          section.rail.disabled = !shown;
          section.rail.title = section.char + ' — ' +
            (shown === section.total ? gamesLabel(section.total) : shown + ' of ' + gamesLabel(section.total));
          if (!shown && section.rail === currentRail) setCurrent(null);
        }
  
        section.count.textContent = shown === section.total
          ? gamesLabel(section.total)
          : shown + ' of ' + gamesLabel(section.total);
  
        shownTotal += shown;
      });
  
      var empty = shownTotal === 0 && (rawQuery !== '' || pinnedOnly);
      noResults.hidden = !empty;
  
      if (empty) {
        if (pinnedOnly) {
          noResultsKicker.textContent = rawQuery ? 'No pinned match' : 'Nothing pinned';
          noResultsTitle.textContent = rawQuery ? '“' + rawQuery + '”' : 'No pins yet';
          noResultsText.textContent = rawQuery
            ? 'No pinned game matches that search. Show all games, or try a shorter title.'
            : 'Use the pin control beside any title to keep it here.';
          resetFilters.textContent = 'Show all games';
        } else {
          noResultsKicker.textContent = 'No match';
          noResultsTitle.textContent = '“' + rawQuery + '”';
          noResultsText.textContent = 'Try a shorter title, a catalogue code such as M014, or clear the search.';
          resetFilters.textContent = 'Clear filters';
        }
      }
  
      if (pinnedOnly && !rawQuery) {
        resultCount.textContent = UGSW.formatInt(shownTotal) + (shownTotal === 1 ? ' pinned game' : ' pinned games');
      } else if (rawQuery) {
        resultCount.textContent = UGSW.formatInt(shownTotal) + ' of ' + UGSW.formatInt(TOTAL) + ' games';
      } else {
        resultCount.textContent = gamesLabel(TOTAL);
      }
  
      recentSection.hidden = !!rawQuery || pinnedOnly || !recentItems.length;
      writeURL(rawQuery);
      updateRailCurrent();
      measureControls();
  
      if (!options || options.save !== false) saveView();
    }
  
    var filterTimer;
    input.addEventListener('input', function () {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(function () { applyFilter(); }, 60);
    });
  
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (input.value) {
          event.preventDefault();
          input.value = '';
          clearTimeout(filterTimer);
          applyFilter();
        } else {
          input.blur();
        }
        return;
      }
  
      if (event.key !== 'Enter' || !input.value.trim()) return;
      event.preventDefault();
      clearTimeout(filterTimer);
      applyFilter();
      var first = results.querySelector('li.entry:not([hidden]) .title');
      if (first) location.assign(first.href);
    });
  
    function resetAll() {
      input.value = '';
      clearTimeout(filterTimer);
      state.mode = 'all';
      filterButtons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-filter') === 'all'));
      });
      applyFilter();
      input.focus();
    }
  
    clearSearch.addEventListener('click', resetAll);
    resetFilters.addEventListener('click', resetAll);
  
    document.querySelectorAll('[data-clear-search]').forEach(function (button) {
      button.addEventListener('click', resetAll);
    });
  
    /* ---------- random ---------- */
    function openRandom() {
      var pick = UGS_FILES[Math.floor(Math.random() * UGS_FILES.length)];
      location.assign(UGSW.playURL(pick));
    }
  
    document.querySelectorAll('[data-random]').forEach(function (button) {
      button.addEventListener('click', openRandom);
    });
  
    /* ---------- keyboard ---------- */
    function openShortcuts() {
      if (!shortcuts) return;
      if (typeof shortcuts.showModal === 'function') {
        if (!shortcuts.open) shortcuts.showModal();
      } else {
        shortcuts.setAttribute('open', '');
      }
    }
  
    shortcutButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        openShortcuts();
        button.blur();
      });
    });
  
    function isTyping(target) {
      if (!target) return false;
      var tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
    }
  
    function visibleTitles() {
      return results.querySelectorAll('li.entry:not([hidden]) .title');
    }
  
    function moveFocus(delta) {
      var list = visibleTitles();
      if (!list.length) return;
      var index = Array.prototype.indexOf.call(list, document.activeElement);
      var next;
      if (index === -1) next = delta > 0 ? 0 : list.length - 1;
      else next = Math.max(0, Math.min(list.length - 1, index + delta));
      list[next].focus();
    }
  
    document.addEventListener('keydown', function (event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (shortcuts && shortcuts.open) return;
      if (document.documentElement.classList.contains('ugsw-locked')) return;
  
      var active = document.activeElement;
      var onTitle = !!(active && active.classList && active.classList.contains('title'));
      var typing = isTyping(event.target);
  
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (typing && event.target !== input) return;
        if (active === input) {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          moveFocus(1);
          return;
        }
        if (onTitle) {
          event.preventDefault();
          moveFocus(event.key === 'ArrowDown' ? 1 : -1);
        }
        return;
      }
  
      if (event.key === 'Home' || event.key === 'End') {
        if (!onTitle) return;
        var list = visibleTitles();
        if (!list.length) return;
        event.preventDefault();
        (event.key === 'Home' ? list[0] : list[list.length - 1]).focus();
        return;
      }
  
      if (typing) return;
  
      var key = event.key.toLowerCase();
      if (key === '?') {
        event.preventDefault();
        openShortcuts();
      } else if (key === 'g') {
        event.preventDefault();
        setLayout(state.layout === 'grid' ? 'list' : 'grid');
      } else if (key === 'p') {
        event.preventDefault();
        setMode(state.mode === 'pinned' ? 'all' : 'pinned');
      } else if (key === 'r') {
        event.preventDefault();
        openRandom();
      } else if (key === 't') {
        var toggle = document.querySelector('[data-theme-toggle]');
        if (toggle) {
          event.preventDefault();
          toggle.click();
        }
      }
    });
  
    /* ---------- hydrate ---------- */
    var params = new URLSearchParams(location.search);
    var initialQuery = params.has('q')
      ? params.get('q')
      : (savedView ? savedView.q : '');
    var initialMode = params.get('pins') === '1'
      ? 'pinned'
      : (savedView && savedView.mode === 'pinned' ? 'pinned' : 'all');
  
    input.value = initialQuery;
    state.mode = initialMode;
    filterButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-filter') === state.mode));
    });
  
    setLayout(state.layout, { save: false });
    $('fileCount').textContent = UGSW.formatInt(TOTAL);
    input.placeholder = 'Search ' + UGSW.formatInt(TOTAL) + ' games by title or code';
    updatePinCount();
  
    renderRecent();
    renderLast();
  
    var sameView = !!savedView && savedView.q === initialQuery && (savedView.mode || 'all') === state.mode;
    applyFilter({ save: false });
    if (!sameView) saveView();
  
    measureControls();
    window.addEventListener('load', function () {
      measureControls();
      restoreScroll();
    }, { once: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measureControls);
    }
  }
})();
