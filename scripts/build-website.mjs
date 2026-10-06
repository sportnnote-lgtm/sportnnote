#!/usr/bin/env node
// Build the static marketing site (sportnnote.in) into website/dist.
//
//   node scripts/build-website.mjs        (npm run website:build)
//
// Plain HTML + CSS, no framework: fast on phones and hostable anywhere
// (Cloudflare Pages, GitHub Pages, …). Privacy/Terms are generated from the
// SAME text the app shows (src/data/legal.ts), so the two can never drift.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'website');
const OUT = join(SITE, 'dist');
const cfg = JSON.parse(readFileSync(join(SITE, 'config.json'), 'utf8'));
// Node 24 runs .ts with type stripping; legal.ts has no imports.
const legal = await import(join(ROOT, 'src/data/legal.ts'));

const SPORTS = [
  ['🏏', 'Cricket'], ['⚽', 'Football'], ['🏀', 'Basketball'], ['🏐', 'Volleyball'], ['🤼', 'Kabaddi'],
  ['🎾', 'Tennis'], ['🏸', 'Badminton'], ['🏓', 'Table tennis'], ['⚫', 'Squash'], ['🟡', 'Padel'],
  ['🥒', 'Pickleball'], ['⛳', 'Golf'], ['♟️', 'Chess'], ['🎱', 'Carrom'],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The same small Markdown subset the app's <Markdown> renders. */
function md(src) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { close(); continue; }
    if ((m = line.match(/^## (.*)/))) { close(); out.push(out.length ? `<h3>${inline(m[1])}</h3>` : `<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^### (.*)/))) { close(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^- (.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^\d+\. (.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    close();
    out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('\n');
}

function page({ title, description, path, body }) {
  const url = `${cfg.siteUrl}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0E1116">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${cfg.siteUrl}/icon.png">
<link rel="icon" href="/favicon.png">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="/"><img src="/icon.png" alt="" width="30" height="30">SportnNote</a>
  <nav>
    <a class="hide-sm" href="/#features">Features</a>
    <a class="hide-sm" href="/#get">Get the app</a>
    <a class="btn btn-primary btn-sm" href="${cfg.appUrl}">Open app</a>
  </nav>
</div></header>
${body}
<footer><div class="wrap">
  <span>© ${new Date().getFullYear()} SportnNote · Made in ${esc(cfg.city)}</span>
  <nav>
    <a href="/privacy/">Privacy Policy</a>
    <a href="/terms/">Terms of Use</a>
    <a href="mailto:${cfg.contactEmail}">${esc(cfg.contactEmail)}</a>
  </nav>
</div></footer>
</body>
</html>
`;
}

const androidCta = cfg.androidApkUrl
  ? `<a class="btn btn-ghost" href="${esc(cfg.androidApkUrl)}">🤖 Android app</a>`
  : '';
const androidSteps = cfg.androidApkUrl
  ? `<ol><li>Open the <a href="${esc(cfg.androidApkUrl)}">Android download link</a>.</li><li>Download and allow “Install unknown apps” when asked.</li><li>Install and open SportnNote.</li></ol>
     <a class="btn btn-primary" href="${esc(cfg.androidApkUrl)}">Download for Android</a>`
  : `<ol><li>Open <strong>${esc(cfg.appUrl.replace('https://', ''))}</strong> in Chrome.</li><li>Tap ⋮ → <strong>Add to Home screen</strong>.</li><li>The Android app download is coming soon.</li></ol>
     <a class="btn btn-primary" href="${cfg.appUrl}">Open in Chrome</a>`;

const home = page({
  title: 'SportnNote — score every match, run any tournament',
  description: `Free live scoring, tournaments, stats and player profiles for ${SPORTS.length} sports — cricket, football, badminton, golf and more. Built in ${cfg.city}.`,
  path: '/',
  body: `
<section class="hero"><div class="wrap">
  <div>
    <p class="eyebrow">Free during our ${esc(cfg.city)} pilot</p>
    <h1>Score every match.<br><em>Run any tournament.</em></h1>
    <p class="lead">Live scoring, fixtures, standings and player stats for ${SPORTS.length} sports — in one app your whole team can follow. Built for open tournaments, clubs and schools.</p>
    <div class="cta">
      <a class="btn btn-primary" href="${cfg.appUrl}">Open SportnNote</a>
      ${androidCta}
    </div>
    <p class="note">Works on iPhone, Android and desktop. No credit card, no ads.</p>
  </div>
  <div class="phone" aria-hidden="true">
    <div class="score-card">
      <span class="live">LIVE</span>
      <div class="teams"><span>🏏 Banjara Hills XI</span><span class="s">142/4</span><span>Gachibowli Strikers</span><span class="s">—</span></div>
      <div class="meta">16.2 overs · Run rate 8.69 · Open T20 Cup</div>
    </div>
    <div class="score-card">
      <span class="live">LIVE</span>
      <div class="teams"><span>🏸 R. Varma</span><span class="s">21 · 18</span><span>S. Khan</span><span class="s">17 · 20</span></div>
      <div class="meta">Game 3 · Doubles league, Court 2</div>
    </div>
    <div class="score-card">
      <div class="teams"><span>⛳ Leader: A. Reddy</span><span class="s">−3</span></div>
      <div class="meta">Thru 14 · Sunday Stableford</div>
    </div>
  </div>
</div></section>

<section id="features"><div class="wrap">
  <h2>Everything a match day needs</h2>
  <p class="sub">From a Sunday friendly to a 64-team open — set it up in minutes and let the scores flow.</p>
  <div class="grid">
    <div class="card"><div class="ico">📲</div><h3>Live scoring</h3><p>Fast, sport-specific scoring — ball by ball, point by point, hole by hole. Keeps working offline and syncs when you’re back.</p></div>
    <div class="card"><div class="ico">🏆</div><h3>Any tournament format</h3><p>Leagues, knockouts, groups + knockouts, series, age groups and divisions — fixtures, brackets and standings update themselves.</p></div>
    <div class="card"><div class="ico">📊</div><h3>Stats that follow players</h3><p>Every match builds a career profile across sports, so talent gets noticed and tracked over time.</p></div>
    <div class="card"><div class="ico">👀</div><h3>Follow live</h3><p>Follow players, teams and tournaments — friends and family see the score as it happens.</p></div>
    <div class="card"><div class="ico">⛳</div><h3>Real golf</h3><p>Stroke play, Stableford and match play with handicaps, multi-round events and cuts, on a live leaderboard.</p></div>
    <div class="card"><div class="ico">🔒</div><h3>Private by default</h3><p>Phone numbers and emails stay hidden. Under-18s need a guardian’s consent, and messages about them go to the guardian.</p></div>
  </div>
</div></section>

<section class="band"><div class="wrap">
  <h2>${SPORTS.length} sports, played the international way</h2>
  <p class="sub">Each sport follows its governing body’s rules — sets, overs, raids, frames, holes.</p>
  <div class="sports">${SPORTS.map(([i, n]) => `<span class="chip">${i} ${esc(n)}</span>`).join('')}</div>
</div></section>

<section><div class="wrap">
  <h2>Running a tournament?</h2>
  <p class="sub">Organisers set it up once; scorers and players do the rest from their phones.</p>
  <div class="steps">
    <div class="card step"><h3>Create</h3><p>Pick the sport and format, set dates, venues and age groups.</p></div>
    <div class="card step"><h3>Invite</h3><p>Share one link — teams and players register themselves.</p></div>
    <div class="card step"><h3>Play</h3><p>Generate fixtures, score live, and watch standings and stats update.</p></div>
  </div>
</div></section>

<section id="get" class="band"><div class="wrap">
  <h2>Get the app</h2>
  <p class="sub">Free. Sign up with your email and mobile number.</p>
  <div class="install">
    <div class="card"><h3>📱 iPhone</h3>
      <ol><li>Open <strong>${esc(cfg.appUrl.replace('https://', ''))}</strong> in <strong>Safari</strong>.</li><li>Tap Share → <strong>Add to Home Screen</strong>.</li><li>Open SportnNote from your home screen.</li></ol>
      <a class="btn btn-primary" href="${cfg.appUrl}">Open in Safari</a>
    </div>
    <div class="card"><h3>🤖 Android</h3>
      ${androidSteps}
    </div>
  </div>
</div></section>

<section><div class="wrap">
  <h2>Questions or want SportnNote for your club?</h2>
  <p class="sub">We’re working closely with our first organisers in ${esc(cfg.city)}. Write to us at <a href="mailto:${cfg.contactEmail}">${esc(cfg.contactEmail)}</a>.</p>
</div></section>
`,
});

const legalPage = (title, path, content) => page({
  title: `${title} — SportnNote`,
  description: `SportnNote ${title}.`,
  path,
  body: `<main class="doc">${md(content)}</main>`,
});

const notFound = page({
  title: 'Page not found — SportnNote',
  description: 'Page not found.',
  path: '/404',
  body: `<main class="doc"><h2>Page not found</h2><p>Looking for the app? <a href="${cfg.appUrl}">Open SportnNote</a>.</p></main>`,
});

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'privacy'), { recursive: true });
mkdirSync(join(OUT, 'terms'), { recursive: true });
writeFileSync(join(OUT, 'index.html'), home);
writeFileSync(join(OUT, 'privacy/index.html'), legalPage('Privacy Policy', '/privacy/', legal.PRIVACY_POLICY));
writeFileSync(join(OUT, 'terms/index.html'), legalPage('Terms of Use', '/terms/', legal.TERMS));
writeFileSync(join(OUT, '404.html'), notFound);
copyFileSync(join(SITE, 'styles.css'), join(OUT, 'styles.css'));
copyFileSync(join(ROOT, 'assets/icon.png'), join(OUT, 'icon.png'));
copyFileSync(join(ROOT, 'assets/favicon.png'), join(OUT, 'favicon.png'));
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`);
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/privacy/', '/terms/'].map((p) => `  <url><loc>${cfg.siteUrl}${p}</loc></url>`).join('\n')}
</urlset>
`);
console.log(`✓ website built → ${OUT.replace(ROOT + '/', '')} (legal version ${legal.LEGAL_VERSION})`);
