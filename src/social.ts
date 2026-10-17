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
  // D1 allows at most 100 bound parameters per query.
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(
      `SELECT story_id, emoji, n FROM reactions WHERE story_id IN (${part.map(() => "?").join(",")}) AND n > 0`,
    ).bind(...part).all<{ story_id: string; emoji: string; n: number }>();
    for (const r of results) (out[r.story_id] ??= {})[r.emoji] = r.n;
  }
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
export function shareBar(url: string, title: string, mini = false): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const wa = encodeURIComponent(`${title} ${url}`);
  const link = (cls: string, href: string, label: string, icon: string) =>
    `<a class="sh ${cls}" href="${href}" target="_blank" rel="noopener nofollow">${icon}<span>${label}</span></a>`;
  return `<div class="share${mini ? " mini" : ""}" data-url="${e(url)}" data-title="${e(title)}">
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
.react.compact{gap:6px}.react.compact button{height:36px;min-width:0;padding:0 11px}.react.compact button span{font-size:16px}
.share{display:flex;flex-wrap:wrap;gap:8px}
.sh{height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:500 14px var(--text);display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}
.sh:hover{border-color:var(--ink)}.sh[hidden]{display:none}
.sh.wa{background:#1f9d55;border-color:#1f9d55;color:#fff}.sh.wa:hover{background:#178246}
.sh.native{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.share.mini .sh.fb,.share.mini .sh.x,.share.mini .sh.tg{display:none}
.share.mini .sh{height:36px;font-size:13px;font-weight:600}.share.mini .sh.native{background:var(--card);color:var(--ink);border-color:var(--line)}
.share.mini:not(.nonative) .sh.copy{display:none}
.social{display:flex;flex-direction:column;gap:14px;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:4px 0 32px}
.social h2{margin:0;font:600 13px var(--text);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
/* preview card (bottom sheet, phones) */
.sheetwrap{position:fixed;inset:0;z-index:60;display:none}
.sheetwrap.open{display:block}
.sheetback{position:absolute;inset:0;background:rgba(17,17,19,.45);opacity:0;transition:opacity .2s}
.sheetwrap.show .sheetback{opacity:1}
.sheet{position:absolute;left:0;right:0;bottom:0;max-height:88vh;overflow-y:auto;overscroll-behavior:contain;background:var(--card);border-radius:24px 24px 0 0;padding:10px 18px calc(22px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:14px;transform:translateY(100%);transition:transform .25s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.18)}
.sheetwrap.show .sheet{transform:none}
.sbody{display:flex;flex-direction:column;gap:14px}
.sgrip{align-self:center;width:44px;height:5px;border-radius:999px;background:var(--line);border:0;padding:0;cursor:pointer;flex-shrink:0}
.sload{padding:40px 0;text-align:center;color:var(--muted)}
.shead{display:grid;grid-template-columns:92px minmax(0,1fr);gap:14px;align-items:start}
.sfig{position:relative;display:block;width:92px;height:92px;border-radius:14px;overflow:hidden;background:var(--surface)}
.sfig img,.sfig svg{width:100%;height:100%;object-fit:cover}.sfig .ki{left:5px;bottom:5px;font-size:9px;padding:1px 6px}
.shead .meta{font-size:12px;gap:6px}
.shead h2{margin:6px 0 0;font:700 21px/1.14 var(--display);letter-spacing:-.01em}
.steaser{margin:0;font-size:15px;color:var(--muted)}
.sothers{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:16px}
.sothers>span{padding:10px 14px;font-size:12px;font-weight:600;color:var(--muted);border-bottom:1px solid var(--line)}
.sothers a{display:flex;gap:10px;align-items:center;padding:11px 14px;border-bottom:1px solid var(--line);font-size:14px}
.sothers a>span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sothers a:last-child{border-bottom:0}
.sothers a.all{justify-content:space-between;font-weight:600}
.sheet .react button{flex:1 1 0;min-width:0;padding:0 4px}
.sheet .share .sh{flex:1}
.sgo{height:54px;border-radius:16px;background:var(--ink);color:var(--bg);font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 12px}
.snote{text-align:center;font-size:11px;color:var(--muted);margin-top:-6px}
body.sheet-open{overflow:hidden}
@media (max-width:700px){.react button{min-width:0;flex:1 1 0;padding:0 6px}.react.compact button{flex:0 0 auto}.sh.fb,.sh.x,.sh.tg{display:none}.share.nonative:not(.mini) .sh.fb,.share.nonative:not(.mini) .sh.x,.share.nonative:not(.mini) .sh.tg{display:inline-flex}.sh span{font-size:13px}}
`;

