# -*- coding: utf-8 -*-
"""Exercise builders for Palestinian Arabic curriculum generation."""
import random

def words_of(ru: str):
    s = (ru or "")
    for ch in ["?", "!", ".", ",", "·", ";", "؟", "،", "؛", "…", "«", "»", "ـ"]:
        s = s.replace(ch, " ")
    return [w for w in s.split() if w]

WRONG_POOL = [
    "אני רעב", "מחר נלך", "זה יקר מדי", "הוא לא בבית", "יש לי כלב",
    "האוטובוס מאחר", "אני לא מבין", "תודה רבה", "בוקר טוב", "לילה טוב",
    "איפה השירותים", "כמה זה עולה", "אני גר בתל אביב", "היא מורה",
    "מזג האוויר חם", "אני אוהב קפה", "בוא נלך הביתה", "סליחה על האיחור",
    "יש לי שאלה", "אפשר בבקשה", "אני עייף היום", "הרכבת יצאה",
    "אנחנו לומדים ערבית פלסטינית", "היא קוראת ספר", "הם עובדים יחד", "זה קרוב מכאן",
    "אני צריך עזרה", "בואו נשב כאן", "החנות סגורה", "מחר יש מבחן",
]

DISTRACTORS_RU = [
    "و", "بس", "كتير", "لسا", "فقط", "هون", "هناك",
    "هلق", "بعدين", "دايماً", "أبداً", "يمكن", "لازم", "بقدر",
    "بيت", "مدينة", "شغل", "ساعة", "يوم", "صبح", "ليل",
]

def pick_wrong(correct_he, n=3, rng=None):
    rng = rng or random.Random(0)
    pool = [w for w in WRONG_POOL if w != correct_he]
    rng.shuffle(pool)
    out = pool[:n]
    while len(out) < n:
        out.append("לא נכון")
    return out

def listen_choice(ru, he, wrong, translit=None, tip=None):
    choices = [{"he": he, "correct": True}] + [{"he": w, "correct": False} for w in wrong[:3]]
    ex = {"type": "listen_choice", "ru": ru, "choices": choices}
    if translit: ex["translit"] = translit
    if tip: ex["tip"] = tip
    return ex

def listen_order(ru, tip=None):
    ex = {"type": "listen_order", "ru": ru, "words": words_of(ru)}
    if tip: ex["tip"] = tip
    return ex

def sentence_build(he, ru, distractors=None, tip=None):
    ex = {"type": "sentence_build", "he": he, "ru": ru, "words": words_of(ru),
          "distractors": distractors or []}
    if tip: ex["tip"] = tip
    return ex

def translate(he, ru, distractors=None, tip=None):
    ex = {"type": "translate_he_ru", "he": he, "ru": ru, "words": words_of(ru),
          "distractors": distractors or []}
    if tip: ex["tip"] = tip
    return ex

def fill_blank(sentence, answer, options, he=None, tip=None):
    opts = []
    for o in options:
        if isinstance(o, dict):
            opts.append(o)
        else:
            opts.append({"ru": o, "correct": o == answer})
    if not any(o.get("correct") for o in opts):
        opts.append({"ru": answer, "correct": True})
    ex = {"type": "fill_blank", "sentence": sentence, "answer": answer, "options": opts}
    if he: ex["he"] = he
    if tip: ex["tip"] = tip
    return ex

def match_pairs(pairs, tip=None):
    ex = {"type": "match_pairs", "pairs": pairs}
    if tip: ex["tip"] = tip
    return ex

def speak_repeat(ru, he=None, translit=None, tip=None):
    ex = {"type": "speak_repeat", "ru": ru}
    if he: ex["he"] = he
    if translit: ex["translit"] = translit
    if tip: ex["tip"] = tip
    return ex

def dialogue(turns, distractors, tip=None):
    ex = {"type": "dialogue", "turns": turns, "distractors": distractors}
    if tip: ex["tip"] = tip
    return ex

