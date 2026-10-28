/* Proxy page. Needs common.js loaded first. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var form = $('proxyForm');
  var input = $('urlInput');
  var viewer = $('viewer');
  var empty = $('viewerEmpty');
  var urlLabel = $('viewerURL');
  var status = $('viewerStatus');
  var reopen = $('reopenLast');
  var disabledNotice = $('proxyDisabled');
  var SAVED_KEY = 'ugsw:proxy';
  var proxyOff = false;

  form.action = API_BASE + '/api/proxy';

  function readSaved() {
    try { return localStorage.getItem(SAVED_KEY) || ''; } catch (e) { return ''; }
  }

  function persist(url) {
    try { localStorage.setItem(SAVED_KEY, url); } catch (e) {}
  }

  function writePageURL(url) {
    var params = new URLSearchParams(location.search);
    if (url) params.set('url', url);
    else params.delete('url');
    var search = params.toString().replace(/\+/g, '%20');
    var next = location.pathname + (search ? '?' + search : '');
    if (next === location.pathname + location.search) return;
    try { history.replaceState(null, '', next); } catch (e) {}
  }

  function load(raw) {
    if (proxyOff) {
      disabledNotice.hidden = false;
      status.dataset.state = 'offline';
      status.textContent = 'Disabled';
      return;
    }

    var url = String(raw || '').trim();
    if (!url) return;
    input.value = url;
    persist(url);
    writePageURL(url);
    urlLabel.textContent = url;
    urlLabel.title = url;
    status.dataset.state = 'checking';
    status.textContent = 'Loading';
    empty.hidden = true;
    viewer.hidden = false;
    viewer.src = API_BASE + '/api/proxy?url=' + encodeURIComponent(url);
  }

  viewer.addEventListener('load', function () {
    if (viewer.hidden) return;
    status.dataset.state = 'online';
    status.textContent = 'Frame loaded';
  });

  viewer.addEventListener('error', function () {
    status.dataset.state = 'offline';
    status.textContent = 'Failed';
  });

  form.addEventListener('submit', function (event) {
    if (proxyOff) {
      event.preventDefault();
      disabledNotice.hidden = false;
      return;
    }

    var url = input.value.trim();
    if (!url) return;
    if (event.submitter && event.submitter.formTarget === '_blank') {
      persist(url);
      writePageURL(url);
      return;
    }
    event.preventDefault();
    load(url);
  });

  reopen.addEventListener('click', function () {
    load(input.value || readSaved());
  });

  var params = new URLSearchParams(location.search);
  var initial = params.get('url') || '';
  var saved = readSaved();

  // Ask the backend what it can actually do before asking it to proxy a page.
  UGSW.status().then(function (s) {
    var features = s && s.features;
    if (features && features.proxy === false) {
      proxyOff = true;
      disabledNotice.hidden = false;
      empty.hidden = true;
      input.disabled = true;
      form.querySelector('.searchbar__submit').disabled = true;
      status.dataset.state = 'offline';
      status.textContent = 'Disabled';
      return;
    }

    if (features && features.proxyAuth) {
      status.title = 'This proxy uses HTTP Basic auth; your browser will ask for the password.';
    }

    if (initial) {
      load(initial);
    } else if (saved) {
      input.value = saved;
      reopen.hidden = false;
    }
  });
})();
