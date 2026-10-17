// Sharing (links only, no third-party scripts) and anonymous emoji reactions.
// Privacy: we store only counts. To stop repeated votes we keep a salted hash of
// IP + browser + story for 2 days; the IP itself is never stored.

import { escapeHtml as e } from "./text.ts";
import type { Env } from "./types.ts";

export const EMOJIS = ["👍", "❤️", "😮", "😢", "😡", "🤔"] as const;
export const EMOJI_LABEL: Record<string, string> = {
  "👍": "Gefällt mir", "❤️": "Herz", "😮": "Überrascht", "😢": "Traurig", "😡": "Wütend", "🤔": "Nachdenklich",
};
export type Counts = Record<string, number>;

export async function getReactions(env: Env, ids: string[]): Promise<Record<string, Counts>> {
  const out: Record<string, Counts> = {};
  if (!ids.length) return out;
  const { results } = await env.DB.prepare(
    `SELECT story_id, emoji, n FROM reactions WHERE story_id IN (${ids.map(() => "?").join(",")})`,
  ).bind(...ids).all<{ story_id: string; emoji: string; n: number }>();
  for (const r of results) (out[r.story_id] ??= {})[r.emoji] = r.n;
  return out;
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** POST /reagieren  (story, emoji) → { counts, mine } */
export async function handleReaction(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== new URL(req.url).origin) return json({ error: "origin" }, 403);
  const form = await req.formData().catch(() => null);
  const story = String(form?.get("story") ?? "");
  const emoji = String(form?.get("emoji") ?? "");
  if (!/^[a-z0-9-]{4,64}$/i.test(story) || !(EMOJIS as readonly string[]).includes(emoji)) return json({ error: "input" }, 400);
  const exists = await env.DB.prepare("SELECT 1 AS x FROM clusters WHERE id = ?").bind(story).first();
  if (!exists) return json({ error: "story" }, 404);

  const ip = req.headers.get("CF-Connecting-IP") ?? "";
  const ua = req.headers.get("User-Agent") ?? "";
  const salt = env.SETUP_CODE ?? env.SITE_URL;
  const voter = await sha256(`${salt}|${ip}|${ua}|${story}`);
  const prev = await env.DB.prepare("SELECT emoji FROM reaction_votes WHERE id = ?").bind(voter).first<{ emoji: string }>();
  const stmts: D1PreparedStatement[] = [];
  if (prev?.emoji === emoji) {
    // Same emoji again = take it back.
    stmts.push(env.DB.prepare("DELETE FROM reaction_votes WHERE id = ?").bind(voter));
    stmts.push(env.DB.prepare("UPDATE reactions SET n = MAX(n - 1, 0) WHERE story_id = ? AND emoji = ?").bind(story, emoji));
  } else {
    if (prev) stmts.push(env.DB.prepare("UPDATE reactions SET n = MAX(n - 1, 0) WHERE story_id = ? AND emoji = ?").bind(story, prev.emoji));
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO reaction_votes (id, story_id, emoji, created) VALUES (?,?,?,?)").bind(voter, story, emoji, Date.now()));
    stmts.push(env.DB.prepare("INSERT INTO reactions (story_id, emoji, n) VALUES (?,?,1) ON CONFLICT(story_id, emoji) DO UPDATE SET n = n + 1").bind(story, emoji));
  }
  await env.DB.batch(stmts);
  const counts = (await getReactions(env, [story]))[story] ?? {};
  return json({ counts, mine: prev?.emoji === emoji ? null : emoji });
}

// ---------- HTML ----------

export function reactBar(storyId: string, counts: Counts = {}, compact = false): string {
  const btns = EMOJIS.map((em) => {
    const n = counts[em] ?? 0;
    return `<button type="button" data-emoji="${em}" aria-label="${EMOJI_LABEL[em]}${n ? `: ${n}` : ""}"><span aria-hidden="true">${em}</span><b>${n || ""}</b></button>`;
  }).join("");
  return `<div class="react${compact ? " compact" : ""}" data-story="${e(storyId)}" role="group" aria-label="Wie finden Sie diese Nachricht?">${btns}</div>`;
}

const SVG = {
  share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
  chat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.5-4A8 8 0 1 1 9 19.5z"/></svg>',
  link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3L3 11l7 3 3 7z"/></svg>',
};

