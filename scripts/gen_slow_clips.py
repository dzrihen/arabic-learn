# -*- coding: utf-8 -*-
import unicodedata
"""Generate slow per-word and slow full-sentence MP3s (Levantine voice)."""
import asyncio, json, pathlib, re, sys
try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts missing")

ROOT = pathlib.Path(__file__).resolve().parents[1]
VOICE = "ar-JO-SanaNeural"
WORD_RATE = "-30%"
SENT_RATE = "-35%"
CONCURRENCY = 10

def normalize_ar(text):
    s = unicodedata.normalize("NFC", str(text or ""))
    s = s.replace("\u0649", "\u064a")  # alef maqsura → ye for hashing consistency with speech.js if any
    # Keep speech.js arabic normalize if present — mirror common cleanup
    s = re.sub(r"[\u064b-\u065f\u0670]", "", s)
    s = re.sub(r"[\u200c\u200b\u200d\ufeff\u0640]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def djb2_hex(s):
    h = 5381
    for ch in s:
        h = ((h << 5) + h) ^ ord(ch)
        h &= 0xffffffff
    return format(h, "x")

def text_hash(text):
    return djb2_hex(normalize_ar(text))

async def gen_one(sem, text, path, rate, manifest, keys):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    rel = str(path.relative_to(ROOT)).replace("\\", "/")
    if path.exists() and path.stat().st_size > 200:
        for k in keys:
            manifest[k] = rel
        return "skip"
    async with sem:
        try:
            comm = edge_tts.Communicate(str(text), VOICE, rate=rate)
            await comm.save(str(path))
            if path.exists() and path.stat().st_size > 200:
                for k in keys:
                    manifest[k] = rel
                return "ok"
            return "empty"
        except Exception as e:
            return f"err:{e}"

async def main():
    words = json.loads(pathlib.Path("/tmp/arabic-learn-gen-words.json").read_text(encoding="utf-8"))
    sents = json.loads(pathlib.Path("/tmp/arabic-learn-gen-sents.json").read_text(encoding="utf-8"))
    man_path = ROOT / "audio" / "manifest.json"
    manifest = {}
    if man_path.exists():
        try:
            manifest.update(json.loads(man_path.read_text(encoding="utf-8")))
        except Exception:
            pass

    jobs = []
    seen_h = set()
    for w in words:
        h = text_hash(w)
        if h in seen_h:
            continue
        seen_h.add(h)
        path = ROOT / "audio" / "w" / f"{h}.mp3"
        keys = [h, f"w:{h}", normalize_ar(w), djb2_hex(str(w).strip())]
        jobs.append((w, path, WORD_RATE, keys))

    seen_s = set()
    for s in sents:
        h = text_hash(s)
        if not h or h in seen_s:
            continue
        seen_s.add(h)
        path = ROOT / "audio" / "slow" / f"{h}.mp3"
        keys = [f"slow:{h}", f"slow:{normalize_ar(s)}"]
        jobs.append((s, path, SENT_RATE, keys))

    print(f"jobs={len(jobs)} words≈{len(seen_h)} sents≈{len(seen_s)}", flush=True)
    sem = asyncio.Semaphore(CONCURRENCY)
    results = {"ok": 0, "skip": 0, "empty": 0, "err": 0}
    total = len(jobs)
    for i in range(0, total, 50):
        chunk = jobs[i : i + 50]
        outs = await asyncio.gather(*[
            gen_one(sem, text, path, rate, manifest, keys)
            for text, path, rate, keys in chunk
        ])
        for o in outs:
            if o == "ok":
                results["ok"] += 1
            elif o == "skip":
                results["skip"] += 1
            elif o == "empty":
                results["empty"] += 1
            else:
                results["err"] += 1
                if results["err"] <= 5:
                    print("ERR", o, flush=True)
        print(f"progress {min(i+50,total)}/{total} {results}", flush=True)
        man_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("DONE", results, "manifest", len(manifest), flush=True)

if __name__ == "__main__":
    asyncio.run(main())
