// Builds the clickable POC in poc/boards (design-canvas boards) into a static site in poc/dist,
// for GitHub Pages. Phone screens fill a phone browser and sit in a centred column on a desktop;
// admin pages are full width. Run: node poc/build.mjs
//
// The sign-in is a demo gate only. Everything here is public: the pages, this script and the
// repo. It keeps casual visitors on the sign-in screen; it protects nothing. All people and data
// on these screens are placeholders.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'boards');
const out = join(here, 'dist');

// SHA-256 of "<10-digit phone>:<6-digit code>" for the preview sign-in. Set by the owner.
const ACCESS_HASH = 'd23fefd9927889ec985466632642292045d382f95680fe3982a038eb890427fe';
const KEY = 'aiaia-poc-ok';

const PUBLIC = new Set(['Main', 'Otp']);
const pageName = (n) => (n === 'Main' ? 'index' : n);

function must(html, from, to, label) {
  if (!html.includes(from)) throw new Error(`build: "${label}" not found`);
  return html.replace(from, to);
}

const boards = readdirSync(src)
  .filter((f) => f.endsWith('.dc.html'))
  .map((f) => [f.replace('.dc.html', ''), readFileSync(join(src, f), 'utf8')]);
const tabBar = boards.find(([n]) => n === 'TabBar')[1];
const titles = Object.fromEntries(boards.map(([n, h]) => [n, h.match(/<title>(.*?)<\/title>/)[1]]));

function tabBarFor(active) {
  let nav = tabBar.slice(tabBar.indexOf('<nav'), tabBar.indexOf('</nav>') + 6);
  for (const k of ['home', 'events', 'directory', 'profile', 'more']) {
    nav = nav.replace(`{{c.${k}}}`, k === active ? '#000000' : '#6B6B6B');
  }
  return nav
    .replace('width: 390px; height: 84px;', 'width: 100%; flex: none;')
    .replace('padding: 4px 4px 24px', 'padding: 4px 4px max(8px, env(safe-area-inset-bottom))');
}

const tabCss = tabBar.match(/\.tab\{[^}]*\}\n\.tab svg\{[^}]*\}/)[0];

const SHELL_CSS = `
html,body{margin:0;background:#D6D6D6}
.poc-phone main>*{flex-shrink:0}
.poc-pill{position:fixed;right:12px;bottom:96px;z-index:10;display:flex;align-items:center;min-height:36px;padding:0 14px;border-radius:9999px;background:#1B1B1B;color:#FFFFFF !important;font:600 13px Figtree,system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 8px #00000040}
.poc-admin .poc-pill{bottom:16px}
@media (min-width:480px){.poc-phone>div:first-child{box-shadow:0 0 0 1px #00000014,0 8px 32px #0000001F}}
@media (max-width:760px){
  .poc-admin aside{max-width:none !important;flex-basis:100% !important;border-right:0 !important;border-bottom:1px solid #EBEBEB;padding:12px !important}
  .poc-admin aside,.poc-admin main{min-width:0;width:100%}
  .poc-admin aside nav{flex-direction:row !important;overflow-x:auto;padding-bottom:4px;max-width:100%}
  .poc-admin aside .nav{white-space:nowrap;flex:none}
  .poc-admin aside>div:last-child{display:none !important}
  .poc-admin main{padding:16px !important}
}`;

const GATE = `<script>
try { if (localStorage.getItem('${KEY}') !== '1') location.replace('index.html'); } catch (e) {}
</script>`;

const SIGN_IN_JS = `<script>
(function () {
  var phone = document.getElementById('phone');
  var go = document.querySelector('a.btn');
  var err = document.createElement('span');
  err.setAttribute('role', 'alert');
  err.style.cssText = 'font-size:14px;color:#C0262C;min-height:20px';
  phone.parentNode.parentNode.appendChild(err);
  document.querySelectorAll('[role=radio]').forEach(function (r) {
    r.addEventListener('click', function (e) {
      e.preventDefault();
      document.querySelectorAll('[role=radio]').forEach(function (o) {
        var on = o === r;
        o.setAttribute('aria-checked', on);
        o.style.background = on ? '#FFFFFF' : 'transparent';
        o.style.color = on ? '#000000' : '#474747';
        o.style.fontWeight = on ? '600' : '500';
        o.style.boxShadow = on ? '0 1px 2px #00000026' : 'none';
      });
      try { sessionStorage.setItem('aiaia-poc-via', r.textContent); } catch (x) {}
    });
  });
  go.addEventListener('click', function (e) {
    e.preventDefault();
    var digits = phone.value.replace(/\\D/g, '').slice(-10);
    if (digits.length !== 10) { err.textContent = 'Enter a 10-digit mobile number.'; return; }
    try { sessionStorage.setItem('aiaia-poc-phone', digits); } catch (x) {}
    location.href = 'Otp.html';
  });
})();
</script>`;

const OTP_JS = `<script>
(function () {
  var phone = '', via = 'WhatsApp';
  try { phone = sessionStorage.getItem('aiaia-poc-phone') || ''; via = sessionStorage.getItem('aiaia-poc-via') || via; } catch (x) {}
  if (!phone) { location.replace('index.html'); return; }
  var p = document.querySelector('h1 + p');
  p.textContent = 'We sent a 6-digit code to +91 ' + phone.slice(0, 5) + ' ' + phone.slice(5) + ' on ' + via + '.';
  var code = document.getElementById('code');
  var err = document.getElementById('code-err');
  var go = document.querySelector('a.btn');
  async function check(e) {
    if (e) e.preventDefault();
    var c = code.value.replace(/\\D/g, '');
    if (c.length !== 6) { err.textContent = 'Enter the 6-digit code.'; return; }
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(phone + ':' + c));
    var hex = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    if (hex !== '${ACCESS_HASH}') { err.textContent = 'That number and code do not match. Check with the person who shared this preview.'; return; }
    try { localStorage.setItem('${KEY}', '1'); } catch (x) {}
    location.href = window.matchMedia('(min-width: 900px)').matches ? 'AdminDashboard.html' : 'Home.html';
  }
  go.addEventListener('click', check);
  code.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(e); });
  code.focus();
})();
</script>`;

