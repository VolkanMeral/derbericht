"""Daily formats for Der Bericht on Facebook/Instagram/Threads.

Each format turns data from derbericht.com into one 1080x1350 card (HTML, rendered by Playwright)
plus captions. Own texts only: topic lines (optionally written by Claude), counts, publisher names,
our KI illustrations – no publisher texts or photos.
"""
import datetime as dt
import html
import os
import re
from zoneinfo import ZoneInfo

import requests

VIENNA = ZoneInfo("Europe/Vienna")
COUNTRY = {"at": "Österreich", "de": "Deutschland", "ch": "der Schweiz"}
COUNTRY_SHORT = {"at": "Österreich", "de": "Deutschland", "ch": "Schweiz"}
FLAG = {"at": "🇦🇹", "de": "🇩🇪", "ch": "🇨🇭"}
EMOJI_LABEL = {"👍": "Gefällt mir", "❤️": "Herz", "😮": "Überrascht", "😢": "Traurig", "😡": "Wütend", "🤔": "Nachdenklich"}
HASHTAGS = os.getenv("BASE_HASHTAGS", "#DerBericht #Nachrichten #Österreich #Deutschland #Schweiz")
WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-5-5")


def e(s):
    return html.escape(str(s or ""))


def flag_svg(c, w=45):
    h = round(w * 2 / 3)
    if c == "at":
        return f'<svg width="{w}" height="{h}" viewBox="0 0 30 20"><rect width="30" height="20" fill="#c8102e"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect width="30" height="20" fill="none" stroke="#dcdbd5" stroke-width=".6"/></svg>'
    if c == "de":
        return f'<svg width="{w}" height="{h}" viewBox="0 0 30 20"><rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#dd0000"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/></svg>'
    return f'<svg width="{h}" height="{h}" viewBox="0 0 32 32"><rect width="32" height="32" fill="#da291c"/><rect x="13" y="6" width="6" height="20" fill="#fff"/><rect x="6" y="13" width="20" height="6" fill="#fff"/></svg>'


def today_label(now=None):
    now = now or dt.datetime.now(VIENNA)
    return f"{WEEKDAYS[now.weekday()]}, {now.day}. {MONTHS[now.month - 1]}"


# ------------------------------------------------------------------ own topic lines

_topic_cache = {}


def topic(s):
    """Short neutral topic line in our own words (Claude), else the lead headline without its prefix."""
    if s["id"] in _topic_cache:
        return _topic_cache[s["id"]]
    line = None
    if ANTHROPIC_API_KEY:
        try:
            heads = "\n".join(f"- {t}" for t in s.get("titles", [s["title"]])[:6])
            r = requests.post("https://api.anthropic.com/v1/messages", timeout=30, headers={
                "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": CLAUDE_MODEL, "max_tokens": 60, "messages": [{"role": "user", "content":
                    "Schreibe eine kurze, sachliche deutsche Themenzeile (höchstens 8 Wörter, keine Anführungszeichen, "
                    "keine Wertung, kein Punkt am Ende) in eigenen Worten für diese Nachricht. Übernimm keine Formulierung "
                    f"wörtlich aus den Schlagzeilen.\nSchlagzeilen verschiedener Redaktionen:\n{heads}\nNur die Zeile ausgeben."}]})
            r.raise_for_status()
            line = r.json()["content"][0]["text"].strip().strip('"„“').rstrip(".")[:90]
        except Exception as ex:  # noqa: BLE001
            print("Themenzeile per Claude nicht möglich:", str(ex)[:120], flush=True)
    if not line:
        line = s["title"]
    _topic_cache[s["id"]] = line
    return line


# ------------------------------------------------------------------ html scaffolding

HEAD = """<!doctype html><html lang="de"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Geist:wght@400;500;600&display=swap">
<style>
html,body{margin:0;padding:0}body{width:1080px;height:1350px;overflow:hidden}
.k{width:1080px;height:1350px;box-sizing:border-box;padding:72px 80px 64px;display:flex;flex-direction:column;font-family:'Geist',Arial,sans-serif}
.d{font-family:'Bricolage Grotesque',Arial,sans-serif}
.logo{font-family:'Bricolage Grotesque',Arial,sans-serif;font-weight:800;font-size:40px;letter-spacing:-.04em}
.top{display:flex;align-items:center;justify-content:space-between}
.eyebrow{font-size:24px;font-weight:600;letter-spacing:.1em;text-transform:uppercase}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;font-size:26px;padding-top:28px}
img{display:block}
</style></head><body>"""
TAIL = """<script>window.fit=function(){var k=document.querySelector('.k');document.querySelectorAll('[data-fit]').forEach(function(t){var s=parseFloat(getComputedStyle(t).fontSize);while(k.scrollHeight>1350&&s>22){s-=2;t.style.fontSize=s+'px'}})}</script></body></html>"""


