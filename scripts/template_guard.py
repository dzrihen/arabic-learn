# -*- coding: utf-8 -*-
"""Guard rails for template-generated sentences (Palestinian Arabic).

Root cause of the «عندي إذا.» = «יש לי אם.» / «الإنت منيح.» = «האתה טוב.»
class of bugs: the old generators (vocab_bank.generate_lemma_sentences /
natural_rows_for_lemma) filled open slot templates («عندي X», «بدي X»,
«هاد X», «وين الX؟», «الX منيح», «من فضلك عطي X») with *any* unused lemma
from the bank — conjunctions, prepositions, pronouns, adverbs, greetings,
synthetic placeholders («מאכל12») and entries whose Hebrew gloss is
misaligned in the bank (e.g. «مطرقة» glossed «דלי»).  «من فضلك عطي X» is
also MSA-flavoured and ungrammatical (missing «ـني»), and «هاد» was used
with feminine nouns.

This module is the single source of truth for:
  * SAFE_NOUNS  – the only words allowed into a slot (concrete, verified
                  Hebrew gloss, Arabic gender for هاد/هاي, Hebrew gender)
  * TEMPLATES   – the only slot templates still in use (Palestinian forms)
  * slot_ok()   – hard rejection rules (stopwords, POS, placeholders)
  * LEGACY_PATTERNS/classify_legacy() – detector for old generated items
"""
import re

STOPWORDS = set("""
و أو بس إذا عشان لأن بعدين في من على عن مع لـ ل بـ عند عند تحت فوق قدام ورا جنب بين قبل بعد
لحد هون هناك هلق هلأ هسة هسا هلقيت لسا كمان برضو أبداً دايماً يمكن لازم بقدر كتير شوي
أنا إنت إنتي هو هي إحنا إنتو هم هاد هاي هذا هديك هداك شو مين وين إيمتى كيف ليش قديش كم
أه أيوا لا آه لو سمحت من فضلك يسلمو شكراً مرحبا أهلين مع السلامة السلام عليكم خلاص منيح
""".split()) | {"لو سمحت", "من فضلك", "مع السلامة", "السلام عليكم"}
FUNC_POS = {"conj", "prep", "pron", "adv", "intj", "v", "adj", "num", "phrase"}
PLACEHOLDER_RE = re.compile(r"[0-9٠-٩]")
HE_PLACEHOLDER_RE = re.compile(r"\d|מונח|מאכל\d")

# lemma -> (hebrew, hebrew_gender m/f/p, arabic_gender m/f, category)
SAFE_NOUNS = {
    # food & drink
    "خبز": ("לחם", "m", "m", "food"), "شاي": ("תה", "m", "m", "food"),
    "قهوة": ("קפה", "m", "f", "food"), "حليب": ("חלב", "m", "m", "food"),
    "جبنة": ("גבינה", "f", "f", "food"), "رز": ("אורז", "m", "m", "food"),
    "جاج": ("עוף", "m", "m", "food"), "سمك": ("דג", "m", "m", "food"),
    "شوربة": ("מרק", "m", "f", "food"), "سلطة": ("סלט", "m", "f", "food"),
    "عصير": ("מיץ", "m", "m", "food"), "حمص": ("חומוס", "m", "m", "food"),
    "فلافل": ("פלאפל", "m", "m", "food"), "زيت": ("שמן", "m", "m", "food"),
    "سكر": ("סוכר", "m", "m", "food"), "ملح": ("מלח", "m", "m", "food"),
    "لبنة": ("לבנה", "f", "f", "food"), "كعكة": ("עוגה", "f", "f", "food"),
    # objects
    "مفتاح": ("מפתח", "m", "m", "object"), "تلفون": ("טלפון", "m", "m", "object"),
    "شنطة": ("תיק", "m", "f", "object"), "كتاب": ("ספר", "m", "m", "object"),
    "قلم": ("עט", "m", "m", "object"), "كاسة": ("כוס", "f", "f", "object"),
    "صحن": ("צלחת", "f", "m", "object"), "معلقة": ("כף", "f", "f", "object"),
    "شوكة": ("מזלג", "m", "f", "object"), "سكينة": ("סכין", "f", "f", "object"),
    "كرسي": ("כיסא", "m", "m", "object"), "طاولة": ("שולחן", "m", "f", "object"),
    "مخدة": ("כרית", "f", "f", "object"), "شمسية": ("מטרייה", "f", "f", "object"),
    "تذكرة": ("כרטיס", "m", "f", "object"), "خريطة": ("מפה", "f", "f", "object"),
    "شاحن": ("מטען", "m", "m", "object"), "منشفة": ("מגבת", "f", "f", "object"),
    "صابون": ("סבון", "m", "m", "object"), "جاكيت": ("מעיל", "m", "m", "object"),
}

