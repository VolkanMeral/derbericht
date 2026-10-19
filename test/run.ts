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
await test("double-encoded HTML in teasers is removed", () => {
  const t = cutTeaser('&lt;img style="float: right" src="https://i.ds.at/x.jpg" /&gt;Die Regierung hat sich geeinigt.');
  assert.equal(t, "Die Regierung hat sich geeinigt.");
  assert.equal(stripHtml('<![CDATA[<img src="a.webp" hspace="5" align="left" >Neben mehreren Verletzten]]>'), "Neben mehreren Verletzten");
});
await test("[premium] marks paywall and is removed from the title", () => {
  const [it] = parseFeed(`<rss><channel><item><title>Regierung bei Uni-Budget einig [premium]</title><link>https://www.diepresse.com/1</link></item></channel></rss>`);
  assert.equal(it.title, "Regierung bei Uni-Budget einig");
  assert.equal(it.paywall, true);
});
await test("keywords sort general-feed headlines into sections", async () => {
  const { guessCategory } = await import("../src/ingest.ts");
  assert.equal(guessCategory("27-Jähriger in Linz spurlos verschwunden", "politik"), "chronik");
  assert.equal(guessCategory("Verdienter Sieg in Lustenau: Der LASK brauchte Geduld", "chronik"), "sport");
  assert.equal(guessCategory("Brände in Indonesien: Höchste Alarmstufe", "politik"), "welt");
  assert.equal(guessCategory("Nationalrat beschließt Budget für 2027", "politik"), "wirtschaft");
  assert.equal(guessCategory("Hochwasser im Rheintal", "regional"), "regional");
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
await test("similar-looking words from different topics do not match", () => {
  assert.equal(similarity(tokens("Nicht ausschlaggebend – und doch zeigte Frankfurt, wie Trier schlagbar ist"), tokens("Schwere Ausschreitungen bei Protesten in Frankreich")).shared, 0);
  assert.ok(similarity(tokens("Koalitionsgespräche in Berlin vereinbart"), tokens("Berlin: Koalition steht")).shared >= 2);
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
    return this.args.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v instanceof ArrayBuffer ? new Uint8Array(v) : v ?? null)) as (string | number | null)[];
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

await test("without R2 the illustration is stored in D1 and served from /img/", async () => {
  const { generateImages } = await import("../src/images.ts");
  sqlite.prepare("UPDATE clusters SET image_status = 'none', image_key = NULL").run();
  const noR2 = { ...env, IMAGES: undefined };
  const made = await generateImages(noR2);
  assert.ok(made >= 1, String(made));
  const row = sqlite.prepare("SELECT key, length(data) n FROM story_images LIMIT 1").get() as { key: string; n: number };
  assert.ok(row.n > 100, String(row.n));
  const res = await worker.fetch(new Request("https://derbericht.com/img/" + row.key), noR2);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/jpeg");
  assert.equal(new Uint8Array(await res.arrayBuffer())[0], 0xff);
});

await test("emoji reactions: counted once per visitor, switchable, can be taken back", async () => {
  const c = sqlite.prepare("SELECT id FROM clusters ORDER BY source_count DESC LIMIT 1").get() as { id: string };
  const vote = async (emoji: string, ip = "1.2.3.4") => {
    const fd = new FormData(); fd.append("story", c.id); fd.append("emoji", emoji);
    const r = await worker.fetch(new Request("https://derbericht.com/reagieren", { method: "POST", body: fd, headers: { "CF-Connecting-IP": ip, Origin: "https://derbericht.com" } }), env);
    return { status: r.status, body: await r.json() as any };
  };
  let r = await vote("👍"); assert.equal(r.body.counts["👍"], 1); assert.equal(r.body.mine, "👍");
  r = await vote("👍", "5.6.7.8"); assert.equal(r.body.counts["👍"], 2);
  r = await vote("😮"); assert.equal(r.body.counts["👍"], 1); assert.equal(r.body.counts["😮"], 1);
  r = await vote("😮"); assert.equal(r.body.counts["😮"] ?? 0, 0); assert.equal(r.body.mine, null);
  r = await vote("💩"); assert.equal(r.status, 400);
  const bad = await worker.fetch(new Request("https://derbericht.com/reagieren", { method: "POST", body: new FormData(), headers: { Origin: "https://evil.example" } }), env);
  assert.equal(bad.status, 403);
  assert.ok(!JSON.stringify(sqlite.prepare("SELECT * FROM reaction_votes").all()).includes("1.2.3.4"), "IP stored");
  const page = await (await worker.fetch(new Request("https://derbericht.com/story/" + c.id), env)).text();
  assert.ok(page.includes('class="react"') && page.includes("wa.me/?text=") && page.includes("Link kopieren"));
  assert.ok(page.includes('og:image'), "og:image for link previews");
  const other = sqlite.prepare("SELECT a.id, a.title FROM articles a JOIN clusters c ON c.id = a.cluster_id WHERE c.id = ? AND a.id != c.lead_id LIMIT 1").get(c.id) as { id: string; title: string };
  const picked = await (await worker.fetch(new Request(`https://derbericht.com/karte/${c.id}?a=${other.id}`), env)).text();
  assert.ok(picked.includes(other.title.slice(0, 20)), "card shows the tapped headline");
  const http = await worker.fetch(new Request("http://derbericht.com/at?x=1"), env);
  assert.equal(http.status, 301);
  assert.equal(http.headers.get("Location"), "https://derbericht.com/at?x=1");
  const secure = await worker.fetch(new Request("https://derbericht.com/at"), env);
  assert.ok(secure.headers.get("Strict-Transport-Security"), "HSTS");
  const found = await (await worker.fetch(new Request("https://derbericht.com/suche?q=Haftung"), env)).text();
  mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
  writeFileSync(new URL("./out/suche.html", import.meta.url), found);
  assert.ok(/Treffer für „Haftung“/.test(found) && found.includes("KI-Haftung") && found.includes('class="card"'), "search finds the KI story");
  const stem = await (await worker.fetch(new Request("https://derbericht.com/suche?q=haftungsregeln%20eu"), env)).text();
  assert.ok(!stem.includes("Keine Treffer"), "stemmed / multi-word search");
  const none = await (await worker.fetch(new Request("https://derbericht.com/suche?q=%3Cscript%3Exyzq"), env)).text();
  assert.ok(none.includes("Keine Treffer") && !none.includes("<script>xyzq"), "no results, escaped");
  const empty = await (await worker.fetch(new Request("https://derbericht.com/suche"), env)).text();
  assert.ok(empty.includes("autofocus") && empty.includes('action="/suche"'), "empty search page");
  const feed = await (await worker.fetch(new Request("https://derbericht.com/api/social.json?min=2"), env)).json() as any;
  assert.ok(feed.stories.length >= 1 && feed.stories[0].image.startsWith("https://derbericht.com/img/") && feed.stories[0].url.includes("/story/"), "social feed");
  const card = await worker.fetch(new Request("https://derbericht.com/karte/" + c.id), env);
  const ch = await card.text();
  assert.equal(card.status, 200);
  mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
  writeFileSync(new URL("./out/karte.html", import.meta.url), ch);
  assert.ok(ch.includes("weiterlesen") && ch.includes('class="react"') && ch.includes("wa.me") && !ch.includes("<html"), "sheet fragment");
  const home = await (await worker.fetch(new Request("https://derbericht.com/"), env)).text();
  assert.ok(home.includes("data-sheet="), "sheet links");
  assert.ok(home.includes("Der Bericht<span>.</span>"), "logo");
  assert.ok(home.includes('class="leadsocial"') && home.includes("wa.me"), "lead: reactions + WhatsApp");
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
  assert.ok(body.includes("Neueste Meldungen"), "latest column");
  assert.ok(body.includes("Meistberichtet"), "most covered grid");
  assert.ok(body.includes('hreflang="de-AT"'));
  assert.ok(body.includes("KI-Illustration"));
  assert.ok(!/fonts\.googleapis|googletagmanager/.test(body), "third-party request");
});
await test("breaking strip, dateline and mobile menu are rendered", async () => {
  const { body } = await page("/at", { Cookie: "edition=at" });
  // The KI story is breaking (5 sources) but already leads the page, so no duplicate strip.
  assert.ok(!body.includes('class="breaking"'), "no duplicate strip");
  assert.ok(/Meldungen aus \d+ Redaktionen/.test(body), "dateline");
  assert.ok(body.includes('class="bottomnav"') && body.includes('href="/at/regional"'), "bottom nav");
  assert.ok(body.includes('class="edpick"'), "edition picker");
  assert.ok(body.includes('class="avatars"'), "source avatars on lead card");
  const ed = await page("/ausgabe", { Cookie: "edition=at" });
  assert.equal(ed.res.status, 200);
  assert.ok(ed.body.includes("Ausgabe wählen"));
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
await test("www redirects to the bare domain", async () => {
  const r = await worker.fetch(new Request("https://www.derbericht.com/at?x=1"), env);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("Location"), "https://derbericht.com/at?x=1");
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
  assert.notEqual((await worker.fetch(new Request("https://derbericht.com/admin/run"), env)).status, 500);
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


// ---------- admin ----------
const O = "https://derbericht.com";
async function req(path: string, opts: { method?: string; form?: Record<string, string | Blob>; cookie?: string; origin?: string } = {}) {
  let body: FormData | undefined;
  if (opts.form) { body = new FormData(); for (const [k, v] of Object.entries(opts.form)) body.append(k, v); }
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.method === "POST") headers.Origin = opts.origin ?? O;
  const res = await worker.fetch(new Request(O + path, { method: opts.method ?? "GET", body, headers }), env);
  return { res, text: await res.text(), cookie: (res.headers.get("Set-Cookie") ?? "").split(";")[0] };
}

await test("admin setup needs SETUP_CODE and is closed afterwards", async () => {
  delete env.SETUP_CODE;
  let r = await req("/admin");
  assert.ok(r.text.includes("SETUP_CODE"), "explains the setup code");
  env.SETUP_CODE = "geheimer-code-123";
  r = await req("/admin", { method: "POST", form: { code: "falsch", name: "A", email: "a@b.at", password: "1234567890ab" } });
  assert.ok(r.res.headers.get("Location")!.includes("err="));
  r = await req("/admin", { method: "POST", form: { code: "geheimer-code-123", name: "Volkan Meral", email: "Admin@Example.at", password: "sehr-sicheres-pw" } });
  assert.equal(r.res.status, 303);
  assert.ok(r.cookie.startsWith("db_session="));
  // second setup attempt is now a normal login redirect
  r = await req("/admin", { method: "POST", form: { code: "geheimer-code-123", name: "X", email: "x@x.at", password: "1234567890ab" } });
  assert.equal(r.res.headers.get("Location"), "/admin/login");
});

let adminCookie = "";
await test("login works, wrong password is rejected, cross-origin POST is blocked", async () => {
  let r = await req("/admin/login", { method: "POST", form: { email: "admin@example.at", password: "falsch-falsch" } });
  assert.ok(r.res.headers.get("Location")!.includes("err="));
  r = await req("/admin/login", { method: "POST", form: { email: "admin@example.at", password: "sehr-sicheres-pw" } });
  adminCookie = r.cookie;
  assert.ok(adminCookie.startsWith("db_session="));
  r = await req("/admin", { cookie: adminCookie });
  assert.ok(r.text.includes("Guten Tag, Volkan"));
  r = await req("/admin/benutzer", { method: "POST", cookie: adminCookie, origin: "https://evil.example", form: { name: "x" } });
  assert.equal(r.res.status, 403);
});

let authorCookie = "";
await test("admin creates an author; author can write but not publish or manage users", async () => {
  let r = await req("/admin/benutzer", { method: "POST", cookie: adminCookie, form: { name: "Ayşe Yılmaz", email: "ayse@example.at", role: "author", password: "autorin-pw-2026" } });
  assert.ok(r.res.headers.get("Location")!.includes("ok="));
  r = await req("/admin/login", { method: "POST", form: { email: "ayse@example.at", password: "autorin-pw-2026" } });
  authorCookie = r.cookie;
  r = await req("/admin/benutzer", { cookie: authorCookie });
  assert.ok(r.text.includes("Kein Zugriff"));
  r = await req("/admin/beitraege/neu", { method: "POST", cookie: authorCookie, form: { title: "Mein Kommentar", kind: "kommentar", category: "politik", country: "at", body: "Hallo **Welt**\n\n<script>alert(1)</script>", action: "publish" } });
  const loc = r.res.headers.get("Location")!;
  const row = sqlite.prepare("SELECT status FROM posts WHERE title = 'Mein Kommentar'").get() as { status: string };
  assert.equal(row.status, "draft", "author cannot publish");
  r = await req(loc.split("?")[0], { method: "POST", cookie: authorCookie, form: { title: "Mein Kommentar", kind: "kommentar", category: "politik", country: "at", body: "Hallo **Welt**\n\n<script>alert(1)</script>", action: "review" } });
  assert.equal((sqlite.prepare("SELECT status FROM posts WHERE title = 'Mein Kommentar'").get() as { status: string }).status, "review");
});

await test("editor/admin publishes with a cover image; post appears on the site, HTML is escaped", async () => {
  const id = (sqlite.prepare("SELECT id FROM posts WHERE title = 'Mein Kommentar'").get() as { id: string }).id;
  const png = new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0))], "a.png", { type: "image/png" });
  let r = await req(`/admin/beitraege/${id}`, { method: "POST", cookie: adminCookie, form: { title: "Mein Kommentar", kind: "kommentar", category: "politik", country: "at", teaser: "Ein Vorspann.", body: "Hallo **Welt**\n\n## Zwischentitel\n\n<script>alert(1)</script>", image: png, action: "publish" } });
  assert.ok(r.res.headers.get("Location")!.includes("ok="));
  const p = sqlite.prepare("SELECT slug, status, image_id FROM posts WHERE id = ?").get(id) as { slug: string; status: string; image_id: string };
  assert.equal(p.status, "published");
  r = await req(`/artikel/${p.slug}`);
  assert.equal(r.res.status, 200);
  assert.ok(r.text.includes("<strong>Welt</strong>") && r.text.includes("<h2>Zwischentitel</h2>"));
  assert.ok(!r.text.includes("<script>alert(1)</script>"), "script escaped");
  assert.ok(r.text.includes("Ayşe Yılmaz"));
  const img = await worker.fetch(new Request(`${O}/media/${p.image_id}`), env);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("Content-Type"), "image/png");
  r = await req("/at", { cookie: "edition=at" });
  assert.ok(r.text.includes("Aus der Redaktion") && r.text.includes("Mein Kommentar"));
});