def thumb(s, size):
    if s.get("image"):
        return f'<img src="{e(s["image"])}" alt="" style="width:{size}px;height:{size}px;border-radius:20px;object-fit:cover">'
    return f'<span style="width:{size}px;height:{size}px;border-radius:20px;background:#efeee9;display:block"></span>'


def countries_line(s):
    return " · ".join(c.upper() for c in ("at", "de", "ch") if s["by_country"].get(c))


# ------------------------------------------------------------------ formats

def briefing(stories):
    if len(stories) < 3:
        return None
    top = stories[:5]
    rows = "".join(f"""<div style="display:grid;grid-template-columns:64px 128px minmax(0,1fr);gap:24px;align-items:center;padding:18px 0;border-top:2px solid #e8e7e3">
      <span class="d" style="font-weight:800;font-size:54px;color:#c8321c">{i + 1}</span>{thumb(s, 128)}
      <span style="display:flex;flex-direction:column;gap:8px"><span class="d" data-fit style="font-size:34px;font-weight:700;line-height:1.12">{e(topic(s))}</span>
      <span style="font-size:22px;color:#6b6b72">{s['sources']} Redaktionen · {countries_line(s)}</span></span></div>""" for i, s in enumerate(top))
    body = f"""<div class="k" style="background:#fafaf8;color:#111113">
  <div class="top"><span class="logo">Der Bericht<span style="color:#c8321c">.</span></span><span style="font-size:24px;color:#6b6b72">{today_label()}</span></div>
  <span class="eyebrow" style="margin-top:52px;color:#c8321c">Morgen-Briefing</span>
  <h1 class="d" style="margin:14px 0 0;font-weight:800;font-size:84px;line-height:1;letter-spacing:-.04em">Die {len(top)} Themen<br>des Morgens</h1>
  <div style="margin-top:40px;border-bottom:2px solid #e8e7e3">{rows}</div>
  <div class="foot"><span style="color:#6b6b72">Bilder: KI-Illustration · alle Quellen auf</span><span style="font-weight:600;color:#c8321c">derbericht.com →</span></div>
</div>"""
    lines = "\n".join(f"{i + 1}. {topic(s)} ({s['sources']} Redaktionen)" for i, s in enumerate(top))
    base = f"☀️ Guten Morgen! Die {len(top)} Themen, über die Österreich, Deutschland und die Schweiz heute früh berichten:\n\n{lines}"
    tail = f"\n\nBilder: KI-Illustration\n{HASHTAGS} #Morgenbriefing"
    return {"html": HEAD + body + TAIL, "ids": [s["id"] for s in top], "link": "https://derbericht.com", "texts": {
        "facebook": f"{base}\n\n👉 Alle Schlagzeilen im Vergleich: https://derbericht.com{tail}",
        "instagram": f"{base}\n\nAlle Quellen im Vergleich: Link in der Bio · derbericht.com{tail}",
        "threads": f"{base}\n\nhttps://derbericht.com"[:500]}}


