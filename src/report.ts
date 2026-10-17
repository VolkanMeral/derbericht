// Reader reaction report for the admin area (/admin/reaktionen).
// Source: reaction_log (per day, story and emoji; +1 when a reader reacts, −1 when they take it back).

import { EMOJIS, EMOJI_LABEL } from "./social.ts";
import { CATEGORY_NAME, type Category } from "./sources.ts";
import { escapeHtml as e } from "./text.ts";
import type { Env } from "./types.ts";

export const PERIODS = [1, 7, 14] as const;
const MOOD: Record<string, "pos" | "neg" | "neu"> = { "👍": "pos", "❤️": "pos", "😢": "neg", "😡": "neg", "😮": "neu", "🤔": "neu" };

export function dayKey(ts: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date(ts));
}

interface StoryRow { story_id: string; emoji: string; n: number; title: string | null; category: Category | null; sources: number | null }

export interface ReportData {
  days: number;
  total: number;
  byEmoji: Record<string, number>;
  daily: { day: string; n: number }[];
  stories: { id: string; title: string; category: Category | null; sources: number; counts: Record<string, number>; total: number }[];
  byCategory: { category: Category; total: number; stories: number; counts: Record<string, number> }[];
}

export async function loadReport(env: Env, days: number): Promise<ReportData> {
  const since = dayKey(Date.now() - (days - 1) * 86400_000);
  const trendSince = dayKey(Date.now() - 13 * 86400_000);
  // One-time carry-over: reactions given before the history table existed count for today.
  await env.DB.prepare(
    "INSERT INTO reaction_log (day, story_id, emoji, n) SELECT ?, story_id, emoji, n FROM reactions WHERE n > 0 AND NOT EXISTS (SELECT 1 FROM reaction_log LIMIT 1)",
  ).bind(dayKey(Date.now())).run();
  const [rows, daily] = await Promise.all([
    env.DB.prepare(
      `SELECT r.story_id, r.emoji, SUM(r.n) AS n, a.title, c.category, c.source_count AS sources
       FROM reaction_log r LEFT JOIN clusters c ON c.id = r.story_id LEFT JOIN articles a ON a.id = c.lead_id
       WHERE r.day >= ? GROUP BY r.story_id, r.emoji HAVING SUM(r.n) > 0`,
    ).bind(since).all<StoryRow>(),
    env.DB.prepare("SELECT day, SUM(n) AS n FROM reaction_log WHERE day >= ? GROUP BY day ORDER BY day").bind(trendSince).all<{ day: string; n: number }>(),
  ]);

  const byEmoji: Record<string, number> = {};
  const stories = new Map<string, ReportData["stories"][number]>();
  for (const r of rows.results) {
    byEmoji[r.emoji] = (byEmoji[r.emoji] ?? 0) + r.n;
    const s = stories.get(r.story_id) ?? { id: r.story_id, title: r.title ?? "(Meldung bereits gelöscht)", category: r.category, sources: r.sources ?? 0, counts: {}, total: 0 };
    s.counts[r.emoji] = (s.counts[r.emoji] ?? 0) + r.n;
    s.total += r.n;
    stories.set(r.story_id, s);
  }
  const list = [...stories.values()].sort((a, b) => b.total - a.total);
  const cats = new Map<Category, ReportData["byCategory"][number]>();
  for (const s of list) {
    if (!s.category) continue;
    const c = cats.get(s.category) ?? { category: s.category, total: 0, stories: 0, counts: {} };
    c.total += s.total; c.stories++;
    for (const [em, n] of Object.entries(s.counts)) c.counts[em] = (c.counts[em] ?? 0) + n;
    cats.set(s.category, c);
  }
  // Fill missing days with 0 so the trend shows quiet days too.
  const dmap = new Map(daily.results.map((d) => [d.day, d.n]));
  const trend = Array.from({ length: 14 }, (_, i) => dayKey(Date.now() - (13 - i) * 86400_000)).map((day) => ({ day, n: Math.max(0, dmap.get(day) ?? 0) }));
  return {
    days,
    total: Object.values(byEmoji).reduce((a, b) => a + b, 0),
    byEmoji,
    daily: trend,
    stories: list,
    byCategory: [...cats.values()].sort((a, b) => b.total - a.total),
  };
}

