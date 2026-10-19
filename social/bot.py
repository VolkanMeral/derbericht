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

KOK = os.path.dirname(os.path.abspath(__file__))
CIKTI = os.path.join(KOK, "cikti")
DURUM = os.path.join(KOK, "posted.json")

SITE = os.getenv("SITE_URL", "https://derbericht.com").rstrip("/")
GRAPH_VERSION = os.getenv("GRAPH_VERSION", "v26.0")
DRY_RUN = os.getenv("DRY_RUN", "1") == "1"
CHECK_ONLY = os.getenv("CHECK_ONLY", "0") == "1"
MIN_SOURCES = int(os.getenv("MIN_SOURCES", "3") or 3)
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

def read_posted():
    try:
        with open(DURUM, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def write_posted(rows):
    with open(DURUM, "w", encoding="utf-8") as f:
        json.dump(rows[-500:], f, ensure_ascii=False, indent=1)


def stories():
    r = HTTP.get(f"{SITE}/api/social.json", params={"min": MIN_SOURCES}, timeout=30)
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
    tail = f"\n\nBild: KI-Illustration (keine reale Aufnahme)\n{HASHTAGS} #{cat}"
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
        "kategorie": s["category_name"], "zeit": when, "bild": s["image"], "titel": s["title"],
        "quelle": s["publisher"] or "", "auch": f" · auch {names}" if names else "", "anzahl": str(s["sources"]),
        "laender": rows,
    }
    for k, v in values.items():
        tpl = tpl.replace("{{" + k + "}}", v if k == "laender" else html.escape(v))
    return tpl


def render(s, path):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 1080, "height": 1350}, device_scale_factor=1)
        page.set_content(card_html(s), wait_until="networkidle")
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
        log(f"Gespeichertes Token: Typ {info.get('type')}, " + ("läuft nie ab" if not exp else f"läuft in {days:.0f} Tagen ab"))
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

def main():
    if CHECK_ONLY:
        connection_check()
        return 0
    os.makedirs(CIKTI, exist_ok=True)
    posted = read_posted()
    s = pick(stories(), posted)
    if "--kontrol" in sys.argv:
        log("Neue Geschichte:", s["title"] if s else "keine")
        out = os.getenv("GITHUB_OUTPUT")
        if out:
            with open(out, "a") as f:
                f.write(f"neu={'true' if s else 'false'}\n")
        return 0
    if not s:
        log("Keine neue Geschichte zum Teilen.")
        return 0
    log(f"Ausgewählt: {s['title']} | {s['sources']} Quellen | {s['category_name']}")
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    image = render(s, os.path.join(CIKTI, f"{stamp}.jpg"))
    texts = {k: caption(s, k) for k in ("facebook", "instagram", "threads")}
    with open(os.path.join(CIKTI, f"{stamp}.txt"), "w", encoding="utf-8") as f:
        f.write("\n\n".join(f"--- {k.upper()} ---\n{v}" for k, v in texts.items()))
    log("Bild erzeugt:", image)
    if DRY_RUN:
        log("TESTMODUS (DRY_RUN=1): nichts geteilt. Bild und Texte liegen unter Artifacts.")
        return 0
    if not (PAGE_ID and PAGE_TOKEN):
        log("FEHLER: META_PAGE_ID / META_PAGE_TOKEN fehlen.")
        return 1

    row = {"id": s["id"], "title": s["title"], "time": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}

    def save():
        if row not in posted:
            posted.append(row)
        write_posted(posted)

    fb_id, fb_image = facebook_photo(image, texts["facebook"])
    row["facebook"] = fb_id
    log("Facebook geteilt:", fb_id)
    save()  # from here on the story counts as shared, even if a later step fails

    def attempt(name, fn):
        try:
            row[name] = fn()
            log(f"{name} geteilt:", row[name])
        except Exception as e:  # noqa: BLE001
            row[f"{name}_fehler"] = str(e)[:300]
            gh_error(f"{name} Fehler", e)
        save()

    if IG_USER_ID:
        attempt("instagram", lambda: instagram_photo(fb_image, texts["instagram"]))
    if THREADS_TOKEN:
        attempt("threads", lambda: threads_post(texts["threads"], s["url"]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        gh_error("Social-Bot Fehler", e)
        raise
