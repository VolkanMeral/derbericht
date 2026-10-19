// Text helpers: HTML stripping, entity decoding, legal teaser cut, tokenizing for clustering.

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sbquo: "‚", euro: "€",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function stripHtml(s: string): string {
  // Feeds often double-encode HTML (&lt;img …&gt;), so strip, decode and strip again until stable.
  let out = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let i = 0; i < 3; i++) {
    const next = decodeEntities(out.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " "));
    if (next === out) break;
    out = next;
  }
  return out.replace(/<[^>]*$/, "").replace(/\s+/g, " ").trim();
}

/** Legal rule: at most `max` characters, cut on a word boundary, never the whole story. */
export function cutTeaser(s: string, max = 120): string {
  const clean = stripHtml(s);
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).replace(/[\s,;:.–-]+$/, "") + " …";
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function norm(w: string): string {
  return w.toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

// German stopwords that carry no topic signal.
const STOP = new Set(
  ("der die das den dem des ein eine einer einem einen eines und oder aber auch als am an auf aus bei bis "
    + "durch für gegen hat haben hatte ist im in ins mit nach nicht noch nur ob ohne sich sie er es wir ihr "
    + "so um unter über vom von vor war waren wird werden wie wo zu zum zur sein seine ihre ihren dass "
    + "was wer wann warum mehr neue neuer neues jetzt heute gestern erst schon soll sollen kann können "
    + "muss müssen will wollen nun alle viele weil wenn dann doch beim laut sagt sagen live ticker video "
    + "news update liveticker kommentar analyse interview").split(" ").map(norm),
);

// Two-letter words that do carry meaning in headlines.
const SHORT = new Set(["eu", "ki", "us", "un", "uk", "wm", "em", "ezb", "f1"]);

function stem(w: string): string {
  for (const suf of ["ungen", "innen", "ern", "en", "er", "es", "em", "e", "n", "s"]) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}

export function tokens(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => (w.length >= 3 || SHORT.has(w)) && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words.map(stem))];
}

/** Two tokens match if equal, or if one is (almost) the start of the other: a shared prefix of
 *  5+ letters covering at least 80 % of the shorter word (German compounds and inflections:
 *  "streng" ~ "strenger", "haftung" ~ "haftungsregel", "einig" ~ "einigung" – but not
 *  "frankfurt" ~ "frankreich" or "ausschlaggebend" ~ "ausschreitungen"). */
function match(x: string, y: string): boolean {
  if (x === y) return true;
  if (x.length < 5 || y.length < 5) return false;
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i >= 5 && i >= 0.8 * Math.min(x.length, y.length);
}

/** Overlap score used for clustering: shared tokens relative to the shorter title. */
export function similarity(a: string[], b: string[]): { shared: number; score: number } {
  if (!a.length || !b.length) return { shared: 0, score: 0 };
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  const shared = small.filter((t) => big.some((u) => match(t, u))).length;
  return { shared, score: shared / small.length };
}

export async function hashId(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
