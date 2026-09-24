/* App router + screens */
(function () {
  "use strict";

  const LEVEL_COLORS = {
    A1: "#047857",
    A2: "#1CB0F6",
    B1: "#CE82FF",
    B2: "#FF9600",
    C1: "#FF4B4B",
    C2: "#654ea3",
  };

  const appEl = document.getElementById("app");
  const navEl = document.getElementById("bottom-nav");
  let route = "home";
  let activeLevel = null;
  let lessonRunner = null;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function showNav(v) {
    navEl.classList.toggle("hidden", !v);
  }

  function setActiveNav(name) {
    navEl.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.route === name);
    });
  }

  function statsBar() {
    const p = RLProgress.get();
    const total = RLCurriculum.totalLessons();
    const done = Object.keys(p.completed).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
      '<div class="stats-bar">' +
      '<span class="stat-pill streak">🔥 ' +
      (p.streak || 0) +
      "</span>" +
      '<span class="stat-pill xp">⚡ ' +
      (p.xp || 0) +
      " XP</span>" +
      '<span class="stat-pill pct">✅ ' +
      pct +
      "%</span>" +
      '<span class="stat-pill vocab" title="מילים שנלמדו">📚 ' +
      ((RLCurriculum.vocabLearnedCount && RLCurriculum.vocabLearnedCount()) || 0) +
      "</span>" +
      (window.RLSrs
        ? '<span class="stat-pill srs" title="חזרה">🔁 ' + RLSrs.dueCount() + "</span>"
        : "") +
      "</div>"
    );
  }

  function installTipHtml() {
    if (RLProgress.get().installTipDismissed) return "";
    return (
      '<div class="install-tip" id="install-tip">' +
      '<div class="tip-body"><strong>התקן למסך הבית</strong>' +
      "<ol><li>ב־Chrome: תפריט ⋮ ← הוסף למסך הבית</li>" +
      "<li>ב־Safari: שתף □↑ ← הוסף למסך הבית</li></ol></div>" +
      '<button type="button" class="tip-dismiss" id="tip-x" aria-label="סגור">✕</button></div>'
    );
  }

  // ——— Screens ———

  async function renderHome() {
    showNav(true);
    setActiveNav("home");
    const curLv = RLProgress.get().currentLevel || "A1";
    try {
      await RLCurriculum.ensureLevel(curLv);
    } catch (e) {}
    const next = RLCurriculum.findNextLesson
      ? await RLCurriculum.findNextLesson()
      : RLCurriculum.nextLesson();
    const p = RLProgress.get();
    const total = RLCurriculum.totalLessons();
    const done = Object.keys(p.completed).length;

    let continueHtml;
    if (next) {
      continueHtml =
        '<div class="continue-card">' +
        '<div class="label">המשך ללמוד · ' +
        next.level +
        "</div>" +
        '<div class="title">' +
        escape(next.titleHe) +
        "</div>" +
        '<button type="button" class="btn" id="btn-continue">המשך ←</button></div>';
    } else {
      continueHtml =
        '<div class="card"><h2>סיימת את כל השיעורים! 🎉</h2>' +
        '<p class="sub">אפשר לחזור ולתרגל שיעורים שהשלמת.</p>' +
        '<button type="button" class="btn btn-primary" id="btn-levels">לרמות</button></div>';
    }

    appEl.innerHTML =
      statsBar() +
      installTipHtml() +
      '<div class="hero"><div class="owl">🌴</div>' +
      "<h1>לומדים ערבית פלסטינית</h1>" +
      '<p class="sub" style="color:var(--muted)">מסלול A1→C2 · תרגול יומיומי · שיחה · חזרה · דקדוק</p>' +
      '<p class="sub" style="color:var(--muted);font-size:0.85rem;margin-top:6px">اللهجة الفلسطينية / ערבית פלסטינית מדוברת — לחיי יום־יום בישראל ובאזור; תרחישים מעשיים.</p></div>' +
      continueHtml +
      '<div class="card">' +
      "<h2>ההתקדמות שלך</h2>" +
      '<p class="sub">אתה בשיעור ' +
      Math.min(done + 1, total) +
      " מתוך " +
      total +
      "</p>" +
      '<div class="progress-track"><div class="progress-fill" style="width:' +
      (total ? Math.round((done / total) * 100) : 0) +
      '%"></div></div>' +
      '<p class="sub" style="margin-top:10px">' +
      done +
      " שיעורים הושלמו</p>" +
      '<button type="button" class="btn btn-ghost btn-sm" id="btn-path" style="margin-top:10px;width:100%">פתח מסלול</button>' +
      "</div>" +
      convHomeCard() +
      srsHomeCard() +
      grammarHomeCard() +
      '<div class="card"><h2>הגדרות</h2>' +
      '<div class="toggle-row"><span>תעתיק (לטינית)</span>' +
      '<button type="button" class="toggle' +
      (p.settings.translit ? " on" : "") +
      '" id="tog-translit" aria-label="תעתיק"></button></div>' +
      '<div class="toggle-row"><span>צליל TTS</span>' +
      '<button type="button" class="toggle' +
      (p.settings.sound !== false ? " on" : "") +
      '" id="tog-sound" aria-label="צליל"></button></div>' +
      '<div class="toggle-row"><span>דיבור איטי ללומדים (~0.9)</span>' +
      '<button type="button" class="toggle' +
      (p.settings.speechRate !== "normal" ? " on" : "") +
      '" id="tog-slow" aria-label="קצב דיבור"></button></div>' +
      "</div>";

    const tipX = qs("#tip-x");
    if (tipX) {
      tipX.onclick = () => {
        RLProgress.dismissInstallTip();
        qs("#install-tip") && qs("#install-tip").remove();
      };
    }
    const bc = qs("#btn-continue");
    if (bc) bc.onclick = () => startLesson(next.id);
    const bl = qs("#btn-levels");
    if (bl) bl.onclick = () => navigate("levels");
    const bp = qs("#btn-path");
    if (bp) bp.onclick = () => navigate("path");
    qs("#tog-translit").onclick = function () {
      const on = !RLProgress.get().settings.translit;
      RLProgress.setSetting("translit", on);
      this.classList.toggle("on", on);
    };
    qs("#tog-sound").onclick = function () {
      const on = RLProgress.get().settings.sound === false;
      RLProgress.setSetting("sound", on);
      this.classList.toggle("on", on);
    };
    qs("#tog-slow").onclick = function () {
      const slow = RLProgress.get().settings.speechRate === "normal";
      RLProgress.setSetting("speechRate", slow ? "slow" : "normal");
      this.classList.toggle("on", slow);
    };
    const br = qs("#btn-srs-review");
    if (br) br.onclick = () => startSrsReview();
    const bc2 = qs("#btn-conv");
    if (bc2) bc2.onclick = () => navigate("conversation");
    const bg = qs("#btn-grammar");
    if (bg) bg.onclick = () => navigate("grammar");
  }

  function srsHomeCard() {
    if (!window.RLSrs) return "";
    const due = RLSrs.dueCount();
    const total = RLSrs.totalCards();
    return (
      '<div class="card srs-card">' +
      "<h2>חזרה על מילים</h2>" +
      '<p class="sub">חזרה מרווחת בסגנון Anki · ' +
      total +
      " כרטיסים במאגר</p>" +
      '<div class="srs-due">' +
      (due
        ? '<span class="due-num">' + due + "</span> ממתינים לחזרה היום"
        : "אין כרטיסים למועד היום — כל הכבוד!") +
      "</div>" +
      (due
        ? '<button type="button" class="btn btn-primary" id="btn-srs-review">התחל חזרה (' +
          Math.min(due, RLSrs.SESSION_SIZE) +
          " כרטיסים)</button>"
        : '<button type="button" class="btn btn-ghost" id="btn-srs-review" disabled>אין חזרה כרגע</button>') +
      "</div>"
    );
  }

  function convHomeCard() {
    const n = (window.RLConversation && RLConversation.scenarios().length) || 0;
    return (
      '<div class="card conv-home-card">' +
      '<div class="conv-home-badge">תרגול יומיומי</div>' +
      "<h2>💬 שיחה</h2>" +
      '<p class="sub">תרחישי חיי יום · הזמנות, נסיעות, בריאות, עבודה ועוד · <strong>' +
      n +
      "</strong> תרחישים</p>" +
      '<button type="button" class="btn btn-primary" id="btn-conv">התחל שיחה יומיומית ←</button></div>'
    );
  }

  function grammarHomeCard() {
    const ids = (RLCurriculum.grammarLessonIds && RLCurriculum.grammarLessonIds()) || [];
    const done = RLProgress.countCompleted(ids);
    return (
      '<div class="card">' +
      "<h2>דקדוק</h2>" +
      '<p class="sub">מין, מקרים, אספקט ותנועה · ' +
      done +
      "/" +
      ids.length +
      " שיעורים</p>" +
      '<button type="button" class="btn btn-ghost" id="btn-grammar">למסלול הדקדוק ←</button></div>'
    );
  }

  function startSrsReview() {
    if (!window.RLSrs) return;
    const lesson = RLSrs.buildReviewLesson();
    if (!lesson) return;
    showNav(false);
    if (lessonRunner && lessonRunner.destroy) lessonRunner.destroy();
    appEl.innerHTML = '<div id="lesson-root"></div>';
    const root = qs("#lesson-root");
    lessonRunner = RLEngine.runLesson(lesson, root, {
      onExit() {
        if (lessonRunner && lessonRunner.destroy) lessonRunner.destroy();
        lessonRunner = null;
        navigate("home");
      },
      onComplete({ xp }) {
        RLProgress.awardXp(xp || 10);
        if (lessonRunner && lessonRunner.destroy) lessonRunner.destroy();
        lessonRunner = null;
        appEl.innerHTML =
          '<div class="celeb"><div class="big">🔁</div><h1>חזרה הושלמה!</h1>' +
          '<div class="xp-gain">+' +
          (xp || 10) +
          " XP</div>" +
          '<button type="button" class="btn btn-primary" id="btn-srs-done">חזרה לבית</button></div>';
        qs("#btn-srs-done").onclick = () => navigate("home");
      },
    });
  }

  async function renderLevels() {
    showNav(true);
    setActiveNav("levels");
    let html = statsBar() + "<h1 style='margin-bottom:12px'>רמות CEFR</h1><div class='level-grid'>";
    RLCurriculum.LEVEL_ORDER.forEach((id, i) => {
      const lv = RLCurriculum.levelMeta ? RLCurriculum.levelMeta(id) : RLCurriculum.getLevel(id) || { id: id, titleHe: id, subtitleHe: "" };
      const total = RLCurriculum.lessonCountForLevel
        ? RLCurriculum.lessonCountForLevel(id)
        : RLCurriculum.lessonIdsForLevel(id).length;
      const done = RLCurriculum.completedCountForLevel
        ? RLCurriculum.completedCountForLevel(id)
        : RLProgress.countCompleted(RLCurriculum.lessonIdsForLevel(id));
      const pct = total ? Math.round((done / total) * 100) : 0;
      const unlocked = i === 0 || RLCurriculum.isLevelUnlocked(id);
      html +=
        '<button type="button" class="level-card' +
        (unlocked ? "" : " locked") +
        '" data-level="' +
        id +
        '">' +
        '<div class="level-badge" style="background:' +
        (LEVEL_COLORS[id] || "#047857") +
        '">' +
        id +
        "</div>" +
        '<div class="level-info"><strong>' +
        escape(lv.titleHe) +
        "</strong>" +
        "<span>" +
        escape(lv.subtitleHe || "") +
        " · " +
        total +
        " שיעורים</span>" +
        '<div class="progress-track"><div class="progress-fill" style="width:' +
        pct +
        '%;background:' +
        (LEVEL_COLORS[id] || "#047857") +
        '"></div></div>' +
        "<span>" +
        done +
        "/" +
        total +
        (unlocked ? "" : " 🔒") +
        "</span>" +
        (unlocked
          ? ""
          : (function () {
              const prev = RLCurriculum.LEVEL_ORDER[i - 1];
              const rem = RLCurriculum.remainingToUnlockNext
                ? RLCurriculum.remainingToUnlockNext(prev)
                : 0;
              return (
                '<span class="unlock-hint">נותרו ' +
                rem +
                " שיעורים ברמה " +
                prev +
                " לפני הפתיחה</span>"
              );
            })()) +
        "</div></button>";
    });
    html += "</div>";
    appEl.innerHTML = html;
    appEl.querySelectorAll(".level-card").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.level;
        RLProgress.setLevel(id);
        activeLevel = id;
        await navigate("path");
      };
    });
  }

  async function renderPath() {
    showNav(true);
    setActiveNav("path");
    const levelId = activeLevel || RLProgress.get().currentLevel || "A1";
    activeLevel = levelId;
    if (!RLCurriculum.getLevel(levelId)) {
      appEl.innerHTML = '<div class="boot">טוען ' + levelId + "…</div>";
    }
    try {
      await RLCurriculum.ensureLevel(levelId);
    } catch (e) {
      appEl.innerHTML =
        '<div class="boot"><p>טעינת ' +
        levelId +
        ' נכשלה</p><button type="button" class="btn btn-primary" id="lvl-retry">נסה שוב</button></div>';
      qs("#lvl-retry").onclick = () => renderPath();
      return;
    }
    const level = RLCurriculum.getLevel(levelId);
    if (!level) {
      appEl.innerHTML = "<p>רמה לא נמצאה</p>";
      return;
    }
    const ordered = RLCurriculum.lessonIdsForLevel(levelId);

    let html =
      '<div class="path-header">' +
      statsBar() +
      "<h1>" +
      levelId +
      " · " +
      escape(level.titleHe) +
      "</h1>" +
      '<p class="sub" style="color:var(--muted)">' +
      escape(level.subtitleHe) +
      "</p>" +
      '<button type="button" class="btn btn-ghost btn-sm" id="btn-back-levels" style="margin-top:8px">← כל הרמות</button>' +
      "</div><div class='path-units'>";

    (level.units || []).forEach((unit, ui) => {
      html +=
        '<div class="unit-banner"><div class="unit-num">יחידה ' +
        (ui + 1) +
        '</div><div class="unit-title">' +
        escape(unit.titleHe) +
        '</div><div class="unit-ru ru">' +
        escape(unit.titleRu || "") +
        "</div></div>";

      (unit.lessons || []).forEach((les) => {
        const st = RLProgress.lessonStatus(les.id, ordered);
        let cls = "locked";
        let ico = "🔒";
        if (st === "done") {
          cls = "done";
          ico = "★";
        } else if (st === "current") {
          cls = "current";
          ico = les.checkpoint ? "⚑" : "▶";
        } else if (st === "unlocked") {
          cls = "unlocked";
          ico = les.checkpoint ? "⚑" : "○";
        }
        if (les.checkpoint) {
          cls += " checkpoint";
          if (st === "done") ico = "⚑";
        }
        // Allow redo of done; allow current; block locked
        html +=
          '<div class="path-node-wrap">' +
          '<div><button type="button" class="path-node ' +
          cls +
          '" data-id="' +
          les.id +
          '" data-st="' +
          st +
          '">' +
          ico +
          '</button><div class="node-label">' +
          escape(les.titleHe) +
          "</div></div></div>";
      });
    });
    html += "</div>";
    appEl.innerHTML = html;
    qs("#btn-back-levels").onclick = () => navigate("levels");
    appEl.querySelectorAll(".path-node").forEach((btn) => {
      btn.onclick = () => {
        const st = btn.dataset.st;
        if (st === "locked") return;
        startLesson(btn.dataset.id);
      };
    });
  }

  function renderProgress() {
    showNav(true);
    setActiveNav("progress");
    const p = RLProgress.get();
    const total = RLCurriculum.totalLessons();
    const done = Object.keys(p.completed).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    let rows = "";
    RLCurriculum.LEVEL_ORDER.forEach((id) => {
      const total = RLCurriculum.lessonCountForLevel
        ? RLCurriculum.lessonCountForLevel(id)
        : RLCurriculum.lessonIdsForLevel(id).length;
      const d = RLCurriculum.completedCountForLevel
        ? RLCurriculum.completedCountForLevel(id)
        : RLProgress.countCompleted(RLCurriculum.lessonIdsForLevel(id));
      const lp = total ? Math.round((d / total) * 100) : 0;
      rows +=
        '<div class="level-prog-row"><span class="tag">' +
        id +
        '</span><div style="flex:1"><div class="progress-track"><div class="progress-fill" style="width:' +
        lp +
        "%;background:" +
        (LEVEL_COLORS[id] || "#047857") +
        '"></div></div></div><span style="font-size:0.8rem;color:var(--muted)">' +
        d +
        "/" +
        total +
        "</span></div>";
    });

    appEl.innerHTML =
      statsBar() +
      '<div class="card" style="text-align:center">' +
      '<div class="pct-big">' +
      pct +
      "%</div>" +
      '<div class="pct-label">אתה בשיעור ' +
      Math.min(done + 1, total) +
      " מתוך " +
      total +
      "</div>" +
      "<p>🔥 רצף: <strong>" +
      (p.streak || 0) +
      "</strong> ימים · ⚡ <strong>" +
      (p.xp || 0) +
      "</strong> XP</p>" +
      "<p class=\"sub\">מילים שנלמדו: <strong>" +
      ((RLCurriculum.vocabLearnedCount && RLCurriculum.vocabLearnedCount()) || 0) +
      "</strong>" +
      (window.RL_META && RL_META.bankSize ? " · מאגר קורס ≈ " + RL_META.bankSize : "") +
      "</p></div>" +
      '<div class="card"><h2>לפי רמה</h2>' +
      rows +
      "</div>" +
      '<div class="card"><h2>טיפ</h2><p class="sub">שיעור אחד ביום ≈ כ־6 שנים לסיום A1→C2. מסלול צפוף (~2000 שיעורים), יסוד רחב, חזרות ושערי ביקורת — אל תמהרו.</p></div>';
  }

  function renderConversation() {
    showNav(true);
    setActiveNav("conversation");
    const all = (RLConversation && RLConversation.scenarios()) || [];
    const themeLabels = {
      food: "אוכל",
      travel: "נסיעות",
      health: "בריאות",
      work: "עבודה",
      shopping: "קניות",
      social: "חברתי",
      housing: "דיור",
      services: "שירותים",
      emergency: "חירום",
    };
    const themes = Array.from(
      new Set(all.map((s) => s.theme).filter(Boolean))
    ).sort((a, b) => (themeLabels[a] || a).localeCompare(themeLabels[b] || b, "he"));
    let activeTheme = window.__convThemeFilter || "all";
    if (activeTheme !== "all" && themes.indexOf(activeTheme) < 0) activeTheme = "all";

    const filtered =
      activeTheme === "all" ? all : all.filter((s) => s.theme === activeTheme);
    const by = {};
    filtered.forEach((s) => {
      (by[s.level] || (by[s.level] = [])).push(s);
    });
    const order = ["A1", "A2", "B1", "B2", "C1", "C2"];

    let chips =
      '<button type="button" class="theme-chip' +
      (activeTheme === "all" ? " on" : "") +
      '" data-theme="all">הכל (' +
      all.length +
      ")</button>";
    themes.forEach((th) => {
      const count = all.filter((s) => s.theme === th).length;
      chips +=
        '<button type="button" class="theme-chip' +
        (activeTheme === th ? " on" : "") +
        '" data-theme="' +
        th +
        '">' +
        (themeLabels[th] || th) +
        " (" +
        count +
        ")</button>";
    });

    let html =
      statsBar() +
      "<h1 style='margin-bottom:4px'>תרגול יומיומי · שיחה</h1>" +
      '<p class="sub" style="color:var(--muted);margin-bottom:10px">' +
      all.length +
      " תרחישים מעשיים — בחרו תשובה או כתבו/דברו חופשי</p>" +
      '<div class="theme-filters">' +
      chips +
      "</div>";

    order.forEach((lv) => {
      const list = by[lv] || [];
      if (!list.length) return;
      html +=
        '<div class="unit-banner"><div class="unit-num">' +
        lv +
        '</div><div class="unit-title">תרחישי ' +
        lv +
        " · " +
        list.length +
        "</div></div>";
      list.forEach((sc) => {
        const th = sc.theme ? themeLabels[sc.theme] || sc.theme : "";
        html +=
          '<button type="button" class="level-card conv-card" data-sid="' +
          sc.id +
          '"><div class="level-info"><strong>' +
          escape(sc.titleHe) +
          "</strong><span>" +
          (th ? "🏷 " + th + " · " : "") +
          escape(sc.settingHe || sc.titleRu || "") +
          "</span></div></button>";
      });
    });
    if (!filtered.length) {
      html += '<div class="card"><p class="sub">אין תרחישים בנושא הזה.</p></div>';
    }
    appEl.innerHTML = html;
    appEl.querySelectorAll(".theme-chip").forEach((btn) => {
      btn.onclick = () => {
        window.__convThemeFilter = btn.dataset.theme || "all";
        renderConversation();
      };
    });
    appEl.querySelectorAll(".conv-card").forEach((btn) => {
      btn.onclick = () => {
        const sc = RLConversation.scenarios().find((s) => s.id === btn.dataset.sid);
        if (sc) startConversation(sc);
      };
    });
  }

  function startConversation(scenario) {
    showNav(false);
    if (lessonRunner && lessonRunner.destroy) lessonRunner.destroy();
    appEl.innerHTML = '<div id="lesson-root"></div>';
    const root = qs("#lesson-root");
    lessonRunner = RLConversation.runScenario(scenario, root, {
      onExit() {
        if (lessonRunner && lessonRunner.destroy) lessonRunner.destroy();
        lessonRunner = null;
        navigate("conversation");
      },
      onComplete({ xp }) {
        RLProgress.awardXp(xp || 10);
        if (lessonRunner && lessonRunner.destroy) lessonRunner.destroy();
        lessonRunner = null;
        appEl.innerHTML =
          '<div class="celeb"><div class="big">💬</div><h1>שיחה הושלמה!</h1><p>' +
          escape(scenario.titleHe) +
          '</p><div class="xp-gain">+' +
          (xp || 10) +
          ' XP</div><button type="button" class="btn btn-primary" id="btn-c-done">עוד שיחה</button>' +
          '<button type="button" class="btn btn-ghost" id="btn-c-home" style="margin-top:8px">לבית</button></div>';
        qs("#btn-c-done").onclick = () => navigate("conversation");
        qs("#btn-c-home").onclick = () => navigate("home");
      },
    });
  }

  function renderGrammar() {
    showNav(true);
    setActiveNav("path");
    const gram = RLCurriculum.getGrammar && RLCurriculum.getGrammar();
    if (!gram) {
      appEl.innerHTML = "<p>דקדוק לא נטען</p>";
      return;
    }
    const ordered = RLCurriculum.grammarLessonIds();
    let html =
      '<div class="path-header">' +
      statsBar() +
      "<h1>דקדוק</h1>" +
      '<p class="sub" style="color:var(--muted)">' +
      escape(gram.subtitleHe || "") +
      "</p>" +
      '<button type="button" class="btn btn-ghost btn-sm" id="btn-back-home" style="margin-top:8px">← בית</button>' +
      "</div><div class='path-units'>";
    (gram.units || []).forEach((unit, ui) => {
      html +=
        '<div class="unit-banner"><div class="unit-num">יח׳ ' +
        (ui + 1) +
        '</div><div class="unit-title">' +
        escape(unit.titleHe) +
        '</div><div class="unit-ru ru">' +
        escape(unit.titleRu || "") +
        "</div></div>";
      (unit.lessons || []).forEach((les) => {
        const st = RLProgress.lessonStatus(les.id, ordered);
        let cls = "locked";
        let ico = "🔒";
        if (st === "done") {
          cls = "done";
          ico = "★";
        } else if (st === "current" || st === "unlocked") {
          cls = st === "current" ? "current" : "unlocked";
          ico = "▶";
        }
        // Grammar: unlock all after first; use sequential like main path
        html +=
          '<div class="path-node-wrap"><div><button type="button" class="path-node ' +
          cls +
          '" data-id="' +
          les.id +
          '" data-st="' +
          st +
          '">' +
          ico +
          '</button><div class="node-label">' +
          escape(les.titleHe) +
          "</div></div></div>";
      });
    });
    html += "</div>";
    appEl.innerHTML = html;
    qs("#btn-back-home").onclick = () => navigate("home");
    appEl.querySelectorAll(".path-node").forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.st === "locked") return;
        startLesson(btn.dataset.id);
      };
    });
  }

  async function startLesson(lessonId) {
    let lesson = RLCurriculum.getLesson(lessonId);
    if (!lesson) {
      const m = String(lessonId || "").match(/^(a1|a2|b1|b2|c1|c2)/i);
      if (m) {
        appEl.innerHTML = '<div class="boot">טוען ' + m[1].toUpperCase() + "…</div>";
        try {
          await RLCurriculum.ensureLevel(m[1].toUpperCase());
        } catch (e) {
          appEl.innerHTML =
            '<div class="boot"><p>טעינה נכשלה</p><button type="button" class="btn btn-primary" id="les-retry">נסה שוב</button></div>';
          qs("#les-retry").onclick = () => startLesson(lessonId);
          return;
        }
        lesson = RLCurriculum.getLesson(lessonId);
      }
    }
    if (!lesson) return;
    showNav(false);
    if (lessonRunner && lessonRunner.destroy) lessonRunner.destroy();

    appEl.innerHTML = '<div id="lesson-root"></div>';
    const root = qs("#lesson-root");

    lessonRunner = RLEngine.runLesson(lesson, root, {
      onExit() {
        if (lessonRunner && lessonRunner.destroy) lessonRunner.destroy();
        lessonRunner = null;
        if (lesson.level === "GRAM") navigate("grammar");
        else navigate("path");
      },
      onComplete({ xp, perfect, mistakes }) {
        RLProgress.completeLesson(lesson.id, xp, perfect);
        // ensure next level unlock is reflected
        const lvl = lesson.level;
        if (RLCurriculum.isLevelComplete(lvl)) {
          const next = RLCurriculum.nextLevelId(lvl);
          if (next) RLProgress.setLevel(next);
        }
        showCelebration(lesson, xp, perfect, mistakes);
      },
    });
  }

  function showCelebration(lesson, xp, perfect, mistakes) {
    showNav(false);
    appEl.innerHTML =
      '<div class="celeb">' +
      '<div class="big">' +
      (perfect ? "🏆" : "🎉") +
      "</div>" +
      "<h1>" +
      (perfect ? "שיעור מושלם!" : "שיעור הושלם!") +
      "</h1>" +
      "<p>" +
      escape(lesson.titleHe) +
      "</p>" +
      '<div class="xp-gain">+' +
      xp +
      " XP</div>" +
      (mistakes
        ? '<p class="sub" style="color:var(--muted)">טעויות: ' + mistakes + " — מצוין שהמשכת!</p>"
        : "") +
      '<button type="button" class="btn btn-primary" id="btn-next-les">השיעור הבא</button>' +
      '<button type="button" class="btn btn-ghost" id="btn-to-path" style="margin-top:8px">חזרה למסלול</button>' +
      "</div>";

    qs("#btn-to-path").onclick = () =>
      navigate(lesson.level === "GRAM" ? "grammar" : "path");
    qs("#btn-next-les").onclick = async () => {
      if (lesson.level === "GRAM") {
        const ids = RLCurriculum.grammarLessonIds();
        const idx = ids.indexOf(lesson.id);
        const nid = idx >= 0 ? ids[idx + 1] : null;
        if (nid) startLesson(nid);
        else navigate("grammar");
        return;
      }
      const nxt = RLCurriculum.findNextLesson
        ? await RLCurriculum.findNextLesson()
        : RLCurriculum.nextLesson();
      if (nxt) startLesson(nxt.id);
      else navigate("home");
    };
  }

  function escape(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function navigate(name) {
    route = name;
    if (name === "home") await renderHome();
    else if (name === "path") await renderPath();
    else if (name === "levels") await renderLevels();
    else if (name === "progress") renderProgress();
    else if (name === "conversation") renderConversation();
    else if (name === "grammar") renderGrammar();
  }

  navEl.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.onclick = () => navigate(btn.dataset.route);
  });

  // Boot: wait for A1 only (lazy-load other levels on demand)
  const BOOT_TIMEOUT_MS = 45000;

  function globalReady() {
    return (
      window.RLCurriculum &&
      window.RLProgress &&
      window.RLEngine &&
      window.RLSpeech &&
      window.RLSrs &&
      !!RLCurriculum.getLevel("A1")
    );
  }

  async function boot() {
    appEl.innerHTML = '<div class="boot">טוען A1…</div>';
    if (!window.RLCurriculum || !RLCurriculum.ensureLevel) {
      appEl.innerHTML =
        '<div class="boot"><p>שגיאה: curriculum לא נטען</p>' +
        '<button type="button" class="btn btn-primary" id="boot-retry">נסה שוב</button></div>';
      qs("#boot-retry").onclick = () => boot();
      return;
    }
    try {
      const load = (async () => {
        await RLCurriculum.ensureLevel("A1");
        if (RLCurriculum._collect) RLCurriculum._collect();
        if (!RLCurriculum.getLevel("A1")) throw new Error("A1 לא מוכן");
      })();
      await Promise.race([
        load,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), BOOT_TIMEOUT_MS)
        ),
      ]);
      activeLevel = RLProgress.get().currentLevel || "A1";
      await navigate("home");
    } catch (e) {
      const msg =
        e && e.message === "timeout"
          ? "הטעינה ארכה יותר מדי (45 שניות)."
          : "טעינת A1 נכשלה.";
      const detail = e && e.message && e.message !== "timeout" ? String(e.message) : "";
      appEl.innerHTML =
        '<div class="boot"><p>' +
        msg +
        "</p>" +
        (detail ? '<p class="sub" style="color:var(--muted)">' + escape(detail) + "</p>" : "") +
        '<button type="button" class="btn btn-primary" id="boot-retry">נסה שוב</button></div>';
      qs("#boot-retry").onclick = () => boot();
    }
  }

  boot();
})();
