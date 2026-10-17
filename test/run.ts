// Local test without Cloudflare: unit checks + a full run against an in-memory SQLite "D1",
// fake feeds, fake R2 and fake Workers AI. Writes rendered pages to test/out/.
// Run: npm test   (node --experimental-strip-types test/run.ts)

import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { cutTeaser, tokens, similarity, stripHtml } from "../src/text.ts";
import { parseFeed } from "../src/feed.ts";
import { assignClusters } from "../src/cluster.ts";
import { isSensitive, buildPrompt } from "../src/images.ts";
import { FEEDS } from "../src/sources.ts";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => { passed++; console.log("  ✓", name); });
}

// ---------- unit tests ----------
await test("teaser is cut to 120 chars on a word boundary", () => {
  const long = "<p>Die Regierung hat am Dienstag ein umfangreiches Paket beschlossen, das die Energiepreise für Haushalte und Betriebe im kommenden Winter deutlich senken soll.</p>";
  const t = cutTeaser(long);
  assert.ok(t.length <= 122, `length ${t.length}`);
  assert.ok(t.endsWith(" …"));
  assert.ok(!t.includes("<p>"));
});
await test("html entities and CDATA are decoded", () => {
  assert.equal(stripHtml("<![CDATA[Gr&uuml;ne &amp; NEOS]]>"), "Grüne & NEOS");
});
await test("tokens drop stopwords and normalize umlauts", () => {
  assert.deepEqual(tokens("Die Grünen fordern mehr Geld für Schulen"), ["grun", "ford", "geld", "schul"]);
});
await test("similar headlines score high, unrelated low", () => {
  const a = tokens("EU einigt sich auf strengere Regeln für KI-Haftung");
  const b = tokens("KI-Haftung: EU-Staaten einigen sich auf neue Regeln");
  const c = tokens("Rapid gewinnt Derby gegen Austria");
  assert.ok(similarity(a, b).score >= 0.5, JSON.stringify(similarity(a, b)));
  assert.ok(similarity(a, c).score < 0.2);
});
await test("sensitive stories get no AI image", () => {
  assert.ok(isSensitive("Zwei Tote bei Unfall auf der A14"));
  assert.ok(isSensitive("Überschwemmung in Tirol"));
  assert.ok(!isSensitive("Neue Radwege für Dornbirn beschlossen"));
});
await test("image prompt forbids people, text and photorealism", () => {
  const p = buildPrompt("Regierung beschließt Budget", "politik");
  for (const w of ["no people", "no faces", "no text", "Not photorealistic"]) assert.ok(p.includes(w), w);
});

// ---------- fake feeds ----------
const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60000).toUTCString();
function rss(items: [string, string, string, number][]): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${items.map(([t, l, d, m]) =>
    `<item><title><![CDATA[${t}]]></title><link>${l}</link><description><![CDATA[<img src="x.jpg"> ${d}]]></description><pubDate>${iso(m)}</pubDate></item>`).join("")}</channel></rss>`;
}
const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title>
<entry><title>KI-Haftung: Europäische Union einigt sich auf strengere Regeln</title><link rel="alternate" href="https://www.nzz.ch/technologie/ki-haftung-eu-ld.1?utm_source=rss"/><summary>Brüssel hat sich nach langen Verhandlungen geeinigt. Was das für Schweizer Firmen bedeutet, die in die EU liefern.</summary><updated>${new Date(now - 50 * 60000).toISOString()}</updated></entry>
<entry><title>Zürich plant autofreie Altstadt ab 2028</title><link href="https://www.nzz.ch/zuerich/altstadt-ld.2"/><summary>Der Stadtrat legt ein Konzept vor.</summary><updated>${new Date(now - 200 * 60000).toISOString()}</updated></entry></feed>`;

