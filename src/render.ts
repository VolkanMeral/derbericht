// Server-rendered HTML in the calm design: warm off-white ground, one accent colour, KI illustrations
// carry the colour. Bricolage Grotesque headlines, Geist text, light DACH comparison band. Fonts are self-hosted under /fonts
// (copied at build time, see scripts/fonts.mjs); no third-party requests (DSGVO).

import { SOCIAL_CSS, SOCIAL_JS, reactBar, shareBar, type Counts } from "./social.ts";
import { CATEGORY_NAME, COUNTRY_NAME, type Category, type Country } from "./sources.ts";
import { escapeHtml as e } from "./text.ts";
import type { ArticleRow, Story } from "./types.ts";

export type Edition = Country | "dach";
export const EDITIONS: Edition[] = ["dach", "at", "de", "ch"];
export const EDITION_LABEL: Record<Edition, string> = { dach: "DACH", at: "Österreich", de: "Deutschland", ch: "Schweiz" };
export const CATEGORIES: Category[] = ["politik", "wirtschaft", "welt", "chronik", "regional", "sport", "kultur", "wissen"];
const COUNTRIES: Country[] = ["at", "de", "ch"];

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
  topAd?: string;
  image?: string; // absolute URL for link previews (WhatsApp, Facebook …)
  query?: string; // current search text
}

export interface HomeExtras { posts?: string; sideAd?: string; feedAd?: string; reactions?: Record<string, Counts>; siteUrl?: string }

