// Local build dashboard for the owner: shows what each agent worktree is doing right now.
// Reads only this repo's git state and docs/build/README.md. Listens on 127.0.0.1 only.
//   node scripts/build-status.mjs   (then open http://127.0.0.1:4321)
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.BUILD_STATUS_PORT ?? 4321);

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  // trimEnd only: `git status --porcelain` lines can start with a space.
  return r.status === 0 ? r.stdout.trimEnd() : '';
}

function lines(text) {
  return text ? text.split(/\r?\n/).filter(Boolean) : [];
}

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function worktrees() {
  // Porcelain output is one block per worktree, separated by blank lines.
  return git(ROOT, ['worktree', 'list', '--porcelain'])
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const w = {};
      for (const line of lines(block)) {
        if (line.startsWith('worktree ')) w.path = line.slice(9);
        else if (line.startsWith('branch ')) w.branch = line.slice(7).replace('refs/heads/', '');
      }
      return w;
    })
    .filter((w) => w.path && w.branch && w.branch !== 'main');
}

function worktreeStatus(w) {
  const commits = lines(git(w.path, ['log', '--format=%h|%cr|%s', 'main..HEAD'])).map((l) => {
    const [hash, when, ...msg] = l.split('|');
    return { hash, when, msg: msg.join('|') };
  });
  const files = lines(git(w.path, ['status', '--porcelain'])).map((l) => {
    const file = l.slice(3);
    let mtime = 0;
    try {
      mtime = statSync(join(w.path, file)).mtimeMs;
    } catch {
      /* deleted or a directory entry */
    }
    return { state: l.slice(0, 2).trim() || '?', file, mtime };
  });
  files.sort((a, b) => b.mtime - a.mtime);
  const lastActivity = Math.max(0, ...files.map((f) => f.mtime));
  return {
    id: relative(join(ROOT, '.worktrees'), w.path),
    branch: w.branch,
    commits,
    files: files.map((f) => ({ ...f, ago: f.mtime ? ago(f.mtime) : '' })),
    lastActivity: lastActivity ? ago(lastActivity) : null,
    activeNow: lastActivity > 0 && Date.now() - lastActivity < 10 * 60 * 1000,
  };
}

function readme() {
  const text = readFileSync(join(ROOT, 'docs/build/README.md'), 'utf8');
  const briefs = [];
  for (const l of lines(text)) {
    const m = l.match(/^\| (P\d-\d\d[a-z]?) \| ([^|]+) \| ([a-z-]+) \| ([^|]*) \| ([^|]*) \|/);
    if (m)
      briefs.push({
        id: m[1],
        title: m[2].trim(),
        status: m[3],
        gate: m[4].trim(),
        branch: m[5].trim(),
      });
  }
  const calls = lines(text)
    .filter((l) => /^- \*\*Owner (decision|question)/.test(l))
    .map((l) => l.replace(/^- /, '').replace(/\*\*/g, ''));
  const next = (text.match(/^\*\*Next wave:\*\*(.*)$/m) ?? [])[1]?.trim() ?? '';
  return { briefs, calls, next };
}

