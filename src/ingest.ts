// Cron job: fetch feeds → apply content rules → cluster → AI images → cleanup.

import { FEEDS, CATEGORY_HINTS, type Category, type Country } from "./sources.ts";
import { parseFeed } from "./feed.ts";
import { cutTeaser, hashId, tokens } from "./text.ts";
import { assignClusters, type Clusterable } from "./cluster.ts";
import { generateImages } from "./images.ts";
import type { Env } from "./types.ts";
import { ensureSchema } from "./data.ts";
import { allowedFeedsSql, commercialMode, enforceLicenses } from "./license.ts";
import { rollup } from "./analytics.ts";

const UA = "DerBerichtBot/1.0 (+https://derbericht.com/quellen; office@derbericht.com)";
const MAX_AGE_MS = 48 * 3600 * 1000;   // ignore older items; teasers are removed after 48h
const KEEP_MS = 14 * 24 * 3600 * 1000; // headline + link kept 14 days, then deleted

interface FeedRow {
  id: string; publisher: string; country: Country; url: string;
  category: Category; paywall_hint: number; active: number;
}

export async function seedFeeds(env: Env): Promise<void> {
  // INSERT OR IGNORE: new feeds from the list are added, existing rows (and their admin toggles) stay as they are.
  await env.DB.batch(
    FEEDS.map((f) =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO feeds (id, publisher, country, url, homepage, category, paywall_hint, active, license, license_note) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).bind(f.id, f.publisher, f.country, f.url, f.homepage, f.category, f.paywallHint ? 1 : 0, f.active ? 1 : 0, f.license ?? "nk", f.note ?? null),
    ),
  );
  // Feed addresses follow the list (the admin cannot edit them).
  await env.DB.batch(FEEDS.map((f) => env.DB.prepare("UPDATE feeds SET url = ? WHERE id = ? AND url != ?").bind(f.url, f.id, f.url)));
  // Licence of rows created before the column existed (an admin edit sets license_note, which then wins).
  await env.DB.batch(FEEDS.filter((f) => f.note).map((f) =>
    env.DB.prepare("UPDATE feeds SET license = ?, license_note = ? WHERE id = ? AND license_note IS NULL").bind(f.license ?? "nk", f.note!, f.id)));
}

export function guessCategory(title: string, fallback: Category): Category {
  // Regional and sport feeds keep their section; general feeds are sorted by keywords.
  if (fallback === "regional" || fallback === "sport") return fallback;
  for (const [cat, re] of CATEGORY_HINTS) if (re.test(title)) return cat;
  return fallback === "politik" ? "politik" : fallback;
}

function domainOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

async function fetchFeed(env: Env, feed: FeedRow, optouts: Set<string>): Promise<Clusterable[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    cf: { cacheTtl: 300 },
  } as RequestInit);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseFeed(await res.text());
  const now = Date.now();
  const fresh: Clusterable[] = [];
  const stmts: D1PreparedStatement[] = [];

  for (const it of items.slice(0, 40)) {
    if (now - it.published > MAX_AGE_MS) continue;
    if (optouts.has(domainOf(it.url))) continue;
    const id = await hashId(it.url);
    // "[premium]" marker in some feeds: paywall article, marker removed from the headline.
    const premium = /\[premium\]/i.test(it.title);
    if (premium) it.title = it.title.replace(/\[premium\]/gi, "").trim();
    const tok = tokens(it.title);
    const teaser = it.summary ? cutTeaser(it.summary) : null;
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO articles (id, feed_id, url, title, teaser, category, country, published, fetched, paywall, tokens)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(id, feed.id, it.url, it.title, teaser || null, guessCategory(it.title, feed.category), feed.country,
        it.published, now, premium || it.paywall || (feed.paywall_hint && /\+$/.test(it.title)) ? 1 : 0, tok.join(" ")),
    );
    fresh.push({ id, tokens: tok, published: it.published, cluster_id: null, feed_id: feed.id });
  }
  // Only articles that were really new (INSERT OR IGNORE skips known URLs) count.
  if (!stmts.length) return [];
  const done = await env.DB.batch(stmts);
  return fresh.filter((_, i) => (done[i]?.meta?.changes ?? 1) > 0);
}

