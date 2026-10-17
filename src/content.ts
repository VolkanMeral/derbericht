// Own editorial content (posts), uploaded media and banner ads: queries + public rendering.

import { CATEGORY_NAME, COUNTRY_NAME, type Category, type Country } from "./sources.ts";
import { escapeHtml as e } from "./text.ts";
import { renderMarkdown } from "./markdown.ts";
import type { Env } from "./types.ts";

export interface Post {
  id: string; slug: string; kind: "news" | "kommentar"; title: string; teaser: string | null; body: string;
  category: Category; country: Country; author_id: string; status: "draft" | "review" | "published";
  image_id: string | null; created: number; updated: number; published_at: number | null; author_name?: string;
}

export interface Ad {
  id: string; name: string; slot: "top" | "side" | "feed"; kind: "image" | "html"; image_id: string | null;
  link: string | null; html: string | null; active: number; starts: number | null; ends: number | null;
  impressions: number; clicks: number; created: number;
}

export const SLOT_LABEL: Record<Ad["slot"], string> = {
  top: "Oben (Leaderboard, z. B. 970×90 / mobil 320×100)",
  side: "Seitenspalte (300×250)",
  feed: "Zwischen den Rubriken (breit, z. B. 970×250)",
};

export const MAX_UPLOAD = 1_500_000; // D1 rows are limited to 2 MB
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ---------- media ----------
export async function saveMedia(env: Env, file: File, userId: string | null): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Nur JPG, PNG, WebP oder GIF.");
  if (file.size > MAX_UPLOAD) throw new Error("Das Bild ist größer als 1,5 MB. Bitte verkleinern.");
  const id = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("INSERT INTO media (id, mime, data, size, created, uploaded_by) VALUES (?,?,?,?,?,?)")
    .bind(id, file.type, await file.arrayBuffer(), file.size, Date.now(), userId).run();
  return id;
}