def alphabet_intro(letter, name_he, example, example_he, tip=None):
    ex = {"type": "alphabet", "letter": letter, "nameHe": name_he,
          "example": example, "exampleHe": example_he}
    if tip: ex["tip"] = tip
    return ex

def alphabet_quiz(prompt_he, answer, choices, tip=None):
    ch = [{"ch": c, "correct": c == answer} for c in choices]
    ex = {"type": "alphabet", "promptHe": prompt_he, "quiz": {"answer": answer, "choices": ch}}
    if tip: ex["tip"] = tip
    return ex

def lesson(lid, level, unit_id, title_he, title_ru, exercises, xp=15, checkpoint=False):
    out = {"id": lid, "level": level, "unitId": unit_id, "titleHe": title_he,
           "titleRu": title_ru, "xp": xp, "exercises": exercises}
    if checkpoint:
        out["checkpoint"] = True
    return out

def exercises_from_phrases(phrases, grammar_tip=None, include_dialogue=None, bias="balanced", rng=None):
    rng = rng or random.Random(hash(phrases[0]["ru"]) % 10_000)
    exs = []
    n = len(phrases)

    def P(i):
        return phrases[i % n]

    p0 = P(0)
    exs.append(listen_choice(p0["ru"], p0["he"], pick_wrong(p0["he"], rng=rng), p0.get("translit"), grammar_tip))

    if bias in ("balanced", "listen") or n > 1:
        exs.append(listen_order(P(1)["ru"]))

    p = P(2)
    dist = list(p.get("distractors") or rng.sample(DISTRACTORS_RU, min(4, len(DISTRACTORS_RU))))
    exs.append(sentence_build(p["he"], p["ru"], dist))

    p = P(3)
    exs.append(translate(p["he"], p["ru"], rng.sample(DISTRACTORS_RU, 3)))

    filled = False
    for p in phrases:
        if p.get("blank"):
            exs.append(fill_blank(p["blank"], p["answer"], p["options"], p.get("he"), p.get("tip")))
            filled = True
            break
    if not filled:
        ws = words_of(P(0)["ru"])
        if len(ws) >= 2:
            ans = ws[-1]
            sent = " ".join(ws[:-1] + ["___"])
            opts = [ans] + rng.sample([d for d in DISTRACTORS_RU if d != ans], 3)
            exs.append(fill_blank(sent, ans, opts, P(0)["he"]))

    pairs = [{"ru": x["ru"], "he": x["he"]} for x in phrases[:4]]
    if len(pairs) >= 3:
        exs.append(match_pairs(pairs))

    exs.append(speak_repeat(P(1)["ru"], P(1)["he"], P(1).get("translit")))

    if include_dialogue:
        exs.append(include_dialogue)
    elif n >= 4 and rng.random() < 0.55:
        turns = [
            {"speaker": "npc", "ru": P(0)["ru"]},
            {"speaker": "user", "ru": P(1)["ru"]},
            {"speaker": "npc", "ru": P(2)["ru"]},
            {"speaker": "user", "ru": P(3)["ru"]},
        ]
        dist_d = [P(4)["ru"] if n > 4 else "Δεν ξέρω", P(5)["ru"] if n > 5 else "Πού είναι;", "Ευχαριστώ"]
        exs.append(dialogue(turns, dist_d))

    exs.append(listen_choice(P(4)["ru"], P(4)["he"], pick_wrong(P(4)["he"], rng=rng), P(4).get("translit")))
    exs.append(sentence_build(P(5)["he"], P(5)["ru"], ["ναι", "όχι", "παρακαλώ"]))
    exs.append(speak_repeat(P(-1)["ru"], P(-1)["he"], P(-1).get("translit")))

    if bias == "listen":
        exs.append(listen_order(P(2)["ru"]))
        exs.append(listen_choice(P(3)["ru"], P(3)["he"], pick_wrong(P(3)["he"], rng=rng)))
    elif bias == "speak":
        exs.append(speak_repeat(P(2)["ru"], P(2)["he"], P(2).get("translit")))
        exs.append(speak_repeat(P(4)["ru"], P(4)["he"], P(4).get("translit")))
    elif bias == "build":
        exs.append(sentence_build(P(1)["he"], P(1)["ru"], rng.sample(DISTRACTORS_RU, 3)))
        exs.append(translate(P(2)["he"], P(2)["ru"], rng.sample(DISTRACTORS_RU, 3)))

    if n > 2:
        exs.append(listen_order(P(2)["ru"]))

    return exs[:14]

