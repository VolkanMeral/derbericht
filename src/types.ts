import type { Category, Country } from "./sources.ts";

export interface Env {
  DB: D1Database;
  IMAGES?: R2Bucket; // optional: without it, cards show category icons
  AI?: Ai;
  SITE_URL: string;
  SITE_NAME: string;
  IMAGE_AI: string;
  IMAGE_DAILY_LIMIT: string;
  IMAGES_PER_RUN: string;
  COMMERCIAL?: string; // "on" when the site earns money outside the banner ads (e.g. AdSense)
  SETUP_CODE?: string; // secret: needed once to create the first administrator
}

export interface ArticleRow {
  id: string;
  feed_id: string;
  url: string;
  title: string;
  teaser: string | null;
  category: Category;
  country: Country;
  published: number;
  fetched: number;
  paywall: number;
  tokens: string;
  cluster_id: string | null;
  publisher?: string;
}

export interface ClusterRow {
  id: string;
  lead_id: string;
  category: Category;
  countries: string;
  source_count: number;
  first_seen: number;
  last_update: number;
  image_key: string | null;
  image_status: string;
}

export interface Story extends ClusterRow {
  articles: ArticleRow[];
  lead: ArticleRow;
}