export const SOCIAL_JS = `<div class="sheetwrap" id="sheet" aria-hidden="true"><div class="sheetback"></div><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><button type="button" class="sgrip" aria-label="Schließen"></button><div class="sbody"></div></section></div>
<script>
(function(){
  var mobile=window.matchMedia('(max-width:700px), (pointer:coarse)').matches;
  function store(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}
  function initReact(root){root.querySelectorAll('.react').forEach(function(box){
    if(box.dataset.ready)return;box.dataset.ready='1';
    var id=box.dataset.story;
    function paint(counts,m){box.querySelectorAll('button').forEach(function(b){var em=b.dataset.emoji;if(counts){var n=counts[em]||0;b.querySelector('b').textContent=n||'';}b.setAttribute('aria-pressed',em===m?'true':'false');});}
    paint(null,store('r:'+id));
    box.addEventListener('click',function(ev){
      var b=ev.target.closest('button');if(!b)return;
      ev.preventDefault();ev.stopPropagation();
      var fd=new FormData();fd.append('story',id);fd.append('emoji',b.dataset.emoji);
      b.disabled=true;
      fetch('/reagieren',{method:'POST',body:fd}).then(function(r){return r.json()}).then(function(d){
        if(!d.counts)return;store('r:'+id,d.mine);
        document.querySelectorAll('.react[data-story="'+id+'"]').forEach(function(o){if(o!==box)o.dispatchEvent(new CustomEvent('sync',{detail:d}))});
        paint(d.counts,d.mine);
      }).catch(function(){}).finally(function(){b.disabled=false});
    });
    box.addEventListener('sync',function(ev){paint(ev.detail.counts,ev.detail.mine)});
  });}
  function initShare(root){root.querySelectorAll('.share').forEach(function(box){
    if(box.dataset.ready)return;box.dataset.ready='1';
    var url=box.dataset.url,title=box.dataset.title,nat=box.querySelector('.native');
    if(navigator.share){nat.hidden=false;nat.addEventListener('click',function(){navigator.share({title:title,url:url}).catch(function(){})});}
    else box.classList.add('nonative');
    var c=box.querySelector('.copy');
    c.addEventListener('click',function(){
      var s=c.querySelector('span'),o=s.textContent;
      var done=function(){s.textContent='Kopiert ✓';setTimeout(function(){s.textContent=o},1800)};
      if(navigator.clipboard)navigator.clipboard.writeText(url).then(done,function(){});
    });
  });}
  function sameTab(root){if(!mobile)return;root.querySelectorAll('a[target="_blank"]').forEach(function(a){if(!a.closest('.share'))a.removeAttribute('target');});}
  initReact(document);initShare(document);
  // Phones: publisher articles open in the same tab, so "back" returns to Der Bericht.
  sameTab(document);

  // Preview card: on phones a tap on a story opens a sheet from the bottom instead of leaving the page.
  var wrap=document.getElementById('sheet'),body=wrap.querySelector('.sbody'),openId=null;
  function show(id,art){
    openId=id;body.innerHTML='<div class="sload">Wird geladen …</div>';
    wrap.classList.add('open');wrap.setAttribute('aria-hidden','false');document.body.classList.add('sheet-open');
    requestAnimationFrame(function(){requestAnimationFrame(function(){wrap.classList.add('show')})});
    return fetch('/karte/'+encodeURIComponent(id)+(art?'?a='+encodeURIComponent(art):'')).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(h){
      if(openId!==id)return;body.innerHTML=h;initReact(body);initShare(body);
      wrap.querySelector('.sgrip').focus({preventScroll:true});
    });
  }
  function hide(){
    openId=null;wrap.classList.remove('show');wrap.setAttribute('aria-hidden','true');document.body.classList.remove('sheet-open');
    setTimeout(function(){if(!openId){wrap.classList.remove('open');body.innerHTML='';}},260);
  }
  function close(){if(history.state&&history.state.sheet)history.back();else hide();}
  if(mobile){
    document.addEventListener('click',function(ev){
      var a=ev.target.closest('a[data-sheet]');
      if(!a||ev.metaKey||ev.ctrlKey||ev.shiftKey)return;
      ev.preventDefault();var id=a.dataset.sheet,art=a.dataset.a||'',href=a.href;
      history.pushState({sheet:id,a:art},'');
      show(id,art).catch(function(){hide();location.href=href;});
    });
    window.addEventListener('popstate',function(ev){
      if(ev.state&&ev.state.sheet){if(openId!==ev.state.sheet)show(ev.state.sheet,ev.state.a).catch(hide);}else if(openId)hide();
    });
    // Coming back from the publisher (back button) with the sheet still in history.
    if(history.state&&history.state.sheet)show(history.state.sheet,history.state.a).catch(hide);
    wrap.querySelector('.sheetback').addEventListener('click',close);
    wrap.querySelector('.sgrip').addEventListener('click',close);
    document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&openId)close();});
    // Swipe down to close
    var sh=wrap.querySelector('.sheet'),y0=null;
    sh.addEventListener('touchstart',function(ev){y0=sh.scrollTop<=0?ev.touches[0].clientY:null},{passive:true});
    sh.addEventListener('touchmove',function(ev){if(y0===null)return;var dy=ev.touches[0].clientY-y0;if(dy>0){sh.style.transition='none';sh.style.transform='translateY('+dy+'px)';}},{passive:true});
    sh.addEventListener('touchend',function(ev){if(y0===null)return;var dy=ev.changedTouches[0].clientY-y0;sh.style.transition='';sh.style.transform='';y0=null;if(dy>90)close();});
  }
})();
</script>`;
