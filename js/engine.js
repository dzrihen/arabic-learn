/* Lesson exercise engine — all exercise types */
(function (global) {
  "use strict";

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  const TARGET_DIR = "rtl";

  function markTarget(node) {
    node.classList.add("target-text");
    node.setAttribute("dir", TARGET_DIR);
    node.style.unicodeBidi = "isolate";
    return node;
  }

  function targetText(text) {
    const node = document.createElement("span");
    node.textContent = text == null ? "" : String(text);
    return markTarget(node);
  }

  function mixedText(...parts) {
    const fragment = document.createDocumentFragment();
    parts.forEach((part) => {
      if (part && part.nodeType) fragment.appendChild(part);
      else if (part != null) fragment.appendChild(document.createTextNode(String(part)));
    });
    return fragment;
  }

  // --- Hebrew transliteration for whole sentences (curated map + letter fallback) ---
  function sentenceHeTranslit(text) {
    return String(text || "").replace(/؟/g, "?").replace(/،/g, ",").split(/\s+/).map(function (tok) {
      const core = tok.replace(/^[«»"'()\[\].,!?؛:…\-]+|[«»"'()\[\].,!?؛:…\-]+$/g, "");
      if (!core) return tok.replace(/[^?!,]/g, "");
      const tail = (tok.slice(tok.lastIndexOf(core) + core.length).match(/[?!,]/) || [""])[0];
      return (lookupHeTranslit(core) || faLettersToHe(core)) + tail;
    }).filter(Boolean).join(" ");
  }

  // --- Transliteration fading (auto / always / never) ---
  // auto: A1 + A2 units 1-59 = full; A2 unit 60+ and B1 = only words seen < TL_KNOWN_N times
  // (tap "•••" to reveal); B2/C1/C2 = hidden, tap "👁 תעתיק" to reveal.
  const TL_SEEN_KEY = "rl_tl_seen_v1";
  const TL_KNOWN_N = 5;
  const TL_A2_LATE_UNIT = 60;
  let tlPolicy = "full";
  function tlMode() {
    const s = (RLProgress.get() && RLProgress.get().settings) || {};
    if (s.translitMode === "always" || s.translitMode === "never" || s.translitMode === "auto") return s.translitMode;
    return s.translit === false ? "never" : "auto";
  }
  function showTranslit() {
    return tlMode() !== "never";
  }
  function policyForLesson(lesson) {
    const id = String((lesson && lesson.id) || "").toLowerCase();
    const m = id.match(/^(a1|a2|b1|b2|c1|c2)-u(\d+)/);
    let lv = m ? m[1].toUpperCase() : String((lesson && lesson.level) || "").toUpperCase();
    if (!/^(A1|A2|B1|B2|C1|C2)$/.test(lv)) {
      try { lv = String(RLProgress.get().level || "A1").toUpperCase(); } catch (e) { lv = "A1"; }
    }
    const unit = m ? parseInt(m[2], 10) : 0;
    if (lv === "A1") return "full";
    if (lv === "A2") return m && unit < TL_A2_LATE_UNIT ? "full" : "new";
    if (lv === "B1") return "new";
    return "tap";
  }
  function tlNorm(w) {
    return String(w || "").toLowerCase().replace(/\u200c/g, "").replace(/[^\p{L}\p{M}]/gu, "");
  }
  function tlSeen() {
    try { return JSON.parse(localStorage.getItem(TL_SEEN_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function tlBump(words) {
    try {
      const s = tlSeen();
      (words || []).forEach((w) => { const k = tlNorm(w); if (k) s[k] = (s[k] || 0) + 1; });
      localStorage.setItem(TL_SEEN_KEY, JSON.stringify(s));
    } catch (e) {}
  }
  function tlWordShown(word) {
    const mode = tlMode();
    if (mode === "always") return true;
    if (mode === "never") return false;
    if (tlPolicy === "full") return true;
    if (tlPolicy === "tap") return false;
    return (tlSeen()[tlNorm(word)] || 0) < TL_KNOWN_N;
  }
  function translitLine(t) {
    if (!t || !showTranslit()) return null;
    const d = el("div", "translit", t);
    if (tlMode() === "auto" && tlPolicy !== "full") {
      const real = d.textContent;
      d.textContent = "👁 תעתיק";
      d.classList.add("tl-tap");
      d.onclick = () => { d.textContent = real; d.classList.remove("tl-tap"); };
    }
    return d;
  }
  /** Per-word Hebrew transliteration line for a target sentence, with fading. */
  function sentenceTlEl(text, cls) {
    if (!text || !showTranslit() || typeof sentenceHeTranslit !== "function") return null;
    const box = el("div", "he-tl-line" + (cls ? " " + cls : ""));
    box.setAttribute("dir", "rtl");
    box.setAttribute("lang", "he");
    const toks = String(text).split(/\s+/).filter(Boolean);
    const parts = toks.map((w) => ({ w: w, tl: sentenceHeTranslit(w) })).filter((p) => p.tl);
    if (!parts.length) return null;
    if (tlMode() === "auto" && tlPolicy === "tap") {
      const btn = el("button", "tl-reveal-btn", "👁 תעתיק");
      btn.type = "button";
      btn.onclick = (ev) => { ev.stopPropagation(); box.textContent = parts.map((p) => p.tl).join(" "); };
      box.appendChild(btn);
      return box;
    }
    parts.forEach((p, i) => {
      const s = el("span", "tl-w");
      if (tlWordShown(p.w)) s.textContent = p.tl;
      else {
        s.textContent = "•••";
        s.classList.add("tl-hidden");
        s.onclick = (ev) => { ev.stopPropagation(); s.textContent = p.tl; s.classList.remove("tl-hidden"); };
      }
      box.appendChild(s);
      if (i < parts.length - 1) box.appendChild(document.createTextNode(" "));
    });
    return box;
  }

  /** Persian/Arabic-script word → approximate Hebrew-letter transliteration (consonants). */
  function faLettersToHe(word) {
    const s = String(word || "").normalize("NFC");
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\u200c" || ch === "\u200b" || ch === "\u200d" || ch === "\ufeff" || ch === "\u0640") continue;
      if (ch === " " || ch === "\u00a0") {
        out.push(" ");
        continue;
      }
      if (/[0-9۰-۹٠-٩.,!?;:()\-\/]/.test(ch)) {
        out.push(ch);
        continue;
      }
      const map = {
        "ا": "א", "آ": "א׳", "أ": "א", "إ": "א", "ٱ": "א", "ء": "",
        "ب": "ב", "پ": "פ", "ت": "ת", "ط": "ט",
        "ث": "ס", "س": "ס", "ص": "ס",
        "ج": "ג׳", "چ": "צ׳",
        "ح": "ח", "ه": "ה", "ة": "ה", "ۀ": "ה", "ھ": "ה",
        "خ": "ח",
        "د": "ד", "ذ": "ז", "ز": "ז", "ض": "ז", "ظ": "ז",
        "ر": "ר", "ژ": "ז׳",
        "ش": "ש",
        "ع": "ע", "غ": "ג", "ق": "ק",
        "ف": "פ", "ک": "כ", "ك": "כ", "گ": "ג",
        "ل": "ל", "م": "מ", "ن": "נ",
        "و": "ו", "ؤ": "ו",
        "ی": "י", "ي": "י", "ى": "י", "ئ": "י",
        "ً": "", "ٌ": "", "ٍ": "", "َ": "", "ُ": "", "ِ": "", "ّ": "", "ْ": "", "ٰ": "", "ٓ": "", "ٔ": "", "ٕ": "",
      };
      if (Object.prototype.hasOwnProperty.call(map, ch)) out.push(map[ch]);
      else if (!/[\u0600-\u06FF]/.test(ch)) out.push(ch);
    }
    let he = out.join("");
    he = he.replace(/כ(?=$|[\s.,!?;:])/g, "ך")
           .replace(/מ(?=$|[\s.,!?;:])/g, "ם")
           .replace(/נ(?=$|[\s.,!?;:])/g, "ן")
           .replace(/פ(?=$|[\s.,!?;:])/g, "ף")
           .replace(/צ(?=$|[\s.,!?;:])/g, "ץ")
           .replace(/ץ׳/g, "צ׳");
    return he;
  }

  /** Latin translit token → Hebrew with approximate vowels. */
  function latinToHe(tok) {
    const s = String(tok || "").trim().toLowerCase().replace(/ʿ|ʻ|ʼ/g, "'");
    if (!s) return "";
    const parts = [];
    let i = 0;
    while (i < s.length) {
      const two = s.slice(i, i + 2);
      if (two === "kh") { parts.push("ח"); i += 2; continue; }
      if (two === "sh") { parts.push("ש"); i += 2; continue; }
      if (two === "ch") { parts.push("צ׳"); i += 2; continue; }
      if (two === "zh") { parts.push("ז׳"); i += 2; continue; }
      if (two === "gh") { parts.push("ג"); i += 2; continue; }
      const ch = s[i];
      const one = {
        "ā": "א", "â": "א", "á": "א", "a": "ַ",
        "e": "ֶ", "é": "ֶ",
        "i": "י", "ī": "י", "í": "י",
        "o": "ו", "ō": "ו", "u": "ו", "ū": "ו", "ú": "ו",
        "b": "ב", "p": "פ", "t": "ת", "d": "ד", "r": "ר", "z": "ז", "s": "ס",
        "f": "פ", "q": "ק", "k": "כ", "g": "ג", "l": "ל", "m": "מ", "n": "נ",
        "h": "ה", "v": "ו", "w": "ו", "y": "י", "j": "י", "'": "ע",
        "-": "־", " ": " ",
      };
      if (Object.prototype.hasOwnProperty.call(one, ch)) {
        let piece = one[ch];
        // Carrier alef for leading short a/e (or after maqaf/space)
        if ((ch === "a" || ch === "e") && (parts.length === 0 || /[\s־]$/.test(parts[parts.length - 1] || ""))) {
          piece = (ch === "a" ? "אַ" : "אֶ");
        }
        parts.push(piece);
      } else if (/[0-9]/.test(ch)) parts.push(ch);
      i++;
    }
    let he = parts.join("");
    he = he.replace(/כ(?=$|[\s.,!?;:־])/g, "ך")
           .replace(/מ(?=$|[\s.,!?;:־])/g, "ם")
           .replace(/נ(?=$|[\s.,!?;:־])/g, "ן")
           .replace(/פ(?=$|[\s.,!?;:־])/g, "ף")
           .replace(/צ(?=$|[\s.,!?;:־])/g, "ץ")
           .replace(/ץ׳/g, "צ׳");
    return he;
  }


  /** Lookup curated Hebrew translit; try ZWNJ/space variants. */
  function lookupHeTranslit(word) {
    const map = global.RL_HE_TRANSLIT;
    if (!map || word == null) return null;
    const w = String(word);
    if (map[w]) return map[w];
    const noZ = w.replace(/\u200c/g, "");
    if (map[noZ]) return map[noZ];
    const sp = w.replace(/\u200c/g, " ");
    if (map[sp]) return map[sp];
    // ye/ke normalize
    const norm = noZ.replace(/\u064a/g, "\u06cc").replace(/\u0643/g, "\u06a9");
    if (map[norm]) return map[norm];
    return null;
  }

  function wordHeTranslits(ex, words) {
    const w = words || [];
    if (!w.length) return [];
    if (Array.isArray(ex.heTranslit) && ex.heTranslit.length === w.length) return ex.heTranslit.slice();
    if (Array.isArray(ex.wordsHeTranslit) && ex.wordsHeTranslit.length === w.length) {
      return ex.wordsHeTranslit.slice();
    }
    const latin = ex && ex.translit ? String(ex.translit).trim() : "";
    let latinHe = null;
    if (latin) {
      const clean = latin.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.,!?;:]+$/g, ""));
      if (clean.length === w.length) latinHe = clean.map(latinToHe);
    }
    return w.map(function (word, i) {
      const hit = lookupHeTranslit(word);
      if (hit) return hit;
      if (latinHe) return latinHe[i];
      return faLettersToHe(word);
    });
  }

  function makeChipEl(word, heTl, extraClass) {
    const c = markTarget(el("button", "chip" + (extraClass ? " " + extraClass : "")));
    c.type = "button";
    const faSpan = el("span", "chip-fa");
    faSpan.textContent = word == null ? "" : String(word);
    c.appendChild(faSpan);
    if (heTl && showTranslit()) {
      const he = el("span", "chip-he-tl");
      if (tlWordShown(word)) he.textContent = heTl;
      else {
        he.textContent = "•••";
        he.classList.add("tl-hidden");
        const reveal = (ev) => { if (ev) ev.preventDefault(); he.textContent = heTl; he.classList.remove("tl-hidden"); };
        c.addEventListener("contextmenu", reveal);
        let lp = null;
        c.addEventListener("touchstart", () => { lp = setTimeout(reveal, 450); }, { passive: true });
        c.addEventListener("touchend", () => clearTimeout(lp));
        c.addEventListener("touchmove", () => clearTimeout(lp));
      }
      he.setAttribute("dir", "rtl");
      he.setAttribute("lang", "he");
      c.appendChild(he);
    }
    return c;
  }

  /**
   * Run a lesson. container is the mount point.
   * callbacks: { onProgress(i,total), onComplete({xp,perfect,mistakes}), onExit() }
   */

  /** Convert one listening-primary exercise to a non-listening equivalent (shallow copy). */
  function alternateForListening(ex) {
    const copy = Object.assign({}, ex);
    if (copy.type === "listen_order") {
      copy.type = "sentence_build";
      copy.words =
        copy.words ||
        (copy.ru ? String(copy.ru).split(/\s+/).filter(Boolean) : []);
      copy.promptHe = copy.he || "בנה את המשפט";
    } else if (copy.type === "listen_choice") {
      copy.type = "read_choice";
    } else if (copy.type === "speak_repeat") {
      copy.type = "translate_he_ru";
      copy.words =
        copy.words ||
        (copy.ru ? String(copy.ru).split(/\s+/).filter(Boolean) : []);
      if (!copy.he) copy.he = "תרגם לעברית → שפת היעד";
    }
    return copy;
  }

  // ---- Coherent dialogue bank (data/dialogues.js → window.RL_DIALOGUES) ----
  const DLG_LV = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const DLG_THEMES = {
    cafe: /קפה|מסעד|אוכל|ארוח|הזמנ|מטבח|מאכל|שתי/, shop: /קני|חנות|שוק|מחיר|בגד|כסף|קנייה/,
    family: /משפח|הורים|ילדים|יום הולדת/, directions: /כיוונ|עיר|תחבור|דרך|מקום|רחוב/,
    time: /שעה|זמן|שעון|ימי|תאריך/, phone: /טלפון|שיחת/, weather: /מזג|אוויר|עונ/,
    travel: /נסיע|טיול|מלון|תייר|חופש|טיס|רכב/, study: /לימוד|ספר לימוד|בית ספר|אוניבר|מבחנ|שפה/,
    work: /עבוד|מקצוע|משרד|קריירה|עסק/, health: /בריא|רופא|גוף|מחל|רפוא/,
    apartment: /דיר|שכנ|דיור/, home: /בית|אורח|שגרה/, errands: /בנק|דואר|סידור|שירות/,
    society: /חברה|חדשות|פוליטי|דיון|דעה|טכנולוג|סביב/, culture: /תרבות|ספרות|אמנות|מוזיק|קולנוע|זיכרו/,
    meet: /היכר|ברכ|חבר|בילוי|פנאי|שלום|נימוס/
  };
  function dlgHash(s) { let h = 5381; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0; return h; }
  function dlgBankAll() { return Array.isArray(global.RL_DIALOGUES) ? global.RL_DIALOGUES : []; }
  function dlgLevelOf(lesson) {
    const m = String((lesson && lesson.id) || "").match(/^(a1|a2|b1|b2|c1|c2)/i);
    const lv = (m ? m[1] : String((lesson && lesson.level) || "A1")).toUpperCase();
    return DLG_LV.indexOf(lv) >= 0 ? lv : "A1";
  }
  function dlgPool(lv) {
    const b = dlgBankAll(); let i = DLG_LV.indexOf(lv); if (i < 0) i = 0;
    for (let d = 0; d < 6; d++) {
      const out = b.filter((x) => { const j = DLG_LV.indexOf(x.lv); return Math.abs(j - i) <= d; });
      if (out.length >= 6) return out;
    }
    return b.slice();
  }
  function dlgThemeOf(lesson) {
    const t = String((lesson && lesson.titleHe) || "");
    for (const k in DLG_THEMES) if (DLG_THEMES[k].test(t)) return k;
    return "";
  }
  // Courtesy lines that occur in 2+ scenarios ("Thanks a lot!") could fit anywhere → never used as wrong options
  let dlgSharedCache = null;
  function dlgSharedLines() {
    if (dlgSharedCache) return dlgSharedCache;
    const seen = {}, shared = {};
    dlgBankAll().forEach((d) => d.turns.forEach((t) => { if (seen[t.ru] && seen[t.ru] !== d.id) shared[t.ru] = 1; seen[t.ru] = d.id; }));
    return (dlgSharedCache = shared);
  }
  // Plausible-but-wrong lines: same level, same speaker role, different scenario, similar length.
  function dlgDistractors(d, i, pool, n) {
    const own = {}; d.turns.forEach((t) => { own[t.ru] = 1; });
    const want = String(d.turns[i].ru).length;
    const cands = [];
    const shared = dlgSharedLines();
    pool.forEach((o) => {
      if (o.id === d.id || o.theme === d.theme) return;
      o.turns.forEach((t, j) => { if (j % 2 === i % 2 && !own[t.ru] && !shared[t.ru] && cands.indexOf(t.ru) < 0) cands.push(t.ru); });
    });
    const capOk = cands.filter((c) => rampWords(c) <= ramp.cap);
    const covOk = capOk.filter((c) => rampCoverage(c) >= Math.max(0, ramp.minCov - 0.15));
    const use = covOk.length >= n ? covOk : capOk.length >= n ? capOk : cands;
    use.sort((a, b) => Math.abs(a.length - want) - Math.abs(b.length - want));
    return shuffle(use.slice(0, 12)).slice(0, n);
  }
  function dlgExercise(d, pool) {
    return {
      type: "dialogue", _bank: d.id, _lv: d.lv, _theme: d.theme,
      turns: d.turns.map((t, i) => ({ speaker: i % 2 ? "user" : "npc", ru: t.ru, he: t.he, distractors: i % 2 ? dlgDistractors(d, i, pool, 3) : [] })),
      distractors: []
    };
  }
  function applyDialogueBank(lesson, list) {
    if (!dlgBankAll().length) return list;
    if (ramp.dlg === "none") return list; // early stages: rampGate swaps dialogues for easy drills
    const lv = dlgLevelOf(lesson), pool = rampBankPool(lv);
    const exact = pool.filter((x) => x.lv === lv);
    let base = (exact.length ? exact : pool).map(rampFitDialogue).filter(Boolean);
    const roomy = base.filter((d) => d.turns.length >= Math.min(ramp.dlgTurns, 4));
    if (roomy.length >= 3) base = roomy;
    if (rampKnownSet && base.length) {
      const scored = base.map((d) => ({ d: d, c: rampCoverage(d.turns.map((t) => t.ru).join(" ")) }));
      const good = scored.filter((x) => x.c >= ramp.minCov);
      base = (good.length >= 3 ? good : scored.sort((a, b) => b.c - a.c).slice(0, 8)).map((x) => x.d);
    }
    if (!base.length) return list;
    const th = dlgThemeOf(lesson);
    const themed = th ? base.filter((x) => x.theme === th) : [];
    const order = themed.concat(base.filter((x) => themed.indexOf(x) < 0));
    const h = dlgHash((lesson && lesson.id) || "");
    let k = 0;
    return list.map((ex) => {
      if (!ex || ex.type !== "dialogue") return ex;
      let d;
      if (k < themed.length) d = themed[(h + k) % themed.length];
      else d = order[(h + k) % order.length];
      k++;
      return dlgExercise(d, pool);
    });
  }
  function dlgReplyPick(lesson) {
    const pool = rampBankPool(dlgLevelOf(lesson)); if (!pool.length) return null;
    const pairs = [];
    pool.forEach((d) => d.turns.forEach((t, qi) => {
      if (qi >= d.turns.length - 1 || qi >= ramp.dlgTurns) return;
      const a = d.turns[qi + 1];
      if (rampWords(t.ru) > ramp.cap || rampWords(a.ru) > ramp.cap) return;
      pairs.push({ d: d, qi: qi, c: Math.min(rampCoverage(t.ru), rampCoverage(a.ru)) });
    }));
    if (!pairs.length) return null;
    // early stages: a real question → answer reads most naturally
    const isQ = (p) => /[;?؟]\s*$/.test(p.d.turns[p.qi].ru);
    const qs = ramp.stage <= 3 ? pairs.filter(isQ) : [];
    const base = qs.length >= 6 ? qs : pairs;
    const good = base.filter((p) => p.c >= ramp.minCov);
    const cand = good.length >= 3 ? good : base.sort((a, b) => b.c - a.c).slice(0, 10);
    const pk = cand[Math.floor(Math.random() * cand.length)];
    const d = pk.d, qi = pk.qi;
    const q = d.turns[qi], a = d.turns[qi + 1];
    const wrong = dlgDistractors(d, qi + 1, pool, 3);
    if (wrong.length < 2) return null;
    return { type: "reply_pick", ru: q.ru, he: q.he || "", answer: a.ru, answerHe: a.he || "", options: shuffle([a.ru].concat(wrong)), _bank: d.id, _pair: qi, _gen: 1 };
  }


  // ---- Gradual difficulty ramp (v31) — see /workspace/_fix/gradual_ramp.md ----
  // Stage is chosen by the lesson's position inside its level (unit ids are not sequential).
  const RAMP_ALL_NEW = ["true_false", "he_pick", "missing_word", "reply_pick"];
  const RAMP_TABLE = [
    { stage: 0, lv: "A1", upto: 40, cap: 4, listenCap: 4, newTypes: [], maxNew: 0, dlg: "none", dlgTurns: 0, minCov: 1 },
    { stage: 1, lv: "A1", upto: 100, cap: 5, listenCap: 5, newTypes: ["he_pick", "true_false"], maxNew: 1, dlg: "none", dlgTurns: 0, minCov: 1 },
    { stage: 2, lv: "A1", upto: 200, cap: 5, listenCap: 5, newTypes: ["he_pick", "true_false", "missing_word", "reply_pick"], maxNew: 2, dlg: "short", dlgTurns: 4, minCov: 0.6 },
    { stage: 3, lv: "A1", upto: 1e9, cap: 7, listenCap: 6, newTypes: RAMP_ALL_NEW, maxNew: 3, dlg: "full", dlgTurns: 99, minCov: 0.5 },
    { stage: 4, lv: "A2", upto: 1e9, cap: 10, listenCap: 8, newTypes: RAMP_ALL_NEW, maxNew: 4, dlg: "full", dlgTurns: 99, minCov: 0 },
    { stage: 5, lv: "*", upto: 1e9, cap: 1e9, listenCap: 1e9, newTypes: RAMP_ALL_NEW, maxNew: 4, dlg: "full", dlgTurns: 99, minCov: 0 }
  ];
  let ramp = RAMP_TABLE[5];
  let rampKnownSet = null;
  let rampLvIdx = 5;
  let curLesson = null;
  function rampWords(s) { return String(s || "").split(/\s+/).filter((w) => /\p{L}/u.test(w)).length; }
  function rampNorm(w) {
    return String(w || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ς/g, "σ").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[\u064A\u0649]/g, "\u06CC").replace(/\u0643/g, "\u06A9").replace(/[\u0622\u0623\u0625]/g, "\u0627").replace(/[^\p{L}]/gu, "");
  }
  function rampPosition(lesson) {
    const C = global.RLCurriculum;
    const id = String((lesson && lesson.id) || "");
    const m = id.match(/^(a1|a2|b1|b2|c1|c2)-/i);
    if (m && C && C.lessonIdsForLevel) {
      const lv = m[1].toUpperCase();
      const ids = C.lessonIdsForLevel(lv) || [];
      const i = ids.indexOf(id);
      if (i >= 0) return { lv: lv, ord: i + 1, ids: ids };
      return { lv: lv, ord: 1e9, ids: [] };
    }
    // review / grammar lessons: use the learner's real position
    let lv = "A1", ord = 1, ids = [];
    try { lv = String(RLProgress.get().currentLevel || "A1").toUpperCase(); } catch (e) {}
    try { ids = C.lessonIdsForLevel(lv) || []; ord = Math.max(1, C.completedCountForLevel(lv) || 1); } catch (e) {}
    return { lv: lv, ord: ord, ids: ids };
  }
  function rampFor(pos) {
    if (pos.lv === "A1") return RAMP_TABLE.find((r) => r.lv === "A1" && pos.ord <= r.upto) || RAMP_TABLE[3];
    if (pos.lv === "A2") return RAMP_TABLE[4];
    return RAMP_TABLE[5];
  }
  function rampAddKnown(set, txt) {
    String(txt || "").split(/\s+/).forEach((w) => {
      const n = rampNorm(w);
      if (!n) return;
      set[n] = 1;
      if (n.length >= 4) set["~" + n.slice(0, 4)] = 1;
    });
  }
  // Words the learner has met: every target-language string in this level up to (and incl.) this lesson.
  function rampBuildKnown(pos) {
    if (ramp.stage > 3) return null;
    const C = global.RLCurriculum, set = {};
    (pos.ids || []).slice(0, pos.ord).forEach((id) => {
      const l = C && C.getLesson ? C.getLesson(id) : null;
      if (!l) return;
      (l.exercises || []).forEach((ex) => {
        if (!ex) return;
        [ex.ru, ex.sentence, ex.answer, ex.example, ex.letter].forEach((t) => rampAddKnown(set, t));
        (ex.words || []).forEach((t) => rampAddKnown(set, t));
        (ex.pairs || []).forEach((p) => p && rampAddKnown(set, p.ru));
        (ex.turns || []).forEach((p) => p && rampAddKnown(set, p.ru));
        (ex.options || []).forEach((p) => p && rampAddKnown(set, typeof p === "string" ? p : p.ru));
        (ex.letters || []).forEach((p) => p && rampAddKnown(set, p.example));
      });
    });
    return Object.keys(set).length ? set : null;
  }
  function rampCoverage(text) {
    if (!rampKnownSet) return 1;
    const toks = String(text || "").split(/\s+/).map(rampNorm).filter(Boolean);
    if (!toks.length) return 1;
    let k = 0;
    toks.forEach((n) => { if (rampKnownSet[n] || (n.length >= 4 && rampKnownSet["~" + n.slice(0, 4)])) k++; });
    return k / toks.length;
  }
  function rampLineOk(s, cov) { return rampWords(s) <= ramp.cap && rampCoverage(s) >= cov; }
  function rampSetup(lesson) {
    curLesson = lesson;
    let pos = { lv: "A1", ord: 1e9, ids: [] };
    try { pos = rampPosition(lesson); } catch (e) {}
    ramp = rampFor(pos);
    rampLvIdx = Math.max(0, DLG_LV.indexOf(pos.lv));
    if (rampLvIdx < 0) rampLvIdx = 0;
    try { rampKnownSet = rampBuildKnown(pos); } catch (e) { rampKnownSet = null; }
    return { pos: pos, ramp: ramp };
  }
  // Same level or easier only.
  function rampBankPool(lv) {
    const pool = dlgPool(lv);
    const cap = Math.max(rampLvIdx, DLG_LV.indexOf(lv));
    const easy = pool.filter((x) => DLG_LV.indexOf(x.lv) <= cap);
    return easy.length >= 6 ? easy : pool;
  }
  // Trim a bank dialogue to the stage's limits; null if it can't fit.
  function rampFitDialogue(d) {
    let turns = d.turns.slice(0, ramp.dlgTurns);
    let cut = turns.findIndex((t) => rampWords(t.ru) > ramp.cap);
    if (cut >= 0) turns = turns.slice(0, cut);
    if (turns.length % 2) turns = turns.slice(0, turns.length - 1);
    if (turns.length < 2) return null;
    return Object.assign({}, d, { turns: turns });
  }

  // ——— New exercise types (generated from the lesson's own sentences) ———
  // true_false · reply_pick · missing_word · he_pick — mixed in by replacing a few
  // existing items so lessons don't get longer. Which kinds / how many depends on the ramp stage.
  function lessonSentencePool(list) {
    const out = [];
    const seen = {};
    const add = (ru, he) => {
      ru = String(ru || "").trim();
      he = String(he || "").trim();
      if (!ru || !he || seen[ru]) return;
      seen[ru] = 1;
      out.push({ ru: ru, he: he });
    };
    (list || []).forEach((ex) => {
      if (!ex) return;
      if (ex.ru && ex.he) add(ex.ru, ex.he);
      if (ex.ru && Array.isArray(ex.choices)) {
        const c = ex.choices.find((x) => x && x.correct);
        if (c && c.he) add(ex.ru, c.he);
      }
      (ex.pairs || []).forEach((p) => p && add(p.ru, p.he));
      (ex.turns || []).forEach((t) => t && add(t.ru, t.he));
    });
    return out;
  }

  function mixNewTypes(list) {
    if (!ramp.maxNew || !ramp.newTypes.length) return list;
    const pool = lessonSentencePool(list).filter((p) => rampWords(p.ru) <= ramp.cap);
    if (pool.length < 4 || list.length < 6) return list;
    const replaceable = [];
    list.forEach((ex, i) => {
      if (i === 0 || !ex) return;
      if (/^(read_choice|listen_choice|translate_he_ru|sentence_build|match_pairs)$/.test(ex.type)) replaceable.push(i);
    });
    // ~1 in 4 exercises, capped per stage
    const n = Math.min(ramp.maxNew, Math.max(1, Math.round(list.length / 4)), replaceable.length);
    const picks = shuffle(replaceable.slice()).slice(0, n).sort((a, b) => a - b);
    const dialogs = list.filter((e) => e && e.type === "dialogue" && Array.isArray(e.turns) && e.turns.length >= 2);
    const kinds = shuffle(ramp.newTypes.slice());
    const out = list.slice();
    picks.forEach((i, k) => {
      let kind = kinds[k % kinds.length];
      if (kind === "reply_pick" && !dlgBankAll().length) kind = "he_pick";
      const made = buildNewType(kind, pool, dialogs);
      if (made) out[i] = made;
    });
    return out;
  }

  function otherItems(pool, notRu, count) {
    return shuffle(pool.filter((p) => p.ru !== notRu)).slice(0, count);
  }

  function buildNewType(kind, pool, dialogs) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) return null;
    if (kind === "true_false") {
      const truth = Math.random() < 0.5;
      const wrong = otherItems(pool, pick.ru, 1)[0];
      if (!truth && !wrong) return null;
      return { type: "true_false", ru: pick.ru, he: truth ? pick.he : wrong.he, correctHe: pick.he, truth: truth, _gen: 1 };
    }
    if (kind === "he_pick") {
      const others = otherItems(pool, pick.ru, 3);
      if (others.length < 2) return null;
      return { type: "he_pick", ru: pick.ru, he: pick.he, options: shuffle([pick.ru].concat(others.map((o) => o.ru))), _gen: 1 };
    }
    if (kind === "missing_word") {
      const cands = pool.filter((p) => p.ru.split(/\s+/).length >= 3);
      const s = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
      if (!s) return null;
      const toks = s.ru.split(/\s+/);
      const core = (w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
      const idxs = toks.map((w, i) => i).filter((i) => core(toks[i]).length >= 2);
      if (!idxs.length) return null;
      const gi = idxs[Math.floor(Math.random() * idxs.length)];
      const answer = core(toks[gi]);
      const bag = {};
      pool.forEach((p) => p.ru.split(/\s+/).forEach((w) => { const c = core(w); if (c.length >= 2 && c.toLowerCase() !== answer.toLowerCase()) bag[c] = 1; }));
      const distract = shuffle(Object.keys(bag)).slice(0, 3);
      if (distract.length < 2) return null;
      return { type: "missing_word", ru: s.ru, he: s.he, tokens: toks, gap: gi, answer: answer, options: shuffle([answer].concat(distract)), _gen: 1 };
    }
    if (kind === "reply_pick") return dlgReplyPick(curLesson);
    return null;
  }

  // Easy stand-ins (match pairs / read-and-pick-meaning) built from the lesson's short sentences.
  function rampFiller(short, k) {
    if (!short || short.length < 3) return null;
    if (k % 2 === 0) {
      const seenHe = {};
      const ps = shuffle(short.slice()).filter((p) => (seenHe[p.he] ? false : (seenHe[p.he] = 1))).slice(0, 4);
      if (ps.length >= 3) return { type: "match_pairs", pairs: ps, _gen: 1, _ramp: 1 };
    }
    const p = short[Math.floor(Math.random() * short.length)];
    const others = shuffle(short.filter((o) => o.he !== p.he)).slice(0, 3);
    if (others.length < 2) return null;
    return { type: "read_choice", ru: p.ru, choices: [{ he: p.he, correct: true }].concat(others.map((o) => ({ he: o.he, correct: false }))), _gen: 1, _ramp: 1 };
  }

  // Early stages: no stitched dialogues, no long sentences, listen-and-build only for very short ones.
  function rampGate(list) {
    if (ramp.stage > 3) return list;
    // A few early lessons are built only from longer sentences: relax the cap one word at a time
    // (never above 8) instead of giving up, so dialogues/new types still stay out.
    for (let cap = ramp.cap; cap <= Math.max(ramp.cap, 8); cap++) {
      const out = rampGateCap(list, cap);
      if (out.length >= Math.min(6, list.length) && out._kept >= Math.ceil(list.length / 2)) return out;
    }
    return list.filter((ex) => ex && ex.type !== "dialogue");
  }
  function rampGateCap(list, cap) {
    const short = lessonSentencePool(list).filter((p) => rampWords(p.ru) <= cap);
    const out = [];
    let fillers = 0;
    list.forEach((ex) => {
      if (!ex) return;
      const t = ex.type;
      if (t === "alphabet") { out.push(ex); return; }
      if (t === "match_pairs") {
        const ps = (ex.pairs || []).filter((p) => p && rampWords(p.ru) <= cap);
        if (ps.length >= 3) out.push(ps.length === (ex.pairs || []).length ? ex : Object.assign({}, ex, { pairs: ps.slice(0, 5) }));
        else { const f = rampFiller(short, fillers++); if (f) out.push(f); }
        return;
      }
      if (t === "dialogue") {
        if (ramp.dlg === "none" || !ex._bank) { const f = rampFiller(short, fillers++); if (f) out.push(f); }
        else out.push(ex);
        return;
      }
      const n = rampWords(ex.ru || ex.sentence || (ex.words || []).join(" "));
      if (n > cap) { const f = rampFiller(short, fillers++); if (f) out.push(f); return; }
      if (t === "listen_order" && n > ramp.listenCap) { out.push(alternateForListening(ex)); return; }
      out.push(ex);
    });
    out._kept = out.filter((e) => !e._ramp).length;
    return out;
  }

  /** Full preprocessing used by runLesson (exposed for node simulations). */
  function prepareExercises(lesson) {
    let exercises = (lesson.exercises || []).map((ex) => Object.assign({}, ex));
    rampSetup(lesson);
    exercises = applyDialogueBank(lesson, exercises);
    exercises = rampGate(exercises);
    if (!/^(SRS|GRAM)$/.test(String(lesson.level || ""))) exercises = mixNewTypes(exercises);
    return exercises;
  }

  function runLesson(lesson, container, callbacks) {
    tlPolicy = policyForLesson(lesson);
    if (global.RLTips) RLTips.load();
    let tipShown = false;
    // Shallow-copy slots so in-place skip swaps do not mutate lesson data permanently
    let exercises = (lesson.exercises || []).map(function (ex) {
      return Object.assign({}, ex);
    });
    try { rampSetup(lesson); } catch (e) {}
    try { exercises = applyDialogueBank(lesson, exercises); } catch (e) {}
    try { exercises = rampGate(exercises); } catch (e) {}
    try {
      if (!/^(SRS|GRAM)$/.test(String(lesson.level || ""))) exercises = mixNewTypes(exercises);
      if (lesson._forceType) {
        const forced = buildNewType(lesson._forceType, lessonSentencePool(exercises), exercises.filter((e) => e && e.type === "dialogue"));
        if (forced) exercises[0] = forced;
      }
    } catch (e) {}
    let idx = 0;
    let mistakes = 0;
    let hearts = 5;
    let busy = false;
    let autoPlayGen = 0;

    const wrap = el("div", "lesson-runner");
    container.innerHTML = "";
    container.appendChild(wrap);

    const top = el("div", "lesson-top");
    const close = el("button", "close-btn", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "יציאה");
    close.onclick = () => {
      RLSpeech.stop();
      if (callbacks.onExit) callbacks.onExit();
    };
    const bar = el("div", "lesson-progress");
    const fill = el("div", "fill");
    bar.appendChild(fill);
    const heartsEl = el("div", "hearts-row");
    top.appendChild(close);
    top.appendChild(bar);
    top.appendChild(heartsEl);
    wrap.appendChild(top);

    const stage = el("div", "exercise-stage");
    wrap.appendChild(stage);

    const feedback = el("div", "feedback");
    feedback.innerHTML =
      '<div class="fb-title"></div><div class="fb-detail"></div><button type="button" class="btn btn-primary fb-next">המשך</button>';
    document.body.appendChild(feedback);

    // Keep long exercise content scrollable above the fixed feedback panel.
    function syncFbSpace() {
      if (!feedback.isConnected || !feedback.classList.contains("show")) {
        stage.style.paddingBottom = "";
        return;
      }
      const h = feedback.getBoundingClientRect().height;
      stage.style.paddingBottom = Math.ceil(h + 16) + "px";
    }
    // Scroll so the answer options (and the picked one) stay visible above the feedback panel
    function keepChoicesAboveFeedback() {
      try {
        if (!feedback.classList.contains("show")) return;
        const box = stage.querySelector(".choices");
        if (!box) return;
        const fbTop = feedback.getBoundingClientRect().top;
        const over = box.getBoundingClientRect().bottom + 8 - fbTop;
        if (over <= 0) return;
        let sc = box.parentElement;
        while (sc && sc !== document.body) {
          const cs = getComputedStyle(sc);
          if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollHeight > sc.clientHeight) break;
          sc = sc.parentElement;
        }
        if (sc && sc !== document.body) sc.scrollTop += over; else global.scrollBy(0, over);
      } catch (e) {}
    }
    try {
      if (global.ResizeObserver) new ResizeObserver(syncFbSpace).observe(feedback);
    } catch (e) {}

    function updateHearts() {
      heartsEl.innerHTML = "";
      for (let i = 0; i < 5; i++) {
        heartsEl.appendChild(document.createTextNode(i < hearts ? "❤️" : "🖤"));
      }
    }

    function updateBar() {
      const pct = exercises.length ? Math.round((idx / exercises.length) * 100) : 0;
      fill.style.width = pct + "%";
      if (callbacks.onProgress) callbacks.onProgress(idx, exercises.length);
    }

    function showFeedback(ok, detail, onNext) {
      busy = true;
      feedback.className = "feedback show " + (ok ? "ok" : "bad");
      feedback.querySelector(".fb-title").textContent = ok ? "מעולה!" : "לא בדיוק…";
      const detailEl = feedback.querySelector(".fb-detail");
      detailEl.replaceChildren();
      if (detail && detail.nodeType) detailEl.appendChild(detail);
      else detailEl.textContent = detail || "";
      const btn = feedback.querySelector(".fb-next");
      btn.textContent = ok ? "המשך" : "ננסה שוב / המשך";
      syncFbSpace();
      requestAnimationFrame(() => { syncFbSpace(); keepChoicesAboveFeedback(); });
      setTimeout(keepChoicesAboveFeedback, 260);
      // SRS Easy button
      let easy = feedback.querySelector(".fb-easy");
      const ex = exercises[idx];
      if (ok && ex && ex._srsLemma && global.RLSrs) {
        if (!easy) {
          easy = document.createElement("button");
          easy.type = "button";
          easy.className = "btn btn-ghost fb-easy";
          easy.style.marginTop = "8px";
          feedback.appendChild(easy);
        }
        easy.style.display = "";
        easy.textContent = "קליל (Easy) → מרווח ארוך יותר";
        easy.onclick = () => {
          try {
            RLSrs.review(ex._srsLemma, "easy");
            ex._srsGraded = true;
          } catch (e) {}
          feedback.classList.remove("show");
        syncFbSpace();
          busy = false;
          onNext();
        };
      } else if (easy) {
        easy.style.display = "none";
        easy.onclick = null;
      }
      btn.onclick = () => {
        feedback.classList.remove("show");
        syncFbSpace();
        busy = false;
        onNext();
      };
    }

    function advance() {
      idx++;
      if (idx >= exercises.length) {
        feedback.remove();
        const xp = lesson.xp || 15;
        const perfect = mistakes === 0;
        if (callbacks.onComplete) {
          callbacks.onComplete({ xp: perfect ? xp + 5 : xp, perfect, mistakes });
        }
        return;
      }
      if (!tipShown && exercises.length >= 6 && idx === Math.floor(exercises.length / 2) && global.RLTips) {
        tipShown = true;
        RLTips.pick(lesson).then((tip) => {
          if (!tip) return render();
          RLSpeech.stop && RLSpeech.stop();
          stage.innerHTML = "";
          const card = el("div", "card exercise-card tip-interstitial");
          card.appendChild(RLTips.cardEl(tip, "טיפ באמצע הדרך"));
          const go = el("button", "btn btn-primary", "הבנתי — ממשיכים");
          go.type = "button";
          go.style.marginTop = "14px";
          go.style.width = "100%";
          go.onclick = () => render();
          card.appendChild(go);
          stage.appendChild(card);
          window.scrollTo(0, 0);
        }).catch(() => render());
        return;
      }
      render();
    }

    function failAndMaybeRetry(detail, retryFn) {
      mistakes++;
      hearts = Math.max(0, hearts - 1);
      updateHearts();
      try {
        if (global.RLSrs && exercises[idx]) RLSrs.trackExerciseResult(exercises[idx], false);
        // SRS review grade again
        if (exercises[idx] && exercises[idx]._srsLemma && global.RLSrs) {
          RLSrs.review(exercises[idx]._srsLemma, "again");
        }
      } catch (e) {}
      showFeedback(false, detail, () => {
        if (hearts <= 0) {
          // gentle: refill and continue
          hearts = 5;
          updateHearts();
        }
        if (retryFn) retryFn();
        else advance();
      });
    }

    function successDetail(ex, detail) {
      const showGloss = ex &&
        (ex.type === "listen_order" || ex.type === "sentence_build" || ex.type === "translate_he_ru") &&
        ex.he;
      if (!showGloss) return detail || "";
      const fragment = document.createDocumentFragment();
      if (detail && detail.nodeType) {
        fragment.appendChild(detail);
      } else if (detail) {
        // Keep target-language punctuation isolated from the RTL feedback panel.
        fragment.appendChild(targetText(detail));
      }
      const gloss = el("div", "feedback-he", escapeHtml(ex.he));
      gloss.setAttribute("dir", "rtl");
      gloss.style.direction = "rtl";
      gloss.style.unicodeBidi = "isolate";
      fragment.appendChild(gloss);
      return fragment;
    }

    function succeed(detail) {
      try {
        const cx = exercises[idx];
        if (cx) tlBump(String(cx.ru || (cx.words || []).join(" ") || "").split(/\s+/));
      } catch (e) {}
      try {
        if (global.RLSrs && exercises[idx]) RLSrs.trackExerciseResult(exercises[idx], true);
      } catch (e) {}
      const exNow = exercises[idx];
      showFeedback(true, successDetail(exNow, detail), () => {
        try {
          if (exNow && exNow._srsLemma && global.RLSrs && !exNow._srsGraded) {
            RLSrs.review(exNow._srsLemma, "good");
            exNow._srsGraded = true;
          }
        } catch (e) {}
        advance();
      });
    }

    function render() {
      autoPlayGen += 1;
      RLSpeech.stop();
      updateBar();
      updateHearts();
      stage.innerHTML = "";
      const ex = exercises[idx];
      const card = el("div", "exercise-card");
      stage.appendChild(card);

      if (ex.tip) {
        card.appendChild(el("div", "ex-tip", "💡 " + ex.tip));
      }

      const type = ex.type;
      if (type === "listen_choice") renderListenChoice(card, ex);
      else if (type === "read_choice") renderReadChoice(card, ex);
      else if (type === "listen_order") renderListenOrder(card, ex);
      else if (type === "sentence_build") renderSentenceBuild(card, ex);
      else if (type === "translate_he_ru") renderTranslate(card, ex);
      else if (type === "dialogue") renderDialogue(card, ex);
      else if (type === "true_false") renderTrueFalse(card, ex);
      else if (type === "he_pick") renderHePick(card, ex);
      else if (type === "missing_word") renderMissingWord(card, ex);
      else if (type === "reply_pick") renderReplyPick(card, ex);
      else if (type === "fill_blank") renderFillBlank(card, ex);
      else if (type === "match_pairs") renderMatch(card, ex);
      else if (type === "speak_repeat") renderSpeak(card, ex);
      else if (type === "alphabet") renderAlphabet(card, ex);
      else {
        card.appendChild(el("div", "ex-prompt", "תרגיל לא מוכר"));
        const b = el("button", "btn btn-primary", "דלג");
        b.onclick = advance;
        card.appendChild(b);
      }
      // Every exercise with a play button gets the same row: slow · reveal · skip
      if (type !== "alphabet" && type !== "dialogue" && card.querySelector(".tts-replay")) appendSkipAltButton(card);
    }

    function ttsButton(text, showText, label) {
      const wrap = el("div", "tts-wrap");
      const btn = el("button", "tts-btn tts-replay");
      btn.type = "button";
      const lbl = label || "השמע שוב";
      btn.setAttribute("aria-label", lbl);
      btn.innerHTML = showText
        ? '<span class="tts-ico">🔊</span><span class="ru-text">' + escapeHtml(text) + "</span>"
        : '<span class="tts-ico">🔊</span><span class="tts-label">' + escapeHtml(lbl) + "</span>";
      if (showText) markTarget(btn.querySelector(".ru-text"));
      btn.onclick = () => {
        RLSpeech.speak(text);
        btn.classList.add("playing");
        setTimeout(() => btn.classList.remove("playing"), 900);
      };
      wrap.appendChild(btn);
      const hint = el("div", "tts-hint", "");
      wrap.appendChild(hint);
      return wrap;
    }

    function scheduleAutoPlay(text) {
      const gen = ++autoPlayGen;
      setTimeout(() => {
        if (gen !== autoPlayGen) return; // superseded by newer exercise / re-render
        RLSpeech.autoPlay(text).then((r) => {
          if (gen !== autoPlayGen) return;
          if (r && r.blocked) {
            const hint = stage.querySelector(".tts-hint");
            if (hint) {
              hint.textContent = "לחצו על 🔊 להאזנה (הדפדפן חסם ניגון אוטומטי)";
              hint.classList.add("warn");
            }
            const btn = stage.querySelector(".tts-replay");
            if (btn) btn.classList.add("pulse");
          }
        });
      }, 280);
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }


    function skipToAlternate() {
      if (busy) return;
      RLSpeech.stop();
      const cur = exercises[idx];
      if (!cur) return;
      let alt = null;
      if (cur.type === "listen_choice") alt = alternateForListening(cur);
      else {
        // non-audio replacement: pick the right target sentence for the Hebrew meaning
        const ru = String(cur.ru || (cur.words || []).join(" ") || "").trim();
        const poolAll = lessonSentencePool(exercises);
        const known = poolAll.find((p) => p.ru === ru);
        const he = String(cur.correctHe || (cur.type === "true_false" ? "" : cur.he) || (known && known.he) || "").trim();
        const others = shuffle(lessonSentencePool(exercises).filter((p) => p.ru !== ru)).slice(0, 3).map((p) => p.ru);
        if (ru && he && others.length >= 2) alt = { type: "he_pick", ru: ru, he: he, options: shuffle([ru].concat(others)), _gen: 1 };
        else {
          const a2 = alternateForListening(cur);
          if (a2.type === "read_choice") alt = a2;
        }
      }
      if (!alt) { advance(); return; } // nothing silent to swap in → just move on (no penalty)
      exercises[idx] = alt;
      render();
    }

    function appendSkipAltButton(card) {
      if (card.querySelector(".reveal-row")) return;
      const curEx = exercises[idx];
      const heardText = curEx && (curEx.ru || (curEx.words || []).join(" ") || (curEx.sentence && curEx.answer ? String(curEx.sentence).replace("___", curEx.answer) : ""));
      if (heardText) {
        const rrow = el("div", "check-row reveal-row");
        rrow.style.marginTop = "10px";
        const rb = el("button", "btn btn-ghost", "👁 הצג כתוב");
        rb.type = "button";
        rb.onclick = () => {
          if (card.querySelector(".heard-reveal")) return;
          const box = el("div", "heard-reveal");
          box.appendChild(markTarget(el("div", "ru-big", escapeHtml(heardText))));
          const tl = sentenceTlEl(heardText, "reveal-tl");
          if (tl) box.appendChild(tl);
          rrow.replaceWith(box);
        };
        if (!card.querySelector(".tts-slow")) {
          const sb = el("button", "btn btn-ghost tts-slow-inline", "🐢 איטי");
          sb.type = "button";
          sb.setAttribute("aria-label", "השמע לאט");
          sb.onclick = () => {
            if (RLSpeech.unlockAudio) RLSpeech.unlockAudio();
            RLSpeech.stop && RLSpeech.stop();
            if (RLSpeech.speakSlow) RLSpeech.speakSlow(heardText);
            else RLSpeech.speak(heardText, { rate: 0.65 });
          };
          rrow.appendChild(sb);
        }
        rrow.appendChild(rb);
        const sk = el("button", "btn btn-ghost", "דלג — תרגיל אחר");
        sk.type = "button";
        sk.setAttribute("aria-label", "דלג — תרגיל אחר");
        sk.onclick = () => skipToAlternate();
        rrow.appendChild(sk);
        const tts = card.querySelector(".tts-helper-row") || card.querySelector(".tts-wrap");
        if (tts && tts.parentNode) tts.parentNode.insertBefore(rrow, tts.nextSibling);
        else card.insertBefore(rrow, card.firstChild ? card.firstChild.nextSibling : null);
      }
      if (card.querySelector(".reveal-row")) return;
      const row = el("div", "check-row skip-alt-row");
      row.style.marginTop = "14px";
      const btn = el("button", "btn btn-ghost", "דלג — תרגיל אחר");
      btn.type = "button";
      btn.setAttribute("aria-label", "דלג — תרגיל אחר");
      btn.onclick = () => skipToAlternate();
      row.appendChild(btn);
      card.appendChild(row);
    }

    // ——— Exercise renderers ———

    // New-type generators + ramp gate live at module level (prepareExercises).

    function targetOptionButton(text, onPick) {
      const b = markTarget(el("button", "choice ru", escapeHtml(text)));
      b.type = "button";
      const tl = sentenceTlEl(text, "choice-tl");
      if (tl) b.appendChild(tl);
      b.onclick = () => onPick(b);
      return b;
    }

    function renderTrueFalse(card, ex) {
      card.appendChild(el("div", "ex-prompt", "נכון או לא נכון? האם התרגום מתאים למשפט"));
      card.appendChild(ttsButton(ex.ru, false));
      card.appendChild(markTarget(el("div", "ru-big", escapeHtml(ex.ru))));
      const tl = sentenceTlEl(ex.ru, "reveal-tl");
      if (tl) card.appendChild(tl);
      card.appendChild(el("div", "he-prompt tf-he", "«" + escapeHtml(ex.he) + "»"));
      scheduleAutoPlay(ex.ru);
      const box = el("div", "choices tf-choices");
      [["✓ נכון", true], ["✗ לא נכון", false]].forEach((o) => {
        const b = el("button", "choice", o[0]);
        b.type = "button";
        b.onclick = () => {
          if (busy) return;
          if (o[1] === ex.truth) {
            b.classList.add("correct");
            succeed(mixedText(targetText(ex.ru), " = ", ex.correctHe));
          } else {
            b.classList.add("wrong");
            failAndMaybeRetry(mixedText("התרגום הנכון: ", targetText(ex.ru), " = ", ex.correctHe), null);
          }
        };
        box.appendChild(b);
      });
      card.appendChild(box);
    }

    function renderHePick(card, ex) {
      card.appendChild(el("div", "ex-prompt", "איך אומרים את זה? בחר את המשפט הנכון"));
      card.appendChild(el("div", "he-prompt he-big", escapeHtml(ex.he)));
      const box = el("div", "choices");
      ex.options.forEach((opt) => {
        box.appendChild(targetOptionButton(opt, (b) => {
          if (busy) return;
          RLSpeech.speak(opt);
          if (opt === ex.ru) {
            b.classList.add("correct");
            succeed(mixedText(targetText(ex.ru), " = ", ex.he));
          } else {
            b.classList.add("wrong");
            failAndMaybeRetry(mixedText("התשובה: ", targetText(ex.ru)), null);
          }
        }));
      });
      card.appendChild(box);
    }

    function renderMissingWord(card, ex) {
      card.appendChild(el("div", "ex-prompt", "איזו מילה חסרה במשפט?"));
      card.appendChild(ttsButton(ex.ru, false));
      const line = markTarget(el("div", "ru-big"));
      line.innerHTML = ex.tokens
        .map((w, i) => (i === ex.gap ? w.replace(ex.answer, '<span class="mw-gap">____</span>') : escapeHtml(w)))
        .join(" ");
      card.appendChild(line);
      card.appendChild(el("div", "he-prompt", escapeHtml(ex.he)));
      const box = el("div", "choices mw-choices");
      ex.options.forEach((opt) => {
        box.appendChild(targetOptionButton(opt, (b) => {
          if (busy) return;
          if (opt === ex.answer) {
            b.classList.add("correct");
            const gap = line.querySelector(".mw-gap");
            if (gap) gap.textContent = ex.answer;
            RLSpeech.speak(ex.ru);
            succeed(mixedText(targetText(ex.ru), " = ", ex.he));
          } else {
            b.classList.add("wrong");
            failAndMaybeRetry(mixedText("המילה: ", targetText(ex.answer)), null);
          }
        }));
      });
      card.appendChild(box);
    }

    function renderReplyPick(card, ex) {
      card.appendChild(el("div", "ex-prompt", "מה עונים? בחר את התגובה המתאימה"));
      const q = markTarget(el("div", "bubble a", escapeHtml(ex.ru)));
      const qtl = sentenceTlEl(ex.ru, "bubble-tl");
      if (qtl) q.appendChild(qtl);
      card.appendChild(q);
      if (ex.he) card.appendChild(el("div", "he-prompt", escapeHtml(ex.he)));
      card.appendChild(ttsButton(ex.ru, false));
      scheduleAutoPlay(ex.ru);
      const box = el("div", "choices");
      ex.options.forEach((opt) => {
        box.appendChild(targetOptionButton(opt, (b) => {
          if (busy) return;
          if (opt === ex.answer) {
            b.classList.add("correct");
            RLSpeech.speak(opt);
            succeed(mixedText(targetText(ex.answer), ex.answerHe ? " = " + ex.answerHe : ""));
          } else {
            b.classList.add("wrong");
            failAndMaybeRetry(mixedText("תגובה מתאימה: ", targetText(ex.answer)), null);
          }
        }));
      });
      card.appendChild(box);
    }

    function renderListenChoice(card, ex) {
      card.appendChild(el("div", "ex-prompt", "מה שמעת? בחר את המשמעות הנכונה"));
      card.appendChild(ttsButton(ex.ru, false));
      scheduleAutoPlay(ex.ru);
      if (ex.translit) {
        const t = translitLine(ex.translit);
        if (t) card.appendChild(t);
      }
      const choices = shuffle(ex.choices.slice());
      const box = el("div", "choices");
      choices.forEach((c) => {
        const b = el("button", "choice", escapeHtml(c.he));
        b.type = "button";
        b.onclick = () => {
          if (busy) return;
          if (c.correct) {
            b.classList.add("correct");
            succeed(mixedText(targetText(ex.ru), " = ", c.he));
          } else {
            b.classList.add("wrong");
            const right = ex.choices.find((x) => x.correct);
            failAndMaybeRetry("התשובה: " + (right ? right.he : ""), () => render());
          }
        };
        box.appendChild(b);
      });
      card.appendChild(box);
      appendSkipAltButton(card);
    }


    function renderReadChoice(card, ex) {
      card.appendChild(el("div", "ex-prompt", "מה המשמעות של המשפט?"));
      card.appendChild(markTarget(el("div", "ru-big", escapeHtml(ex.ru))));
      if (ex.translit) {
        const t = translitLine(ex.translit);
        if (t) card.appendChild(t);
      }
      const choices = shuffle(ex.choices.slice());
      const box = el("div", "choices");
      choices.forEach((c) => {
        const b = el("button", "choice", escapeHtml(c.he));
        b.type = "button";
        b.onclick = () => {
          if (busy) return;
          if (c.correct) {
            b.classList.add("correct");
            succeed(mixedText(targetText(ex.ru), " = ", c.he));
          } else {
            b.classList.add("wrong");
            const right = ex.choices.find((x) => x.correct);
            failAndMaybeRetry("התשובה: " + (right ? right.he : ""), () => render());
          }
        };
        box.appendChild(b);
      });
      card.appendChild(box);
    }

    function renderListenOrder(card, ex) {
      card.appendChild(el("div", "ex-prompt", "האזן ובנה את המשפט לפי הסדר"));
      mountChipBuild(card, ex, {
        words: ex.words || String(ex.ru || "").split(/\s+/).filter(Boolean),
        speakFull: ex.ru,
        autoplay: true,
        skipAlt: true,
        expectExtra: [ex.ru].filter(Boolean),
      });
    }

    function renderSentenceBuild(card, ex) {
      card.appendChild(el("div", "ex-prompt", ex.promptHe || "בנה את המשפט בערבית"));
      if (ex.he && ex.he !== ex.promptHe) card.appendChild(el("div", "he-prompt", escapeHtml(ex.he)));
      const words = ex.words || [];
      const speakFull = ex.ru || words.join(" ");
      mountChipBuild(card, ex, {
        words: words,
        distractors: ex.distractors || [],
        speakFull: speakFull,
        autoplay: !!speakFull,
        skipAlt: false,
        accepted: ex.accepted || [],
        expectExtra: [ex.ru].filter(Boolean),
        speakOnSuccess: true,
      });
    }

    function renderTranslate(card, ex) {
      renderSentenceBuild(card, {
        he: ex.he,
        words: ex.words || (ex.ru ? ex.ru.split(/\s+/) : []),
        distractors: ex.distractors || [],
        ru: ex.ru,
        translit: ex.translit,
        heTranslit: ex.heTranslit,
        wordsHeTranslit: ex.wordsHeTranslit,
        accepted: ex.accepted,
        tip: ex.tip,
      });
      const prompt = card.querySelector(".ex-prompt");
      if (prompt) prompt.textContent = "תרגם לעברית → ערבית";
    }

    /**
     * Shared chip-building UI for listen_order / sentence_build / translate_he_ru.
     * Helpers: word-by-word playback + slots, Hebrew translit under chips,
     * tap-to-hear bank chips, progressive hints after mistakes.
     */
    function mountChipBuild(card, ex, opts) {
      opts = opts || {};
      const words = (opts.words || []).slice();
      const distractors = opts.distractors || [];
      const speakFull = opts.speakFull || "";
      const heMap = wordHeTranslits(ex, words);
      // Map distractor words too (by text; duplicates share same tl)
      const heByWord = {};
      words.forEach((w, i) => {
        heByWord[w + "::" + i] = heMap[i] || faLettersToHe(w);
      });
      distractors.forEach((w) => {
        if (!Object.prototype.hasOwnProperty.call(heByWord, w)) {
          heByWord[w] = lookupHeTranslit(w) || faLettersToHe(w);
        }
      });

      function tlFor(item) {
        if (item && item.correctIdx != null) return heMap[item.correctIdx] || lookupHeTranslit(item.w) || faLettersToHe(item.w);
        return heByWord[item.w] || lookupHeTranslit(item.w) || faLettersToHe(item.w);
      }

      // TTS row: normal replay + slow sentence + word-by-word
      if (speakFull) {
        card.appendChild(ttsButton(speakFull, false));
      }

      const slots = el("div", "wbw-slots");
      slots.setAttribute("aria-hidden", "true");
      const slotEls = [];
      words.forEach((_, i) => {
        const s = el("span", "wbw-slot", String(i + 1));
        s.dataset.i = String(i);
        slots.appendChild(s);
        slotEls.push(s);
      });
      if (words.length > 1) card.appendChild(slots);

      const helperRow = el("div", "tts-helper-row");

      // Slow full sentence (dedicated edge-tts -35% clip when available)
      if (speakFull) {
        const slowWrap = el("div", "tts-wrap tts-slow-wrap");
        const slowBtn = el("button", "tts-btn tts-slow");
        slowBtn.type = "button";
        slowBtn.setAttribute("aria-label", "השמע לאט");
        slowBtn.innerHTML =
          '<span class="tts-ico">🐢</span><span class="tts-label">איטי</span>';
        const slowHint = el("div", "tts-hint", "משפט שלם — לאט");
        slowBtn.onclick = () => {
          if (RLSpeech.unlockAudio) RLSpeech.unlockAudio();
          RLSpeech.stop();
          slotEls.forEach((s) => s.classList.remove("active"));
          if (wbwBtn) wbwBtn.classList.remove("playing");
          slowBtn.classList.add("playing");
          slowHint.textContent = "משמיע לאט…";
          const play = RLSpeech.speakSlow
            ? RLSpeech.speakSlow(speakFull)
            : RLSpeech.speak(speakFull, { rate: 0.7 });
          play.then((r) => {
            slowBtn.classList.remove("playing");
            slowHint.textContent =
              r && r.ok ? "משפט שלם — לאט" : "לא נשמע? לחצו שוב";
          });
        };
        slowWrap.appendChild(slowBtn);
        slowWrap.appendChild(slowHint);
        helperRow.appendChild(slowWrap);
      }

      // Word-by-word with dedicated slow word clips + real pauses
      let wbwBtn = null;
      if (words.length > 1) {
        const wbwWrap = el("div", "tts-wrap tts-wbw-wrap");
        wbwBtn = el("button", "tts-btn tts-wbw");
        wbwBtn.type = "button";
        wbwBtn.setAttribute("aria-label", "מילה־מילה");
        wbwBtn.innerHTML =
          '<span class="tts-ico">1️⃣</span><span class="tts-label">מילה־מילה</span>';
        const wbwHint = el("div", "tts-hint", "מילה־מילה עם הפסקות");
        wbwBtn.onclick = () => {
          if (!words.length) return;
          if (RLSpeech.unlockAudio) RLSpeech.unlockAudio();
          RLSpeech.stop();
          slotEls.forEach((s) => s.classList.remove("active"));
          const slowPlaying = helperRow.querySelector(".tts-slow");
          if (slowPlaying) slowPlaying.classList.remove("playing");
          wbwBtn.classList.add("playing");
          wbwHint.classList.remove("warn");
          wbwHint.textContent = "משמיע מילה־מילה…";
          // rate 1.0 — clips are already slowed in edge-tts (-30%)
          RLSpeech.speakTurns(words, 550, {
            rate: 1.0,
            ttsRate: 0.7,
            onTurn: function (i) {
              slotEls.forEach((s, j) => s.classList.toggle("active", j === i));
            },
            onDone: function (ok) {
              wbwBtn.classList.remove("playing");
              slotEls.forEach((s) => s.classList.remove("active"));
              wbwHint.textContent = ok
                ? "מילה־מילה עם הפסקות"
                : "נעצר — אפשר לנסות שוב";
            },
          });
        };
        wbwWrap.appendChild(wbwBtn);
        wbwWrap.appendChild(wbwHint);
        helperRow.appendChild(wbwWrap);
      }

      if (helperRow.childNodes.length) card.appendChild(helperRow);

      // Normal replay cancels helpers
      const fullBtn = card.querySelector(".tts-replay");
      if (fullBtn) {
        const prev = fullBtn.onclick;
        fullBtn.onclick = function (ev) {
          slotEls.forEach((s) => s.classList.remove("active"));
          helperRow.querySelectorAll(".tts-btn").forEach((b) => b.classList.remove("playing"));
          if (typeof prev === "function") prev.call(fullBtn, ev);
        };
      }

      if (opts.autoplay && speakFull) scheduleAutoPlay(speakFull);

      const answer = markTarget(el("div", "chip-answer"));
      const bank = markTarget(el("div", "chip-bank"));
      const hintNote = el("div", "chip-hint-note");
      hintNote.hidden = true;

      // Build pool: correct words keep correctIdx; distractors get negative ids
      let pool;
      if (distractors.length) {
        pool = shuffle(
          words
            .map((w, i) => ({ w: w, i: i, id: w + "_" + i, correctIdx: i }))
            .concat(distractors.map((w, j) => ({ w: w, i: words.length + j, id: w + "_d" + j, correctIdx: null })))
        );
      } else {
        pool = shuffle(words.map((w, i) => ({ w: w, i: i, id: w + "_" + i, correctIdx: i })));
      }

      const picked = [];
      let hintCount = 0; // number of leading locked correct words after mistakes

      function clearSlotsActive() {
        slotEls.forEach((s) => s.classList.remove("active"));
      }

      function applyHintToPicked() {
        const maxHint = Math.max(0, words.length - 1);
        const n = Math.min(hintCount, maxHint);
        picked.length = 0;
        for (let k = 0; k < n; k++) {
          const item = pool.find((it) => it.correctIdx === k);
          if (item) picked.push(item);
        }
        if (n <= 0) {
          hintNote.hidden = true;
          hintNote.textContent = "";
        } else if (n === 1) {
          hintNote.hidden = false;
          hintNote.textContent = "רמז: המילה הראשונה כבר במקום";
        } else {
          hintNote.hidden = false;
          hintNote.textContent = "רמז: " + n + " המילים הראשונות כבר במקום";
        }
      }

      function sync() {
        answer.innerHTML = "";
        picked.forEach((p, pi) => {
          const locked = pi < Math.min(hintCount, Math.max(0, words.length - 1)) && p.correctIdx === pi;
          const c = makeChipEl(p.w, tlFor(p), locked ? "locked" : "");
          if (locked) {
            c.disabled = true;
            c.setAttribute("aria-label", "נעול: " + p.w);
          } else {
            c.onclick = () => {
              // only remove if not a locked hint slot
              const lockN = Math.min(hintCount, Math.max(0, words.length - 1));
              if (pi < lockN && picked[pi] && picked[pi].correctIdx === pi) return;
              picked.splice(pi, 1);
              sync();
              rebuildBank();
            };
          }
          answer.appendChild(c);
        });
      }

      function rebuildBank() {
        bank.innerHTML = "";
        pool.forEach((item) => {
          const used = picked.some((p) => p.id === item.id);
          const c = makeChipEl(item.w, tlFor(item), used ? "used" : "");
          if (!used) {
            c.onclick = () => {
              RLSpeech.stop();
              clearSlotsActive();
              RLSpeech.speak(item.w, { rate: 0.85 });
              picked.push(item);
              sync();
              rebuildBank();
            };
          }
          bank.appendChild(c);
        });
      }

      applyHintToPicked();
      sync();
      rebuildBank();
      card.appendChild(hintNote);
      card.appendChild(answer);
      card.appendChild(bank);

      const check = el("div", "check-row");
      const btn = el("button", "btn btn-primary", "בדיקה");
      btn.onclick = () => {
        if (busy) return;
        const got = picked.map((p) => p.w).join(" ");
        const expect = words.join(" ");
        const alts = [expect]
          .concat(opts.expectExtra || [])
          .concat(opts.accepted || [])
          .filter(Boolean);
        if (alts.some((a) => a === got)) {
          if (opts.speakOnSuccess && RLProgress.get().settings.sound !== false) {
            RLSpeech.speak(speakFull || expect);
          }
          succeed(targetText(speakFull || expect));
        } else {
          failAndMaybeRetry(mixedText("המשפט: ", targetText(speakFull || expect)), () => {
            hintCount = Math.min(hintCount + 1, Math.max(0, words.length - 1));
            applyHintToPicked();
            sync();
            rebuildBank();
          });
        }
      };
      check.appendChild(btn);
      card.appendChild(check);
      if (opts.skipAlt) appendSkipAltButton(card);
    }

    function renderDialogue(card, ex) {
      function dialogueTranslation(turn) {
        const direct = turn && (turn.he || turn.hebrew || turn.translation || turn.heTranslation);
        if (direct) return direct;
        const candidates = []
          .concat(ex.choices || [], ex.options || [], (turn && turn.choices) || []);
        const match = candidates.find((choice) => choice && typeof choice === "object" && choice.ru === turn.ru);
        if (match && match.he) return match.he;
        const pairs = ex.pairs || ex.pairMetadata || ex.metadata || [];
        const pair = pairs.find((item) => item && item.ru === turn.ru);
        return pair && (pair.he || pair.translation || pair.hebrew);
      }

      function appendDialogueSummary() {
        const summary = el("section", "dialogue-summary");
        summary.setAttribute("aria-label", "סיכום השיחה");
        summary.appendChild(el("h3", "dialogue-summary-title", "סיכום השיחה — תרגום לעברית"));
        turns.forEach((turn, index) => {
          const row = el("div", "dialogue-summary-row");
          row.dataset.speaker = turn.speaker || "";
          row.appendChild(el("div", "dialogue-summary-index", String(index + 1)));
          row.appendChild(markTarget(el("div", "dialogue-summary-target", turn.ru || "")));
          const rowTl = sentenceTlEl(turn.ru, "dialogue-summary-tl");
          if (rowTl) row.appendChild(rowTl);
          const he = dialogueTranslation(turn);
          if (he) row.appendChild(el("div", "dialogue-summary-he", he));
          summary.appendChild(row);
        });
        card.appendChild(summary);
        setTimeout(() => {
          syncFbSpace();
          try { summary.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
        }, 320);
      }

      card.appendChild(el("div", "ex-prompt", "השלם את השיחה — בחר את השורה הבאה"));
      const thread = el("div", "dialogue-thread");
      card.appendChild(thread);
      const turns = ex.turns || [];
      let step = 0;

      function paint() {
        thread.innerHTML = "";
        for (let i = 0; i < turns.length; i++) {
          const t = turns[i];
          if (i < step || (i === step && t.speaker !== "user")) {
            const b = markTarget(el("div", "bubble " + (t.speaker === "user" ? "b" : "a"), escapeHtml(t.ru)));
            const bTl = sentenceTlEl(t.ru, "bubble-tl");
            if (bTl) b.appendChild(bTl);
            thread.appendChild(b);
          } else if (i === step && t.speaker === "user") {
            thread.appendChild(el("div", "bubble b pending", "…"));
          }
        }
        thread.scrollTop = thread.scrollHeight;
      }

      function playHeard() {
        const parts = turns.slice(0, step).map((t) => t.ru);
        if (parts.length) RLSpeech.speakTurns(parts, 420);
      }

      function nextNonUser() {
        while (step < turns.length && turns[step].speaker !== "user") {
          step++;
        }
      }

      // reveal initial NPC lines
      step = 0;
      while (step < turns.length && turns[step].speaker !== "user") step++;
      paint();
      setTimeout(() => {
        const intro = turns.slice(0, step).map((t) => t.ru);
        if (intro.length) RLSpeech.speakTurns(intro, 420);
      }, 250);

      const choicesBox = el("div", "choices");
      card.appendChild(choicesBox);

      function showChoices() {
        choicesBox.innerHTML = "";
        if (step >= turns.length) {
          // done — play full dialogue with short pauses between turns
          RLSpeech.speakTurns(turns.map((t) => t.ru), 450);
          appendDialogueSummary();
          succeed("שיחה מלאה ✓");
          return;
        }
        const correct = turns[step];
        const opts = shuffle(
          [{ ru: correct.ru, ok: true }].concat(
            ((correct.distractors && correct.distractors.length ? correct.distractors : ex.distractors) || []).slice(0, 3).map((d) => ({ ru: d, ok: false }))
          )
        );
        opts.forEach((o) => {
          const b = markTarget(el("button", "choice ru", escapeHtml(o.ru)));
          b.type = "button";
          b.onclick = () => {
            if (busy) return;
            if (o.ok) {
              b.classList.add("correct");
              RLSpeech.speak(o.ru);
              step++;
              // advance past following NPC lines
              while (step < turns.length && turns[step].speaker !== "user") step++;
              paint();
              setTimeout(showChoices, 500);
            } else {
              b.classList.add("wrong");
              failAndMaybeRetry(mixedText("השורה: ", targetText(correct.ru)), showChoices);
            }
          };
          choicesBox.appendChild(b);
        });
      }
      showChoices();
    }

    function renderFillBlank(card, ex) {
      card.appendChild(el("div", "ex-prompt", "השלם את החסר"));
      const sentence = markTarget(el("div", "ru-big"));
      const parts = (ex.sentence || "").split("___");
      sentence.innerHTML =
        escapeHtml(parts[0] || "") +
        '<span style="color:var(--blue)">____</span>' +
        escapeHtml(parts[1] || "");
      card.appendChild(sentence);
      if (ex.he) card.appendChild(el("div", "he-prompt", escapeHtml(ex.he)));
      const fillTarget =
        (ex.sentence || "").replace("___", ex.answer || "") ||
        ex.ru ||
        "";
      if (fillTarget) {
        card.appendChild(ttsButton(fillTarget, false, "השמע את המשפט"));
      }
      const opts = shuffle((ex.options || []).slice());
      const box = el("div", "choices");
      opts.forEach((o) => {
        const label = typeof o === "string" ? o : o.ru;
        const ok = typeof o === "string" ? o === ex.answer : !!o.correct;
        const b = markTarget(el("button", "choice ru", escapeHtml(label)));
        b.type = "button";
        b.onclick = () => {
          if (busy) return;
          RLSpeech.speak(label);
          if (ok || label === ex.answer) {
            b.classList.add("correct");
            const full = (ex.sentence || "").replace("___", ex.answer || label);
            succeed(targetText(full));
          } else {
            b.classList.add("wrong");
            failAndMaybeRetry(mixedText("התשובה: ", targetText(ex.answer)), () => render());
          }
        };
        box.appendChild(b);
      });
      card.appendChild(box);
    }

    function renderMatch(card, ex) {
      card.appendChild(el("div", "ex-prompt", "התאם בין ערבית לעברית"));
      const pairs = (ex.pairs || []).slice();
      const left = shuffle(pairs.map((p, i) => ({ side: "ru", text: p.ru, id: i })));
      const right = shuffle(pairs.map((p, i) => ({ side: "he", text: p.he, id: i })));
      const grid = el("div", "match-grid");
      let selected = null;
      let matched = 0;

      function makeItem(item) {
        const b = el(
          "button",
          "match-item " + (item.side === "ru" ? "ru-side" : ""),
          escapeHtml(item.text)
        );
        if (item.side === "ru") markTarget(b);
        b.type = "button";
        b.dataset.id = item.id;
        b.dataset.side = item.side;
        b.onclick = () => {
          if (busy || b.classList.contains("matched")) return;
          if (item.side === "ru" && item.text) RLSpeech.speak(item.text);
          if (!selected) {
            selected = b;
            b.classList.add("selected");
            return;
          }
          if (selected === b) {
            b.classList.remove("selected");
            selected = null;
            return;
          }
          if (selected.dataset.side === b.dataset.side) {
            selected.classList.remove("selected");
            selected = b;
            b.classList.add("selected");
            return;
          }
          const a = selected;
          if (a.dataset.id === b.dataset.id) {
            a.classList.remove("selected");
            a.classList.add("matched");
            b.classList.add("matched");
            selected = null;
            matched++;
            if (matched >= pairs.length) succeed("הכל הותאם!");
          } else {
            a.classList.add("mismatch");
            b.classList.add("mismatch");
            busy = true;
            setTimeout(() => {
              a.classList.remove("selected", "mismatch");
              b.classList.remove("mismatch");
              selected = null;
              busy = false;
              mistakes++;
              hearts = Math.max(0, hearts - 1);
              updateHearts();
            }, 450);
          }
        };
        return b;
      }

      // interleave display: all ru then he in two columns via grid
      left.forEach((item) => grid.appendChild(makeItem(item)));
      // Actually put ru in col1 he in col2 by appending in pairs visually —
      // simpler: clear and do two columns manually
      grid.innerHTML = "";
      const colL = el("div", "");
      const colR = el("div", "");
      colL.style.display = "flex";
      colL.style.flexDirection = "column";
      colL.style.gap = "8px";
      colR.style.display = "flex";
      colR.style.flexDirection = "column";
      colR.style.gap = "8px";
      left.forEach((item) => colL.appendChild(makeItem(item)));
      right.forEach((item) => colR.appendChild(makeItem(item)));
      grid.appendChild(colL);
      grid.appendChild(colR);
      card.appendChild(grid);
    }

    function renderSpeak(card, ex) {
      card.appendChild(el("div", "ex-prompt", "האזן, חזור בקול, ואשר"));
      card.appendChild(markTarget(el("div", "ru-big", escapeHtml(ex.ru))));
      if (ex.translit) {
        const t = translitLine(ex.translit);
        if (t) card.appendChild(t);
      }
      if (ex.he) card.appendChild(el("div", "he-prompt", escapeHtml(ex.he)));
      card.appendChild(ttsButton(ex.ru, false));
      scheduleAutoPlay(ex.ru);

      const actions = el("div", "speak-actions");
      if (RLSpeech.canRecognize()) {
        const mic = el("button", "btn btn-blue", "🎤 לחץ ודבר");
        mic.onclick = async () => {
          if (busy) return;
          mic.disabled = true;
          mic.textContent = "מקשיב…";
          const res = await RLSpeech.recognizeOnce(7000);
          mic.disabled = false;
          mic.textContent = "🎤 לחץ ודבר";
          if (res.ok && RLSpeech.looseMatch(res.transcript, ex.ru)) {
            succeed(mixedText("שמעתי: ", targetText(res.transcript)));
          } else if (res.ok) {
            failAndMaybeRetry(mixedText("שמעתי: ", targetText(res.transcript), " — נסה שוב או אשר ידנית"), null);
            // also show self-check
          } else {
            // fall through to self-check message
            failAndMaybeRetry("הזיהוי לא זמין כרגע — אשר ידנית למטה", null);
          }
        };
        actions.appendChild(mic);
      }
      const ok = el("button", "btn btn-primary", "✓ שמעתי / חזרתי");
      ok.onclick = () => {
        if (busy) return;
        succeed(targetText(ex.ru));
      };
      const again = el("button", "btn btn-ghost", "🔊 השמע שוב");
      again.onclick = () => RLSpeech.speak(ex.ru);
      actions.appendChild(ok);
      actions.appendChild(again);
      card.appendChild(actions);
      appendSkipAltButton(card);
    }

    function renderAlphabet(card, ex) {
      card.appendChild(el("div", "ex-prompt", ex.promptHe || "למד את האות"));
      if (ex.letter) {
        const big = markTarget(el("div", "ru-big"));
        big.style.fontSize = "5.2rem";
        big.style.lineHeight = "1.3";
        big.textContent = ex.letter;
        card.appendChild(big);
        if (ex.nameHe) card.appendChild(el("div", "he-prompt", escapeHtml(ex.nameHe)));
        if (ex.example) {
          card.appendChild(markTarget(el("div", "ru-big", escapeHtml(ex.example))));
          if (ex.exampleHe) card.appendChild(el("div", "he-prompt", escapeHtml(ex.exampleHe)));
        }
        card.appendChild(ttsButton(ex.example || ex.letter, false));
        scheduleAutoPlay(ex.example || ex.letter);
      }
      if (ex.letters) {
        const grid = el("div", "alpha-grid");
        ex.letters.forEach((L) => {
          const cell = el("button", "alpha-cell");
          cell.type = "button";
          cell.innerHTML =
            '<span class="letter">' +
            escapeHtml(L.ch) +
            '</span><span class="name">' +
            escapeHtml(L.nameHe || "") +
            "</span>";
          const letter = cell.querySelector(".letter");
          if (letter) markTarget(letter);
          cell.onclick = () => {
            grid.querySelectorAll(".alpha-cell").forEach((c) => c.classList.remove("highlight"));
            cell.classList.add("highlight");
            RLSpeech.speak(L.example || L.ch);
          };
          grid.appendChild(cell);
        });
        card.appendChild(grid);
      }
      if (ex.quiz) {
        // which letter makes this sound / matches
        const box = el("div", "choices");
        shuffle(ex.quiz.choices.slice()).forEach((c) => {
          const b = markTarget(el("button", "choice ru", escapeHtml(c.ch || c)));
          b.type = "button";
          b.onclick = () => {
            if (busy) return;
            const ok =
              (typeof c === "object" && c.correct) ||
              c === ex.quiz.answer ||
              (c.ch && c.ch === ex.quiz.answer);
            if (ok) {
              b.classList.add("correct");
              succeed();
            } else {
              b.classList.add("wrong");
              failAndMaybeRetry(mixedText("האות: ", targetText(ex.quiz.answer)), () => render());
            }
          };
          box.appendChild(b);
        });
        card.appendChild(box);
      } else {
        const check = el("div", "check-row");
        const btn = el("button", "btn btn-primary", "המשך");
        btn.onclick = () => {
          if (busy) return;
          succeed();
        };
        check.appendChild(btn);
        card.appendChild(check);
      }
    }

    // kick off
    render();

    return {
      destroy() {
        RLSpeech.stop();
        feedback.remove();
      },
    };
  }

  global.RLEngine = { runLesson, shuffle, prepareExercises, RAMP_TABLE, _ramp: () => ramp, _dlg: { applyDialogueBank, dlgReplyPick, dlgLevelOf, dlgThemeOf } };
})(window);