const CSS = `
@font-face{font-family:"Bricolage";src:url(/fonts/bricolage.woff2) format("woff2");font-weight:200 800;font-display:swap}
@font-face{font-family:"Geist";src:url(/fonts/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}
:root{--bg:#fafaf8;--surface:#f1f0ec;--card:#fff;--ink:#111113;--muted:#6b6b72;--line:#e8e7e3;--accent:#c8321c;--accent-soft:#f08a74;
--band:#111113;--band-card:#1d1d21;--band-muted:#a9a9b0;--band-line:#2c2c31;
--display:"Bricolage","Avenir Next","Segoe UI",system-ui,sans-serif;--text:"Geist",system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f11;--surface:#1a1a1d;--card:#151518;--ink:#efefea;--muted:#a3a3aa;--line:#2a2a2e;--accent:#ef5a40;
--band:#1a1a1d;--band-card:#232328;--band-line:#33333a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 var(--text)}
a{color:inherit;text-decoration:none}a:hover .t,a.t:hover{color:var(--accent)}
img{display:block}
.wrap{max-width:1280px;margin:0 auto;padding:0 32px}
/* header */
header.top{border-bottom:1px solid var(--line);background:var(--card)}
.bar{display:flex;align-items:center;gap:20px;padding:18px 0 14px}
.logo{font:800 30px/1 var(--display);letter-spacing:-.04em;white-space:nowrap}.logo span{color:var(--accent)}
.dateline{font-size:13px;color:var(--muted)}
.search{flex:1 1 240px;max-width:380px;height:44px;display:flex;align-items:center;gap:10px;padding:0 16px;background:var(--surface);border-radius:999px;color:var(--muted);border:1px solid transparent}
.search:focus-within{border-color:var(--ink);background:var(--card)}
.search input{flex:1;min-width:0;border:0;background:none;font:400 15px var(--text);color:var(--ink);outline:none}
.search input::-webkit-search-cancel-button{display:none}
.sbtn{display:none;width:44px;height:44px;border-radius:999px;border:1px solid var(--line);background:var(--card);align-items:center;justify-content:center;margin-left:auto;color:var(--ink)}
.bigsearch{display:flex;gap:10px;margin:0 0 20px}.bigsearch .search{max-width:none;height:54px;flex:1;font-size:17px}.bigsearch .search input{font-size:17px}
.bigsearch button{height:54px;padding:0 22px;border-radius:999px;border:0;background:var(--ink);color:var(--bg);font:600 15px var(--text);cursor:pointer}
.hint{color:var(--muted);font-size:15px;margin:0 0 24px}
.hint a{display:inline-block;margin:6px 6px 0 0;padding:6px 14px;border:1px solid var(--line);border-radius:999px;color:var(--ink);background:var(--card)}
@media (max-width:1240px){.dateline-wide{display:none}}
.seg{margin-left:auto;display:flex;padding:4px;background:var(--surface);border-radius:999px;gap:2px}
.seg a{height:36px;padding:0 14px;border-radius:999px;display:flex;align-items:center;font-size:14px;font-weight:500;color:var(--muted)}
.seg a[aria-current]{background:var(--ink);color:var(--bg);font-weight:600}
.chips{display:flex;gap:26px;padding:0;overflow-x:auto;scrollbar-width:none}.chips::-webkit-scrollbar{display:none}
.chips a{flex-shrink:0;padding:8px 0 13px;display:flex;align-items:center;font-size:15px;color:var(--muted);border-bottom:2px solid transparent;white-space:nowrap}
.chips a:hover{color:var(--ink)}.chips a[aria-current]{color:var(--ink);border-bottom-color:var(--ink);font-weight:600}
.edpick{display:none;position:relative;margin-left:auto}
.edpick summary{list-style:none;height:44px;padding:0 14px;border-radius:999px;background:var(--ink);color:var(--bg);font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer}
.edpick summary::-webkit-details-marker{display:none}
.edmenu{display:none;position:absolute;right:0;top:52px;z-index:40;background:var(--card);border:1px solid var(--line);border-radius:14px;flex-direction:column;min-width:210px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.08)}
.edpick[open] .edmenu{display:flex}.edmenu a{padding:13px 16px;font-size:15px;border-bottom:1px solid var(--line)}.edmenu a:last-child{border-bottom:0}
.edmenu a[aria-current]{font-weight:600;color:var(--accent)}
.banner{background:var(--surface);font-size:14px;padding:10px 0}.banner .wrap{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.banner a{font-weight:600;text-decoration:underline}
/* layout */
main{padding:28px 0 64px}
.stack{display:flex;flex-direction:column;gap:56px}
.breaking{display:flex;gap:12px;align-items:center;background:var(--accent);color:#fff;border-radius:14px;padding:12px 16px;font-size:15px;font-weight:500;margin-bottom:28px}
.breaking b{font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid rgba(255,255,255,.75);border-radius:999px;padding:2px 9px;font-weight:600;white-space:nowrap}
.sechead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}
.sechead h2{margin:0;font:700 28px/1.1 var(--display);letter-spacing:-.02em}
.sechead a{font-size:14px;font-weight:600}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
/* figure */
.fig{position:relative;overflow:hidden;background:var(--surface);border-radius:18px;aspect-ratio:4/3}
.fig img,.fig svg{width:100%;height:100%;object-fit:cover}
.ki{position:absolute;left:12px;bottom:12px;font-size:11px;font-weight:500;background:rgba(17,17,19,.78);color:#fff;padding:3px 9px;border-radius:999px}
/* meta */
.meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.cat{color:var(--accent);font-weight:600}
.abo{font-size:11px;border:1px solid var(--muted);border-radius:4px;padding:0 4px;margin-left:4px;color:var(--muted)}
.bars{display:inline-flex;gap:3px;align-items:center}.bars i{width:6px;height:18px;border-radius:3px;background:var(--line)}.bars i.on{background:var(--accent)}
/* hero */
.hero{display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start}
.lead{flex:2 1 560px;min-width:0;display:flex;flex-direction:column;gap:16px}
.lead .fig{aspect-ratio:16/9;border-radius:20px}
.lead h1{margin:0;font:700 clamp(30px,4vw,48px)/1.05 var(--display);letter-spacing:-.03em}
.lead p{margin:0;font-size:17px;color:var(--muted);max-width:680px}
.avatars{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding-top:2px;font-size:14px}
.avatars .src{color:var(--muted)}.avatars .src strong{color:var(--ink);font-weight:600}
.btn{height:44px;padding:0 20px;border-radius:999px;background:var(--ink);color:var(--bg);font-size:14px;font-weight:600;display:inline-flex;align-items:center;white-space:nowrap}
.btn:hover{opacity:.9}
.avatars .btn{margin-left:auto}
.leadsocial{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--line)}.leadsocial .share{margin-left:auto}
.feed{flex:1 1 320px;min-width:0;display:flex;flex-direction:column}
.feed h2{margin:0;padding-bottom:12px;border-bottom:2px solid var(--ink);font:700 22px var(--display);letter-spacing:-.02em;display:flex;align-items:center;gap:10px}
.dot{width:10px;height:10px;border-radius:50%;background:var(--accent);flex-shrink:0}
.feed a{display:grid;grid-template-columns:52px minmax(0,1fr);gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
.feed a:last-child{border-bottom:0}
.feed time{font-size:13px;font-weight:600;color:var(--accent)}
.feed .t{font-size:16px;font-weight:500;line-height:1.35;display:block}
.feed small{font-size:13px;color:var(--muted)}
/* DACH band */
.band{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:24px;padding:32px;display:flex;flex-direction:column;gap:24px}
.band h2{margin:6px 0 0;font:700 clamp(24px,3vw,34px)/1.12 var(--display);letter-spacing:-.02em;max-width:780px}
.band .head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.band h2{font-size:clamp(22px,2.6vw,30px)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px}
.col{border-left:1px solid var(--line);padding:0 0 0 22px;display:flex;flex-direction:column;gap:10px}
.col .pill{align-self:flex-start;font-size:12px;font-weight:600;padding:4px 11px;border-radius:999px;background:var(--surface);color:var(--ink);display:inline-flex;align-items:center}
.flag{display:inline-block;vertical-align:-2px;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.12);flex-shrink:0}
.flags{display:inline-flex;gap:4px;align-items:center}
.seg a .flag,.edmenu .flag,.edlist .flag,.edpick summary .flag{margin-right:6px}
.seg a .flags,.edmenu .flags,.edlist .flags{margin-right:6px;gap:2px}
.pill .flag{margin-right:6px;vertical-align:-2px}
.pill .short{display:none}
.pill-at{background:#c8321c;color:#fff}.pill-de{background:#fff;color:#111113}.pill-ch{border:1px solid #fff}
.col a{font:600 19px/1.25 var(--display);color:var(--ink)}.col a:hover{color:var(--accent)}
.col small{font-size:13px;color:var(--muted)}
.col .more{display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px solid var(--line)}
.col .more a{font:500 15px/1.35 var(--text)}
/* cards */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:28px 24px}
.card{display:flex;flex-direction:column;gap:12px;min-width:0}
.card .t{font:600 21px/1.22 var(--display);letter-spacing:-.01em}
.card .sub{font-size:13px;color:var(--muted)}
.card .fig{border-radius:16px}
.rx{font-size:13px;color:var(--muted);letter-spacing:.01em}
/* lists */
.lists{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:32px}
.list h3{margin:0 0 4px;padding-bottom:10px;border-bottom:2px solid var(--ink);font:700 22px var(--display);letter-spacing:-.02em;display:flex;justify-content:space-between;align-items:baseline}
.list h3 a{font:600 14px var(--text)}
.list a.row{display:block;padding:14px 0;border-bottom:1px solid var(--line)}
.list a.row:last-child{border-bottom:0}
.list a.row.th{display:grid;grid-template-columns:84px minmax(0,1fr);gap:14px;align-items:start}.list .th img{width:84px;height:84px;border-radius:12px;object-fit:cover}
.list .t{font-size:16px;font-weight:500;line-height:1.35}
.list small{display:block;font-size:13px;color:var(--muted);margin-top:2px}
/* story page */
.storyhead{display:flex;flex-wrap:wrap;gap:40px;align-items:flex-end;margin-bottom:36px}
.storyhead .l{flex:3 1 560px;min-width:0;display:flex;flex-direction:column;gap:14px}
.storyhead h1{margin:0;font:700 clamp(32px,4.5vw,52px)/1.03 var(--display);letter-spacing:-.035em}
.storyhead p{margin:0;font-size:18px;color:var(--muted);max-width:720px}
.cover{flex:1 1 280px;display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:16px;background:var(--surface)}
.cover b{font-size:13px;color:var(--muted);font-weight:600}
.cover div{display:flex;align-items:center;gap:10px;font-size:14px}.cover span:first-child{width:118px;display:flex;align-items:center;gap:8px}
.cover .track{flex:1;height:10px;border-radius:5px;background:var(--line);overflow:hidden;display:flex}
.cover .track i{display:block;height:100%}.cover strong{width:18px;text-align:right}
.ccols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px;align-items:start}
.ccol{border:1px solid var(--line);border-radius:20px;overflow:hidden;background:var(--card)}
.ccol header{padding:16px 20px;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600}
.ccol header span:first-child{font:700 20px var(--display);display:flex;align-items:center;gap:10px}
.h-at,.h-de,.h-ch{background:var(--surface);border-bottom:1px solid var(--line)}
.ccol a{display:flex;flex-direction:column;gap:6px;padding:18px 20px;border-bottom:1px solid var(--line)}.ccol a:last-child{border-bottom:0}
.ccol .t{font:600 19px/1.25 var(--display)}
.ccol small{font-size:13px;color:var(--muted)}.ccol small strong{color:var(--ink);font-weight:600}
.ccol p{margin:0;font-size:14px;color:var(--muted)}
.note{font-size:14px;color:var(--muted);margin-top:28px}
.empty{padding:56px 0;color:var(--muted);text-align:center}
.prose{max-width:720px}.prose h1{font:700 36px/1.15 var(--display);letter-spacing:-.02em}.prose h2{font:700 22px var(--display);margin-top:28px}
.prose table{border-collapse:collapse;width:100%;font-size:14px}.prose td,.prose th{border-bottom:1px solid var(--line);padding:8px;text-align:left}
.edlist{display:flex;flex-direction:column;gap:10px;max-width:440px}
.edlist a{display:flex;justify-content:space-between;align-items:center;min-height:56px;padding:0 18px;border:1px solid var(--line);border-radius:14px;font-size:17px}
.edlist a[aria-current]{border-color:var(--ink);font-weight:600}
footer.foot{border-top:1px solid var(--line);background:var(--surface);padding:32px 0;font-size:14px;color:var(--muted)}
footer.foot .wrap{display:flex;gap:24px;justify-content:space-between;flex-wrap:wrap}
footer.foot nav{display:flex;gap:20px}footer.foot a{color:var(--ink)}
.bottomnav{display:none}
/* ads (always labelled "Anzeige") */
.ad{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px}
.ad img{max-width:100%;height:auto;border-radius:10px}
.adlabel{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.ad-top{padding:16px 0 0}.ad-feed{padding:8px 0}.ad-side{margin-top:24px}
.adcode{width:100%;display:flex;justify-content:center}
/* own posts */
.card.own .fig{display:flex;align-items:center;justify-content:center;background:var(--ink)}
.ownmark{font:800 26px var(--display);letter-spacing:-.03em;color:#fff}
.post{max-width:760px;margin:0 auto}
.post h1{margin:10px 0 14px;font:700 clamp(32px,4.5vw,50px)/1.05 var(--display);letter-spacing:-.035em}
.post .lede{font-size:20px;line-height:1.5;color:var(--muted);margin:0 0 16px}
.post .byline{font-size:14px;color:var(--muted);padding-bottom:18px;border-bottom:1px solid var(--line);margin-bottom:24px}.post .byline strong{color:var(--ink)}
.post figure{margin:0 0 24px}.post figure img{width:100%;border-radius:18px}
.post .body{font-size:18px;line-height:1.7}.post .body h2{font:700 26px/1.2 var(--display);margin:32px 0 10px}.post .body h3{font:700 21px var(--display);margin:24px 0 8px}
.post .body p{margin:0 0 18px}.post .body a{color:var(--accent);text-decoration:underline}
.post .body blockquote{margin:24px 0;padding:4px 0 4px 20px;border-left:3px solid var(--accent);font:600 22px/1.4 var(--display)}
/* phone */
@media (max-width:700px){
 .wrap{padding:0 16px}
 .bar{padding:14px 0 12px}.logo{font-size:26px}
 .seg,.dateline-wide{display:none}.edpick{display:block;margin-left:8px}
 .bar .search{display:none}.sbtn{display:inline-flex}
 .bigsearch button{display:none}
 main{padding:18px 0 32px}.stack{gap:32px}
 .lead .fig{aspect-ratio:4/3;border-radius:18px}.lead p{display:none}
 .avatars .btn{display:none}
 .band{padding:20px;border-radius:18px;gap:16px}
 .band .head .btn{display:none}
 .cols{gap:0}.col{padding:12px 0 0;border-left:0;border-top:1px solid var(--line);display:grid;grid-template-columns:58px minmax(0,1fr);gap:4px 12px}
 .col .pill{grid-row:span 2;align-self:start;justify-self:start;padding:3px 8px;border-radius:7px;white-space:nowrap;font-size:11px}
 .pill .long{display:none}.pill .short{display:inline}
 .col a{font:500 15px/1.3 var(--text)}.col .more{display:none}
 .grid{display:flex;flex-direction:column;gap:0}
 .card{display:grid;grid-template-columns:minmax(0,1fr) 84px;grid-template-areas:"sub fig" "t fig";gap:4px 12px;padding:14px 0;border-bottom:1px solid var(--line);align-items:start}
 .card .fig{grid-area:fig;width:84px;height:84px;border-radius:12px;aspect-ratio:auto}
 .card .ki{display:none}
 .card{grid-template-areas:"sub fig" "t fig" "rx fig";grid-template-columns:minmax(0,1fr) 96px}.card .fig{width:96px;height:96px;border-radius:14px}
 .card .sub{grid-area:sub}.card .t{grid-area:t;font-size:17px}.card .rx{grid-area:rx;font-size:12px}
 .leadsocial .share{margin-left:0}
 .sechead h2{font-size:22px}.sechead{margin-bottom:6px}
 .bottomnav{display:grid;position:fixed;left:0;right:0;bottom:0;z-index:30;grid-template-columns:repeat(4,minmax(0,1fr));background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:6px 8px calc(10px + env(safe-area-inset-bottom))}
 .bottomnav a{min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11px;color:var(--muted)}
 .bottomnav a[aria-current]{color:var(--accent);font-weight:600}
 footer.foot{padding-bottom:110px}
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

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vienna" });
}

// Soft illustration palette per section (used for icons when there is no KI image).
const CAT_TINT: Record<Category, [string, string]> = {
  politik: ["#efe5dc", "#7a2e2e"], wirtschaft: ["#e1e9e5", "#2f5d50"], welt: ["#dfe5ee", "#2d4b73"], sport: ["#e4ebdf", "#3f6b2a"],
  kultur: ["#ebe3ee", "#6b3f6e"], wissen: ["#dfe9eb", "#2a5f6b"], chronik: ["#ece8e2", "#5a5047"], regional: ["#e4ebdf", "#4d6b3a"],
};

function icon(cat: Category): string {
  const [bg, c] = CAT_TINT[cat];
  const shapes: Record<Category, string> = {
    politik: `<path d="M140 120 L200 92 L260 120 Z" fill="${c}"/><rect x="148" y="126" width="104" height="7" rx="3" fill="${c}"/>${[0, 1, 2, 3].map((i) => `<rect x="${158 + i * 24}" y="140" width="11" height="42" rx="3" fill="${c}" opacity=".8"/>`).join("")}<rect x="140" y="186" width="120" height="9" rx="3" fill="${c}"/>`,
    wirtschaft: `<polyline points="130,190 170,160 200,172 238,130 272,110" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
    welt: `<circle cx="200" cy="150" r="52" fill="none" stroke="${c}" stroke-width="8"/><ellipse cx="200" cy="150" rx="22" ry="52" fill="none" stroke="${c}" stroke-width="6"/><line x1="148" y1="150" x2="252" y2="150" stroke="${c}" stroke-width="6"/>`,
    sport: `<circle cx="200" cy="150" r="50" fill="none" stroke="${c}" stroke-width="8"/><polygon points="200,126 222,142 214,168 186,168 178,142" fill="${c}"/>`,
    kultur: `<circle cx="176" cy="160" r="30" fill="${c}" opacity=".85"/><rect x="200" y="110" width="9" height="62" rx="4" fill="${c}"/><path d="M209 110 q30 6 30 30" stroke="${c}" stroke-width="9" fill="none" stroke-linecap="round"/>`,
    wissen: `<path d="M184 104 V140 L156 188 H244 L216 140 V104" fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round"/><circle cx="196" cy="170" r="7" fill="${c}"/><circle cx="214" cy="160" r="5" fill="${c}"/>`,
    chronik: `${[0, 1, 2, 3].map((i) => `<rect x="${136 + i * 34}" y="${130 - (i % 2) * 22}" width="26" height="${66 + (i % 2) * 22}" rx="3" fill="${c}" opacity="${0.6 + i * 0.1}"/>`).join("")}`,
    regional: `<path d="M110 200 L176 112 L214 160 L244 128 L300 200 Z" fill="${c}"/><path d="M166 125 L176 112 L186 125 Z" fill="#fff" opacity=".85"/>`,
  };
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${e(CATEGORY_NAME[cat])}" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="300" fill="${bg}"/>${shapes[cat]}</svg>`;
}

