/* Hebrew transliteration helper (copied from js/engine.js for stories/chat) */
(function (global) {
// --- Hebrew transliteration for whole sentences (curated map + letter fallback) ---
  function sentenceHeTranslit(text) {
    return String(text || "").replace(/؟/g, "?").replace(/،/g, ",").split(/\s+/).map(function (tok) {
      const core = tok.replace(/^[«»"'()\[\].,!?؛:…\-]+|[«»"'()\[\].,!?؛:…\-]+$/g, "");
      if (!core) return tok.replace(/[^?!,]/g, "");
      const tail = (tok.slice(tok.lastIndexOf(core) + core.length).match(/[?!,]/) || [""])[0];
      return (lookupHeTranslit(core) || faLettersToHe(core)) + tail;
    }).filter(Boolean).join(" ");
  }

  
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

  global.RLHeTl = function (text) { return sentenceHeTranslit(text); };
})(window);
