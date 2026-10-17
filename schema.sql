-- derbericht.com · Cloudflare D1 schema

CREATE TABLE IF NOT EXISTS feeds (
  id            TEXT PRIMARY KEY,
  publisher     TEXT NOT NULL,
  country       TEXT NOT NULL CHECK (country IN ('at','de','ch')),
  url           TEXT NOT NULL,
  homepage      TEXT NOT NULL,
  category      TEXT NOT NULL,
  paywall_hint  INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  terms_status  TEXT NOT NULL DEFAULT 'prüfen',   -- prüfen | ok | verboten
  last_fetch    INTEGER,
  last_error    TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id          TEXT PRIMARY KEY,               -- hash of url
  feed_id     TEXT NOT NULL REFERENCES feeds(id),
  url         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  teaser      TEXT,                            -- max 120 chars, removed after 48h
  category    TEXT NOT NULL,
  country     TEXT NOT NULL,
  published   INTEGER NOT NULL,
  fetched     INTEGER NOT NULL,
  paywall     INTEGER NOT NULL DEFAULT 0,
  tokens      TEXT NOT NULL,                   -- space separated, for clustering
  cluster_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_cluster ON articles(cluster_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published);

CREATE TABLE IF NOT EXISTS clusters (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL,                 -- article whose headline leads the card
  category      TEXT NOT NULL,
  countries     TEXT NOT NULL,                 -- e.g. "at,de"
  source_count  INTEGER NOT NULL DEFAULT 1,
  first_seen    INTEGER NOT NULL,
  last_update   INTEGER NOT NULL,
  image_key     TEXT,                          -- R2 key of the AI illustration
  image_status  TEXT NOT NULL DEFAULT 'none'   -- none | done | skipped | failed
);
CREATE INDEX IF NOT EXISTS idx_clusters_update ON clusters(last_update);

-- Publishers who asked to be removed (by domain). Checked on every fetch.
CREATE TABLE IF NOT EXISTS optouts (
  domain  TEXT PRIMARY KEY,
  added   INTEGER NOT NULL,
  note    TEXT
);

-- Daily counter for AI image generation (cost limit).
CREATE TABLE IF NOT EXISTS usage (
  day     TEXT PRIMARY KEY,
  images  INTEGER NOT NULL DEFAULT 0
);

-- Admin: users, sessions, own posts, uploaded media, banner ads
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','editor','author')),
  pw_hash     TEXT NOT NULL,
  pw_salt     TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created     INTEGER NOT NULL,
  last_login  INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id       TEXT PRIMARY KEY,                 -- SHA-256 of the cookie token
  user_id  TEXT NOT NULL REFERENCES users(id),
  expires  INTEGER NOT NULL,
  created  INTEGER NOT NULL
);

-- Emoji reactions: only counts; votes are a salted hash, kept 2 days against repeat voting
CREATE TABLE IF NOT EXISTS reactions (
  story_id  TEXT NOT NULL,
  emoji     TEXT NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (story_id, emoji)
);

CREATE TABLE IF NOT EXISTS reaction_votes (
  id        TEXT PRIMARY KEY,
  story_id  TEXT NOT NULL,
  emoji     TEXT NOT NULL,
  created   INTEGER NOT NULL
);

-- Reaction history per day, story and emoji (admin report); kept 90 days
CREATE TABLE IF NOT EXISTS reaction_log (
  day       TEXT NOT NULL,
  story_id  TEXT NOT NULL,
  emoji     TEXT NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, story_id, emoji)
);

-- AI illustrations when no R2 bucket is bound
CREATE TABLE IF NOT EXISTS story_images (
  key      TEXT PRIMARY KEY,
  data     BLOB NOT NULL,
  created  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id           TEXT PRIMARY KEY,
  mime         TEXT NOT NULL,
  data         BLOB NOT NULL,
  size         INTEGER NOT NULL,
  created      INTEGER NOT NULL,
  uploaded_by  TEXT
);

CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN ('news','kommentar')),
  title         TEXT NOT NULL,
  teaser        TEXT,
  body          TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL,
  country       TEXT NOT NULL,
  author_id     TEXT NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published')),
  image_id      TEXT,
  created       INTEGER NOT NULL,
  updated       INTEGER NOT NULL,
  published_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, published_at);

CREATE TABLE IF NOT EXISTS ads (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slot         TEXT NOT NULL CHECK (slot IN ('top','side','feed')),
  kind         TEXT NOT NULL CHECK (kind IN ('image','html')),
  image_id     TEXT,
  link         TEXT,
  html         TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  starts       INTEGER,
  ends         INTEGER,
  impressions  INTEGER NOT NULL DEFAULT 0,
  clicks       INTEGER NOT NULL DEFAULT 0,
  created      INTEGER NOT NULL
);

-- Editable info pages (Impressum, Datenschutz, Quellen-Text)
CREATE TABLE IF NOT EXISTS pages (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  updated     INTEGER NOT NULL,
  updated_by  TEXT
);
