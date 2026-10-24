# -*- coding: utf-8 -*-
"""Regenerate ALL app audio clips with one voice, loudness-normalized, slow clips derived (atempo).

Usage:  python3 scripts/regen_audio.py                 # default voice
        python3 scripts/regen_audio.py --voice fa-IR-DilaraNeural   # voice swap = one command
Options: --only PATH_SUBSTR  --limit N  --dry  --add-missing (after content edits)
Normal clips: edge-tts → loudness to TARGET LUFS.  audio/slow/* and audio/w/*: same clip, atempo=SLOW, then normalized.
Text for each clip comes from the manifest keys (hash of normalized text) matched against data/*.js strings.
"""
import argparse, asyncio, glob, hashlib, json, os, pathlib, re, subprocess, sys, unicodedata, importlib.util
from concurrent.futures import ThreadPoolExecutor
import edge_tts

ROOT = pathlib.Path(__file__).resolve().parents[1]
APP = ROOT.name.replace("-learn", "")
CFG = {"arabic": dict(voice="ar-JO-TaimNeural", rate="-8%"), "persian": dict(voice="fa-IR-FaridNeural", rate="-5%")}[APP]
TARGET, SLOW = -16.0, 0.7
CACHE = pathlib.Path(os.environ.get("RL_TTS_CACHE", "/workspace/_fix/voice/cache")) / APP

spec = importlib.util.spec_from_file_location("g", ROOT / "scripts/gen_slow_clips.py")
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
norm = g.normalize_fa if APP == "persian" else g.normalize_ar
if APP == "arabic":
    sys.path.insert(0, str(ROOT / "scripts")); from ar_respell import respell
else:
    respell = lambda s: s

def djb(s):
    h = 5381
    for ch in s: h = (((h << 5) + h) ^ ord(ch)) & 0xffffffff
    return format(h, "x")

SCRIPT = re.compile(r"[\u0600-\u06ff]")
def candidates():
    out = []  # (priority, text)
    for f in sorted(glob.glob(str(ROOT / "data/*.js"))):
        if f.endswith("he-translit.js"): continue
        t = open(f, encoding="utf-8").read()
        for m in re.finditer(r'"((?:[^"\\]|\\.)*)"', t):
            s = m.group(1)
            if SCRIPT.search(s) and not re.search(r"[\u0590-\u05ff]", s):
                try: s = json.loads('"' + s + '"')
                except Exception: pass
                out.append((0, s))
    for f in glob.glob(str(ROOT / "scripts/*.json")):
        try: j = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        def walk(x):
            if isinstance(x, str):
                if SCRIPT.search(x) and not re.search(r"[\u0590-\u05ff]", x): out.append((1, x))
            elif isinstance(x, dict): [walk(v) for v in x.values()]
            elif isinstance(x, list): [walk(v) for v in x]
        walk(j)
    return out

START = re.compile(r"(window\.RL_\w+=|\.concat\()")
def data_texts():
    """Texts the app can speak: sentences (ru/model/pairs/turns/choices, completed fill_blank) and word chips."""
    sents, words = set(), set()
    def add(s, chip=False):
        if not isinstance(s, str) or not re.search(r"[\u0621-\u064a\u067e-\u06d3]", s) or re.search(r"[\u0590-\u05ff]", s): return
        s = s.strip()
        (words if (chip or len(s.split()) == 1) else sents).add(s)
    def walk(o):
        if isinstance(o, list):
            for x in o: walk(x)
            return
        if not isinstance(o, dict) or o.get("type") == "alphabet": return
        if o.get("type") == "fill_blank" and "___" in o.get("sentence", ""):
            add(o["sentence"].replace("___", o.get("answer", ""), 1))
            for x in o.get("options", []): add(x.get("ru"), True)
        for k in ("ru", "model"): add(o.get(k))
        for k in ("words", "distractors"):
            for x in o.get(k) or []: add(x, True)
        for k, v in o.items():
            if k not in ("words", "distractors", "accepted") and isinstance(v, (dict, list)): walk(v)
    for f in sorted(glob.glob(str(ROOT / "data/*.js"))):
        if not re.search(r"/([abc]\d-part\d|grammar|conversations|dialogues)\.js$", f): continue
        t = open(f, encoding="utf-8").read(); i = 0
        for m in START.finditer(t):
            if m.start() < i: continue
            obj, i = json.JSONDecoder().raw_decode(t, m.end()); walk(obj)
    return sents, words

def add_missing(man):
    """Create manifest entries for spoken texts that have no clip yet (normal + slow for sentences, w: for chips)."""
    sents, words = data_texts(); added = 0
    def has(s, slow=False):
        n = norm(s)
        keys = ("slow:" + djb(n), "slow:" + djb(s), "slow:" + n) if slow else ("w:" + djb(n), "w:" + djb(s), djb(n), djb(s), n, s)
        return any(k in man for k in keys)
    for s in sorted(sents):
        h = djb(norm(s))
        if not has(s): man[h] = f"audio/listen/{h}.mp3"; added += 1
        if not has(s, True): man["slow:" + h] = f"audio/slow/{h}.mp3"; added += 1
    for s in sorted(words):
        h = djb(norm(s))
        if not has(s): man["w:" + h] = f"audio/w/{h}.mp3"; added += 1
    return added, sents | words

