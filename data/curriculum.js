/* Curriculum loader — lazy-loads level part files on demand */
(function (global) {
  "use strict";

  const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const UNLOCK_RATIO = 0.92; // require 92% of previous level

  const LEVEL_INFO = {
    "A1": {
        "titleHe": "מתחילים",
        "subtitleHe": "אלפבית ערבי עד משפטים יומיומיים — יסוד רחב"
    },
    "A2": {
        "titleHe": "יסודי מתקדם",
        "subtitleHe": "עבר, עתיד, השוואות, חיי יום · תרגול יומיומי"
    },
    "B1": {
        "titleHe": "בינוני",
        "subtitleHe": "דעות, נרטיב, אוצר מילים רחב · תרגול יומיומי"
    },
    "B2": {
        "titleHe": "בינוני־גבוה",
        "subtitleHe": "טיעונים, מדיה, מופשט, אוצר מתקדם · תרגול יומיומי"
    },
    "C1": {
        "titleHe": "מתקדם",
        "subtitleHe": "סגנון, ניואנס, רגיסטר, אקדמי · תרגול יומיומי"
    },
    "C2": {
        "titleHe": "שליטה גבוהה",
        "subtitleHe": "שיח כמעט ילידי, תרבות גבוהה · תרגול יומיומי"
    }
};

  const LEVEL_FILES = (global.RL_LEVEL_FILES) || {
    "A1": ["./data/a1-part1.js", "./data/a1-part2.js"],
    "A2": ["./data/a2-part1.js", "./data/a2-part2.js"],
    "B1": ["./data/b1-part1.js", "./data/b1-part2.js"],
    "B2": ["./data/b2-part1.js", "./data/b2-part2.js"],
    "C1": ["./data/c1-part1.js", "./data/c1-part2.js"],
    "C2": ["./data/c2-part1.js", "./data/c2-part2.js"],
  };

  const loaded = {};
  const loading = {};
  let levels = [];
  let ready = false;
  const lessonIndex = {};

  function collectFromWindow() {
    levels = [];
    Object.keys(lessonIndex).forEach((k) => delete lessonIndex[k]);
    LEVEL_ORDER.forEach((id) => {
      const obj = global["RL_LEVEL_" + id];
      if (obj) {
        loaded[id] = true;
        levels.push(obj);
        (obj.units || []).forEach((u) => {
          (u.lessons || []).forEach((les) => {
            lessonIndex[les.id] = les;
          });
        });
      }
    });
    const gram = global.RL_GRAMMAR;
    if (gram) {
      (gram.units || []).forEach((u) => {
        (u.lessons || []).forEach((les) => {
          lessonIndex[les.id] = les;
        });
      });
    }
  }

  function grammarLessonIds() {
    const gram = global.RL_GRAMMAR;
    if (!gram) return [];
    const ids = [];
    (gram.units || []).forEach((u) => (u.lessons || []).forEach((l) => ids.push(l.id)));
    return ids;
  }

  function getGrammar() {
    return global.RL_GRAMMAR || null;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-rl-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.rlLoaded === "1") return resolve();
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("fail " + src)));
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.dataset.rlSrc = src;
      s.onload = () => {
        s.dataset.rlLoaded = "1";
        resolve();
      };
      s.onerror = () => reject(new Error("fail " + src));
      document.head.appendChild(s);
    });
  }

  async function ensureLevel(levelId) {
    if (!levelId || levelId === "GRAM") return;
    if (loaded[levelId] && loaded[levelId + "_parts"] && global["RL_LEVEL_" + levelId]) {
      collectFromWindow();
      return;
    }
    if (loading[levelId]) {
      await loading[levelId];
      return;
    }
    loading[levelId] = (async () => {
      const files = LEVEL_FILES[levelId];
      if (!files || !files.length) return;
      // Always load all parts in order (part2 merges into part1 global)
      for (const src of files) {
        await loadScript(src);
      }
      loaded[levelId] = true;
      loaded[levelId + "_parts"] = true;
      collectFromWindow();
      if (levelId === "A1" && global.RL_LEVEL_A1) ready = true;
    })();
    try {
      await loading[levelId];
    } finally {
      delete loading[levelId];
    }
  }

  async function ensureAll() {
    for (const id of LEVEL_ORDER) {
      await ensureLevel(id);
    }
  }

  function getLevel(id) {
    return levels.find((l) => l.id === id) || null;
  }

  function levelMeta(id) {
    const live = getLevel(id);
    if (live) return live;
    const info = LEVEL_INFO[id] || { titleHe: id, subtitleHe: "" };
    return { id: id, titleHe: info.titleHe, subtitleHe: info.subtitleHe, units: [] };
  }

  function lessonIdsForLevel(levelId) {
    const lv = getLevel(levelId);
    if (!lv) return [];
    const ids = [];
    (lv.units || []).forEach((u) => (u.lessons || []).forEach((l) => ids.push(l.id)));
    return ids;
  }

  function lessonCountForLevel(levelId) {
    const meta = global.RL_META;
    if (meta && meta.lessonCounts && meta.lessonCounts[levelId] != null) {
      return meta.lessonCounts[levelId];
    }
    return lessonIdsForLevel(levelId).length;
  }

  function completedCountForLevel(levelId) {
    const ids = lessonIdsForLevel(levelId);
    if (ids.length) return RLProgress.countCompleted(ids);
    const prefix = String(levelId).toLowerCase() + "-";
    const completed = (RLProgress.get().completed) || {};
    let n = 0;
    Object.keys(completed).forEach((id) => {
      if (id.toLowerCase().indexOf(prefix) === 0) n++;
    });
    return n;
  }

  function totalLessons() {
    const meta = global.RL_META;
    if (meta && typeof meta.totalLessons === "number" && meta.totalLessons > 0) {
      return meta.totalLessons;
    }
    return LEVEL_ORDER.reduce((acc, id) => acc + lessonCountForLevel(id), 0);
  }

  function getLesson(id) {
    return lessonIndex[id] || null;
  }

  function isLevelComplete(levelId) {
    const ids = lessonIdsForLevel(levelId);
    if (ids.length) return ids.every((id) => RLProgress.isComplete(id));
    const total = lessonCountForLevel(levelId);
    if (!total) return false;
    return completedCountForLevel(levelId) >= total;
  }

  function unlockThreshold(levelId) {
    const n = lessonCountForLevel(levelId);
    if (!n) return 0;
    return Math.ceil(n * UNLOCK_RATIO);
  }

  function remainingToUnlockNext(levelId) {
    const next = nextLevelId(levelId);
    if (!next) return 0;
    const need = unlockThreshold(levelId);
    const done = completedCountForLevel(levelId);
    return Math.max(0, need - done);
  }

  function isLevelUnlocked(levelId) {
    const idx = LEVEL_ORDER.indexOf(levelId);
    if (idx <= 0) return true;
    const prev = LEVEL_ORDER[idx - 1];
    const done = completedCountForLevel(prev);
    return done >= unlockThreshold(prev) || isLevelComplete(prev);
  }

  function nextLevelId(levelId) {
    const idx = LEVEL_ORDER.indexOf(levelId);
    if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return null;
    return LEVEL_ORDER[idx + 1];
  }

  function nextLesson() {
    const cur = RLProgress.get().currentLevel || "A1";
    const order = [cur].concat(LEVEL_ORDER.filter((x) => x !== cur));
    for (const lid of order) {
      if (!isLevelUnlocked(lid) && lid !== "A1") continue;
      const ids = lessonIdsForLevel(lid);
      for (const id of ids) {
        if (!RLProgress.isComplete(id)) return getLesson(id);
      }
    }
    return null;
  }

  /** Prefer ensureLevel(current) then this; loads next unlocked level if needed. */
  async function findNextLesson() {
    const cur = RLProgress.get().currentLevel || "A1";
    const order = [cur].concat(LEVEL_ORDER.filter((x) => x !== cur));
    for (const lid of order) {
      if (!isLevelUnlocked(lid) && lid !== "A1") continue;
      await ensureLevel(lid);
      const ids = lessonIdsForLevel(lid);
      for (const id of ids) {
        if (!RLProgress.isComplete(id)) return getLesson(id);
      }
    }
    return null;
  }

  /** Unique lemmas seen in completed lessons (approx from exercise text). */
  function vocabLearnedCount() {
    const completed = RLProgress.get().completed || {};
    const set = {};
    Object.keys(completed).forEach((lid) => {
      const les = getLesson(lid);
      if (!les) return;
      (les.exercises || []).forEach((ex) => {
        const texts = [];
        if (ex.ru) texts.push(ex.ru);
        if (ex.sentence) texts.push(ex.sentence);
        if (ex.example) texts.push(ex.example);
        (ex.turns || []).forEach((t) => t.ru && texts.push(t.ru));
        (ex.pairs || []).forEach((p) => p.ru && texts.push(p.ru));
        (ex.words || []).forEach((w) => texts.push(w));
        texts.forEach((t) => {
          const toks = String(t).match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\-]+/g) || [];
          toks.forEach((w) => {
            if (w.length >= 2) set[w.toLowerCase()] = true;
          });
        });
      });
    });
    return Object.keys(set).length;
  }

  collectFromWindow();
  const bootPromise = ensureLevel("A1")
    .then(() => {
      collectFromWindow();
      ready = !!(loaded["A1"] && global.RL_LEVEL_A1);
      if (!ready) throw new Error("A1 failed to load");
    })
    .catch((e) => {
      console.error(e);
      collectFromWindow();
      ready = !!(loaded["A1"] && global.RL_LEVEL_A1);
      // leave rejected so awaiters can show error; retry via ensureLevel("A1")
      return Promise.reject(e);
    });

  global.RLCurriculum = {
    get levels() {
      return levels;
    },
    get ready() {
      return ready && !!global.RL_LEVEL_A1;
    },
    bootPromise,
    ensureLevel,
    ensureAll,
    getLevel,
    levelMeta,
    getLesson,
    lessonIdsForLevel,
    lessonCountForLevel,
    completedCountForLevel,
    totalLessons,
    isLevelComplete,
    isLevelUnlocked,
    unlockThreshold,
    remainingToUnlockNext,
    nextLevelId,
    nextLesson,
    findNextLesson,
    vocabLearnedCount,
    grammarLessonIds,
    getGrammar,
    UNLOCK_RATIO,
    LEVEL_ORDER,
    LEVEL_INFO,
    _collect: collectFromWindow,
  };
})(window);
