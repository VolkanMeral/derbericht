// Server-rendered HTML. No external fonts, scripts or trackers (DSGVO-friendly by default).

import { CATEGORY_NAME, COUNTRY_FLAG, COUNTRY_NAME, type Category, type Country } from "./sources.ts";
import { escapeHtml as e } from "./text.ts";
import type { ArticleRow, Story } from "./types.ts";

export type Edition = Country | "dach";
export const EDITIONS: Edition[] = ["dach", "at", "de", "ch"];
export const EDITION_LABEL: Record<Edition, string> = { dach: "DACH", at: "Österreich", de: "Deutschland", ch: "Schweiz" };
export const CATEGORIES: Category[] = ["politik", "wirtschaft", "welt", "chronik", "regional", "sport", "kultur", "wissen"];

export interface PageMeta {
  title: string;
  description: string;
  path: string;
  siteUrl: string;
  siteName: string;
  edition: Edition;
  noindex?: boolean;
  hreflang?: boolean;
  banner?: { country: Country; path: string } | null;
  stats?: { articles: number; publishers: number } | null;
  breaking?: { id: string; title: string; count: number } | null;
}

const CSS = `
:root{--paper:#faf8f4;--ink:#1a1a1a;--muted:#666159;--rule:#e2ddd3;--accent:#a4161a;--card:#fff;--chip:#f0ece4;
--serif:Charter,"Bitstream Charter","Sitka Text",Cambria,Georgia,serif;--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#141311;--ink:#ece9e3;--muted:#a39e94;--rule:#2e2b27;--accent:#e5484d;--card:#1c1a17;--chip:#26231f}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 var(--sans)}
a{color:inherit;text-decoration:none}a:hover .h,a.h:hover{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px}
header.top{border-bottom:3px double var(--ink);background:var(--paper)}
.mast{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:18px 0 10px;flex-wrap:wrap}
.logo{font:700 clamp(30px,5vw,44px)/1 var(--serif);letter-spacing:-.02em}.logo span{color:var(--accent)}
.tag{font-size:13px;color:var(--muted)}
.ed{display:flex;gap:4px;flex-wrap:wrap}.ed a{font-size:13px;padding:5px 10px;border:1px solid var(--rule);border-radius:999px}
.ed a[aria-current]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
nav.cats{display:flex;gap:22px;overflow-x:auto;font-size:15px;border-top:1px solid var(--rule);scrollbar-width:none;margin-top:10px}
nav.cats a{white-space:nowrap;color:var(--muted);padding:10px 0 12px;border-bottom:2px solid transparent}
nav.cats a[aria-current]{color:var(--ink);font-weight:600;border-bottom-color:var(--accent)}
.dateline{font-size:13px;color:var(--muted);margin-top:4px}
.banner{background:var(--chip);font-size:14px;padding:10px 0}.banner .wrap{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.banner a{font-weight:600;text-decoration:underline}
main{padding:24px 0 48px}
h2.sec{font:700 13px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;margin:36px 0 14px;padding-top:10px;border-top:2px solid var(--ink);display:flex;justify-content:space-between}
h2.sec a{font-weight:400;letter-spacing:0;text-transform:none;color:var(--muted)}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(270px,1fr))}
.card{background:var(--card);border:1px solid var(--rule);border-radius:4px;overflow:hidden;display:flex;flex-direction:column}
.fig{position:relative;aspect-ratio:16/9;background:var(--chip);overflow:hidden}.fig img,.fig svg{width:100%;height:100%;object-fit:cover;display:block}
.ki{position:absolute;left:8px;bottom:8px;font-size:11px;background:rgba(0,0,0,.62);color:#fff;padding:2px 7px;border-radius:3px}
.body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}
.meta{font-size:12px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.meta b{color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.h{font:700 19px/1.25 var(--serif);margin:0}
.teaser{font-size:14px;color:var(--muted);margin:0}
.src{font-size:13px;color:var(--muted)}.src strong{color:var(--ink);font-weight:600}
.abo{font-size:10px;border:1px solid var(--muted);border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:1px}
ul.more{list-style:none;margin:4px 0 0;padding:8px 0 0;border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:6px;font-size:14px}
ul.more a{display:block}ul.more span{color:var(--muted);font-size:12px;display:block}
.all{font-size:13px;font-weight:600;margin-top:auto;padding-top:6px}
.lead{display:grid;gap:0;grid-template-columns:1.4fr 1fr}.lead .h{font-size:clamp(24px,3vw,32px)}.lead .fig{aspect-ratio:auto;min-height:100%}
@media (max-width:760px){.lead{grid-template-columns:1fr}.lead .fig{aspect-ratio:16/9}}
.cmp{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:4px}
.cmp>div{border-top:2px solid var(--ink);padding-top:8px}.cmp h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.cmp a{display:block;font:600 15px/1.3 var(--serif);margin-bottom:8px}.cmp a span{display:block;font:12px var(--sans);color:var(--muted)}
.story h1{font:700 clamp(26px,4vw,40px)/1.15 var(--serif);margin:8px 0 12px}
.story .fig{border-radius:4px;max-width:820px}
.story section{margin-top:28px}.story article{padding:14px 0;border-bottom:1px solid var(--rule)}
.story article a.h{font-size:20px;display:block;margin:2px 0 4px}
.empty{padding:48px 0;color:var(--muted);text-align:center}
.prose{max-width:720px}.prose h1{font:700 32px/1.2 var(--serif)}.prose h2{font:700 20px var(--serif);margin-top:28px}
.prose table{border-collapse:collapse;width:100%;font-size:14px}.prose td,.prose th{border-bottom:1px solid var(--rule);padding:6px 8px;text-align:left}
footer{border-top:1px solid var(--rule);padding:24px 0 40px;font-size:13px;color:var(--muted)}
footer .wrap{display:flex;gap:18px;flex-wrap:wrap;justify-content:space-between}footer nav{display:flex;gap:16px;flex-wrap:wrap}
footer a{text-decoration:underline}
.edpick{display:none;position:relative}
.edpick summary{list-style:none;height:44px;padding:0 14px;border-radius:999px;background:var(--ink);color:var(--paper);font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer}
.edpick summary::-webkit-details-marker{display:none}
.edmenu{display:none;position:absolute;right:0;top:52px;z-index:40;background:var(--card);border:1px solid var(--rule);border-radius:8px;flex-direction:column;min-width:200px;overflow:hidden}
.edpick[open] .edmenu{display:flex}.edmenu a{padding:13px 16px;font-size:15px;border-bottom:1px solid var(--rule)}.edmenu a:last-child{border-bottom:0}
.edmenu a[aria-current]{font-weight:600;color:var(--accent)}
.breaking{display:flex;gap:10px;align-items:center;background:var(--accent);color:#fff;border-radius:6px;padding:10px 12px;font-size:14px;margin-bottom:18px}
.breaking b{font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid rgba(255,255,255,.75);border-radius:3px;padding:2px 6px;font-weight:600;white-space:nowrap}
.avatars{display:none;align-items:center;gap:8px;padding-top:10px;border-top:1px solid var(--rule);font-size:13px;color:var(--muted)}
.avatars .avs{display:flex;padding-left:6px}.avatars strong{color:var(--ink);font-weight:600;margin-left:auto;white-space:nowrap}
.av{width:30px;height:30px;border-radius:50%;color:#fff;font-size:9px;letter-spacing:-.02em;font-weight:600;display:inline-flex;align-items:center;justify-content:center;border:2px solid var(--card);margin-left:-6px}
.bottomnav{display:none}
.edlist{display:flex;flex-direction:column;gap:10px;max-width:420px}
.edlist a{display:flex;justify-content:space-between;align-items:center;min-height:56px;padding:0 18px;border:1px solid var(--rule);border-radius:8px;background:var(--card);font-size:17px}
.edlist a[aria-current]{border-color:var(--ink);font-weight:600}
@media (max-width:640px){
 header.top{border-bottom:1px solid var(--rule)}
 .ed,.tag{display:none}.edpick{display:block}
 .mast{align-items:center;flex-wrap:nowrap;padding:16px 0 4px}.logo{font-size:30px}
 main{padding:16px 0 32px}
 h2.sec{margin:28px 0 4px}
 .grid{display:flex;flex-direction:column;gap:0}
 .grid .card:not(.cmpcard){flex-direction:row-reverse;gap:12px;background:none;border:0;border-bottom:1px solid var(--rule);border-radius:0;padding:14px 0;align-items:flex-start}
 .grid .card:not(.cmpcard) .fig{width:84px;height:84px;aspect-ratio:auto;border-radius:6px;flex-shrink:0}
 .grid .card:not(.cmpcard) .ki{left:3px;bottom:3px;font-size:9px;padding:1px 4px}
 .grid .card:not(.cmpcard) .body{padding:0;gap:6px}
 .grid .card:not(.cmpcard) .h{font-size:18px;line-height:1.22}
 .grid .card:not(.cmpcard) :is(.teaser,ul.more,.all){display:none}
 .cmpcard{margin-bottom:14px}.cmpcard .fig{display:none}.cmp{grid-template-columns:1fr}
 .lead{border-radius:6px}.lead .h{font-size:24px;line-height:1.18}
 .lead :is(ul.more,.all){display:none}.lead .avatars{display:flex}
 .bottomnav{display:grid;position:fixed;left:0;right:0;bottom:0;z-index:30;grid-template-columns:repeat(4,minmax(0,1fr));background:var(--paper);border-top:1px solid var(--rule);padding:6px 8px calc(10px + env(safe-area-inset-bottom))}
 .bottomnav a{min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11px;color:var(--muted)}
 .bottomnav a[aria-current]{color:var(--accent);font-weight:600}
 footer{padding-bottom:110px}
}
`;

