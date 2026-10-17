// Cloudflare Worker entry: web pages (fetch) + cron job (scheduled).

import { CATEGORY_NAME, COUNTRY_NAME, type Category, type Country } from "./sources.ts";
import { getStories, getStory, getFeedList, getStats, getBreaking, getLatest, ensureSchema } from "./data.ts";
import { runIngest } from "./ingest.ts";
import { handleAdmin } from "./admin.ts";
import { adClick, adHtml, pickAds, postBySlug, postCards, postList, postPage, publishedPosts, serveMedia, type AdSlots } from "./content.ts";
import { CATEGORIES, EDITIONS, EDITION_LABEL, compareBody, editionChooser, homeBody, layout, listBody, storyBody, type Edition, type PageMeta } from "./render.ts";
import { feedTable, getPage, pageHtml, type PageSlug } from "./legal.ts";
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

async function home(env: Env, ed: Edition, path: string, banner: PageMeta["banner"], ads: AdSlots): Promise<string> {
  const country = ed === "dach" ? undefined : ed;
  const base = ed === "dach" ? "" : `/${ed}`;
  const [stats, breaking, latest, posts] = await Promise.all([getStats(env), getBreaking(env, country), getLatest(env, country), publishedPosts(env, 4, country)]);
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
  return layout(
    meta(env, { title, path, edition: ed, hreflang: true, banner, stats, breaking: strip, topAd: adHtml(ads.top) }),
    homeBody(top, compare, byCat, base, latest, stats.articles, { posts: postCards(posts), sideAd: adHtml(ads.side), feedAd: adHtml(ads.feed) }),
  );
}

async function handle(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  // www.derbericht.com → derbericht.com (one address for search engines)
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return Response.redirect(url.toString(), 301);
  }
  await ensureSchema(env);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin" || path.startsWith("/admin/")) return handleAdmin(req, env, url);
  if (path.startsWith("/media/")) return serveMedia(env, path.slice(7));
  if (path.startsWith("/werbung/")) return adClick(env, path.slice(9));
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
    return html(await home(env, ed, "/", null, await pickAds(env, ctx)), 200, "private, max-age=60");
  }

  const seg = path.split("/").filter(Boolean);
  const isEd = (s: string): s is Country => s === "at" || s === "de" || s === "ch";
  const isCat = (s: string): s is Category => (CATEGORIES as string[]).includes(s);

  // Edition pages: /at, /de, /ch — never redirected; a banner suggests the visitor's own edition.
  const banner = (ed: Edition, p: string): PageMeta["banner"] => (!saved && geo && geo !== ed ? { country: geo, path: p } : null);
  if (seg.length === 1 && isEd(seg[0])) {
    const b = banner(seg[0], path);
    return html(await home(env, seg[0], path, b, await pickAds(env, ctx)), 200, b ? "private, max-age=60" : "public, max-age=120");
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

  if (seg[0] === "artikel" && seg[1]) {
    const p = await postBySlug(env, seg[1]);
    if (!p) return html(layout(meta(env, { title: "Nicht gefunden", path, edition: saved ?? "dach", noindex: true }), '<div class="empty">Dieser Beitrag ist nicht verfügbar.</div>'), 404);
    const ads = await pickAds(env, ctx);
    return html(layout(meta(env, { title: `${p.title} | ${env.SITE_NAME}`, path, edition: saved ?? "dach", description: p.teaser ?? p.title, topAd: adHtml(ads.top) }), postPage(p) + adHtml(ads.feed)), 200, "public, max-age=60");
  }
  if (path === "/redaktion") {
    return html(layout(meta(env, { title: `Aus der Redaktion | ${env.SITE_NAME}`, path, edition: saved ?? "dach" }), postList(await publishedPosts(env, 60))), 200, "public, max-age=120");
  }

  if (path === "/ausgabe") {
    return html(layout(meta(env, { title: `Ausgabe wählen | ${env.SITE_NAME}`, path, edition: saved ?? geo ?? "dach", noindex: true }), editionChooser(saved ?? geo ?? "dach")), 200, "private, no-store");
  }

  if (path === "/impressum" || path === "/datenschutz" || path === "/quellen") {
    const p = await getPage(env, path.slice(1) as PageSlug);
    const extra = path === "/quellen" ? feedTable(await getFeedList(env)) : "";
    return html(layout(meta(env, { title: `${p.title} | ${env.SITE_NAME}`, path, edition: saved ?? "dach" }), pageHtml(p, extra)), 200, "public, max-age=300");
  }

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
    const posts = await publishedPosts(env, 500);
    const paths = ["/", "/at", "/de", "/ch", "/vergleich", "/redaktion", "/quellen", "/impressum", ...posts.map((p) => `/artikel/${p.slug}`),
      ...CATEGORIES.flatMap((c) => [`/${c}`, `/at/${c}`, `/de/${c}`, `/ch/${c}`])];
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${env.SITE_URL}${p}</loc><changefreq>hourly</changefreq></url>`).join("")}</urlset>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });
  }

  return html(layout(meta(env, { title: "Seite nicht gefunden", path, edition: saved ?? "dach", noindex: true }), '<div class="empty">Diese Seite gibt es nicht. <a href="/">Zur Startseite</a></div>'), 404);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handle(req, env, ctx);
    } catch (err) {
      console.error(err);
      return new Response("Fehler – bitte später erneut versuchen.", { status: 500 });
    }
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runIngest(env).then((r) => console.log("ingest", JSON.stringify(r))));
  },
};