# (id, target, hebrew, allowed categories); {dem} = هاد/هاي, {n_def} = definite form
TEMPLATES = [
    ("want",  "بدي {n}.",                "אני רוצה {he}.",          {"food", "object"}),
    ("give",  "عطيني {n} لو سمحت.",      "תן לי {he}, בבקשה.",      {"food"}),
    ("have",  "عنا {n} بالبيت.",         "יש לנו {he} בבית.",       {"food", "object"}),
    ("this",  "{dem} {n}.",              "{this} {he}.",            {"food", "object"}),
    ("where", "وين {n_def}؟",            "איפה ה{he}?",             {"object"}),
]
HE_THIS = {"m": "זה", "f": "זאת", "p": "אלה"}
AR_DEM = {"m": "هاد", "f": "هاي"}


def norm(s):
    return (s or "").strip()


def slot_ok(entry, tmpl_id=None):
    lem = norm(entry.get("lemma"))
    if not lem or lem in STOPWORDS or PLACEHOLDER_RE.search(lem):
        return False
    if entry.get("pos") in FUNC_POS:
        return False
    if HE_PLACEHOLDER_RE.search(entry.get("he") or ""):
        return False
    safe = SAFE_NOUNS.get(lem)
    if not safe:
        return False
    if tmpl_id:
        for tid, _, _, cats in TEMPLATES:
            if tid == tmpl_id:
                return safe[3] in cats
    return True


def render(tmpl_id, lemma):
    lem = norm(lemma)
    he, hg, ag, cat = SAFE_NOUNS[lem]
    for tid, t_ru, t_he, cats in TEMPLATES:
        if tid == tmpl_id and cat in cats:
            ru = t_ru.format(n=lem, n_def="ال" + lem, dem=AR_DEM[ag])
            return ru, t_he.format(he=he, this=HE_THIS[hg])
    return None


# ---- detector for items produced by the OLD generator -------------------
LEGACY_PATTERNS = [
    ("have_i", re.compile(r"^عندي (?P<s>.+)\.$")),
    ("have_we", re.compile(r"^عندنا (?P<s>.+)\.$")),
    ("want", re.compile(r"^بدي (?P<s>.+)\.$")),
    ("give_msa", re.compile(r"^من فضلك عطي (?P<s>.+)\.$")),
    ("where", re.compile(r"^وين ال(?P<s>.+)؟$")),
    ("good", re.compile(r"^ال(?P<s>.+) منيح\.$")),
    ("this", re.compile(r"^هاد (?P<s>.+)\.$")),
    ("very", re.compile(r"^كتير (?P<s>.+)\.$")),
    ("he_v", re.compile(r"^هو (?:بدو )?(?P<s>.+)\.$")),
    ("must", re.compile(r"^لازم (?P<s>.+)\.$")),
]
OBJECT_TEMPLATES = {"have_i", "have_we", "want", "give_msa", "good"}
PEOPLE_THEMES = {"people", "professions"}
PLACE_THEMES = {"places", "city", "cities", "travel", "travel2"}
HE_BROKEN_RE = re.compile(
    r"^(יש (לי|לנו) |זה |אני רוצה |בבקשה תן |איפה ה|ה)"
    r"(אם|או|בלי|לפני|אחרי|עם|ו|אבל|כי|למה|איך|תחת|מעל|ליד|כמה|עכשיו|כן|אתה|את|אתם|בין|גם|קצת|עדיין|"
    r"מאחורי|בבקשה|להתראות|שלום עליכם|ההיא|אצל|אצל/יש ל|הו|ואז/אחר כך|אף פעם|די/נגמר|אבל/רק|בשביל/כי|או|ו)"
    r"( טוב)?[\.\?]$"
)


def _strip_al(s):
    return s[2:] if s.startswith("ال") and len(s) > 3 else s


def classify_legacy(ru, he, bank_by_lemma):
    for tid, rx in LEGACY_PATTERNS:
        m = rx.match(ru or "")
        if not m:
            continue
        s = norm(m.group("s"))
        e = bank_by_lemma.get(s) or bank_by_lemma.get(_strip_al(s)) or bank_by_lemma.get("ال" + s) or {}
        pos, theme = e.get("pos"), e.get("theme")
        if PLACEHOLDER_RE.search(s) or HE_PLACEHOLDER_RE.search(he or ""):
            return tid, "placeholder lemma"
        if s in STOPWORDS or _strip_al(s) in STOPWORDS or pos in {"conj", "prep", "pron", "adv", "intj"}:
            return tid, "function word in slot"
        if tid in ("he_v", "must") or pos in {"v", "adj"}:
            return tid, "verb/adjective in noun slot"
        if tid in OBJECT_TEMPLATES and theme in PEOPLE_THEMES:
            return tid, "person in object slot"
        if tid in OBJECT_TEMPLATES and theme in PLACE_THEMES:
            return tid, "place/proper noun in object slot"
        if tid == "give_msa":
            return tid, "MSA/ungrammatical frame (من فضلك عطي)"
        if tid == "this" and s.endswith("ة"):
            return tid, "gender agreement (هاد + feminine)"
        return tid, "retired template (unverified gloss / off-topic)"
    return None