// --- helpers ---------------------------------------------------------------

export function ago(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return new Date(ts).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Vienna" });
}

const CAT_HUE: Record<Category, string> = {
  politik: "#7a2e2e", wirtschaft: "#2f5d50", welt: "#2c4a6e", sport: "#3f6b2a",
  kultur: "#6b3f6e", wissen: "#2a5f6b", chronik: "#5a5047", regional: "#4d6b3a",
};

function icon(cat: Category): string {
  const c = CAT_HUE[cat];
  const shapes: Record<Category, string> = {
    politik: `<path d="M120 60 L200 30 L280 60 Z" fill="${c}" opacity=".9"/><rect x="130" y="66" width="140" height="8" fill="${c}"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${140 + i * 28}" y="80" width="12" height="52" fill="${c}" opacity=".75"/>`).join("")}<rect x="120" y="134" width="160" height="10" fill="${c}"/>`,
    wirtschaft: `<polyline points="110,140 160,110 200,122 250,80 290,60" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="290" cy="60" r="9" fill="${c}"/>`,
    welt: `<circle cx="200" cy="92" r="52" fill="none" stroke="${c}" stroke-width="7"/><ellipse cx="200" cy="92" rx="22" ry="52" fill="none" stroke="${c}" stroke-width="5"/><line x1="148" y1="92" x2="252" y2="92" stroke="${c}" stroke-width="5"/>`,
    sport: `<circle cx="200" cy="92" r="50" fill="none" stroke="${c}" stroke-width="7"/><polygon points="200,70 221,85 213,110 187,110 179,85" fill="${c}"/>`,
    kultur: `<path d="M150 60 Q200 40 250 60 L250 110 Q200 140 150 110 Z" fill="none" stroke="${c}" stroke-width="7"/><circle cx="182" cy="82" r="6" fill="${c}"/><circle cx="218" cy="82" r="6" fill="${c}"/><path d="M180 104 Q200 118 220 104" stroke="${c}" stroke-width="6" fill="none"/>`,
    wissen: `<path d="M180 46 L180 86 L150 136 L250 136 L220 86 L220 46" fill="none" stroke="${c}" stroke-width="7" stroke-linejoin="round"/><line x1="170" y1="46" x2="230" y2="46" stroke="${c}" stroke-width="7"/><circle cx="196" cy="118" r="7" fill="${c}"/><circle cx="214" cy="106" r="5" fill="${c}"/>`,
    chronik: `${[0, 1, 2, 3].map((i) => `<rect x="${120 + i * 42}" y="${66 - (i % 2) * 22}" width="32" height="${78 + (i % 2) * 22}" fill="${c}" opacity="${0.6 + i * 0.1}"/>`).join("")}`,
    regional: `<path d="M100 140 L170 60 L210 105 L245 75 L310 140 Z" fill="${c}" opacity=".85"/><path d="M160 72 L170 60 L180 72 Z" fill="#fff" opacity=".8"/>`,
  };
  return `<svg viewBox="0 0 400 180" role="img" aria-label="${e(CATEGORY_NAME[cat])}" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="180" fill="${c}" opacity=".1"/>${shapes[cat]}</svg>`;
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (/^[A-ZÄÖÜ]{2,4}$/.test(words[0] ?? "")) return words[0];
  if (words.length > 1) return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

function avatarColor(name: string): string {
  const hues = Object.values(CAT_HUE);
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return hues[h % hues.length];
}

function figure(s: Story): string {
  if (s.image_status === "done" && s.image_key) {
    return `<div class="fig"><img src="/img/${e(s.image_key)}" alt="" loading="lazy" width="1024" height="576"><span class="ki">KI-Illustration</span></div>`;
  }
  return `<div class="fig">${icon(s.category)}</div>`;
}

function flags(countries: string): string {
  return countries.split(",").filter(Boolean).map((c) => COUNTRY_FLAG[c as Country] ?? "").join(" ");
}

function outLink(a: ArticleRow, cls = "h"): string {
  return `<a class="${cls}" href="${e(a.url)}" target="_blank" rel="noopener">${e(a.title)}</a>`;
}

function srcLine(a: ArticleRow): string {
  return `<div class="src"><strong>${e(a.publisher ?? "")}</strong>${a.paywall ? '<span class="abo">Abo</span>' : ""} · ${ago(a.published)}</div>`;
}

// --- cards -----------------------------------------------------------------

export function card(s: Story, big = false): string {
  const others = s.articles.filter((a) => a.id !== s.lead.id);
  const more = others.slice(0, big ? 4 : 2).map((a) =>
    `<li><a href="${e(a.url)}" target="_blank" rel="noopener">${e(a.title)}<span>${COUNTRY_FLAG[a.country]} ${e(a.publisher ?? "")}${a.paywall ? " · Abo" : ""} · ${ago(a.published)}</span></a></li>`).join("");
  const n = s.articles.length;
  return `<div class="card${big ? " lead" : ""}">${figure(s)}<div class="body">
    <div class="meta"><b>${e(CATEGORY_NAME[s.category])}</b><span>${flags(s.countries)}</span><span>${n} ${n === 1 ? "Quelle" : "Quellen"}</span></div>
    ${outLink(s.lead)}
    ${srcLine(s.lead)}
    ${s.lead.teaser ? `<p class="teaser">${e(s.lead.teaser)}</p>` : ""}
    ${more ? `<ul class="more">${more}</ul>` : ""}
    ${big && others.length ? `<a class="avatars" href="/story/${e(s.id)}"><span class="avs">${others.slice(0, 3).map((a) => `<span class="av" style="background:${avatarColor(a.publisher ?? "")}" aria-hidden="true">${e(initials(a.publisher ?? ""))}</span>`).join("")}</span><span>+${others.length} weitere</span><strong>Vergleichen →</strong></a>` : ""}
    ${n > 1 ? `<a class="all" href="/story/${e(s.id)}">Alle ${n} Quellen vergleichen →</a>` : ""}
  </div></div>`;
}

export function compareCard(s: Story): string {
  const by: Partial<Record<Country, ArticleRow[]>> = {};
  for (const a of s.articles) (by[a.country] ??= []).push(a);
  const cols = (["at", "de", "ch"] as Country[]).filter((c) => by[c]?.length).map((c) =>
    `<div><h4>${COUNTRY_FLAG[c]} ${COUNTRY_NAME[c]}</h4>${by[c]!.slice(0, 3).map((a) =>
      `<a href="${e(a.url)}" target="_blank" rel="noopener">${e(a.title)}<span>${e(a.publisher ?? "")}${a.paywall ? " · Abo" : ""} · ${ago(a.published)}</span></a>`).join("")}</div>`).join("");
  return `<div class="card cmpcard">${figure(s)}<div class="body">
    <div class="meta"><b>${e(CATEGORY_NAME[s.category])}</b><span>${s.articles.length} Quellen aus ${s.countries.split(",").length} Ländern</span></div>
    <div class="cmp">${cols}</div>
    <a class="all" href="/story/${e(s.id)}">Zum Vergleich →</a>
  </div></div>`;
}

// --- layout ----------------------------------------------------------------

function editionPath(ed: Edition): string { return ed === "dach" ? "/" : `/${ed}`; }

const ICON = {
  top: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>',
  cmp: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>',
  reg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20l6-11 4 6 3-4 5 9z"/></svg>',
  ed: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
};

function bottomNav(m: PageMeta, base: string): string {
  const home = base || "/";
  const items: [string, string, string, boolean][] = [
    [home, "Top", ICON.top, m.path === home],
    ["/vergleich", "Vergleich", ICON.cmp, m.path === "/vergleich"],
    [`${base}/regional`, "Regional", ICON.reg, m.path === `${base}/regional`],
    ["/ausgabe", "Ausgabe", ICON.ed, m.path === "/ausgabe"],
  ];
  return `<nav class="bottomnav" aria-label="Schnellmenü">${items.map(([href, label, icon, cur]) => `<a href="${href}"${cur ? ' aria-current="page"' : ""}>${icon}${label}</a>`).join("")}</nav>`;
}

export function editionChooser(current: Edition): string {
  return `<h2 class="sec" style="margin-top:0">Ausgabe wählen</h2><p class="teaser" style="margin:-4px 0 16px">Welche Nachrichten sollen zuerst erscheinen?</p><div class="edlist">${EDITIONS.map((ed) =>
    `<a href="/wechseln?e=${ed}&amp;r=${encodeURIComponent(editionPath(ed))}"${ed === current ? ' aria-current="true"' : ""}><span>${ed === "dach" ? "Alle Länder (DACH)" : `${COUNTRY_FLAG[ed]} ${EDITION_LABEL[ed]}`}</span>${ed === current ? "<span>✓</span>" : ""}</a>`).join("")}</div>`;
}

export function layout(m: PageMeta, body: string, activeCat?: Category): string {
  const url = m.siteUrl + m.path;
  const base = m.edition === "dach" ? "" : `/${m.edition}`;
  const hreflang = m.hreflang
    ? `<link rel="alternate" hreflang="de-AT" href="${m.siteUrl}/at"><link rel="alternate" hreflang="de-DE" href="${m.siteUrl}/de"><link rel="alternate" hreflang="de-CH" href="${m.siteUrl}/ch"><link rel="alternate" hreflang="x-default" href="${m.siteUrl}/">`
    : "";
  const banner = m.banner
    ? `<div class="banner"><div class="wrap"><span>${COUNTRY_FLAG[m.banner.country]} Sie scheinen in ${COUNTRY_NAME[m.banner.country]} zu sein.</span><a href="/wechseln?e=${m.banner.country}&amp;r=${encodeURIComponent(`/${m.banner.country}`)}">Zur Ausgabe ${COUNTRY_NAME[m.banner.country]} wechseln</a><a href="/wechseln?e=${m.edition}&amp;r=${encodeURIComponent(m.path)}" style="font-weight:400">Hier bleiben</a></div></div>`
    : "";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(m.title)}</title><meta name="description" content="${e(m.description)}"><link rel="canonical" href="${e(url)}">
${m.noindex ? '<meta name="robots" content="noindex,follow">' : ""}${hreflang}
<meta property="og:title" content="${e(m.title)}"><meta property="og:description" content="${e(m.description)}"><meta property="og:url" content="${e(url)}"><meta property="og:site_name" content="${e(m.siteName)}">
<meta name="theme-color" content="#faf8f4"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23a4161a'/%3E%3Ctext x='16' y='23' font-family='Georgia' font-size='20' font-weight='700' fill='white' text-anchor='middle'%3EB%3C/text%3E%3C/svg%3E">
<style>${CSS}</style></head><body>
<header class="top"><div class="wrap">
  <div class="mast"><a href="/" class="logo">Der Bericht<span>.</span></a>
    <div class="ed" aria-label="Ausgabe">${EDITIONS.map((ed) => `<a href="/wechseln?e=${ed}&amp;r=${encodeURIComponent(editionPath(ed))}"${ed === m.edition ? ' aria-current="page"' : ""}>${ed === "dach" ? "DACH" : `${COUNTRY_FLAG[ed]} ${ed.toUpperCase()}`}</a>`).join("")}</div>
    <details class="edpick"><summary aria-label="Ausgabe wählen: ${e(EDITION_LABEL[m.edition])}">${m.edition === "dach" ? "DACH" : m.edition.toUpperCase()}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
      <div class="edmenu">${EDITIONS.map((ed) => `<a href="/wechseln?e=${ed}&amp;r=${encodeURIComponent(editionPath(ed))}"${ed === m.edition ? ' aria-current="true"' : ""}>${ed === "dach" ? "Alle Länder (DACH)" : `${COUNTRY_FLAG[ed]} ${EDITION_LABEL[ed]}`}</a>`).join("")}</div></details></div>
  <div class="tag">Nachrichten aus Österreich, Deutschland und der Schweiz – aus vielen Redaktionen, auf einen Blick. Volltext immer beim Herausgeber.</div>
  <div class="dateline">${new Date().toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Vienna" })}${m.stats && m.stats.articles ? ` · ${m.stats.articles} Meldungen aus ${m.stats.publishers} Redaktionen` : ""}</div>
  <nav class="cats"><a href="${base || "/"}"${!activeCat ? ' aria-current="page"' : ""}>Top</a><a href="/vergleich">DACH-Vergleich</a>${CATEGORIES.map((c) => `<a href="${base}/${c}"${c === activeCat ? ' aria-current="page"' : ""}>${CATEGORY_NAME[c]}</a>`).join("")}</nav>
</div></header>${banner}
<main><div class="wrap">${m.breaking ? `<a class="breaking" href="/story/${e(m.breaking.id)}"><b>Eilmeldung</b><span>${e(m.breaking.title)} – ${m.breaking.count} Quellen</span></a>` : ""}${body}</div></main>
<footer><div class="wrap"><div>© ${new Date().getFullYear()} ${e(m.siteName)} · Wir zeigen Schlagzeilen und kurze Auszüge mit Link zum Originalartikel. Bilder mit dem Hinweis „KI-Illustration“ sind KI-generiert und zeigen keine realen Ereignisse.</div>
<nav><a href="/quellen">Quellen &amp; Opt-out</a><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></nav></div></footer>
${bottomNav(m, base)}
</body></html>`;
}

