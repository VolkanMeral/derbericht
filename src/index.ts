// Cloudflare Worker entry: web pages (fetch) + cron job (scheduled).

import { CATEGORY_NAME, COUNTRY_NAME, type Category, type Country } from "./sources.ts";
import { getStories, getStory, getFeedList, getStats, getBreaking, getLatest, ensureSchema } from "./data.ts";
import { seedFeeds } from "./ingest.ts";
import { runIngest } from "./ingest.ts";
import { CATEGORIES, EDITIONS, EDITION_LABEL, compareBody, editionChooser, homeBody, layout, listBody, storyBody, type Edition, type PageMeta } from "./render.ts";
import { datenschutz, impressum, quellen } from "./legal.ts";
import type { Env } from "./types.ts";

const GEO: Record<string, Country> = { AT: "at", DE: "de", LU: "de", CH: "ch", LI: "ch" };

function savedEdition(req: Request): Edition | null {
  const m = (req.headers.get("Cookie") ?? "").match(/(?:^|;\s*)edition=(dach|at|de|ch)\b/);
  return (m?.[1] as Edition) ?? null;
}
function geoCountry(req: Request): Country | null {
  const cc = req.headers.get("CF-IPCountry") ?? (req as { cf?: { country?: string } }).cf?.country ?? "";
  return GEO[cc.toUpperCase()] ?? null;
}

function html(body: string, status = 200, cache = "public, max-age=120"): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" } });
}

function meta(env: Env, p: Partial<PageMeta> & Pick<PageMeta, "title" | "path" | "edition">): PageMeta {
  return {
    description: "Die wichtigsten Nachrichten aus Österreich, Deutschland und der Schweiz auf einen Blick – mit Links zu den Originalartikeln.",
    siteUrl: env.SITE_URL.replace(/\/$/, ""),
    siteName: env.SITE_NAME,
    ...p,
  };
}

