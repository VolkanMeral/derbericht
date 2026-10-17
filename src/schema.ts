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
  "CREATE TABLE IF NOT EXISTS users ( id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','editor','author')), pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, last_login INTEGER )",
  "CREATE TABLE IF NOT EXISTS sessions ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL, created INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS story_images ( key TEXT PRIMARY KEY, data BLOB NOT NULL, created INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS media ( id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, size INTEGER NOT NULL, created INTEGER NOT NULL, uploaded_by TEXT )",
  "CREATE TABLE IF NOT EXISTS posts ( id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK (kind IN ('news','kommentar')), title TEXT NOT NULL, teaser TEXT, body TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, country TEXT NOT NULL, author_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published')), image_id TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL, published_at INTEGER )",
  "CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, published_at)",
  "CREATE TABLE IF NOT EXISTS ads ( id TEXT PRIMARY KEY, name TEXT NOT NULL, slot TEXT NOT NULL CHECK (slot IN ('top','side','feed')), kind TEXT NOT NULL CHECK (kind IN ('image','html')), image_id TEXT, link TEXT, html TEXT, active INTEGER NOT NULL DEFAULT 1, starts INTEGER, ends INTEGER, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL )",
  "CREATE TABLE IF NOT EXISTS pages ( slug TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, updated INTEGER NOT NULL, updated_by TEXT )",
];