def checkpoint_exercises(phrases, tip=None):
    rng = random.Random(len(phrases) * 17 + 3)
    exs = []
    for i, p in enumerate(phrases[:6]):
        if i % 2 == 0:
            exs.append(listen_choice(p["ru"], p["he"], pick_wrong(p["he"], rng=rng), p.get("translit"), tip if i == 0 else None))
        else:
            exs.append(sentence_build(p["he"], p["ru"], rng.sample(DISTRACTORS_RU, 3)))
    for p in phrases[:3]:
        exs.append(speak_repeat(p["ru"], p["he"], p.get("translit")))
    if len(phrases) >= 4:
        turns = [
            {"speaker": "npc", "ru": phrases[0]["ru"]},
            {"speaker": "user", "ru": phrases[1]["ru"]},
            {"speaker": "npc", "ru": phrases[2]["ru"]},
            {"speaker": "user", "ru": phrases[3]["ru"]},
        ]
        exs.append(dialogue(turns, ["Δεν καταλαβαίνω", "Επαναλάβετε, παρακαλώ", "Πού είναι η έξοδος;"]))
    for p in phrases[3:6]:
        exs.append(listen_order(p["ru"]))
    return exs[:12]

def make_unit_lessons(level, unit_id, unit_idx, lesson_specs, start_num=1):
    lessons = []
    for i, spec in enumerate(lesson_specs):
        title_he, title_ru, phrases = spec[0], spec[1], spec[2]
        tip = spec[3] if len(spec) > 3 else None
        dlg = spec[4] if len(spec) > 4 else None
        bias = spec[5] if len(spec) > 5 else "balanced"
        is_cp = bool(spec[6]) if len(spec) > 6 else False
        lid = f"{level.lower()}-u{unit_idx:02d}-l{start_num + i:02d}"
        if is_cp:
            exs = checkpoint_exercises(phrases, tip or "שער חזרה — עברו כדי להמשיך")
            lessons.append(lesson(lid, level, unit_id, title_he, title_ru, exs, xp=20, checkpoint=True))
        else:
            exs = exercises_from_phrases(phrases, tip, dlg, bias=bias)
            lessons.append(lesson(lid, level, unit_id, title_he, title_ru, exs, xp=12 + (i % 5)))
    return lessons

def phrases(*rows):
    out = []
    for r in rows:
        d = {"ru": r[0], "he": r[1]}
        if len(r) > 2 and r[2]:
            d["translit"] = r[2]
        if len(r) > 3 and isinstance(r[3], dict):
            d.update(r[3])
        out.append(d)
    return out

def theme_bank(level_prefix, themes):
    units = []
    for uid, the, tru, specs in themes:
        unit_idx = int(uid.split("u")[1])
        lessons = make_unit_lessons(level_prefix, uid, unit_idx, specs)
        units.append({"id": uid, "titleHe": the, "titleRu": tru, "lessons": lessons})
    return units

def write_level_js(path, level_id, title_he, subtitle_he, units):
    import json
    obj = {"id": level_id, "titleHe": title_he, "subtitleHe": subtitle_he, "units": units}
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"/* Auto-generated {level_id} */\n")
        f.write(f"window.RL_LEVEL_{level_id}={raw};\n")
    return path
