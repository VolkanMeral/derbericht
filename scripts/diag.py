"""Prints current stories and whether they have an AI illustration (as GitHub annotations)."""
import json
import time
import urllib.request

url = f"https://derbericht.com/api/social.json?min=3&img=0&hours=12&t={int(time.time())}"
req = urllib.request.Request(url, headers={"User-Agent": "derbericht-diag"})
data = json.load(urllib.request.urlopen(req, timeout=30))
for s in data["stories"]:
    age = (time.time() * 1000 - s["first_seen"]) / 3.6e6
    print(f"::notice::{s['sources']} Quellen | {age:.1f} h | Bild: {'ja' if s['image'] else 'nein'} | {s['title'][:70]}")