/** Share links. Plain links, so no tracking scripts from social networks are loaded. */
export function shareBar(url: string, title: string): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const wa = encodeURIComponent(`${title} ${url}`);
  const link = (cls: string, href: string, label: string, icon: string) =>
    `<a class="sh ${cls}" href="${href}" target="_blank" rel="noopener nofollow">${icon}<span>${label}</span></a>`;
  return `<div class="share" data-url="${e(url)}" data-title="${e(title)}">
    <button type="button" class="sh native" hidden>${SVG.share}<span>Teilen</span></button>
    ${link("wa", `https://wa.me/?text=${wa}`, "WhatsApp", SVG.chat)}
    ${link("fb", `https://www.facebook.com/sharer/sharer.php?u=${u}`, "Facebook", SVG.share)}
    ${link("x", `https://x.com/intent/post?url=${u}&amp;text=${t}`, "X", SVG.share)}
    ${link("tg", `https://t.me/share/url?url=${u}&amp;text=${t}`, "Telegram", SVG.send)}
    <button type="button" class="sh copy">${SVG.link}<span>Link kopieren</span></button>
  </div>`;
}

export const SOCIAL_CSS = `
.react{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.react button{height:40px;min-width:52px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:500 14px var(--text);display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;transition:transform .12s,border-color .12s}
.react button span{font-size:18px;line-height:1}.react button b{font-weight:600;font-size:13px}
.react button:hover{border-color:var(--ink)}.react button:active{transform:scale(.94)}
.react button[aria-pressed="true"]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--card))}
.react.compact button{height:34px;min-width:44px;padding:0 9px}.react.compact button span{font-size:16px}
.share{display:flex;flex-wrap:wrap;gap:8px}
.sh{height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:500 14px var(--text);display:inline-flex;align-items:center;gap:7px;cursor:pointer}
.sh:hover{border-color:var(--ink)}
.sh.wa{background:#1f9d55;border-color:#1f9d55;color:#fff}.sh.wa:hover{background:#178246}
.sh.native{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.social{display:flex;flex-direction:column;gap:14px;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:4px 0 32px}
.social h2{margin:0;font:600 13px var(--text);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
@media (max-width:700px){.react button{min-width:0;flex:1 1 0;padding:0 6px}.react.compact button{flex:0 0 auto}.sh.fb,.sh.x,.sh.tg{display:none}.share.nonative .sh.fb,.share.nonative .sh.x,.share.nonative .sh.tg{display:inline-flex}.sh span{font-size:13px}}
`;

export const SOCIAL_JS = `<script>
(function(){
  function store(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}
  document.querySelectorAll('.react').forEach(function(box){
    var id=box.dataset.story,mine=store('r:'+id);
    function paint(counts,m){box.querySelectorAll('button').forEach(function(b){var em=b.dataset.emoji;if(counts){var n=counts[em]||0;b.querySelector('b').textContent=n||'';}b.setAttribute('aria-pressed',em===m?'true':'false');});}
    paint(null,mine);
    box.addEventListener('click',function(ev){
      var b=ev.target.closest('button');if(!b)return;
      var fd=new FormData();fd.append('story',id);fd.append('emoji',b.dataset.emoji);
      b.disabled=true;
      fetch('/reagieren',{method:'POST',body:fd}).then(function(r){return r.json()}).then(function(d){
        if(!d.counts)return;store('r:'+id,d.mine);
        document.querySelectorAll('.react[data-story="'+id+'"]').forEach(function(o){if(o!==box)o.dispatchEvent(new CustomEvent('sync',{detail:d}))});
        paint(d.counts,d.mine);
      }).catch(function(){}).finally(function(){b.disabled=false});
    });
    box.addEventListener('sync',function(ev){paint(ev.detail.counts,ev.detail.mine)});
  });
  document.querySelectorAll('.share').forEach(function(box){
    var url=box.dataset.url,title=box.dataset.title,nat=box.querySelector('.native');
    if(navigator.share){nat.hidden=false;nat.addEventListener('click',function(){navigator.share({title:title,url:url}).catch(function(){})});}
    else box.classList.add('nonative');
    var c=box.querySelector('.copy');
    c.addEventListener('click',function(){
      var done=function(){var s=c.querySelector('span'),o=s.textContent;s.textContent='Kopiert ✓';setTimeout(function(){s.textContent=o},1800)};
      if(navigator.clipboard)navigator.clipboard.writeText(url).then(done,function(){prompt('Link:',url)});else prompt('Link:',url);
    });
  });
})();
</script>`;
