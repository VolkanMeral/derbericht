// Groups articles about the same event. Pure logic, no I/O, so it can be tested locally.

import { similarity } from "./text.ts";

export interface Clusterable {
  id: string;
  tokens: string[];
  published: number;
  cluster_id: string | null;
  feed_id: string;
}

const WINDOW_MS = 36 * 3600 * 1000; // only match against stories from the last 36 hours
const MIN_SHARED = 2;
const MIN_SCORE = 0.5;

/**
 * Assigns a cluster id to each new article. Matches against recent articles that already have a
 * cluster, then against each other. Returns article id → cluster id. New clusters get the id of
 * their first article.
 */
export function assignClusters(fresh: Clusterable[], recent: Clusterable[]): Map<string, string> {
  const result = new Map<string, string>();
  const pool: Clusterable[] = recent.filter((r) => r.cluster_id);
  const sorted = [...fresh].sort((a, b) => a.published - b.published);

  for (const art of sorted) {
    let best: { cid: string; score: number; shared: number } | null = null;
    for (const other of pool) {
      if (Math.abs(other.published - art.published) > WINDOW_MS) continue;
      if (other.feed_id === art.feed_id && other.id !== art.id) {
        // Same feed rarely runs two articles on one event within hours; require a stronger match.
        const s = similarity(art.tokens, other.tokens);
        if (s.score < 0.8 || s.shared < 3) continue;
      }
      const s = similarity(art.tokens, other.tokens);
      if (s.shared < MIN_SHARED || s.score < MIN_SCORE) continue;
      if (!best || s.score > best.score || (s.score === best.score && s.shared > best.shared)) {
        best = { cid: other.cluster_id!, score: s.score, shared: s.shared };
      }
    }
    const cid = best?.cid ?? art.id;
    result.set(art.id, cid);
    pool.push({ ...art, cluster_id: cid });
  }
  return result;
}