const FAKE: Record<string, string> = {
  "https://rss.orf.at/news.xml": rss([
    ["EU einigt sich auf strengere Regeln für KI-Haftung", "https://orf.at/stories/1/", "Die Mitgliedsstaaten und das Parlament haben sich auf neue Haftungsregeln für künstliche Intelligenz geeinigt. Unternehmen müssen künftig nachweisen, dass ihre Systeme sicher sind.", 30],
    ["Nationalrat beschließt Budget für 2027", "https://orf.at/stories/2/", "Mit den Stimmen der Regierungsparteien wurde das Budget verabschiedet.", 90],
    ["Zwei Tote bei Unfall auf der Westautobahn", "https://orf.at/stories/3/", "Bei einem Unfall nahe Salzburg kamen zwei Menschen ums Leben.", 60],
  ]),
  "https://rss.orf.at/vorarlberg.xml": rss([
    ["Hochwasserwarnung für Rheintal: Pegel der Dornbirner Ach steigt", "https://vorarlberg.orf.at/stories/10/", "Nach starkem Regen warnt das Land vor steigenden Pegeln.", 20],
  ]),
  "https://www.vn.at/feed": rss([
    ["Dornbirner Ach: Pegel steigt, Hochwasserwarnung im Rheintal", "https://www.vn.at/lokal/2026/10/17/hochwasser.vn", "Die Landeswarnzentrale beobachtet die Lage.", 15],
  ]),
  "https://www.derstandard.at/rss": rss([
    ["Budget 2027: Nationalrat beschließt Haushalt mit knapper Mehrheit", "https://www.derstandard.at/story/1", "Die Opposition kritisiert fehlende Reformen.", 80],
    ["KI-Haftung: EU-Staaten einigen sich auf neue Regeln", "https://www.derstandard.at/story/2", "Brüssel setzt Schlusspunkt unter jahrelange Verhandlungen.", 40],
  ]),
  "https://www.tagesschau.de/xml/rss2/": rss([
    ["Einigung in Brüssel: Strengere Haftungsregeln für KI", "https://www.tagesschau.de/ausland/europa/ki-haftung-100.html", "Was die neuen Regeln für Verbraucher bedeuten.", 35],
    ["Bundestag debattiert über Rentenreform", "https://www.tagesschau.de/inland/rente-102.html", "Die Koalition will das Rentenniveau stabilisieren.", 70],
  ]),
  "https://www.spiegel.de/schlagzeilen/index.rss": rss([
    ["S+ Rentenreform: Was die Koalition wirklich plant", "https://www.spiegel.de/politik/rente-a-1.html", "Eine Analyse der Pläne.", 65],
  ]),
  "https://newsfeed.kicker.de/news/aktuell": rss([
    ["Bayern gewinnt Topspiel gegen Dortmund", "https://www.kicker.de/bayern-dortmund", "Spielbericht vom Samstagabend.", 25],
  ]),
  "https://www.srf.ch/news/bnf/rss/1646": rss([
    ["Neue KI-Regeln der EU: Haftung wird strenger", "https://www.srf.ch/news/international/ki-haftung", "Auch Schweizer Unternehmen sind betroffen.", 45],
    ["Zürich will Altstadt bis 2028 autofrei machen", "https://www.srf.ch/news/schweiz/zuerich-altstadt", "Das Gewerbe ist skeptisch.", 180],
  ]),
  "https://www.nzz.ch/recent.rss": atom,
};

// ---------- fake bindings ----------
class D1Stmt {
  db: DatabaseSync; sql: string; args: unknown[];
  constructor(db: DatabaseSync, sql: string, args: unknown[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...a: unknown[]) { return new D1Stmt(this.db, this.sql, a); }
  conv() {
    // D1 accepts ?1 numbered params; node:sqlite wants an array for ? and ?NNN alike.
    return this.args.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v ?? null)) as (string | number | null)[];
  }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...this.conv()) as T[], success: true }; }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.conv()) as T) ?? null; }
  async run() { this.db.prepare(this.sql).run(...this.conv()); return { results: [], success: true }; }
}
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
const DB = {
  prepare: (q: string) => new D1Stmt(sqlite, q),
  batch: async (s: D1Stmt[]) => { sqlite.exec("BEGIN"); try { for (const x of s) await x.run(); sqlite.exec("COMMIT"); } catch (e) { sqlite.exec("ROLLBACK"); throw e; } return []; },
};
const r2 = new Map<string, Uint8Array>();
const IMAGES = {
  get: async (k: string) => (r2.has(k) ? { body: new Blob([r2.get(k)!]).stream() } : null),
  put: async (k: string, v: Uint8Array) => { r2.set(k, v); },
  delete: async (k: string) => { r2.delete(k); },
};
const prompts: string[] = [];
// 1x1 jpeg
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const AI = { run: async (_m: string, input: { prompt: string }) => { prompts.push(input.prompt); return { image: JPEG }; } };

