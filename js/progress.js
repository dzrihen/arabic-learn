/* Progress, XP, streak, unlocks — localStorage + dual backup + safe cloud hooks */
(function (global) {
  "use strict";

  const KEY = "al_progress_v1";
  const BACKUP_KEY = KEY + "_backup";
  /* Older keys to migrate from (never drop until copied). */
  const LEGACY_KEYS = [];

  const DEFAULTS = {
    xp: 0,
    streak: 0,
    lastStudyDate: null,
    hearts: 5,
    completed: {}, // lessonId -> { xp, at, perfect }
    currentLevel: "A1",
    settings: { translit: true, sound: true, speechRate: "slow" },
    installTipDismissed: false,
  };

  let saveHook = null;
  let lastRestoreNotice = null;

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function normalize(data) {
    const next = Object.assign({}, DEFAULTS, data || {});
    next.settings = Object.assign({}, DEFAULTS.settings, (data && data.settings) || {});
    next.completed =
      data && data.completed && typeof data.completed === "object" ? data.completed : {};
    next.xp = Number(next.xp) || 0;
    next.streak = Number(next.streak) || 0;
    next.hearts = next.hearts == null ? 5 : Number(next.hearts);
    return next;
  }

  /** Higher = more valuable progress. Used to refuse empty overwrites. */
  function richness(data) {
    if (!data || typeof data !== "object") return 0;
    const n =
      data.completed && typeof data.completed === "object"
        ? Object.keys(data.completed).length
        : 0;
    return n * 1000 + (Number(data.xp) || 0);
  }

  function readKey(k) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return { ok: true, data: null, raw: null };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { ok: false, data: null, raw: raw };
      return { ok: true, data: normalize(parsed), raw: raw };
    } catch (e) {
      return { ok: false, data: null, raw: null, error: e };
    }
  }

  function migrateLegacy() {
    try {
      const cur = localStorage.getItem(KEY);
      if (cur) return;
      for (let i = 0; i < LEGACY_KEYS.length; i++) {
        const lk = LEGACY_KEYS[i];
        const raw = localStorage.getItem(lk);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            localStorage.setItem(KEY, raw);
            if (richness(parsed) > 0) {
              localStorage.setItem(BACKUP_KEY, raw);
            }
            // Keep legacy key until we know new key is readable.
            const check = localStorage.getItem(KEY);
            if (check === raw) {
              try {
                localStorage.removeItem(lk);
              } catch (e2) {}
            }
            return;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  function load() {
    migrateLegacy();
    const primary = readKey(KEY);
    const backup = readKey(BACKUP_KEY);

    if (primary.ok && primary.data && richness(primary.data) > 0) {
      // Refresh backup copy when primary is good.
      try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify(primary.data));
      } catch (e) {}
      return primary.data;
    }

    if (backup.ok && backup.data && richness(backup.data) > 0) {
      // Primary empty/corrupt but backup has data — restore without wiping.
      try {
        localStorage.setItem(KEY, JSON.stringify(backup.data));
      } catch (e) {}
      lastRestoreNotice = {
        at: Date.now(),
        source: "backup",
        xp: backup.data.xp,
        completed: Object.keys(backup.data.completed || {}).length,
      };
      return backup.data;
    }

    if (primary.ok && primary.data) return primary.data;
    // Parse fail or missing — do NOT write defaults over anything.
    return cloneDefaults();
  }

  /**
   * Persist state. Never silently write empty progress over non-empty
   * primary/backup unless opts.force (explicit reset / user confirm).
   */
  function save(data, opts) {
    opts = opts || {};
    const next = normalize(data);
    const nextR = richness(next);

    try {
      const existing = readKey(KEY);
      const backup = readKey(BACKUP_KEY);
      const bestExisting = Math.max(
        existing.ok && existing.data ? richness(existing.data) : 0,
        backup.ok && backup.data ? richness(backup.data) : 0
      );

      if (!opts.force && nextR === 0 && bestExisting > 0) {
        try {
          console.warn("[RLProgress] refused empty overwrite of non-empty progress");
        } catch (e) {}
        return false;
      }

      localStorage.setItem(KEY, JSON.stringify(next));
      // Dual backup: only refresh backup when we have real progress (or force).
      if (nextR > 0 || opts.force) {
        try {
          localStorage.setItem(BACKUP_KEY, JSON.stringify(next));
        } catch (e2) {}
      }
    } catch (e) {
      // Quota / private mode — try backup key at least.
      try {
        if (nextR > 0) localStorage.setItem(BACKUP_KEY, JSON.stringify(next));
      } catch (e2) {}
    }

    try {
      if (typeof saveHook === "function") saveHook(next);
    } catch (e) {}
    return true;
  }

  let state = load();

  function get() {
    return state;
  }

  function touchStreak() {
    const t = todayStr();
    if (state.lastStudyDate === t) return state.streak;
    if (state.lastStudyDate === yesterdayStr()) {
      state.streak = (state.streak || 0) + 1;
    } else {
      state.streak = 1;
    }
    state.lastStudyDate = t;
    save(state);
    return state.streak;
  }

  function isComplete(lessonId) {
    return !!state.completed[lessonId];
  }

  function completeLesson(lessonId, xpEarned, perfect) {
    touchStreak();
    const prev = state.completed[lessonId];
    if (!prev) {
      state.xp = (state.xp || 0) + (xpEarned || 0);
    } else {
      // redo: smaller XP
      state.xp = (state.xp || 0) + Math.max(2, Math.floor((xpEarned || 10) / 4));
    }
    state.completed[lessonId] = {
      xp: xpEarned || 0,
      at: Date.now(),
      perfect: !!(perfect || (prev && prev.perfect)),
    };
    save(state);
    return state;
  }

  function awardXp(n) {
    state.xp = (state.xp || 0) + (n || 0);
    touchStreak();
    save(state);
    return state.xp;
  }

  function setLevel(levelId) {
    state.currentLevel = levelId;
    save(state);
  }

  function setSetting(key, val) {
    state.settings[key] = val;
    save(state);
  }

  function dismissInstallTip() {
    state.installTipDismissed = true;
    save(state);
  }

  function resetHearts() {
    state.hearts = 5;
    save(state);
  }

  function loseHeart() {
    state.hearts = Math.max(0, (state.hearts || 5) - 1);
    save(state);
    return state.hearts;
  }

  function refillHearts() {
    state.hearts = 5;
    save(state);
  }

  /** Compute unlock status given ordered lesson ids for a level */
  function lessonStatus(lessonId, orderedIds) {
    if (isComplete(lessonId)) return "done";
    const idx = orderedIds.indexOf(lessonId);
    if (idx <= 0) return "current";
    // unlocked if previous is done
    const prev = orderedIds[idx - 1];
    if (isComplete(prev)) return "current";
    // also allow first incomplete as current
    const firstOpen = orderedIds.find((id) => !isComplete(id));
    if (firstOpen === lessonId) return "current";
    return "locked";
  }

  function countCompleted(ids) {
    return ids.filter(isComplete).length;
  }

  function exportState() {
    return JSON.stringify(state);
  }

  function importState(data, opts) {
    opts = opts || {};
    if (!data || typeof data !== "object") throw new Error("progress invalid");
    const next = normalize(data);
    const nextR = richness(next);
    const curR = richness(state);

    // Never silently replace real progress with empty.
    if (!opts.force && nextR === 0 && curR > 0) {
      throw new Error("סירוב לשחזר התקדמות ריקה מעל התקדמות קיימת");
    }
    // Prefer keeping richer local unless force / allowWeaker.
    if (!opts.force && !opts.allowWeaker && nextR < curR) {
      throw new Error("הגיבוי חלש מההתקדמות המקומית — לא נדרס");
    }

    state = next;
    save(state, { force: !!opts.force });
    if (nextR > 0 && (opts.fromCloud || opts.fromBackup)) {
      lastRestoreNotice = {
        at: Date.now(),
        source: opts.fromCloud ? "cloud" : "backup",
        xp: next.xp,
        completed: Object.keys(next.completed || {}).length,
      };
    }
    return state;
  }

  function resetAll() {
    state = cloneDefaults();
    save(state, { force: true });
  }

  function setSaveHook(fn) {
    saveHook = typeof fn === "function" ? fn : null;
  }

  function hasProgress() {
    return richness(state) > 0;
  }

  function consumeRestoreNotice() {
    const n = lastRestoreNotice;
    lastRestoreNotice = null;
    return n;
  }

  function reloadFromStorage() {
    state = load();
    return state;
  }

  global.RLProgress = {
    get,
    save: () => save(state),
    touchStreak,
    isComplete,
    completeLesson,
    awardXp,
    setLevel,
    setSetting,
    dismissInstallTip,
    loseHeart,
    refillHearts,
    resetHearts,
    lessonStatus,
    countCompleted,
    exportState,
    importState,
    resetAll,
    setSaveHook,
    hasProgress,
    richness,
    consumeRestoreNotice,
    reloadFromStorage,
    KEY,
    BACKUP_KEY,
  };
})(window);