function figure(s: Story): string {
  if (s.image_status === "done" && s.image_key) {
    return `<div class="fig"><img src="/img/${e(s.image_key)}" alt="" loading="lazy" width="1024" height="576"><span class="ki">KI-Illustration</span></div>`;
  }
  return `<div class="fig">${icon(s.category)}</div>`;
}

/** Small inline SVG flags: identical on every device (emoji flags do not render on Windows). */
export function flag(c: Country | "dach", size = 16): string {
  const h = Math.round(size * 0.72);
  const label = c === "dach" ? "DACH" : COUNTRY_NAME[c];
  const svg: Record<string, string> = {
    at: `<svg class="flag" width="${size}" height="${h}" viewBox="0 0 30 20" role="img" aria-label="${label}"><rect width="30" height="20" fill="#c8102e"/><rect y="6.67" width="30" height="6.67" fill="#fff"/></svg>`,
    de: `<svg class="flag" width="${size}" height="${h}" viewBox="0 0 30 20" role="img" aria-label="${label}"><rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#dd0000"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/></svg>`,
    ch: `<svg class="flag sq" width="${h}" height="${h}" viewBox="0 0 32 32" role="img" aria-label="${label}"><rect width="32" height="32" fill="#da291c"/><rect x="13" y="6" width="6" height="20" fill="#fff"/><rect x="6" y="13" width="20" height="6" fill="#fff"/></svg>`,
  };
  if (c === "dach") return `<span class="flags" role="img" aria-label="DACH">${["at", "de", "ch"].map((x) => svg[x].replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true"')).join("")}</span>`;
  return svg[c];
}