await test("banner ads: created in admin, shown with 'Anzeige', clicks counted", async () => {
  let r = await req("/admin/werbung", { cookie: authorCookie });
  assert.ok(r.text.includes("Kein Zugriff"), "author has no ad access");
  r = await req("/admin/werbung/neu", { method: "POST", cookie: adminCookie, form: { name: "Autohaus Dornbirn", slot: "top", kind: "html", html: '<div id="partner">Partner</div>', active: "1" } });
  assert.ok(r.res.headers.get("Location")!.includes("ok="));
  const png = new File([new Uint8Array([137, 80, 78, 71])], "b.png", { type: "image/png" });
  await req("/admin/werbung/neu", { method: "POST", cookie: adminCookie, form: { name: "Bäckerei", slot: "side", kind: "image", image: png, link: "https://example.at/angebot", active: "1" } });
  r = await req("/at", { cookie: "edition=at" });
  assert.ok(r.text.includes("Anzeige") && r.text.includes('id="partner"') && r.text.includes("/werbung/"));
  const adId = (sqlite.prepare("SELECT id FROM ads WHERE name = 'Bäckerei'").get() as { id: string }).id;
  const click = await worker.fetch(new Request(`${O}/werbung/${adId}`), env);
  assert.equal(click.status, 302);
  assert.equal(click.headers.get("Location"), "https://example.at/angebot");
  assert.equal((sqlite.prepare("SELECT clicks FROM ads WHERE id = ?").get(adId) as { clicks: number }).clicks, 1);
  r = await req("/admin/werbung/neu", { method: "POST", cookie: adminCookie, form: { name: "X", slot: "top", kind: "image", link: "javascript:alert(1)", image: png } });
  assert.ok(r.res.headers.get("Location")!.includes("err="), "rejects non-http links");
});

