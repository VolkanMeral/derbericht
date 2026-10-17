// Admin area at /admin: login, dashboard, own posts, banner ads, sources, users.
// Server-rendered forms; POSTs are only accepted from the same origin (CSRF protection).

import {
  can, countUsers, createUser, currentUser, endSession, passwordProblem, randomId, ROLE_LABEL, ROLES,
  setPassword, startSession, verifyLogin, type Role, type User,
} from "./auth.ts";
import { IMAGE_TYPES, saveMedia, SLOT_LABEL, type Ad, type Post } from "./content.ts";
import { renderMarkdown, slugify } from "./markdown.ts";
import { CATEGORY_NAME, COUNTRY_NAME, type Category } from "./sources.ts";
import { CATEGORIES } from "./render.ts";
import { escapeHtml as e } from "./text.ts";
import { runIngest } from "./ingest.ts";
import { getPage, PAGE_DEFAULTS, PAGE_SLUGS, savePage, type PageSlug } from "./legal.ts";
import type { Env } from "./types.ts";
import { dayKey, loadReport, PERIODS, REPORT_CSS, reportBody, reportCsv } from "./report.ts";

// ---------- rendering ----------

const CSS = `
@font-face{font-family:"Bricolage";src:url(/fonts/bricolage.woff2) format("woff2");font-weight:200 800;font-display:swap}
@font-face{font-family:"Geist";src:url(/fonts/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}
:root{--bg:#f4f4f1;--card:#fff;--ink:#111113;--muted:#5c5c63;--line:#e6e6e1;--accent:#c8321c;--ok:#2f6b3a;--warn:#9a5b00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Geist",system-ui,sans-serif}
a{color:inherit}h1,h2,h3{font-family:"Bricolage",system-ui,sans-serif;letter-spacing:-.02em;margin:0}
.shell{display:flex;flex-wrap:wrap;min-height:100vh}
.side{flex:0 0 232px;background:var(--ink);color:#fff;padding:22px 14px;display:flex;flex-direction:column;gap:4px}
.side .logo{font:800 22px "Bricolage",sans-serif;letter-spacing:-.04em;padding:0 10px 18px;text-decoration:none}.side .logo span{color:#f08a74}
.side a.nav{display:block;padding:10px 12px;border-radius:10px;text-decoration:none;color:#d6d6da;font-weight:500}
.side a.nav:hover{background:#1f1f24;color:#fff}.side a.nav[aria-current]{background:#fff;color:var(--ink)}
.side .who{margin-top:auto;padding:12px;font-size:13px;color:#a9a9b0;border-top:1px solid #2c2c31}
.side .who strong{display:block;color:#fff}
.main{flex:999 1 560px;min-width:0;padding:28px 32px 64px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.top h1{font-size:30px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:22px}
.stat b{display:block;font:700 30px "Bricolage",sans-serif}.stat span{color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
tr:last-child td{border-bottom:0}.tablewrap{overflow-x:auto}
.btn{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 18px;border-radius:999px;border:0;background:var(--ink);color:#fff;font:600 14px "Geist",sans-serif;text-decoration:none;cursor:pointer}
.btn.light{background:#fff;color:var(--ink);border:1px solid var(--line)}.btn.danger{background:#fff;color:var(--accent);border:1px solid #f0c7bf}
.btn.small{height:34px;padding:0 14px;font-size:13px}
form.f{display:flex;flex-direction:column;gap:16px}
label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:14px}
label small{font-weight:400;color:var(--muted)}
input[type=text],input[type=email],input[type=password],input[type=url],input[type=datetime-local],select,textarea{font:15px "Geist",sans-serif;padding:11px 12px;border:1px solid #cfcfc8;border-radius:10px;background:#fff;color:var(--ink);width:100%}
textarea{min-height:360px;line-height:1.6;resize:vertical}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.check{flex-direction:row;align-items:center;gap:10px;font-weight:500}
.pill{display:inline-block;font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;background:#ececE7}
.pill.published,.pill.ok{background:#e1efe3;color:var(--ok)}.pill.review{background:#fbeccf;color:var(--warn)}.pill.draft{background:#ececE7;color:var(--muted)}.pill.off{background:#f7dfda;color:var(--accent)}
.msg{padding:12px 16px;border-radius:12px;margin-bottom:18px;font-weight:500}.msg.ok{background:#e1efe3;color:var(--ok)}.msg.err{background:#f7dfda;color:var(--accent)}
.muted{color:var(--muted)}.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.preview{border-top:1px solid var(--line);margin-top:8px;padding-top:16px}.preview h2{font-size:22px;margin:18px 0 8px}.preview p{margin:0 0 12px}
.login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.login .card{width:100%;max-width:420px}
.thumb{max-width:220px;border-radius:10px;border:1px solid var(--line);display:block}
@media (max-width:760px){.side{flex:1 1 100%;flex-direction:row;flex-wrap:wrap;padding:12px}.side .logo{padding:6px 10px;flex:1 1 100%}.side .who{display:none}.main{padding:20px 16px 48px}}
`;

function page(title: string, body: string, user?: User | null, active = ""): Response {
  const nav = user
    ? `<nav class="side"><a class="logo" href="/admin">Der Bericht<span>.</span> admin</a>
      ${navItem("/admin", "Übersicht", active)}
      ${navItem("/admin/beitraege", "Beiträge", active)}
      ${can.stats(user) ? navItem("/admin/reaktionen", "Reaktionen", active) : ""}
      ${can.ads(user) ? navItem("/admin/werbung", "Werbung", active) : ""}
      ${can.sources(user) ? navItem("/admin/quellen", "Quellen", active) : ""}
      ${can.pages(user) ? navItem("/admin/seiten", "Seiten", active) : ""}
      ${can.users(user) ? navItem("/admin/benutzer", "Benutzer", active) : ""}
      ${navItem("/admin/profil", "Mein Profil", active)}
      <a class="nav" href="/" target="_blank">Website ansehen ↗</a>
      <form method="post" action="/admin/logout" style="margin:0"><button class="nav" style="all:unset;display:block;padding:10px 12px;color:#d6d6da;cursor:pointer;font-weight:500">Abmelden</button></form>
      <div class="who"><strong>${e(user.name)}</strong>${ROLE_LABEL[user.role]}</div></nav>`
    : "";
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${e(title)} · Der Bericht Admin</title><style>${CSS}${REPORT_CSS}</style></head>
<body>${user ? `<div class="shell">${nav}<main class="main">${body}</main></div>` : body}</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" } });
}