// --- pages -----------------------------------------------------------------

export function homeBody(top: Story[], compare: Story[], byCat: [Category, Story[]][], base: string): string {
  if (!top.length) return `<div class="empty">Die ersten Meldungen werden gerade geladen. Bitte in ein paar Minuten wieder vorbeischauen.</div>`;
  const [first, ...rest] = top;
  let html = `<h2 class="sec" style="margin-top:0">Jetzt wichtig</h2>${card(first, true)}<div class="grid" style="margin-top:20px">${rest.slice(0, 8).map((s) => card(s)).join("")}</div>`;
  if (compare.length) html += `<h2 class="sec">DACH-Vergleich <a href="/vergleich">Alle →</a></h2><div class="grid">${compare.slice(0, 3).map(compareCard).join("")}</div>`;
  for (const [cat, list] of byCat) {
    if (!list.length) continue;
    html += `<h2 class="sec">${CATEGORY_NAME[cat]} <a href="${base}/${cat}">Mehr →</a></h2><div class="grid">${list.slice(0, 4).map((s) => card(s)).join("")}</div>`;
  }
  return html;
}

export function listBody(title: string, list: Story[], intro = ""): string {
  return `<h2 class="sec" style="margin-top:0">${e(title)}</h2>${intro}${list.length ? `<div class="grid">${list.map((s) => card(s)).join("")}</div>` : '<div class="empty">Zurzeit keine Meldungen.</div>'}`;
}

