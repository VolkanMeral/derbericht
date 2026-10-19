// Visitor statistics without cookies or third parties (DSGVO-friendly, similar to Plausible):
// a visitor is a hash of IP address + browser + a secret that changes every day. The IP itself is
// never stored, and the same person cannot be recognised on the next day. Bots are not counted.

import { COUNTRY_NAME, type Country } from "./sources.ts";
import { escapeHtml as e } from "./text.ts";
import { dayKey } from "./report.ts";
import type { Env } from "./types.ts";

const BOT = /bot|crawl|spider|slurp|preview|scan|monitor|curl|wget|python|httpclient|headless|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|lighthouse|pingdom|uptime|feed|rss/i;
const SKIP = /^\/(admin|api|img|media|karte|reagieren|werbung|wechseln|fonts|robots\.txt|sitemap\.xml|favicon)/;
export const LIVE_MINUTES = 5;

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normalised page for the "top pages" list. */
function pageKey(path: string): string {
  return path.length > 120 ? path.slice(0, 120) : path;
}

export function shouldTrack(req: Request, res: Response): boolean {
  if (req.method !== "GET" || res.status !== 200) return false;
  if (!(res.headers.get("Content-Type") ?? "").startsWith("text/html")) return false;
  const path = new URL(req.url).pathname;
  if (SKIP.test(path)) return false;
  const purpose = req.headers.get("Sec-Purpose") ?? req.headers.get("Purpose") ?? "";
  if (/prefetch|prerender/i.test(purpose)) return false;
  const ua = req.headers.get("User-Agent") ?? "";
  return ua.length > 0 && !BOT.test(ua);
}