function navItem(href: string, label: string, active: string): string {
  return `<a class="nav" href="${href}"${active === href ? ' aria-current="page"' : ""}>${label}</a>`;
}

function redirect(to: string, cookie?: string): Response {
  const h = new Headers({ Location: to, "Cache-Control": "no-store" });
  if (cookie) h.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers: h });
}

function flash(url: URL): string {
  const ok = url.searchParams.get("ok");
  const err = url.searchParams.get("err");
  return (ok ? `<div class="msg ok">${e(ok)}</div>` : "") + (err ? `<div class="msg err">${e(err)}</div>` : "");
}

function back(path: string, kind: "ok" | "err", msg: string): Response {
  return redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}

const dt = (ts: number | null) => ts ? new Date(ts).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Vienna" }) : "–";
const STATUS_LABEL: Record<Post["status"], string> = { draft: "Entwurf", review: "Zur Freigabe", published: "Veröffentlicht" };

/** <input type=datetime-local> value in Vienna time, and back. */
function toLocalInput(ts: number | null): string {
  if (!ts) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
  return parts.replace(" ", "T");
}
function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const guess = Date.parse(v + ":00Z");
  if (!Number.isFinite(guess)) return null;
  const local = Date.parse(toLocalInput(guess) + ":00Z");
  return guess - (local - guess);
}

// ---------- entry ----------

export async function handleAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "") || "/admin";

  if (req.method === "POST") {
    const origin = req.headers.get("Origin");
    if (origin && origin !== url.origin) return new Response("Forbidden", { status: 403 });
  }

  // First start: create the first administrator with the setup code.
  if ((await countUsers(env)) === 0) return setup(req, env, url);

  if (path === "/admin/login") return login(req, env, url);
  if (path === "/admin/zuruecksetzen") return resetWithCode(req, env, url);
  if (path === "/admin/logout" && req.method === "POST") return redirect("/admin/login", await endSession(env, req));

  const user = await currentUser(env, req);
  if (!user) return redirect("/admin/login");

  if (path === "/admin") return dashboard(env, user, url);
  if (path === "/admin/beitraege") return postsList(env, user, url);
  if (path === "/admin/beitraege/neu" || /^\/admin\/beitraege\/[a-f0-9]+$/.test(path)) return postEdit(req, env, user, url, path.split("/").pop()!);
  if (path === "/admin/profil") return profile(req, env, user, url);
  if ((path === "/admin/reaktionen" || path === "/admin/reaktionen.csv") && can.stats(user)) {
    const t = Number(url.searchParams.get("t"));
    const days = (PERIODS as readonly number[]).includes(t) ? t : 7;
    const data = await loadReport(env, days);
    if (path.endsWith(".csv")) {
      return new Response(reportCsv(data), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reaktionen-${dayKey(Date.now())}-${days}d.csv"`, "Cache-Control": "no-store" } });
    }
    return page("Reaktionen", reportBody(data), user, "/admin/reaktionen");
  }
  if (path === "/admin/werbung" && can.ads(user)) return adsList(env, user, url);
  if ((path === "/admin/werbung/neu" || /^\/admin\/werbung\/[a-f0-9]+$/.test(path)) && can.ads(user)) return adEdit(req, env, user, url, path.split("/").pop()!);
  if (path === "/admin/quellen" && can.sources(user)) return sources(req, env, user, url);
  if (path === "/admin/seiten" && can.pages(user)) return pagesList(env, user, url);
  if (/^\/admin\/seiten\/(impressum|datenschutz|quellen)$/.test(path) && can.pages(user)) return pageEdit(req, env, user, url, path.split("/").pop() as PageSlug);
  if (path === "/admin/benutzer" && can.users(user)) return usersList(req, env, user, url);
  if (/^\/admin\/benutzer\/[a-f0-9]+$/.test(path) && can.users(user)) return userEdit(req, env, user, url, path.split("/").pop()!);
  return page("Kein Zugriff", `<div class="card"><h1>Kein Zugriff</h1><p class="muted">Diese Seite gibt es nicht oder Ihre Rolle hat keine Berechtigung.</p></div>`, user);
}

// ---------- setup & login ----------

