#!/usr/bin/env python3
"""Checks candidate RSS feeds: reachable, valid, fresh, allowed by robots.txt. Writes feed_check.json."""
import json, re, sys, time, urllib.robotparser
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse
import datetime as dt
import xml.etree.ElementTree as ET
import requests

UA = "DerBerichtBot/1.0 (+https://derbericht.com/quellen; office@derbericht.com)"
H = {"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"}

def robots_ok(url):
    p = urlparse(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        r = requests.get(f"{p.scheme}://{p.netloc}/robots.txt", headers={"User-Agent": UA}, timeout=15)
        if r.status_code >= 400:
            return True, f"robots {r.status_code}"
        rp.parse(r.text.splitlines())
        return rp.can_fetch("DerBerichtBot", url), "robots ok"
    except Exception as e:
        return True, f"robots err {e}"

def parse_date(s):
    if not s: return None
    try: return parsedate_to_datetime(s).timestamp()
    except Exception: pass
    try: return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except Exception: return None

out = []
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#"): continue
    fid, country, pub, cat, url = [x.strip() for x in line.split("|")]
    row = {"id": fid, "country": country, "publisher": pub, "category": cat, "url": url}
    try:
        r = requests.get(url, headers=H, timeout=20, allow_redirects=True)
        row["status"] = r.status_code; row["final_url"] = r.url; row["ctype"] = r.headers.get("content-type", "")
        root = ET.fromstring(r.content)
        items = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
        row["items"] = len(items)
        dates, titles, teasers = [], [], 0
        for it in items[:40]:
            t = it.findtext("title") or it.findtext("{http://www.w3.org/2005/Atom}title") or ""
            d = it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date") or it.findtext("{http://www.w3.org/2005/Atom}updated") or it.findtext("{http://www.w3.org/2005/Atom}published")
            ds = it.findtext("description") or it.findtext("{http://www.w3.org/2005/Atom}summary") or ""
            if ds.strip(): teasers += 1
            titles.append(t.strip()); ts = parse_date(d)
            if ts: dates.append(ts)
        row["newest_h"] = round((time.time() - max(dates)) / 3600, 1) if dates else None
        row["with_teaser"] = teasers
        row["sample"] = titles[:3]
        row["rights"] = (root.findtext(".//channel/copyright") or root.findtext("{http://www.w3.org/2005/Atom}rights") or "")[:200]
    except Exception as e:
        row["error"] = str(e)[:200]
    row["robots_allowed"], row["robots_note"] = robots_ok(url)
    out.append(row)
    print(fid, row.get("status"), row.get("items"), row.get("newest_h"), row.get("robots_allowed"), row.get("error", ""), flush=True)
json.dump(out, open("feed_check.json", "w"), ensure_ascii=False, indent=1)
