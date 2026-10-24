/* Spaced repetition v2 (light FSRS) + personal mistake bank — localStorage + cloud bundle.
 * Shared, identical file in all 4 apps; language specifics come from window.RL_LANG (js/langcfg.js).
 * Backward compatible with v1 state ({cards, seen}) and with the v1 API used by engine/app/cloud-sync. */
(function (global) {
  "use strict";

  const LANG = global.RL_LANG || { code: "el", srsKey: "gl_srs_v1", script: "[\\u0370-\\u03FF\\u1F00-\\u1FFF]" };
  const KEY = LANG.srsKey;
  const BACKUP_KEY = KEY + "_backup";
  const STEPS_DAYS = [1, 3, 7, 16, 35]; // legacy v1 cards
  const SESSION_SIZE = 15;
  const DAY = 24 * 60 * 60 * 1000;
  const SCRIPT_RE = new RegExp(LANG.script);
  const MISTAKE_CLEAR_OKS = 3; // correct answers on different days to leave the bank
  const MISTAKE_MIN_GAP = 20 * 60 * 60 * 1000;

  let saveHook = null;

  function count(s) {
    if (!s || typeof s !== "object") return 0;
    const n = (o) => (o && typeof o === "object" ? Object.keys(o).length : 0);
    return n(s.cards) + n(s.items) + n(s.mistakes);
  }

  function blank() {
    return { v: 2, cards: {}, seen: {}, items: {}, mistakes: {}, seeded: {} };
  }

  function upgrade(data) {
    const s = blank();
    if (!data || typeof data !== "object") return s;
    const obj = (o) => (o && typeof o === "object" && !Array.isArray(o) ? o : {});
    s.cards = obj(data.cards);
    s.seen = obj(data.seen);
    s.items = obj(data.items);
    s.mistakes = obj(data.mistakes);
    s.seeded = obj(data.seeded);
    return s;
  }

  function parse(raw) {
    return upgrade(JSON.parse(raw));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        try {
          const data = parse(raw);
          if (count(data) > 0) {
            try { localStorage.setItem(BACKUP_KEY, raw); } catch (e) {}
            return data;
          }
        } catch (e) {}
      }
      const bak = localStorage.getItem(BACKUP_KEY);
      if (bak) {
        try {
          const data = parse(bak);
          if (count(data) > 0) {
            try { localStorage.setItem(KEY, bak); } catch (e) {}
            return data;
          }
        } catch (e) {}
      }
      if (raw) {
        try { return parse(raw); } catch (e) {}
      }
    } catch (e) {}
    return blank();
  }

  let saveTimer = null;
  function save(st, opts) {
    st = st || state;
    const n = count(st);
    try {
      const existingRaw = localStorage.getItem(KEY);
      if (n === 0 && existingRaw) {
        try { if (count(parse(existingRaw)) > 0) return; } catch (e) {}
      }
      const json = JSON.stringify(st);
      localStorage.setItem(KEY, json);
      if (n > 0) { try { localStorage.setItem(BACKUP_KEY, json); } catch (e2) {} }
    } catch (e) {
      try { if (n > 0) localStorage.setItem(BACKUP_KEY, JSON.stringify(st)); } catch (e2) {}
    }
    if (opts && opts.silent) return;
    // coalesce cloud pushes (many grades per lesson)
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try { if (typeof saveHook === "function") saveHook(state); } catch (e) {}
    }, 400);
  }

  let state = load();

  function now() { return Date.now(); }
  function dayStr(t) {
    const d = new Date(t == null ? now() : t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* ——— normalization ——— */
  function normalizeKey(lemma) { // legacy single-word key (v1 compatible)
    let s = String(lemma || "");
    if (LANG.code === "el") s = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ς/g, "σ").replace(/[^\u0370-\u03FF\u1F00-\u1FFF\-]/g, "");
    else if (LANG.code === "ru") s = s.toLowerCase().replace(/ё/g, "е").replace(/[^\u0400-\u04ff\-]/g, "");
    else {
      s = s.normalize("NFC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه");
      if (LANG.code === "fa") s = s.replace(/ي/g, "ی").replace(/ك/g, "ک");
      else s = s.replace(/ى/g, "ي");
      s = s.replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\-']/g, "");
    }
    return s.trim();
  }

  /** Normalized text used as item key and for fuzzy comparisons. */
  function normText(text) {
    let s = String(text || "");
    if (LANG.code === "el") s = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ς/g, "σ");
    else if (LANG.code === "ru") s = s.toLowerCase().replace(/ё/g, "е");
    else {
      s = s.normalize("NFC").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/\u200C/g, "");
      if (LANG.code === "fa") s = s.replace(/[يى]/g, "ی").replace(/ك/g, "ک");
      else s = s.replace(/ى/g, "ي").replace(/ی/g, "ي").replace(/ک/g, "ك");
    }
    return s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }
  function itemKey(text) { return normText(text); }
  function wordCount(s) { return String(s || "").split(/\s+/).filter((w) => /\p{L}/u.test(w)).length; }

  /* ——— items (sentences / words with a reliable Hebrew meaning) ——— */
  function itemsFromExercise(ex) {
    const out = [];
    if (!ex) return out;
    const seen = {};
    const add = (r, h, main) => {
      r = String(r || "").trim();
      h = String(h || "").trim();
      if (!r || !h || !SCRIPT_RE.test(r)) return;
      const k = itemKey(r);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push({ k: k, r: r, h: h, main: !!main });
    };
    const t = ex.type;
    if (t === "alphabet") { if (ex.example && ex.exampleHe) add(ex.example, ex.exampleHe, true); return out; }
    if (t === "true_false") { add(ex.ru, ex.correctHe, true); return out; }
    if (t === "fill_blank" && ex.sentence && ex.answer) { add(String(ex.sentence).replace("___", ex.answer).replace(/\s+/g, " "), ex.he, true); return out; }
    if (t === "reply_pick") { add(ex.answer || ex.ru, ex.answerHe || ex.he, true); return out; }
    if (Array.isArray(ex.pairs)) { ex.pairs.forEach((p) => p && add(p.ru, p.he, false)); }
    if (Array.isArray(ex.turns)) { ex.turns.forEach((p) => p && add(p.ru, p.he, false)); }
    if (ex.ru && Array.isArray(ex.choices)) {
      const c = ex.choices.find((x) => x && x.correct);
      if (c && c.he) add(ex.ru, c.he, true);
    }
    if (ex.ru && ex.he && !Array.isArray(ex.pairs) && !Array.isArray(ex.turns)) add(ex.ru, ex.he, true);
    return out;
  }

  function touchItem(it, src) {
    let x = state.items[it.k];
    if (!x) {
      x = state.items[it.k] = { r: it.r, h: it.h, s: 1, d: 5, due: now() + DAY, n: 0, l: 0, t: now(), src: src || "" };
      return { x: x, isNew: true };
    }
    if (it.h && !x.h) x.h = it.h;
    return { x: x, isNew: false };
  }

  /** grade: "again" | "good" | "easy" (light FSRS: stability s in days, difficulty d 1..10) */
  function gradeItem(k, grade) {
    const x = state.items[k];
    if (!x) return null;
    const t = now();
    const elapsed = Math.max(0, (t - (x.t || t)) / DAY);
    if (grade === "again") {
      if (x.a && t - x.a < 10 * 60 * 1000) return x; // one lapse per sitting
      x.l = (x.l || 0) + 1;
      x.d = Math.min(10, (x.d || 5) + 1.5);
      x.s = Math.max(0.25, (x.s || 1) * 0.35);
      x.due = t + Math.min(1, Math.max(0.3, x.s)) * DAY;
      x.a = t;
    } else {
      const today = dayStr(t);
      if (grade === "good" && x.g === today) return x; // once per day
      const ready = x.n === 0 || elapsed >= (x.s || 1) * 0.5;
      const factor = grade === "easy" ? 3.5 : 2.2;
      if (ready) {
        const bonus = elapsed >= (x.s || 1) ? 1 : 0.6;
        x.s = Math.min(365, (x.s || 1) * (1 + factor * ((11 - (x.d || 5)) / 10) * bonus));
      }
      x.d = Math.max(1, (x.d || 5) - (grade === "easy" ? 1 : 0.3));
      x.n = (x.n || 0) + 1;
      x.g = today;
      x.due = t + x.s * DAY;
    }
    x.t = t;
    return x;
  }

  /* ——— mistake bank ——— */
  function addMistake(it, type, opts) {
    if (!it || !it.k) return null;
    let m = state.mistakes[it.k];
    if (!m) m = state.mistakes[it.k] = { r: it.r, h: it.h, ty: type || "", n: 0, ok: [], t: now() };
    if (opts && opts.ensureOnly && m.n > 0) return m;
    m.n = (m.n || 0) + 1;
    m.ok = [];
    m.ty = type || m.ty;
    m.t = now();
    return m;
  }
  function mistakeCorrect(k) {
    const m = state.mistakes[k];
    if (!m) return null;
    const t = now();
    const last = m.ok.length ? m.ok[m.ok.length - 1] : 0;
    if (last && (t - last < MISTAKE_MIN_GAP || dayStr(last) === dayStr(t))) return "same-day";
    m.ok.push(t);
    if (m.ok.length >= MISTAKE_CLEAR_OKS) {
      delete state.mistakes[k];
      return "cleared";
    }
    return "progress";
  }
  function mistakes() {
    return Object.keys(state.mistakes).map((k) => Object.assign({ k: k }, state.mistakes[k]))
      .sort((a, b) => (b.n || 0) - (a.n || 0) || (b.t || 0) - (a.t || 0));
  }
  function mistakeCount() { return Object.keys(state.mistakes).length; }

  /** Called by the engine after every answer. ex._failR (match pairs) narrows a failure to one item. */
  function trackExerciseResult(ex, ok, lesson) {
    if (!ex) return;
    const items = itemsFromExercise(ex);
    const src = (lesson && lesson.id) || "";
    const type = ex._origType || ex.type;
    if (ok) {
      items.forEach((it) => {
        const r = touchItem(it, src);
        const wasMistake = !!state.mistakes[it.k];
        if (!r.isNew && (r.x.due <= now() || wasMistake || ex._srsKey === it.k)) gradeItem(it.k, "good");
        if (wasMistake && (it.main || items.length === 1 || ex._srsKey === it.k)) mistakeCorrect(it.k);
      });
    } else {
      let targets = items.filter((it) => it.main);
      if (ex._failR) {
        const fk = itemKey(ex._failR);
        targets = items.filter((it) => it.k === fk);
      }
      if (!targets.length && items.length === 1) targets = items;
      targets.forEach((it) => {
        touchItem(it, src);
        gradeItem(it.k, "again");
        addMistake(it, type);
      });
    }
    save(state);
  }

  /** Match-pairs: a wrong pairing records the target-language item as a mistake (without retrying the whole set). */
  function noteMismatch(pair, ex) {
    if (!pair) return;
    const it = itemsFromExercise({ type: "x", ru: pair.ru, he: pair.he })[0];
    if (!it) return;
    touchItem(it, "");
    gradeItem(it.k, "again");
    addMistake(it, (ex && ex.type) || "match_pairs");
    save(state);
  }

  /** Seed v2 items from lessons already completed before v2 existed (one-time per lesson). */
  function seedFromLessons(lessons) {
    let added = 0;
    (lessons || []).forEach((les, li) => {
      if (!les || !les.id || state.seeded[les.id]) return;
      state.seeded[les.id] = 1;
      (les.exercises || []).forEach((ex) => {
        itemsFromExercise(ex).forEach((it) => {
          if (state.items[it.k]) return;
          // carry over legacy weakness of the words inside
          let again = 0, step = 9;
          it.r.split(/\s+/).forEach((w) => {
            const c = state.cards[normalizeKey(w)];
            if (c) { again = Math.max(again, c.again || 0); step = Math.min(step, c.step || 0); }
          });
          const s = step === 9 ? 1 : Math.max(1, STEPS_DAYS[Math.min(step, 4)] * 0.6);
          state.items[it.k] = {
            r: it.r, h: it.h, s: s, d: again >= 3 ? 7 : 5, n: 1, l: again >= 3 ? 1 : 0, t: now(),
            due: now() + Math.floor(Math.random() * 4 * DAY), src: les.id,
          };
          added++;
        });
      });
    });
    if (added) save(state); else save(state, { silent: true });
    return added;
  }

  /** Items to mix into a regular lesson, strongest need first. opts: {n, maxWords, exclude:{key:1}} */
  function pickForLesson(opts) {
    opts = opts || {};
    const t = now();
    const ex = opts.exclude || {};
    const maxW = opts.maxWords || 99;
    const cand = [];
    Object.keys(state.mistakes).forEach((k) => {
      if (ex[k]) return;
      const m = state.mistakes[k];
      if (wordCount(m.r) > maxW) return;
      const last = m.ok && m.ok.length ? m.ok[m.ok.length - 1] : 0;
      if (last && dayStr(last) === dayStr(t)) return; // already practiced correctly today
      cand.push({ k: k, r: m.r, h: m.h, ty: m.ty, src: "mistake", p: 100 + (m.n || 1) * 10 + Math.random() * 5 });
    });
    Object.keys(state.items).forEach((k) => {
      if (ex[k] || state.mistakes[k]) return;
      const x = state.items[k];
      if (!x || x.due > t || wordCount(x.r) > maxW) return;
      const over = (t - x.due) / DAY / Math.max(0.5, x.s || 1);
      cand.push({ k: k, r: x.r, h: x.h, src: "due", p: 10 + Math.min(20, over * 10) + (x.l || 0) * 6 + ((x.d || 5) - 5) * 2 + Math.random() * 4 });
    });
    cand.sort((a, b) => b.p - a.p);
    return cand.slice(0, opts.n == null ? SESSION_SIZE : opts.n);
  }

  function itemPool(maxWords) {
    return Object.keys(state.items).map((k) => ({ k: k, r: state.items[k].r, h: state.items[k].h }))
      .filter((p) => p.h && (!maxWords || wordCount(p.r) <= maxWords));
  }

  /* ——— v1-compatible API ——— */
  function ensureCard(lemma, he) {
    const k = normalizeKey(lemma);
    if (!k || k.length < 2) return null;
    if (!state.cards[k]) state.cards[k] = { lemma: lemma, he: he || "", step: 0, due: now(), again: 0, good: 0, easy: 0, last: null };
    else if (he && !state.cards[k].he) state.cards[k].he = he;
    state.seen[k] = true;
    return state.cards[k];
  }
  function markSeen(lemma, he) {
    const c = ensureCard(lemma, he);
    if (!c) return;
    if (c.last == null && c.step === 0 && c.again === 0 && c.good === 0) c.due = now() + DAY;
    save(state);
  }
  function markFail(lemma, he) {
    const c = ensureCard(lemma, he);
    if (!c) return;
    c.step = 0; c.due = now() + DAY * STEPS_DAYS[0]; c.again = (c.again || 0) + 1; c.last = now();
    save(state);
  }
  /** review(keyOrLemma, grade): v2 item key first, legacy card otherwise. */
  function review(key, grade) {
    const ik = state.items[key] ? key : itemKey(key);
    if (state.items[ik]) {
      const x = gradeItem(ik, grade);
      if (grade !== "again" && state.mistakes[ik]) mistakeCorrect(ik);
      save(state);
      return x;
    }
    const c = state.cards[normalizeKey(key)];
    if (!c) return;
    c.last = now();
    if (grade === "again") { c.step = 0; c.again = (c.again || 0) + 1; }
    else if (grade === "easy") { c.step = Math.min(4, (c.step || 0) + 2); c.easy = (c.easy || 0) + 1; }
    else { c.step = Math.min(4, (c.step || 0) + 1); c.good = (c.good || 0) + 1; }
    c.due = now() + DAY * STEPS_DAYS[c.step];
    save(state);
    return c;
  }
  function dueItems(limit) {
    const t = now();
    return Object.keys(state.items).map((k) => Object.assign({ k: k }, state.items[k]))
      .filter((x) => x.due <= t).sort((a, b) => a.due - b.due).slice(0, limit == null ? SESSION_SIZE : limit);
  }
  function dueCards(limit) { return dueItems(limit).map((x) => ({ lemma: x.r, he: x.h, key: x.k, due: x.due })); }
  function dueCount() {
    const t = now();
    let n = 0;
    Object.keys(state.items).forEach((k) => { if (state.items[k].due <= t) n++; });
    return n;
  }
  function totalCards() { return Object.keys(state.items).length; }

  /** Optional «חזרה» / «הטעויות שלי» session (built by practice.js; legacy fallback otherwise). */
  function buildReviewLesson(limit, mode) {
    if (global.RLPractice && RLPractice.buildSession) return RLPractice.buildSession(mode || "review", limit || SESSION_SIZE);
    return null;
  }

  function exportState() { return JSON.parse(JSON.stringify(state)); }

  function importState(data) {
    if (!data || typeof data !== "object") throw new Error("srs invalid");
    const next = upgrade(data);
    if (count(next) === 0 && count(state) > 0) return state; // never wipe with empty
    // keep local-only v2 data when a v1 bundle (cards only) arrives from an older client
    if (!data.v && count(state) > 0) {
      next.items = state.items; next.mistakes = state.mistakes; next.seeded = state.seeded;
    }
    state = next;
    save(state, { silent: true });
    return state;
  }

  function setSaveHook(fn) { saveHook = typeof fn === "function" ? fn : null; }

  global.RLSrs = {
    v: 2,
    markSeen, markFail, review, dueCards, dueItems, dueCount, totalCards,
    trackExerciseResult, noteMismatch, buildReviewLesson,
    itemsFromExercise, itemKey, normText, wordCount, gradeItem, addMistake, mistakeCorrect,
    mistakes, mistakeCount, pickForLesson, itemPool, seedFromLessons,
    STEPS_DAYS, SESSION_SIZE, normalizeKey, LANG,
    richness: () => count(state),
    _state: () => state,
    exportState, importState, setSaveHook,
    reload: () => { state = load(); },
    flush: () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; try { saveHook && saveHook(state); } catch (e) {} } },
  };
})(window);
