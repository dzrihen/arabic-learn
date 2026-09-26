# -*- coding: utf-8 -*-
"""Replace filler vocab units with practical everyday dialogues; add daily packs."""
import json, os, re, sys, random, copy
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from exhelpers import (
    phrases, dialogue, exercises_from_phrases, lesson, listen_choice,
    listen_order, sentence_build, speak_repeat, pick_wrong, words_of, translate, fill_blank, match_pairs,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PACKS = json.loads((Path(__file__).parent / "_practical_packs.json").read_text(encoding="utf-8"))
THEME_HE = {
    "food": "אוכל ושתייה", "travel": "נסיעות ותחבורה", "health": "בריאות",
    "work": "עבודה", "shopping": "קניות", "social": "חברתי",
    "housing": "דיור", "services": "שירותים", "emergency": "חירום",
}
THEME_AR = {
    "food": "أكل", "travel": "سفر", "health": "صحة", "work": "شغل",
    "shopping": "شراء", "social": "اجتماعي", "housing": "سكن",
    "services": "خدمات", "emergency": "طوارئ",
}

def load_level_parts(level):
    low = level.lower()
    p1 = DATA / f"{low}-part1.js"
    p2 = DATA / f"{low}-part2.js"
    s1 = p1.read_text(encoding="utf-8")
    # parse part1 object
    m = re.search(r"window\.RL_LEVEL_\w+=(.*);\s*$", s1, re.S)
    if not m:
        raise SystemExit(f"parse fail {p1}")
    obj = json.loads(m.group(1))
    if p2.exists():
        s2 = p2.read_text(encoding="utf-8")
        m2 = re.search(r"L\.units=L\.units\.concat\((.*)\);\s*\}\)\(\);\s*$", s2, re.S)
        if not m2:
            raise SystemExit(f"parse fail {p2}")
        obj["units"].extend(json.loads(m2.group(1)))
    return obj

def write_level(obj):
    lid = obj["id"]
    low = lid.lower()
    units = obj["units"]
    mid = max(1, len(units)//2)
    part1_units = units[:mid]
    part2_units = units[mid:]
    p1 = {
        "id": lid,
        "titleHe": obj["titleHe"],
        "subtitleHe": obj["subtitleHe"],
        "units": part1_units,
    }
    (DATA / f"{low}-part1.js").write_text(
        f"/* Auto-generated {lid} */\nwindow.RL_LEVEL_{lid}="
        + json.dumps(p1, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    raw = json.dumps(part2_units, ensure_ascii=False, separators=(",", ":"))
    (DATA / f"{low}-part2.js").write_text(
        f"/* Auto-generated {lid} part2 */\n"
        f"(function(){{var L=window.RL_LEVEL_{lid};if(!L)return;L.units=L.units.concat({raw});}})();\n",
        encoding="utf-8",
    )

def practical_exercises(rows, tip, bias="listen"):
    ph = phrases(*[(a, b) for a, b in rows])
    exs = exercises_from_phrases(ph, tip, bias=bias)
    # Ensure dialogue + sentence_build + listen present
    if not any(e.get("type") == "dialogue" for e in exs) and len(rows) >= 4:
        turns = []
        for i, (ru, he) in enumerate(rows[:4]):
            turns.append({"speaker": "npc" if i % 2 == 0 else "user", "ru": ru, "he": he})
        exs.insert(min(7, len(exs)), dialogue(turns, ["بعرفش", "عيد منيح", "وين؟"], tip=tip))
    # boost listen/sentence
    if len(rows) >= 2:
        ru, he = rows[1]
        if not any(e.get("type") == "listen_order" and e.get("ru") == ru for e in exs):
            exs.append(listen_order(ru, tip=tip))
        if not any(e.get("type") == "sentence_build" and e.get("ru") == ru for e in exs):
            exs.append(sentence_build(he, ru, distractors=["أه", "لا", "لو سمحت"], tip=tip))
    return exs

def rebuild_filler_unit(unit, level, theme_cycle, rng):
    """Keep unit/lesson IDs; replace content with practical theme packs."""
    theme = theme_cycle[hash(unit["id"]) % len(theme_cycle)]
    base = list(PACKS[theme])
    # expand by light variants from other themes mixed in
    pool = base[:]
    for t in theme_cycle:
        if t != theme:
            pool.extend(PACKS[t][:3])
    rng.shuffle(pool)
    new_lessons = []
    for i, les in enumerate(unit.get("lessons") or []):
        # take 6-10 rows per lesson
        start = (i * 6) % max(1, len(pool))
        rows = []
        for j in range(8):
            rows.append(pool[(start + j) % len(pool)])
        tip = f"תרגול יומיומי · {THEME_HE[theme]}"
        bias = ["listen", "build", "speak", "balanced"][i % 4]
        exs = practical_exercises(rows, tip, bias=bias)
        new_les = dict(les)
        new_les["titleHe"] = f"{THEME_HE[theme]} · {i+1}"
        new_les["titleRu"] = f"{THEME_AR[theme]} {i+1}"
        new_les["exercises"] = exs
        new_les["xp"] = les.get("xp", 14)
        new_lessons.append(new_les)
    unit = dict(unit)
    unit["titleHe"] = f"יומיומי · {THEME_HE[theme]}"
    unit["titleRu"] = THEME_AR[theme]
    unit["lessons"] = new_lessons
    return unit

def make_new_unit(level, uid_num, theme, n_lessons=7):
    uid = f"{level.lower()}-u{uid_num:02d}"
    pool = list(PACKS[theme])
    # pad
    while len(pool) < n_lessons * 8:
        for t, rows in PACKS.items():
            pool.extend(rows)
            if len(pool) >= n_lessons * 8:
                break
    lessons = []
    for i in range(n_lessons):
        rows = pool[i*6:(i*6)+8] or pool[:8]
        tip = f"תרגול יומיומי · {THEME_HE[theme]}"
        exs = practical_exercises(rows, tip, bias=["listen","build","balanced"][i%3])
        lessons.append(lesson(
            f"{uid}-l{i+1:02d}", level, uid,
            f"{THEME_HE[theme]} · תרגול {i+1}",
            f"{THEME_AR[theme]} {i+1}",
            exs, xp=12 + (i % 5),
        ))
    return {"id": uid, "titleHe": f"יומיומי · {THEME_HE[theme]}", "titleRu": THEME_AR[theme], "lessons": lessons}

def main():
    theme_cycle = list(PACKS.keys())
    rng = random.Random(42)
    totals = {}
    # Add ~35 new lessons per level via u70-u74 (5 units × 7) = 35; 6 levels ≈ 210
    for level in ["A1","A2","B1","B2","C1","C2"]:
        obj = load_level_parts(level)
        new_units = []
        for u in obj["units"]:
            if "אוצר מילים" in (u.get("titleHe") or ""):
                new_units.append(rebuild_filler_unit(u, level, theme_cycle, rng))
            else:
                new_units.append(u)
        # existing max unit nums
        nums = []
        for u in new_units:
            m = re.search(r"-u(\d+)$", u["id"])
            if m: nums.append(int(m.group(1)))
        start = 70
        # skip if already injected
        existing_ids = {u["id"] for u in new_units}
        themes_for_new = theme_cycle[:]
        rng.shuffle(themes_for_new)
        added = 0
        for i, theme in enumerate(themes_for_new[:5]):
            uid_num = start + i
            uid = f"{level.lower()}-u{uid_num:02d}"
            if uid in existing_ids:
                continue
            new_units.append(make_new_unit(level, uid_num, theme, n_lessons=7))
            added += 1
        obj["units"] = new_units
        # mildly update subtitle
        if "יומיומי" not in (obj.get("subtitleHe") or ""):
            obj["subtitleHe"] = (obj.get("subtitleHe") or "") + " · תרגול יומיומי"
        write_level(obj)
        n = sum(len(u["lessons"]) for u in obj["units"])
        totals[level] = n
        print(level, "lessons", n, "added_units", added)

    total = sum(totals.values())
    meta_path = DATA / "meta.js"
    # keep bank sizes from existing meta if present
    old = {}
    try:
        old = json.loads(re.search(r"window\.RL_META=(.*);", meta_path.read_text(encoding="utf-8")).group(1))
    except Exception:
        pass
    meta = {
        "bankSize": old.get("bankSize", 7604),
        "introducedInContent": old.get("introducedInContent", old.get("bankSize", 7604)),
        "lessonCounts": totals,
        "totalLessons": total,
        "conversationThemes": list(PACKS.keys()),
    }
    meta_path.write_text("window.RL_META="+json.dumps(meta, ensure_ascii=False)+";\n", encoding="utf-8")
    print("TOTAL", total, meta)

if __name__ == "__main__":
    main()