const env = { DB, IMAGES, AI, SITE_URL: "https://derbericht.com", SITE_NAME: "Der Bericht", IMAGE_AI: "on", IMAGE_DAILY_LIMIT: "60", IMAGES_PER_RUN: "4", ADMIN_TOKEN: "t" } as any;

(globalThis as any).fetch = async (u: string) => {
  const body = FAKE[u];
  return body ? new Response(body, { status: 200 }) : new Response("nope", { status: 404 });
};

const { runIngest } = await import("../src/ingest.ts");
const worker = (await import("../src/index.ts")).default;

let result: any;
await test("full ingest run works against fake feeds", async () => {
  result = await runIngest(env);
  assert.equal(result.feeds, FEEDS.filter((f) => f.active).length);
  assert.ok(result.items >= 14, JSON.stringify(result));
});
await test("no image URLs or long text are stored", () => {
  const rows = sqlite.prepare("SELECT title, teaser FROM articles").all() as { title: string; teaser: string | null }[];
  for (const r of rows) {
    assert.ok(!r.teaser || r.teaser.length <= 122, r.teaser ?? "");
    assert.ok(!/(<img|\.jpg)/.test(r.teaser ?? ""), "image leaked");
  }
});
await test("tracking params are removed from links", () => {
  const r = sqlite.prepare("SELECT url FROM articles WHERE url LIKE '%nzz.ch/technologie%'").get() as { url: string };
  assert.equal(r.url, "https://www.nzz.ch/technologie/ki-haftung-eu-ld.1");
});
await test("KI-Haftung story groups AT, DE and CH sources", () => {
  const rows = sqlite.prepare("SELECT cluster_id, COUNT(*) n FROM articles WHERE title LIKE '%KI%' OR title LIKE '%Haftung%' GROUP BY cluster_id").all() as { n: number }[];
  assert.equal(rows.length, 1, JSON.stringify(rows));
  const c = sqlite.prepare("SELECT countries, source_count FROM clusters ORDER BY source_count DESC LIMIT 1").get() as { countries: string; source_count: number };
  assert.equal(c.source_count, 5); // ORF, Standard, tagesschau, SRF, NZZ
  assert.deepEqual(c.countries.split(",").sort(), ["at", "ch", "de"]);
});
await test("budget, flood, pension and Zürich stories cluster; unrelated ones stay apart", () => {
  const n = (sqlite.prepare("SELECT COUNT(*) n FROM clusters").get() as { n: number }).n;
  // KI, Budget, Unfall, Hochwasser, Bayern, Zürich + two pension articles that share only one word
  // ("Rentenreform") and therefore stay apart on purpose: a wrong merge is worse than a missed one.
  assert.equal(n, 8, String(n));
});
await test("paywall is detected and the marker removed from the title", () => {
  const r = sqlite.prepare("SELECT title, paywall FROM articles WHERE url LIKE '%spiegel%'").get() as { title: string; paywall: number };
  assert.equal(r.paywall, 1);
  assert.ok(!r.title.startsWith("S+"));
});
await test("AI images only for 2+ source, non-sensitive stories, within the per-run limit", () => {
  assert.ok(result.images >= 1 && result.images <= 4, String(result.images));
  const unfall = sqlite.prepare("SELECT c.image_status FROM clusters c JOIN articles a ON a.id = c.lead_id WHERE a.title LIKE '%Tote%'").get() as { image_status: string };
  assert.equal(unfall.image_status, "none"); // single source → not even considered
  for (const p of prompts) assert.ok(p.includes("no people"));
});

