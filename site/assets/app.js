/* KLARO — app.js
   1) i18n con autodetección del idioma del navegador
   2) Señales técnicas del dispositivo (lo que el navegador sí entrega)
   3) Análisis real de audio y video en local
   4) Registro de reservas con cola offline
*/
(function () {
  'use strict';

  var CFG = window.KLARO_CONFIG || {};
  var LOCALES = [
    { code: 'es', label: 'Español', short: 'ES' },
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'de', label: 'Deutsch', short: 'DE' },
    { code: 'fr', label: 'Français', short: 'FR' },
    { code: 'it', label: 'Italiano', short: 'IT' },
    { code: 'pt-BR', label: 'Português (BR)', short: 'PT' },
    { code: 'zh-Hans', label: '简体中文', short: '中文' },
    { code: 'ja', label: '日本語', short: 'JA' },
    { code: 'ko', label: '한국어', short: 'KO' }
  ];

  var state = {
    locale: 'es',
    dict: {},
    file: null,
    analysis: null,
    cleanBuffer: null,
    counts: { reserves: 0, offers: 0 },
    behavior: {
      t0: Date.now(),
      maxScroll: 0,
      sections: {},
      ctas: [],
      demoUsed: false,
      analyzed: false,
      langSwitched: false
    }
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var on = function (el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts); };

  /* ── i18n ──────────────────────────────────────────────────────────── */

  function detectLocale() {
    var url = new URLSearchParams(location.search).get('lang');
    if (url && LOCALES.some(function (l) { return l.code === url; })) return url;

    var saved = null;
    try { saved = localStorage.getItem('klaro.locale'); } catch (e) {}
    if (saved && LOCALES.some(function (l) { return l.code === saved; })) return saved;

    var prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
    for (var i = 0; i < prefs.length; i++) {
      var tag = prefs[i];
      if (!tag) continue;
      var base = tag.toLowerCase().split('-')[0];
      var exact = LOCALES.filter(function (l) { return l.code.toLowerCase() === tag.toLowerCase(); })[0];
      if (exact) return exact.code;
      var byBase = LOCALES.filter(function (l) { return l.code.toLowerCase().split('-')[0] === base; })[0];
      if (byBase) {
        // zh-TW / zh-Hant → 简体中文 (única variante china disponible)
        if (base === 'zh') return 'zh-Hans';
        return byBase.code;
      }
    }
    return 'en';
  }

  function interpolate(str, params) {
    if (!params) return str;
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m;
    });
  }

  function t(key, params) {
    var v = state.dict[key];
    if (v === undefined) return key;
    return interpolate(v, params);
  }

  function loadLocale(code) {
    return fetch('assets/i18n/' + code + '.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('i18n ' + code + ' ' + r.status);
        return r.json();
      })
      .then(function (json) {
        state.locale = code;
        state.dict = json;
        try { localStorage.setItem('klaro.locale', code); } catch (e) {}
        document.documentElement.lang = code;
        document.documentElement.setAttribute('data-locale', code);
        render();
      });
  }

  function render() {
    $$('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      var val = state.dict[k];
      if (val === undefined) return;
      el.textContent = interpolate(val, renderParams(k));
    });
    $$('[data-i18n-attr]').forEach(function (el) {
      var spec = el.getAttribute('data-i18n-attr');
      spec.split(',').forEach(function (pair) {
        var parts = pair.split(':');
        var attr = parts[0].trim();
        var key = parts.slice(1).join(':').trim();
        var val = state.dict[key];
        if (val !== undefined) el.setAttribute(attr, interpolate(val, renderParams(key)));
      });
    });
    var cur = LOCALES.filter(function (l) { return l.code === state.locale; })[0];
    if (cur) $('#lang-current').textContent = cur.short;
    renderPlans();
    renderFaq();
    renderSignals();
    renderDataPreview();
    renderRefs();
    renderEyebrow();
  }

  function renderParams(key) {
    var p = {};
    p.credits = (CFG.offer && CFG.offer.trialCredits) || 10;
    p.discount = (CFG.offer && CFG.offer.foundingDiscountPct) || 40;
    p.count = state.counts.reserves > 0 ? state.counts.reserves : '';
    if (key === 'level3.foundingNote') p.credits = (CFG.offer && CFG.offer.foundingCredits) || 120;
    return p;
  }

  function renderEyebrow() {
    var el = $('#hero-eyebrow');
    if (!el) return;
    var tpl = state.dict['hero.eyebrow'] || '';
    var n = state.counts.reserves;
    if (n > 0) {
      el.textContent = interpolate(tpl, { count: n });
    } else if (tpl.indexOf('{count}') > -1 && tpl.indexOf('{count}') > tpl.length * 0.55) {
      el.textContent = tpl.slice(0, tpl.indexOf('{count}')).replace(/[\s·|,-]+$/, '');
    } else {
      el.textContent = interpolate(tpl, { count: '—' });
    }
  }

  function renderRefs() {
    var note = $('#ref-note');
    if (!note) return;
    var ref = new URLSearchParams(location.search).get('ref');
    if (!ref) { note.hidden = true; return; }
    note.hidden = false;
    note.textContent = ref
      ? t('signup.refNote', { ref: ref })
      : t('signup.refNoteGeneric');
  }

  /* ── Planes ────────────────────────────────────────────────────────── */

  function fmtPrice(v, locale) {
    try {
      return new Intl.NumberFormat(locale || state.locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
    } catch (e) { return '$' + v; }
  }

  function renderPlans() {
    var host = $('#plans');
    if (!host) return;
    host.innerHTML = '';
    (CFG.plans || []).forEach(function (plan) {
      var featured = !!plan.featured;
      var price = plan.price;
      var card = document.createElement('article');
      card.className = 'plan' + (featured ? ' is-featured' : '');

      var name = document.createElement('h3');
      name.className = 'plan-name';
      name.textContent = t('level3.' + plan.nameKey);
      if (featured) {
        var badge = document.createElement('span');
        badge.className = 'plan-badge';
        badge.textContent = t('level3.foundingBadge');
        name.appendChild(badge);
      }
      card.appendChild(name);

      var desc = document.createElement('p');
      desc.className = 'plan-desc';
      desc.textContent = t('level3.' + plan.nameKey + 'Desc');
      card.appendChild(desc);

      var pr = document.createElement('div');
      pr.className = 'plan-price';
      var b = document.createElement('b');
      b.textContent = fmtPrice(price);
      pr.appendChild(b);
      if (price > 0) {
        var per = document.createElement('span');
        per.textContent = t('level3.perMonth');
        pr.appendChild(per);
      }
      card.appendChild(pr);

      var ul = document.createElement('ul');
      ul.className = 'plan-features';
      [
        t('level3.featureCredits', { credits: plan.credits }),
        t('level3.featurePrice'),
        t('level3.featureSupport'),
        t('level3.featureExport')
      ].forEach(function (txt) {
        var li = document.createElement('li');
        li.textContent = txt;
        ul.appendChild(li);
      });
      card.appendChild(ul);

      var btn = document.createElement('a');
      btn.className = 'btn ' + (featured ? 'btn-primary' : 'btn-ghost');
      btn.href = '#signup';
      btn.textContent = t('level3.ctaCurrent');
      btn.addEventListener('click', function () {
        state.behavior.ctas.push('plan:' + plan.id);
        var sel = $('#f-role');
        if (sel) sel.dataset.plan = plan.id;
      });
      card.appendChild(btn);

      host.appendChild(card);
    });
  }

  function renderFaq() {
    var host = $('#faq-list');
    if (!host) return;
    host.innerHTML = '';
    for (var i = 1; i <= 6; i++) {
      var q = state.dict['faq.q' + i];
      var a = state.dict['faq.a' + i];
      if (q === undefined) continue;
      var det = document.createElement('details');
      var sum = document.createElement('summary');
      sum.textContent = interpolate(q, {});
      det.appendChild(sum);
      var p = document.createElement('p');
      p.textContent = interpolate(a, {});
      det.appendChild(p);
      host.appendChild(det);
    }
  }

  /* ── Señales del navegador ─────────────────────────────────────────── */

  function collectSignals() {
    var sig = {};
    var nav = navigator;

    sig.device = {
      ua: nav.userAgent,
      platform: nav.platform || '',
      vendor: nav.vendor || '',
      language: nav.language,
      languages: (nav.languages || []).slice(0, 6),
      cores: nav.hardwareConcurrency || null,
      memory: nav.deviceMemory || null,
      touchPoints: nav.maxTouchPoints || 0,
      mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent),
      timezone: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })(),
      utcOffset: new Date().getTimezoneOffset()
    };

    var screen = window.screen || {};
    sig.screen = {
      width: screen.width || null,
      height: screen.height || null,
      availWidth: screen.availWidth || null,
      availHeight: screen.availHeight || null,
      colorDepth: screen.colorDepth || null,
      pixelRatio: window.devicePixelRatio || 1,
      orientation: (screen.orientation && screen.orientation.type) || null
    };

    // GPU
    try {
      var gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      if (gl) {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        sig.gpu = {
          vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          version: gl.getParameter(gl.VERSION),
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
        };
      } else { sig.gpu = null; }
    } catch (e) { sig.gpu = null; }

    // Audio
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        var ac = new AC();
        sig.audio = {
          sampleRate: ac.sampleRate,
          maxChannels: ac.destination.maxChannelCount,
          baseLatency: ac.baseLatency,
          outputLatency: ac.outputLatency || null,
          state: ac.state
        };
        ac.close();
      } else { sig.audio = null; }
    } catch (e) { sig.audio = null; }

    // Códecs
    try {
      var v = document.createElement('video');
      var a = document.createElement('audio');
      var mimes = ['video/mp4;codecs="avc1.42E01E"', 'video/mp4;codecs="avc1.640028"', 'video/webm;codecs="vp9"', 'video/webm;codecs="vp8,opus"', 'video/mp4;codecs="hev1.1.6.L93.B0"', 'video/quicktime'];
      sig.codecs = {
        video: mimes.map(function (m) { return m.split(';')[0].split('/')[1] + ' ' + (v.canPlayType(m) || 'no'); }),
        audio: ['audio/mpeg', 'audio/wav', 'audio/webm;codecs=opus', 'audio/mp4;codecs="mp4a.40.2"'].map(function (m) {
          return m.split(';')[0].split('/')[1] + ' ' + (a.canPlayType(m) || 'no');
        }),
        mediaRecorder: (window.MediaRecorder && MediaRecorder.isTypeSupported)
          ? ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].filter(function (m) { return MediaRecorder.isTypeSupported(m); })
          : []
      };
    } catch (e) { sig.codecs = null; }

    // Conexión
    try {
      var c = nav.connection || nav.mozConnection || nav.webkitConnection;
      sig.network = c ? { effectiveType: c.effectiveType, downlink: c.downlink, rtt: c.rtt, saveData: c.saveData } : null;
    } catch (e) { sig.network = null; }

    // Almacenamiento y misc
    sig.storage = null;
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (e) {
        sig.storage = { quotaMB: e.quota ? Math.round(e.quota / 1048576) : null, usageMB: e.usage ? Math.round(e.usage / 1048576) : null };
      }).catch(function () {});
    }
    sig.misc = {
      cookieEnabled: nav.cookieEnabled,
      doNotTrack: nav.doNotTrack || null,
      prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      webDriver: nav.webdriver === true,
      online: nav.onLine,
      pageUrl: location.href,
      referrer: document.referrer || null
    };
    return sig;
  }

  var SIGNALS = null;

  function renderSignals() {
    var host = $('#signal-list');
    if (!host || !SIGNALS) return;
    host.innerHTML = '';
    var rows = [
      ['level2.signalDevice', signalDevice()],
      ['level2.signalGpu', signalGpu()],
      ['level2.signalAudio', signalAudio()],
      ['level2.signalCodecs', signalCodecs()],
      ['level2.signalScreen', signalScreen()],
      ['level2.signalNetwork', signalNetwork()],
      ['level2.signalBehavior', signalBehavior()],
      ['level2.signalAnalysis', signalAnalysis()]
    ];
    rows.forEach(function (r) {
      var li = document.createElement('li');
      var k = document.createElement('div');
      k.className = 'sig-k';
      var dot = document.createElement('i');
      dot.className = 'sig-dot';
      k.appendChild(dot);
      k.appendChild(document.createTextNode(t(r[0])));
      li.appendChild(k);

      var v = document.createElement('div');
      v.className = 'sig-v';
      v.textContent = r[1];
      li.appendChild(v);

      var d = document.createElement('p');
      d.className = 'sig-d';
      d.textContent = t(r[0] + 'Desc');
      li.appendChild(d);

      host.appendChild(li);
    });
  }

  function signalDevice() {
    var d = SIGNALS.device;
    if (!d) return '—';
    var raw = String(d.platform || '');
    var os = /^Win/i.test(raw) ? 'Windows'
      : /^Mac/i.test(raw) ? 'macOS'
      : /Linux/i.test(raw) ? 'Linux'
      : /Android/i.test(raw) ? 'Android'
      : /iPhone|iPad|iPod/i.test(raw) ? 'iOS'
      : raw || '—';
    return os + ' · ' + (d.cores || '?') + ' ' + t('level2.wordCores') + (d.memory ? ' · ' + d.memory + ' GB' : '') + (d.mobile ? ' · ' + t('level2.wordMobile') : '');
  }
  /* Elimina el contenido de parentesis balanceados: "Vulkan 1.3.0 (SwiftShader (Subzero))" -> "Vulkan 1.3.0" */
  function stripParens(s) {
    var out = '', depth = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(') { depth++; continue; }
      if (ch === ')') { if (depth > 0) depth--; continue; }
      if (depth === 0) out += ch;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function signalGpu() {
    var g = SIGNALS.gpu;
    if (!g) return t('level2.unavailable');
    var s = String(g.renderer || g.vendor || '—').trim();
    // ANGLE: "ANGLE (VENDOR, RENDERER, backend)" -> se queda con RENDERER.
    if (/^ANGLE/i.test(s)) {
      var inner = s.slice(s.indexOf('(') + 1);
      var parts = [];
      var depth = 0, cur = '';
      for (var i = 0; i < inner.length; i++) {
        var ch = inner[i];
        if (ch === '(') depth++;
        if (ch === ')') { if (depth === 0) break; depth--; }
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
        cur += ch;
      }
      parts.push(cur);
      if (parts.length >= 2) {
        // el renderizador real es la penultima parte; la ultima suele ser el backend
        var cand = stripParens(parts[parts.length - 2]).replace(/^ANGLE\s*/i, '').trim();
        if (cand) return cand.slice(0, 64);
      }
    }
    var out = stripParens(s);
    return (out || t('level2.unavailable')).slice(0, 64);
  }
  function signalAudio() {
    var a = SIGNALS.audio;
    if (!a) return t('level2.unavailable');
    return a.sampleRate + ' Hz · ' + a.maxChannels + ' ' + t('level2.wordChannels') + (a.outputLatency ? ' · ' + Math.round(a.outputLatency * 1000) + ' ms' : '');
  }
  function signalCodecs() {
    var c = SIGNALS.codecs;
    if (!c) return t('level2.unavailable');
    var ok = c.video.filter(function (s) { return s.indexOf('no') === -1; }).length;
    return ok + '/' + c.video.length + ' video · ' + c.audio.filter(function (s) { return s.indexOf('no') === -1; }).length + '/' + c.audio.length + ' audio';
  }
  function signalScreen() {
    var s = SIGNALS.screen;
    if (!s) return '—';
    return s.width + '×' + s.height + ' · ' + s.colorDepth + ' bits · @' + s.pixelRatio + 'x';
  }
  function signalNetwork() {
    var n = SIGNALS.network;
    if (!n) return t('level2.unavailable');
    return (n.effectiveType || '?') + (n.downlink ? ' · ' + n.downlink + ' Mb/s' : '') + (n.rtt ? ' · ' + n.rtt + ' ms' : '');
  }
  function signalBehavior() {
    var b = state.behavior;
    var secs = Math.round((Date.now() - b.t0) / 1000);
    var depth = Math.round(b.maxScroll * 100);
    return secs + ' s · scroll ' + depth + '% · ' + Object.keys(b.sections).length + ' ' + t('level2.wordSections');
  }
  function signalAnalysis() {
    var a = state.analysis;
    if (!a) return t('level2.noFile');
    return a.durationLabel + ' · ' + a.silenceSeconds.toFixed(1) + ' ' + t('level2.wordSilence') + ' · ' + t('level2.wordPeak') + ' ' + a.peakDb.toFixed(1) + ' dBFS';
  }

  function renderDataPreview() {
    var host = $('#data-preview');
    if (!host) return;
    host.innerHTML = '';
    var rows = [
      ['Email', t('level2.previewEmail')],
      [t('level2.previewLocale'), state.locale],
      [t('level2.previewSystem'), signalDevice()],
      ['GPU', signalGpu()],
      [t('level2.previewAudio'), signalAudio()],
      [t('level2.previewScreen'), signalScreen()],
      [t('level2.previewCodecs'), signalCodecs()],
      [t('level2.previewBehavior'), signalBehavior()]
    ];
    if (state.analysis) rows.push([t('level2.previewFile'), state.analysis.name]);
    rows.forEach(function (r) {
      var li = document.createElement('li');
      var a = document.createElement('span'); a.textContent = r[0];
      var b = document.createElement('span'); b.textContent = r[1];
      li.appendChild(a); li.appendChild(b);
      host.appendChild(li);
    });
  }

  /* ── Análisis de audio ─────────────────────────────────────────────── */

  function biquadCoefs(type, f0, Q, gainDb, fs) {
    var w0 = 2 * Math.PI * f0 / fs;
    var cw = Math.cos(w0), sw = Math.sin(w0);
    var alpha = sw / (2 * Q);
    var b0, b1, b2, a0, a1, a2;
    if (type === 'highpass') {
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    } else { // highshelf, gainDb
      var A = Math.pow(10, gainDb / 40);
      var alphaS = sw / 2 * Math.sqrt(2);
      var sq = 2 * Math.sqrt(A) * alphaS;
      b0 = A * ((A + 1) + (A - 1) * cw + sq);
      b1 = -2 * A * ((A - 1) + (A + 1) * cw);
      b2 = A * ((A + 1) + (A - 1) * cw - sq);
      a0 = (A + 1) - (A - 1) * cw + sq;
      a1 = 2 * ((A - 1) - (A + 1) * cw);
      a2 = (A + 1) - (A - 1) * cw - sq;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }

  function applyBiquad(buf, coefs) {
    var b0 = coefs[0], b1 = coefs[1], b2 = coefs[2], a1 = coefs[3], a2 = coefs[4];
    for (var ch = 0; ch < buf.numberOfChannels; ch++) {
      var x = buf.getChannelData(ch);
      var x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (var i = 0; i < x.length; i++) {
        var xn = x[i];
        var yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = xn; y2 = y1; y1 = yn;
        x[i] = yn;
      }
    }
  }

  function analyzeAudioBuffer(audioBuffer) {
    var fs = audioBuffer.sampleRate;
    var frames = audioBuffer.length;

    // Nivel crudo: pico y RMS global
    var peak = 0, sumSq = 0, clipped = 0;
    var ch0 = audioBuffer.getChannelData(0);
    for (var i = 0; i < frames; i += 4) {
      var v = ch0[i];
      var av = v < 0 ? -v : v;
      if (av > peak) peak = av;
      if (av >= 0.999) clipped++;
      sumSq += v * v;
    }
    var nSampled = Math.ceil(frames / 4);
    var rms = Math.sqrt(sumSq / Math.max(1, nSampled));
    var peakDb = 20 * Math.log10(Math.max(peak, 1e-7));
    var rmsDb = 20 * Math.log10(Math.max(rms, 1e-7));

    // Loudness con K-weighting (aprox. BS.1770) + gating
    var kd = new AudioBuffer({
      length: frames, sampleRate: fs, numberOfChannels: Math.min(2, audioBuffer.numberOfChannels)
    });
    for (var c = 0; c < kd.numberOfChannels; c++) kd.copyToChannel(audioBuffer.getChannelData(Math.min(c, audioBuffer.numberOfChannels - 1)), c);
    applyBiquad(kd, biquadCoefs('highshelf', 1681.97, 0.7071, 4, fs));
    applyBiquad(kd, biquadCoefs('highpass', 38.135, 0.5, 0, fs));

    var blockLen = Math.floor(fs * 0.4);
    var hop = Math.floor(fs * 0.1);
    var blocks = [];
    for (var p = 0; p + blockLen < kd.length; p += hop) {
      var z = 0;
      for (var cc = 0; cc < kd.numberOfChannels; cc++) {
        var d = kd.getChannelData(cc);
        for (var q = p; q < p + blockLen; q++) z += d[q] * d[q];
      }
      blocks.push(z / blockLen);
    }
    var lufs = -70;
    if (blocks.length) {
      var mean = blocks.reduce(function (a, b) { return a + b; }, 0) / blocks.length;
      var gated = blocks.filter(function (z) { return z > Math.pow(10, (-70 + 0.691) / 10); });
      if (!gated.length) gated = blocks;
      var m2 = gated.reduce(function (a, b) { return a + b; }, 0) / gated.length;
      var rel = m2 * Math.pow(10, -10 / 10);
      var gated2 = gated.filter(function (z) { return z > rel; });
      var m3 = gated2.length ? gated2.reduce(function (a, b) { return a + b; }, 0) / gated2.length : m2;
      lufs = -0.691 + 10 * Math.log10(Math.max(m3, 1e-12));
    }

    // Silencios: energía por frame de 1024 muestras
    var fLen = 1024;
    var thr = Math.pow(10, -45 / 20);
    var silences = [];
    var runStart = -1;
    var minRun = Math.floor(fs * 0.4);   // 400 ms
    var keep = Math.floor(fs * 0.08);    // margen de 80 ms
    for (var f = 0; f + fLen < frames; f += fLen) {
      var s = 0;
      for (var j = f; j < f + fLen; j++) { var vv = ch0[j]; s += vv * vv; }
      var r = Math.sqrt(s / fLen);
      if (r < thr) { if (runStart < 0) runStart = f; }
      else if (runStart >= 0) {
        if (f - runStart >= minRun) silences.push([runStart, f]);
        runStart = -1;
      }
    }
    if (runStart >= 0 && frames - runStart >= minRun) silences.push([runStart, frames]);

    var silenceFrames = 0;
    silences.forEach(function (sg) { silenceFrames += Math.max(0, sg[1] - sg[0] - keep * 2); });

    // Fragmento "limpio": se recortan los silencios detectados
    var segs = [];
    var cursor = 0;
    silences.forEach(function (sg) {
      var start = Math.min(frames, cursor + (sg[0] - cursor));
      var end = Math.min(frames, Math.max(start, sg[0] - keep));
      if (end > start) segs.push([start, end]);
      cursor = Math.max(cursor, sg[1] + keep);
    });
    if (cursor < frames) segs.push([cursor, frames]);

    return {
      peak: peak, peakDb: peakDb, rmsDb: rmsDb, lufs: lufs,
      clipped: clipped, silences: silences, segments: segs,
      silenceSeconds: silenceFrames / fs,
      sampleRate: fs, duration: frames / fs
    };
  }

  /* ── Análisis de video (brillo por cuadro) ─────────────────────────── */

  function analyzeVideoBrightness(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.preload = 'auto'; v.muted = true; v.playsInline = true;
      v.src = url;

      var settled = false;
      function fail() { if (!settled) { settled = true; URL.revokeObjectURL(url); reject(new Error('video-decode')); } }

      v.onerror = fail;
      v.onloadeddata = function () {
        var W = v.videoWidth, H = v.videoHeight;
        var dur = isFinite(v.duration) ? v.duration : 0;
        if (!W || !H) { fail(); return; }

        var canvas = document.createElement('canvas');
        var cw = 160;
        var chh = Math.max(1, Math.round(cw * H / W));
        canvas.width = cw; canvas.height = chh;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });

        var samples = Math.min(24, Math.max(6, Math.round(dur * 2)));
        var lumas = [], blown = [], crushed = [], frames = 0;

        function grabAt(t) {
          return new Promise(function (res) {
            var onSeek = function () {
              v.removeEventListener('seeked', onSeek);
              try {
                ctx.drawImage(v, 0, 0, cw, chh);
                var d = ctx.getImageData(0, 0, cw, chh).data;
                var sum = 0, hi = 0, lo = 0;
                for (var i = 0; i < d.length; i += 4) {
                  var L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                  sum += L;
                  if (L > 250) hi++;
                  if (L < 16) lo++;
                }
                var px = d.length / 4;
                lumas.push(sum / px / 255);
                blown.push(hi / px);
                crushed.push(lo / px);
                frames++;
              } catch (e) { /* frame no disponible */ }
              res();
            };
            v.addEventListener('seeked', onSeek);
            try { v.currentTime = t; } catch (e) { res(); }
            setTimeout(function () { v.removeEventListener('seeked', onSeek); res(); }, 2500);
          });
        }

        var chain = Promise.resolve();
        for (var i = 0; i < samples; i++) {
          (function (idx) {
            chain = chain.then(function () {
              return grabAt(Math.min(Math.max(0, dur * (idx + 0.5) / samples), Math.max(0, dur - 0.05)));
            });
          })(i);
        }

        chain.then(function () {
          settled = true;
          URL.revokeObjectURL(url);
          if (!lumas.length) { reject(new Error('video-decode')); return; }
          var mean = lumas.reduce(function (a, b) { return a + b; }, 0) / lumas.length;
          var varr = lumas.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / lumas.length;
          resolve({
            width: W, height: H, duration: dur, frames: frames,
            meanLuma: mean,
            spread: Math.sqrt(varr),
            minLuma: Math.min.apply(null, lumas),
            maxLuma: Math.max.apply(null, lumas),
            blownAvg: blown.reduce(function (a, b) { return a + b; }, 0) / blown.length,
            crushedAvg: crushed.reduce(function (a, b) { return a + b; }, 0) / crushed.length,
            curve: lumas
          });
        });
      };

      setTimeout(function () { fail(); }, 20000);
    });
  }

  /* ── Dibujo de forma de onda ───────────────────────────────────────── */

  function drawWave(canvas, opts) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#161a20';
    ctx.fillRect(0, 0, W, H);

    var mid = H / 2;
    var peaks = opts.peaks || [];
    var bars = Math.min(180, Math.floor(W / 7));
    var step = W / bars;

    if (!peaks.length) {
      // forma decorativa cuando aún no hay archivo
      for (var i = 0; i < bars; i++) {
        var seed = Math.sin(i * 0.37) * 0.5 + Math.sin(i * 0.11 + 1.3) * 0.35 + Math.sin(i * 0.83 + 2.1) * 0.18;
        var env = 0.35 + 0.65 * Math.abs(Math.sin(i / bars * Math.PI));
        var amp = Math.abs(seed) * env * mid * 0.86;
        var x = i * step;
        var grad = ctx.createLinearGradient(0, mid - amp, 0, mid + amp);
        grad.addColorStop(0, 'rgba(85,196,192,.85)');
        grad.addColorStop(1, 'rgba(85,196,192,.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, mid - amp, Math.max(1.2, step - 2), amp * 2);
      }
      return;
    }

    var sil = opts.silences || [];
    var total = peaks.length;
    peaks.forEach(function (pk, i) {
      var x = i * step;
      var amp = Math.max(1, pk * mid * 0.94);
      var inSilence = false;
      for (var s = 0; s < sil.length; s++) {
        if (i >= sil[s][0] && i < sil[s][1]) { inSilence = true; break; }
      }
      if (inSilence) {
        ctx.fillStyle = 'rgba(232,176,75,.72)';
      } else if (opts.clean) {
        ctx.fillStyle = 'rgba(85,196,192,.9)';
      } else {
        ctx.fillStyle = 'rgba(180,190,200,.5)';
      }
      ctx.fillRect(x, mid - amp, Math.max(1.2, step - 2), amp * 2);
    });

    // línea base
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(0, mid - 0.5, W, 1);
    void total;
  }

  function computePeaks(audioBuffer, count) {
    var ch = audioBuffer.getChannelData(0);
    var block = Math.floor(ch.length / count);
    var peaks = new Array(count);
    for (var i = 0; i < count; i++) {
      var m = 0;
      var start = i * block, end = Math.min(ch.length, start + block);
      for (var j = start; j < end; j += 8) { var v = Math.abs(ch[j]); if (v > m) m = v; }
      peaks[i] = m;
    }
    return peaks;
  }

  /* ── Formato ───────────────────────────────────────────────────────── */

  function fmtTime(sec) {
    if (!isFinite(sec)) return '00:00';
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtDur(sec) {
    if (!isFinite(sec)) return '—';
    if (sec < 60) return sec.toFixed(1) + ' s';
    return fmtTime(sec);
  }

  /* ── Flujo de análisis ─────────────────────────────────────────────── */

  function setStep(id, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-active', 'is-done');
    if (cls) el.classList.add(cls);
  }

  function analyzeFile(file) {
    state.file = file;
    state.behavior.demoUsed = true;
    state.behavior.analyzed = true;

    var prog = $('#progress');
    var nameEl = $('#progress-name');
    prog.hidden = false;
    nameEl.textContent = file.name + ' · ' + (file.size / 1048576).toFixed(1) + ' MB';
    setStep('step-audio', 'is-active');
    $('#progress-fill').style.width = '12%';

    var isVideo = /^video\//.test(file.type) || /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name);
    var audioP = Promise.resolve(null);
    var videoP = Promise.resolve(null);

    if (/^audio\//.test(file.type) || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) {
      audioP = analyzeAudioFile(file);
    } else if (isVideo) {
      audioP = decodeAudioFromFile(file).catch(function () { return null; });
      videoP = analyzeVideoBrightness(file).catch(function (e) { return e && e.message === 'video-decode' ? null : null; });
    } else {
      audioP = decodeAudioFromFile(file).catch(function () { return null; });
    }

    audioP.then(function (res) {
      setStep('step-audio', 'is-done');
      setStep('step-video', 'is-active');
      $('#progress-fill').style.width = '58%';
      if (res) state.analysis = res;
      return videoP;
    }).then(function (vres) {
      setStep('step-video', 'is-done');
      setStep('step-done', 'is-active');
      $('#progress-fill').style.width = '88%';
      if (vres) {
        state.video = vres;
        if (!state.analysis) {
          state.analysis = {
            peak: 0, peakDb: -Infinity, rmsDb: -Infinity, lufs: -70, clipped: 0,
            silences: [], segments: [], silenceSeconds: 0, sampleRate: 48000,
            duration: vres.duration, durationLabel: fmtDur(vres.duration),
            meanLuma: vres.meanLuma, spread: vres.spread,
            blownAvg: vres.blownAvg, crushedAvg: vres.crushedAvg, curve: vres.curve,
            name: state.file ? state.file.name : ''
          };
        } else {
          state.analysis.meanLuma = vres.meanLuma;
          state.analysis.spread = vres.spread;
          state.analysis.blownAvg = vres.blownAvg;
          state.analysis.crushedAvg = vres.crushedAvg;
          state.analysis.curve = vres.curve;
          state.analysis.durationLabel = fmtDur(vres.duration);
        }
      }
      return videoP;
    }).then(function () {
      setStep('step-done', 'is-done');
      $('#progress-fill').style.width = '100%';
      paintReport();
      renderSignals();
      renderDataPreview();
    }).catch(function (err) {
      setStep('step-audio', 'is-done'); setStep('step-video', 'is-done'); setStep('step-done', 'is-active');
      $('#progress-fill').style.width = '100%';
      showToast(t('level1.videoWarning'));
    });
  }

  function decodeAudioFromFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var AC = window.AudioContext || window.webkitAudioContext;
      var ctx = new AC();
      return ctx.decodeAudioData(buf).then(function (audioBuffer) {
        var a = analyzeAudioBuffer(audioBuffer);
        a.audioBuffer = audioBuffer;
        a.name = file.name;
        a.durationLabel = fmtDur(a.duration);
        a.peaks = computePeaks(audioBuffer, 160);
        a.silenceRanges = a.silences.map(function (s) {
          var block = Math.floor(audioBuffer.length / 160);
          return [Math.floor(s[0] / block), Math.floor(s[1] / block)];
        });
        buildCleanBuffer(ctx, audioBuffer, a.segments);
        ctx.close();
        return a;
      });
    });
  }

  function buildCleanBuffer(ctx, audioBuffer, segments) {
    try {
      var fs = audioBuffer.sampleRate;
      var total = 0;
      segments.forEach(function (s) { total += s[1] - s[0]; });
      var out = ctx.createBuffer(audioBuffer.numberOfChannels, Math.max(1, total), fs);
      for (var c = 0; c < audioBuffer.numberOfChannels; c++) {
        var src = audioBuffer.getChannelData(c);
        var dst = out.getChannelData(c);
        var pos = 0;
        segments.forEach(function (s) {
          var len = s[1] - s[0];
          if (len > 0) { dst.set(src.subarray(s[0], s[1]), pos); pos += len; }
        });
      }
      state.cleanBuffer = out;
    } catch (e) { state.cleanBuffer = null; }
  }

  function paintReport() {
    var a = state.analysis;
    var sub = $('#report-sub');
    if (!a) return;

    if (sub) {
      sub.textContent = a.durationLabel
        ? t('level1.reportSub', { duration: a.durationLabel })
        : t('level1.placeholder');
    }

    setVal('#ro-silence', a.silenceSeconds.toFixed(1) + ' s', a.silenceSeconds > 0.8 ? 'warn' : 'good');
    setVal('#ro-lufs', isFinite(a.lufs) ? a.lufs.toFixed(1) + ' LUFS' : '—', a.lufs > -20 && a.lufs < -6 ? 'good' : 'warn');
    setVal('#ro-peak', isFinite(a.peakDb) ? a.peakDb.toFixed(1) + ' dBFS' : '—', a.peakDb > -1 ? 'warn' : '');
    if (a.meanLuma !== undefined) {
      setVal('#ro-bright', (a.meanLuma * 100).toFixed(0) + '%', '');
      setVal('#ro-spread', (a.spread * 100).toFixed(1) + ' pts', a.spread > 0.12 ? 'warn' : 'good');
    } else {
      setVal('#ro-bright', '—', ''); setVal('#ro-spread', '—', '');
    }
    setVal('#ro-clips', a.clipped > 0 ? String(a.clipped) : '0', a.clipped > 0 ? 'warn' : 'good');

    drawWave($('#report-wave'), { peaks: a.peaks, silences: a.silenceRanges });
    drawWave($('#hero-wave'), { peaks: a.peaks, silences: a.silenceRanges });
    $('#hero-panel-meta').textContent = a.name + ' · ' + a.durationLabel;
    $('#hero-time').textContent = fmtTime(a.duration);

    var play = $('#play-clean');
    if (play) play.disabled = !state.cleanBuffer;
  }

  function setVal(sel, text, cls) {
    var el = $(sel);
    if (!el) return;
    el.textContent = text;
    el.className = 'ro-v' + (cls ? ' ' + cls : '');
  }

  /* ── Clip de ejemplo generado en el navegador ───────────────────────── */

  function generateSampleClip() {
    showToast(t('sample.generating'));
    return new Promise(function (resolve, reject) {
      var canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      var ctx = canvas.getContext('2d');
      var stream = canvas.captureStream(30);

      var AC = window.AudioContext || window.webkitAudioContext;
      var actx = new AC();
      var dest = actx.createMediaStreamDestination();
      var osc = actx.createOscillator();
      var gain = actx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 180;
      gain.gain.value = 0;
      osc.connect(gain).connect(dest);
      osc.start();
      stream.addTrack(dest.stream.getAudioTracks()[0]);

      var chunks = [];
      var mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        var blob = new Blob(chunks, { type: 'video/webm' });
        osc.stop(); actx.close();
        resolve(new File([blob], 'klaro-muestra.webm', { type: 'video/webm' }));
      };

      var start = Date.now();
      var DUR = 6000;
      var timer = setInterval(function () {
        var t = (Date.now() - start) / 1000;
        var phase = t % 3;
        // patron: habla, silencio, habla corto, silencio largo
        gain.gain.value = (phase < 1.4 || (phase > 2.0 && phase < 2.6)) ? 0.22 : 0;
        // brillo variable para que se vea el salto de luminancia
        var lum = 0.18 + 0.62 * Math.abs(Math.sin(t * 0.7));
        ctx.fillStyle = 'rgb(' + Math.round(255 * lum * 0.9) + ',' + Math.round(255 * lum) + ',' + Math.round(255 * lum * 1.05) + ')';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(40, canvas.height / 2 - 34, 300, 68);
        ctx.fillStyle = '#e9ecef';
        ctx.font = '600 26px Archivo, sans-serif';
        ctx.fillText('KLARO · muestra', 58, canvas.height / 2 + 9);
        if (t >= DUR / 1000) {
          clearInterval(timer);
          try { mr.stop(); } catch (e) { reject(e); }
        }
      }, 1000 / 30);

      mr.start();
    });
  }

  /* ── Envío de reservas ─────────────────────────────────────────────── */

  function queueKey() { return 'klaro.queue'; }

  function readQueue() {
    try { return JSON.parse(localStorage.getItem(queueKey()) || '[]'); } catch (e) { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(queueKey(), JSON.stringify(q)); } catch (e) {}
  }

  function endpointList() {
    var list = (CFG.endpoints || []).filter(Boolean);
    return list;
  }

  function postJSON(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function postNetlify(payload) {
    var body = new URLSearchParams();
    body.set('form-name', 'signup');
    Object.keys(payload).forEach(function (k) {
      body.set(k, typeof payload[k] === 'string' ? payload[k] : JSON.stringify(payload[k]));
    });
    return fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return 'netlify'; });
  }

  function sendPayload(payload) {
    var eps = endpointList();
    var netlify = CFG.netlifyForms !== false && /(^|\.)netlify\.app$/.test(location.hostname);
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

    var jobs = eps.map(function (u) { return function () { return postJSON(u, payload); }; });
    if (local) jobs.push(function () { return postJSON('/signup', payload); });
    if (netlify) jobs.push(postNetlify);

    function attempt(i) {
      if (i >= jobs.length) return Promise.reject(new Error('no-endpoint'));
      return jobs[i]().catch(function () { return attempt(i + 1); });
    }

    if (!jobs.length) return Promise.reject(new Error('no-endpoint'));

    return attempt(0).then(function (res) {
      state.counts.reserves = (state.counts.reserves || 0) + 1;
      renderEyebrow();
      return res;
    });
  }

  function flushQueue() {
    var q = readQueue();
    if (!q.length) return Promise.resolve();
    var left = [];
    var chain = Promise.resolve();
    q.forEach(function (item) {
      chain = chain.then(function () {
        return sendPayload(item).catch(function () { left.push(item); });
      });
    });
    return chain.then(function () { writeQueue(left); });
  }

  function handleSignup(e) {
    e.preventDefault();
    var form = e.target;
    var email = $('#f-email');
    var consent = $('#f-consent');
    var msg = $('#form-msg');
    msg.className = 'form-msg';
    msg.textContent = '';

    if (!email.value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
      msg.textContent = t('signup.error');
      email.parentElement.classList.add('has-error');
      email.focus();
      return;
    }
    email.parentElement.classList.remove('has-error');
    if (!consent.checked) {
      msg.textContent = t('signup.consent');
      consent.focus();
      return;
    }

    var btn = $('#submit-btn');
    btn.disabled = true;
    btn.textContent = t('signup.submitting');

    var payload = {
      email: email.value.trim(),
      name: ($('#f-name').value || '').trim(),
      role: $('#f-role').value || '',
      useCase: ($('#f-usecase').value || '').trim(),
      consent: true,
      locale: state.locale,
      ts: new Date().toISOString(),
      offer: CFG.offer || null,
      ref: new URLSearchParams(location.search).get('ref') || null,
      source: {
        referrer: document.referrer || null,
        utm: readUTM(),
        path: location.pathname
      },
      signals: SIGNALS,
      behavior: {
        secondsOnPage: Math.round((Date.now() - state.behavior.t0) / 1000),
        maxScrollDepth: Math.round(state.behavior.maxScroll * 100),
        sections: Object.keys(state.behavior.sections),
        ctas: state.behavior.ctas,
        demoUsed: state.behavior.demoUsed,
        analyzed: state.behavior.analyzed,
        langSwitched: state.behavior.langSwitched
      },
      analysis: state.analysis ? {
        fileName: state.analysis.name,
        duration: state.analysis.duration,
        silenceSeconds: state.analysis.silenceSeconds,
        lufs: state.analysis.lufs,
        peakDb: state.analysis.peakDb,
        clipped: state.analysis.clipped,
        meanLuma: state.analysis.meanLuma,
        lumaSpread: state.analysis.spread
      } : null
    };

    sendPayload(payload).then(function () {
      showSuccess(payload.email);
    }).catch(function () {
      // sin endpoint o sin red: se guarda en cola local y se reintenta
      var q = readQueue();
      q.push(payload);
      writeQueue(q);
      showSuccess(payload.email, true);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = t('signup.submit');
    });
  }

  function showSuccess(email, queued) {
    var form = $('#signup-form');
    var succ = $('#success');
    form.hidden = true;
    succ.hidden = false;
    var body = $('#success-body');
    body.textContent = t('signup.successBody', {
      email: email,
      credits: (CFG.offer && CFG.offer.trialCredits) || 10
    });
    if (queued) showToast(t('toast.queued'));
    else showToast(t('toast.sent'));
    flushQueue();
  }

  function readUTM() {
    var p = new URLSearchParams(location.search);
    var out = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref'].forEach(function (k) {
      if (p.get(k)) out[k] = p.get(k);
    });
    return out;
  }

  /* ── Comportamiento y eventos ──────────────────────────────────────── */

  function initBehavior() {
    var sections = ['demo', 'engine', 'price', 'signup', 'faq'];
    var onScroll = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      state.behavior.maxScroll = Math.max(state.behavior.maxScroll, max > 0 ? doc.scrollTop / max : 0);
      sections.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.7) state.behavior.sections[id] = true;
      });
    };
    on(window, 'scroll', onScroll, { passive: true });
    onScroll();

    $$('a.btn, button.btn').forEach(function (el) {
      on(el, 'click', function () {
        var label = (el.textContent || '').trim().slice(0, 40);
        state.behavior.ctas.push(label);
      });
    });
  }

  function initExitIntent() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var modal = $('#exit-modal');
    if (!modal) return;
    var shown = false;
    try { shown = sessionStorage.getItem('klaro.exitShown') === '1'; } catch (e) {}
    if (shown) return;

    function open() {
      if (shown) return;
      shown = true;
      try { sessionStorage.setItem('klaro.exitShown', '1'); } catch (e) {}
      var body = $('#exit-body');
      body.textContent = t('exit.body', {
        credits: (CFG.offer && CFG.offer.trialCredits) || 10,
        discount: (CFG.offer && CFG.offer.foundingDiscountPct) || 40,
        count: state.counts.reserves || 50
      });
      modal.hidden = false;
      var first = modal.querySelector('a.btn, button.btn');
      if (first) first.focus();
    }

    on(document, 'mouseout', function (e) {
      if (e.clientY <= 0 && !e.relatedTarget) open();
    });
    on(document, 'keydown', function (e) { if (e.key === 'Escape') modal.hidden = true; });
    on($('#exit-dismiss'), 'click', function () { modal.hidden = true; });
  }

  function showToast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 5200);
  }

  /* ── Selector de idioma ────────────────────────────────────────────── */

  function initLang() {
    var btn = $('#lang-btn');
    var menu = $('#lang-menu');
    if (!btn || !menu) return;

    LOCALES.forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.dataset.locale = l.code;
      var name = document.createElement('span');
      name.textContent = l.label;
      var code = document.createElement('span');
      code.className = 'code';
      code.textContent = l.short;
      b.appendChild(name); b.appendChild(code);
      on(b, 'click', function () {
        state.behavior.langSwitched = true;
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        loadLocale(l.code);
      });
      menu.appendChild(b);
    });

    function markCurrent() {
      $$('button[data-locale]', menu).forEach(function (b) {
        b.setAttribute('aria-current', b.dataset.locale === state.locale ? 'true' : 'false');
      });
    }
    var origRender = render;
    render = function () { origRender(); markCurrent(); };

    on(btn, 'click', function () {
      var open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) markCurrent();
    });
    on(document, 'click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Demo: arrastrar y soltar ──────────────────────────────────────── */

  function initDropzone() {
    var dz = $('#dropzone');
    var input = $('#file-input');
    if (!dz) return;

    on($('#signup-form'), 'submit', handleSignup);

    on($('#pick-file'), 'click', function (e) { e.stopPropagation(); input.click(); });
    on(dz, 'click', function () { input.click(); });
    on(dz, 'keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    on(input, 'change', function () { if (input.files && input.files[0]) analyzeFile(input.files[0]); });

    ['dragenter', 'dragover'].forEach(function (ev) {
      on(dz, ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      on(dz, ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
    });
    on(dz, 'drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) analyzeFile(f);
    });

    on($('#use-sample'), 'click', function (e) {
      e.stopPropagation();
      generateSampleClip().then(analyzeFile).catch(function () { showToast(t('level1.videoWarning')); });
    });

    on($('#play-clean'), 'click', function () {
      if (!state.cleanBuffer) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        var ctx = new AC();
        var src = ctx.createBufferSource();
        src.buffer = state.cleanBuffer;
        src.connect(ctx.destination);
        src.start();
        src.onended = function () { ctx.close(); };
      } catch (e) { showToast(t('level1.videoWarning')); }
    });

    on($('#show-my-data'), 'click', function () {
      var dump = $('#data-dump');
      if (dump) dump.textContent = JSON.stringify(buildPayloadPreview(), null, 2);
      $('#data-modal').hidden = false;
    });
    on($('#data-close'), 'click', function () { $('#data-modal').hidden = true; });
    on($('#data-copy'), 'click', function () {
      var dump = $('#data-dump');
      if (!dump) return;
      if (navigator.clipboard) navigator.clipboard.writeText(dump.textContent);
      showToast(t('toast.copied'));
    });
  }

  function buildPayloadPreview() {
    return {
      locale: state.locale,
      ts: new Date().toISOString(),
      signals: SIGNALS,
      behavior: {
        secondsOnPage: Math.round((Date.now() - state.behavior.t0) / 1000),
        maxScrollDepth: Math.round(state.behavior.maxScroll * 100),
        sections: Object.keys(state.behavior.sections),
        ctas: state.behavior.ctas,
        demoUsed: state.behavior.demoUsed,
        analyzed: state.behavior.analyzed
      },
      analysis: state.analysis ? {
        fileName: state.analysis.name,
        duration: state.analysis.duration,
        silenceSeconds: state.analysis.silenceSeconds,
        lufs: state.analysis.lufs,
        peakDb: state.analysis.peakDb,
        clipped: state.analysis.clipped,
        meanLuma: state.analysis.meanLuma,
        lumaSpread: state.analysis.spread
      } : null,
      queuedLocally: readQueue().length
    };
  }

  /* ── Contador público de reservas ──────────────────────────────────── */

  function fetchCounts() {
    var eps = endpointList();
    for (var i = 0; i < eps.length; i++) {
      var base = eps[i].replace(/\/signup\/?$/, '');
      fetch(base + '/count', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && typeof j.count === 'number') {
            state.counts.reserves = j.count;
            renderEyebrow();
          }
        })
        .catch(function () {});
    }
  }

  /* ── Arranque ──────────────────────────────────────────────────────── */

  function boot() {
    SIGNALS = collectSignals();

    var start = detectLocale();
    var chain = loadLocale(start).catch(function () {
      return loadLocale('en').catch(function () { state.dict = {}; render(); });
    });

    chain.then(function () {
      initLang();
      initDropzone();
      initBehavior();
      initExitIntent();
      $('#year').textContent = new Date().getFullYear();
      fetchCounts();
      flushQueue();
      on(window, 'online', flushQueue);
      on(window, 'pagehide', function () {
        try { localStorage.setItem('klaro.behavior', JSON.stringify(state.behavior)); } catch (e) {}
      });
    });

    // Hero: forma de onda animada una sola vez al cargar
    var hero = $('#hero-wave');
    if (hero) {
      var t0 = performance.now();
      function draw(t) {
        var p = Math.min(1, (t - t0) / 1400);
        drawWave(hero, {});
        hero.style.opacity = String(0.25 + 0.75 * p);
        if (p < 1) requestAnimationFrame(draw);
      }
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(draw);
    }
  }

  if (document.readyState === 'loading') on(document, 'DOMContentLoaded', boot);
  else boot();
})();
