# -*- coding: utf-8 -*-
"""Replace Greek-script distractors in curriculum data with Palestinian Arabic tokens."""
import json, re, pathlib, hashlib, random

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

GREEK_RE = re.compile(r"[\u0370-\u03FF\u1F00-\u1FFF]")

# Exact phrase map (common leftover templates from Greek fork)
MAP = {
    "ναι": "أه",
    "όχι": "لا",
    "παρακαλώ": "لو سمحت",
    "Ευχαριστώ": "يسلمو",
    "Δεν ξέρω": "ما بعرفش",
    "Βοηθήστε με": "ساعدوني",
    "Πόσο κάνει;": "قديش بسوى؟",
    "Πού είναι;": "وين؟",
    "Δεν καταλαβαίνω": "مش فاهم",
    "Επαναλάβετε, παρακαλώ": "ممكن تعيد؟",
    "Πού είναι η έξοδος;": "وين المخرج؟",
    "Επαναλάβετε": "ممكن تعيد؟",
}

FALLBACK_POOL = [
    "أه", "لا", "لو سمحت", "يسلمو", "ما بعرفش", "وين؟", "قديش؟",
    "مش", "بس", "كتير", "هون", "هلق", "بعدين", "لازم", "بقدر",
    "بدي", "رح", "عم", "تمام", "يلا", "خلاص", "عندي", "معي",
    "شوي", "مرة", "كمان", "عشان", "ممكن", "آسف", "عفواً",
]

stats = {
    "files": 0,
    "exercises": 0,
    "tokens_replaced": 0,
    "tokens_unmapped": 0,
    "titleRu_fixed": 0,
}


def is_greek(s: str) -> bool:
    return bool(s and GREEK_RE.search(s))


def replace_token(tok: str, used: set, rng: random.Random) -> str:
    if tok in MAP:
        cand = MAP[tok]
    else:
        # Strip Greek entirely if mixed; otherwise pick from pool
        cand = GREEK_RE.sub("", tok).strip()
        if not cand or is_greek(cand):
            cand = None
    if not cand or cand in used or is_greek(cand):
        pool = [p for p in FALLBACK_POOL if p not in used]
        if not pool:
            pool = list(FALLBACK_POOL)
        cand = rng.choice(pool)
        stats["tokens_unmapped"] += 1
    used.add(cand)
    stats["tokens_replaced"] += 1
    return cand


def fix_list(items, rng):
    if not isinstance(items, list):
        return items, False
    changed = False
    used = {x for x in items if isinstance(x, str) and not is_greek(x)}
    out = []
    for x in items:
        if isinstance(x, str) and is_greek(x):
            out.append(replace_token(x, used, rng))
            changed = True
        else:
            out.append(x)
            if isinstance(x, str):
                used.add(x)
    return out, changed


def fix_ex(ex, rng):
    changed = False
    if "distractors" in ex:
        new_d, ch = fix_list(ex["distractors"], rng)
        if ch:
            ex["distractors"] = new_d
            changed = True
    if "words" in ex:
        new_w, ch = fix_list(ex["words"], rng)
        if ch:
            ex["words"] = new_w
            changed = True
    if isinstance(ex.get("ru"), str) and is_greek(ex["ru"]):
        # Should not happen for Arabic curriculum — blank to force review
        ex["ru"] = MAP.get(ex["ru"], "تمام")
        changed = True
        stats["tokens_replaced"] += 1
    opts = ex.get("options")
    if isinstance(opts, list):
        for o in opts:
            if isinstance(o, dict) and isinstance(o.get("ru"), str) and is_greek(o["ru"]):
                o["ru"] = replace_token(o["ru"], set(), rng)
                changed = True
    if changed:
        stats["exercises"] += 1
    return changed


def fix_units(units, seed_key):
    rng = random.Random(int(hashlib.md5(seed_key.encode()).hexdigest()[:8], 16))
    for u in units:
        if isinstance(u.get("titleRu"), str) and is_greek(u["titleRu"]):
            # Έλεγχος N → مراجعة N
            m = re.match(r"Έλεγχος\s+(\d+)", u["titleRu"])
            u["titleRu"] = f"مراجعة {m.group(1)}" if m else "مراجعة"
            stats["titleRu_fixed"] += 1
        for les in u.get("lessons") or []:
            if isinstance(les.get("titleRu"), str) and is_greek(les["titleRu"]):
                m = re.match(r"Έλεγχος\s+(\d+)", les["titleRu"])
                les["titleRu"] = f"مراجعة {m.group(1)}" if m else "مراجعة"
                stats["titleRu_fixed"] += 1
            for ex in les.get("exercises") or []:
                fix_ex(ex, rng)


def dump_js(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def process_part1(path: pathlib.Path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"(/\*.*?\*/\s*window\.RL_LEVEL_\w+=)(.*)", text, re.S)
    if not m:
        raise SystemExit(f"bad part1 format: {path}")
    prefix, body = m.group(1), m.group(2).rstrip().rstrip(";")
    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(body)
    fix_units(obj.get("units") or [], path.name)
    path.write_text(prefix + dump_js(obj) + ";\n", encoding="utf-8")
    stats["files"] += 1


def process_part2(path: pathlib.Path):
    text = path.read_text(encoding="utf-8")
    m = re.match(
        r"(/\*.*?\*/\s*\(function\(\)\{var L=window\.RL_LEVEL_\w+;if\(!L\)return;L\.units=L\.units\.concat\()(\[.*\])(\);\}\)\(\);?\s*)",
        text,
        re.S,
    )
    if not m:
        raise SystemExit(f"bad part2 format: {path}")
    units = json.loads(m.group(2))
    fix_units(units, path.name)
    path.write_text(m.group(1) + dump_js(units) + m.group(3).rstrip() + "\n", encoding="utf-8")
    stats["files"] += 1


def main():
    for p in sorted(DATA.glob("*-part1.js")):
        process_part1(p)
        print("fixed", p.name)
    for p in sorted(DATA.glob("*-part2.js")):
        process_part2(p)
        print("fixed", p.name)
    # Also scan other data js for greek distractors via regex (grammar etc.)
    for p in sorted(DATA.glob("*.js")):
        if "-part" in p.name:
            continue
        t = p.read_text(encoding="utf-8")
        if not GREEK_RE.search(t):
            continue
        # grammar.js is one assignment
        m = re.match(r"(window\.\w+=)(.*)", t, re.S)
        if not m:
            print("SKIP greek in", p.name)
            continue
        body = m.group(2).rstrip().rstrip(";")
        decoder = json.JSONDecoder()
        obj, _ = decoder.raw_decode(body)
        if "units" in obj:
            fix_units(obj["units"], p.name)
            p.write_text(m.group(1) + dump_js(obj) + ";\n", encoding="utf-8")
            stats["files"] += 1
            print("fixed", p.name)
        else:
            print("SKIP structure", p.name)
    print("STATS", json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    main()