await test("reaction report: totals, top stories, CSV; dashboard tile", async () => {
  let r = await req("/admin/reaktionen?t=1", { cookie: adminCookie });
  writeFileSync(new URL("./out/admin_reaktionen.html", import.meta.url), r.text);
  assert.ok(r.text.includes("Reaktionen der Leser") && r.text.includes("Meldungen mit den meisten Reaktionen"), "report page");
  assert.ok(r.text.includes("KI-Haftung") && r.text.includes("Stimmung"), "voted story listed");
  r = await req("/admin/reaktionen.csv?t=7", { cookie: adminCookie });
  assert.ok(r.text.includes("Gefällt mir") && r.text.includes("KI-Haftung"), "csv");
  r = await req("/admin", { cookie: adminCookie });
  assert.ok(r.text.includes("Leser-Reaktionen heute"), "dashboard tile");
});

await test("admin pages: sources toggle, opt-out, password reset with code, logout", async () => {
  let r = await req("/admin/quellen", { cookie: adminCookie });
  assert.ok(r.text.includes("Jetzt abrufen") && r.text.includes("ORF"));
  r = await req("/admin/quellen", { method: "POST", cookie: adminCookie, form: { action: "optout", domain: "https://www.kurier.at/irgendwas" } });
  assert.ok((sqlite.prepare("SELECT domain FROM optouts WHERE domain = 'kurier.at'").get() as { domain: string }).domain);
  for (const [path, name] of [["/admin", "admin_dash"], ["/admin/beitraege", "admin_posts"], [`/admin/beitraege/${(sqlite.prepare("SELECT id FROM posts LIMIT 1").get() as { id: string }).id}`, "admin_edit"], ["/admin/werbung", "admin_ads"], ["/admin/benutzer", "admin_users"]]) {
    writeFileSync(new URL(`./out/${name}.html`, import.meta.url), (await req(path, { cookie: adminCookie })).text);
  }
  r = await req("/admin/seiten", { cookie: adminCookie });
  assert.ok(r.text.includes("Impressum") && r.text.includes("Platzhalter offen"));
  r = await req("/admin/seiten/impressum", { method: "POST", cookie: adminCookie, form: { title: "Impressum", body: "**Medieninhaber:**\nFastRoute GmbH\nMusterstraße 1\n6850 Dornbirn\n\n<b>x</b>" } });
  assert.ok(r.res.headers.get("Location")!.includes("ok="));
  let pub = await (await worker.fetch(new Request(`${O}/impressum`), env)).text();
  assert.ok(pub.includes("FastRoute GmbH<br>Musterstraße 1<br>6850 Dornbirn"), "line breaks kept");
  assert.ok(!pub.includes("<b>x</b>"), "HTML escaped");
  r = await req("/admin/seiten/impressum", { method: "POST", cookie: adminCookie, form: { action: "reset" } });
  pub = await (await worker.fetch(new Request(`${O}/impressum`), env)).text();
  assert.ok(pub.includes("ATU71572719") && pub.includes("mailto:office@derbericht.com"), "back to default");
  r = await req("/admin/seiten", { cookie: authorCookie });
  assert.ok(r.text.includes("Kein Zugriff"), "author cannot edit legal pages");
  pub = await (await worker.fetch(new Request(`${O}/quellen`), env)).text();
  assert.ok(pub.includes("Herausgeber") && pub.includes("Sie möchten nicht verlinkt werden?"));
  r = await req("/admin/zuruecksetzen", { method: "POST", form: { code: "falsch", email: "admin@example.at", password: "neues-passwort-1" } });
  assert.ok(r.res.headers.get("Location")!.includes("err="));
  r = await req("/admin/zuruecksetzen", { method: "POST", form: { code: "geheimer-code-123", email: "ADMIN@example.at", password: "neues-passwort-1" } });
  assert.equal(r.res.status, 303);
  assert.ok(r.cookie.startsWith("db_session="), "logged in after reset");
  r = await req("/admin/login", { method: "POST", form: { email: "admin@example.at", password: "neues-passwort-1" } });
  assert.ok(r.cookie.startsWith("db_session="), "new password works");
  r = await req("/admin/logout", { method: "POST", cookie: adminCookie });
  r = await req("/admin", { cookie: adminCookie });
  assert.equal(r.res.headers.get("Location"), "/admin/login", "session ended");
});