async function setup(req: Request, env: Env, url: URL): Promise<Response> {
  const code = env.SETUP_CODE;
  if (!code) {
    return page("Einrichtung", `<div class="login"><div class="card"><h1>Einrichtung</h1>
      <p>Für den ersten Administrator wird ein Einrichtungscode benötigt.</p>
      <p class="muted">Cloudflare → Workers &amp; Pages → derbericht → Settings → Variables and Secrets → Add → Typ <b>Secret</b>, Name <code>SETUP_CODE</code>, Wert: ein langes, selbst gewähltes Kennwort. Danach diese Seite neu laden.</p></div></div>`);
  }
  if (req.method === "POST") {
    const f = await req.formData();
    const pw = String(f.get("password") ?? "");
    if (String(f.get("code") ?? "") !== code) return back("/admin", "err", "Der Einrichtungscode stimmt nicht.");
    const problem = passwordProblem(pw);
    if (problem) return back("/admin", "err", problem);
    const email = String(f.get("email") ?? "").trim();
    const name = String(f.get("name") ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return back("/admin", "err", "Bitte Name und gültige E-Mail angeben.");
    const id = await createUser(env, { email, name, role: "admin", password: pw });
    return redirect("/admin", await startSession(env, id));
  }
  return page("Einrichtung", `<div class="login"><div class="card"><h1 style="margin-bottom:6px">Ersten Administrator anlegen</h1>
    <p class="muted" style="margin-top:0">Einmalig. Danach ist diese Seite gesperrt.</p>${flash(url)}
    <form class="f" method="post">
      <label>Einrichtungscode<input type="password" name="code" required autocomplete="off"></label>
      <label>Name<input type="text" name="name" required></label>
      <label>E-Mail<input type="email" name="email" required autocomplete="username"></label>
      <label>Passwort <small>mindestens 10 Zeichen</small><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
      <button class="btn">Administrator anlegen</button></form></div></div>`);
}

const attempts = new Map<string, { n: number; t: number }>();

async function login(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.method === "POST") {
    const ip = req.headers.get("CF-Connecting-IP") ?? "local";
    const a = attempts.get(ip);
    if (a && a.n >= 8 && Date.now() - a.t < 15 * 60_000) return back("/admin/login", "err", "Zu viele Versuche. Bitte 15 Minuten warten.");
    const f = await req.formData();
    const user = await verifyLogin(env, String(f.get("email") ?? ""), String(f.get("password") ?? ""));
    if (!user) {
      attempts.set(ip, { n: (a && Date.now() - a.t < 15 * 60_000 ? a.n : 0) + 1, t: Date.now() });
      return back("/admin/login", "err", "E-Mail oder Passwort falsch.");
    }
    attempts.delete(ip);
    return redirect("/admin", await startSession(env, user.id));
  }
  return page("Anmelden", `<div class="login"><div class="card"><h1 style="margin-bottom:18px">Der Bericht<span style="color:var(--accent)">.</span> admin</h1>${flash(url)}
    <form class="f" method="post">
      <label>E-Mail<input type="email" name="email" required autocomplete="username"></label>
      <label>Passwort<input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn">Anmelden</button></form>
    <p class="muted" style="margin:16px 0 0;font-size:13px"><a href="/admin/zuruecksetzen">Passwort vergessen?</a></p></div></div>`);
}

/** Password reset with the SETUP_CODE secret (for administrators who are locked out). */
async function resetWithCode(req: Request, env: Env, url: URL): Promise<Response> {
  const code = env.SETUP_CODE;
  if (!code) {
    return page("Passwort zurücksetzen", `<div class="login"><div class="card"><h1>Passwort zurücksetzen</h1>
      <p>Bitte wenden Sie sich an einen Administrator. Er kann unter <b>Benutzer</b> ein neues Passwort setzen.</p>
      <p class="muted">Administratoren ohne Zugang: In Cloudflare unter Workers &amp; Pages → derbericht → Settings → Variables and Secrets ein Secret <code>SETUP_CODE</code> anlegen, dann diese Seite neu laden.</p>
      <p><a href="/admin/login">Zurück zur Anmeldung</a></p></div></div>`);
  }
  if (req.method === "POST") {
    const ip = req.headers.get("CF-Connecting-IP") ?? "local";
    const a = attempts.get(ip);
    if (a && a.n >= 8 && Date.now() - a.t < 15 * 60_000) return back("/admin/zuruecksetzen", "err", "Zu viele Versuche. Bitte 15 Minuten warten.");
    const f = await req.formData();
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const pw = String(f.get("password") ?? "");
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
    if (String(f.get("code") ?? "") !== code || !user) {
      attempts.set(ip, { n: (a && Date.now() - a.t < 15 * 60_000 ? a.n : 0) + 1, t: Date.now() });
      return back("/admin/zuruecksetzen", "err", "Einrichtungscode oder E-Mail stimmt nicht.");
    }
    const problem = passwordProblem(pw);
    if (problem) return back("/admin/zuruecksetzen", "err", problem);
    await setPassword(env, user.id, pw);
    await env.DB.prepare("UPDATE users SET active = 1 WHERE id = ?").bind(user.id).run();
    attempts.delete(ip);
    return redirect("/admin", await startSession(env, user.id));
  }
  return page("Passwort zurücksetzen", `<div class="login"><div class="card"><h1 style="margin-bottom:6px">Passwort zurücksetzen</h1>
    <p class="muted" style="margin-top:0">Mit dem Einrichtungscode (SETUP_CODE aus Cloudflare).</p>${flash(url)}
    <form class="f" method="post">
      <label>Einrichtungscode<input type="password" name="code" required autocomplete="off"></label>
      <label>E-Mail<input type="email" name="email" required autocomplete="username"></label>
      <label>Neues Passwort <small>mindestens 10 Zeichen</small><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
      <button class="btn">Passwort setzen und anmelden</button></form>
    <p style="margin:16px 0 0;font-size:13px"><a href="/admin/login">Zurück zur Anmeldung</a></p></div></div>`);
}

// ---------- dashboard ----------