function countryCodes(countries: string): string {
  const set = new Set(countries.split(","));
  return `<span class="flags">${COUNTRIES.filter((c) => set.has(c)).map((c) => flag(c)).join("")}</span>`;
}

function bars(n: number): string {
  const on = Math.min(n, 10);
  return `<span class="bars" role="img" aria-label="${n} Redaktionen">${Array.from({ length: 10 }, (_, i) => `<i${i < on ? ' class="on"' : ""}></i>`).join("")}</span>`;
}

function newsrooms(n: number): string {
  return n === 1 ? "1 Redaktion" : `${n} Redaktionen`;
}

function abo(a: ArticleRow): string {
  return a.paywall ? '<span class="abo">Abo</span>' : "";
}

/** data-sheet attributes: on phones the preview card for this article opens instead of leaving the page. */
function sheetAttr(a: ArticleRow): string {
  return a.cluster_id ? ` data-sheet="${e(a.cluster_id)}" data-a="${e(a.id)}"` : "";
}

function ext(a: ArticleRow, cls = "t"): string {
  return `<a class="${cls}" href="${e(a.url)}" target="_blank" rel="noopener"${sheetAttr(a)}>${e(a.title)}</a>`;
}

function byCountry(s: Story): Partial<Record<Country, ArticleRow[]>> {
  const by: Partial<Record<Country, ArticleRow[]>> = {};
  for (const a of s.articles) (by[a.country] ??= []).push(a);
  return by;
}

