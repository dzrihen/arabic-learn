# -*- coding: utf-8 -*-
"""Content validation: parse all level files with node, check structure and
make sure no legacy slot-template sentence survives.
Usage: python3 scripts/validate_content.py [--sample N]"""
import json, os, re, sys, subprocess, collections, random, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import template_guard as G
from exhelpers import words_of
from vocab_all import load_bank
import purge_template_sentences as PT

NODE = r"""
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=process.argv[1];const ctx={window:{}};vm.createContext(ctx);
const files=JSON.parse(fs.readFileSync(path.join(root,'data/files.json')));
for(const lv of Object.keys(files)) for(const f of files[lv]) vm.runInContext(fs.readFileSync(path.join(root,f.split('?')[0]),'utf8'),ctx,{filename:f});
const out={};for(const k of Object.keys(ctx.window)) if(/^RL_LEVEL_[A-C][12]$/.test(k)) out[k]=ctx.window[k];
fs.writeFileSync(process.argv[2],JSON.stringify(out));
"""


def nhe(s):
    return re.sub(r"[\s\.\?!,]+", " ", s or "").strip()


def main():
    n_sample = 30
    if "--sample" in sys.argv:
        n_sample = int(sys.argv[sys.argv.index("--sample") + 1])
    tmp = tempfile.mktemp(suffix=".json")
    subprocess.run(["node", "-e", NODE, str(ROOT), tmp], check=True)
    levels = json.load(open(tmp))
    os.unlink(tmp)
    bank = load_bank()
    by_lemma = {}
    for x in bank:
        by_lemma.setdefault(G.norm(x["lemma"]), x)
    cur = PT.curated_set()
    problems = collections.Counter()
    samples = []
    n_les = n_ex = 0
    pool_he = {}
    for rows in PT.POOLS.values():
        for r in rows:
            pool_he.setdefault(r[0], r[1])
    pools = set(pool_he)
    for k, lv in sorted(levels.items()):
        for u in lv["units"]:
            if not u["lessons"]:
                problems["empty unit"] += 1
            for les in u["lessons"]:
                n_les += 1
                if not les["exercises"]:
                    problems["empty lesson"] += 1
                for e in les["exercises"]:
                    n_ex += 1
                    t = e["type"]
                    for ru, he in PT.ex_rows(e):
                        if ru and ru not in cur and G.classify_legacy(ru, he or "", by_lemma):
                            problems["legacy template sentence survived"] += 1
                        if he and G.HE_BROKEN_RE.search(he):
                            problems["broken hebrew survived"] += 1
                        if ru in pools:
                            samples.append((u["id"], ru, he or pool_he[ru]))
                    if t in ("listen_order", "sentence_build", "translate_he_ru"):
                        if e.get("words") != words_of(e["ru"]):
                            problems[f"{t}: words != tokenized ru"] += 1
                        ws = set(e.get("words") or [])
                        if any(d in ws for d in e.get("distractors") or []):
                            problems[f"{t}: distractor also in words"] += 1
                    if t == "listen_choice":
                        cs = e.get("choices", [])
                        if sum(1 for c in cs if c.get("correct")) != 1:
                            problems["listen_choice: correct count != 1"] += 1
                        hs = [nhe(c["he"]) for c in cs]
                        if len(set(hs)) != len(hs):
                            problems["listen_choice: duplicate choices"] += 1
                    if t == "match_pairs":
                        ps = e.get("pairs", [])
                        if len({p["ru"] for p in ps}) != len(ps) or len({nhe(p["he"]) for p in ps}) != len(ps):
                            problems["match_pairs: duplicate tile"] += 1
                    if t == "fill_blank":
                        opts = e.get("options", [])
                        if sum(1 for o in opts if o.get("correct")) != 1:
                            problems["fill_blank: correct count != 1"] += 1
                        if e.get("answer") not in [o.get("ru") for o in opts]:
                            problems["fill_blank: answer not in options"] += 1
                        if "___" not in (e.get("sentence") or ""):
                            problems["fill_blank: no blank"] += 1
                    if t == "dialogue":
                        users = {x.get("ru") for x in e.get("turns", []) if x.get("speaker") == "user"}
                        if any(d in users for d in e.get("distractors") or []):
                            problems["dialogue: distractor equals a user turn"] += 1
    print(f"parsed OK: {len(levels)} levels, {n_les} lessons, {n_ex} exercises")
    for k, v in sorted(problems.items()):
        print(f"  PROBLEM {k}: {v}")
    if not problems:
        print("  no problems")
    uniq = list(dict.fromkeys(samples))
    random.Random(7).shuffle(uniq)
    print(f"\n{len(uniq)} distinct new (unit, sentence) occurrences in data; sample {n_sample}:")
    for uid, ru, he in uniq[:n_sample]:
        print(f"  [{uid}] {ru}  =  {he}")
    return 1 if problems.get("legacy template sentence survived") or problems.get("empty lesson") else 0


if __name__ == "__main__":
    sys.exit(main())