export async function serveMedia(env: Env, id: string): Promise<Response> {
  if (!/^[a-f0-9]{20}$/.test(id)) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare("SELECT mime, data FROM media WHERE id = ?").bind(id).first<{ mime: string; data: ArrayBuffer | number[] | Uint8Array }>();
  if (!row) return new Response("Not found", { status: 404 });
  const bytes = row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data as ArrayBuffer);
  return new Response(bytes, { headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}

// ---------- posts ----------
export async function publishedPosts(env: Env, limit = 6, country?: Country): Promise<Post[]> {
  const where = country ? "AND (p.country = ? OR p.country = 'dach')" : "";
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.name AS author_name FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.status = 'published' ${where} ORDER BY p.published_at DESC LIMIT ?`,
  ).bind(...(country ? [country, limit] : [limit])).all<Post>();
  return results;
}

export async function searchPosts(env: Env, query: string): Promise<Post[]> {
  const words = query.toLowerCase().split(/\s+/).map((w) => w.replace(/[%_]/g, "")).filter((w) => w.length >= 2).slice(0, 6);
  if (!words.length) return [];
  const where = words.map(() => "(p.title LIKE ? OR p.teaser LIKE ? OR p.body LIKE ?)").join(" AND ");
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.name AS author_name FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.status = 'published' AND ${where} ORDER BY p.published_at DESC LIMIT 6`,
  ).bind(...words.flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`])).all<Post>();
  return results;
}

export async function postBySlug(env: Env, slug: string): Promise<Post | null> {
  return env.DB.prepare(
    "SELECT p.*, u.name AS author_name FROM posts p JOIN users u ON u.id = p.author_id WHERE p.slug = ? AND p.status = 'published'",
  ).bind(slug).first<Post>();
}

function postDate(ts: number): string {
  return new Date(ts).toLocaleDateString("de-AT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Vienna" });
}

function kindLabel(p: Post): string {
  return p.kind === "kommentar" ? "Kommentar" : "Aus der Redaktion";
}

export function postCards(posts: Post[]): string {
  if (!posts.length) return "";
  return `<section><div class="sechead"><h2>Aus der Redaktion</h2><a href="/redaktion">Alle Beiträge →</a></div><div class="grid">${posts.map((p) => `
    <a class="card own" href="/artikel/${e(p.slug)}">
      <div class="fig">${p.image_id ? `<img src="/media/${e(p.image_id)}" alt="" loading="lazy">` : `<div class="ownmark">${p.kind === "kommentar" ? "Kommentar" : "Der Bericht."}</div>`}</div>
      <span class="sub"><span class="cat">${kindLabel(p)}</span> · ${e(p.author_name ?? "")} · ${postDate(p.published_at ?? p.created)}</span>
      <span class="t">${e(p.title)}</span>
    </a>`).join("")}</div></section>`;
}

export function postPage(p: Post): string {
  return `<article class="post">
    <div class="meta"><span class="cat">${kindLabel(p)}</span><span>${e(CATEGORY_NAME[p.category] ?? "")}</span>${p.country !== "dach" ? `<span>${e(COUNTRY_NAME[p.country] ?? "")}</span>` : ""}</div>
    <h1>${e(p.title)}</h1>
    ${p.teaser ? `<p class="lede">${e(p.teaser)}</p>` : ""}
    <div class="byline">Von <strong>${e(p.author_name ?? "")}</strong> · ${postDate(p.published_at ?? p.created)}${p.updated > (p.published_at ?? 0) + 60_000 ? ` · aktualisiert ${postDate(p.updated)}` : ""}</div>
    ${p.image_id ? `<figure><img src="/media/${e(p.image_id)}" alt=""></figure>` : ""}
    <div class="body">${renderMarkdown(p.body)}</div>
    ${p.kind === "kommentar" ? `<p class="note">Kommentare geben die Meinung der Autorin oder des Autors wieder.</p>` : ""}
  </article>`;
}

export function postList(posts: Post[]): string {
  return `<div class="sechead"><h2>Aus der Redaktion</h2></div>${posts.length ? `<div class="grid">${posts.map((p) => `
    <a class="card own" href="/artikel/${e(p.slug)}"><div class="fig">${p.image_id ? `<img src="/media/${e(p.image_id)}" alt="" loading="lazy">` : `<div class="ownmark">${p.kind === "kommentar" ? "Kommentar" : "Der Bericht."}</div>`}</div>
    <span class="sub"><span class="cat">${kindLabel(p)}</span> · ${e(p.author_name ?? "")} · ${postDate(p.published_at ?? p.created)}</span><span class="t">${e(p.title)}</span></a>`).join("")}</div>` : '<div class="empty">Noch keine Beiträge.</div>'}`;
}

// ---------- ads ----------
export type AdSlots = Partial<Record<Ad["slot"], Ad>>;

/** One active ad per slot (random among candidates). Impressions are counted in the background. */
export async function pickAds(env: Env, ctx?: ExecutionContext): Promise<AdSlots> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT * FROM ads WHERE active = 1 AND (starts IS NULL OR starts <= ?) AND (ends IS NULL OR ends >= ?)",
  ).bind(now, now).all<Ad>();
  const slots: AdSlots = {};
  for (const slot of ["top", "side", "feed"] as const) {
    const c = results.filter((a) => a.slot === slot);
    if (c.length) slots[slot] = c[Math.floor(Math.random() * c.length)];
  }
  const ids = Object.values(slots).map((a) => a!.id);
  if (ids.length && ctx) {
    ctx.waitUntil(env.DB.prepare(`UPDATE ads SET impressions = impressions + 1 WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run().catch(() => {}));
  }
  return slots;
}

export function adHtml(ad: Ad | undefined): string {
  if (!ad) return "";
  // Austrian media law (§ 26 MedienG): paid content must be labelled.
  const label = '<span class="adlabel">Anzeige</span>';
  if (ad.kind === "html" && ad.html) return `<aside class="ad ad-${ad.slot}" aria-label="Anzeige">${label}<div class="adcode">${ad.html}</div></aside>`;
  if (ad.kind === "image" && ad.image_id) {
    const img = `<img src="/media/${e(ad.image_id)}" alt="${e(ad.name)}" loading="lazy">`;
    return `<aside class="ad ad-${ad.slot}" aria-label="Anzeige">${label}${ad.link ? `<a href="/werbung/${e(ad.id)}" rel="sponsored noopener" target="_blank">${img}</a>` : img}</aside>`;
  }
  return "";
}

export async function adClick(env: Env, id: string): Promise<Response> {
  const ad = await env.DB.prepare("SELECT link FROM ads WHERE id = ?").bind(id).first<{ link: string | null }>();
  if (!ad?.link || !/^https?:\/\//.test(ad.link)) return new Response("Not found", { status: 404 });
  await env.DB.prepare("UPDATE ads SET clicks = clicks + 1 WHERE id = ?").bind(id).run();
  return new Response(null, { status: 302, headers: { Location: ad.link, "Cache-Control": "no-store" } });
}
