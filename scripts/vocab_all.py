# -*- coding: utf-8 -*-
"""Merged Palestinian Arabic lemma bank loader."""
def load_bank():
    from vocab_entries import ENTRIES
    items = []
    seen = set()
    for t in ENTRIES:
        if len(t) == 5:
            lem, he, pos, theme, cefr = t
        else:
            continue
        k = lem.strip()
        if not k or k in seen:
            continue
        seen.add(k)
        items.append({"lemma": lem, "he": he, "pos": pos, "theme": theme, "cefr": cefr})
    return items

if __name__ == "__main__":
    b = load_bank()
    print(len(b))