def dach(s):
    if not s:
        return None
    n = max(s["by_country"].values()) or 1
    rows = ""
    pubs = s.get("publishers_by_country", {})
    for c, color in (("at", "#ef5a40"), ("de", "#ffffff"), ("ch", "#8a8a92")):
        k = s["by_country"].get(c, 0)
        names = " · ".join(pubs.get(c, [])[:4]) or "keine Meldung"
        rows += f"""<div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:30px"><span style="display:flex;align-items:center;gap:14px">{flag_svg(c)}{COUNTRY_SHORT[c]}</span><strong class="d" style="font-size:40px">{k}</strong></div>
      <span style="height:22px;border-radius:11px;background:#26262b;display:flex"><span style="width:{max(2, round(k / n * 100)) if k else 0}%;border-radius:11px;background:{color}"></span></span>
      <span style="font-size:22px;color:#b4b4ba">{e(names)}</span></div>"""
    body = f"""<div class="k" style="background:#111113;color:#fff">
  <div class="top"><span class="logo">Der Bericht<span style="color:#ef5a40">.</span></span><span class="eyebrow" style="color:#ef5a40">DACH-Vergleich</span></div>
  <h1 class="d" style="margin:56px 0 0;font-weight:800;font-size:80px;line-height:1;letter-spacing:-.04em">Ein Thema.<br>Drei Länder.</h1>
  <div style="margin-top:40px;display:grid;grid-template-columns:280px minmax(0,1fr);gap:32px;align-items:center">{thumb(s, 280)}
    <div style="display:flex;flex-direction:column;gap:14px"><span style="font-size:24px;color:#b4b4ba">{e(s['category_name'])} · {s['sources']} Redaktionen</span>
    <span class="d" data-fit style="font-size:44px;font-weight:700;line-height:1.08">{e(topic(s))}</span></div></div>
  <div style="margin-top:48px;display:flex;flex-direction:column;gap:30px">{rows}</div>
  <div class="foot"><span style="color:#b4b4ba">Wie titeln die drei Länder? Alle Schlagzeilen im Vergleich</span><span style="font-weight:600;color:#ef5a40">derbericht.com →</span></div>
</div>"""
    counts = ", ".join(f"{FLAG[c]} {s['by_country'].get(c, 0)}" for c in ("at", "de", "ch"))
    base = f"Ein Thema, drei Länder: {topic(s)}\n\nSo viele Redaktionen berichten: {counts}"
    tail = f"\n\nBild: KI-Illustration\n{HASHTAGS} #DACHVergleich"
    return {"html": HEAD + body + TAIL, "ids": [s["id"]], "link": s["url"], "texts": {
        "facebook": f"{base}\nWie titeln Österreich, Deutschland und die Schweiz? 👉 {s['url']}{tail}",
        "instagram": f"{base}\nWie titeln die drei Länder? Link in der Bio · derbericht.com{tail}",
        "threads": f"{base}\n{s['url']}"[:500]}}


def nur_hier(country, stories):
    if len(stories) < 2:
        return None
    top = stories[:3]
    others = [c for c in ("at", "de", "ch") if c != country]
    rows = "".join(f"""<div style="background:#fff;border:2px solid #e8e7e3;border-radius:26px;padding:26px 30px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center">
      <span class="d" data-fit style="font-size:34px;font-weight:700;line-height:1.15">{e(topic(s))}</span>
      <span style="display:flex;gap:10px;font-size:26px;font-weight:600;white-space:nowrap"><span style="background:#fbeeeb;color:#a32615;padding:6px 14px;border-radius:999px">{country.upper()} {s['by_country'].get(country, 0)}</span>{''.join(f'<span style="background:#f1f0ec;color:#8a8a92;padding:6px 14px;border-radius:999px">{o.upper()} 0</span>' for o in others)}</span></div>""" for s in top)
    nxt = {"at": "Morgen: nur in Deutschland", "de": "Morgen: nur in der Schweiz", "ch": "Morgen: nur in Österreich"}[country]
    body = f"""<div class="k" style="background:#fafaf8;color:#111113">
  <div class="top"><span class="logo">Der Bericht<span style="color:#c8321c">.</span></span>{flag_svg(country, 66)}</div>
  <h1 class="d" style="margin:60px 0 0;font-weight:800;font-size:84px;line-height:1;letter-spacing:-.04em">Nur in {COUNTRY_SHORT[country]}<br><span style="color:#c8321c">ein Thema.</span></h1>
  <p style="margin:26px 0 0;font-size:32px;line-height:1.35;color:#55555c">Darüber berichten Redaktionen in {COUNTRY[country]} heute – in {COUNTRY[others[0]]} und {COUNTRY[others[1]]} kein Wort.</p>
  <div style="margin-top:44px;display:flex;flex-direction:column;gap:18px">{rows}</div>
  <div class="foot"><span style="color:#6b6b72">{nxt}</span><span style="font-weight:600;color:#c8321c">derbericht.com →</span></div>
</div>"""
    lines = "\n".join(f"• {topic(s)}" for s in top)
    base = f"{FLAG[country]} Nur in {COUNTRY_SHORT[country]} ein Thema – in den Nachbarländern kein Wort:\n\n{lines}"
    tail = f"\n\n{HASHTAGS} #NurHier"
    return {"html": HEAD + body + TAIL, "ids": [s["id"] for s in top], "link": "https://derbericht.com", "texts": {
        "facebook": f"{base}\n\n👉 https://derbericht.com{tail}",
        "instagram": f"{base}\n\nMehr auf derbericht.com (Link in der Bio){tail}",
        "threads": f"{base}\n\nhttps://derbericht.com"[:500]}}


