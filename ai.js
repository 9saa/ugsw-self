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

  var history = [];
  var busy = false;
  var available = null;

  function setBusy(value) {
    busy = value;
    var disabled = value || available === false;
    input.disabled = disabled;
    send.disabled = disabled;
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
    var body = node.appendChild(el('div', 'chat__text', text || ''));
    log.appendChild(node);
    scrollDown();
    return { node: node, text: body };
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function clearChat() {
    history = [];
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
    var last = messages[messages.length - 1];
    if (context && last && last.role === 'user') {
      last.content = last.content + '\n\n' + context;
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
    if (!text) return;
    input.value = '';
    grow();
    addMessage('user', text);
    history.push({ role: 'user', content: text });
    request(text);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    sendMessage();
  });

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
    }
    setBusy(false);
  });

  renderSuggestions();
  grow();
})();
