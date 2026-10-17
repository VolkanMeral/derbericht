#!/usr/bin/env python3
"""For each publisher homepage: find Impressum / Nutzungsbedingungen / AGB / RSS pages and extract sentences
mentioning RSS, commercial use, text and data mining (§44b DE, §42h AT), databases or aggregators."""
import json, re, sys
from urllib.parse import urljoin, urlparse
import requests

UA = "Mozilla/5.0 (compatible; DerBerichtBot/1.0; +https://derbericht.com/quellen)"
KEY = re.compile(r"(RSS|kommerziell|gewerblich|Data[- ]?Mining|TDM|§\s*44b|§\s*42h|Datenbank|Aggregator|News-?Aggregator|Feeds?|nichtkommerziell|privaten Gebrauch|Vervielfältig|Nachdruck|Übernahme)", re.I)
LINK = re.compile(r'href="([^"#]+)"[^>]*>([^<]{0,80})<', re.I)
WANT = re.compile(r"(impressum|nutzungsbedingungen|agb|rss|terms|rechtliche|copyright|nutzungsrechte|lizenz)", re.I)

def text(html):
    html = re.sub(r"(?is)<(script|style|noscript).*?</\1>", " ", html)
    t = re.sub(r"(?s)<[^>]+>", " ", html)
    t = re.sub(r"&nbsp;|&#160;", " ", t)
    return re.sub(r"\s+", " ", t)

out = {}
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#"): continue
    name, home = [x.strip() for x in line.split("|")]
    res = {"home": home, "pages": {}}
    try:
        h = requests.get(home, headers={"User-Agent": UA}, timeout=20)
        links = {}
        for href, label in LINK.findall(h.text):
            u = urljoin(h.url, href)
            if urlparse(u).netloc.split(".")[-2:] == urlparse(h.url).netloc.split(".")[-2:] and WANT.search(href + " " + label):
                links[u] = label.strip()
        for u in list(links)[:8]:
            try:
                p = requests.get(u, headers={"User-Agent": UA}, timeout=20)
                t = text(p.text)
                hits = []
                for m in KEY.finditer(t):
                    s = t[max(0, m.start() - 160): m.end() + 200]
                    if not any(s[:60] in x for x in hits): hits.append(s)
                if hits: res["pages"][u] = hits[:12]
            except Exception as e:
                res["pages"][u] = [f"ERR {e}"]
    except Exception as e:
        res["error"] = str(e)[:200]
    out[name] = res
    print(name, len(res["pages"]), flush=True)
json.dump(out, open("terms_check.json", "w"), ensure_ascii=False, indent=1)