def stimmung(s):
    if not s:
        return None
    total = sum(s["reactions"].values())
    if total < int(os.getenv("MIN_REACTIONS", "5")):
        return None
    top = sorted(s["reactions"].items(), key=lambda x: -x[1])[:4]
    tiles = "".join(f"""<span style="flex:1;height:120px;border-radius:28px;{'background:#c8321c;color:#fff' if i == 0 else 'background:#fff;border:2px solid #e8e7e3'};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px"><span style="font-size:48px;line-height:1">{em}</span><b class="d" style="font-size:34px">{round(n / total * 100)} %</b></span>""" for i, (em, n) in enumerate(top))
    img = f'<img src="{e(s["image"])}" alt="" style="width:100%;height:420px;border-radius:32px;object-fit:cover">' if s.get("image") else ""
    body = f"""<div class="k" style="background:#fafaf8;color:#111113">
  <div class="top"><span class="logo">Der Bericht<span style="color:#c8321c">.</span></span><span class="eyebrow" style="color:#c8321c">Leser-Stimmung</span></div>
  <h1 class="d" style="margin:52px 0 0;font-weight:800;font-size:76px;line-height:1.02;letter-spacing:-.04em">Das hat unsere Leser<br>heute bewegt</h1>
  <div style="margin-top:40px">{img}</div>
  <span class="d" data-fit style="margin-top:30px;font-size:44px;font-weight:700;line-height:1.1">{e(topic(s))}</span>
  <div style="margin-top:34px;display:flex;gap:16px">{tiles}</div>
  <div class="foot"><span style="color:#6b6b72">Und Sie? Reagieren Sie auf</span><span style="font-weight:600;color:#c8321c">derbericht.com →</span></div>
</div>"""
    mood = " · ".join(f"{em} {round(n / total * 100)} %" for em, n in top)
    base = f"Das hat unsere Leser heute am meisten bewegt: {topic(s)}\n\n{mood}"
    tail = f"\n\nBild: KI-Illustration\n{HASHTAGS} #LeserStimmung"
    return {"html": HEAD + body + TAIL, "ids": [s["id"]], "link": s["url"], "texts": {
        "facebook": f"{base}\nUnd was sagen Sie? 👉 {s['url']}{tail}",
        "instagram": f"{base}\nUnd Sie? Reagieren Sie auf derbericht.com (Link in der Bio){tail}",
        "threads": f"{base}\n{s['url']}"[:500]}}