function top(counts: Record<string, number>): string {
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : "–";
}

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)} %` : "–";
}

function bar(n: number, max: number): string {
  const w = max ? Math.max(2, Math.round((n / max) * 100)) : 0;
  return `<span class="rbar"><i style="width:${w}%"></i></span>`;
}

export const REPORT_CSS = `
.rbar{display:inline-block;width:100%;min-width:80px;height:10px;border-radius:5px;background:#ececE7;overflow:hidden;vertical-align:middle}
.rbar i{display:block;height:100%;background:var(--ink);border-radius:5px}
.em{font-size:20px;line-height:1}
td.num,th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.trend{display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:6px;align-items:end;height:150px;margin-top:12px}
.trend div{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%;font-size:11px;color:var(--muted)}
.trend i{display:block;width:100%;max-width:34px;background:var(--ink);border-radius:6px 6px 2px 2px;min-height:2px}
.trend b{font-size:12px;color:var(--ink);font-weight:600}
.seg2{display:inline-flex;gap:4px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:4px}
.seg2 a{padding:6px 14px;border-radius:999px;text-decoration:none;font-weight:500;font-size:14px}.seg2 a[aria-current]{background:var(--ink);color:#fff}
.mood{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:10px 0 8px}
.mood i{display:block;height:100%}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted)}.legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;background:var(--c)}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:18px;margin-bottom:18px}
`;

export function reportBody(d: ReportData): string {
  const periodNav = `<nav class="seg2" aria-label="Zeitraum">${PERIODS.map((p) =>
    `<a href="/admin/reaktionen?t=${p}"${p === d.days ? ' aria-current="page"' : ""}>${p === 1 ? "Heute" : `${p} Tage`}</a>`).join("")}</nav>`;
  const head = `<div class="top"><h1>Reaktionen der Leser</h1><div class="actions">${periodNav}<a class="btn light small" href="/admin/reaktionen.csv?t=${d.days}">CSV herunterladen</a></div></div>`;
  if (!d.total) {
    return `${head}<div class="card"><p class="muted" style="margin:0">Im gewählten Zeitraum gab es noch keine Reaktionen. Leser reagieren auf der Website mit 👍 ❤️ 😮 😢 😡 🤔 – die Zahlen erscheinen hier sofort.</p></div>`;
  }
  const mood = { pos: 0, neg: 0, neu: 0 };
  for (const [em, n] of Object.entries(d.byEmoji)) mood[MOOD[em] ?? "neu"] += n;
  const topEmoji = top(d.byEmoji);
  const stat = (v: string | number, l: string) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`;
  const maxEm = Math.max(...Object.values(d.byEmoji));
  const maxDay = Math.max(1, ...d.daily.map((x) => x.n));

  const emojiRows = EMOJIS.map((em) => {
    const n = d.byEmoji[em] ?? 0;
    return `<tr><td><span class="em">${em}</span></td><td>${EMOJI_LABEL[em]}</td><td style="width:45%">${bar(n, maxEm)}</td><td class="num">${n}</td><td class="num muted">${pct(n, d.total)}</td></tr>`;
  }).join("");

  const storyRows = d.stories.slice(0, 25).map((s, i) => `<tr>
    <td class="num muted">${i + 1}</td>
    <td><a href="/story/${e(s.id)}" target="_blank"><strong>${e(s.title)}</strong></a><br><span class="muted">${s.category ? e(CATEGORY_NAME[s.category]) : ""}${s.sources ? ` · ${s.sources} Quellen` : ""}</span></td>
    ${EMOJIS.map((em) => `<td class="num">${s.counts[em] ?? ""}</td>`).join("")}
    <td class="num"><strong>${s.total}</strong></td><td class="em" style="text-align:center">${top(s.counts)}</td></tr>`).join("");

  const leaders = EMOJIS.map((em) => {
    const best = d.stories.filter((s) => s.counts[em]).sort((a, b) => (b.counts[em] ?? 0) - (a.counts[em] ?? 0))[0];
    return best ? `<tr><td><span class="em">${em}</span></td><td><a href="/story/${e(best.id)}" target="_blank">${e(best.title)}</a></td><td class="num">${best.counts[em]}</td></tr>` : "";
  }).join("");

  const catRows = d.byCategory.map((c) => `<tr><td><strong>${e(CATEGORY_NAME[c.category])}</strong></td><td class="num">${c.total}</td><td class="num">${c.stories}</td><td class="num">${(c.total / c.stories).toFixed(1)}</td><td class="em" style="text-align:center">${top(c.counts)}</td></tr>`).join("");

  const trend = d.daily.map((x) => {
    const label = new Date(x.day + "T12:00:00Z").toLocaleDateString("de-AT", { day: "numeric", month: "numeric" });
    return `<div title="${label}: ${x.n}"><b>${x.n || ""}</b><i style="height:${Math.round((x.n / maxDay) * 110)}px"></i>${label}</div>`;
  }).join("");

  return `${head}
  <div class="stats">
    ${stat(d.total, d.days === 1 ? "Reaktionen heute" : `Reaktionen (${d.days} Tage)`)}
    ${stat(d.stories.length, "Meldungen mit Reaktionen")}
    ${stat(`<span class="em" style="font-size:28px">${topEmoji}</span>`, `Häufigste Reaktion · ${pct(d.byEmoji[topEmoji] ?? 0, d.total)}`)}
    ${stat((d.total / Math.max(1, d.stories.length)).toFixed(1), "Reaktionen pro Meldung")}
  </div>
  <div class="grid2">
    <div class="card"><h2 style="font-size:20px">Stimmung</h2>
      <div class="mood" role="img" aria-label="Positiv ${pct(mood.pos, d.total)}, neutral ${pct(mood.neu, d.total)}, negativ ${pct(mood.neg, d.total)}">
        <i style="width:${(mood.pos / d.total) * 100}%;background:#2f6b3a"></i><i style="width:${(mood.neu / d.total) * 100}%;background:#b9b9b2"></i><i style="width:${(mood.neg / d.total) * 100}%;background:#c8321c"></i></div>
      <div class="legend"><span style="--c:#2f6b3a">Positiv 👍❤️ ${pct(mood.pos, d.total)}</span><span style="--c:#b9b9b2">Neutral 😮🤔 ${pct(mood.neu, d.total)}</span><span style="--c:#c8321c">Negativ 😢😡 ${pct(mood.neg, d.total)}</span></div>
      <table style="margin-top:12px"><tbody>${emojiRows}</tbody></table>
    </div>
    <div class="card"><h2 style="font-size:20px">Verlauf (14 Tage)</h2><div class="trend">${trend}</div></div>
  </div>
  <div class="card tablewrap" style="margin-bottom:18px"><h2 style="font-size:20px;margin-bottom:6px">Meldungen mit den meisten Reaktionen</h2>
    <table><thead><tr><th></th><th>Meldung</th>${EMOJIS.map((em) => `<th class="num em">${em}</th>`).join("")}<th class="num">Gesamt</th><th>Top</th></tr></thead><tbody>${storyRows}</tbody></table></div>
  <div class="grid2">
    <div class="card tablewrap"><h2 style="font-size:20px;margin-bottom:6px">Spitzenreiter je Emoji</h2><table><tbody>${leaders}</tbody></table></div>
    <div class="card tablewrap"><h2 style="font-size:20px;margin-bottom:6px">Nach Rubrik</h2>
      <table><thead><tr><th>Rubrik</th><th class="num">Reaktionen</th><th class="num">Meldungen</th><th class="num">Ø pro Meldung</th><th>Top</th></tr></thead><tbody>${catRows}</tbody></table></div>
  </div>
  <p class="muted" style="font-size:13px">Gezählt werden Reaktionen pro Besucher und Meldung (eine Stimme, änderbar). Meldungen werden nach 14 Tagen gelöscht; ihre Reaktionen bleiben im Verlauf erhalten.</p>`;
}

export function reportCsv(d: ReportData): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [["Meldung", "Rubrik", "Quellen", ...EMOJIS.map((em) => EMOJI_LABEL[em]), "Gesamt"].map(q).join(";")];
  for (const s of d.stories) {
    lines.push([q(s.title), q(s.category ? CATEGORY_NAME[s.category] : ""), String(s.sources), ...EMOJIS.map((em) => String(s.counts[em] ?? 0)), String(s.total)].join(";"));
  }
  return "﻿" + lines.join("\r\n");
}
