/* Learning-path hooks: extra steps between regular lessons (unit checkpoint, stories, AI chat…)
 * + a home-screen menu area. Shared, identical in all 4 apps. Docs: /workspace/_fix/path_hooks.md */
(function (global) {
  "use strict";

  const providers = {}; // name -> fn(ctx) => steps[]
  const homeCards = []; // {id, order, html(), wire(root, api)}
  let app = null; // set by app.js: {el(), navigate(n), startLesson(id), startNextLesson(), showNav(b), runLesson(lesson, cb)}

  function setAppContext(c) { app = c; }
  function registerProvider(name, fn) { if (name && typeof fn === "function") providers[name] = fn; }
  function unregisterProvider(name) { delete providers[name]; }
  function registerHomeCard(card) {
    if (!card || !card.id) return;
    const i = homeCards.findIndex((c) => c.id === card.id);
    if (i >= 0) homeCards.splice(i, 1);
    homeCards.push(card);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ——— completion store (inside progress → synced + backed up) ——— */
  function store() {
    const p = global.RLProgress && RLProgress.get ? RLProgress.get() : null;
    if (!p) return {};
    if (!p.pathSteps || typeof p.pathSteps !== "object") p.pathSteps = {};
    return p.pathSteps;
  }
  function info(id) { return store()[id] || null; }
  function isDone(id) { const s = info(id); return !!(s && s.at && !s.skipped); }
  function isSkipped(id) { const s = info(id); return !!(s && s.skipped); }
  function markDone(id, data) {
    data = data || {};
    const st = store();
    const prev = st[id] || {};
    st[id] = { at: Date.now(), score: data.score != null ? data.score : prev.score, best: Math.max(prev.best || 0, data.score || 0) || undefined };
    if (data.xp && RLProgress.awardXp) RLProgress.awardXp(data.xp);
    else if (RLProgress.save) RLProgress.save();
  }
  function markSkipped(id) {
    const st = store();
    if (st[id] && st[id].at && !st[id].skipped) return;
    st[id] = { skipped: Date.now() };
    if (RLProgress.save) RLProgress.save();
  }

  /* ——— step collection ——— */
  function unitLessonIds(unit) { return (unit.lessons || []).map((l) => l.id); }

  function stepsForLevel(levelId) {
    const C = global.RLCurriculum;
    const level = C && C.getLevel ? C.getLevel(levelId) : null;
    const out = {}; // anchor -> steps
    if (!level) return out;
    const levelIds = C.lessonIdsForLevel ? C.lessonIdsForLevel(levelId) : [];
    (level.units || []).forEach((unit, ui) => {
      const ids = unitLessonIds(unit);
      if (!ids.length) return;
      const ctx = { levelId: levelId, level: level, unit: unit, unitIndex: ui, unitLessonIds: ids, levelLessonIds: levelIds };
      Object.keys(providers).forEach((name) => {
        let list = [];
        try { list = providers[name](ctx) || []; } catch (e) { list = []; }
        (Array.isArray(list) ? list : [list]).forEach((s) => {
          if (!s || !s.id || typeof s.start !== "function" || ids.indexOf(s.afterLessonId) < 0) return;
          s._provider = name;
          s._levelId = levelId;
          (out[s.afterLessonId] = out[s.afterLessonId] || []).push(s);
        });
      });
    });
    Object.keys(out).forEach((k) => out[k].sort((a, b) => (a.order || 50) - (b.order || 50)));
    return out;
  }

  /** Helper: provider placing a step after every k-th lesson of the level (1-based ordinal). */
  function everyKLessons(k, make) {
    return function (ctx) {
      const res = [];
      ctx.unitLessonIds.forEach((id) => {
        const n = ctx.levelLessonIds.indexOf(id) + 1;
        if (n > 0 && n % k === 0) {
          const s = make(id, n, ctx);
          if (s) { if (!s.afterLessonId) s.afterLessonId = id; res.push(s); }
        }
      });
      return res;
    };
  }

  function levelOfLesson(id) {
    const m = String(id || "").match(/^(a1|a2|b1|b2|c1|c2)-/i);
    return m ? m[1].toUpperCase() : null;
  }
  function stepsAfter(lessonId) {
    const lv = levelOfLesson(lessonId);
    if (!lv) return [];
    return stepsForLevel(lv)[lessonId] || [];
  }
  function pendingAfter(lessonId) {
    if (!global.RLProgress || !RLProgress.isComplete(lessonId)) return [];
    return stepsAfter(lessonId).filter((s) => !isDone(s.id) && !isSkipped(s.id));
  }
  /** The step(s) recommended before starting `nextLessonId` (anchored to the lesson right before it). */
  function pendingBefore(nextLessonId) {
    const lv = levelOfLesson(nextLessonId);
    if (!lv || !global.RLCurriculum) return null;
    const ids = RLCurriculum.lessonIdsForLevel(lv) || [];
    const i = ids.indexOf(nextLessonId);
    if (i <= 0) return null;
    return pendingAfter(ids[i - 1])[0] || null;
  }
  function findStep(id) {
    const C = global.RLCurriculum;
    const lvls = (C && C.LEVEL_ORDER) || ["A1", "A2", "B1", "B2", "C1", "C2"];
    for (let i = 0; i < lvls.length; i++) {
      if (!C.getLevel(lvls[i])) continue;
      const map = stepsForLevel(lvls[i]);
      for (const k in map) { const s = map[k].find((x) => x.id === id); if (s) return s; }
    }
    return null;
  }

  /* ——— running a step ——— */
  function rampOf(lessonId) {
    try {
      const l = global.RLCurriculum.getLesson(lessonId);
      return global.RLEngine && RLEngine.rampOf ? RLEngine.rampOf(l || { id: lessonId }) : null;
    } catch (e) { return null; }
  }
  function makeApi(step) {
    return {
      el: app.el(),
      step: step,
      ramp: rampOf(step.afterLessonId),
      finish: function (data) { markDone(step.id, data); afterStep(step); },
      skip: function () { markSkipped(step.id); afterStep(step); },
      done: function (data) { markDone(step.id, data); global.__RL_LESSON_ACTIVE = false; app.navigate("path"); },
      exit: function () { global.__RL_LESSON_ACTIVE = false; app.navigate("path"); },
      runLesson: function (lesson, cb) { return app.runLesson(lesson, cb || {}); },
      navigate: function (n) { app.navigate(n); },
    };
  }
  function startStep(stepOrId) {
    const step = typeof stepOrId === "string" ? findStep(stepOrId) : stepOrId;
    if (!step || !app) return false;
    global.__RL_LESSON_ACTIVE = true;
    app.showNav(false);
    try { step.start(makeApi(step)); } catch (e) { global.__RL_LESSON_ACTIVE = false; app.navigate("path"); }
    return true;
  }
  function afterStep(step) {
    const more = pendingAfter(step.afterLessonId);
    if (more.length) return startStep(more[0]);
    app.startNextLesson();
  }
  /** After a lesson: start the pending step anchored to it (returns true if one started). */
  function offerAfter(lessonId) {
    const p = pendingAfter(lessonId)[0];
    return p ? startStep(p) : false;
  }

  /* ——— path rendering ——— */
  function nodesHtml(lessonId, levelMap) {
    const list = (levelMap && levelMap[lessonId]) || [];
    const unlocked = global.RLProgress && RLProgress.isComplete(lessonId);
    return list.map((s) => {
      const i = info(s.id);
      const done = isDone(s.id);
      const cls = done ? "done" : unlocked ? "unlocked" : "locked";
      const score = done && i && i.score != null ? " · " + i.score + "%" : "";
      return (
        '<div class="path-node-wrap path-step-wrap"><div><button type="button" class="path-node path-step ' + cls +
        (s.kind ? " step-" + esc(s.kind) : "") + '" data-step="' + esc(s.id) + '" data-st="' + cls + '">' +
        (unlocked || done ? esc(s.icon || "⭐") : "🔒") + '</button><div class="node-label">' + esc(s.titleHe || "") + score +
        "</div></div></div>"
      );
    }).join("");
  }
  function wirePath(root) {
    (root || document).querySelectorAll("[data-step]").forEach((b) => {
      b.onclick = () => { if (b.dataset.st !== "locked") startStep(b.dataset.step); };
    });
  }

  /* ——— home ——— */
  function continueCardHtml(step) {
    return (
      '<div class="continue-card step-continue"><div class="label">השלב הבא במסלול</div>' +
      '<div class="title">' + esc(step.icon || "⭐") + " " + esc(step.titleHe || "") + "</div>" +
      '<button type="button" class="btn" id="btn-step-start">התחל ←</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="btn-step-skip" style="margin-top:8px;width:100%">דלג — לשיעור הבא</button></div>'
    );
  }
  function homeMenuHtml() {
    const cards = homeCards.slice().sort((a, b) => (a.order || 50) - (b.order || 50));
    let h = "";
    cards.forEach((c) => { try { h += c.html() || ""; } catch (e) {} });
    return '<div id="home-extra-menu">' + h + "</div>";
  }
  function wireHome(root, opts) {
    opts = opts || {};
    root = root || document;
    const st = root.querySelector("#btn-step-start");
    if (st && opts.step) st.onclick = () => startStep(opts.step);
    const sk = root.querySelector("#btn-step-skip");
    if (sk && opts.step) sk.onclick = () => {
      markSkipped(opts.step.id);
      if (opts.next) app.startLesson(opts.next.id); else app.navigate("home");
    };
    const menu = root.querySelector("#home-extra-menu");
    if (!menu || !app) return;
    const api = {
      el: app.el(),
      exit: function () { global.__RL_LESSON_ACTIVE = false; app.navigate("home"); },
      runLesson: function (lesson, cb) { return app.runLesson(lesson, cb || {}); },
      navigate: function (n) { app.navigate(n); },
    };
    homeCards.forEach((c) => { try { if (c.wire) c.wire(menu, api); } catch (e) {} });
  }

  global.RLPath = {
    setAppContext, registerProvider, unregisterProvider, registerHomeCard, everyKLessons,
    stepsForLevel, stepsAfter, pendingAfter, pendingBefore, startStep, offerAfter,
    isDone, isSkipped, markDone, markSkipped, info,
    nodesHtml, wirePath, continueCardHtml, homeMenuHtml, wireHome,
    _app: () => app,
  };
})(window);
