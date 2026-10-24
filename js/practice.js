/* In-path practice: SRS-due + mistake items mixed into regular lessons, «אמור את זה» speaking check,
 * unit checkpoint test (path step), optional review / mistakes sessions + home card.
 * Shared, identical in all 4 apps (language specifics: window.RL_LANG). Needs srs.js v2 + path.js. */
(function (global) {
  "use strict";

  const LANG = global.RL_LANG || { code: "el", nameHe: "יוונית", srLocales: ["el-GR"] };
  const NOSPEAK_KEY = (LANG.srsKey || "rl") + "_nospeak_until";

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function wc(s) { return String(s || "").split(/\s+/).filter((w) => /\p{L}/u.test(w)).length; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function core(w) { return String(w || "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}\u200C]+$/gu, ""); }
  function tokens(s) { return String(s || "").split(/\s+/).map(core).filter(Boolean); }
  function key(s) { return global.RLSrs && RLSrs.itemKey ? RLSrs.itemKey(s) : String(s || "").toLowerCase(); }

  function injectStyle() {
    if (document.getElementById("rl-practice-style")) return;
    const st = document.createElement("style");
    st.id = "rl-practice-style";
    st.textContent =
      ".rev-badge{display:inline-block;font-size:.78rem;font-weight:700;padding:3px 10px;border-radius:999px;margin-bottom:8px;background:#e8f4ff;color:#1a6fb0}" +
      ".rev-badge.mistake{background:#fff1e6;color:#b05a1a}" +
      ".speak-words{margin:12px 0;font-size:1.25rem;line-height:1.9;text-align:center}" +
      ".speak-words .w{display:inline-block;padding:0 6px;margin:2px;border-radius:8px}" +
      ".speak-words .w.ok{background:#d7f5c4;color:#2b7a00}.speak-words .w.miss{background:#ffdede;color:#b00020}" +
      ".speak-heard{font-size:.9rem;color:var(--muted,#777);text-align:center;margin-bottom:6px}" +
      ".speak-msg{text-align:center;font-weight:700;margin:6px 0}" +
      ".speak-actions-col{display:flex;flex-direction:column;gap:8px;margin-top:12px}" +
      ".path-step.locked{opacity:.55}.path-step.step-checkpoint{border-style:dashed}" +
      ".cp-score{font-size:3rem;font-weight:800;margin:8px 0}" +
      ".cp-weak{list-style:none;padding:0;margin:10px 0;text-align:right}" +
      ".cp-weak li{padding:6px 10px;border-radius:10px;background:var(--card2,#f5f5f5);margin:4px 0}" +
      ".practice-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.practice-row .btn{flex:1 1 140px}";
    document.head.appendChild(st);
  }

  /* ——— speech recognition ——— */
  function srCtor() { return global.SpeechRecognition || global.webkitSpeechRecognition || null; }
  function speakSupported() { return !!srCtor(); }
  function speakEnabled() {
    if (!speakSupported()) return false;
    try { if (RLProgress.get().settings.speakEx === false) return false; } catch (e) {}
    try { const u = +localStorage.getItem(NOSPEAK_KEY) || 0; if (u > Date.now()) return false; } catch (e) {}
    return true;
  }
  function pauseSpeaking(minutes) {
    try { localStorage.setItem(NOSPEAK_KEY, String(Date.now() + (minutes || 60) * 60000)); } catch (e) {}
  }

  function recognize(timeoutMs) {
    const C = srCtor();
    const locales = (LANG.srLocales || []).slice();
    return new Promise((resolve) => {
      if (!C) return resolve({ ok: false, error: "unsupported" });
      let li = 0;
      function attempt() {
        let r;
        try { r = new C(); } catch (e) { return resolve({ ok: false, error: "unsupported" }); }
        let done = false;
        const finish = (res) => { if (done) return; done = true; clearTimeout(timer); try { r.abort && r.abort(); } catch (e) {} resolve(res); };
        r.lang = locales[li] || "";
        r.interimResults = false;
        r.continuous = false;
        r.maxAlternatives = 5;
        r.onresult = (ev) => {
          const alts = [];
          try {
            const res = ev.results[ev.results.length - 1] || ev.results[0];
            for (let i = 0; i < res.length; i++) if (res[i] && res[i].transcript) alts.push(res[i].transcript);
          } catch (e) {}
          finish(alts.length ? { ok: true, alts: alts } : { ok: false, error: "no-speech" });
        };
        r.onerror = (ev) => {
          const err = (ev && ev.error) || "error";
          if (err === "language-not-supported" && li + 1 < locales.length) {
            done = true; clearTimeout(timer); li++; attempt(); return;
          }
          finish({ ok: false, error: err });
        };
        r.onend = () => finish({ ok: false, error: "no-speech" });
        const timer = setTimeout(() => finish({ ok: false, error: "no-speech" }), timeoutMs || 8000);
        try { r.start(); } catch (e) { finish({ ok: false, error: "start" }); }
      }
      attempt();
    });
  }

  /* ——— fuzzy matching (diacritics, letter variants, colloquial vs written) ——— */
  function fuzzNorm(s) {
    let t = global.RLSrs && RLSrs.normText ? RLSrs.normText(s) : String(s || "").toLowerCase();
    if (LANG.code === "fa") {
      t = t.replace(/\s+است(?=\s|$)/g, "ست").replace(/خوا/g, "خا").replace(/ان/g, "ون")
        .replace(/ست(?=\s|$)/g, "ه").replace(/هه(?=\s|$)/g, "ه");
    } else if (LANG.code === "ar") {
      t = t.replace(/[قءأإآؤئ]/g, "ا").replace(/ث/g, "ت").replace(/ذ/g, "د").replace(/ظ/g, "ض").replace(/ة/g, "ه").replace(/ى/g, "ي");
    }
    return t;
  }
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      const t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }
  function sim(a, b) { const L = Math.max(a.length, b.length); return L ? 1 - lev(a, b) / L : 1; }

  /** Compare what was heard with the target. Returns {pass, ratio, words:[{w, ok}]} */
  function matchSpeech(heard, target) {
    const thr = LANG.code === "fa" || LANG.code === "ar" ? 0.65 : 0.75;
    const tWords = tokens(target);
    const tn = tWords.map(fuzzNorm);
    const hw = fuzzNorm(heard).split(/\s+/).filter(Boolean);
    const cands = hw.slice();
    for (let i = 0; i + 1 < hw.length; i++) cands.push(hw[i] + hw[i + 1]); // split / joined words
    const joined = hw.join("");
    const words = tWords.map((w, i) => {
      const n = tn[i].replace(/\s+/g, "");
      if (!n) return { w: w, ok: true };
      let best = 0;
      cands.forEach((c) => { best = Math.max(best, sim(n, c)); });
      if (best < thr && n.length >= 4 && joined.indexOf(n) >= 0) best = 1;
      return { w: w, ok: best >= thr };
    });
    const okN = words.filter((x) => x.ok).length;
    const ratio = words.length ? okN / words.length : 0;
    const pass = words.length <= 2 ? okN === words.length : ratio >= 0.7;
    return { pass: pass, ratio: ratio, words: words };
  }
  function bestMatch(alts, target) {
    let best = null, heard = "";
    (alts || []).forEach((a) => {
      const m = matchSpeech(a, target);
      if (!best || m.ratio > best.ratio) { best = m; heard = a; }
    });
    return { m: best || matchSpeech("", target), heard: heard };
  }

  /** Engine calls this for type "speak_check". api: helpers from the engine closure. */
  function renderSpeakCheck(card, ex, api) {
    injectStyle();
    if (!speakEnabled()) { setTimeout(() => api.alt(), 0); return; }
    card.appendChild(api.el("div", "ex-prompt", "🎤 אמור את זה בקול"));
    if (ex.he) card.appendChild(api.el("div", "he-prompt he-big", api.escapeHtml(ex.he)));
    const big = api.markTarget(api.el("div", "ru-big", api.escapeHtml(ex.ru)));
    card.appendChild(big);
    try { const tl = api.sentenceTl(ex.ru, "reveal-tl"); if (tl) card.appendChild(tl); } catch (e) {}
    card.appendChild(api.ttsButton(ex.ru, false));
    api.autoPlay(ex.ru);
    const result = api.el("div", "speak-result");
    card.appendChild(result);
    const col = api.el("div", "speak-actions-col");
    const mic = api.el("button", "btn btn-blue speak-mic", "🎤 לחץ ודבר");
    mic.type = "button";
    const skip = api.el("button", "btn btn-ghost speak-skip", "דלג");
    skip.type = "button";
    const cant = api.el("button", "btn btn-ghost speak-cant", "אי אפשר לדבר עכשיו");
    cant.type = "button";
    col.appendChild(mic); col.appendChild(skip); col.appendChild(cant);
    card.appendChild(col);
    let fails = 0;

    function showWords(m, heard, msg) {
      result.innerHTML = "";
      if (heard) {
        const h = api.el("div", "speak-heard");
        h.appendChild(document.createTextNode("שמעתי: "));
        h.appendChild(api.targetText(heard));
        result.appendChild(h);
      }
      if (m) {
        const box = api.markTarget(api.el("div", "speak-words"));
        m.words.forEach((x) => { const s = document.createElement("span"); s.className = "w " + (x.ok ? "ok" : "miss"); s.textContent = x.w; box.appendChild(s); box.appendChild(document.createTextNode(" ")); });
        result.appendChild(box);
      }
      if (msg) result.appendChild(api.el("div", "speak-msg", msg));
    }

    mic.onclick = async () => {
      if (api.isBusy() || mic.disabled) return;
      try { if (global.RLSpeech && RLSpeech.stop) RLSpeech.stop(); } catch (e) {}
      mic.disabled = true;
      mic.textContent = "מקשיב… דבר עכשיו";
      const res = await recognize(8000);
      mic.disabled = false;
      mic.textContent = "🎤 לחץ ודבר";
      if (!res.ok) {
        if (res.error === "not-allowed" || res.error === "service-not-allowed" || res.error === "unsupported" || res.error === "audio-capture") {
          showWords(null, "", "אין גישה למיקרופון — אפשר לדלג או לבחור «אי אפשר לדבר עכשיו»");
        } else {
          showWords(null, "", "לא שמעתי — נסה שוב, קרוב יותר למיקרופון");
        }
        return;
      }
      const b = bestMatch(res.alts, ex.ru);
      if (b.m.pass) {
        showWords(b.m, b.heard, "");
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createTextNode("אמרת נכון! "));
        frag.appendChild(api.targetText(ex.ru));
        api.succeed(frag);
      } else {
        fails++;
        if (fails >= 2) {
          showWords(b.m, b.heard, "");
          const frag = document.createDocumentFragment();
          frag.appendChild(document.createTextNode("המשפט: "));
          frag.appendChild(api.targetText(ex.ru));
          api.fail(frag);
        } else {
          showWords(b.m, b.heard, "כמעט! המילים באדום עוד לא נשמעו — האזן ונסה שוב");
        }
      }
    };
    skip.onclick = () => { if (!api.isBusy()) api.skip(); };
    cant.onclick = () => { if (api.isBusy()) return; pauseSpeaking(60); api.alt(); };
  }

  /* ——— exercise builders for one item {k, r, h, ty?} ——— */
  function heDistractors(item, pool, n) {
    const wn = wc(item.r);
    const seen = {}; seen[item.h] = 1;
    const c = shuffle(pool.filter((p) => p.h && p.k !== item.k && !seen[p.h] && (seen[p.h] = 1)));
    c.sort((a, b) => Math.abs(wc(a.r) - wn) - Math.abs(wc(b.r) - wn));
    return c.slice(0, n);
  }
  function ruDistractors(item, pool, n) {
    const wn = wc(item.r);
    const seen = {}; seen[key(item.r)] = 1;
    const c = shuffle(pool.filter((p) => { const k = key(p.r); if (seen[k] || p.h === item.h) return false; seen[k] = 1; return true; }));
    c.sort((a, b) => Math.abs(wc(a.r) - wn) - Math.abs(wc(b.r) - wn));
    return c.slice(0, n).map((p) => p.r);
  }
  function wordDistractors(words, pool, n) {
    const have = {}; words.forEach((w) => { have[w.toLowerCase()] = 1; });
    const bag = {};
    pool.forEach((p) => tokens(p.r).forEach((w) => { if (!have[w.toLowerCase()] && w.length >= 2) bag[w] = 1; }));
    return shuffle(Object.keys(bag)).slice(0, n);
  }
  const PREF_MAP = {
    listen_choice: "listen_choice", listen_order: "listen_choice", read_choice: "read_choice", true_false: "read_choice",
    match_pairs: "read_choice", sentence_build: "sentence_build", translate_he_ru: "sentence_build",
    he_pick: "he_pick", fill_blank: "he_pick", missing_word: "he_pick", reply_pick: "he_pick", dialogue: "he_pick",
    speak_check: "speak_check", speak_repeat: "speak_check", alphabet: "read_choice",
  };
  function allowedKinds(item, ramp, opts) {
    const stage = ramp ? ramp.stage : 5;
    const n = wc(item.r);
    const k = ["read_choice", "sentence_build"];
    if (!ramp || n <= (ramp.listenCap || 99)) k.push("listen_choice");
    if (stage >= 1) k.push("he_pick");
    if (opts && opts.speak && speakEnabled() && n <= speakCap(ramp)) k.push("speak_check");
    return k;
  }
  function speakCap(ramp) {
    const st = ramp ? ramp.stage : 5;
    return st === 0 ? 3 : st === 1 ? 4 : Math.min((ramp && ramp.cap) || 7, 7);
  }
  function buildItemExercise(item, pool, ramp, opts) {
    opts = opts || {};
    const kinds = allowedKinds(item, ramp, opts);
    let kind = null;
    const pref = PREF_MAP[item.ty];
    if (opts.kind && kinds.indexOf(opts.kind) >= 0) kind = opts.kind;
    else if (pref && kinds.indexOf(pref) >= 0 && Math.random() < 0.6) kind = pref;
    else kind = kinds.filter((x) => x !== "speak_check")[Math.floor(Math.random() * (kinds.length - (kinds.indexOf("speak_check") >= 0 ? 1 : 0)))];
    const order = [kind].concat(shuffle(kinds.filter((x) => x !== kind && x !== "speak_check")));
    for (let i = 0; i < order.length; i++) {
      const ex = makeKind(order[i], item, pool, ramp);
      if (ex) {
        ex._srsKey = item.k; ex._srsLemma = item.k; ex._gen = 1;
        if (opts.badge !== false) ex._rev = item.src === "mistake" ? "mistake" : "due";
        return ex;
      }
    }
    return null;
  }
  function makeKind(kind, item, pool, ramp) {
    if (kind === "read_choice" || kind === "listen_choice") {
      const d = heDistractors(item, pool, 3);
      if (d.length < 2) return null;
      return { type: kind, ru: item.r, choices: shuffle([{ he: item.h, correct: true }].concat(d.map((x) => ({ he: x.h, correct: false })))) };
    }
    if (kind === "sentence_build") {
      const words = tokens(item.r);
      if (!words.length) return null;
      const dn = !ramp || ramp.stage >= 2 ? 3 : 2;
      const dis = wordDistractors(words, pool, dn);
      if (dis.length < 1) return null;
      return { type: "sentence_build", he: item.h, ru: item.r, words: words, distractors: dis };
    }
    if (kind === "he_pick") {
      const d = ruDistractors(item, pool, 3);
      if (d.length < 2) return null;
      return { type: "he_pick", ru: item.r, he: item.h, options: shuffle([item.r].concat(d)) };
    }
    if (kind === "speak_check") return { type: "speak_check", ru: item.r, he: item.h };
    return null;
  }

  function lessonPool(list) {
    const out = [];
    const seen = {};
    (list || []).forEach((ex) => {
      (global.RLSrs && RLSrs.itemsFromExercise ? RLSrs.itemsFromExercise(ex) : []).forEach((it) => {
        if (seen[it.k]) return; seen[it.k] = 1; out.push({ k: it.k, r: it.r, h: it.h });
      });
    });
    return out;
  }
  function mergePools(a, b) {
    const seen = {}; const out = [];
    a.concat(b).forEach((p) => { if (p && !seen[p.k]) { seen[p.k] = 1; out.push(p); } });
    return out;
  }

  /* ——— in-lesson integration ——— */
  const REPLACEABLE = /^(read_choice|listen_choice|translate_he_ru|sentence_build|match_pairs|listen_order|speak_repeat)$/;

  function mixReview(lesson, list, ramp) {
    if (!global.RLSrs || !RLSrs.pickForLesson || list.length < 5) return list;
    const alpha = list.filter((e) => e && e.type === "alphabet").length;
    let n = Math.min(4, Math.round(list.length * 0.25));
    if (alpha > list.length / 2) n = Math.min(n, 1);
    if (n <= 0) return list;
    const own = lessonPool(list);
    const exclude = {}; own.forEach((p) => { exclude[p.k] = 1; });
    const cap = ramp ? ramp.cap : 99;
    const picks = RLSrs.pickForLesson({ n: n, maxWords: cap, exclude: exclude });
    if (!picks.length) return list;
    const pool = mergePools(own, RLSrs.itemPool(cap < 50 ? cap + 2 : 0));
    const slots = [];
    list.forEach((ex, i) => { if (i > 0 && ex && REPLACEABLE.test(ex.type) && !ex._gen) slots.push(i); });
    const chosen = shuffle(slots).slice(0, picks.length).sort((a, b) => a - b);
    const out = list.slice();
    const extra = [];
    picks.forEach((it, j) => {
      const ex = buildItemExercise(it, pool, ramp, { speak: false });
      if (!ex) return;
      if (j < chosen.length) out[chosen[j]] = ex; else extra.push(ex);
    });
    // not enough replaceable slots: insert (max 2) before the last exercise
    extra.slice(0, 2).forEach((ex) => out.splice(Math.max(1, out.length - 1), 0, ex));
    return out;
  }

  function addSpeaking(lesson, list, ramp) {
    if (!speakEnabled() || list.length < 4) return list;
    const maxW = speakCap(ramp);
    const want = ramp && ramp.stage >= 2 ? 2 : 1;
    const out = list.slice();
    let made = 0;
    out.forEach((ex, i) => {
      if (made >= want || !ex || ex.type !== "speak_repeat" || !ex.ru || wc(ex.ru) > maxW) return;
      out[i] = Object.assign({}, ex, { type: "speak_check", _origType: "speak_repeat" });
      made++;
    });
    if (made < want) {
      const pool = lessonPool(list).filter((p) => wc(p.r) <= maxW);
      const slots = [];
      out.forEach((ex, i) => { if (i > 0 && ex && REPLACEABLE.test(ex.type) && !ex._gen && !ex._rev) slots.push(i); });
      shuffle(slots).slice(0, want - made).forEach((i, j) => {
        const p = pool[(Math.floor(Math.random() * pool.length) + j) % (pool.length || 1)];
        if (p) out[i] = { type: "speak_check", ru: p.r, he: p.h, _gen: 1 };
      });
    }
    return out;
  }

  /** Called by the engine after its own preprocessing (regular lessons only). */
  function augment(lesson, list, ramp) {
    if (!lesson || !Array.isArray(list) || !list.length) return list;
    if (/^(SRS|GRAM|TEST)$/.test(String(lesson.level || "")) || lesson._test || lesson._session) return list;
    let out = list;
    try { out = mixReview(lesson, out, ramp); } catch (e) {}
    try { out = addSpeaking(lesson, out, ramp); } catch (e) {}
    return out;
  }

  /* ——— optional sessions: «חזרה» / «הטעויות שלי» ——— */
  function currentRamp() {
    try { return RLEngine.rampOf ? RLEngine.rampOf(null) : null; } catch (e) { return null; }
  }
  function buildItemsLesson(items, opts) {
    opts = opts || {};
    const ramp = opts.ramp || currentRamp();
    const pool = mergePools(items.map((x) => ({ k: x.k, r: x.r, h: x.h })), RLSrs.itemPool(0));
    const exercises = [];
    items.forEach((it, i) => {
      const ex = buildItemExercise(it, pool, ramp, { speak: opts.speak !== false && i % 4 === 3, badge: false, kind: opts.kinds ? opts.kinds[i % opts.kinds.length] : null });
      if (ex) exercises.push(ex);
    });
    if (!exercises.length) return null;
    return {
      id: (opts.idPrefix || "srs-review-") + Date.now(),
      level: opts.level || "SRS",
      titleHe: opts.titleHe || "חזרה",
      xp: opts.xp || 12,
      exercises: exercises,
      _session: opts.session || "review",
      _rampOf: opts.rampOf,
      _test: !!opts.test,
    };
  }
  function buildSession(mode, limit) {
    if (!global.RLSrs || !RLSrs.pickForLesson) return null;
    const ramp = currentRamp();
    let items;
    if (mode === "mistakes") items = RLSrs.mistakes().slice(0, limit || 12).map((m) => Object.assign({ src: "mistake" }, m));
    else items = RLSrs.pickForLesson({ n: limit || 15, maxWords: ramp ? ramp.cap + 2 : 99 });
    if (!items.length) return null;
    return buildItemsLesson(shuffle(items), { session: mode, titleHe: mode === "mistakes" ? "הטעויות שלי" : "חזרה יומית", ramp: ramp });
  }

  /* ——— seeding v2 items from lessons completed before this version ——— */
  function seedCompleted() {
    try {
      if (!global.RLSrs || !RLSrs.seedFromLessons || !global.RLCurriculum) return 0;
      const done = Object.keys(RLProgress.get().completed || {});
      const st = RLSrs._state();
      const todo = done.filter((id) => !st.seeded[id]).map((id) => RLCurriculum.getLesson(id)).filter(Boolean);
      return todo.length ? RLSrs.seedFromLessons(todo) : 0;
    } catch (e) { return 0; }
  }

  /* ——— home card (optional extras; the core runs automatically inside lessons) ——— */
  function runSession(mode, api) {
    const lesson = buildSession(mode, mode === "mistakes" ? 12 : 15);
    if (!lesson) return;
    api.runLesson(lesson, {
      onExit: () => api.exit(),
      onComplete: ({ xp }) => {
        try { RLProgress.awardXp(xp || 10); } catch (e) {}
        const el = api.el;
        const left = RLSrs.mistakeCount();
        el.innerHTML =
          '<div class="celeb"><div class="big">' + (mode === "mistakes" ? "📌" : "🔁") + "</div><h1>" +
          (mode === "mistakes" ? "תרגול הטעויות הושלם!" : "חזרה הושלמה!") + '</h1><div class="xp-gain">+' + (xp || 10) + " XP</div>" +
          (mode === "mistakes" ? '<p class="sub">מילה יוצאת מהבנק אחרי 3 תשובות נכונות בימים שונים · נשארו ' + left + "</p>" : "") +
          '<button type="button" class="btn btn-primary" id="btn-sess-done">חזרה לבית</button></div>';
        el.querySelector("#btn-sess-done").onclick = () => api.exit();
      },
    });
  }
  function homeCardHtml() {
    if (!global.RLSrs || !RLSrs.v) return "";
    seedCompleted();
    const due = RLSrs.dueCount();
    const mk = RLSrs.mistakeCount();
    const sp = speakSupported();
    let speakOn = true;
    try { speakOn = RLProgress.get().settings.speakEx !== false; } catch (e) {}
    return (
      '<div class="card srs-card practice-card"><h2>🔁 חזרה וטעויות</h2>' +
      '<p class="sub">מילים לחזרה ומהטעויות שלך משתלבות אוטומטית בשיעורים הרגילים. כאן אפשר גם לתרגל בנפרד.</p>' +
      '<div class="srs-due">' + (due ? '<span class="due-num">' + due + "</span> ממתינים לחזרה" : "אין חזרה ממתינה כרגע") +
      " · 📌 " + mk + " בבנק הטעויות</div>" +
      '<div class="practice-row">' +
      '<button type="button" class="btn ' + (due ? "btn-primary" : "btn-ghost") + '" id="btn-prac-review"' + (due ? "" : " disabled") + ">חזרה יומית" + (due ? " (" + Math.min(due, 15) + ")" : "") + "</button>" +
      '<button type="button" class="btn btn-ghost" id="btn-prac-mistakes"' + (mk ? "" : " disabled") + ">הטעויות שלי (" + mk + ")</button></div>" +
      (sp
        ? '<div class="toggle-row" style="margin-top:12px"><span>תרגילי דיבור «אמור את זה»</span><button type="button" class="toggle' + (speakOn ? " on" : "") + '" id="tog-speak-ex" aria-label="תרגילי דיבור"></button></div>'
        : '<p class="sub" style="color:var(--muted);font-size:.8rem;margin-top:8px">תרגילי דיבור לא נתמכים בדפדפן הזה (נסה כרום).</p>') +
      "</div>"
    );
  }
  function homeCardWire(root, api) {
    const r = root.querySelector("#btn-prac-review");
    if (r) r.onclick = () => runSession("review", api);
    const m = root.querySelector("#btn-prac-mistakes");
    if (m) m.onclick = () => runSession("mistakes", api);
    const t = root.querySelector("#tog-speak-ex");
    if (t) t.onclick = function () {
      const on = !this.classList.contains("on");
      RLProgress.setSetting("speakEx", on);
      if (on) { try { localStorage.removeItem(NOSPEAK_KEY); } catch (e) {} }
      this.classList.toggle("on", on);
    };
  }

  /* ——— unit checkpoint test (automatic path step at the end of each unit) ——— */
  function unitItems(ids) {
    const out = []; const seen = {};
    ids.forEach((id) => {
      const l = RLCurriculum.getLesson(id);
      (l && l.exercises || []).forEach((ex) => {
        RLSrs.itemsFromExercise(ex).forEach((it) => { if (!seen[it.k]) { seen[it.k] = 1; out.push(it); } });
      });
    });
    return out;
  }
  function buildUnitTest(ctx, ramp) {
    const all = unitItems(ctx.unitLessonIds);
    const cap = ramp ? ramp.cap : 99;
    let items = all.filter((it) => wc(it.r) <= cap);
    if (items.length < 8) items = all.filter((it) => wc(it.r) <= cap + 2);
    if (items.length < 4) return null;
    const st = RLSrs._state();
    const weak = shuffle(items.filter((it) => st.mistakes[it.k] || (st.items[it.k] && st.items[it.k].l))).slice(0, 4);
    const wk = {}; weak.forEach((w) => { wk[w.k] = 1; });
    const picked = weak.concat(shuffle(items.filter((it) => !wk[it.k]))).slice(0, 11);
    const kinds = ramp && ramp.stage === 0 ? ["read_choice", "listen_choice", "sentence_build"] : ["read_choice", "listen_choice", "sentence_build", "he_pick"];
    const pool = mergePools(items.map((x) => ({ k: x.k, r: x.r, h: x.h })), RLSrs.itemPool(0));
    const exercises = [];
    shuffle(picked).forEach((it, i) => {
      const ex = buildItemExercise(it, pool, ramp, { speak: false, badge: false, kind: kinds[i % kinds.length] });
      if (ex) { delete ex._srsLemma; exercises.push(ex); }
    });
    if (exercises.length < 4) return null;
    const last = ctx.unitLessonIds[ctx.unitLessonIds.length - 1];
    return {
      id: "test-" + ctx.unit.id, level: "TEST", titleHe: "מבחן סוף יחידה", xp: 20,
      exercises: exercises, _test: true, _session: "test", _rampOf: last,
    };
  }
  function runCheckpoint(ctx, api, introDone) {
    injectStyle();
    const el = api.el;
    const title = ctx.unit.titleHe || "";
    if (!introDone) {
      el.innerHTML =
        '<div class="celeb"><div class="big">🏁</div><h1>מבחן סוף יחידה</h1><p>' + esc(title) + "</p>" +
        '<p class="sub" style="color:var(--muted)">כ־11 שאלות מהחומר של היחידה, בלי ניסיונות חוזרים. 80% ומעלה — עברת. זו המלצה בלבד, לא חוסם התקדמות.</p>' +
        '<button type="button" class="btn btn-primary" id="cp-start">התחל מבחן</button>' +
        '<button type="button" class="btn btn-ghost" id="cp-skip" style="margin-top:8px">דלג — לשיעור הבא</button>' +
        '<button type="button" class="btn btn-ghost" id="cp-back" style="margin-top:8px">חזרה למסלול</button></div>';
      el.querySelector("#cp-start").onclick = () => runCheckpoint(ctx, api, true);
      el.querySelector("#cp-skip").onclick = () => api.skip();
      el.querySelector("#cp-back").onclick = () => api.exit();
      return;
    }
    const lesson = buildUnitTest(ctx, api.ramp);
    if (!lesson) { api.finish({}); return; }
    const results = [];
    api.runLesson(lesson, {
      onResult: (ex, ok) => { if (ex && ex._srsKey && !results.some((r) => r.k === ex._srsKey)) results.push({ k: ex._srsKey, ok: !!ok, r: ex.ru, h: ex.he || ((ex.choices || []).find((c) => c.correct) || {}).he }); },
      onExit: () => api.exit(),
      onComplete: () => showCheckpointResult(ctx, api, lesson, results),
    });
  }
  function showCheckpointResult(ctx, api, lesson, results) {
    const el = api.el;
    const total = results.length || 1;
    const good = results.filter((r) => r.ok).length;
    const score = Math.round((good / total) * 100);
    const pass = score >= 80;
    const weak = results.filter((r) => !r.ok);
    const st = RLSrs._state();
    weak.forEach((w) => { const x = st.items[w.k]; RLSrs.addMistake({ k: w.k, r: w.r || (x && x.r), h: w.h || (x && x.h) }, "test", { ensureOnly: true }); });
    try { RLSrs.flush && RLSrs.flush(); } catch (e) {}
    el.innerHTML =
      '<div class="celeb cp-result"><div class="big">' + (pass ? "🏆" : "💪") + "</div><h1>" +
      (pass ? "עברת את המבחן!" : "כמעט שם") + '</h1><div class="cp-score">' + score + "%</div>" +
      '<p class="sub">' + good + " מתוך " + total + " נכונות</p>" +
      (pass
        ? '<p>כל הכבוד — אפשר להמשיך ליחידה הבאה בביטחון.</p>'
        : '<p>כדאי לחזק את המילים האלה לפני שממשיכים (לא חובה). הן נוספו לבנק הטעויות ויופיעו בשיעורים הבאים:</p>') +
      (weak.length
        ? '<ul class="cp-weak">' + weak.map((w) => '<li><span class="ru" dir="auto">' + esc(w.r) + "</span> — " + esc(w.h || "") + "</li>").join("") + "</ul>"
        : "") +
      (weak.length ? '<button type="button" class="btn ' + (pass ? "btn-ghost" : "btn-primary") + '" id="cp-weak">חזק את המילים החלשות (' + weak.length + ")</button>" : "") +
      '<button type="button" class="btn ' + (pass || !weak.length ? "btn-primary" : "btn-ghost") + '" id="cp-next" style="margin-top:8px">המשך במסלול ←</button>' +
      '<button type="button" class="btn btn-ghost" id="cp-retry" style="margin-top:8px">נסה שוב את המבחן</button></div>';
    const xp = pass ? 20 : 10;
    const b = el.querySelector("#cp-weak");
    if (b) b.onclick = () => {
      const items = weak.map((w) => { const x = st.items[w.k]; return { k: w.k, r: w.r || (x && x.r), h: w.h || (x && x.h), src: "mistake" }; }).filter((x) => x.r && x.h);
      const items2 = items.concat(shuffle(items)).slice(0, Math.max(4, Math.min(10, items.length * 2)));
      const les = buildItemsLesson(items2, { session: "test-review", titleHe: "חיזוק מילים חלשות", ramp: api.ramp, rampOf: lesson._rampOf, speak: false });
      if (!les) return api.finish({ score: score, xp: xp });
      api.runLesson(les, { onExit: () => (api.done ? api.done({ score: score, xp: xp }) : api.finish({ score: score, xp: xp })), onComplete: () => api.finish({ score: score, xp: xp + 5 }) });
    };
    el.querySelector("#cp-next").onclick = () => api.finish({ score: score, xp: xp });
    el.querySelector("#cp-retry").onclick = () => runCheckpoint(ctx, api, true);
  }

  function registerHooks() {
    if (!global.RLPath) return;
    RLPath.registerProvider("checkpoint", function (ctx) {
      if (!ctx.unitLessonIds || ctx.unitLessonIds.length < 2) return [];
      return [{
        id: "cp-" + ctx.unit.id,
        afterLessonId: ctx.unitLessonIds[ctx.unitLessonIds.length - 1],
        order: 10, kind: "checkpoint", icon: "🏁", titleHe: "מבחן סוף יחידה",
        start: function (api) { runCheckpoint(ctx, api, false); },
      }];
    });
    RLPath.registerHomeCard({ id: "practice", order: 10, html: homeCardHtml, wire: homeCardWire });
  }
  try { injectStyle(); } catch (e) {}
  registerHooks();

  global.RLPractice = {
    augment, renderSpeakCheck, buildSession, buildItemsLesson, buildUnitTest, buildItemExercise,
    matchSpeech, fuzzNorm, speakSupported, speakEnabled, pauseSpeaking, seedCompleted, recognize,
  };
})(window);
