// Generated from schema.sql – keep in sync. Applied automatically on the first run.
export const SCHEMA: string[] = [
  "CREATE TABLE IF NOT EXISTS feeds ( id TEXT PRIMARY KEY, publisher TEXT NOT NULL, country TEXT NOT NULL CHECK (country IN ('at','de','ch')), url TEXT NOT NULL, homepage TEXT NOT NULL, category TEXT NOT NULL, paywall_hint INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, terms_status TEXT NOT NULL DEFAULT 'prüfen', last_fetch INTEGER, last_error TEXT )",
  "CREATE TABLE IF NOT EXISTS articles ( id TEXT PRIMARY KEY, feed_id TEXT NOT NULL REFERENCES feeds(id), url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, teaser TEXT, category TEXT NOT NULL, country TEXT NOT NULL, published INTEGER NOT NULL, fetched INTEGER NOT NULL, paywall INTEGER NOT NULL DEFAULT 0, tokens TEXT NOT NULL, cluster_id TEXT )",
  "CREATE INDEX IF NOT EXISTS idx_articles_cluster ON articles(cluster_id)",
  "CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published)",
  "CREATE TABLE IF NOT EXISTS clusters ( id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, category TEXT NOT NULL, countries TEXT NOT NULL, source_count INTEGER NOT NULL DEFAULT 1, first_seen INTEGER NOT NULL, last_update INTEGER NOT NULL, image_key TEXT, image_status TEXT NOT NULL DEFAULT 'none' )",
  "CREATE INDEX IF NOT EXISTS idx_clusters_update ON clusters(last_update)",
  "CREATE TABLE IF NOT EXISTS optouts ( domain TEXT PRIMARY KEY, added INTEGER NOT NULL, note TEXT )",
  "CREATE TABLE IF NOT EXISTS usage ( day TEXT PRIMARY KEY, images INTEGER NOT NULL DEFAULT 0 )",
];