async function cluster(env: Env, newItems: number): Promise<void> {
  // Nothing new since the last run: the clusters cannot change (saves reading the whole 36-hour window).
  if (!newItems) return;
  const since = Date.now() - 36 * 3600 * 1000;
  // Stories that began more than 48 hours ago take no new articles: a new development becomes a new story.
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.feed_id, a.tokens, a.published, a.cluster_id FROM articles a LEFT JOIN clusters c ON c.id = a.cluster_id
     WHERE a.published > ? AND (a.cluster_id IS NULL OR c.first_seen IS NULL OR c.first_seen > ?)`,
  ).bind(since, Date.now() - 48 * 3600 * 1000).all<{ id: string; feed_id: string; tokens: string; published: number; cluster_id: string | null }>();

  const rows: Clusterable[] = results.map((r) => ({ ...r, tokens: r.tokens ? r.tokens.split(" ") : [] }));
  const fresh = rows.filter((r) => !r.cluster_id);
  if (!fresh.length) return;
  const assigned = assignClusters(fresh, rows);

  const touched = new Set<string>();
  const stmts: D1PreparedStatement[] = [];
  for (const [aid, cid] of assigned) {
    stmts.push(env.DB.prepare("UPDATE articles SET cluster_id = ? WHERE id = ?").bind(cid, aid));
    touched.add(cid);
  }
  await env.DB.batch(stmts);

  // Recompute summary fields of every touched cluster.
  const upd: D1PreparedStatement[] = [];
  for (const cid of touched) {
    upd.push(
      env.DB.prepare(
        `INSERT INTO clusters (id, lead_id, category, countries, source_count, first_seen, last_update)
         SELECT ?1,
           (SELECT a2.id FROM articles a2 WHERE a2.cluster_id = ?1 ORDER BY a2.paywall ASC, a2.published ASC LIMIT 1),
           (SELECT a3.category FROM articles a3 WHERE a3.cluster_id = ?1 GROUP BY a3.category ORDER BY COUNT(*) DESC LIMIT 1),
           (SELECT group_concat(DISTINCT a4.country) FROM articles a4 WHERE a4.cluster_id = ?1),
           COUNT(DISTINCT feed_id), MIN(published), MAX(published)
         FROM articles WHERE cluster_id = ?1
         ON CONFLICT(id) DO UPDATE SET lead_id = excluded.lead_id, category = excluded.category,
           countries = excluded.countries, source_count = excluded.source_count, last_update = excluded.last_update`,
      ).bind(cid),
    );
  }
  for (let i = 0; i < upd.length; i += 50) await env.DB.batch(upd.slice(i, i + 50));
}

async function cleanup(env: Env): Promise<void> {
  const now = Date.now();
  const old = await env.DB.prepare(
    "SELECT image_key FROM clusters WHERE last_update < ? AND image_key IS NOT NULL",
  ).bind(now - KEEP_MS).all<{ image_key: string }>();
  if (env.IMAGES) for (const r of old.results) await env.IMAGES.delete(r.image_key);
  await env.DB.batch([
    // Legal rule: teaser disappears after 48 hours, only headline + link remain.
    // Only the slice that crossed 48 h since the last runs (index on fetched) instead of the whole table.
    env.DB.prepare("UPDATE articles SET teaser = NULL WHERE fetched BETWEEN ? AND ? AND teaser IS NOT NULL").bind(now - MAX_AGE_MS - 6 * 3600 * 1000, now - MAX_AGE_MS),
    env.DB.prepare("DELETE FROM articles WHERE published < ?").bind(now - KEEP_MS),
    env.DB.prepare("DELETE FROM story_images WHERE key IN (SELECT image_key FROM clusters WHERE last_update < ? AND image_key IS NOT NULL)").bind(now - KEEP_MS),
    env.DB.prepare("DELETE FROM reaction_votes WHERE created < ?").bind(now - 2 * 24 * 3600 * 1000),
    env.DB.prepare("DELETE FROM reaction_log WHERE day < ?").bind(new Date(now - 90 * 86400_000).toISOString().slice(0, 10)),
    env.DB.prepare("DELETE FROM reactions WHERE story_id IN (SELECT id FROM clusters WHERE last_update < ?)").bind(now - KEEP_MS),
    env.DB.prepare("DELETE FROM clusters WHERE last_update < ?").bind(now - KEEP_MS),
  ]);
}

/** Removes stored articles of an opted-out domain (runs once when the opt-out is added, not every cron). */
export async function removeOptedOut(env: Env, domain: string): Promise<void> {
  await env.DB.prepare("DELETE FROM articles WHERE url LIKE ? OR url LIKE ?").bind(`%://${domain}/%`, `%://www.${domain}/%`).run();
}

export async function runIngest(env: Env): Promise<{ feeds: number; items: number; errors: number; images: number }> {
  await ensureSchema(env);
  await seedFeeds(env);
  const { results: feeds } = await env.DB.prepare(
    `SELECT id, publisher, country, url, category, paywall_hint, active FROM feeds WHERE active = 1 AND terms_status != 'verboten' AND ${allowedFeedsSql((await commercialMode(env)).on)}`,
  ).all<FeedRow>();
  const opt = await env.DB.prepare("SELECT domain FROM optouts").all<{ domain: string }>();
  const optouts = new Set(opt.results.map((r) => r.domain));

  let items = 0, errors = 0;
  const settled = await Promise.allSettled(feeds.map((f) => fetchFeed(env, f, optouts)));
  const status: D1PreparedStatement[] = [];
  settled.forEach((s, i) => {
    const f = feeds[i];
    if (s.status === "fulfilled") {
      items += s.value.length;
      status.push(env.DB.prepare("UPDATE feeds SET last_fetch = ?, last_error = NULL WHERE id = ?").bind(Date.now(), f.id));
    } else {
      errors++;
      status.push(env.DB.prepare("UPDATE feeds SET last_fetch = ?, last_error = ? WHERE id = ?").bind(Date.now(), String(s.reason).slice(0, 200), f.id));
    }
  });
  if (status.length) await env.DB.batch(status);

  await cluster(env, items);
  const images = await generateImages(env);
  await cleanup(env);
  await enforceLicenses(env);
  await rollup(env);
  return { feeds: feeds.length, items, errors, images };
}
