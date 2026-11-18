(function () {
  'use strict';

  var Recognition = (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
  var active = null;
  var listening = false;

  function isSupported() {
    return !!Recognition;
  }

  function isListening() {
    return listening;
  }

  function start(handlers) {
    handlers = handlers || {};
    if (!Recognition) {
      if (handlers.onError) handlers.onError('unsupported');
      return false;
    }
    if (listening) return true;
    try {
      var rec = new Recognition();
      rec.lang = handlers.lang || 'zh-CN';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      var finalText = '';
      rec.onstart = function () {
        listening = true;
        if (handlers.onStart) handlers.onStart();
      };
      rec.onresult = function (event) {
        var interim = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var result = event.results[i];
          if (result.isFinal) finalText += result[0].transcript;
          else interim += result[0].transcript;
        }
        var text = (finalText + interim).trim();
        if (handlers.onPartial) handlers.onPartial(text, !finalText);
        if (finalText && handlers.onFinal) handlers.onFinal(finalText.trim());
      };
      rec.onerror = function (event) {
        listening = false;
        if (handlers.onError) handlers.onError(event.error || 'error');
      };
      rec.onend = function () {
        listening = false;
        active = null;
        if (handlers.onEnd) handlers.onEnd(finalText.trim());
      };

      active = rec;
      rec.start();
      return true;
    } catch (err) {
      listening = false;
      if (handlers.onError) handlers.onError('start-failed');
      return false;
    }
  }

  function stop() {
    if (active) {
      try { active.stop(); } catch (err) {}
    }
  }

  var api = { isSupported: isSupported, isListening: isListening, start: start, stop: stop };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LedgerVoice = api;
})();