/* Language tips: lazy-loaded bank (data/tips.js → window.RL_TIPS), level-matched, no repeats until cycled. */
(function (global) {
  "use strict";
  const SHOWN_KEY = "rl_tips_shown_v1";
  const ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
  let loading = null;

  function load() {
    if (global.RL_TIPS) return Promise.resolve(global.RL_TIPS);
    if (loading) return loading;
    loading = new Promise((resolve) => {
      const s = document.createElement("script");
      const v = (document.querySelector('script[src*="js/tips.js"]') || {}).src || "";
      const m = v.match(/\?v=(\d+)/);
      s.src = "./data/tips.js" + (m ? "?v=" + m[1] : "");
      s.onload = () => resolve(global.RL_TIPS || []);
      s.onerror = () => { loading = null; resolve([]); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function levelOf(lesson) {
    const id = String((lesson && lesson.id) || "").toLowerCase();
    const m = id.match(/^(a1|a2|b1|b2|c1|c2)-/);
    if (m) return m[1].toUpperCase();
    const lv = String((lesson && lesson.level) || "").toUpperCase();
    if (ORDER.indexOf(lv) >= 0) return lv;
    try { const p = String(global.RLProgress.get().level || "A1").toUpperCase(); if (ORDER.indexOf(p) >= 0) return p; } catch (e) {}
    return "A1";
  }

  function shown() {
    try { return JSON.parse(localStorage.getItem(SHOWN_KEY) || "[]") || []; } catch (e) { return []; }
  }

  function pick(lesson) {
    return load().then((tips) => {
      if (!tips || !tips.length) return null;
      const lv = ORDER.indexOf(levelOf(lesson));
      // eligible: tips at or below the learner's level, preferring the 2 nearest levels
      let pool = tips.filter((t) => ORDER.indexOf(t.lv) <= lv && ORDER.indexOf(t.lv) >= lv - 1);
      if (pool.length < 10) pool = tips.filter((t) => ORDER.indexOf(t.lv) <= lv);
      if (!pool.length) pool = tips.slice();
      let seen = shown();
      let fresh = pool.filter((t) => seen.indexOf(t.id) < 0);
      if (!fresh.length) {
        const ids = pool.map((t) => t.id);
        seen = seen.filter((id) => ids.indexOf(id) < 0); // restart the cycle for this pool
        fresh = pool.slice();
      }
      const tip = fresh[Math.floor(Math.random() * fresh.length)];
      seen.push(tip.id);
      try { localStorage.setItem(SHOWN_KEY, JSON.stringify(seen.slice(-2000))); } catch (e) {}
      return tip;
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function cardEl(tip, kicker) {
    const d = document.createElement("div");
    d.className = "tip-card";
    let h = '<div class="tip-kicker">💡 ' + esc(kicker || "טיפ") + "</div>" +
      '<div class="tip-title">' + esc(tip.t) + "</div>" +
      '<div class="tip-body">' + esc(tip.b) + "</div>";
    (tip.ex || []).forEach((e) => {
      h += '<div class="tip-ex"><div class="tip-ex-t" dir="auto">' + esc(e[0]) + "</div>" +
        (e[1] ? '<div class="tip-ex-tl">' + esc(e[1]) + "</div>" : "") +
        (e[2] ? '<div class="tip-ex-he">' + esc(e[2]) + "</div>" : "") + "</div>";
    });
    d.innerHTML = h;
    return d;
  }

  global.RLTips = { load: load, pick: pick, cardEl: cardEl, levelOf: levelOf };
})(typeof window !== "undefined" ? window : globalThis);
