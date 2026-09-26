# -*- coding: utf-8 -*-
"""Pre-generate Palestinian Arabic MP3 clips via edge-tts.
Voice: ar-JO-SanaNeural (Jordanian Levantine — closest available to Palestinian).
No ar-PS voice in edge-tts; JO/LB/SY are Levantine family. Content text stays Palestinian dialect.
"""
import asyncio, json, pathlib, sys
try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts missing")

ROOT = pathlib.Path(__file__).resolve().parents[1]
JOBS = json.loads((ROOT / "scripts/_audio_jobs.json").read_text(encoding="utf-8"))
VOICE = "ar-JO-SanaNeural"  # Levantine (Jordan) — closest to Palestinian
# Alternatives considered: ar-LB-LaylaNeural, ar-SY-AmanyNeural (also Levantine; no ar-PS in Edge).
CONCURRENCY = 8

def normalize_ar(text: str) -> str:
    import re
    s = (text or "").strip()
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ٱ", "ا")
    s = s.replace("ى", "ي")
    s = re.sub(r"[\u0590-\u05FF]+", " ", s)  # Hebrew
    s = re.sub(r"[\u0370-\u03FF\u1F00-\u1FFF]+", " ", s)  # Greek
    s = re.sub(r"\s+", " ", s).strip()
    return s


async def one(sem, job, manifest):
    path = ROOT / job["path"]
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 200:
        manifest[job["hash"]] = job["path"]
        return "skip"
    async with sem:
        try:
            comm = edge_tts.Communicate(normalize_ar(job["text"]), VOICE, rate="-8%")
            await comm.save(str(path))
            if path.exists() and path.stat().st_size > 200:
                manifest[job["hash"]] = job["path"]
                return "ok"
            return "empty"
        except Exception as e:
            return f"err:{e}"

async def main():
    sem = asyncio.Semaphore(CONCURRENCY)
    manifest = {}
    man_path = ROOT / "audio" / "manifest.json"
    if man_path.exists():
        try:
            manifest.update(json.loads(man_path.read_text(encoding="utf-8")))
        except Exception:
            pass
    results = {"ok": 0, "skip": 0, "empty": 0, "err": 0}
    total = len(JOBS)
    for i in range(0, total, 40):
        chunk = JOBS[i : i + 40]
        outs = await asyncio.gather(*[one(sem, j, manifest) for j in chunk])
        for o in outs:
            if o == "ok": results["ok"] += 1
            elif o == "skip": results["skip"] += 1
            elif o == "empty": results["empty"] += 1
            else: results["err"] += 1
        print(f"progress {min(i+40,total)}/{total} {results}", flush=True)
        man_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("DONE", results, "manifest", len(manifest), "voice", VOICE)

if __name__ == "__main__":
    asyncio.run(main())