async function home(env: Env, req: Request, ed: Edition, path: string, banner: PageMeta["banner"]): Promise<string> {
  const country = ed === "dach" ? undefined : ed;
  const base = ed === "dach" ? "" : `/${ed}`;
  const [stats, breaking, latest] = await Promise.all([getStats(env), getBreaking(env, country), getLatest(env, country)]);
  const [top, compare, ...cats] = await Promise.all([
    // Homepage "/": ranked for the visitor's country without changing the URL.
    getStories(env, path === "/" ? { boost: country, limit: 9 } : { country, limit: 9 }),
    getStories(env, { multiCountry: true, limit: 3 }),
    ...CATEGORIES.map((c) => getStories(env, { country, category: c, limit: 8 })),
  ]);
  const seen = new Set(top.map((s) => s.id));
  const byCat: [Category, typeof top][] = CATEGORIES.map((c, i) => [c, cats[i].filter((s) => !seen.has(s.id))]);
  const title = ed === "dach" ? `${env.SITE_NAME} – Nachrichten aus Österreich, Deutschland und der Schweiz` : `${env.SITE_NAME} ${COUNTRY_NAME[ed]} – Nachrichten aus ${COUNTRY_NAME[ed]}`;
  // The strip is for stories the visitor would otherwise miss; no need when it already leads the page.
  const strip = breaking && breaking.id !== top[0]?.id ? breaking : null;
  return layout(meta(env, { title, path, edition: ed, hreflang: true, banner, stats, breaking: strip }), homeBody(top, compare, byCat, base, latest, stats.articles));
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  // www.derbericht.com → derbericht.com (one address for search engines)
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return Response.redirect(url.toString(), 301);
  }
  await ensureSchema(env);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const saved = savedEdition(req);
  const geo = geoCountry(req);

  // Switch edition: remember the choice for a year, then go back (relative paths only).
  if (path === "/wechseln") {
    const ed = url.searchParams.get("e") as Edition;
    const r = url.searchParams.get("r") ?? "/";
    const target = /^\/(?!\/)[\w\-/]*$/.test(r) ? r : "/";
    const headers = new Headers({ Location: target, "Cache-Control": "no-store" });
    if (EDITIONS.includes(ed)) headers.append("Set-Cookie", `edition=${ed}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
    return new Response(null, { status: 302, headers });
  }

  if (path === "/") {
    const ed: Edition = saved ?? geo ?? "dach";
    return html(await home(env, req, ed, "/", null), 200, "private, max-age=60");
  }

  const seg = path.split("/").filter(Boolean);
  const isEd = (s: string): s is Country => s === "at" || s === "de" || s === "ch";
  const isCat = (s: string): s is Category => (CATEGORIES as string[]).includes(s);

  // Edition pages: /at, /de, /ch — never redirected; a banner suggests the visitor's own edition.
  const banner = (ed: Edition, p: string): PageMeta["banner"] => (!saved && geo && geo !== ed ? { country: geo, path: p } : null);
  if (seg.length === 1 && isEd(seg[0])) {
    const b = banner(seg[0], path);
    return html(await home(env, req, seg[0], path, b), 200, b ? "private, max-age=60" : "public, max-age=120");
  }

  // Category pages: /politik (DACH) or /at/politik
  if ((seg.length === 1 && isCat(seg[0])) || (seg.length === 2 && isEd(seg[0]) && isCat(seg[1]))) {
    const ed: Edition = seg.length === 2 ? (seg[0] as Country) : "dach";
    const cat = (seg.length === 2 ? seg[1] : seg[0]) as Category;
    const list = await getStories(env, { country: ed === "dach" ? undefined : ed, category: cat, limit: 40, hours: 48 });
    const title = `${CATEGORY_NAME[cat]} – ${EDITION_LABEL[ed]} | ${env.SITE_NAME}`;
    return html(layout(meta(env, { title, path, edition: ed, description: `${CATEGORY_NAME[cat]}-Nachrichten aus ${EDITION_LABEL[ed]} auf einen Blick.` }), listBody(`${CATEGORY_NAME[cat]} · ${EDITION_LABEL[ed]}`, list), cat));
  }

  if (path === "/vergleich") {
    const list = await getStories(env, { multiCountry: true, limit: 30, hours: 48 });
    return html(layout(meta(env, { title: `DACH-Vergleich | ${env.SITE_NAME}`, path, edition: saved ?? "dach", description: "Dieselbe Nachricht in Österreich, Deutschland und der Schweiz – Schlagzeilen im Vergleich." }), compareBody(list)));
  }

  if (seg[0] === "story" && seg[1]) {
    const s = await getStory(env, seg[1]);
    if (!s) return html(layout(meta(env, { title: "Nicht gefunden", path, edition: "dach", noindex: true }), '<div class="empty">Diese Meldung ist nicht mehr verfügbar.</div>'), 404);
    return html(layout(meta(env, { title: `${s.lead.title} – ${s.articles.length} Quellen | ${env.SITE_NAME}`, path, edition: saved ?? "dach", noindex: true, description: `${s.articles.length} Redaktionen berichten. Schlagzeilen im Vergleich.` }), storyBody(s)));
  }

  if (path === "/ausgabe") {
    return html(layout(meta(env, { title: `Ausgabe wählen | ${env.SITE_NAME}`, path, edition: saved ?? geo ?? "dach", noindex: true }), editionChooser(saved ?? geo ?? "dach")), 200, "private, no-store");
  }

  if (path === "/impressum") return html(layout(meta(env, { title: `Impressum | ${env.SITE_NAME}`, path, edition: saved ?? "dach" }), impressum()), 200, "public, max-age=3600");
  if (path === "/datenschutz") return html(layout(meta(env, { title: `Datenschutz | ${env.SITE_NAME}`, path, edition: saved ?? "dach" }), datenschutz()), 200, "public, max-age=3600");
  if (path === "/quellen") return html(layout(meta(env, { title: `Quellen & Opt-out | ${env.SITE_NAME}`, path, edition: saved ?? "dach" }), quellen(await getFeedList(env))), 200, "public, max-age=3600");

  if (seg[0] === "img" && seg.length >= 2) {
    const key = seg.slice(1).join("/");
    if (!/^story\/[a-f0-9]+\.jpg$/.test(key)) return new Response("Not found", { status: 404 });
    const obj = env.IMAGES ? await env.IMAGES.get(key) : null;
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800, immutable" } });
  }

  if (path === "/robots.txt") {
    return new Response(`User-agent: *\nAllow: /\nDisallow: /wechseln\nDisallow: /ausgabe\nDisallow: /admin\n\nSitemap: ${env.SITE_URL}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain" } });
  }
  if (path === "/sitemap.xml") {
    const paths = ["/", "/at", "/de", "/ch", "/vergleich", "/quellen", "/impressum",
      ...CATEGORIES.flatMap((c) => [`/${c}`, `/at/${c}`, `/de/${c}`, `/ch/${c}`])];
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${env.SITE_URL}${p}</loc><changefreq>hourly</changefreq></url>`).join("")}</urlset>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });
  }

  // Admin: run the job by hand / see feed status. Requires the ADMIN_TOKEN secret.
  if (seg[0] === "admin") {
    const ok = env.ADMIN_TOKEN && req.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`;
    if (!ok) return new Response("Forbidden", { status: 403 });
    if (seg[1] === "run") return Response.json(await runIngest(env));
    if (seg[1] === "seed") { await seedFeeds(env); return Response.json({ ok: true }); }
    if (seg[1] === "feeds") return Response.json(await getFeedList(env));
  }

  return html(layout(meta(env, { title: "Seite nicht gefunden", path, edition: saved ?? "dach", noindex: true }), '<div class="empty">Diese Seite gibt es nicht. <a href="/">Zur Startseite</a></div>'), 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (err) {
      console.error(err);
      return new Response("Fehler – bitte später erneut versuchen.", { status: 500 });
    }
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runIngest(env).then((r) => console.log("ingest", JSON.stringify(r))));
  },
};