/** Link target for a story: comparison page when there are several sources, else the article. */
function storyHref(s: Story): { href: string; attrs: string } {
  // data-sheet: on phones the preview card (bottom sheet) opens instead of leaving the page.
  const sheet = ` data-sheet="${e(s.id)}"`;
  return s.articles.length > 1
    ? { href: `/story/${e(s.id)}`, attrs: sheet }
    : { href: e(s.lead.url), attrs: ` target="_blank" rel="noopener"${sheet} data-a="${e(s.lead.id)}"` };
}

/** "😡 214 · 😢 96" – the three most used reactions. */
function topReactions(c?: Counts): string {
  if (!c) return "";
  const top = Object.entries(c).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return top.length ? `<span class="rx">${top.map(([em, n]) => `${em} ${n}`).join(" · ")}</span>` : "";
}

// --- blocks ----------------------------------------------------------------

function leadBlock(s: Story, counts?: Counts, siteUrl = ""): string {
  const n = s.articles.length;
  const { href, attrs } = storyHref(s);
  const names = s.articles.filter((a) => a.id !== s.lead.id).slice(0, 3).map((a) => a.publisher).join(", ");
  return `<article class="lead">
    <a href="${href}"${attrs}>${figure(s)}</a>
    <div class="meta"><span class="eyebrow">Jetzt wichtig</span><span class="cat">${e(CATEGORY_NAME[s.category])}</span>${countryCodes(s.countries)}<span>${newsrooms(n)} · ${ago(s.first_seen)}</span></div>
    <h1>${ext(s.lead)}</h1>
    ${s.lead.teaser ? `<p>${e(s.lead.teaser)}</p>` : ""}
    <div class="avatars"><span class="src"><strong>${e(s.lead.publisher ?? "")}</strong>${abo(s.lead)}${names ? ` · auch ${e(names)}${n > 4 ? ` +${n - 4}` : ""}` : ""}</span>${bars(n)}${n > 1 ? `<a class="btn" href="/story/${e(s.id)}">Alle ${n} Quellen vergleichen →</a>` : ""}</div>
    ${counts ? `<div class="leadsocial">${reactBar(s.id, counts, true)}${siteUrl ? shareBar(`${siteUrl}/story/${s.id}`, s.lead.title, true) : ""}</div>` : ""}
  </article>`;
}

function feedBlock(latest: ArticleRow[], count?: number): string {
  if (!latest.length) return "";
  return `<aside class="feed" aria-label="Neueste Meldungen">
    <h2><span class="dot"></span>Neueste Meldungen${count ? `<span style="margin-left:auto;font:400 13px var(--text);color:var(--muted)">${count} heute</span>` : ""}</h2>
    ${latest.map((a) => `<a href="${e(a.url)}" target="_blank" rel="noopener"${sheetAttr(a)}><time>${clock(a.published)}</time><span><span class="t">${e(a.title)}</span><small>${flag(a.country, 14)} ${e(a.publisher ?? "")}${abo(a)}</small></span></a>`).join("")}
  </aside>`;
}

