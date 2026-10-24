/* Graded short stories («סיפורים») — path steps after units + optional home card.
   Data: data/stories.js (window.RL_STORIES, window.RL_STORIES_META). Hooks: window.RLPath (js/path.js). */
(function (global) {
  "use strict";
  const LV = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const READ_KEY = "rl_stories_read_v1";
  const TL_SEEN_KEY = "rl_tl_seen_v1";
  const TL_KNOWN_N = 5;
  const META = function () { return global.RL_STORIES_META || {}; };
  const ALL = function () { return Array.isArray(global.RL_STORIES) ? global.RL_STORIES : []; };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function prog() { try { return (global.RLProgress && RLProgress.get()) || {}; } catch (e) { return {}; } }
  function lvIdx(lv) { const i = LV.indexOf(String(lv || "A1").toUpperCase()); return i < 0 ? 0 : i; }
  function readMap() { try { return JSON.parse(localStorage.getItem(READ_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function markRead(id, score) { const m = readMap(); m[id] = { at: Date.now(), score: score }; try { localStorage.setItem(READ_KEY, JSON.stringify(m)); } catch (e) {} }
  function isComplete(id) { try { return !!(global.RLProgress && RLProgress.isComplete(id)); } catch (e) { return false; } }
  function isUnlocked(st) {
    const cur = lvIdx(prog().currentLevel);
    if (lvIdx(st.lv) < cur) return true;
    return isComplete(st.anchor);
  }
  // --- transliteration fading (same rules as the lesson engine) ---
  function tlMode() {
    const s = prog().settings || {};
    if (s.translitMode === "always" || s.translitMode === "never" || s.translitMode === "auto") return s.translitMode;
    return s.translit === false ? "never" : "auto";
  }
  function tlNorm(w) { return String(w || "").toLowerCase().replace(/\u200c/g, "").replace(/[^\p{L}\p{M}]/gu, ""); }
  function tlSeen() { try { return JSON.parse(localStorage.getItem(TL_SEEN_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function tlBump(words) {
    try { const s = tlSeen(); words.forEach((w) => { const k = tlNorm(w); if (k) s[k] = (s[k] || 0) + 1; }); localStorage.setItem(TL_SEEN_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function tlLineHtml(line, policy) {
    const mode = tlMode();
    if (mode === "never" || !line.tl || !line.tl.length) return "";
    const words = String(line.t).split(/\s+/).filter(Boolean);
    if (mode === "auto" && policy === "tap") return '<div class="he-tl-line st-tl"><button type="button" class="tl-reveal-btn st-tl-reveal">👁 תעתיק</button></div>';
    const seen = tlSeen();
    const parts = line.tl.map((tl, i) => {
      const show = mode === "always" || policy === "full" || (seen[tlNorm(words[i] || "")] || 0) < TL_KNOWN_N;
      return show ? '<span class="tl-w">' + esc(tl) + "</span>" : '<span class="tl-w tl-hidden" data-tl="' + esc(tl) + '">•••</span>';
    });
    return '<div class="he-tl-line st-tl">' + parts.join(" ") + "</div>";
  }
  // --- weak words (SRS cards with lapses / due) ---
  function weakSet() {
    // words from SRS items with lapses / overdue, mistake-bank entries and legacy cards with "again"
    const out = new Set();
    try {
      const st = global.RLSrs && RLSrs._state && RLSrs._state();
      if (!st) return out;
      const now = Date.now();
      const addText = (t) => String(t || "").split(/\s+/).forEach((w) => { const k = keyOf(w); if (k && k.length > 1) out.add(k); });
      const items = st.items || {};
      Object.keys(items).forEach((k) => { const x = items[k]; if (x && ((x.l || 0) > 0 || (x.n > 0 && x.due && x.due <= now))) addText(x.r || k); });
      const ms = st.mistakes || {};
      Object.keys(ms).forEach((k) => addText(ms[k].r || k));
      const cards = st.cards || {};
      Object.keys(cards).forEach((k) => { const c = cards[k]; if (c && (c.again || 0) > 0) addText(c.lemma || k); });
    } catch (e) {}
    return out;
  }
  function keyOf(w) { try { return global.RLSrs && RLSrs.normText ? RLSrs.normText(w) : tlNorm(w); } catch (e) { return tlNorm(w); } }
  function storyWeak(st, weak) {
    if (!weak.size) return [];
    const hits = {};
    st.lines.forEach((l) => String(l.t).split(/\s+/).forEach((w) => { const k = keyOf(w); if (k && weak.has(k)) hits[k] = w; }));
    return Object.keys(hits).map((k) => hits[k]);
  }
  /** Pick the story for a path step: the anchor's own story, unless an earlier unread one in the same level drills more weak words. */
  function pickFor(anchorStory) {
    const weak = weakSet();
    const read = readMap();
    const list = ALL().filter((s) => s.lv === anchorStory.lv && s.ord <= anchorStory.ord && (s.id === anchorStory.id || (!read[s.id] && isUnlocked(s))));
    let best = anchorStory, bestScore = -1;
    list.forEach((s) => {
      const w = storyWeak(s, weak).length;
      const sc = w * 3 + (s.id === anchorStory.id ? (read[s.id] ? -5 : 2.5) : 0) - (anchorStory.ord - s.ord) * 0.15;
      if (sc > bestScore) { bestScore = sc; best = s; }
    });
    return best;
  }
  /** A wrong comprehension answer → the story line that holds the answer goes to the mistake bank (SRS v2) */
  function storyMistake(story, q) {
    try {
      if (!global.RLSrs || !RLSrs.addMistake || !RLSrs.itemKey) return;
      const ans = String(q.options[q.answer] || "");
      const aw = ans.split(/\s+/).filter((w) => w.length > 1);
      let best = null, bs = 0;
      story.lines.forEach((l) => { const he = String(l.he); const sc = aw.filter((w) => he.indexOf(w) >= 0).length; if (sc > bs) { bs = sc; best = l; } });
      if (!best) return;
      const k = RLSrs.itemKey(best.t);
      if (!k) return;
      RLSrs.addMistake({ k: k, r: best.t, h: best.he }, "story");
      if (RLSrs.markFail) RLSrs.markFail(best.t, best.he); // persists state
    } catch (e) {}
  }
  // --- audio ---
  let curAudio = null, playToken = 0;
  function stopAudio() { playToken++; if (curAudio) { try { curAudio.pause(); } catch (e) {} curAudio = null; } try { global.RLSpeech && RLSpeech.stop && RLSpeech.stop(); } catch (e) {} }
  function playUrl(url, slow, text) {
    return new Promise((resolve) => {
      if (!url) { // no clip → device TTS
        if (global.RLSpeech && RLSpeech.speak && text) RLSpeech.speak(text, { force: true, rate: slow ? 0.7 : 1 }).then(() => resolve(true), () => resolve(false));
        else resolve(false);
        return;
      }
      const a = new Audio(url);
      curAudio = a;
      a.playbackRate = slow ? 0.7 : 1;
      try { a.preservesPitch = true; a.webkitPreservesPitch = true; } catch (e) {}
      a.onended = () => resolve(true);
      a.onerror = () => resolve(false);
      const p = a.play(); if (p && p.catch) p.catch(() => resolve(false));
    });
  }

  function render(el, story, opts) {
    opts = opts || {};
    stopAudio();
    const policy = story.tlp || "full";
    const qs = story.q || [];
    let qi = 0, correct = 0;
    const words = [];
    story.lines.forEach((l) => String(l.t).split(/\s+/).forEach((w) => words.push(w)));
    const weak = new Set(storyWeak(story, weakSet()).map(keyOf));
    function lineHtml(l, i) {
      const t = String(l.t).split(/\s+/).map((w) => (weak.has(keyOf(w)) ? '<span class="st-weak" title="מילה לחזרה">' + esc(w) + "</span>" : esc(w))).join(" ");
      return '<div class="st-line" data-i="' + i + '">' +
        '<div class="st-ctrl"><button type="button" class="st-play" data-i="' + i + '" aria-label="השמע">🔊</button>' +
        '<button type="button" class="st-slow" data-i="' + i + '" aria-label="השמע לאט">🐢</button></div>' +
        '<div class="st-body"><div class="ru st-t">' + t + "</div>" + tlLineHtml(l, policy) +
        '<div class="st-he hidden">' + esc(l.he) + '</div><button type="button" class="st-he-btn">הצג תרגום</button></div></div>';
    }
    el.innerHTML =
      '<div class="st-wrap">' +
      '<div class="st-top"><button type="button" class="btn btn-ghost btn-sm" id="st-x">✕</button><span class="st-lv">' + esc(story.lv) + " · סיפור</span></div>" +
      '<h1 class="st-title"><span class="ru">' + esc(story.title) + '</span></h1><p class="sub st-title-he">' + esc(story.title_he) + "</p>" +
      (weak.size ? '<p class="sub st-weak-note">מילים <span class="st-weak">מסומנות</span> = מילים שכדאי לחזור עליהן</p>' : "") +
      '<div class="st-bar"><button type="button" class="btn btn-primary btn-sm" id="st-all">▶ השמע הכל</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="st-all-slow">🐢 הכל לאט</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="st-he-all">תרגום לכל השורות</button></div>' +
      '<div class="st-lines">' + story.lines.map(lineHtml).join("") + "</div>" +
      '<button type="button" class="btn btn-primary" id="st-q">' + (qs.length ? "לשאלות הבנה ←" : "סיימתי ←") + "</button>" +
      '<div id="st-qbox"></div></div>';
    const $ = (s) => el.querySelector(s);
    const lines = Array.from(el.querySelectorAll(".st-line"));
    function hi(i) { lines.forEach((n, j) => n.classList.toggle("playing", j === i)); }
    async function playLine(i, slow) {
      const tok = ++playToken;
      hi(i);
      const l = story.lines[i];
      await playUrl(l.a ? "./" + l.a : null, slow, l.t);
      if (tok === playToken) hi(-1);
    }
    async function playAll(slow) {
      stopAudio();
      const tok = playToken;
      for (let i = 0; i < story.lines.length; i++) {
        if (tok !== playToken) return;
        hi(i);
        lines[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
        const l = story.lines[i];
        await playUrl(l.a ? "./" + l.a : null, slow, l.t);
        if (tok !== playToken) return;
        await new Promise((r) => setTimeout(r, 350));
      }
      hi(-1);
    }
    el.querySelectorAll(".st-play").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); stopAudio(); playLine(+b.dataset.i, false); }));
    el.querySelectorAll(".st-slow").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); stopAudio(); playLine(+b.dataset.i, true); }));
    el.querySelectorAll(".st-he-btn").forEach((b) => (b.onclick = () => { b.previousElementSibling.classList.remove("hidden"); b.remove(); }));
    el.querySelectorAll(".st-tl-reveal").forEach((b) => (b.onclick = () => { const i = +b.closest(".st-line").dataset.i; b.parentNode.outerHTML = tlLineHtml(story.lines[i], "full"); }));
    el.querySelectorAll(".tl-hidden").forEach((s) => (s.onclick = () => { s.textContent = s.dataset.tl; s.classList.remove("tl-hidden"); }));
    $("#st-all").onclick = () => playAll(false);
    $("#st-all-slow").onclick = () => playAll(true);
    $("#st-he-all").onclick = () => el.querySelectorAll(".st-he-btn").forEach((b) => b.click());
    $("#st-x").onclick = () => { stopAudio(); opts.onExit && opts.onExit(); };
    function finish() {
      stopAudio();
      tlBump(words);
      const score = qs.length ? Math.round((correct / qs.length) * 100) : 100;
      markRead(story.id, score);
      const xp = 10 + correct * 2;
      $("#st-qbox").innerHTML = '<div class="card st-done"><div class="big">📖</div><h2>כל הכבוד!</h2><p class="sub">' +
        (qs.length ? "ענית נכון על " + correct + " מתוך " + qs.length + " שאלות" : "קראת את הסיפור") + " · +" + xp + ' XP</p><button type="button" class="btn btn-primary" id="st-fin">המשך ←</button></div>';
      $("#st-fin").onclick = () => opts.onDone && opts.onDone({ score: score, xp: xp });
      $("#st-fin").scrollIntoView({ block: "center", behavior: "smooth" });
    }
    function showQ() {
      if (qi >= qs.length) return finish();
      const q = qs[qi];
      const box = $("#st-qbox");
      box.innerHTML = '<div class="card st-qcard"><div class="sub">שאלה ' + (qi + 1) + " מתוך " + qs.length + "</div><h2>" + esc(q.q) + "</h2>" +
        q.options.map((o, i) => '<button type="button" class="choice st-opt" data-i="' + i + '">' + esc(o) + "</button>").join("") + '<div class="st-fb"></div></div>';
      box.scrollIntoView({ block: "start", behavior: "smooth" });
      box.querySelectorAll(".st-opt").forEach((b) => (b.onclick = () => {
        const i = +b.dataset.i, ok = i === q.answer;
        box.querySelectorAll(".st-opt").forEach((x) => { x.disabled = true; if (+x.dataset.i === q.answer) x.classList.add("correct"); });
        if (ok) correct++; else {
          b.classList.add("wrong");
          storyMistake(story, q);
        }
        box.querySelector(".st-fb").innerHTML = (ok ? '<p class="st-ok">נכון! ✓</p>' : '<p class="st-bad">התשובה הנכונה: ' + esc(q.options[q.answer]) + "</p>") +
          '<button type="button" class="btn btn-primary" id="st-next">' + (qi + 1 < qs.length ? "לשאלה הבאה ←" : "סיום ←") + "</button>";
        box.querySelector("#st-next").onclick = () => { qi++; showQ(); };
      }));
    }
    $("#st-q").onclick = () => { $("#st-q").remove(); showQ(); };
  }

  function library(el, api) {
    const cur = lvIdx(prog().currentLevel);
    const read = readMap();
    let html = '<div class="st-wrap"><div class="st-top"><button type="button" class="btn btn-ghost btn-sm" id="st-x">← חזרה</button></div><h1>📖 סיפורים</h1>' +
      '<p class="sub">סיפורים קצרים לקריאה והאזנה, לפי מה שכבר למדת. סיפור חדש נפתח בסוף יחידות במסלול.</p>';
    LV.forEach((lv, li) => {
      const list = ALL().filter((s) => s.lv === lv);
      if (!list.length || li > cur + 0) return;
      html += '<h2 class="st-lvh">' + lv + "</h2>";
      list.forEach((s) => {
        const un = isUnlocked(s);
        html += '<button type="button" class="st-item' + (un ? "" : " locked") + '" data-id="' + esc(s.id) + '"' + (un ? "" : " disabled") + ">" +
          '<span class="st-ico">' + (read[s.id] ? "★" : un ? "📖" : "🔒") + '</span><span class="st-it"><span class="ru">' + esc(s.title) + '</span><span class="sub">' + esc(s.title_he) + "</span></span></button>";
      });
    });
    html += "</div>";
    el.innerHTML = html;
    el.querySelector("#st-x").onclick = () => api.exit();
    el.querySelectorAll(".st-item:not(.locked)").forEach((b) => (b.onclick = () => {
      const st = ALL().find((s) => s.id === b.dataset.id);
      render(el, st, { onExit: () => library(el, api), onDone: (r) => { try { r.xp && global.RLProgress && RLProgress.awardXp(Math.round(r.xp / 2)); } catch (e) {} library(el, api); } });
    }));
  }

  function register() {
    const P = global.RLPath;
    if (!P || !P.registerProvider) return false;
    P.registerProvider("stories", function (ctx) {
      const unitId = ctx.unit && ctx.unit.id;
      const st = ALL().find((s) => s.lv === ctx.levelId && s.unit === unitId);
      if (!st) return [];
      return [{
        id: "story-" + st.id,
        afterLessonId: ctx.unitLessonIds[ctx.unitLessonIds.length - 1],
        order: 20,
        kind: "story",
        icon: "📖",
        titleHe: "סיפור קצר: " + st.title_he,
        start: function (api) {
          const pick = pickFor(st);
          render(api.el, pick, { onExit: () => api.exit(), onDone: (r) => { if (pick.id !== st.id) markRead(st.id, r.score); api.finish(r); } });
        },
      }];
    });
    if (P.registerHomeCard) {
      P.registerHomeCard({
        id: "stories",
        order: 20,
        html: function () {
          const read = Object.keys(readMap()).length;
          const open = ALL().filter(isUnlocked).length;
          return '<div class="card st-home"><h2>📖 סיפורים</h2><p class="sub">סיפורים קצרים בקריאה והאזנה · ' + open + " פתוחים · " + read + ' נקראו</p><button type="button" class="btn btn-ghost" id="btn-stories">לספריית הסיפורים ←</button></div>';
        },
        wire: function (rootEl, api) { const b = rootEl.querySelector("#btn-stories"); if (b) b.onclick = () => library(api.el, api); },
      });
    }
    return true;
  }
  global.RLStories = { all: ALL, render: render, library: library, pickFor: pickFor, isUnlocked: isUnlocked, _weak: weakSet };
  if (!register()) {
    let n = 0;
    const t = setInterval(() => { if (register() || ++n > 100) clearInterval(t); }, 100);
  }
})(window);
