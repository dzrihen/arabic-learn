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

  function showTranslit() {
    return !!(RLProgress.get().settings && RLProgress.get().settings.translit);
  }

  function translitLine(t) {
    if (!t || !showTranslit()) return null;
    const d = el("div", "translit", t);
    return d;
  }

  /**
   * Run a lesson. container is the mount point.
   * callbacks: { onProgress(i,total), onComplete({xp,perfect,mistakes}), onExit() }
   */
  function runLesson(lesson, container, callbacks) {
    const exercises = lesson.exercises || [];
    let idx = 0;
    let mistakes = 0;
    let hearts = 5;
    let busy = false;

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
      feedback.querySelector(".fb-detail").textContent = detail || "";
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

    function succeed(detail) {
      try {
        if (global.RLSrs && exercises[idx]) RLSrs.trackExerciseResult(exercises[idx], true);
      } catch (e) {}
      const exNow = exercises[idx];
      showFeedback(true, detail || "", () => {
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

    function ttsButton(text, showText) {
      const wrap = el("div", "tts-wrap");
      const btn = el("button", "tts-btn tts-replay");
      btn.type = "button";
      btn.setAttribute("aria-label", "השמע שוב");
      btn.innerHTML = showText
        ? '<span class="tts-ico">🔊</span><span class="ru-text">' + escapeHtml(text) + "</span>"
        : '<span class="tts-ico">🔊</span><span class="tts-label">השמע שוב</span>';
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
      setTimeout(() => {
        RLSpeech.autoPlay(text).then((r) => {
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
            succeed(ex.ru + " = " + c.he);
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
      card.appendChild(ttsButton(ex.ru, false));
      scheduleAutoPlay(ex.ru);
      const words = ex.words || ex.ru.split(/\s+/);
      const answer = el("div", "chip-answer");
      const bank = el("div", "chip-bank");
      const picked = [];
      const shuffled = shuffle(words.map((w, i) => ({ w, i })));

      function sync() {
        answer.innerHTML = "";
        picked.forEach((p, pi) => {
          const c = el("button", "chip", escapeHtml(p.w));
          c.type = "button";
          c.onclick = () => {
            picked.splice(pi, 1);
            sync();
            rebuildBank();
          };
          answer.appendChild(c);
        });
      }

      function rebuildBank() {
        bank.innerHTML = "";
        shuffled.forEach((item) => {
          const used = picked.some((p) => p === item);
          const c = el("button", "chip" + (used ? " used" : ""), escapeHtml(item.w));
          c.type = "button";
          if (!used) {
            c.onclick = () => {
              picked.push(item);
              sync();
              rebuildBank();
            };
          }
          bank.appendChild(c);
        });
      }

      sync();
      rebuildBank();
      card.appendChild(answer);
      card.appendChild(bank);

      const check = el("div", "check-row");
      const btn = el("button", "btn btn-primary", "בדיקה");
      btn.onclick = () => {
        if (busy) return;
        const got = picked.map((p) => p.w).join(" ");
        const expect = words.join(" ");
        if (got === expect || got === ex.ru) succeed(ex.ru);
        else failAndMaybeRetry("המשפט: " + ex.ru, () => {
          picked.length = 0;
          sync();
          rebuildBank();
        });
      };
      check.appendChild(btn);
      card.appendChild(check);
    }

    function renderSentenceBuild(card, ex) {
      card.appendChild(el("div", "ex-prompt", "בנה את המשפט ביוונית"));
      card.appendChild(el("div", "he-prompt", escapeHtml(ex.he)));
      const words = ex.words || [];
      const distractors = ex.distractors || [];
      const answer = el("div", "chip-answer");
      const bank = el("div", "chip-bank");
      const pool = shuffle(words.concat(distractors).map((w, i) => ({ w, i, id: w + "_" + i })));
      const picked = [];

      function sync() {
        answer.innerHTML = "";
        picked.forEach((p, pi) => {
          const c = el("button", "chip", escapeHtml(p.w));
          c.type = "button";
          c.onclick = () => {
            picked.splice(pi, 1);
            sync();
            rebuildBank();
          };
          answer.appendChild(c);
        });
      }
      function rebuildBank() {
        bank.innerHTML = "";
        pool.forEach((item) => {
          const used = picked.some((p) => p.id === item.id);
          const c = el("button", "chip" + (used ? " used" : ""), escapeHtml(item.w));
          c.type = "button";
          if (!used) {
            c.onclick = () => {
              picked.push(item);
              sync();
              rebuildBank();
            };
          }
          bank.appendChild(c);
        });
      }
      sync();
      rebuildBank();
      card.appendChild(answer);
      card.appendChild(bank);
      const check = el("div", "check-row");
      const btn = el("button", "btn btn-primary", "בדיקה");
      btn.onclick = () => {
        if (busy) return;
        const got = picked.map((p) => p.w).join(" ");
        const expect = words.join(" ");
        const alt = (ex.accepted || []).concat([expect, ex.ru].filter(Boolean));
        if (alt.some((a) => a === got)) {
          if (RLProgress.get().settings.sound !== false) RLSpeech.speak(ex.ru || expect);
          succeed(ex.ru || expect);
        } else {
          failAndMaybeRetry("המשפט: " + (ex.ru || expect), () => {
            picked.length = 0;
            sync();
            rebuildBank();
          });
        }
      };
      check.appendChild(btn);
      card.appendChild(check);
    }

    function renderTranslate(card, ex) {
      // Chip-based translate for mobile
      renderSentenceBuild(card, {
        he: ex.he,
        words: ex.words || (ex.ru ? ex.ru.split(/\s+/) : []),
        distractors: ex.distractors || [],
        ru: ex.ru,
        accepted: ex.accepted,
        tip: ex.tip,
      });
      // override prompt
      const prompt = card.querySelector(".ex-prompt");
      if (prompt) prompt.textContent = "תרגם לעברית → יוונית";
    }

    function renderDialogue(card, ex) {
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
            const b = el("div", "bubble " + (t.speaker === "user" ? "b" : "a"), escapeHtml(t.ru));
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
          const b = el("button", "choice ru", escapeHtml(o.ru));
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
              failAndMaybeRetry("השורה: " + correct.ru, showChoices);
            }
          };
          choicesBox.appendChild(b);
        });
      }
      showChoices();
    }

    function renderFillBlank(card, ex) {
      card.appendChild(el("div", "ex-prompt", "השלם את החסר"));
      const sentence = el("div", "ru-big");
      const parts = (ex.sentence || "").split("___");
      sentence.innerHTML =
        escapeHtml(parts[0] || "") +
        '<span style="color:var(--blue)">____</span>' +
        escapeHtml(parts[1] || "");
      card.appendChild(sentence);
      if (ex.he) card.appendChild(el("div", "he-prompt", escapeHtml(ex.he)));
      const opts = shuffle((ex.options || []).slice());
      const box = el("div", "choices");
      opts.forEach((o) => {
        const label = typeof o === "string" ? o : o.ru;
        const ok = typeof o === "string" ? o === ex.answer : !!o.correct;
        const b = el("button", "choice ru", escapeHtml(label));
        b.type = "button";
        b.onclick = () => {
          if (busy) return;
          if (ok || label === ex.answer) {
            b.classList.add("correct");
            const full = (ex.sentence || "").replace("___", ex.answer || label);
            RLSpeech.speak(full);
            succeed(full);
          } else {
            b.classList.add("wrong");
            failAndMaybeRetry("התשובה: " + ex.answer, () => render());
          }
        };
        box.appendChild(b);
      });
      card.appendChild(box);
    }

    function renderMatch(card, ex) {
      card.appendChild(el("div", "ex-prompt", "התאם בין יוונית לעברית"));
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
        b.type = "button";
        b.dataset.id = item.id;
        b.dataset.side = item.side;
        b.onclick = () => {
          if (busy || b.classList.contains("matched")) return;
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
      card.appendChild(el("div", "ru-big", escapeHtml(ex.ru)));
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
            succeed("שמעתי: " + res.transcript);
          } else if (res.ok) {
            failAndMaybeRetry("שמעתי: " + res.transcript + " — נסה שוב או אשר ידנית", null);
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
        succeed(ex.ru);
      };
      const again = el("button", "btn btn-ghost", "🔊 השמע שוב");
      again.onclick = () => RLSpeech.speak(ex.ru);
      actions.appendChild(ok);
      actions.appendChild(again);
      card.appendChild(actions);
    }

    function renderAlphabet(card, ex) {
      card.appendChild(el("div", "ex-prompt", ex.promptHe || "למד את האות"));
      if (ex.letter) {
        const big = el("div", "ru-big");
        big.style.fontSize = "4rem";
        big.textContent = ex.letter;
        card.appendChild(big);
        if (ex.nameHe) card.appendChild(el("div", "he-prompt", escapeHtml(ex.nameHe)));
        if (ex.example) {
          card.appendChild(el("div", "ru-big", escapeHtml(ex.example)));
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
          const b = el("button", "choice ru", escapeHtml(c.ch || c));
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
              failAndMaybeRetry("האות: " + ex.quiz.answer, () => render());
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
