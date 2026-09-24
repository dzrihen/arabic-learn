# -*- coding: utf-8 -*-
from exhelpers import phrases, dialogue

def dlg(*pairs, distractors=None):
    turns = []
    for sp, ru in pairs:
        turns.append({"speaker": "npc" if sp == "n" else "user", "ru": ru})
    return dialogue(turns, distractors or ["Δεν ξέρω", "Επαναλάβετε", "Πού είναι;"])

def chunk_lessons(title_base_he, title_base_ru, all_phrase_rows, per=12, biases=None, tip=None, dialogues=None):
    """Split phrases into denser lessons (little overlap) for ~1800-path pacing."""
    biases = biases or ["listen", "balanced", "speak", "build", "balanced"]
    specs = []
    i = 0
    lesson_i = 0
    n = len(all_phrase_rows)
    step = max(per, 8)  # no overlap — denser unique content per lesson
    while i < n:
        chunk = all_phrase_rows[i:i + per]
        if len(chunk) < 4 and lesson_i > 0:
            break
        if len(chunk) < 4:
            chunk = all_phrase_rows[:per]
        ph = phrases(*chunk)
        bias = biases[lesson_i % len(biases)]
        th = f"{title_base_he} · {lesson_i + 1}"
        tr = f"{title_base_ru} {lesson_i + 1}"
        dlg = None
        if dialogues and lesson_i < len(dialogues):
            dlg = dialogues[lesson_i]
        elif lesson_i % 3 == 1 and len(chunk) >= 4:
            dlg = dialogue(
                [
                    {"speaker": "npc", "ru": chunk[0][0]},
                    {"speaker": "user", "ru": chunk[1][0]},
                    {"speaker": "npc", "ru": chunk[2][0]},
                    {"speaker": "user", "ru": chunk[3][0]},
                ],
                ["Δεν ξέρω", "Βοηθήστε με", "Πόσο κάνει;"],
            )
        specs.append((th, tr, ph, tip, dlg, bias, False))
        lesson_i += 1
        i += step
        if lesson_i > 80:
            break
    return specs

def with_checkpoint(specs, every=10, pool_phrases=None, unit_label="חזרה"):
    out = []
    buf = []
    count = 0
    cp_i = 0
    for spec in specs:
        out.append(spec)
        count += 1
        for p in spec[2]:
            buf.append((p["ru"], p["he"], p.get("translit")))
        if count % every == 0:
            cp_i += 1
            seen = set()
            pool = []
            for row in reversed(buf):
                if row[0] not in seen:
                    seen.add(row[0])
                    pool.append(row)
                if len(pool) >= 8:
                    break
            pool = list(reversed(pool))
            if len(pool) < 6 and pool_phrases:
                pool = pool_phrases[:8]
            if len(pool) >= 6:
                out.append((
                    f"שער {unit_label} {cp_i}",
                    f"Έλεγχος {cp_i}",
                    phrases(*pool),
                    "שער חזרה — חובה לעבור כדי להמשיך",
                    None,
                    "listen",
                    True,
                ))
    return out