// ---------- pages ----------
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
async function page(path: string, headers: Record<string, string> = {}) {
  const res = await worker.fetch(new Request("https://derbericht.com" + path, { headers }), env);
  const body = await res.text();
  const name = (path === "/" ? "home" : path.replace(/\W+/g, "_").replace(/^_/, "")) + (headers["CF-IPCountry"] ? "_" + headers["CF-IPCountry"] : "") + ".html";
  writeFileSync(new URL("./out/" + name, import.meta.url), body);
  return { res, body };
}

await test("home page renders with stories, DACH comparison and hreflang", async () => {
  const { res, body } = await page("/", { "CF-IPCountry": "AT" });
  assert.equal(res.status, 200);
  assert.ok(body.includes("Jetzt wichtig"));
  assert.ok(body.includes("DACH-Vergleich"));
  assert.ok(body.includes('hreflang="de-AT"'));
  assert.ok(body.includes("KI-Illustration"));
  assert.ok(!/fonts\.googleapis|googletagmanager/.test(body), "third-party request");
});
await test("edition page /de shows a banner for a visitor from Austria, no redirect", async () => {
  const { res, body } = await page("/de", { "CF-IPCountry": "AT" });
  assert.equal(res.status, 200);
  assert.ok(body.includes("Zur Ausgabe Österreich wechseln"));
});
await test("no banner once an edition is chosen", async () => {
  const { body } = await page("/de", { "CF-IPCountry": "AT", Cookie: "edition=de" });
  assert.ok(!body.includes("Zur Ausgabe Österreich wechseln"));
});
await test("/wechseln sets cookie and only redirects to local paths", async () => {
  let r = await worker.fetch(new Request("https://derbericht.com/wechseln?e=ch&r=/ch"), env);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("Location"), "/ch");
  assert.ok(r.headers.get("Set-Cookie")!.includes("edition=ch"));
  r = await worker.fetch(new Request("https://derbericht.com/wechseln?e=ch&r=//evil.com"), env);
  assert.equal(r.headers.get("Location"), "/");
});
await test("story page is noindex and groups by country", async () => {
  const id = (sqlite.prepare("SELECT id FROM clusters ORDER BY source_count DESC LIMIT 1").get() as { id: string }).id;
  const { body } = await page(`/story/${id}`);
  assert.ok(body.includes('content="noindex,follow"'));
  for (const c of ["Österreich", "Deutschland", "Schweiz"]) assert.ok(body.includes(c));
});
await test("category, comparison, legal pages, robots, sitemap, images, admin", async () => {
  for (const p of ["/at/politik", "/regional", "/vergleich", "/impressum", "/datenschutz", "/quellen"]) {
    const { res } = await page(p);
    assert.equal(res.status, 200, p);
  }
  assert.ok((await (await worker.fetch(new Request("https://derbericht.com/robots.txt"), env)).text()).includes("Sitemap:"));
  assert.ok((await (await worker.fetch(new Request("https://derbericht.com/sitemap.xml"), env)).text()).includes("/ch/sport"));
  const key = [...r2.keys()][0];
  assert.equal((await worker.fetch(new Request(`https://derbericht.com/img/${key}`), env)).status, 200);
  assert.equal((await worker.fetch(new Request("https://derbericht.com/admin/run"), env)).status, 403);
  assert.equal((await page("/gibtsnicht")).res.status, 404);
});
await test("teasers disappear after 48 hours", async () => {
  sqlite.prepare("UPDATE articles SET fetched = ?").run(now - 49 * 3600 * 1000);
  await runIngest(env);
  const left = (sqlite.prepare("SELECT COUNT(*) n FROM articles WHERE teaser IS NOT NULL AND fetched < ?").get(now - 48 * 3600 * 1000) as { n: number }).n;
  assert.equal(left, 0);
});
await test("opt-out removes a publisher's articles", async () => {
  sqlite.prepare("INSERT INTO optouts (domain, added) VALUES ('spiegel.de', ?)").run(now);
  await runIngest(env);
  const n = (sqlite.prepare("SELECT COUNT(*) n FROM articles WHERE url LIKE '%spiegel.de%'").get() as { n: number }).n;
  assert.equal(n, 0);
});

console.log(`\n${passed} tests passed. Pages written to test/out/`);
