# -*- coding: utf-8 -*-
"""TTS-only respelling of Palestinian colloquial Arabic (display text untouched).
ق→ʔ (أ/ئ/ء), ث→ت/س, ذ→د/ز, ظ→ض/ز, using scripts/tts_respell_ar.json (+ defaults for unknown words)."""
import json, pathlib, re
_D = json.loads((pathlib.Path(__file__).with_name("tts_respell_ar.json")).read_text(encoding="utf-8"))
WORDS, KEEP = _D["words"], set(_D["keep_q"])
LET = re.compile(r"[\u0621-\u064a\u064b-\u0652\u0670]+")
DIA = re.compile(r"[\u064b-\u0652\u0670]")

def _default(w):
    if w in KEEP: return w
    out = []
    for ch in w:
        out.append({"ق": "X", "ث": "ت", "ذ": "د", "ظ": "ز"}.get(ch, ch))
    return "".join(out)

def _place_hamza(w):
    s = list(w)
    for i, ch in enumerate(s):
        if ch != "X": continue
        nxt = s[i + 1] if i + 1 < len(s) else ""
        if i == 0: s[i] = "أ"
        elif not nxt: s[i] = "ء"
        elif nxt == "ي": s[i] = "ئ"
        else: s[i] = "أ"
    return "".join(s)

def respell_word(tok):
    base = DIA.sub("", tok)
    if not re.search("[قثذظ]", base): return tok
    r = WORDS.get(base) or _default(base)
    return _place_hamza(r)

def respell(text):
    return LET.sub(lambda m: respell_word(m.group(0)), str(text or ""))

if __name__ == "__main__":
    for t in ["شو بدك تشرب؟ قهوة ولا شاي؟", "قديش حق هاد؟ ثلاثين شيكل.", "إذا بدك، بنروح عالقدس بعد الظهر.", "صديقي حقيقي، طريق طويل."]:
        print(t, "→", respell(t))