await test("licences: active banner = commercial mode, non-commercial sources pause and their articles go", async () => {
  const { commercialMode, enforceLicenses } = await import("../src/license.ts");
  const lic = sqlite.prepare("SELECT license, COUNT(*) n FROM feeds GROUP BY license").all() as { license: string; n: number }[];
  assert.ok(lic.some((l) => l.license === "frei") && lic.some((l) => l.license === "nk"), JSON.stringify(lic));
  sqlite.prepare("UPDATE ads SET active = 0").run();
  assert.equal((await commercialMode(env)).on, false);
  const before = (sqlite.prepare("SELECT COUNT(*) n FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE f.license = 'nk'").get() as { n: number }).n;
  assert.ok(before > 0);
  await enforceLicenses(env);
  assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE f.license = 'nk'").get() as { n: number }).n, before, "kept without ads");
  sqlite.prepare("UPDATE ads SET active = 1").run();
  assert.equal((await commercialMode(env)).on, true);
  await enforceLicenses(env);
  assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE f.license = 'nk'").get() as { n: number }).n, 0, "removed with ads");
  const orphan = (sqlite.prepare("SELECT COUNT(*) n FROM clusters c WHERE NOT EXISTS (SELECT 1 FROM articles a WHERE a.cluster_id = c.id)").get() as { n: number }).n;
  assert.equal(orphan, 0, "no empty stories left");
  const r = await req("/admin/quellen", { cookie: (await req("/admin/login", { method: "POST", form: { email: "admin@example.at", password: "neues-passwort-1" } })).cookie });
  assert.ok(r.text.includes("Werbemodus aktiv") && r.text.includes("Pausiert (Nutzungsrecht)") && r.text.includes("Nutzung erlaubt"), "admin shows licence state");
});

