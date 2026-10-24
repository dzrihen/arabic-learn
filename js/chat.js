/* Free AI conversation («שיחה חופשית») — role-play path step at the end of units from A2 + optional home card.
   Backend: Cloudflare Worker (no API key in the client). Hooks: window.RLPath (js/path.js). */
(function (global) {
  "use strict";
  const ENDPOINT = "https://lang-chat.daniel-zrihen.workers.dev/chat";
  const APP_KEY = "lc_syfsb8dt8D4_7d-Rbg1G3_UL";
  const LV = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const META = function () { return global.RL_STORIES_META || {}; };
  const SCEN = [
    { id: "cafe", he: "בבית קפה / מסעדה", role: "מלצר/ית", re: /אוכל|שתי|מסעד|קפה|ארוח|מטבח/ },
    { id: "shop", he: "קניות בחנות או בשוק", role: "מוכר/ת", re: /קני|שוק|חנות|כסף|צרכנ|בגד/ },
    { id: "doctor", he: "אצל הרופא", role: "רופא/ה", re: /בריא|רופא|גוף|רפוא|ספורט/ },
    { id: "taxi", he: "נסיעה במונית", role: "נהג/ת מונית", re: /נסיע|תחבור|טיול|תייר/ },
    { id: "apartment", he: "שיחה עם השכן על הדירה", role: "שכן/ה", re: /דיר|דיור|שכנ|בבית|בית/ },
    { id: "work", he: "שיחה עם עמית לעבודה", role: "עמית/ה לעבודה", re: /עבוד|מקצוע|משרד|עסק|קריירה|משא ומתן/ },
    { id: "services", he: "בבנק / בדואר / בעירייה", role: "פקיד/ה", re: /שירות|בירוקר|בנק|דואר|סידור/ },
    { id: "emergency", he: "מצב חירום — מבקשים עזרה", role: "מוקדן/ית או עובר/ת אורח", re: /חירום/ },
    { id: "plans", he: "מתכננים יחד את סוף השבוע", role: "חבר/ה", re: /עתיד|תוכנ/ },
    { id: "past", he: "מה עשית בסוף השבוע?", role: "חבר/ה", re: /עבר|סיפורי/ },
    { id: "opinion", he: "מחליפים דעות על חדשות ונושאים", role: "חבר/ה", re: /דעו|חדשות|טיעונ|חברה|סביב|מדיה|טכנולוג|כלכל|מדע|אתיק|מופשט|עיתונ|ספרות|קולנוע/ },
    { id: "friend", he: "שיחה עם חבר/ה", role: "חבר/ה", re: /חברתי|היכר|בילוי|תחביב|חגים|תרבות|תקשורת|יחסים|תיאור|השוו|נימוס|בקשות/ },
  ];
  function scenarioFor(title) { const t = String(title || ""); return SCEN.find((s) => s.re.test(t)) || SCEN[SCEN.length - 1]; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function prog() { try { return (global.RLProgress && RLProgress.get()) || {}; } catch (e) { return {}; } }
  function lvIdx(lv) { const i = LV.indexOf(String(lv || "A1").toUpperCase()); return i < 0 ? 0 : i; }
  function unlocked() { return lvIdx(prog().currentLevel) >= 1 || (function () { try { return RLCurriculum.isLevelUnlocked("A2") && RLCurriculum.isLevelComplete && RLCurriculum.isLevelComplete("A1"); } catch (e) { return false; } })(); }
  function clientId() {
    let id = null;
    try { id = localStorage.getItem("rl_chat_cid"); if (!id) { id = "c" + Math.random().toString(36).slice(2, 12); localStorage.setItem("rl_chat_cid", id); } } catch (e) { id = "anon"; }
    return id;
  }
  function tlWords(text) {
    try {
      if (!global.RLHeTl) return "";
      return String(text).split(/\s+/).filter(Boolean).map((w) => (/\d/.test(w) ? w.replace(/[^\d.,:%€₽$]/g, "") : /[\p{L}]/u.test(w) ? RLHeTl(w) : w)).filter(Boolean).join(" ");
    } catch (e) { return ""; }
  }
  const ERR = {
    daily_limit: "הגעת למכסת השיחות היומית. נמשיך מחר 🙂",
    monthly_cap: "השיחה החופשית הושהתה החודש (הגענו לתקרת העלות). תחזור בתחילת החודש הבא.",
    forbidden: "השירות לא זמין כרגע.",
    upstream: "המורה לא זמין כרגע — נסה שוב בעוד רגע.",
    network: "אין חיבור לאינטרנט — השיחה החופשית צריכה רשת.",
  };
  async function callAI(body) {
    try {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", "x-app-key": APP_KEY, "x-client-id": clientId() }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      return j && typeof j === "object" ? j : { ok: false, error: "upstream" };
    } catch (e) { return { ok: false, error: "network" }; }
  }
  function saveMistakes(list) {
    (list || []).forEach((m) => {
      if (!m || !m.right) return;
      try {
        if (global.RLSrs && RLSrs.addMistake && RLSrs.itemKey && m.he && /^[\u0590-\u05FF\s\-'"׳״,.()?!]+$/.test(m.he) && m.he.split(/\s+/).length <= 5 && String(m.right).split(/\s+/).length <= 4) {
          const k = RLSrs.itemKey(m.right);
          if (k) { RLSrs.addMistake({ k: k, r: String(m.right), h: String(m.he) }, "chat"); RLSrs.markFail && RLSrs.markFail(String(m.right), String(m.he)); }
        }
      } catch (e) {}
    });
    try {
      const k = "rl_chat_mistakes_v1"; const all = JSON.parse(localStorage.getItem(k) || "[]");
      (list || []).forEach((m) => m && m.right && all.push({ at: Date.now(), wrong: m.wrong, right: m.right, he: m.he || "" }));
      localStorage.setItem(k, JSON.stringify(all.slice(-200)));
    } catch (e) {}
  }

  function render(el, scen, opts) {
    opts = opts || {};
    const level = LV[Math.max(1, lvIdx(prog().currentLevel))];
    const hist = [];
    let turns = 0, busy = false, showTl = true, showHe = false;
    el.innerHTML =
      '<div class="ch-wrap">' +
      '<div class="st-top"><button type="button" class="btn btn-ghost btn-sm" id="ch-x">✕</button><span class="st-lv">' + level + " · שיחה חופשית</span></div>" +
      "<h1 class='ch-title'>💬 " + esc(scen.he) + "</h1>" +
      '<p class="sub">המורה משחק/ת: ' + esc(scen.role) + ". כתוב/י או דבר/י ב" + esc(META().name || "שפת היעד") + " — טעויות יתוקנו בעדינות בעברית.</p>" +
      '<div class="ch-tog"><label><input type="checkbox" id="ch-tl" checked> תעתיק</label><label><input type="checkbox" id="ch-he"> תרגום</label></div>' +
      '<div class="ch-log" id="ch-log"></div>' +
      '<div class="ch-in"><button type="button" class="ch-mic" id="ch-mic" aria-label="דיבור">🎤</button>' +
      '<input type="text" class="ru ch-text" id="ch-text" maxlength="300" placeholder="כתוב/י כאן…" autocomplete="off">' +
      '<button type="button" class="btn btn-primary ch-send" id="ch-send">שלח</button></div>' +
      '<button type="button" class="btn btn-ghost" id="ch-end" disabled>סיום שיחה (אחרי 3 תגובות)</button></div>';
    const $ = (s) => el.querySelector(s);
    const log = $("#ch-log");
    function bubbleAI(d) {
      const b = document.createElement("div");
      b.className = "ch-b ai";
      const tl = tlWords(d.reply);
      b.innerHTML = '<div class="ch-row"><button type="button" class="ch-say" aria-label="השמע">🔊</button><div class="ru ch-t">' + esc(d.reply) + "</div></div>" +
        (tl ? '<div class="he-tl-line ch-tl' + (showTl ? "" : " hidden") + '">' + esc(tl) + "</div>" : "") +
        (d.he ? '<div class="ch-he' + (showHe ? "" : " hidden") + '">' + esc(d.he) + '</div>' : "") +
        (d.he ? '<button type="button" class="st-he-btn ch-he-btn' + (showHe ? " hidden" : "") + '">הצג תרגום</button>' : "");
      b.querySelector(".ch-say").onclick = () => say(d.reply, true);
      const hb = b.querySelector(".ch-he-btn"); if (hb) hb.onclick = () => { b.querySelector(".ch-he").classList.remove("hidden"); hb.classList.add("hidden"); };
      log.appendChild(b);
      b.scrollIntoView({ block: "end", behavior: "smooth" });
    }
    function bubbleMe(text) { const b = document.createElement("div"); b.className = "ch-b me"; b.innerHTML = '<div class="ru ch-t">' + esc(text) + "</div>"; log.appendChild(b); return b; }
    function bubbleNote(html, cls) { const b = document.createElement("div"); b.className = "ch-note " + (cls || ""); b.innerHTML = html; log.appendChild(b); b.scrollIntoView({ block: "end", behavior: "smooth" }); return b; }
    function say(text, force) {
      try {
        if (!force && prog().settings && prog().settings.sound === false) return;
        if (global.RLSpeech && RLSpeech.speak) RLSpeech.speak(text, { force: true });
      } catch (e) {}
    }
    async function send(text) {
      if (busy) return;
      busy = true; $("#ch-send").disabled = true;
      let meB = null;
      if (text) { meB = bubbleMe(text); turns++; }
      const wait = bubbleNote("<span class='ch-dots'>…</span>", "wait");
      const r = await callAI({ lang: META().lang, level: level, scenario: { he: scen.he, role: scen.role }, history: hist.slice(-14), text: text || "" });
      wait.remove();
      busy = false; $("#ch-send").disabled = false;
      if (!r.ok) { bubbleNote(esc(ERR[r.error] || ERR.upstream), "err"); if (text) turns--; return; }
      if (text) hist.push({ role: "user", content: text });
      else hist.push({ role: "user", content: "(התחל)" });
      hist.push({ role: "assistant", content: r.reply });
      if (meB && (r.correction || r.corrected)) {
        const c = document.createElement("div");
        c.className = "ch-fix";
        c.innerHTML = "✏️ " + esc(r.correction || "") + (r.corrected ? '<div class="ru ch-corr">' + esc(r.corrected) + "</div>" : "");
        meB.appendChild(c);
        saveMistakes(r.mistakes);
      }
      bubbleAI(r);
      say(r.reply, false);
      const end = $("#ch-end");
      if (turns >= 3) { end.disabled = false; end.textContent = "סיום שיחה ✓"; end.classList.add("btn-primary"); end.classList.remove("btn-ghost"); }
      if (r.done && turns >= 2) bubbleNote("השיחה הגיעה לסיום טבעי — אפשר לסיים 🎉", "ok");
    }
    $("#ch-send").onclick = () => { const v = $("#ch-text").value.trim(); if (!v) return; $("#ch-text").value = ""; send(v); };
    $("#ch-text").onkeydown = (e) => { if (e.key === "Enter") $("#ch-send").click(); };
    $("#ch-tl").onchange = function () { showTl = this.checked; el.querySelectorAll(".ch-tl").forEach((n) => n.classList.toggle("hidden", !showTl)); };
    $("#ch-he").onchange = function () { showHe = this.checked; el.querySelectorAll(".ch-he").forEach((n) => n.classList.toggle("hidden", !showHe)); el.querySelectorAll(".ch-he-btn").forEach((n) => n.classList.toggle("hidden", showHe)); };
    const mic = $("#ch-mic");
    const canRec = global.RLSpeech && RLSpeech.canRecognize && RLSpeech.canRecognize();
    if (!canRec) mic.classList.add("hidden");
    mic.onclick = async () => {
      mic.classList.add("rec");
      const r = await RLSpeech.recognizeOnce(8000);
      mic.classList.remove("rec");
      if (r && r.ok && r.transcript) { $("#ch-text").value = r.transcript; $("#ch-text").focus(); }
      else bubbleNote("לא נקלט דיבור — נסה/י שוב או הקלד/י.", "err");
    };
    $("#ch-x").onclick = () => { try { RLSpeech && RLSpeech.stop && RLSpeech.stop(); } catch (e) {} opts.onExit && opts.onExit(); };
    $("#ch-end").onclick = () => {
      try { RLSpeech && RLSpeech.stop && RLSpeech.stop(); } catch (e) {}
      const xp = 10 + Math.min(10, turns * 2);
      el.innerHTML = '<div class="celeb"><div class="big">💬</div><h1>שיחה מצוינת!</h1><p class="sub">' + turns + ' תגובות שלך · +' + xp + ' XP</p><button type="button" class="btn btn-primary" id="ch-fin">המשך ←</button></div>';
      el.querySelector("#ch-fin").onclick = () => opts.onDone && opts.onDone({ score: turns, xp: xp });
    };
    send("");
  }

  function lockedHtml() {
    return '<div class="card ch-home locked"><h2>💬 שיחה חופשית 🔒</h2><p class="sub">נפתחת מרמת A2. ' +
      "בשיחה החופשית מדברים עם מורה וירטואלי בתרחישים מהחיים (בית קפה, קניות, רופא, מונית…), והוא מתקן טעויות בעדינות בעברית. " +
      "כדי שתוכל/י לענות בעצמך צריך קודם בסיס של A1 — סיים/י את A1 והיא תיפתח.</p></div>";
  }
  function picker(el, api) {
    let html = '<div class="ch-wrap"><div class="st-top"><button type="button" class="btn btn-ghost btn-sm" id="ch-x">← חזרה</button></div><h1>💬 שיחה חופשית</h1><p class="sub">בחר/י תרחיש:</p>';
    SCEN.forEach((s) => { html += '<button type="button" class="st-item" data-id="' + s.id + '"><span class="st-ico">💬</span><span class="st-it">' + esc(s.he) + '<span class="sub">המורה: ' + esc(s.role) + "</span></span></button>"; });
    el.innerHTML = html + "</div>";
    el.querySelector("#ch-x").onclick = () => api.exit();
    el.querySelectorAll(".st-item").forEach((b) => (b.onclick = () => {
      const s = SCEN.find((x) => x.id === b.dataset.id);
      render(el, s, { onExit: () => picker(el, api), onDone: (r) => { try { global.RLProgress && RLProgress.awardXp(Math.round(r.xp / 2)); } catch (e) {} picker(el, api); } });
    }));
  }
  function register() {
    const P = global.RLPath;
    if (!P || !P.registerProvider) return false;
    P.registerProvider("chat", function (ctx) {
      if (lvIdx(ctx.levelId) < 1) return [];
      const title = (ctx.unit && ctx.unit.titleHe) || "";
      if (/^חזרה/.test(title)) return [];
      let sc = scenarioFor(title);
      if (sc.id === "friend" && !SCEN[SCEN.length - 1].re.test(title)) { // generic unit → rotate social scenarios
        const pool = ["friend", "plans", "past"].concat(lvIdx(ctx.levelId) >= 3 ? ["opinion"] : []);
        sc = SCEN.find((x) => x.id === pool[ctx.unitIndex % pool.length]);
      }
      return [{
        id: "chat-" + ctx.unit.id,
        afterLessonId: ctx.unitLessonIds[ctx.unitLessonIds.length - 1],
        order: 30,
        kind: "chat",
        icon: "💬",
        titleHe: "שיחה חופשית: " + sc.he,
        start: function (api) { render(api.el, sc, { onExit: () => api.exit(), onDone: (r) => api.finish(r) }); },
      }];
    });
    if (P.registerHomeCard) {
      P.registerHomeCard({
        id: "free-chat",
        order: 25,
        html: function () {
          if (!unlocked()) return lockedHtml();
          return '<div class="card ch-home"><h2>💬 שיחה חופשית</h2><p class="sub">שיחה עם מורה וירטואלי בתרחישים מהחיים · תיקונים בעברית</p><button type="button" class="btn btn-ghost" id="btn-free-chat">לבחירת תרחיש ←</button></div>';
        },
        wire: function (rootEl, api) { const b = rootEl.querySelector("#btn-free-chat"); if (b) b.onclick = () => picker(api.el, api); },
      });
    }
    return true;
  }
  global.RLChat = { render: render, picker: picker, scenarioFor: scenarioFor, unlocked: unlocked, SCEN: SCEN };
  if (!register()) { let n = 0; const t = setInterval(() => { if (register() || ++n > 100) clearInterval(t); }, 100); }
})(window);