export function compareBand(s: Story, withButton = true): string {
  const by = byCountry(s);
  const cols = COUNTRIES.filter((c) => by[c]?.length).map((c) => {
    const [first, ...rest] = by[c]!;
    return `<div class="col"><span class="pill">${flag(c)}<span class="long">${COUNTRY_NAME[c]} · ${by[c]!.length}</span><span class="short">${by[c]!.length}</span></span>
      ${ext(first, "")}
      <small>${by[c]!.slice(0, 3).map((a) => e(a.publisher ?? "")).join(" · ")}</small>
      ${rest.length ? `<div class="more">${rest.slice(0, 2).map((a) => ext(a, "")).join("")}</div>` : ""}</div>`;
  }).join("");
  return `<section class="band">
    <div class="head"><div><span class="eyebrow">DACH-Vergleich</span><h2>${e(s.lead.title)}</h2></div>${withButton ? `<a class="btn" href="/story/${e(s.id)}">Zum Vergleich →</a>` : ""}</div>
    <div class="cols">${cols}</div>
  </section>`;
}

export function card(s: Story, counts?: Counts): string {
  const n = s.articles.length;
  const { href, attrs } = storyHref(s);
  return `<a class="card" href="${href}"${attrs}>${figure(s)}
    <span class="sub"><span class="cat">${e(CATEGORY_NAME[s.category])}</span> ${countryCodes(s.countries)} · ${n > 1 ? newsrooms(n) : `${e(s.lead.publisher ?? "")}${s.lead.paywall ? " · Abo" : ""}`} · ${ago(s.last_update)}</span>
    <span class="t">${e(s.lead.title)}</span>${topReactions(counts)}</a>`;
}

function listBlock(cat: Category, list: Story[], base: string): string {
  return `<div class="list"><h3>${CATEGORY_NAME[cat]}<a href="${base}/${cat}">Mehr →</a></h3>${list.slice(0, 4).map((s, i) => {
    const { href, attrs } = storyHref(s);
    const img = i === 0 && s.image_status === "done" && s.image_key ? `<img src="/img/${e(s.image_key)}" alt="" loading="lazy" width="84" height="84">` : "";
    const text = `<span class="t">${e(s.lead.title)}</span><small>${countryCodes(s.countries)} ${s.articles.length > 1 ? newsrooms(s.articles.length) : e(s.lead.publisher ?? "")} · ${ago(s.last_update)}</small>`;
    return `<a class="row${img ? " th" : ""}" href="${href}"${attrs}>${img ? `${img}<span>${text}</span>` : text}</a>`;
  }).join("")}</div>`;
}

// --- layout ----------------------------------------------------------------

function editionPath(ed: Edition): string { return ed === "dach" ? "/" : `/${ed}`; }

const ICON = {
  top: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>',
  cmp: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="16" rx="1.5"/><rect x="17" y="4" width="4" height="16" rx="1.5"/></svg>',
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
  return `<div class="sechead"><h2>Ausgabe wählen</h2></div><p style="margin:-8px 0 18px;color:var(--muted)">Welche Nachrichten sollen zuerst erscheinen?</p><div class="edlist">${EDITIONS.map((ed) =>
    `<a href="/wechseln?e=${ed}&amp;r=${encodeURIComponent(editionPath(ed))}"${ed === current ? ' aria-current="true"' : ""}><span>${flag(ed, 20)}${ed === "dach" ? "Alle Länder (DACH)" : EDITION_LABEL[ed]}</span>${ed === current ? "<span>✓</span>" : ""}</a>`).join("")}</div>`;
}

