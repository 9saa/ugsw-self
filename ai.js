/* AI chat page. Needs common.js loaded first. */
(function () {
  'use strict';

  var MAX_HISTORY = 12;
  var SUGGESTIONS = [
    'Recommend a game from the stash for a short break.',
    'Explain what the UGSW proxy does and does not support.',
    'Write a short game pitch about a haunted arcade.',
    'Help me debug a JavaScript function that returns undefined.'
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

  function payload() {
    return history.slice(-MAX_HISTORY).map(function (entry) {
      return { role: entry.role, content: entry.content };
    });
  }

  function request(userText) {
    var pending = addMessage('assistant', 'Thinking…', { pending: true });
    setBusy(true);

    UGSW.apiJSON('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payload() })
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