def build_map(man, extra=()):
    p2t = {}
    for pri, s in sorted([(-1, x) for x in extra] + candidates(), key=lambda x: x[0]):
        n = norm(s)
        for key in (djb(n), djb(s.strip()), "w:" + djb(n), "slow:" + djb(n), "slow:" + n, "slow:" + s.strip(), s.strip(), n):
            p = man.get(key)
            if p and p not in p2t: p2t[p] = s.strip()
    for k, p in man.items():  # raw-text manifest keys as last resort
        if p not in p2t:
            raw = k[5:] if k.startswith("slow:") else k[2:] if k.startswith("w:") else k
            if SCRIPT.search(raw): p2t[p] = raw
    return p2t

def tts_text(s):
    s = unicodedata.normalize("NFC", s).replace("\u0640", "")
    s = re.sub(r"_{2,}", "…", s)
    return respell(s).strip()

def cache_path(voice, rate, text):
    return CACHE / voice / (hashlib.sha1(f"{rate}|{text}".encode()).hexdigest() + ".mp3")

async def synth_all(jobs, voice, rate):
    sem = asyncio.Semaphore(8); done = [0]
    async def one(text):
        p = cache_path(voice, rate, text)
        if p.exists() and p.stat().st_size > 500: return
        p.parent.mkdir(parents=True, exist_ok=True)
        async with sem:
            for a in range(4):
                try:
                    await edge_tts.Communicate(text, voice, rate=rate).save(str(p) + ".tmp")
                    if os.path.getsize(str(p) + ".tmp") > 500:
                        os.replace(str(p) + ".tmp", p); break
                except Exception as e:
                    await asyncio.sleep(2 + 3 * a)
        done[0] += 1
        if done[0] % 200 == 0: print("tts", done[0], "/", len(jobs), flush=True)
    await asyncio.gather(*[one(t) for t in jobs])

def loudness(path, filt=""):
    af = (filt + "," if filt else "") + "ebur128=framelog=quiet"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", af, "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    return float(m[-1]) if m else None

def render(src, dst, slow):
    filt = f"atempo={SLOW}" if slow else ""
    I = loudness(src, filt)
    gain = 0.0 if (I is None or I < -60) else max(-10.0, min(18.0, TARGET - I))
    af = ",".join(x for x in [filt, f"volume={gain:.2f}dB", "alimiter=limit=0.9:level=disabled"] if x)
    tmp = str(dst) + ".tmp.mp3"
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af", af, "-ar", "24000", "-ac", "1", "-b:a", "48k", tmp], capture_output=True, text=True)
    if r.returncode or os.path.getsize(tmp) < 300: return f"fail {dst}: {r.stderr[-200:]}"
    os.replace(tmp, dst); return None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--voice", default=CFG["voice"]); ap.add_argument("--rate", default=CFG["rate"])
    ap.add_argument("--only", default=""); ap.add_argument("--limit", type=int, default=0); ap.add_argument("--dry", action="store_true")
    ap.add_argument("--add-missing", action="store_true", help="add manifest entries for new texts in data/")
    a = ap.parse_args()
    man = json.loads((ROOT / "audio/manifest.json").read_text(encoding="utf-8"))
    extra = ()
    if a.add_missing:
        added, extra = add_missing(man)
        print("manifest entries added:", added, flush=True)
        if not a.dry:
            (ROOT / "audio/manifest.json").write_text(json.dumps(man, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    p2t = build_map(man, extra)
    paths = sorted(set(man.values()))
    missing = [p for p in paths if p not in p2t]
    paths = [p for p in paths if p in p2t and a.only in p]
    if a.limit: paths = paths[: a.limit]
    print(f"app={APP} voice={a.voice} clips={len(paths)} unmapped={len(missing)}", flush=True)
    if missing: print("unmapped sample:", missing[:5])
    texts = {p: tts_text(p2t[p]) for p in paths}
    json.dump({p: [p2t[p], texts[p]] for p in paths}, open(ROOT / "scripts/_regen_texts.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    if a.dry: return
    asyncio.run(synth_all(sorted(set(texts.values())), a.voice, a.rate))
    fails = []
    def job(p):
        src = cache_path(a.voice, a.rate, texts[p])
        if not src.exists(): return f"nocache {p}"
        kind = p.split("/")[1]
        (ROOT / p).parent.mkdir(parents=True, exist_ok=True)
        return render(src, ROOT / p, kind in ("slow", "w"))
    with ThreadPoolExecutor(8) as ex:
        for i, r in enumerate(ex.map(job, paths)):
            if r: fails.append(r)
            if (i + 1) % 500 == 0: print("render", i + 1, "/", len(paths), flush=True)
    meta = {"voice": a.voice, "rate": a.rate, "lufs": TARGET, "slow_atempo": SLOW, "clips": len(paths), "fails": len(fails)}
    (ROOT / "audio/voice.json").write_text(json.dumps(meta), encoding="utf-8")
    print("DONE", meta, fails[:10])

if __name__ == "__main__":
    main()