async function dashboard(env: Env, user: User, url: URL): Promise<Response> {
  const day = Date.now() - 86400_000;
  const [a, f, p, r, ads] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) n FROM articles WHERE published > ?").bind(day).first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) n, SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) bad FROM feeds WHERE active = 1").first<{ n: number; bad: number }>(),
    env.DB.prepare("SELECT COUNT(*) n FROM posts WHERE status = 'published'").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) n FROM posts WHERE status = 'review'").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(impressions),0) imp, COALESCE(SUM(clicks),0) cl FROM ads WHERE active = 1").first<{ n: number; imp: number; cl: number }>(),
  ]);
  const mine = await env.DB.prepare("SELECT id, title, status, updated FROM posts WHERE author_id = ? ORDER BY updated DESC LIMIT 5").bind(user.id).all<Post>();
  const today = can.stats(user) ? await loadReport(env, 1) : null;
  const stat = (n: number | string, label: string) => `<div class="card stat"><b>${n}</b><span>${label}</span></div>`;
  return page("Übersicht", `<div class="top"><h1>Guten Tag, ${e(user.name.split(" ")[0])}</h1><a class="btn" href="/admin/beitraege/neu">+ Neuer Beitrag</a></div>${flash(url)}
    <div class="stats">
      ${stat(a?.n ?? 0, "Meldungen (24 Std.)")}
      ${stat(`${(f?.n ?? 0) - (f?.bad ?? 0)} / ${f?.n ?? 0}`, "Quellen ohne Fehler")}
      ${stat(p?.n ?? 0, "Eigene Beiträge online")}
      ${stat(r?.n ?? 0, "Warten auf Freigabe")}
      ${can.ads(user) ? stat(`${ads?.imp ?? 0} / ${ads?.cl ?? 0}`, `Werbung: Einblendungen / Klicks (${ads?.n ?? 0} aktiv)`) : ""}
      ${today ? `<a class="card stat" href="/admin/reaktionen?t=1" style="text-decoration:none"><b>${today.total}</b><span>Leser-Reaktionen heute →</span></a>` : ""}
    </div>
    ${today && today.stories.length ? `<div class="card" style="margin-bottom:22px"><h2 style="font-size:20px;margin-bottom:8px">Heute am meisten bewegt</h2><table>${today.stories.slice(0, 3).map((s) =>
      `<tr><td><a href="/story/${e(s.id)}" target="_blank">${e(s.title)}</a></td><td class="num" style="white-space:nowrap">${Object.entries(s.counts).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([em, n]) => `${em} ${n}`).join(" · ")}</td></tr>`).join("")}</table>
      <p style="margin:12px 0 0"><a href="/admin/reaktionen">Ganzen Bericht ansehen →</a></p></div>` : ""}
    <div class="card"><h2 style="font-size:20px;margin-bottom:8px">Meine letzten Beiträge</h2>
      ${mine.results.length ? `<table>${mine.results.map((m) => `<tr><td><a href="/admin/beitraege/${m.id}">${e(m.title)}</a></td><td><span class="pill ${m.status}">${STATUS_LABEL[m.status]}</span></td><td class="muted">${dt(m.updated)}</td></tr>`).join("")}</table>` : `<p class="muted">Noch keine Beiträge. <a href="/admin/beitraege/neu">Ersten Beitrag schreiben</a></p>`}
    </div>`, user, "/admin");
}

// ---------- posts ----------

async function postsList(env: Env, user: User, url: URL): Promise<Response> {
  const filter = user.role === "author" ? "WHERE p.author_id = ?" : "";
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.kind, p.status, p.updated, p.published_at, u.name AS author_name FROM posts p JOIN users u ON u.id = p.author_id ${filter} ORDER BY p.updated DESC LIMIT 200`,
  ).bind(...(filter ? [user.id] : [])).all<Post>();
  const rows = results.map((p) => `<tr><td><a href="/admin/beitraege/${p.id}"><strong>${e(p.title)}</strong></a><br><span class="muted">${p.kind === "kommentar" ? "Kommentar" : "Nachricht"} · ${e(p.author_name ?? "")}</span></td>
    <td><span class="pill ${p.status}">${STATUS_LABEL[p.status]}</span></td><td class="muted">${dt(p.updated)}</td>
    <td>${p.status === "published" ? `<a href="/artikel/${e(p.slug)}" target="_blank">ansehen ↗</a>` : ""}</td></tr>`).join("");
  return page("Beiträge", `<div class="top"><h1>Beiträge</h1><a class="btn" href="/admin/beitraege/neu">+ Neuer Beitrag</a></div>${flash(url)}
    <div class="card tablewrap">${rows ? `<table><thead><tr><th>Titel</th><th>Status</th><th>Geändert</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Noch keine Beiträge.</p>'}</div>`, user, "/admin/beitraege");
}

