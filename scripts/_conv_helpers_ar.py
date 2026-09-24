# -*- coding: utf-8 -*-
def sc(id_, level, theme, titleHe, titleRu, settingHe, steps):
    return {"id":id_,"level":level,"theme":theme,"titleHe":titleHe,"titleRu":titleRu,"settingHe":settingHe,"steps":steps}
def npc(ru, he=""):
    return {"speaker":"npc","ru":ru,"he":he}
def user(promptHe, choices, accepted, model=None):
    return {"speaker":"user","promptHe":promptHe,"choices":choices,"accepted":accepted,
            "model":model or next((c["ru"] for c in choices if c.get("ok")), accepted[0] if accepted else "")}
def ch(ru, he, ok=True):
    return {"ru":ru,"he":he,"ok":ok}
