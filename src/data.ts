// Read side: loads ranked stories (clusters + their articles) for the pages.

import type { Category, Country } from "./sources.ts";
import type { ArticleRow, ClusterRow, Env, Story } from "./types.ts";

export interface StoryQuery {
  country?: Country;          // only stories with at least one source from this country
  boost?: Country;            // rank stories from this country higher (homepage)
  category?: Category;
  multiCountry?: boolean;     // DACH comparison: sources from 2+ countries
  minSources?: number;
  limit?: number;
  hours?: number;
}

export async function getStories(env: Env, q: StoryQuery): Promise<Story[]> {
  const now = Date.now();
  const where: string[] = ["c.last_update > ?"];
  const args: unknown[] = [now - (q.hours ?? 36) * 3600 * 1000];
  if (q.country) { where.push("instr(c.countries, ?) > 0"); args.push(q.country); }
  if (q.category) { where.push("c.category = ?"); args.push(q.category); }
  if (q.multiCountry) where.push("instr(c.countries, ',') > 0");
  if (q.minSources) { where.push("c.source_count >= ?"); args.push(q.minSources); }

  const boost = q.boost ? "+ (CASE WHEN instr(c.countries, ?) > 0 THEN 4 ELSE 0 END)" : "";
  const sql = `SELECT c.* FROM clusters c WHERE ${where.join(" AND ")}
    ORDER BY (c.source_count * 3.0 - (? - c.last_update) / 3600000.0 ${boost}) DESC LIMIT ?`;
  const params = [...args, now, ...(q.boost ? [q.boost] : []), q.limit ?? 30];
  const { results: clusters } = await env.DB.prepare(sql).bind(...params).all<ClusterRow>();
  if (!clusters.length) return [];
  return attachArticles(env, clusters);
}

export async function getStory(env: Env, id: string): Promise<Story | null> {
  const c = await env.DB.prepare("SELECT * FROM clusters WHERE id = ?").bind(id).first<ClusterRow>();
  if (!c) return null;
  return (await attachArticles(env, [c]))[0] ?? null;
}

async function attachArticles(env: Env, clusters: ClusterRow[]): Promise<Story[]> {
  const ids = clusters.map((c) => c.id);
  const marks = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.feed_id, a.url, a.title, a.teaser, a.category, a.country, a.published, a.paywall, a.cluster_id,
            f.publisher
     FROM articles a JOIN feeds f ON f.id = a.feed_id
     WHERE a.cluster_id IN (${marks}) ORDER BY a.published ASC`,
  ).bind(...ids).all<ArticleRow>();

  const by = new Map<string, ArticleRow[]>();
  for (const a of results) {
    const list = by.get(a.cluster_id!) ?? [];
    // One article per publisher in a story (feeds often repeat updates).
    if (!list.some((x) => x.publisher === a.publisher)) list.push(a);
    by.set(a.cluster_id!, list);
  }
  return clusters
    .map((c) => {
      const articles = by.get(c.id) ?? [];
      const lead = articles.find((a) => a.id === c.lead_id) ?? articles[0];
      return lead ? { ...c, articles, lead } : null;
    })
    .filter((s): s is Story => s !== null);
}

export async function getFeedList(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT publisher, country, homepage, active, terms_status, last_fetch, last_error FROM feeds ORDER BY country, publisher",
  ).all<{ publisher: string; country: Country; homepage: string; active: number; terms_status: string; last_fetch: number | null; last_error: string | null }>();
  return results;
}
