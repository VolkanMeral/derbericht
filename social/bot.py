#!/usr/bin/env python3
"""
Der Bericht – automatische Facebook-, Instagram- und Threads-Beiträge (nach dem Vorbild von havadis-otomasyon).

Jeder Lauf:
  1. liest https://derbericht.com/api/social.json (meistberichtete Geschichten mit eigener KI-Illustration)
  2. wählt die wichtigste, noch nicht geteilte Geschichte
  3. erzeugt aus social/kart.html ein 1080x1350-Bild (Playwright)
  4. teilt es auf der Facebook-Seite (mit Link zum Quellenvergleich), auf Instagram und optional auf Threads
  5. merkt sich die Geschichte in social/posted.json (keine Doppelposts)

Rechtlicher Rahmen wie auf der Website: nur Schlagzeile, Quellenangabe und eigene KI-Illustration,
keine Fotos oder Texte der Verlage. Der Link führt zu derbericht.com, von dort zu den Originalartikeln.

Einstellungen über Umgebungsvariablen (siehe social/README.md). DRY_RUN=1 (Standard): nichts wird geteilt.
"""
import datetime as dt
import html
import json
import os
import re
import sys
import time

import requests

import formats

KOK = os.path.dirname(os.path.abspath(__file__))
CIKTI = os.path.join(KOK, "cikti")
DURUM = os.path.join(KOK, "posted.json")

SITE = os.getenv("SITE_URL", "https://derbericht.com").rstrip("/")
GRAPH_VERSION = os.getenv("GRAPH_VERSION", "v26.0")
DRY_RUN = os.getenv("DRY_RUN", "1") == "1"
CHECK_ONLY = os.getenv("CHECK_ONLY", "0") == "1"
MIN_SOURCES = int(os.getenv("MIN_SOURCES", "4") or 4)
MAX_AGE_HOURS = int(os.getenv("MAX_AGE_HOURS", "8") or 8)
HASHTAGS = os.getenv("BASE_HASHTAGS", "#DerBericht #Nachrichten #Österreich #Deutschland #Schweiz")

COUNTRY = {"at": "Österreich", "de": "Deutschland", "ch": "der Schweiz"}
FLAG = {"at": "🇦🇹", "de": "🇩🇪", "ch": "🇨🇭"}


def _id(name):
    m = re.search(r"\d{5,}", os.getenv(name) or "")
    return m.group(0) if m else ""


def _token(name):
    return re.sub(r"[^A-Za-z0-9]", "", os.getenv(name) or "")


PAGE_ID = _id("META_PAGE_ID")
IG_USER_ID = _id("IG_USER_ID")
ORIGINAL_TOKEN = _token("META_PAGE_TOKEN")
THREADS_TOKEN = _token("THREADS_TOKEN")

HTTP = requests.Session()
HTTP.headers["User-Agent"] = "DerBerichtSocialBot/1.0 (+https://derbericht.com)"


def log(*a):
    print(*a, flush=True)


def graph(path):
    return f"https://graph.facebook.com/{GRAPH_VERSION}/{path}"


def check(r):
    if r.status_code >= 400:
        raise RuntimeError(f"Graph API Fehler {r.status_code}: {r.text}")
    return r.json()


def page_token(token):
    """Ein System-/Benutzer-Token wird gegen das (unbefristete) Seiten-Token getauscht."""
    if not (token and PAGE_ID):
        return token
    try:
        r = HTTP.get(graph(PAGE_ID), params={"fields": "access_token", "access_token": token}, timeout=15)
        return (r.json().get("access_token") if r.status_code == 200 else None) or token
    except Exception:
        return token


PAGE_TOKEN = page_token(ORIGINAL_TOKEN)


def gh_error(title, msg):
    msg = str(msg)
    for secret in (PAGE_TOKEN, ORIGINAL_TOKEN, THREADS_TOKEN):
        if secret:
            msg = msg.replace(secret, "***")
    print(f"::error title={title}::" + msg.replace("%", "%25").replace("\n", "%0A")[:1500], flush=True)


# ------------------------------------------------------------------ data

STATE = {"posts": [], "slots": {}}