async function postEdit(req: Request, env: Env, user: User, url: URL, id: string): Promise<Response> {
  const isNew = id === "neu";
  let post: Post | null = isNew ? null : await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<Post>();
  if (!isNew && !post) return back("/admin/beitraege", "err", "Beitrag nicht gefunden.");
  if (post && !can.editPost(user, post.author_id, post.status)) return back("/admin/beitraege", "err", "Diesen Beitrag dürfen Sie nicht bearbeiten.");

  if (req.method === "POST") {
    const f = await req.formData();
    const action = String(f.get("action") ?? "save");
    if (action === "delete") {
      if (!post || !(can.publish(user) || (post.author_id === user.id && post.status !== "published"))) return back("/admin/beitraege", "err", "Keine Berechtigung.");
      await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(post.id).run();
      return back("/admin/beitraege", "ok", "Beitrag gelöscht.");
    }
    const title = String(f.get("title") ?? "").trim();
    if (!title) return back(url.pathname, "err", "Bitte einen Titel angeben.");
    const kind = f.get("kind") === "kommentar" ? "kommentar" : "news";
    const category = (CATEGORIES as string[]).includes(String(f.get("category"))) ? String(f.get("category")) : "politik";
    const country = ["at", "de", "ch", "dach"].includes(String(f.get("country"))) ? String(f.get("country")) : "at";
    const teaser = String(f.get("teaser") ?? "").trim().slice(0, 300) || null;
    const body = String(f.get("body") ?? "");
    let imageId = post?.image_id ?? null;
    const file = f.get("image");
    if (file && typeof file === "object" && (file as File).size > 0) {
      try { imageId = await saveMedia(env, file as File, user.id); } catch (err) { return back(url.pathname, "err", (err as Error).message); }
    }
    if (f.get("remove_image")) imageId = null;

    let status: Post["status"] = post?.status ?? "draft";
    if (action === "publish" && can.publish(user)) status = "published";
    else if (action === "unpublish" && can.publish(user)) status = "draft";
    else if (action === "review") status = "review";
    else if (action === "save" && user.role === "author") status = post?.status === "review" ? "review" : "draft";

    const now = Date.now();
    const publishedAt = status === "published" ? (post?.published_at ?? now) : post?.published_at ?? null;
    if (isNew) {
      const newId = randomId(8);
      const slug = `${slugify(title)}-${newId.slice(0, 5)}`;
      await env.DB.prepare(
        "INSERT INTO posts (id, slug, kind, title, teaser, body, category, country, author_id, status, image_id, created, updated, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(newId, slug, kind, title, teaser, body, category, country, user.id, status, imageId, now, now, publishedAt).run();
      return back(`/admin/beitraege/${newId}`, "ok", status === "published" ? "Veröffentlicht." : status === "review" ? "Zur Freigabe eingereicht." : "Entwurf gespeichert.");
    }
    await env.DB.prepare(
      "UPDATE posts SET kind=?, title=?, teaser=?, body=?, category=?, country=?, status=?, image_id=?, updated=?, published_at=? WHERE id=?",
    ).bind(kind, title, teaser, body, category, country, status, imageId, now, publishedAt, post!.id).run();
    return back(url.pathname, "ok", status === "published" ? "Gespeichert und online." : status === "review" ? "Zur Freigabe eingereicht." : "Gespeichert.");
  }

  const p = post;
  const opt = (v: string, label: string, cur?: string) => `<option value="${v}"${cur === v ? " selected" : ""}>${label}</option>`;
  const buttons = [
    `<button class="btn light" name="action" value="save">Speichern</button>`,
    user.role === "author" && p?.status !== "review" ? `<button class="btn" name="action" value="review">Zur Freigabe einreichen</button>` : "",
    can.publish(user) && p?.status !== "published" ? `<button class="btn" name="action" value="publish">Veröffentlichen</button>` : "",
    can.publish(user) && p?.status === "published" ? `<button class="btn light" name="action" value="unpublish">Offline nehmen</button>` : "",
    p ? `<button class="btn danger" name="action" value="delete" formnovalidate>Löschen</button>` : "",
  ].join("");
  return page(isNew ? "Neuer Beitrag" : "Beitrag bearbeiten", `<div class="top"><h1>${isNew ? "Neuer Beitrag" : "Beitrag bearbeiten"}</h1>
      ${p ? `<span class="pill ${p.status}">${STATUS_LABEL[p.status]}</span>` : ""}</div>${flash(url)}
    <form class="f card" method="post" enctype="multipart/form-data">
      <div class="row">
        <label>Art<select name="kind">${opt("news", "Nachricht", p?.kind)}${opt("kommentar", "Kommentar / Kolumne", p?.kind)}</select></label>
        <label>Rubrik<select name="category">${CATEGORIES.map((c) => opt(c, CATEGORY_NAME[c], p?.category ?? "politik")).join("")}</select></label>
        <label>Ausgabe<select name="country">${opt("at", "Österreich", p?.country ?? "at")}${opt("de", "Deutschland", p?.country)}${opt("ch", "Schweiz", p?.country)}${opt("dach", "Alle (DACH)", p?.country)}</select></label>
      </div>
      <label>Titel<input type="text" name="title" required maxlength="160" value="${e(p?.title ?? "")}"></label>
      <label>Vorspann <small>1–2 Sätze, erscheint unter dem Titel und in der Vorschau</small><input type="text" name="teaser" maxlength="300" value="${e(p?.teaser ?? "")}"></label>
      <label>Text <small>## Zwischentitel · **fett** · *kursiv* · [Link](https://…) · - Liste · &gt; Zitat · Leerzeile = neuer Absatz</small>
        <textarea name="body">${e(p?.body ?? "")}</textarea></label>
      <label>Titelbild <small>JPG, PNG oder WebP, max. 1,5 MB. Nur Bilder mit Nutzungsrecht verwenden.</small>
        ${p?.image_id ? `<img class="thumb" src="/media/${e(p.image_id)}" alt=""><span class="check"><input type="checkbox" name="remove_image" value="1"> Bild entfernen</span>` : ""}
        <input type="file" name="image" accept="${IMAGE_TYPES.join(",")}"></label>
      <div class="actions">${buttons}</div>
    </form>
    ${p?.body ? `<div class="card" style="margin-top:18px"><h2 style="font-size:18px">Vorschau</h2><div class="preview">${renderMarkdown(p.body)}</div></div>` : ""}`, user, "/admin/beitraege");
}

// ---------- ads ----------

async function adsList(env: Env, user: User, url: URL): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT * FROM ads ORDER BY created DESC").all<Ad>();
  const now = Date.now();
  const state = (a: Ad) => !a.active ? '<span class="pill off">Pausiert</span>' : a.ends && a.ends < now ? '<span class="pill off">Abgelaufen</span>' : a.starts && a.starts > now ? '<span class="pill review">Geplant</span>' : '<span class="pill ok">Aktiv</span>';
  const rows = results.map((a) => `<tr><td><a href="/admin/werbung/${a.id}"><strong>${e(a.name)}</strong></a><br><span class="muted">${e(SLOT_LABEL[a.slot])}</span></td>
    <td>${state(a)}</td><td class="muted">${dt(a.starts)} – ${dt(a.ends)}</td><td>${a.impressions}</td><td>${a.clicks}${a.impressions ? ` <span class="muted">(${((a.clicks / a.impressions) * 100).toFixed(1)} %)</span>` : ""}</td></tr>`).join("");
  return page("Werbung", `<div class="top"><h1>Werbung</h1><a class="btn" href="/admin/werbung/neu">+ Neues Banner</a></div>${flash(url)}
    <div class="card tablewrap">${rows ? `<table><thead><tr><th>Banner</th><th>Status</th><th>Zeitraum</th><th>Einblendungen</th><th>Klicks</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Noch keine Banner. Jedes Banner wird auf der Website automatisch als „Anzeige“ gekennzeichnet.</p>'}</div>`, user, "/admin/werbung");
}

async function adEdit(req: Request, env: Env, user: User, url: URL, id: string): Promise<Response> {
  const isNew = id === "neu";
  const ad = isNew ? null : await env.DB.prepare("SELECT * FROM ads WHERE id = ?").bind(id).first<Ad>();
  if (!isNew && !ad) return back("/admin/werbung", "err", "Banner nicht gefunden.");

  if (req.method === "POST") {
    const f = await req.formData();
    if (f.get("action") === "delete" && ad) {
      await env.DB.prepare("DELETE FROM ads WHERE id = ?").bind(ad.id).run();
      return back("/admin/werbung", "ok", "Banner gelöscht.");
    }
    const name = String(f.get("name") ?? "").trim();
    const slot = ["top", "side", "feed"].includes(String(f.get("slot"))) ? String(f.get("slot")) : "top";
    const kind = f.get("kind") === "html" ? "html" : "image";
    const link = String(f.get("link") ?? "").trim() || null;
    if (link && !/^https?:\/\//.test(link)) return back(url.pathname, "err", "Der Link muss mit https:// beginnen.");
    const html = String(f.get("html") ?? "").trim() || null;
    let imageId = ad?.image_id ?? null;
    const file = f.get("image");
    if (file && typeof file === "object" && (file as File).size > 0) {
      try { imageId = await saveMedia(env, file as File, user.id); } catch (err) { return back(url.pathname, "err", (err as Error).message); }
    }
    if (!name) return back(url.pathname, "err", "Bitte einen Namen angeben.");
    if (kind === "image" && !imageId) return back(url.pathname, "err", "Bitte ein Bannerbild hochladen.");
    if (kind === "html" && !html) return back(url.pathname, "err", "Bitte den Werbecode einfügen.");
    const active = f.get("active") ? 1 : 0;
    const starts = fromLocalInput(String(f.get("starts") ?? ""));
    const ends = fromLocalInput(String(f.get("ends") ?? ""));
    if (isNew) {
      const newId = randomId(8);
      await env.DB.prepare("INSERT INTO ads (id, name, slot, kind, image_id, link, html, active, starts, ends, created) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(newId, name, slot, kind, imageId, link, html, active, starts, ends, Date.now()).run();
      return back(`/admin/werbung/${newId}`, "ok", "Banner gespeichert.");
    }
    await env.DB.prepare("UPDATE ads SET name=?, slot=?, kind=?, image_id=?, link=?, html=?, active=?, starts=?, ends=? WHERE id=?")
      .bind(name, slot, kind, imageId, link, html, active, starts, ends, ad!.id).run();
    return back(url.pathname, "ok", "Banner gespeichert.");
  }

  const a = ad;
  const opt = (v: string, label: string, cur?: string) => `<option value="${v}"${cur === v ? " selected" : ""}>${label}</option>`;
  return page("Banner", `<div class="top"><h1>${isNew ? "Neues Banner" : "Banner bearbeiten"}</h1></div>${flash(url)}
    <form class="f card" method="post" enctype="multipart/form-data">
      <label>Name <small>intern, z. B. Kunde und Kampagne</small><input type="text" name="name" required value="${e(a?.name ?? "")}"></label>
      <div class="row">
        <label>Platzierung<select name="slot">${(["top", "side", "feed"] as const).map((s) => opt(s, SLOT_LABEL[s], a?.slot)).join("")}</select></label>
        <label>Art<select name="kind">${opt("image", "Bild mit Link", a?.kind)}${opt("html", "Werbecode (z. B. Google AdSense)", a?.kind)}</select></label>
      </div>
      <label>Bannerbild <small>JPG, PNG, WebP oder GIF, max. 1,5 MB</small>
        ${a?.image_id ? `<img class="thumb" src="/media/${e(a.image_id)}" alt="">` : ""}<input type="file" name="image" accept="${IMAGE_TYPES.join(",")}"></label>
      <label>Ziel-Link <small>wohin ein Klick führt (nur bei Bild)</small><input type="url" name="link" placeholder="https://" value="${e(a?.link ?? "")}"></label>
      <label>Werbecode <small>nur bei „Werbecode“. Wird ungeprüft eingebunden – nur Code von vertrauenswürdigen Werbenetzwerken einfügen.</small><textarea name="html" style="min-height:140px;font-family:ui-monospace,monospace;font-size:13px">${e(a?.html ?? "")}</textarea></label>
      <div class="row">
        <label>Start <small>leer = sofort</small><input type="datetime-local" name="starts" value="${toLocalInput(a?.starts ?? null)}"></label>
        <label>Ende <small>leer = unbegrenzt</small><input type="datetime-local" name="ends" value="${toLocalInput(a?.ends ?? null)}"></label>
      </div>
      <label class="check"><input type="checkbox" name="active" value="1"${!a || a.active ? " checked" : ""}> Aktiv</label>
      <div class="actions"><button class="btn">Speichern</button>${a ? `<button class="btn danger" name="action" value="delete" formnovalidate>Löschen</button>` : ""}</div>
      ${a ? `<p class="muted" style="margin:0">Bisher ${a.impressions} Einblendungen, ${a.clicks} Klicks.</p>` : ""}
    </form>`, user, "/admin/werbung");
}

// ---------- sources ----------

async function sources(req: Request, env: Env, user: User, url: URL): Promise<Response> {
  if (req.method === "POST") {
    const f = await req.formData();
    const action = String(f.get("action"));
    if (action === "run") {
      const r = await runIngest(env);
      return back("/admin/quellen", "ok", `Abruf fertig: ${r.items} Meldungen aus ${r.feeds} Quellen, ${r.errors} Fehler.`);
    }
    if (action === "toggle") {
      await env.DB.prepare("UPDATE feeds SET active = 1 - active WHERE id = ?").bind(String(f.get("id"))).run();
      return back("/admin/quellen", "ok", "Quelle geändert.");
    }
    if (action === "optout") {
      const domain = String(f.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return back("/admin/quellen", "err", "Bitte eine Domain wie beispiel.at angeben.");
      await env.DB.prepare("INSERT OR IGNORE INTO optouts (domain, added, note) VALUES (?,?,?)").bind(domain, Date.now(), String(f.get("note") ?? "").slice(0, 200)).run();
      return back("/admin/quellen", "ok", `${domain} wird nicht mehr angezeigt (wirksam ab dem nächsten Abruf).`);
    }
    if (action === "optout-remove") {
      await env.DB.prepare("DELETE FROM optouts WHERE domain = ?").bind(String(f.get("domain"))).run();
      return back("/admin/quellen", "ok", "Opt-out entfernt.");
    }
  }
  const feeds = await env.DB.prepare("SELECT id, publisher, country, url, active, last_fetch, last_error FROM feeds ORDER BY country, publisher")
    .all<{ id: string; publisher: string; country: string; url: string; active: number; last_fetch: number | null; last_error: string | null }>();
  const opt = await env.DB.prepare("SELECT domain, added, note FROM optouts ORDER BY added DESC").all<{ domain: string; added: number; note: string | null }>();
  return page("Quellen", `<div class="top"><h1>Quellen</h1><form method="post"><button class="btn" name="action" value="run">Jetzt abrufen</button></form></div>${flash(url)}
    <div class="card tablewrap" style="margin-bottom:18px"><table><thead><tr><th>Quelle</th><th>Land</th><th>Status</th><th>Letzter Abruf</th><th></th></tr></thead><tbody>
      ${feeds.results.map((s) => `<tr><td><strong>${e(s.publisher)}</strong><br><span class="muted" style="font-size:12px">${e(s.url)}</span></td><td>${s.country.toUpperCase()}</td>
        <td>${!s.active ? '<span class="pill off">Aus</span>' : s.last_error ? `<span class="pill review" title="${e(s.last_error)}">Fehler</span><br><span class="muted" style="font-size:12px">${e(s.last_error.slice(0, 60))}</span>` : '<span class="pill ok">OK</span>'}</td>
        <td class="muted">${dt(s.last_fetch)}</td>
        <td><form method="post"><input type="hidden" name="id" value="${e(s.id)}"><button class="btn small light" name="action" value="toggle">${s.active ? "Ausschalten" : "Einschalten"}</button></form></td></tr>`).join("")}
    </tbody></table></div>
    <div class="card"><h2 style="font-size:20px;margin-bottom:6px">Opt-out von Herausgebern</h2>
      <p class="muted" style="margin-top:0">Herausgeber, die nicht verlinkt werden möchten. Ihre Inhalte werden beim nächsten Abruf vollständig entfernt.</p>
      <form class="f" method="post" style="flex-direction:row;flex-wrap:wrap;align-items:flex-end;gap:12px">
        <label style="flex:1 1 220px">Domain<input type="text" name="domain" placeholder="beispiel.at" required></label>
        <label style="flex:2 1 260px">Notiz<input type="text" name="note" placeholder="z. B. E-Mail vom 17.10."></label>
        <button class="btn" name="action" value="optout">Hinzufügen</button></form>
      ${opt.results.length ? `<table style="margin-top:12px">${opt.results.map((o) => `<tr><td><strong>${e(o.domain)}</strong></td><td class="muted">${e(o.note ?? "")}</td><td class="muted">${dt(o.added)}</td><td><form method="post"><input type="hidden" name="domain" value="${e(o.domain)}"><button class="btn small light" name="action" value="optout-remove">Entfernen</button></form></td></tr>`).join("")}</table>` : ""}
    </div>`, user, "/admin/quellen");
}

// ---------- pages (Impressum, Datenschutz, Quellen) ----------

async function pagesList(env: Env, user: User, url: URL): Promise<Response> {
  const rows = await Promise.all(PAGE_SLUGS.map(async (slug) => {
    const p = await getPage(env, slug);
    const open = /\[[A-ZÄÖÜ][^\]]*\]/.test(p.body);
    return `<tr><td><a href="/admin/seiten/${slug}"><strong>${e(p.title)}</strong></a><br><span class="muted">${e(PAGE_DEFAULTS[slug].hint)}</span></td>
      <td>${open ? '<span class="pill review">Platzhalter offen</span>' : '<span class="pill ok">Ausgefüllt</span>'}</td>
      <td class="muted">${p.updated ? `${dt(p.updated)}${p.updated_by_name ? ` · ${e(p.updated_by_name)}` : ""}` : "Standardtext"}</td>
      <td><a href="/${slug}" target="_blank">ansehen ↗</a></td></tr>`;
  }));
  return page("Seiten", `<div class="top"><h1>Seiten</h1></div>${flash(url)}
    <div class="card tablewrap"><table><thead><tr><th>Seite</th><th>Status</th><th>Zuletzt geändert</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
    <p class="muted" style="margin-top:14px">Rechtstexte vor der Veröffentlichung bitte von einer Juristin oder einem Juristen prüfen lassen.</p>`, user, "/admin/seiten");
}

async function pageEdit(req: Request, env: Env, user: User, url: URL, slug: PageSlug): Promise<Response> {
  if (req.method === "POST") {
    const f = await req.formData();
    if (f.get("action") === "reset") {
      await env.DB.prepare("DELETE FROM pages WHERE slug = ?").bind(slug).run();
      return back(url.pathname, "ok", "Auf den Standardtext zurückgesetzt.");
    }
    const title = String(f.get("title") ?? "").trim() || PAGE_DEFAULTS[slug].title;
    const body = String(f.get("body") ?? "");
    if (!body.trim()) return back(url.pathname, "err", "Der Text darf nicht leer sein.");
    await savePage(env, slug, title.slice(0, 120), body, user.id);
    return back(url.pathname, "ok", "Gespeichert und online.");
  }
  const p = await getPage(env, slug);
  return page(p.title, `<div class="top"><h1>${e(p.title)}</h1><a class="btn light" href="/${slug}" target="_blank">Seite ansehen ↗</a></div>${flash(url)}
    <form class="f card" method="post">
      <p class="muted" style="margin:0">${e(PAGE_DEFAULTS[slug].hint)} Ersetzen Sie alle Angaben in [eckigen Klammern].</p>
      <label>Seitentitel<input type="text" name="title" maxlength="120" value="${e(p.title)}"></label>
      <label>Text <small>## Zwischentitel · **fett** · *kursiv* · [Link](https://…) · - Liste · Zeilenumbruch bleibt erhalten · Leerzeile = neuer Absatz</small>
        <textarea name="body" style="min-height:460px">${e(p.body)}</textarea></label>
      <div class="actions"><button class="btn">Speichern</button>${p.updated ? `<button class="btn danger" name="action" value="reset" formnovalidate>Auf Standardtext zurücksetzen</button>` : ""}</div>
      ${p.updated ? `<p class="muted" style="margin:0">Zuletzt geändert ${dt(p.updated)}${p.updated_by_name ? ` von ${e(p.updated_by_name)}` : ""}.</p>` : ""}
    </form>
    <div class="card" style="margin-top:18px"><h2 style="font-size:18px">Vorschau</h2><div class="preview">${renderMarkdown(p.body)}</div></div>`, user, "/admin/seiten");
}

// ---------- users ----------

async function usersList(req: Request, env: Env, user: User, url: URL): Promise<Response> {
  if (req.method === "POST") {
    const f = await req.formData();
    const email = String(f.get("email") ?? "").trim();
    const name = String(f.get("name") ?? "").trim();
    const role = String(f.get("role")) as Role;
    const pw = String(f.get("password") ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !ROLES.includes(role)) return back("/admin/benutzer", "err", "Bitte Name, E-Mail und Rolle angeben.");
    const problem = passwordProblem(pw);
    if (problem) return back("/admin/benutzer", "err", problem);
    try { await createUser(env, { email, name, role, password: pw }); } catch { return back("/admin/benutzer", "err", "Diese E-Mail ist schon vergeben."); }
    return back("/admin/benutzer", "ok", `${name} wurde angelegt. Bitte das Passwort persönlich übergeben.`);
  }
  const { results } = await env.DB.prepare("SELECT id, email, name, role, active, created, last_login FROM users ORDER BY created").all<User>();
  return page("Benutzer", `<div class="top"><h1>Benutzer</h1></div>${flash(url)}
    <div class="card tablewrap" style="margin-bottom:18px"><table><thead><tr><th>Name</th><th>Rolle</th><th>Status</th><th>Letzte Anmeldung</th></tr></thead><tbody>
      ${results.map((u) => `<tr><td><a href="/admin/benutzer/${u.id}"><strong>${e(u.name)}</strong></a><br><span class="muted">${e(u.email)}</span></td><td>${ROLE_LABEL[u.role]}</td><td>${u.active ? '<span class="pill ok">Aktiv</span>' : '<span class="pill off">Gesperrt</span>'}</td><td class="muted">${dt(u.last_login)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="card"><h2 style="font-size:20px;margin-bottom:12px">Benutzer hinzufügen</h2>
      <form class="f" method="post">
        <div class="row"><label>Name<input type="text" name="name" required></label><label>E-Mail<input type="email" name="email" required></label></div>
        <div class="row"><label>Rolle<select name="role">${ROLES.map((r) => `<option value="${r}"${r === "author" ? " selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select></label>
          <label>Startpasswort <small>mind. 10 Zeichen; kann später im Profil geändert werden</small><input type="text" name="password" required minlength="10" autocomplete="off"></label></div>
        <p class="muted" style="margin:0"><b>Autor:</b> schreibt eigene Beiträge und reicht sie zur Freigabe ein. <b>Redakteur:</b> veröffentlicht alle Beiträge, verwaltet Werbung und Quellen. <b>Administrator:</b> zusätzlich Benutzer und Rollen.</p>
        <div><button class="btn">Anlegen</button></div></form></div>`, user, "/admin/benutzer");
}

async function userEdit(req: Request, env: Env, user: User, url: URL, id: string): Promise<Response> {
  const u = await env.DB.prepare("SELECT id, email, name, role, active, created, last_login FROM users WHERE id = ?").bind(id).first<User>();
  if (!u) return back("/admin/benutzer", "err", "Benutzer nicht gefunden.");
  if (req.method === "POST") {
    const f = await req.formData();
    const role = String(f.get("role")) as Role;
    const active = f.get("active") ? 1 : 0;
    const name = String(f.get("name") ?? "").trim() || u.name;
    if (u.id === user.id && (role !== "admin" || !active)) return back(url.pathname, "err", "Sie können sich nicht selbst die Admin-Rolle entziehen oder sperren.");
    if (!ROLES.includes(role)) return back(url.pathname, "err", "Ungültige Rolle.");
    await env.DB.prepare("UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?").bind(name, role, active, u.id).run();
    if (!active) await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id).run();
    const pw = String(f.get("password") ?? "");
    if (pw) {
      const problem = passwordProblem(pw);
      if (problem) return back(url.pathname, "err", problem);
      await setPassword(env, u.id, pw);
    }
    return back("/admin/benutzer", "ok", `${name} gespeichert.`);
  }
  return page("Benutzer", `<div class="top"><h1>${e(u.name)}</h1></div>${flash(url)}
    <form class="f card" method="post">
      <p class="muted" style="margin:0">${e(u.email)} · angelegt ${dt(u.created)} · zuletzt angemeldet ${dt(u.last_login)}</p>
      <label>Name<input type="text" name="name" value="${e(u.name)}"></label>
      <label>Rolle<select name="role">${ROLES.map((r) => `<option value="${r}"${r === u.role ? " selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="active" value="1"${u.active ? " checked" : ""}> Zugang aktiv</label>
      <label>Neues Passwort setzen <small>leer lassen = unverändert</small><input type="text" name="password" minlength="10" autocomplete="off"></label>
      <div class="actions"><button class="btn">Speichern</button><a class="btn light" href="/admin/benutzer">Zurück</a></div></form>`, user, "/admin/benutzer");
}

// ---------- profile ----------

async function profile(req: Request, env: Env, user: User, url: URL): Promise<Response> {
  if (req.method === "POST") {
    const f = await req.formData();
    const ok = await verifyLogin(env, user.email, String(f.get("current") ?? ""));
    if (!ok) return back("/admin/profil", "err", "Das aktuelle Passwort stimmt nicht.");
    const pw = String(f.get("password") ?? "");
    const problem = passwordProblem(pw);
    if (problem) return back("/admin/profil", "err", problem);
    await setPassword(env, user.id, pw);
    return redirect("/admin/login?ok=" + encodeURIComponent("Passwort geändert. Bitte neu anmelden."));
  }
  return page("Mein Profil", `<div class="top"><h1>Mein Profil</h1></div>${flash(url)}
    <div class="card" style="margin-bottom:18px"><p style="margin:0"><strong>${e(user.name)}</strong> · ${e(user.email)} · ${ROLE_LABEL[user.role]}</p></div>
    <form class="f card" method="post"><h2 style="font-size:20px">Passwort ändern</h2>
      <label>Aktuelles Passwort<input type="password" name="current" required autocomplete="current-password"></label>
      <label>Neues Passwort <small>mind. 10 Zeichen</small><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
      <div><button class="btn">Ändern</button></div></form>`, user, "/admin/profil");
}