def woche(w, now=None):
    if not w or not w.get("top"):
        return None
    now = now or dt.datetime.now(VIENNA)
    kw = now.isocalendar()[1]
    start = now - dt.timedelta(days=6)
    best = max(("at", "de", "ch"), key=lambda c: w["only_share"].get(c, 0))
    reacted = w.get("reacted")
    react_tile = (f"""<div style="background:#111113;border-radius:32px;padding:34px;display:flex;flex-direction:column;justify-content:space-between"><span style="font-size:24px;color:#b4b4ba">Meiste Reaktionen</span>
      <span style="display:flex;flex-direction:column;gap:8px"><b style="font-size:96px;line-height:1">{e(reacted.get('emoji') or '👍')}</b><span data-fit style="font-size:28px;line-height:1.25">{e(reacted['title'])}</span></span></div>""" if reacted else
                  f"""<div style="background:#111113;border-radius:32px;padding:34px;display:flex;flex-direction:column;justify-content:space-between"><span style="font-size:24px;color:#b4b4ba">Redaktionen</span>
      <span style="display:flex;flex-direction:column;gap:8px"><b class="d" style="font-size:96px;line-height:1">{w['feeds']}</b><span style="font-size:28px">aus drei Ländern</span></span></div>""")
    body = f"""<div class="k" style="background:#c8321c;color:#fff">
  <div class="top"><span class="logo">Der Bericht<span style="color:#111113">.</span></span><span style="font-size:24px;color:#ffe1db">KW {kw} · {start.day}.{start.month}.–{now.day}.{now.month}.</span></div>
  <h1 class="d" style="margin:60px 0 0;font-weight:800;font-size:88px;line-height:1;letter-spacing:-.04em">Die Woche<br>in Zahlen</h1>
  <div style="margin-top:52px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;flex:1">
    <div style="background:#fff;color:#111113;border-radius:32px;padding:34px;display:flex;flex-direction:column;justify-content:space-between"><span style="font-size:24px;color:#6b6b72">Thema der Woche</span>
      <span style="display:flex;flex-direction:column;gap:8px"><b class="d" style="font-size:96px;line-height:1;letter-spacing:-.04em">{w['top']['articles']}</b><span data-fit style="font-size:28px;line-height:1.25">Artikel: {e(w['top']['title'])}</span></span></div>
    <div style="background:#111113;border-radius:32px;padding:34px;display:flex;flex-direction:column;justify-content:space-between"><span style="font-size:24px;color:#b4b4ba">Meldungen gesammelt</span>
      <span style="display:flex;flex-direction:column;gap:8px"><b class="d" style="font-size:96px;line-height:1;letter-spacing:-.04em">{w['articles']:,}</b><span style="font-size:28px">aus {w['feeds']} Redaktionen</span></span></div>
    {react_tile}
    <div style="background:#fff;color:#111113;border-radius:32px;padding:34px;display:flex;flex-direction:column;justify-content:space-between"><span style="font-size:24px;color:#6b6b72">Nur in einem Land Thema</span>
      <span style="display:flex;flex-direction:column;gap:14px"><span style="display:flex;gap:14px;align-items:center">{flag_svg(best, 60)}<b class="d" style="font-size:72px;line-height:1">{w['only_share'][best]} %</b></span><span style="font-size:28px;line-height:1.25">der Themen aus {COUNTRY[best]} kamen im Ausland nicht vor</span></span></div>
  </div>
  <div class="foot"><span style="color:#ffe1db">Jeden Sonntag · alle Zahlen auf</span><span style="font-weight:600">derbericht.com →</span></div>
</div>""".replace(f"{w['articles']:,}", f"{w['articles']:,}".replace(",", "."))
    base = (f"📊 Die Woche in Zahlen (KW {kw}):\n\n• Thema der Woche: {w['top']['title']} – {w['top']['articles']} Artikel\n"
            f"• {w['articles']:,} Meldungen aus {w['feeds']} Redaktionen\n".replace(",", ".") +
            f"• {w['only_share'][best]} % der Themen aus {COUNTRY[best]} kamen im Ausland nicht vor")
    tail = f"\n\n{HASHTAGS} #WocheInZahlen"
    return {"html": HEAD + body + TAIL, "ids": [], "link": "https://derbericht.com", "texts": {
        "facebook": f"{base}\n\n👉 https://derbericht.com{tail}",
        "instagram": f"{base}\n\nMehr auf derbericht.com (Link in der Bio){tail}",
        "threads": f"{base}\n\nhttps://derbericht.com"[:500]}}


# ------------------------------------------------------------------ schedule (Vienna time)

SLOTS = [
    ("07:30", "briefing"), ("09:00", "story"), ("11:00", "story"), ("12:30", "nurhier"), ("14:00", "story"),
    ("16:00", "story"), ("17:30", "dach"), ("19:00", "story"), ("20:30", "stimmung"), ("21:30", "story"),
]
WINDOW_MIN = int(os.getenv("SLOT_WINDOW_MIN", "80"))  # GitHub schedules can be late


def due_slot(done_today, now=None):
    """The earliest slot of today that has started within the window and was not handled yet."""
    now = now or dt.datetime.now(VIENNA)
    for hhmm, kind in SLOTS:
        h, m = map(int, hhmm.split(":"))
        start = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if hhmm in done_today:
            continue
        if start <= now < start + dt.timedelta(minutes=WINDOW_MIN):
            if kind == "story" and hhmm == "11:00" and now.weekday() == 6:
                kind = "woche"
            return hhmm, kind
    return None


def nurhier_country(now=None):
    now = now or dt.datetime.now(VIENNA)
    return ("at", "de", "ch")[now.toordinal() % 3]
