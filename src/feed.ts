// Minimal RSS 2.0 / Atom parser without dependencies. Images and full content are ignored on
// purpose: we only keep title, link, a short teaser and the date.

import { stripHtml, decodeEntities } from "./text.ts";

export interface FeedItem {
  title: string;
  url: string;
  summary: string; // raw, cut later by cutTeaser()
  published: number; // ms epoch
  paywall: boolean;
}

function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) ?? links.find((a) => !/rel=/i.test(a)) ?? links[0];
  const href = pick?.match(/href=["']([^"']+)["']/i);
  return href ? decodeEntities(href[1]) : null;
}

const PAYWALL = /(\[(premium|plus|abo|\+)\]|\bS\+|\bZ\+|\bF\+|\bSZ Plus\b|^\s*(Premium|Abo)\s*[:|-]|^\+\s)/i;

function parseDate(s: string | null): number {
  if (!s) return Date.now();
  const t = Date.parse(stripHtml(s));
  return Number.isFinite(t) ? Math.min(t, Date.now()) : Date.now();
}

function cleanUrl(u: string): string | null {
  try {
    const url = new URL(u.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    for (const p of [...url.searchParams.keys()]) if (/^(utm_|wt_|ref$|xtor$)/i.test(p)) url.searchParams.delete(p);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function parseFeed(xml: string): FeedItem[] {
  const isAtom = /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(xml) && !/<item\b/i.test(xml);
  const blocks = isAtom
    ? [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0])
    : [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);

  const items: FeedItem[] = [];
  for (const b of blocks) {
    const rawTitle = tag(b, "title");
    const title = rawTitle ? stripHtml(rawTitle) : "";
    const link = isAtom ? atomLink(b) : stripHtml(tag(b, "link") ?? "") || (tag(b, "guid") ? stripHtml(tag(b, "guid")!) : "");
    const url = link ? cleanUrl(link) : null;
    if (!title || !url) continue;
    const summary = tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content") ?? "";
    const date = tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date");
    items.push({
      title: title.replace(PAYWALL, "").replace(/\s{2,}/g, " ").replace(/^[\s:|-]+|[\s:|-]+$/g, "").trim(),
      url,
      summary,
      published: parseDate(date),
      paywall: PAYWALL.test(title) || /<category[^>]*>\s*(?:<!\[CDATA\[)?\s*(plus|premium|abo)/i.test(b),
    });
  }
  return items;
}