export function layout(m: PageMeta, body: string, activeCat?: Category): string {
  const url = m.siteUrl + m.path;
  const base = m.edition === "dach" ? "" : `/${m.edition}`;
  const hreflang = m.hreflang
    ? `<link rel="alternate" hreflang="de-AT" href="${m.siteUrl}/at"><link rel="alternate" hreflang="de-DE" href="${m.siteUrl}/de"><link rel="alternate" hreflang="de-CH" href="${m.siteUrl}/ch"><link rel="alternate" hreflang="x-default" href="${m.siteUrl}/">`
    : "";
  const banner = m.banner
    ? `<div class="banner"><div class="wrap"><span>${flag(m.banner.country)} Sie scheinen in ${COUNTRY_NAME[m.banner.country]} zu sein.</span><a href="/wechseln?e=${m.banner.country}&amp;r=${encodeURIComponent(`/${m.banner.country}`)}">Zur Ausgabe ${COUNTRY_NAME[m.banner.country]} wechseln</a><a href="/wechseln?e=${m.edition}&amp;r=${encodeURIComponent(m.path)}" style="font-weight:400">Hier bleiben</a></div></div>`
    : "";
  const today = new Date().toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Vienna" });
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(m.title)}</title><meta name="description" content="${e(m.description)}"><link rel="canonical" href="${e(url)}">
${m.noindex ? '<meta name="robots" content="noindex,follow">' : ""}${hreflang}
<meta property="og:title" content="${e(m.title)}"><meta property="og:description" content="${e(m.description)}"><meta property="og:url" content="${e(url)}"><meta property="og:site_name" content="${e(m.siteName)}"><meta property="og:type" content="website"><meta property="og:locale" content="de_AT">${m.image ? `<meta property="og:image" content="${e(m.image)}"><meta property="og:image:alt" content="KI-Illustration"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta name="theme-color" content="#ffffff"><link rel="preload" href="/fonts/bricolage.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23111113'/%3E%3Ccircle cx='23' cy='23' r='4' fill='%23c8321c'/%3E%3Ctext x='13' y='23' font-family='Arial' font-size='19' font-weight='800' fill='white' text-anchor='middle'%3EB%3C/text%3E%3C/svg%3E">
<style>${CSS}${SOCIAL_CSS}</style></head><body>
<header class="top"><div class="wrap">
  <div class="bar"><a href="/" class="logo">Der Bericht<span>.</span></a>
    <form class="search" action="/suche" role="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input type="search" name="q" value="${e(m.query ?? "")}" placeholder="Nachrichten durchsuchen" aria-label="Nachrichten durchsuchen" maxlength="80" enterkeyhint="search"></form>
    <span class="dateline dateline-wide">${today}${m.stats && m.stats.articles ? ` · ${m.stats.articles} Meldungen aus ${m.stats.publishers} Redaktionen` : ""}</span>
    <a class="sbtn" href="/suche" aria-label="Suche"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></a>
    <nav class="seg" aria-label="Ausgabe">${EDITIONS.map((ed) => `<a href="/wechseln?e=${ed}&amp;r=${encodeURIComponent(editionPath(ed))}"${ed === m.edition ? ' aria-current="page"' : ""}>${ed === "dach" ? "" : flag(ed)}${EDITION_LABEL[ed]}</a>`).join("")}</nav>
    <details class="edpick"><summary aria-label="Ausgabe wählen: ${e(EDITION_LABEL[m.edition])}">${m.edition === "dach" ? "DACH" : `${flag(m.edition, 20)}${m.edition.toUpperCase()}`}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
      <div class="edmenu">${EDITIONS.map((ed) => `<a href="/wechseln?e=${ed}&amp;r=${encodeURIComponent(editionPath(ed))}"${ed === m.edition ? ' aria-current="true"' : ""}>${flag(ed)}${ed === "dach" ? "Alle Länder (DACH)" : EDITION_LABEL[ed]}</a>`).join("")}</div></details></div>
  <nav class="chips" aria-label="Rubriken"><a href="${base || "/"}"${!activeCat && (m.path === "/" || m.path === base) ? ' aria-current="page"' : ""}>Top</a><a href="/vergleich"${m.path === "/vergleich" ? ' aria-current="page"' : ""}>DACH-Vergleich</a>${CATEGORIES.map((c) => `<a href="${base}/${c}"${c === activeCat ? ' aria-current="page"' : ""}>${CATEGORY_NAME[c]}</a>`).join("")}</nav>
</div></header>${banner}
${m.topAd ? `<div class="wrap">${m.topAd}</div>` : ""}<main><div class="wrap">${m.breaking ? `<a class="breaking" href="/story/${e(m.breaking.id)}"><b>Eilmeldung</b><span>${e(m.breaking.title)} – ${m.breaking.count} Quellen</span></a>` : ""}${body}</div></main>
<footer class="foot"><div class="wrap"><span style="max-width:680px">© ${new Date().getFullYear()} ${e(m.siteName)} · Wir zeigen Schlagzeilen und kurze Auszüge mit Link zum Originalartikel. Bilder mit dem Hinweis „KI-Illustration“ sind KI-generiert und zeigen keine realen Ereignisse.</span>
<nav><a href="/quellen">Quellen &amp; Opt-out</a><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></nav></div></footer>
${bottomNav(m, base)}
${SOCIAL_JS}
</body></html>`;
}

// --- pages -----------------------------------------------------------------

export function homeBody(top: Story[], compare: Story[], byCat: [Category, Story[]][], base: string, latest: ArticleRow[] = [], todayCount?: number, extras: HomeExtras = {}): string {
  if (!top.length) return `<div class="empty">Die ersten Meldungen werden gerade geladen. Bitte in ein paar Minuten wieder vorbeischauen.</div>`;
  const [first, ...rest] = top;
  const side = feedBlock(latest, todayCount).replace(/<\/aside>$/, `${extras.sideAd ?? ""}</aside>`);
  const parts: string[] = [`<section class="hero">${leadBlock(first, extras.reactions?.[first.id] ?? {}, extras.siteUrl)}${side}</section>`];
  const band = compare.find((s) => s.id !== first.id);
  if (band) parts.push(compareBand(band));
  if (extras.posts) parts.push(extras.posts);
  if (rest.length) parts.push(`<section><div class="sechead"><h2>Meistberichtet</h2><a href="/vergleich">DACH-Vergleich →</a></div><div class="grid">${rest.slice(0, 8).map((s) => card(s, extras.reactions?.[s.id])).join("")}</div></section>`);
  if (extras.feedAd) parts.push(extras.feedAd);
  const lists = byCat.filter(([, l]) => l.length).map(([c, l]) => listBlock(c, l, base));
  if (lists.length) parts.push(`<section class="lists">${lists.join("")}</section>`);
  return `<div class="stack">${parts.join("")}</div>`;
}

export function listBody(title: string, list: Story[], intro = "", reactions: Record<string, Counts> = {}): string {
  return `<div class="sechead"><h2>${e(title)}</h2></div>${intro}${list.length ? `<div class="grid">${list.map((s) => card(s, reactions[s.id])).join("")}</div>` : '<div class="empty">Zurzeit keine Meldungen.</div>'}`;
}

export function compareBody(list: Story[]): string {
  const intro = `<p style="margin:0 0 24px;color:var(--muted);font-size:17px">Dieselbe Nachricht, drei Länder: So titeln Redaktionen in Österreich, Deutschland und der Schweiz.</p>`;
  return `<div class="sechead"><h2>DACH-Vergleich</h2></div>${intro}${list.length ? `<div class="stack" style="gap:24px">${list.map((s) => compareBand(s)).join("")}</div>` : '<div class="empty">Gerade gibt es keine Geschichte, über die in mehreren Ländern berichtet wird.</div>'}`;
}

