// Usage licence per source, and the "commercial mode" switch.
//   frei       – the publisher allows use on other websites (e.g. heise) or we have permission
//   nk         – the publisher's terms allow non-commercial use only
//   erlaubnis  – permission required; the feed is not fetched until the licence is changed
// As soon as Der Bericht earns money (an active banner ad, or COMMERCIAL=on for e.g. AdSense),
// "nk" sources are paused automatically and their stored articles removed.

import type { Env } from "./types.ts";

export type License = "frei" | "nk" | "erlaubnis";
export const LICENSES: License[] = ["frei", "nk", "erlaubnis"];
export const LICENSE_LABEL: Record<License, string> = {
  frei: "Nutzung erlaubt",
  nk: "Nur nicht-kommerziell",
  erlaubnis: "Erlaubnis nötig",
};

/** Column additions for databases created before the licence existed (errors = already there). */
export const MIGRATIONS = [
  "ALTER TABLE feeds ADD COLUMN license TEXT NOT NULL DEFAULT 'nk'",
  "ALTER TABLE feeds ADD COLUMN license_note TEXT",
];

export async function commercialMode(env: Env): Promise<{ on: boolean; reason: string }> {
  if ((env.COMMERCIAL ?? "").toLowerCase() === "on") return { on: true, reason: "COMMERCIAL=on (z. B. Google AdSense)" };
  const now = Date.now();
  const ad = await env.DB.prepare(
    "SELECT name FROM ads WHERE active = 1 AND (starts IS NULL OR starts <= ?) AND (ends IS NULL OR ends >= ?) LIMIT 1",
  ).bind(now, now).first<{ name: string }>();
  return ad ? { on: true, reason: `aktive Anzeige „${ad.name}“` } : { on: false, reason: "" };
}

/** SQL condition for feeds that may be fetched right now. */
export function allowedFeedsSql(commercial: boolean): string {
  return commercial ? "license = 'frei'" : "license IN ('frei','nk')";
}

/** In commercial mode: remove articles of sources that may not be used commercially, then fix the clusters. */
export async function enforceLicenses(env: Env): Promise<void> {
  const mode = await commercialMode(env);
  const blocked = mode.on ? "('nk','erlaubnis')" : "('erlaubnis')";
  const gone = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM articles WHERE feed_id IN (SELECT id FROM feeds WHERE license IN ${blocked})`,
  ).first<{ n: number }>();
  if (!gone?.n) return;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM articles WHERE feed_id IN (SELECT id FROM feeds WHERE license IN ${blocked})`),
    env.DB.prepare("DELETE FROM clusters WHERE NOT EXISTS (SELECT 1 FROM articles a WHERE a.cluster_id = clusters.id)"),
    env.DB.prepare(
      `UPDATE clusters SET
         source_count = (SELECT COUNT(DISTINCT a.feed_id) FROM articles a WHERE a.cluster_id = clusters.id),
         countries = (SELECT group_concat(DISTINCT a.country) FROM articles a WHERE a.cluster_id = clusters.id),
         lead_id = CASE WHEN EXISTS (SELECT 1 FROM articles a WHERE a.id = clusters.lead_id) THEN lead_id
                   ELSE (SELECT a.id FROM articles a WHERE a.cluster_id = clusters.id ORDER BY a.paywall ASC, a.published ASC LIMIT 1) END`,
    ),
  ]);
}