def read_posted():
    """posted.json: {"posts": [...], "slots": {"2026-10-19": ["07:30", ...]}} (older files: a plain list)."""
    global STATE
    try:
        with open(DURUM, encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    STATE = data if isinstance(data, dict) else {"posts": data, "slots": {}}
    STATE.setdefault("posts", []); STATE.setdefault("slots", {})
    return STATE["posts"]


def write_posted(rows=None):
    if rows is not None:
        STATE["posts"] = rows
    STATE["posts"] = STATE["posts"][-500:]
    keep = sorted(STATE["slots"])[-7:]
    STATE["slots"] = {d: STATE["slots"][d] for d in keep}
    with open(DURUM, "w", encoding="utf-8") as f:
        json.dump(STATE, f, ensure_ascii=False, indent=1)


def stories(**params):
    params = {"min": MIN_SOURCES, **params}
    r = HTTP.get(f"{SITE}/api/social.json", params=params, timeout=30)
    r.raise_for_status()
    return r.json()["stories"]


def pick(items, posted):
    done = {p["id"] for p in posted}
    # Same headline twice (a story can be re-clustered) is skipped too.
    titles = {p.get("title", "").lower() for p in posted[-60:]}
    limit = time.time() * 1000 - MAX_AGE_HOURS * 3600 * 1000
    for s in items:
        if s["id"] in done or s["title"].lower() in titles or s["first_seen"] < limit:
            continue
        return s
    return None


# ------------------------------------------------------------------ texts

def countries_text(s):
    names = [COUNTRY[c] for c in ("at", "de", "ch") if s["by_country"].get(c)]
    if len(names) == 1:
        return f"aus {names[0]}"
    return "aus " + ", ".join(names[:-1]) + " und " + names[-1]


def caption(s, platform):
    flags = "".join(FLAG[c] for c in ("at", "de", "ch") if s["by_country"].get(c))
    cat = re.sub(r"\W", "", s["category_name"])
    head = f"{s['title']}\n\n{flags} {s['sources']} Redaktionen {countries_text(s)} berichten darüber."
    bild = "\n\nBild: KI-Illustration (keine reale Aufnahme)" if s.get("image") else ""
    tail = f"{bild}\n{HASHTAGS} #{cat}" if bild else f"\n\n{HASHTAGS} #{cat}"
    if platform == "facebook":
        return f"{head}\nSo titeln sie – alle Schlagzeilen im Vergleich:\n👉 {s['url']}{tail}"
    if platform == "threads":
        return f"{s['title']}\n\n{flags} {s['sources']} Redaktionen berichten. Alle Schlagzeilen im Vergleich:\n{s['url']}"[:500]
    return f"{head}\nAlle Schlagzeilen im Vergleich: Link in der Bio · derbericht.com{tail}"


# ------------------------------------------------------------------ image

FLAG_SVG = {
    "at": '<svg width="45" height="30" viewBox="0 0 30 20"><rect width="30" height="20" fill="#c8102e"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect width="30" height="20" fill="none" stroke="#dcdbd5"/></svg>',
    "de": '<svg width="45" height="30" viewBox="0 0 30 20"><rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#dd0000"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/></svg>',
    "ch": '<svg width="30" height="30" viewBox="0 0 32 32"><rect width="32" height="32" fill="#da291c"/><rect x="13" y="6" width="6" height="20" fill="#fff"/><rect x="6" y="13" width="20" height="6" fill="#fff"/></svg>',
}


def norm(t):
    return re.sub(r"\W+", " ", t.lower()).strip()


def other_headlines(s, n=3):
    """Differently worded headlines from other newsrooms, preferring other countries."""
    items = s.get("headlines") or [{"publisher": p, "country": "", "title": t} for p, t in zip(s["publishers"], s["titles"])]
    lead = norm(s["title"])
    seen_pub, seen_t, out = {s["publisher"]}, {lead}, []
    lead_c = next((h["country"] for h in items if h["publisher"] == s["publisher"]), "")
    items = sorted(items, key=lambda h: h["country"] == lead_c)  # other countries first, stable order otherwise
    for h in items:
        t = norm(h["title"])
        # skip agency copies: identical or nearly identical to a headline already shown
        if h["publisher"] in seen_pub or t in seen_t or any(t in x or x in t for x in seen_t):
            continue
        seen_pub.add(h["publisher"]); seen_t.add(t); out.append(h)
        if len(out) == n:
            break
    return out


def figure_html(s):
    if s.get("image"):
        return f'<div class="fig"><img src="{html.escape(s["image"])}" alt=""><span class="ki">KI-Illustration</span></div>'
    quotes = other_headlines(s)
    if not quotes:
        return ""
    rows = "".join(
        f'<div class="q"><p>{html.escape(h["title"])}</p><span>{FLAG_SVG.get(h["country"], "")}{html.escape(h["publisher"])}</span></div>'
        for h in quotes)
    return f'<div class="vgl"><div class="lbl">So titeln andere</div>{rows}</div>'


def card_html(s):
    with open(os.path.join(KOK, "kart.html"), encoding="utf-8") as f:
        tpl = f.read()
    rows = "".join(
        f'<div class="land">{FLAG_SVG[c]}<b>{s["by_country"][c]}</b></div>'
        for c in ("at", "de", "ch") if s["by_country"].get(c))
    others = [p for p in s["publishers"] if p != s["publisher"]]
    names = ", ".join(others[:3]) + (f" +{len(others) - 3}" if len(others) > 3 else "")
    from zoneinfo import ZoneInfo
    when = dt.datetime.fromtimestamp(s["last_update"] / 1000, ZoneInfo("Europe/Vienna")).strftime("%d.%m. · %H:%M")
    values = {
        "kategorie": s["category_name"], "zeit": when, "figur": figure_html(s), "titel": s["title"],
        "label": "Zuerst berichtet" if s.get("own_topic") else "Schlagzeile",
        "quelle": s["publisher"] or "", "auch": f" · auch {names}" if names else "", "anzahl": str(s["sources"]),
        "laender": rows,
    }
    for k, v in values.items():
        tpl = tpl.replace("{{" + k + "}}", v if k in ("laender", "figur") else html.escape(v))
    return tpl


def render(s, path, html_text=None):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 1080, "height": 1350}, device_scale_factor=1)
        page.set_content(html_text or card_html(s), wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        page.evaluate("window.fit && window.fit()")
        page.screenshot(path=path, type="jpeg", quality=92, clip={"x": 0, "y": 0, "width": 1080, "height": 1350})
        b.close()
    return path


# ------------------------------------------------------------------ posting

def facebook_photo(image, message):
    with open(image, "rb") as f:
        res = check(HTTP.post(graph(f"{PAGE_ID}/photos"), data={"message": message, "access_token": PAGE_TOKEN},
                              files={"source": ("bild.jpg", f, "image/jpeg")}, timeout=120))
    info = check(HTTP.get(graph(res["id"]), params={"fields": "images", "access_token": PAGE_TOKEN}, timeout=30))
    biggest = max(info["images"], key=lambda i: i["width"])
    return res.get("post_id", res["id"]), biggest["source"]


def ig_wait(container, tries=30, pause=4):
    for _ in range(tries):
        st = check(HTTP.get(graph(container), params={"fields": "status_code", "access_token": PAGE_TOKEN}, timeout=30))
        if st.get("status_code") == "FINISHED":
            return
        if st.get("status_code") == "ERROR":
            raise RuntimeError(f"Instagram konnte das Bild nicht verarbeiten: {st}")
        time.sleep(pause)
    raise RuntimeError("Instagram: Zeitüberschreitung beim Verarbeiten")


def instagram_photo(image_url, text):
    c = check(HTTP.post(graph(f"{IG_USER_ID}/media"), data={"image_url": image_url, "caption": text, "access_token": PAGE_TOKEN}, timeout=60))
    ig_wait(c["id"])
    return check(HTTP.post(graph(f"{IG_USER_ID}/media_publish"), data={"creation_id": c["id"], "access_token": PAGE_TOKEN}, timeout=60))["id"]


def threads_post(text, link):
    api = "https://graph.threads.net/v1.0"
    c = check(HTTP.post(f"{api}/me/threads", data={"media_type": "TEXT", "text": text, "link_attachment": link, "access_token": THREADS_TOKEN}, timeout=60))["id"]
    time.sleep(5)
    return check(HTTP.post(f"{api}/me/threads_publish", data={"creation_id": c, "access_token": THREADS_TOKEN}, timeout=60))["id"]


def connection_check():
    if not (PAGE_ID and PAGE_TOKEN):
        raise RuntimeError("META_PAGE_ID oder META_PAGE_TOKEN fehlt.")
    kind = "aus System-/Benutzer-Token geholt" if PAGE_TOKEN != ORIGINAL_TOKEN else "direktes Seiten-Token"
    page = check(HTTP.get(graph(PAGE_ID), params={"fields": "name", "access_token": PAGE_TOKEN}, timeout=30))
    log(f"Facebook-Seite erreichbar: {page.get('name')} ({kind})")
    # Type and lifetime of the stored token (a page token from a long-lived user token never expires).
    try:
        info = check(HTTP.get(graph("debug_token"), params={"input_token": ORIGINAL_TOKEN, "access_token": PAGE_TOKEN}, timeout=30)).get("data", {})
        exp = info.get("expires_at") or 0
        days = (exp - time.time()) / 86400 if exp else None
        hours = (exp - time.time()) / 3600 if exp else None
        print(f"::notice title=Meta-Token::Typ {info.get('type')}, gültig {info.get('is_valid')}, expires_at {exp}, data_access_expires_at {info.get('data_access_expires_at')}", flush=True)
        log(f"Gespeichertes Token: Typ {info.get('type')}, gültig: {info.get('is_valid')}, " + ("läuft nie ab" if not exp else f"läuft in {hours:.1f} Stunden ab ({time.strftime('%d.%m.%Y %H:%M', time.gmtime(exp))} UTC)"))
        if days is not None and days < 30:
            gh_error("Meta-Token läuft bald ab", f"Noch {days:.0f} Tage. Bitte das Seiten-Token (me/accounts) als META_PAGE_TOKEN eintragen.")
    except Exception as e:  # noqa: BLE001
        log("Token-Prüfung nicht möglich:", str(e)[:120])
    if IG_USER_ID:
        ig = check(HTTP.get(graph(IG_USER_ID), params={"fields": "username", "access_token": PAGE_TOKEN}, timeout=30))
        log("Instagram erreichbar:", ig.get("username"))
    else:
        log("Hinweis: IG_USER_ID leer – kein Instagram.")
    if THREADS_TOKEN:
        th = check(HTTP.get("https://graph.threads.net/v1.0/me", params={"fields": "username", "access_token": THREADS_TOKEN}, timeout=30))
        log("Threads erreichbar:", th.get("username"))


# ------------------------------------------------------------------ main

FORMAT = (os.getenv("FORMAT") or "").strip().lower()   # manual run: briefing|story|dach|nurhier|stimmung|woche|alle


def story_post(posted):
    # Prefer stories with our own illustration; otherwise the headline-comparison card.
    s = pick(stories(), posted) or pick([x for x in stories(img=0) if len(other_headlines(x)) >= 2], posted)
    if not s:
        return None
    if formats.ANTHROPIC_API_KEY:
        s["title"], s["own_topic"] = formats.topic(s), True
    return {"html": card_html(s), "ids": [s["id"]], "title": s["title"], "link": s["url"],
            "texts": {k: caption(s, k) for k in ("facebook", "instagram", "threads")}}


def build(kind, posted):
    """One post of the given format; falls back to a single story card when the data is too thin."""
    done = {p["id"] for p in posted}
    post = None
    if kind == "briefing":
        post = formats.briefing(stories(min=3, hours=12, img=0))
    elif kind == "dach":
        post = formats.dach(next((x for x in stories(min=3, hours=24, multi=1) if x["id"] not in done), None))
    elif kind == "nurhier":
        c = formats.nurhier_country()
        post = formats.nur_hier(c, stories(min=2, hours=24, only=c, img=0))
    elif kind == "stimmung":
        post = formats.stimmung(next(iter(stories(min=2, hours=24, sort="reactions", img=0)), None))
    elif kind == "woche":
        r = HTTP.get(f"{SITE}/api/week.json", timeout=30)
        r.raise_for_status()
        post = formats.woche(r.json())
    if post:
        post.setdefault("title", kind)
        return kind, post
    if kind != "story":
        log(f"Format {kind}: zu wenig Daten, stattdessen Einzelmeldung.")
    p = story_post(posted)
    return ("story", p) if p else (kind, None)


def publish(kind, post, posted, stamp):
    image = render(None, os.path.join(CIKTI, f"{stamp}-{kind}.jpg"), post["html"])
    with open(os.path.join(CIKTI, f"{stamp}-{kind}.txt"), "w", encoding="utf-8") as f:
        f.write("\n\n".join(f"--- {k.upper()} ---\n{v}" for k, v in post["texts"].items()))
    log(f"[{kind}] Bild erzeugt:", image)
    if DRY_RUN:
        log("TESTMODUS (DRY_RUN=1): nichts geteilt. Bild und Texte liegen unter Artifacts.")
        return
    if not (PAGE_ID and PAGE_TOKEN):
        raise RuntimeError("META_PAGE_ID / META_PAGE_TOKEN fehlen.")
    row = {"id": post["ids"][0] if post["ids"] else f"{kind}-{stamp}", "ids": post["ids"], "kind": kind,
           "title": post["title"], "time": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}

    def save():
        if row not in posted:
            posted.append(row)
        write_posted(posted)

    fb_id, fb_image = facebook_photo(image, post["texts"]["facebook"])
    row["facebook"] = fb_id
    log("Facebook geteilt:", fb_id)
    save()

    def attempt(name, fn):
        try:
            row[name] = fn()
            log(f"{name} geteilt:", row[name])
        except Exception as ex:  # noqa: BLE001
            row[f"{name}_fehler"] = str(ex)[:300]
            gh_error(f"{name} Fehler", ex)
        save()

    if IG_USER_ID:
        attempt("instagram", lambda: instagram_photo(fb_image, post["texts"]["instagram"]))
    if THREADS_TOKEN:
        attempt("threads", lambda: threads_post(post["texts"]["threads"], post["link"]))


def main():
    if CHECK_ONLY:
        connection_check()
        return 0
    os.makedirs(CIKTI, exist_ok=True)
    posted = read_posted()
    now = dt.datetime.now(formats.VIENNA)
    day = now.strftime("%Y-%m-%d")
    done_today = STATE["slots"].setdefault(day, [])
    slot = None if FORMAT else formats.due_slot(done_today, now)
    if "--kontrol" in sys.argv:
        work = bool(FORMAT) or bool(slot)
        log("Zu tun:", FORMAT or (f"{slot[0]} {slot[1]}" if slot else "nichts (kein fälliger Termin)"))
        out = os.getenv("GITHUB_OUTPUT")
        if out:
            with open(out, "a") as f:
                f.write(f"neu={'true' if work else 'false'}\n")
        return 0
    stamp = now.strftime("%Y%m%d-%H%M")
    if FORMAT:
        kinds = ["briefing", "story", "nurhier", "dach", "stimmung", "woche"] if FORMAT == "alle" else [FORMAT]
        if FORMAT == "alle" and not DRY_RUN:
            raise RuntimeError("FORMAT=alle nur im Testmodus.")
        failed = 0
        for k in kinds:
            try:
                kind, post = build(k, posted)
                if post:
                    publish(kind, post, posted, stamp)
                else:
                    log(f"[{k}] nichts zu teilen.")
            except Exception as ex:  # noqa: BLE001
                failed += 1
                gh_error(f"Format {k}", ex)
        return 1 if failed == len(kinds) else 0
    if not slot:
        log("Kein fälliger Termin.")
        return 0
    hhmm, kind = slot
    log(f"Termin {hhmm}: {kind}")
    kind, post = build(kind, posted)
    if post:
        publish(kind, post, posted, stamp)
    else:
        log("Nichts zu teilen.")
    if not DRY_RUN:
        done_today.append(hhmm)
        write_posted()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        gh_error("Social-Bot Fehler", e)
        raise