export async function track(env: Env, req: Request): Promise<void> {
  const url = new URL(req.url);
  const now = Date.now();
  const day = dayKey(now);
  const ua = req.headers.get("User-Agent") ?? "";
  const ip = req.headers.get("CF-Connecting-IP") ?? "";
  const id = await sha(`${env.SETUP_CODE ?? env.SITE_URL}|${day}|${ip}|${ua}`);
  const cc = (req.headers.get("CF-IPCountry") ?? "").toUpperCase().slice(0, 2) || null;
  const device = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
  let ref: string | null = null;
  try {
    const r = req.headers.get("Referer");
    if (r) {
      const host = new URL(r).hostname.replace(/^www\./, "");
      if (host !== url.hostname.replace(/^www\./, "")) ref = host.slice(0, 80);
    }
  } catch { /* ignore broken referrer */ }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO visitors (day, id, first, last, views, country, device, ref, entry) VALUES (?,?,?,?,1,?,?,?,?)
       ON CONFLICT(day, id) DO UPDATE SET last = excluded.last, views = views + 1`,
    ).bind(day, id, now, now, cc, device, ref, pageKey(url.pathname)),
    env.DB.prepare("INSERT INTO page_daily (day, path, n) VALUES (?,?,1) ON CONFLICT(day, path) DO UPDATE SET n = n + 1")
      .bind(day, pageKey(url.pathname)),
  ]);
}

/** Daily totals are kept 400 days; the per-visitor rows only 31 days. */
export async function rollup(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      // Only yesterday, and only once (reading 30 days of visitors every 10 minutes was too expensive).
      `INSERT OR IGNORE INTO visits_daily (day, visitors, views)
       SELECT day, COUNT(*), SUM(views) FROM visitors
       WHERE NOT EXISTS (SELECT 1 FROM visits_daily WHERE day = ?1) AND day = ?1 GROUP BY day`,
    ).bind(dayKey(Date.now() - 86400_000)),
    env.DB.prepare("DELETE FROM visitors WHERE day < ?").bind(dayKey(Date.now() - 31 * 86400_000)),
    env.DB.prepare("DELETE FROM page_daily WHERE day < ?").bind(dayKey(Date.now() - 90 * 86400_000)),
    env.DB.prepare("DELETE FROM visits_daily WHERE day < ?").bind(dayKey(Date.now() - 400 * 86400_000)),
  ]);
}

export interface Snapshot { live: number; today: number; todayViews: number; yesterday: number; yesterdayViews: number }

export async function snapshot(env: Env): Promise<Snapshot> {
  const now = Date.now();
  const [live, t, y] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM visitors WHERE day >= ? AND last > ?").bind(dayKey(now - 86400_000), now - LIVE_MINUTES * 60_000).first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(views),0) AS v FROM visitors WHERE day = ?").bind(dayKey(now)).first<{ n: number; v: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(views),0) AS v FROM visitors WHERE day = ?").bind(dayKey(now - 86400_000)).first<{ n: number; v: number }>(),
  ]);
  return { live: live?.n ?? 0, today: t?.n ?? 0, todayViews: t?.v ?? 0, yesterday: y?.n ?? 0, yesterdayViews: y?.v ?? 0 };
}

const PERIODS = [1, 7, 30] as const;

export async function visitorsPage(env: Env, url: URL): Promise<string> {
  const t = Number(url.searchParams.get("t"));
  const days = (PERIODS as readonly number[]).includes(t) ? t : 7;
  const since = dayKey(Date.now() - (days - 1) * 86400_000);
  const s = await snapshot(env);
  const [trendLive, trendOld, pages, countries, refs, devices, totals] = await Promise.all([
    env.DB.prepare("SELECT day, COUNT(*) AS visitors, SUM(views) AS views FROM visitors WHERE day >= ? GROUP BY day").bind(dayKey(Date.now() - 29 * 86400_000)).all<{ day: string; visitors: number; views: number }>(),
    env.DB.prepare("SELECT day, visitors, views FROM visits_daily WHERE day >= ?").bind(dayKey(Date.now() - 29 * 86400_000)).all<{ day: string; visitors: number; views: number }>(),
    env.DB.prepare("SELECT path, SUM(n) AS n FROM page_daily WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 15").bind(since).all<{ path: string; n: number }>(),
    env.DB.prepare("SELECT COALESCE(country,'–') AS k, COUNT(*) AS n FROM visitors WHERE day >= ? GROUP BY k ORDER BY n DESC LIMIT 10").bind(since).all<{ k: string; n: number }>(),
    env.DB.prepare("SELECT ref AS k, COUNT(*) AS n FROM visitors WHERE day >= ? AND ref IS NOT NULL GROUP BY ref ORDER BY n DESC LIMIT 10").bind(since).all<{ k: string; n: number }>(),
    env.DB.prepare("SELECT device AS k, COUNT(*) AS n FROM visitors WHERE day >= ? GROUP BY device ORDER BY n DESC").bind(since).all<{ k: string; n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS visitors, COALESCE(SUM(views),0) AS views, COALESCE(AVG(views),0) AS avg FROM visitors WHERE day >= ?").bind(since).first<{ visitors: number; views: number; avg: number }>(),
  ]);
  // Story and article pages are shown with their headline.
  const ids = pages.results.map((x) => /^\/story\/([a-f0-9]+)$/.exec(x.path)?.[1]).filter((x): x is string => !!x);
  const slugs = pages.results.map((x) => /^\/artikel\/([^/]+)$/.exec(x.path)?.[1]).filter((x): x is string => !!x);
  const titles = new Map<string, string>();
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT c.id, a.title FROM clusters c JOIN articles a ON a.id = c.lead_id WHERE c.id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{ id: string; title: string }>();
    for (const r of results) titles.set(`/story/${r.id}`, r.title);
  }
  if (slugs.length) {
    const { results } = await env.DB.prepare(`SELECT slug, title FROM posts WHERE slug IN (${slugs.map(() => "?").join(",")})`).bind(...slugs).all<{ slug: string; title: string }>();
    for (const r of results) titles.set(`/artikel/${r.slug}`, r.title);
  }
  const NAMES: Record<string, string> = { "/": "Startseite", "/at": "Startseite Österreich", "/de": "Startseite Deutschland", "/ch": "Startseite Schweiz", "/vergleich": "DACH-Vergleich", "/suche": "Suche" };
  const pageLabel = (k: string) => titles.get(k) ?? NAMES[k] ?? k;
  const byDay = new Map<string, { visitors: number; views: number }>();
  for (const r of [...trendOld.results, ...trendLive.results]) byDay.set(r.day, { visitors: r.visitors, views: r.views });
  const trend = Array.from({ length: 30 }, (_, i) => dayKey(Date.now() - (29 - i) * 86400_000)).map((day) => ({ day, ...(byDay.get(day) ?? { visitors: 0, views: 0 }) }));
  const max = Math.max(1, ...trend.map((x) => x.visitors));

  const stat = (v: string | number, l: string, live = false) => `<div class="card stat"><b>${live ? '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#2f6b3a;margin-right:10px;vertical-align:middle"></span>' : ""}${v}</b><span>${l}</span></div>`;
  const cname = (k: string) => (COUNTRY_NAME as Record<string, string>)[k.toLowerCase() as Country] ?? k;
  const devLabel: Record<string, string> = { mobile: "Smartphone", desktop: "Computer", tablet: "Tablet" };
  const list = (rows: { k: string; n: number }[], label: (k: string) => string) => {
    const top = Math.max(1, ...rows.map((r) => r.n));
    return rows.length ? `<table><tbody>${rows.map((r) => `<tr><td>${e(label(r.k))}</td><td style="width:45%"><span class="rbar"><i style="width:${Math.max(2, Math.round((r.n / top) * 100))}%"></i></span></td><td class="num">${r.n}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Noch keine Daten.</p>';
  };
  const nav = `<nav class="seg2" aria-label="Zeitraum">${PERIODS.map((p) => `<a href="/admin/besucher?t=${p}"${p === days ? ' aria-current="page"' : ""}>${p === 1 ? "Heute" : `${p} Tage`}</a>`).join("")}</nav>`;
  return `<div class="top"><h1>Besucher</h1><div class="actions">${nav}<a class="btn light small" href="/admin/besucher?t=${days}">Aktualisieren</a></div></div>
  <div class="stats">
    ${stat(s.live, `Gerade auf der Website (letzte ${LIVE_MINUTES} Min.)`, true)}
    ${stat(s.today, `Besucher heute · ${s.todayViews} Seitenaufrufe`)}
    ${stat(s.yesterday, `Besucher gestern · ${s.yesterdayViews} Seitenaufrufe`)}
    ${stat((totals?.avg ?? 0).toFixed(1), `Seiten pro Besuch (${days === 1 ? "heute" : `${days} Tage`})`)}
  </div>
  <div class="card" style="margin-bottom:18px"><h2 style="font-size:20px">Besucher pro Tag (30 Tage)</h2>
    <div class="trend" style="grid-template-columns:repeat(30,minmax(0,1fr));gap:4px">${trend.map((x) => {
      const label = new Date(x.day + "T12:00:00Z").toLocaleDateString("de-AT", { day: "numeric", month: "numeric" });
      return `<div title="${label}: ${x.visitors} Besucher, ${x.views} Seitenaufrufe"><b style="font-size:10px">${x.visitors || ""}</b><i style="height:${Math.round((x.visitors / max) * 110)}px"></i><span style="font-size:9px">${label}</span></div>`;
    }).join("")}</div></div>
  <div class="grid2">
    <div class="card tablewrap"><h2 style="font-size:20px;margin-bottom:6px">Meistgelesene Seiten</h2>${list(pages.results.map((p) => ({ k: p.path, n: p.n })), pageLabel)}</div>
    <div class="card tablewrap"><h2 style="font-size:20px;margin-bottom:6px">Länder</h2>${list(countries.results, cname)}</div>
  </div>
  <div class="grid2">
    <div class="card tablewrap"><h2 style="font-size:20px;margin-bottom:6px">Woher die Besucher kommen</h2>${list(refs.results, (k) => k)}<p class="muted" style="font-size:13px;margin:10px 0 0">Besucher ohne Herkunftsangabe (direkt eingegeben, Apps) sind hier nicht aufgeführt.</p></div>
    <div class="card tablewrap"><h2 style="font-size:20px;margin-bottom:6px">Geräte</h2>${list(devices.results, (k) => devLabel[k] ?? k)}</div>
  </div>
  <p class="muted" style="font-size:13px">Gezählt ohne Cookies und ohne Drittanbieter: Ein Besucher ist ein täglich wechselnder, nicht umkehrbarer Prüfwert aus IP-Adresse und Browser; die IP-Adresse wird nicht gespeichert. Suchmaschinen und Bots werden nicht gezählt. Wer dieselbe Seite innerhalb von 2 Minuten erneut öffnet, wird vom Browser-Cache bedient und nicht erneut gezählt.</p>`;
}
