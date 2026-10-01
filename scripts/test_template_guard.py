# -*- coding: utf-8 -*-
"""Dry-run the curriculum generator in memory (no files written) and assert
that it emits no legacy slot-template nonsense.  python3 scripts/test_template_guard.py"""
import os, sys, re, collections
sys.path.insert(0, os.path.dirname(__file__))
import template_guard as G
import generate_curriculum as GC
from vocab_all import load_bank
from vocab_bank import LemmaTracker, generate_lemma_sentences, natural_rows_for_lemma

bank = load_bank()
by_lemma = {}
for x in bank:
    by_lemma.setdefault(G.norm(x["lemma"]), x)

bad, rows_seen = collections.Counter(), 0
safe_forms = set()
for lem in G.SAFE_NOUNS:
    for t in G.TEMPLATES:
        r = G.render(t[0], lem)
        if r:
            safe_forms.add(r[0])

import purge_template_sentences as PT
CURATED = PT.curated_set()  # hand-written seeds / packs / everyday pools

def check(ru, he):
    global rows_seen
    rows_seen += 1
    if ru in safe_forms or ru in CURATED:
        return
    c = G.classify_legacy(ru, he, by_lemma)
    if c and c[1] != "retired template (off-topic filler)" and not c[1].startswith("retired template"):
        bad[(ru, he, c[1])] += 1
    if G.HE_BROKEN_RE.search(he or ""):
        bad[(ru, he, "broken hebrew")] += 1
    if G.PLACEHOLDER_RE.search(ru) and " " in ru and len(ru.split()) > 1 and any(ch.isdigit() for ch in ru):
        bad[(ru, he, "placeholder")] += 1

tracker = LemmaTracker(bank)
for _ in range(60):
    for ru, he in generate_lemma_sentences(tracker, cefr=("a1", "a2", "b1"), count=8):
        check(ru, he)
for u in bank:
    for ru, he in natural_rows_for_lemma(u):
        check(ru, he)
for f in ("seeds_a1", "seeds_a2"):
    for uid, th, tr, curated, tip, trows in getattr(GC, f)():
        for ru, he in GC.curated_plus_vocab(LemmaTracker(bank), curated, ("a1", "a2"), None, trows, uid=uid):
            check(ru, he)
print("rows checked:", rows_seen, "| bad:", sum(bad.values()))
for k, v in list(bad.items())[:20]:
    print("  BAD", k, v)
sys.exit(1 if bad else 0)
