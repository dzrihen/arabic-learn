/* Freer conversation practice mode */
(function (global) {
  "use strict";

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFC")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function fuzzyOk(input, accepted) {
    const a = normalize(input);
    if (!a) return false;
    const list = (accepted || []).map(normalize).filter(Boolean);
    for (const b of list) {
      if (a === b) return true;
      if (a.includes(b) || b.includes(a)) return true;
      const ta = new Set(a.split(" "));
      const tb = b.split(" ");
      const hit = tb.filter((t) => ta.has(t)).length;
      if (tb.length && hit >= Math.ceil(tb.length * 0.6)) return true;
    }
    // also looseMatch via speech helper
    if (global.RLSpeech) {
      for (const b of accepted || []) {
        if (RLSpeech.looseMatch(a, b)) return true;
      }
    }
    return false;
  }

  function scenarios() {
    const root = global.RL_CONVERSATIONS;
    return (root && root.scenarios) || [];
  }

  function byLevel() {
    const map = {};
    scenarios().forEach((s) => {
      (map[s.level] || (map[s.level] = [])).push(s);
    });
    return map;
  }

  /**
   * Run a scenario in container.
   * callbacks: { onExit(), onComplete({xp}) }
   */
  function runScenario(scenario, container, callbacks) {
    callbacks = callbacks || {};
    const steps = scenario.steps || [];
    let stepIdx = 0;
    let xp = 10;

    container.innerHTML = "";
    const wrap = el("div", "lesson-runner conv-runner");
    container.appendChild(wrap);

    const top = el("div", "lesson-top");
    const close = el("button", "close-btn", "✕");
    close.type = "button";
    close.onclick = () => {
      RLSpeech.stop();
      if (callbacks.onExit) callbacks.onExit();
    };
    const bar = el("div", "lesson-progress");
    const fill = el("div", "fill");
    bar.appendChild(fill);
    top.appendChild(close);
    top.appendChild(bar);
    wrap.appendChild(top);

    const stage = el("div", "exercise-stage");
    wrap.appendChild(stage);

    const card = el("div", "exercise-card");
    stage.appendChild(card);
    card.appendChild(el("div", "ex-prompt", escapeHtml(scenario.titleHe)));
    card.appendChild(el("div", "ex-tip", "🎬 " + escapeHtml(scenario.settingHe || "")));
    const thread = el("div", "dialogue-thread");
    card.appendChild(thread);
    const action = el("div", "conv-actions");
    card.appendChild(action);

    function updateBar() {
      const pct = steps.length ? Math.round((stepIdx / steps.length) * 100) : 0;
      fill.style.width = pct + "%";
    }

    function paintThread() {
      thread.innerHTML = "";
      for (let i = 0; i < stepIdx; i++) {
        const st = steps[i];
        if (st.speaker === "npc") {
          thread.appendChild(markTarget(el("div", "bubble a", escapeHtml(st.ru))));
          if (st.he) thread.appendChild(el("div", "bubble-he", escapeHtml(st.he)));
        } else {
          const said = st._said || st.model || "";
          thread.appendChild(markTarget(el("div", "bubble b", escapeHtml(said))));
        }
      }
      thread.scrollTop = thread.scrollHeight;
    }

    function conversationTranslation(step) {
      const direct = step && (step.he || step.hebrew || step.translation || step.heTranslation);
      if (direct) return direct;
      const said = step && (step._said || step.model || step.ru);
      const choice = (step && step.choices || []).find((item) => item && item.ru === said);
      return choice && (choice.he || choice.translation || choice.hebrew);
    }

    function appendConversationSummary() {
      const summary = el("section", "dialogue-summary");
      summary.setAttribute("aria-label", "סיכום השיחה");
      summary.appendChild(el("h3", "dialogue-summary-title", "סיכום השיחה — תרגום לעברית"));
      steps.forEach((step, index) => {
        const row = el("div", "dialogue-summary-row");
        row.dataset.speaker = step.speaker || "";
        row.appendChild(el("div", "dialogue-summary-index", String(index + 1)));
        const said = step.speaker === "npc" ? step.ru : (step._said || step.model || "");
        row.appendChild(markTarget(el("div", "dialogue-summary-target", said)));
        const he = conversationTranslation(step);
        if (he) row.appendChild(el("div", "dialogue-summary-he", he));
        summary.appendChild(row);
      });
      card.appendChild(summary);
    }

    async function advanceNpc() {
      // Batch consecutive NPC lines into speakTurns so they never overlap
      // (old code fired RLSpeech.speak() in a tight loop without awaiting).
      const npcLines = [];
      while (stepIdx < steps.length && steps[stepIdx].speaker === "npc") {
        const st = steps[stepIdx];
        stepIdx++;
        paintThread();
        updateBar();
        if (st.ru) npcLines.push(st.ru);
      }
      if (npcLines.length) {
        await RLSpeech.speakTurns(npcLines, 400);
      }
      if (stepIdx >= steps.length) {
        finish();
        return;
      }
      showUserTurn(steps[stepIdx]);
    }

    function finish() {
      updateBar();
      appendConversationSummary();
      action.innerHTML = "";
      action.appendChild(el("div", "he-prompt", "כל הכבוד! סיימת את השיחה 🎉"));
      const again = el("button", "btn btn-ghost", "🔊 השמע את כל השיחה");
      again.onclick = () => {
        const lines = [];
        steps.forEach((st) => {
          if (st.speaker === "npc") lines.push(st.ru);
          else lines.push(st._said || st.model);
        });
        RLSpeech.speakTurns(lines, 400);
      };
      const done = el("button", "btn btn-primary", "סיום (+" + xp + " XP)");
      done.onclick = () => {
        if (callbacks.onComplete) callbacks.onComplete({ xp: xp });
      };
      action.appendChild(again);
      action.appendChild(done);
    }

    function showFeedback(ok, detail, model) {
      const fb = el("div", "conv-fb " + (ok ? "ok" : "bad"));
      const title = document.createElement("strong");
      title.textContent = ok ? "מעולה!" : "כמעט…";
      fb.appendChild(title);
      fb.appendChild(document.createTextNode(" " + (detail || "")));
      if (model) {
        const modelLine = el("div", "model-ans");
        modelLine.appendChild(document.createTextNode("מודל: "));
        modelLine.appendChild(targetText(model));
        fb.appendChild(modelLine);
      }
      action.appendChild(fb);
      if (model) RLSpeech.speak(model);
    }

    function showUserTurn(st) {
      action.innerHTML = "";
      action.appendChild(el("div", "he-prompt", escapeHtml(st.promptHe || "בחר או כתוב תשובה")));

      // free text
      const free = el("div", "conv-free");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "conv-input ru";
      input.dir = TARGET_DIR;
      input.placeholder = "כתוב תשובה קצרה בערבית…";
      const checkBtn = el("button", "btn btn-blue btn-sm", "בדיקה");
      free.appendChild(input);
      free.appendChild(checkBtn);
      action.appendChild(free);

      if (RLSpeech.canRecognize()) {
        const mic = el("button", "btn btn-ghost btn-sm", "🎤 דבר");
        mic.onclick = async () => {
          mic.disabled = true;
          mic.textContent = "…";
          const res = await RLSpeech.recognizeOnce(6000);
          mic.disabled = false;
          mic.textContent = "🎤 דבר";
          if (res.ok) input.value = res.transcript;
        };
        free.appendChild(mic);
      }

      function accept(text) {
        st._said = text;
        stepIdx++;
        paintThread();
        updateBar();
        setTimeout(advanceNpc, 450);
      }

      checkBtn.onclick = () => {
        const val = input.value.trim();
        if (fuzzyOk(val, st.accepted || [st.model])) {
          showFeedback(true, "תשובה חופשית התקבלה", st.model);
          setTimeout(() => accept(val || st.model), 700);
        } else {
          showFeedback(false, "נסה ניסוח אחר או בחר אפשרות", st.model);
        }
      };

      // pick choices
      const box = el("div", "choices");
      (st.choices || []).forEach((c) => {
        const b = markTarget(el("button", "choice ru", escapeHtml(c.ru)));
        b.type = "button";
        b.onclick = () => {
          if (c.ok) {
            b.classList.add("correct");
            RLSpeech.speak(c.ru);
            accept(c.ru);
          } else {
            b.classList.add("wrong");
            showFeedback(false, "לא מתאים להקשר", st.model);
          }
        };
        box.appendChild(b);
      });
      action.appendChild(box);
      action.appendChild(el("div", "tts-hint", "אפשר לבחור תשובה או לכתוב/לדבר חופשי"));
    }

    // kickoff
    paintThread();
    updateBar();
    setTimeout(advanceNpc, 200);

    return {
      destroy() {
        RLSpeech.stop();
      },
    };
  }

  global.RLConversation = {
    scenarios,
    byLevel,
    runScenario,
    fuzzyOk,
  };
})(window);
