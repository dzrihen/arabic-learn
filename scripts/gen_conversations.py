# -*- coding: utf-8 -*-
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _conv_parts_ar import PARTS

def main():
    S=[]
    for part in PARTS:
        S.extend(part)
    assert 45 <= len(S) <= 60, len(S)
    out = pathlib.Path(__file__).resolve().parents[1] / "data" / "conversations.js"
    payload = {"version": 2, "scenarios": S}
    out.write_text("window.RL_CONVERSATIONS="+json.dumps(payload, ensure_ascii=False, separators=(",", ":"))+";\n", encoding="utf-8")
    lines=set()
    for s in S:
        for st in s["steps"]:
            if st["speaker"]=="npc":
                lines.add(st["ru"])
            else:
                if st.get("model"): lines.add(st["model"])
                for c in st.get("choices") or []:
                    if c.get("ok"): lines.add(c["ru"])
    lines={x for x in lines if x}
    pathlib.Path(__file__).resolve().parent.joinpath("_dialogue_lines.json").write_text(
        json.dumps(sorted(lines), ensure_ascii=False, indent=0), encoding="utf-8")
    themes={}
    for s in S:
        themes[s["theme"]]=themes.get(s["theme"],0)+1
    print("scenarios", len(S), "lines", len(lines), "themes", themes)

if __name__ == "__main__":
    main()