export function storyBody(s: Story, shareUrl = "", counts: Counts = {}): string {
  const by = byCountry(s);
  const max = Math.max(...COUNTRIES.map((c) => by[c]?.length ?? 0), 1);
  const fill: Record<Country, string> = { at: "#c8321c", de: "var(--ink)", ch: "#8a8a92" };
  const cover = COUNTRIES.map((c) => `<div><span>${flag(c)} ${COUNTRY_NAME[c]}</span><span class="track"><i style="width:${Math.round(((by[c]?.length ?? 0) / max) * 100)}%;background:${fill[c]}"></i></span><strong>${by[c]?.length ?? 0}</strong></div>`).join("");
  const cols = COUNTRIES.filter((c) => by[c]?.length).map((c) =>
    `<section class="ccol"><header class="h-${c}"><span>${flag(c, 22)} ${COUNTRY_NAME[c]}</span><span>${by[c]!.length === 1 ? "1 Artikel" : `${by[c]!.length} Artikel`}</span></header>${by[c]!.map((a) =>
      `<a href="${e(a.url)}" target="_blank" rel="noopener"><small><strong>${e(a.publisher ?? "")}</strong>${abo(a)} · ${ago(a.published)}</small><span class="t">${e(a.title)}</span>${a.teaser ? `<p>${e(a.teaser)}</p>` : ""}</a>`).join("")}</section>`).join("");
  return `<div class="storyhead"><div class="l">
      <div class="meta"><span class="cat">${e(CATEGORY_NAME[s.category])}</span>${countryCodes(s.countries)}<span>${newsrooms(s.articles.length)} · zuerst ${ago(s.first_seen)}, zuletzt ${ago(s.last_update)}</span></div>
      <h1>${e(s.lead.title)}</h1>
      <p>So berichten Redaktionen in Österreich, Deutschland und der Schweiz. Alle Artikel öffnen sich beim jeweiligen Herausgeber.</p>
    </div><div class="cover"><b>Berichterstattung nach Land</b>${cover}</div></div>
    <section class="social" aria-label="Teilen und reagieren">
      <h2>Wie finden Sie diese Nachricht?</h2>${reactBar(s.id, counts)}
      <h2>Mit Freunden teilen</h2>${shareBar(shareUrl, s.lead.title)}
    </section>
    <div class="ccols">${cols}</div>
    <p class="note">Wir zeigen nur Schlagzeilen und kurze Auszüge. Der vollständige Artikel erscheint beim Herausgeber.</p>`;
}

/** Preview card for phones (bottom sheet), loaded from /karte/<id>. Same legal rules as everywhere:
 *  headline, ≤120-character excerpt, link to the publisher. */
export function sheetBody(s: Story, siteUrl: string, counts: Counts = {}): string {
  const n = s.articles.length;
  const others = s.articles.filter((a) => a.id !== s.lead.id).slice(0, 3);
  const img = s.image_status === "done" && s.image_key
    ? `<span class="sfig"><img src="/img/${e(s.image_key)}" alt="" width="92" height="92"><span class="ki">KI</span></span>`
    : `<span class="sfig">${icon(s.category)}</span>`;
  return `<div class="shead">${img}<div><div class="meta"><span class="cat">${e(CATEGORY_NAME[s.category])}</span>${countryCodes(s.countries)}<span>${newsrooms(n)} · ${ago(s.last_update)}</span></div>
    <h2 id="sheet-title">${e(s.lead.title)}</h2></div></div>
    ${s.lead.teaser ? `<p class="steaser">${e(s.lead.teaser)}</p>` : ""}
    ${others.length ? `<div class="sothers"><span>So berichten andere</span>${others.map((a) => `<a href="${e(a.url)}">${flag(a.country)}<span><strong>${e(a.publisher ?? "")}</strong> ${e(a.title)}</span></a>`).join("")}${n > 1 ? `<a class="all" href="/story/${e(s.id)}">Alle ${n} Quellen vergleichen<span>→</span></a>` : ""}</div>` : ""}
    ${reactBar(s.id, counts)}
    ${shareBar(`${siteUrl}/story/${s.id}`, s.lead.title, true)}
    <a class="sgo" href="${e(s.lead.url)}">Bei ${e(s.lead.publisher ?? "der Quelle")} weiterlesen →</a>
    <small class="snote">${s.lead.paywall ? "Abo-Artikel · " : ""}Der vollständige Artikel öffnet sich beim Herausgeber</small>`;
}

const SEARCH_EXAMPLES = ["Budget", "Hochwasser", "Wahl", "Ukraine", "Bayern", "Klima"];

/** /suche – search page. Results reuse the story cards (and their preview card on phones). */
export function searchBody(q: string, list: Story[], posts = "", reactions: Record<string, Counts> = {}): string {
  const form = `<form class="bigsearch" action="/suche" role="search"><label class="search">${'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'}<input type="search" name="q" value="${e(q)}" placeholder="Wonach suchen Sie?" aria-label="Suchbegriff" maxlength="80" enterkeyhint="search"${q ? "" : " autofocus"}></label><button type="submit">Suchen</button></form>`;
  const examples = `<p class="hint">Beispiele: ${SEARCH_EXAMPLES.map((w) => `<a href="/suche?q=${encodeURIComponent(w)}">${e(w)}</a>`).join("")}</p>`;
  if (!q) return `<div class="sechead"><h2>Suche</h2></div>${form}<p class="hint">Durchsucht die Schlagzeilen aller Redaktionen der letzten 14 Tage.</p>${examples}`;
  const head = `<div class="sechead"><h2>${list.length ? `${list.length}${list.length >= 40 ? "+" : ""} Treffer für „${e(q)}“` : `Keine Treffer für „${e(q)}“`}</h2></div>`;
  if (!list.length && !posts) return `${form}${head}<p class="hint">Versuchen Sie ein anderes oder kürzeres Wort.</p>${examples}`;
  return `${form}${head}${posts}${list.length ? `<div class="grid">${list.map((s) => card(s, reactions[s.id])).join("")}</div>` : ""}`;
}
