/* Speech: cached MP3/OGG when available, else Web Speech TTS (ar-JO Levantine) */
(function (global) {
  "use strict";

  let preferredVoice = null;
  let voicesReady = false;
  let userGesture = false;
  let audioManifest = null; // { hash: "audio/....mp3" }
  let manifestPromise = null;
  let currentAudio = null;

  function markGesture() {
    userGesture = true;
  }
  if (typeof document !== "undefined") {
    ["pointerdown", "keydown", "touchstart"].forEach((ev) => {
      document.addEventListener(ev, markGesture, { once: true, capture: true });
    });
  }

  function scoreVoice(v) {
    const name = v.name || "";
    const lang = (v.lang || "").toLowerCase();
    let s = 0;
    if (lang === "ar-jo" || lang === "ar-ps" || lang === "ar-lb" || lang === "ar-sy") s += 22;
    else if (lang === "ar-sa" || lang === "ar-eg") s += 14;
    else if (lang.startsWith("ar")) s += 12;
    if (/google|microsoft|neural|enhanced|premium|natural/i.test(name)) s += 8;
    if (/sana|taim|layla|rami|amany|laith|arabic|عربي|levant|jordan|lebanon|syria|palestine/i.test(name)) s += 8;
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

  function learnerRate() {
    try {
      const s = (global.RLProgress && RLProgress.get().settings) || {};
      if (s.speechRate === "normal") return 1.0;
      return 0.9;
    } catch (e) {
      return 0.9;
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
    manifestPromise = fetch("./audio/manifest.json")
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

  function playFile(url, rate) {
    return new Promise((resolve) => {
      try {
        stop();
        const a = new Audio(url);
        currentAudio = a;
        a.playbackRate = rate != null ? rate : learnerRate();
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          if (currentAudio === a) currentAudio = null;
          resolve({ ok: !!ok, source: "file" });
        };
        a.onended = () => done(true);
        a.onerror = () => done(false);
        const p = a.play();
        if (p && p.then) {
          p.catch(() => done(false));
        }
        setTimeout(() => {
          if (!settled && a.paused) done(false);
        }, 900);
      } catch (e) {
        resolve({ ok: false, source: "file" });
      }
    });
  }

  function speakTts(text, opts) {
    if (!text || typeof speechSynthesis === "undefined") {
      return Promise.resolve({ ok: false, source: "tts" });
    }
    opts = opts || {};
    return new Promise((resolve) => {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text));
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
        setTimeout(() => {
          if (!settled && !speechSynthesis.speaking && !speechSynthesis.pending) {
            done(false);
          }
        }, 700);
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
    const hash = textHash(text);
    const idKey = opts.audioId || null;

    return loadManifest().then((man) => {
      const path =
        (idKey && man[idKey]) ||
        man[hash] ||
        man[String(text).trim()] ||
        null;
      if (path) {
        const url = path.startsWith("http") || path.startsWith("./") || path.startsWith("/")
          ? path
          : "./" + path;
        return playFile(url, rate).then((r) => {
          if (r && r.ok) return r;
          return speakTts(text, opts);
        });
      }
      return speakTts(text, opts);
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

  function stop() {
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
    } catch (e) {}
    try {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    } catch (e) {}
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function speakTurns(texts, gapMs, opts) {
    const list = (texts || []).map((t) => String(t || "").trim()).filter(Boolean);
    const gap = gapMs == null ? 420 : gapMs;
    for (let i = 0; i < list.length; i++) {
      await speak(list[i], opts);
      if (i < list.length - 1 && gap > 0) await sleep(gap);
    }
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

  // prefetch manifest
  loadManifest();

  global.RLSpeech = {
    speak,
    autoPlay,
    speakTurns,
    stop,
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
