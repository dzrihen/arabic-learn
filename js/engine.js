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

  function showTranslit() {
    return !!(RLProgress.get().settings && RLProgress.get().settings.translit);
  }

  function translitLine(t) {
    if (!t || !showTranslit()) return null;
    const d = el("div", "translit", t);
    return d;
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

  function wordHeTranslits(ex, words) {
    const w = words || [];
    if (!w.length) return [];
    if (Array.isArray(ex.heTranslit) && ex.heTranslit.length === w.length) return ex.heTranslit.slice();
    if (Array.isArray(ex.wordsHeTranslit) && ex.wordsHeTranslit.length === w.length) {
      return ex.wordsHeTranslit.slice();
    }
    const latin = ex && ex.translit ? String(ex.translit).trim() : "";
    if (latin) {
      const clean = latin.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.,!?;:]+$/g, ""));
      if (clean.length === w.length) return clean.map(latinToHe);
    }
    return w.map(faLettersToHe);
  }

  function makeChipEl(word, heTl, extraClass) {
    const c = markTarget(el("button", "chip" + (extraClass ? " " + extraClass : "")));
    c.type = "button";
    const faSpan = el("span", "chip-fa");
    faSpan.textContent = word == null ? "" : String(word);
    c.appendChild(faSpan);
    if (heTl && showTranslit()) {
      const he = el("span", "chip-he-tl");
      he.textContent = heTl;
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

  function runLesson(lesson, container, callbacks) {
    // Shallow-copy slots so in-place skip swaps do not mutate lesson data permanently
    let exercises = (lesson.exercises || []).map(function (ex) {
      return Object.assign({}, ex);
    });
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
          busy = false;
          onNext();
        };
      } else if (easy) {
        easy.style.display = "none";
        easy.onclick = null;
      }
      btn.onclick = () => {
        feedback.classList.remove("show");
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
      const hint = el("div", "tts-hint", "לחצו אם השמע הושתק");
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
      const alt = alternateForListening(cur);
      if (alt.type === cur.type) return; // not a listening type
      exercises[idx] = alt;
      render();
    }

    function appendSkipAltButton(card) {
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
        if (!Object.prototype.hasOwnProperty.call(heByWord, w)) heByWord[w] = faLettersToHe(w);
      });

      function tlFor(item) {
        if (item && item.correctIdx != null) return heMap[item.correctIdx] || faLettersToHe(item.w);
        return heByWord[item.w] || faLettersToHe(item.w);
      }

      // TTS row: full replay + word-by-word
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

      const wbwWrap = el("div", "tts-wrap tts-wbw-wrap");
      const wbwBtn = el("button", "tts-btn tts-wbw");
      wbwBtn.type = "button";
      wbwBtn.setAttribute("aria-label", "מילה־מילה");
      wbwBtn.innerHTML =
        '<span class="tts-ico">🐢</span><span class="tts-label">מילה־מילה 🐢</span>';
      const wbwHint = el("div", "tts-hint", "השמעה איטית מילה־מילה");
      wbwBtn.onclick = () => {
        if (!words.length) return;
        if (RLSpeech.unlockAudio) RLSpeech.unlockAudio();
        RLSpeech.stop();
        slotEls.forEach((s) => s.classList.remove("active"));
        wbwBtn.classList.add("playing");
        wbwHint.classList.remove("warn");
        wbwHint.textContent = "משמיע מילה־מילה…";
        const rate = 0.72;
        RLSpeech.speakTurns(words, 500, {
          rate: rate,
          onTurn: function (i) {
            slotEls.forEach((s, j) => s.classList.toggle("active", j === i));
          },
          onDone: function (ok) {
            wbwBtn.classList.remove("playing");
            slotEls.forEach((s) => s.classList.remove("active"));
            wbwHint.textContent = ok ? "השמעה איטית מילה־מילה" : "נעצר — אפשר לנסות שוב";
          },
        });
      };
      // Full-sentence button should cancel word-by-word (speak already stops)
      const fullBtn = card.querySelector(".tts-replay");
      if (fullBtn) {
        const prev = fullBtn.onclick;
        fullBtn.onclick = function (ev) {
          slotEls.forEach((s) => s.classList.remove("active"));
          wbwBtn.classList.remove("playing");
          if (typeof prev === "function") prev.call(fullBtn, ev);
        };
      }
      if (words.length > 1) {
        wbwWrap.appendChild(wbwBtn);
        wbwWrap.appendChild(wbwHint);
        card.appendChild(wbwWrap);
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
          const he = dialogueTranslation(turn);
          if (he) row.appendChild(el("div", "dialogue-summary-he", he));
          summary.appendChild(row);
        });
        card.appendChild(summary);
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
            (ex.distractors || []).slice(0, 3).map((d) => ({ ru: d, ok: false }))
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

  global.RLEngine = { runLesson, shuffle };
})(window);
