/* Spaced repetition (SM-2 lite) for lemmas — localStorage */
(function (global) {
  "use strict";

  const KEY = "al_srs_v1";
  // Intervals in days for again / good / easy progression
  const STEPS_DAYS = [1, 3, 7, 16, 35];
  const SESSION_SIZE = 15;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { cards: {}, seen: {} };
      const data = JSON.parse(raw);
      return { cards: data.cards || {}, seen: data.seen || {} };
    } catch (e) {
      return { cards: {}, seen: {} };
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  let state = load();

  function now() {
    return Date.now();
  }

  function dayMs(d) {
    return d * 24 * 60 * 60 * 1000;
  }

  function normalizeKey(lemma) {
    return String(lemma || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ς/g, "σ")
      .replace(/[^Ͱ-Ͽἀ-῿\-]/g, "")
      .trim();
  }

  function ensureCard(lemma, he) {
    const k = normalizeKey(lemma);
    if (!k || k.length < 2) return null;
    if (!state.cards[k]) {
      state.cards[k] = {
        lemma: lemma,
        he: he || "",
        step: 0,
        due: now(),
        again: 0,
        good: 0,
        easy: 0,
        last: null,
      };
    } else if (he && !state.cards[k].he) {
      state.cards[k].he = he;
    }
    state.seen[k] = true;
    return state.cards[k];
  }

  /** Call when learner sees a lemma in a lesson (introduces to SRS). */
  function markSeen(lemma, he) {
    const c = ensureCard(lemma, he);
    if (!c) return;
    // First intro: due tomorrow (gentle)
    if (c.last == null && c.step === 0 && c.again === 0 && c.good === 0) {
      c.due = now() + dayMs(1);
    }
    save(state);
  }

  /** Call on failed exercise involving this lemma. */
  function markFail(lemma, he) {
    const c = ensureCard(lemma, he);
    if (!c) return;
    c.step = 0;
    c.due = now() + dayMs(STEPS_DAYS[0]);
    c.again = (c.again || 0) + 1;
    c.last = now();
    save(state);
  }

  /**
   * Review grade: "again" | "good" | "easy"
   */
  function review(lemma, grade) {
    const k = normalizeKey(lemma);
    const c = state.cards[k];
    if (!c) return;
    c.last = now();
    if (grade === "again") {
      c.step = 0;
      c.due = now() + dayMs(STEPS_DAYS[0]);
      c.again = (c.again || 0) + 1;
    } else if (grade === "easy") {
      c.step = Math.min(STEPS_DAYS.length - 1, (c.step || 0) + 2);
      c.due = now() + dayMs(STEPS_DAYS[c.step]);
      c.easy = (c.easy || 0) + 1;
    } else {
      // good
      c.step = Math.min(STEPS_DAYS.length - 1, (c.step || 0) + 1);
      c.due = now() + dayMs(STEPS_DAYS[c.step]);
      c.good = (c.good || 0) + 1;
    }
    save(state);
    return c;
  }

  function dueCards(limit) {
    const t = now();
    const list = Object.keys(state.cards)
      .map((k) => state.cards[k])
      .filter((c) => c && c.due <= t)
      .sort((a, b) => a.due - b.due);
    return list.slice(0, limit == null ? SESSION_SIZE : limit);
  }

  function dueCount() {
    const t = now();
    let n = 0;
    Object.keys(state.cards).forEach((k) => {
      if (state.cards[k].due <= t) n++;
    });
    return n;
  }

  function totalCards() {
    return Object.keys(state.cards).length;
  }

  /** Extract lemma-ish tokens from exercise for SRS tracking. */
  function lemmasFromExercise(ex) {
    const out = [];
    const push = (ru, he) => {
      if (!ru) return;
      const toks = String(ru).match(/[\u0370-\u03FF\u1F00-\u1FFF\-]{2,}/g) || [];
      toks.forEach((w) => out.push({ lemma: w, he: he || "" }));
    };
    if (!ex) return out;
    if (ex.ru) push(ex.ru, ex.he);
    if (ex.sentence) push(ex.sentence.replace(/___/g, ""), ex.he);
    if (ex.answer && /^[\u0370-\u03FF\u1F00-\u1FFF\-]+$/.test(ex.answer)) {
      out.push({ lemma: ex.answer, he: ex.he || "" });
    }
    (ex.words || []).forEach((w) => {
      if (/^[\u0370-\u03FF\u1F00-\u1FFF\-]+$/.test(w)) out.push({ lemma: w, he: ex.he || "" });
    });
    (ex.pairs || []).forEach((p) => push(p.ru, p.he));
    (ex.turns || []).forEach((t) => push(t.ru, t.he));
    return out;
  }

  function trackExerciseResult(ex, ok) {
    const items = lemmasFromExercise(ex);
    const uniq = {};
    items.forEach((it) => {
      const k = normalizeKey(it.lemma);
      if (!k || uniq[k]) return;
      uniq[k] = it;
    });
    Object.keys(uniq).forEach((k) => {
      const it = uniq[k];
      if (ok) markSeen(it.lemma, it.he);
      else markFail(it.lemma, it.he);
    });
  }

  /** Build a mini review lesson from due cards. */
  function buildReviewLesson(limit) {
    const cards = dueCards(limit || SESSION_SIZE);
    if (!cards.length) return null;
    const exercises = [];
    const poolHe = cards.map((x) => x.he).filter(Boolean);
    const poolRu = Object.keys(state.cards)
      .map((k) => state.cards[k].lemma)
      .filter(Boolean);
    cards.forEach((c, i) => {
      const wrongHe = poolHe
        .filter((h) => h && h !== c.he)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      while (wrongHe.length < 3) wrongHe.push(["מילה אחרת", "לא זוכר/ת", "לא רלוונטי"][wrongHe.length]);
      exercises.push({
        type: "listen_choice",
        ru: c.lemma,
        tip: "חזרה מרווחת · כרטיס " + (i + 1) + "/" + cards.length,
        choices: [{ he: c.he || c.lemma, correct: true }].concat(
          wrongHe.map((h) => ({ he: h, correct: false }))
        ),
        _srsLemma: c.lemma,
      });
      if (c.he) {
        const distractors = poolRu
          .filter((w) => w && w.toLowerCase() !== c.lemma.toLowerCase())
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        exercises.push({
          type: "sentence_build",
          he: c.he,
          words: [c.lemma],
          distractors: distractors,
          ru: c.lemma,
          tip: "בחר את המילה בערבית",
          _srsLemma: c.lemma,
        });
      }
    });
    // again / good / easy: after each pair we rely on engine good/again;
    // add explicit easy marker tip on last card
    if (exercises.length) {
      exercises[exercises.length - 1].tip =
        (exercises[exercises.length - 1].tip || "") + " · סימון Easy: הצלחה רצופה";
    }
    return {
      id: "srs-review-" + Date.now(),
      level: "SRS",
      titleHe: "חזרה על מילים",
      titleRu: "مراجعة الكلمات",
      xp: 12,
      exercises: exercises,
      _srs: true,
    };
  }

  global.RLSrs = {
    markSeen,
    markFail,
    review,
    dueCards,
    dueCount,
    totalCards,
    trackExerciseResult,
    buildReviewLesson,
    STEPS_DAYS,
    SESSION_SIZE,
    normalizeKey,
    _state: () => state,
    reload: () => {
      state = load();
    },
  };
})(window);