const ADMIN_SWITCH = `<a class="nav" href="Home.html"><svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M11 18h2"></path></svg>Member app</a>
    </nav>`;

function page(name, html) {
  const admin = name.startsWith('Admin');
  const head = html.slice(html.indexOf('<helmet>') + 8, html.indexOf('</helmet>'));
  let body = html.slice(html.indexOf('</helmet>') + 9, html.indexOf('</x-dc>')).trim();

  body = body.replace(/<dc-import name="TabBar" active="(\w+)"[^>]*><\/dc-import>/g, (_, a) => tabBarFor(a));
  body = body.replace(/href="(\w+)\.dc\.html"/g, (_, n) => `href="${pageName(n)}.html"`);
  if (admin) {
    body = must(body, 'width: 100%; min-height: 860px;', 'width: 100%; min-height: 100vh;', 'admin frame');
    body = must(body, '</a>\n    </nav>', `</a>\n      ${ADMIN_SWITCH}`, 'admin nav end');
  } else {
    body = must(body, 'width: 390px; height: 844px;', 'width: 100%; max-width: 430px; height: 100dvh; margin: 0 auto;', 'phone frame');
  }
  if (name === 'Otp') {
    body = body.replace(
      /<div role="group" aria-label="6-digit code"[\s\S]*?<\/div>/,
      `<div style="display: flex; flex-direction: column; gap: 6px"><label for="code" style="font-size: 16px; font-weight: 500">6-digit code</label><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" style="min-height: 56px; border: 1px solid #848484; border-radius: 10px; background: #FFFFFF; padding: 0 16px; font: 600 24px Figtree, system-ui, sans-serif; letter-spacing: 0.4em; box-sizing: border-box; width: 100%"><span id="code-err" role="alert" style="font-size: 14px; color: #C0262C; min-height: 20px"></span></div>`,
    );
    if (!body.includes('id="code"')) throw new Error('build: OTP digit group not found');
  }

  const scripts = name === 'Main' ? SIGN_IN_JS : name === 'Otp' ? OTP_JS : '';
  const pill = PUBLIC.has(name) ? '' : '<a class="poc-pill" href="screens.html">All screens</a>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${titles[name]} · AIAIA Youth preview</title>
${PUBLIC.has(name) ? '' : GATE}
${head}
<style>${tabCss}${SHELL_CSS}</style>
</head>
<body class="${admin ? 'poc-admin' : 'poc-phone'}">
${body}
${pill}
${scripts}
</body>
</html>
`;
}

const GROUPS = [
  ['Sign in', ['Main', 'Otp', 'ProfileSetup', 'WaitingRoom']],
  ['Member app', ['Home', 'Notifications', 'Events', 'EventDetail', 'MyPass', 'Scanner', 'Directory', 'Profile', 'Family', 'MemberId', 'Settings', 'Help', 'More']],
  ['Phase 2', ['Payments', 'Certificates', 'Gallery', 'ReviewArchive']],
  ['Phase 3', ['Jobs', 'Quizzes', 'Polls', 'Mentorship', 'Documents']],
  ['Admin console (web)', ['AdminDashboard', 'AdminApprovals', 'AdminMembers', 'AdminAnnouncements', 'AdminEvents', 'AdminImport', 'AdminRoles', 'AdminAudit']],
];

function screensPage() {
  const sections = GROUPS.map(
    ([g, names]) =>
      `<h2>${g}</h2><div class="list">${names.map((n) => `<a href="${pageName(n)}.html">${titles[n]}</a>`).join('')}</div>`,
  ).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>All screens · AIAIA Youth preview</title>
${GATE}
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#F1F1F1;font-family:Figtree,system-ui,sans-serif;color:#000}
main{max-width:720px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#474747;margin:24px 0 8px}
p{color:#474747;margin:0}
.list{background:#fff;border:1px solid #EBEBEB;border-radius:12px;overflow:hidden}
.list a{display:flex;align-items:center;min-height:48px;padding:0 16px;border-bottom:1px solid #EBEBEB;color:#000;text-decoration:none;font-weight:500}
.list a:last-child{border-bottom:0}.list a:hover{background:#FAFAFA}
button{margin-top:28px;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #848484;background:#fff;font:600 15px Figtree,system-ui,sans-serif;cursor:pointer}
</style>
</head>
<body>
<main>
<h1>AIAIA Youth: preview</h1>
<p>A clickable proof of concept. Every person, number and amount is a placeholder, and nothing is saved. The member app is laid out for phones; the admin console is for a computer.</p>
${sections}
<button type="button" onclick="try{localStorage.removeItem('${KEY}')}catch(e){};location.href='index.html'">Sign out</button>
</main>
</body>
</html>
`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let count = 0;
for (const [name, html] of boards) {
  if (name === 'TabBar') continue;
  writeFileSync(join(out, `${pageName(name)}.html`), page(name, html));
  count++;
}
writeFileSync(join(out, 'screens.html'), screensPage());
writeFileSync(join(out, '.nojekyll'), '');
console.log(`poc: built ${count} screens + screens.html into poc/dist`);
