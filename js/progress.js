/* Progress, XP, streak, unlocks — localStorage */
(function (global) {
  "use strict";

  const KEY = "al_progress_v1";

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

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
      const data = Object.assign({}, DEFAULTS, JSON.parse(raw));
      data.settings = Object.assign({}, DEFAULTS.settings, data.settings || {});
      data.completed = data.completed || {};
      return data;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {}
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

  function resetAll() {
    state = JSON.parse(JSON.stringify(DEFAULTS));
    save(state);
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
    resetAll,
  };
})(window);