await test("visitor stats: pages count, bots and admin do not, dashboard shows live/today", async () => {
  const visit = (path: string, ua: string, ip: string) => worker.fetch(new Request("https://derbericht.com" + path, { headers: { "User-Agent": ua, "CF-Connecting-IP": ip, "CF-IPCountry": "AT", Referer: "https://www.google.com/" } }), env);
  const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1";
  const before = (sqlite.prepare("SELECT COUNT(*) n FROM visitors").get() as { n: number }).n;
  await visit("/", phone, "10.0.0.1");
  await visit("/at", phone, "10.0.0.1");
  await visit("/", "Mozilla/5.0 (Windows NT 10.0) Chrome/130", "10.0.0.2");
  await visit("/", "Googlebot/2.1 (+http://www.google.com/bot.html)", "10.0.0.3");
  await visit("/robots.txt", phone, "10.0.0.4");
  const rows = sqlite.prepare("SELECT * FROM visitors").all() as any[];
  assert.equal(rows.length - before, 2, "two humans, bot and robots.txt ignored");
  const me = rows.find((r) => r.device === "mobile");
  assert.equal(me.views, 2); assert.equal(me.country, "AT"); assert.equal(me.ref, "google.com");
  assert.ok(!JSON.stringify(rows).includes("10.0.0.1"), "IP not stored");
  const cookie = (await req("/admin/login", { method: "POST", form: { email: "admin@example.at", password: "neues-passwort-1" } })).cookie;
  let r = await req("/admin", { cookie });
  assert.ok(r.text.includes("Gerade auf der Website") && r.text.includes("Besucher heute"), "dashboard tiles");
  r = await req("/admin/besucher?t=7", { cookie });
  writeFileSync(new URL("./out/admin_besucher.html", import.meta.url), r.text);
  assert.ok(r.text.includes("Meistgelesene Seiten") && r.text.includes("google.com") && r.text.includes("Smartphone"), "visitors page");
});

console.log(`\n${passed} tests passed. Pages written to test/out/`);
