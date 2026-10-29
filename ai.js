/* AI chat page. Needs common.js loaded first. */
(function () {
  'use strict';

  var MAX_HISTORY = 12;
  var SUGGESTIONS = [
    'Reccomend what game to play',
    'Help me with my homework',
    'I dont know what to do for my school project',
    'Give me ideas for a classwork assignment'
  ];

  var $ = function (id) { return document.getElementById(id); };
  var form = $('chatForm');
  var input = $('chatInput');
  var send = $('chatSend');
  var log = $('chatLog');
  var empty = $('chatEmpty');
  var suggestions = $('chatSuggestions');
  var clear = $('clearChat');
  var statusLabel = $('aiStatus');
  var fileInput = $('chatFile');
  var attachBtn = $('chatAttach');
  var thumbs = $('chatThumbs');
  var hint = $('chatHint');

  var history = [];
  var busy = false;
  var available = null;
  var attachments = [];

  var MAX_IMAGES = 4;
  var MAX_EDGE = 1400;
  var MAX_IMAGE_CHARS = 4500000;
  var DEFAULT_HINT = hint ? hint.textContent : '';
  var hintTimer = null;

  function note(message) {
    if (!hint) return;
    hint.textContent = message;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.textContent = DEFAULT_HINT; }, 4000);
  }

  function setBusy(value) {
    busy = value;
    var disabled = value || available === false;
    input.disabled = disabled;
    send.disabled = disabled;
    if (attachBtn) attachBtn.disabled = disabled;
    send.textContent = value ? 'Wait' : 'Send';
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  function grow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 220) + 'px';
  }

  function focusInput() {
    try { input.focus({ preventScroll: true }); } catch (e) {
      try { input.focus(); } catch (e2) {}
    }
  }

  function addMessage(role, text, options) {
    if (empty) empty.hidden = true;
    var classes = 'chat__msg chat__msg--' + role;
    if (options && options.error) classes += ' chat__msg--error';
    if (options && options.pending) classes += ' is-pending';
    var node = el('div', classes);
    node.appendChild(el('span', 'chat__role', role === 'user' ? 'You' : 'Assistant'));
    var body = node.appendChild(el('div', 'chat__text'));

    if (options && options.images && options.images.length) {
      var strip = el('div', 'chat__msg-images');
      options.images.forEach(function (src, index) {
        var image = document.createElement('img');
        image.src = src;
        image.alt = 'Attached image ' + (index + 1);
        strip.appendChild(image);
      });
      body.appendChild(strip);
    }
    if (text) body.appendChild(document.createTextNode(text));

    log.appendChild(node);
    scrollDown();
    return { node: node, text: body };
  }

  /* ---------- attachments ----------
     Shrink on the device before sending: the provider bills per image and the
     Worker caps the request body, so a 12 MP photo would be wasted bytes. */
  function downscale(file) {
    return new Promise(function (resolve, reject) {
      var objectUrl = URL.createObjectURL(file);
      var image = new Image();

      image.onload = function () {
        try {
          var width = image.naturalWidth || image.width || 1;
          var height = image.naturalHeight || image.height || 1;
          var scale = Math.min(1, MAX_EDGE / Math.max(width, height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

          var png = /^image\/png$/i.test(file.type);
          var url = canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85);
          if (url.length > MAX_IMAGE_CHARS) url = canvas.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(objectUrl);
          resolve(url);
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          reject(error);
        }
      };

      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not read that image.'));
      };

      image.src = objectUrl;
    });
  }

  function renderThumbs() {
    if (!thumbs) return;
    thumbs.textContent = '';
    thumbs.hidden = !attachments.length;
    attachments.forEach(function (item, index) {
      var wrap = el('div', 'chat__thumb');
      var image = document.createElement('img');
      image.src = item.url;
      image.alt = 'Attached image ' + (index + 1);
      var remove = el('button', '', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove attached image ' + (index + 1));
      remove.addEventListener('click', function () {
        attachments.splice(index, 1);
        renderThumbs();
        focusInput();
      });
      wrap.appendChild(image);
      wrap.appendChild(remove);
      thumbs.appendChild(wrap);
    });
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (file) {
      return file && /^image\//i.test(file.type || '');
    });
    if (!files.length) {
      note('Only images can be attached.');
      return;
    }

    var room = MAX_IMAGES - attachments.length;
    if (room <= 0) {
      note('You can attach up to ' + MAX_IMAGES + ' images.');
      return;
    }
    if (files.length > room) {
      note('Only the first ' + room + (room === 1 ? ' image was' : ' images were') + ' attached.');
      files = files.slice(0, room);
    }

    Promise.all(files.map(downscale)).then(function (urls) {
      urls.forEach(function (url, index) {
        attachments.push({ url: url, name: files[index].name || 'image' });
      });
      renderThumbs();
      focusInput();
    }).catch(function (error) {
      note(error && error.message ? error.message : 'Could not read that image.');
    });
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function clearChat() {
    history = [];
    attachments = [];
    renderThumbs();
    log.querySelectorAll('.chat__msg').forEach(function (node) { node.remove(); });
    empty.hidden = false;
    input.value = '';
    grow();
    setBusy(false);
    focusInput();
  }

  function renderSuggestions() {
    SUGGESTIONS.forEach(function (text) {
      var button = el('button', 'chat__suggestion', text);
      button.type = 'button';
      button.addEventListener('click', function () { sendMessage(text); });
      suggestions.appendChild(button);
    });
  }

  function payload(context) {
    var messages = history.slice(-MAX_HISTORY).map(function (entry) {
      return { role: entry.role, content: entry.content };
    });

    // Only the newest turn keeps its images: older ones would be re-uploaded on
    // every request, and the Worker caps the body size.
    var lastUser = -1;
    messages.forEach(function (message, index) {
      if (message.role === 'user') lastUser = index;
    });
    messages = messages.map(function (message, index) {
      if (!Array.isArray(message.content) || index === lastUser) return message;
      var text = message.content
        .filter(function (part) { return part.type === 'text'; })
        .map(function (part) { return part.text; })
        .join(' ').trim();
      return { role: message.role, content: text || '[image attached earlier]' };
    });

    var last = messages[messages.length - 1];
    if (context && last && last.role === 'user') {
      if (Array.isArray(last.content)) {
        last.content = last.content.concat([{ type: 'text', text: context }]);
      } else {
        last.content = last.content + '\n\n' + context;
      }
    }
    return messages;
  }

  /* ---------- catalogue context ----------
     The model has no idea what this site hosts, so each message carries
     either the titles that match it or, when someone asks for a
     recommendation, a handful of real titles to choose from. It is told to
     name only those; nothing from the catalogue is sent otherwise. */
  var cataloguePromise = null;
  var wordIndex = null;
  var SUGGESTION_CUES = /(recomm|reccom|suggest|random|pick|choose|what should i play|any good)/i;

  function loadCatalogue() {
    if (cataloguePromise) return cataloguePromise;
    cataloguePromise = UGSW.loadGames().then(function (manifest) {
      return (manifest && manifest.games) || [];
    }).catch(function (error) {
      console.warn('[ai] catalogue unavailable:', error && error.message);
      cataloguePromise = null;
      return [];
    });
    return cataloguePromise;
  }

  function indexCatalogue(games) {
    if (wordIndex) return wordIndex;
    wordIndex = games.map(function (game) {
      var words = Object.create(null);
      String(game.name || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .forEach(function (word) { if (word) words[word] = true; });
      return { game: game, words: words };
    });
    return wordIndex;
  }

  function matchGames(games, text) {
    var tokens = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
    var seen = Object.create(null);
    tokens = tokens.filter(function (token) {
      if (token.length < 4 || seen[token]) return false;
      seen[token] = true;
      return true;
    });
    if (!tokens.length) return [];

    var index = indexCatalogue(games);
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var entry = index[i];
      var score = 0;
      for (var j = 0; j < tokens.length; j++) {
        if (entry.words[tokens[j]]) score++;
      }
      if (score) hits.push({ game: entry.game, score: score });
    }
    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.game.name).length - String(b.game.name).length;
    });
    return hits.slice(0, 12).map(function (hit) { return hit.game; });
  }

  function label(game) {
    var code = '';
    try { code = UGSW.code(game.id); } catch (e) {}
    return game.name + (code ? ' [' + code + ']' : '');
  }

  function sampleGames(games, count) {
    var pool = games.slice();
    var out = [];
    while (pool.length && out.length < count) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return out;
  }

  function catalogueContext(text) {
    return loadCatalogue().then(function (games) {
      if (!games.length) return '';
      var header = 'Site context: this site\'s catalogue has ' +
        UGSW.formatInt(games.length) + ' browser games, each with a code like A001.';

      var matches = matchGames(games, text);
      if (matches.length) {
        return header + ' Titles that match this message: ' +
          matches.map(label).join('; ') +
          '. Use these exact titles and codes when you mention a game, and do not ' +
          'invent titles that are not listed here.';
      }

      if (SUGGESTION_CUES.test(text)) {
        return header + ' The user wants a recommendation and no title matched. ' +
          'Real titles from the catalogue: ' + sampleGames(games, 16).map(label).join('; ') +
          '. Pick one or two from this list and say why; do not invent titles.';
      }

      return '';
    });
  }

  function request(userText) {
    var pending = addMessage('assistant', 'Thinking…', { pending: true });
    setBusy(true);

    catalogueContext(userText).then(function (context) {
      return UGSW.apiJSON('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload(context) })
      });
    }).then(function (data) {
      if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('The server returned an empty reply.');
      }
      pending.text.textContent = data.reply;
      pending.node.classList.remove('is-pending');
      history.push({ role: 'assistant', content: data.reply });
      setBusy(false);
      scrollDown();
      focusInput();
    }).catch(function (error) {
      removeNode(pending.node);

      var message = 'The request failed.';
      if (error && error.status === 503) message = 'AI is not configured on this server yet.';
      else if (error && error.status === 429) message = 'The model is rate-limited. Try again shortly.';
      else if (error && error.status === 502) message = 'The model request failed. Try again.';
      else if (error && error.status === 404) message = 'AI is not available on this backend build.';
      else if (error && error.message) message = error.message;

      var failed = addMessage('assistant', message, { error: true });
      var retry = el('button', 'btn btn--quiet btn--small chat__retry', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', function () {
        removeNode(failed.node);
        request(userText);
      });
      failed.node.appendChild(retry);
      setBusy(false);
      focusInput();
    });
  }

  function sendMessage(raw) {
    if (busy || available === false) return;
    var text = String(raw || input.value || '').trim();
    var images = attachments.slice();
    if (!text && !images.length) return;

    input.value = '';
    attachments = [];
    renderThumbs();
    grow();

    var parts = [];
    if (text) parts.push({ type: 'text', text: text });
    images.forEach(function (item) {
      parts.push({ type: 'image_url', image_url: { url: item.url } });
    });
    var content = parts.length === 1 && parts[0].type === 'text' ? text : parts;

    addMessage('user', text || 'Photo', {
      images: images.map(function (item) { return item.url; })
    });
    history.push({ role: 'user', content: content });
    request(text || 'What is in this image?');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    sendMessage();
  });

  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      addFiles(fileInput.files);
      fileInput.value = '';
    });
  }

  input.addEventListener('input', grow);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  clear.addEventListener('click', clearChat);

  UGSW.status().then(function (status) {
    var features = status && status.features;
    var configured = !!status && !!features && features.ai === true;
    available = configured;

    if (statusLabel) {
      if (!status) {
        statusLabel.dataset.state = 'offline';
        statusLabel.textContent = 'Offline';
      } else if (!configured) {
        statusLabel.dataset.state = 'offline';
        statusLabel.textContent = 'Not configured';
      } else {
        statusLabel.dataset.state = 'online';
        statusLabel.textContent = 'Online';
      }
    }

    if (!configured) {
      input.placeholder = status ? 'AI is not configured on this backend.' : 'Backend offline.';
      suggestions.querySelectorAll('.chat__suggestion').forEach(function (button) { button.disabled = true; });
      if (attachBtn) attachBtn.disabled = true;
    }
    setBusy(false);
  });

  renderSuggestions();
  grow();
})();