export function compareBody(list: Story[]): string {
  const intro = `<p class="teaser" style="margin:-4px 0 18px">Dieselbe Nachricht, drei Länder: So berichten Redaktionen in Österreich, Deutschland und der Schweiz.</p>`;
  return `<h2 class="sec" style="margin-top:0">DACH-Vergleich</h2>${intro}${list.length ? `<div class="grid">${list.map(compareCard).join("")}</div>` : '<div class="empty">Gerade gibt es keine Geschichte, über die in mehreren Ländern berichtet wird.</div>'}`;
}

export function storyBody(s: Story): string {
  const by: Partial<Record<Country, ArticleRow[]>> = {};
  for (const a of s.articles) (by[a.country] ??= []).push(a);
  const sections = (["at", "de", "ch"] as Country[]).filter((c) => by[c]?.length).map((c) =>
    `<section><h2 class="sec">${COUNTRY_FLAG[c]} ${COUNTRY_NAME[c]} · ${by[c]!.length}</h2>${by[c]!.map((a) =>
      `<article>${srcLine(a)}${outLink(a)}${a.teaser ? `<p class="teaser">${e(a.teaser)}</p>` : ""}</article>`).join("")}</section>`).join("");
  return `<div class="story"><div class="meta"><b>${e(CATEGORY_NAME[s.category])}</b><span>${flags(s.countries)}</span><span>${s.articles.length} Quellen · zuerst ${ago(s.first_seen)}, zuletzt ${ago(s.last_update)}</span></div>
  <h1>${e(s.lead.title)}</h1>${figure(s)}
  <p class="teaser" style="margin-top:12px">Die Schlagzeile stammt von ${e(s.lead.publisher ?? "")}. Alle Artikel öffnen sich beim jeweiligen Herausgeber.</p>${sections}</div>`;
}