function status() {
  const main = lines(git(ROOT, ['log', '--format=%h|%cr|%s', '-8', 'main'])).map((l) => {
    const [hash, when, ...msg] = l.split('|');
    return { hash, when, msg: msg.join('|') };
  });
  return {
    at: new Date().toISOString(),
    main,
    worktrees: worktrees().map(worktreeStatus),
    ...readme(),
  };
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Build status</title>
<style>
:root{--bg:#fafafa;--fg:#1a1a1a;--muted:#6b6b6b;--card:#fff;--line:#e3e3e3;--ok:#1f7a3d;--warn:#9a5b00;--live:#0a66c2}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ececec;--muted:#9a9a9a;--card:#1d1d1d;--line:#2e2e2e;--ok:#5cc983;--warn:#e0a54a;--live:#6aaeff}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:18px;margin:0 0 2px}h2{font-size:15px;margin:22px 0 8px}
.muted{color:var(--muted)}.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.card h3{margin:0 0 4px;font-size:15px}.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;border:1px solid var(--line)}
.live{color:var(--live);border-color:var(--live)}.idle{color:var(--muted)}
ul{margin:6px 0 0;padding-left:18px}li{margin:2px 0;word-break:break-word}code{font-size:12px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;font-size:13px;vertical-align:top}
.done{color:var(--ok)}.in-progress,.review{color:var(--live);font-weight:600}.todo{color:var(--muted)}
.call{border-left:3px solid var(--warn)}
</style></head><body><main>
<h1>AIAIA build: live status</h1><div class="muted" id="at">loading…</div>
<h2>Being built now</h2><div class="grid" id="wt"></div>
<h2>Needs your call</h2><div id="calls"></div>
<h2>Next</h2><div class="card" id="next"></div>
<h2>Recent on main</h2><div class="card"><ul id="main"></ul></div>
<h2>All briefs</h2><table><thead><tr><th>ID</th><th>Brief</th><th>Status</th><th>Branch / merge</th></tr></thead><tbody id="briefs"></tbody></table>
</main><script>
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const md=s=>esc(s).replace(/\`([^\`]+)\`/g,'<code>$1</code>').replace(/\\*\\*([^*]+)\\*\\*/g,'<b>$1</b>').replace(/\\[([^\\]]+)\\]\\([^)]+\\)/g,'$1');
async function tick(){
 try{
  const d=await (await fetch('/api/status')).json();
  document.getElementById('at').textContent='Updated '+new Date(d.at).toLocaleTimeString()+' · refreshes every 5 s';
  document.getElementById('wt').innerHTML=d.worktrees.length?d.worktrees.map(w=>\`<div class="card"><h3>\${esc(w.id)} <span class="pill \${w.activeNow?'live':'idle'}">\${w.activeNow?'writing now':'idle'}</span></h3>
<div class="muted">\${esc(w.branch)} · last file change \${esc(w.lastActivity??'none')}</div>
<b>Commits (\${w.commits.length})</b><ul>\${w.commits.map(c=>\`<li><code>\${esc(c.hash)}</code> \${esc(c.msg)} <span class="muted">\${esc(c.when)}</span></li>\`).join('')||'<li class="muted">none yet</li>'}</ul>
<b>Uncommitted (\${w.files.length})</b><ul>\${w.files.slice(0,12).map(f=>\`<li><code>\${esc(f.state)}</code> \${esc(f.file)} <span class="muted">\${esc(f.ago)}</span></li>\`).join('')||'<li class="muted">clean</li>'}</ul></div>\`).join(''):'<div class="card muted">No agent worktrees right now.</div>';
  document.getElementById('calls').innerHTML=d.calls.map(c=>\`<div class="card call" style="margin-bottom:8px">\${md(c)}</div>\`).join('')||'<div class="card muted">Nothing waiting on you.</div>';
  document.getElementById('next').innerHTML=md(d.next);
  document.getElementById('main').innerHTML=d.main.map(c=>\`<li><code>\${esc(c.hash)}</code> \${esc(c.msg)} <span class="muted">\${esc(c.when)}</span></li>\`).join('');
  document.getElementById('briefs').innerHTML=d.briefs.map(b=>\`<tr><td>\${esc(b.id)}</td><td>\${esc(b.title)}</td><td class="\${esc(b.status)}">\${esc(b.status)}</td><td>\${md(b.branch)}</td></tr>\`).join('');
 }catch(e){document.getElementById('at').textContent='Dashboard server not reachable: '+e.message}
}
tick();setInterval(tick,5000);
</script></body></html>`;

createServer((req, res) => {
  if (req.url === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(status()));
  } else {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`build status on http://127.0.0.1:${PORT}`));
