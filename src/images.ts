// AI illustrations for story cards (Cloudflare Workers AI, stored in R2 or, without R2, in D1).
// Rules: symbolic illustration only, never photorealistic, no people/faces/logos/text,
// always labelled "KI-Illustration", and no AI image for sensitive stories.

import type { Category } from "./sources.ts";
import type { Env } from "./types.ts";

const MODEL = "@cf/black-forest-labs/flux-1-schnell";

// Stories about death, violence, disasters, abuse etc. get the category icon instead.
const SENSITIVE = /(?<!\p{L})(tot|tote|toten|tod|stirbt|gestorben|leiche|mord|ermordet|getötet|töten|anschlag|terror|attentat|amok|schüsse|erschossen|explosion|bombe|krieg|angriff|raketen?|unfall|absturz|verunglückt|opfer|verletzte?|missbrauch|vergewaltig|suizid|selbstmord|geisel|massaker|leichen|erdbeben|katastrophe|brand|feuer|überschwemmung|flut|lawine|entführ|prozess gegen|angeklagt|festgenommen|kinderporno|hinrichtung)\p{L}*/iu;

const STYLE: Record<Category, string> = {
  politik: "a stylized parliament building, documents and abstract shapes",
  wirtschaft: "abstract charts, coins and industry shapes",
  welt: "a stylized globe and map shapes",
  sport: "abstract sports equipment and stadium shapes",
  kultur: "abstract stage, music and art shapes",
  wissen: "abstract scientific shapes, molecules and lab glassware",
  chronik: "a stylized city street scene without people",
  regional: "stylized alpine landscape and small town architecture",
};

export function isSensitive(title: string): boolean {
  return SENSITIVE.test(title);
}

export function buildPrompt(title: string, category: Category): string {
  const topic = title.replace(/["„“”«»'’]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
  return [
    "Flat editorial illustration, minimalist vector style, soft muted color palette, symbolic and calm.",
    `Theme: ${STYLE[category]}, inspired by this news topic: ${topic}.`,
    "Strictly no people, no faces, no hands, no portraits, no real persons, no text, no letters, no numbers,",
    "no logos, no flags, no brand names. Not photorealistic. Clean composition, wide 16:9 framing.",
  ].join(" ");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Generates illustrations for the most important stories that do not have one yet. */
export async function generateImages(env: Env): Promise<number> {
  if (env.IMAGE_AI !== "on" || !env.AI) return 0;
  const limit = parseInt(env.IMAGE_DAILY_LIMIT || "150", 10);
  // Only stories that several newsrooms carry: small 2-source stories used up the budget by early morning.
  const minSources = parseInt(env.IMAGE_MIN_SOURCES || "3", 10);
  const perRun = parseInt(env.IMAGES_PER_RUN || "4", 10);

  const used = (await env.DB.prepare("SELECT images FROM usage WHERE day = ?").bind(today()).first<{ images: number }>())?.images ?? 0;
  const budget = Math.min(perRun, limit - used);
  if (budget <= 0) return 0;

  const since = Date.now() - 24 * 3600 * 1000;
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.category, a.title FROM clusters c JOIN articles a ON a.id = c.lead_id
     WHERE c.image_status = 'none' AND c.source_count >= ? AND c.last_update > ?
     ORDER BY c.source_count DESC, c.last_update DESC LIMIT ?`,
  ).bind(minSources, since, budget * 2).all<{ id: string; category: Category; title: string }>();

  let made = 0;
  for (const c of results) {
    if (made >= budget) break;
    if (isSensitive(c.title)) {
      await env.DB.prepare("UPDATE clusters SET image_status = 'skipped' WHERE id = ?").bind(c.id).run();
      continue;
    }
    try {
      const out = (await env.AI.run(MODEL, { prompt: buildPrompt(c.title, c.category), steps: 4 })) as { image?: string } | ReadableStream;
      let bytes: Uint8Array;
      if (out instanceof ReadableStream) bytes = new Uint8Array(await new Response(out).arrayBuffer());
      else if (out?.image) bytes = base64ToBytes(out.image);
      else throw new Error("no image in response");
      const key = `story/${c.id}.jpg`;
      if (env.IMAGES) await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
      else await env.DB.prepare("INSERT OR REPLACE INTO story_images (key, data, created) VALUES (?,?,?)").bind(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), Date.now()).run();
      await env.DB.batch([
        env.DB.prepare("UPDATE clusters SET image_status = 'done', image_key = ? WHERE id = ?").bind(key, c.id),
        env.DB.prepare("INSERT INTO usage (day, images) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET images = images + 1").bind(today()),
      ]);
      made++;
    } catch (e) {
      console.error("image failed", c.id, e);
      await env.DB.prepare("UPDATE clusters SET image_status = 'failed' WHERE id = ?").bind(c.id).run();
    }
  }
  return made;
}

/** Reads a stored illustration from R2 or D1. */
export async function loadImage(env: Env, key: string): Promise<BodyInit | null> {
  if (env.IMAGES) {
    const obj = await env.IMAGES.get(key);
    if (obj) return obj.body;
  }
  const row = await env.DB.prepare("SELECT data FROM story_images WHERE key = ?").bind(key).first<{ data: ArrayBuffer | Uint8Array | number[] }>();
  if (!row) return null;
  return row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data as ArrayBuffer);
}
