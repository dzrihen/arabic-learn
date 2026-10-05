/* Speech: cached MP3/OGG when available, else Web Speech TTS (ar-JO Levantine) */
(function (global) {
  "use strict";

  let preferredVoice = null;
  let voicesReady = false;
  let userGesture = false;
  let audioUnlocked = false;
  let audioManifest = null; // { hash: "audio/....mp3" }
  let manifestPromise = null;
  let currentAudio = null;
  let playGen = 0;
  const preloadCache = new Map(); // hash -> HTMLAudioElement
  const SILENT_WAV =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

  function markGesture() {
    userGesture = true;
    unlockAudio();
  }
  if (typeof document !== "undefined") {
    ["pointerdown", "keydown", "touchstart", "click"].forEach((ev) => {
      document.addEventListener(ev, markGesture, { once: false, capture: true, passive: true });
    });
  }

  /** Unlock mobile autoplay: play a tiny silent clip inside a user gesture. */
  function unlockAudio() {
    userGesture = true;
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      const a = new Audio(SILENT_WAV);
      a.volume = 0.01;
      const p = a.play();
      if (p && p.then) p.catch(function () {});
    } catch (e) {}
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        if (ctx.state === "suspended") ctx.resume().catch(function () {});
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(0);
        osc.stop(0.01);
        setTimeout(function () {
          try {
            ctx.close();
          } catch (e2) {}
        }, 50);
      }
    } catch (e) {}
  }

  function scoreVoice(v) {
    const name = v.name || "";
    const lang = (v.lang || "").toLowerCase();
    let s = 0;
    if (lang === "ar-jo" || lang === "ar-ps" || lang === "ar-lb" || lang === "ar-sy") s += 22;
    else if (lang === "ar-sa" || lang === "ar-eg") s += 14;
    else if (lang.startsWith("ar")) s += 12;
    if (/google|microsoft|neural|enhanced|premium|natural/i.test(name)) s += 8;
    if (/sana|taim|layla|rami|amany|laith|arabic|عربي|levant|jordan|lebanon|syria|palestine/i.test(name)) s += 10;
    if (/layla|rami|amany|sana/i.test(name) && /ar-lb|ar-sy|ar-jo|lebanon|syria|jordan/i.test(lang + " " + name)) s += 4;
    if (/female|woman|женщин/i.test(name)) s += 2;
    if (/male|nestor|stefanos/i.test(name)) s -= 1;
    if (/compact|online \(natural\) compact/i.test(name)) s -= 2;
    return s;
  }

  function pickVoice() {
    if (typeof speechSynthesis === "undefined") return;
    const voices = speechSynthesis.getVoices() || [];
    const ar = voices.filter(
      (v) => (v.lang || "").toLowerCase().startsWith("ar") || /arabic|عربي|sana|layla|amany/i.test(v.name || "")
    );
    ar.sort((a, b) => scoreVoice(b) - scoreVoice(a));
    preferredVoice = ar[0] || null;
    voicesReady = true;
  }

  if (typeof speechSynthesis !== "undefined") {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  /** Strip non-Arabic noise so Edge/Web TTS gets clean Levantine orthography. */
  function normalizeForTts(text) {
    return String(text || "")
      .normalize("NFC")
      .replace(/[֐-׿]+/g, " ") // Hebrew
      .replace(/[Ͱ-Ͽἀ-῿]+/g, " ") // Greek leftovers
      .replace(/[Ѐ-ӿ]+/g, " ") // Cyrillic leftovers
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ـ+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function learnerRate() {
    try {
      const s = (global.RLProgress && RLProgress.get().settings) || {};
      if (s.speechRate === "normal") return 1.0;
      return 0.88;
    } catch (e) {
      return 0.88;
    }
  }

  /** Stable short hash for audio lookup (djb2 hex). */
  function textHash(text) {
    const s = String(text || "").trim();
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(16);
  }

  function loadManifest() {
    if (audioManifest) return Promise.resolve(audioManifest);
    if (manifestPromise) return manifestPromise;
    if (global.RL_AUDIO_MANIFEST) {
      audioManifest = global.RL_AUDIO_MANIFEST;
      return Promise.resolve(audioManifest);
    }
    manifestPromise = fetch("./audio/manifest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => {
        audioManifest = j || {};
        return audioManifest;
      })
      .catch(() => {
        audioManifest = {};
        return audioManifest;
      });
    return manifestPromise;
  }

  function soundEnabled() {
    try {
      return !global.RLProgress || RLProgress.get().settings.sound !== false;
    } catch (e) {
      return true;
    }
  }

  function toUrl(path) {
    if (!path) return null;
    if (path.startsWith("http") || path.startsWith("./") || path.startsWith("/") || path.startsWith("data:")) {
      return path;
    }
    return "./" + path;
  }

  function resolvePath(man, text, idKey) {
    if (!man) return null;
    if (idKey && man[idKey]) return man[idKey];
    const raw = String(text || "").trim();
    const hash = textHash(raw);
    return man[hash] || man[raw] || null;
  }

  function stop() {
    playGen += 1;
    try {
      if (currentAudio) {
        currentAudio.onended = null;
        currentAudio.onerror = null;
        currentAudio.oncanplay = null;
        currentAudio.pause();
        try {
          currentAudio.src = "";
        } catch (e) {}
        currentAudio = null;
      }
    } catch (e) {}
    try {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    } catch (e) {}
  }

  function playFile(url, rate, gen) {
    return new Promise((resolve) => {
      try {
        if (gen != null && gen !== playGen) {
          resolve({ ok: false, source: "file", cancelled: true });
          return;
        }
        // Stop previous HTMLAudio / TTS but keep this playGen
        try {
          if (currentAudio) {
            currentAudio.onended = null;
            currentAudio.onerror = null;
            currentAudio.pause();
            currentAudio = null;
          }
        } catch (e) {}
        try {
          if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
        } catch (e) {}

        const a = new Audio();
        a.preload = "auto";
        currentAudio = a;
        a.playbackRate = rate != null ? rate : learnerRate();
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          if (currentAudio === a) currentAudio = null;
          resolve({ ok: !!ok, source: "file", cancelled: gen != null && gen !== playGen });
        };
        a.onended = () => done(true);
        a.onerror = () => done(false);
        a.src = url;

        const tryPlay = () => {
          if (settled) return;
          if (gen != null && gen !== playGen) return done(false);
          const p = a.play();
          if (p && p.then) {
            p.catch(() => done(false));
          }
        };

        // Prefer waiting for enough data; avoid the old 900ms false-fail on mobile.
        if (a.readyState >= 2) {
          tryPlay();
        } else {
          a.oncanplay = tryPlay;
          a.load();
        }

        // Safety: if still paused after 8s, treat as failure (404 / network).
        setTimeout(() => {
          if (!settled && (a.paused || a.error)) done(false);
        }, 8000);
      } catch (e) {
        resolve({ ok: false, source: "file" });
      }
    });
  }

  function speakTts(text, opts, gen) {
    if (!text || typeof speechSynthesis === "undefined") {
      return Promise.resolve({ ok: false, source: "tts" });
    }
    opts = opts || {};
    return new Promise((resolve) => {
      try {
        if (gen != null && gen !== playGen) {
          resolve({ ok: false, source: "tts", cancelled: true });
          return;
        }
        if (!preferredVoice) pickVoice();
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(normalizeForTts(text));
        u.lang = "ar-JO";
        u.rate = opts.rate != null ? opts.rate : learnerRate();
        u.pitch = opts.pitch != null ? opts.pitch : 1;
        if (preferredVoice) u.voice = preferredVoice;
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          resolve({ ok: !!ok, source: "tts" });
        };
        u.onend = () => done(true);
        u.onerror = () => done(false);
        speechSynthesis.speak(u);
        // Chrome sometimes needs a kick after cancel
        setTimeout(() => {
          if (settled) return;
          if (gen != null && gen !== playGen) return done(false);
          if (!speechSynthesis.speaking && !speechSynthesis.pending) {
            try {
              speechSynthesis.speak(u);
            } catch (e2) {}
          }
        }, 40);
        setTimeout(() => {
          if (!settled && !speechSynthesis.speaking && !speechSynthesis.pending) {
            done(false);
          }
        }, 1200);
      } catch (e) {
        resolve({ ok: false, source: "tts" });
      }
    });
  }

  function speak(text, opts) {
    opts = opts || {};
    if (!text) return Promise.resolve({ ok: false });
    if (!soundEnabled() && !opts.force) return Promise.resolve({ ok: false });

    const rate = opts.rate != null ? opts.rate : learnerRate();
    const idKey = opts.audioId || null;
    const gen = ++playGen;

    // Always stop previous clip / utterance before starting a new one
    try {
      if (currentAudio) {
        currentAudio.onended = null;
        currentAudio.onerror = null;
        currentAudio.pause();
        currentAudio = null;
      }
    } catch (e) {}
    try {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    } catch (e) {}

    return loadManifest().then((man) => {
      if (gen !== playGen) return { ok: false, cancelled: true };
      const path = resolvePath(man, text, idKey);
      if (path) {
        const url = toUrl(path);
        return playFile(url, rate, gen).then((r) => {
          if (gen !== playGen) return { ok: false, cancelled: true };
          if (r && r.cancelled) return { ok: false, cancelled: true };
          if (r && r.ok) return r;
          // 404 / decode / autoplay error → TTS fallback (only if still current gen)
          return speakTts(text, opts, gen);
        });
      }
      return speakTts(text, opts, gen);
    });
  }

  function autoPlay(text, opts) {
    if (!text) return Promise.resolve({ ok: false, blocked: false });
    if (!soundEnabled()) return Promise.resolve({ ok: false, blocked: false });
    return speak(text, opts).then((r) => ({
      ok: !!(r && r.ok),
      blocked: !(r && r.ok) && !userGesture,
      needsGesture: !userGesture,
      source: r && r.source,
    }));
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function preload(text) {
    if (!text) return;
    const key = textHash(text);
    if (preloadCache.has(key)) return;
    loadManifest().then((man) => {
      const path = resolvePath(man, text, null);
      if (!path) return;
      try {
        const a = new Audio();
        a.preload = "auto";
        a.src = toUrl(path);
        preloadCache.set(key, a);
        if (preloadCache.size > 24) {
          const first = preloadCache.keys().next().value;
          preloadCache.delete(first);
        }
      } catch (e) {}
    });
  }

  async function speakTurns(texts, gapMs, opts) {
    opts = opts || {};
    const list = (texts || []).map((t) => String(t || "").trim()).filter(Boolean);
    const gap = gapMs == null ? 420 : gapMs;
    for (let i = 0; i < list.length; i++) {
      if (typeof opts.onTurn === "function") {
        try {
          opts.onTurn(i, list[i], list.length);
        } catch (e) {}
      }
      if (i + 1 < list.length) preload(list[i + 1]);
      const r = await speak(list[i], opts);
      if (r && r.cancelled) {
        if (typeof opts.onDone === "function") {
          try {
            opts.onDone(false);
          } catch (e2) {}
        }
        return { ok: false, cancelled: true };
      }
      const genAfter = playGen;
      if (i < list.length - 1 && gap > 0) {
        await sleep(gap);
        if (playGen !== genAfter) {
          if (typeof opts.onDone === "function") {
            try {
              opts.onDone(false);
            } catch (e3) {}
          }
          return { ok: false, cancelled: true };
        }
      }
    }
    if (typeof opts.onDone === "function") {
      try {
        opts.onDone(true);
      } catch (e4) {}
    }
    return { ok: true };
  }

  const Rec =
    global.SpeechRecognition || global.webkitSpeechRecognition || null;

  function canRecognize() {
    return !!Rec;
  }

  function recognizeOnce(timeoutMs) {
    return new Promise((resolve) => {
      if (!Rec) {
        resolve({ ok: false, reason: "unsupported", transcript: "" });
        return;
      }
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        try {
          r.stop();
        } catch (e) {}
        resolve(result);
      };
      const r = new Rec();
      r.lang = "ar-JO";
      r.interimResults = false;
      r.maxAlternatives = 3;
      r.onresult = (ev) => {
        const alts = [];
        for (let i = 0; i < ev.results[0].length; i++) {
          alts.push(ev.results[0][i].transcript);
        }
        finish({ ok: true, transcript: alts[0] || "", alternatives: alts });
      };
      r.onerror = () => finish({ ok: false, reason: "error", transcript: "" });
      r.onend = () => finish({ ok: false, reason: "ended", transcript: "" });
      try {
        r.start();
      } catch (e) {
        finish({ ok: false, reason: "start_failed", transcript: "" });
      }
      setTimeout(() => finish({ ok: false, reason: "timeout", transcript: "" }), timeoutMs || 6000);
    });
  }

  function normalizeRu(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFC")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function looseMatch(heard, expected) {
    const a = normalizeRu(heard);
    const b = normalizeRu(expected);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    const ta = new Set(a.split(" "));
    const tb = b.split(" ");
    const hit = tb.filter((t) => ta.has(t)).length;
    return hit >= Math.ceil(tb.length * 0.6);
  }

  // Prefetch manifest (does not block boot)
  loadManifest();

  global.RLSpeech = {
    speak,
    autoPlay,
    speakTurns,
    stop,
    preload,
    unlockAudio,
    canRecognize,
    recognizeOnce,
    normalizeRu,
    looseMatch,
    textHash,
    loadManifest,
    voicesReady: () => voicesReady,
    preferredVoiceName: () => (preferredVoice && preferredVoice.name) || null,
    hasUserGesture: () => userGesture,
    getRate: learnerRate,
  };
})(window);
