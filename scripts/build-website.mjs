#!/usr/bin/env node
// Build the static marketing site (sportnnote.in) into website/dist.
//
//   node scripts/build-website.mjs        (npm run website:build)
//   GUIDES_INCLUDE_DRAFTS=1 node …        also build website/guides/_*.md (preview only)
//
// Plain HTML + CSS, no framework: fast on phones and hostable anywhere
// (Cloudflare Pages, GitHub Pages, …). Privacy/Terms are generated from the
// SAME text the app shows (src/data/legal.ts), so the two can never drift.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, readdirSync, existsSync, cpSync } from 'node:fs';
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
  ['🥒', 'Pickleball'], ['⛳', 'Golf'], ['♟️', 'Chess'], ['🎱', 'Carrom'], ['🏃', 'Athletics'], ['🏑', 'Hockey'], ['🤾', 'Handball'], ['🏊', 'Swimming'], ['🏋️', 'Weightlifting'], ['🎯', 'Shooting'], ['🏹', 'Archery'], ['🚣', 'Rowing'], ['🛶', 'Canoe sprint'],
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

function page({ title, description, path, body, ogType = 'website', head = '', noindex = false }) {
  const url = `${cfg.siteUrl}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">${noindex ? '\n<meta name="robots" content="noindex">' : ''}
<meta name="theme-color" content="#0E1116">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="SportnNote">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${cfg.siteUrl}/icon.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-v2.png">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="stylesheet" href="/styles.css">${head}
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="/"><img src="/icon.png" alt="" width="30" height="30">SportnNote</a>
  <nav>
    <a class="hide-sm" href="/#features">Features</a>
    <a${path.startsWith('/guides/') ? ' aria-current="page"' : ''} href="/guides/">Guides</a>
    <a class="hide-sm" href="/#get">Get the app</a>
    <a class="btn btn-primary btn-sm" href="${cfg.appUrl}">Open app</a>
  </nav>
</div></header>
${body}
<footer><div class="wrap">
  <span>© ${new Date().getFullYear()} SportnNote · Made in ${esc(cfg.city)}</span>
  <nav>
    <a href="/guides/">Guides</a>
    <a href="/privacy/">Privacy Policy</a>
    <a href="/terms/">Terms of Use</a>
    <a href="mailto:${cfg.contactEmail}">${esc(cfg.contactEmail)}</a>
  </nav>
</div></footer>
</body>
</html>
`;
}

// ─── Feature guides (website/guides/*.md → /guides/ and /guides/<slug>/) ────
// The content contract is website/guides/README.md. Files starting with "_"
// are drafts/test fixtures: skipped unless GUIDES_INCLUDE_DRAFTS=1.
const GUIDES_DIR = process.env.GUIDES_DIR || join(SITE, 'guides'); // override only for build tests
const INCLUDE_DRAFTS = process.env.GUIDES_INCLUDE_DRAFTS === '1';
const CATEGORIES = ['Getting started', 'Live scoring', 'Cricket scoring', 'Tournaments', 'Teams & players', 'Following & alerts', 'Streaming & sharing'];
const AUDIENCES = ['Organisers', 'Scorers', 'Captains', 'Players', 'Parents & fans'];
const FIELDS = ['title', 'description', 'category', 'audience', 'sports', 'order', 'updated'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const slugify = (t) => t.toLowerCase().replace(/[*`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
const catId = (c) => `cat-${slugify(c)}`;
const fmtDate = (d) => { const [y, m, day] = d.split('-').map(Number); return `${day} ${MONTHS[m - 1]} ${y}`; };
const list = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);
const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
/** JSON for a <script> block: no "</script>" break-outs. */
const ldJson = (o) => `\n<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
/** Markdown inline → plain text (for TOC, HowTo steps, heading ids). */
const plain = (t) => t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1');

function guideError(file, msg) {
  console.error(`✗ ${join(GUIDES_DIR, file).replace(ROOT + '/', '')}: ${msg}`);
  process.exit(1);
}

/** Tiny front-matter parser: `key: value` lines between two `---` lines. */
function parseFrontMatter(file, src) {
  const m = src.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  if (!m) guideError(file, 'missing front matter (the file must start with a "---" line, then the fields, then "---").');
  const data = {};
  m[1].split('\n').forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) guideError(file, `front matter line ${i + 2} is not "key: value": ${JSON.stringify(line)}`);
    let v = kv[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    data[kv[1]] = v;
  });
  return { data, body: m[2] };
}

function validateGuide(file, d) {
  const missing = FIELDS.filter((f) => !d[f]);
  if (missing.length) guideError(file, `missing required front-matter field(s): ${missing.join(', ')}.`);
  const unknown = Object.keys(d).filter((k) => !FIELDS.includes(k));
  if (unknown.length) guideError(file, `unknown front-matter field(s): ${unknown.join(', ')}. Allowed: ${FIELDS.join(', ')}.`);
  if (!CATEGORIES.includes(d.category)) guideError(file, `category "${d.category}" is not allowed. Use exactly one of: ${CATEGORIES.join(' | ')}.`);
  const badAud = list(d.audience).filter((a) => !AUDIENCES.includes(a));
  if (!list(d.audience).length || badAud.length) guideError(file, `audience "${badAud.join(', ') || d.audience}" is not allowed. Use a comma list from: ${AUDIENCES.join(', ')}.`);
  if (!/^-?\d+$/.test(d.order)) guideError(file, `order must be an integer, got "${d.order}".`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.updated) || Number.isNaN(Date.parse(d.updated))) guideError(file, `updated must be a date YYYY-MM-DD, got "${d.updated}".`);
  if (d.title.length > 60) console.warn(`! ${file}: title is ${d.title.length} characters (aim for ≤ 60).`);
  if (d.description.length > 160) console.warn(`! ${file}: description is ${d.description.length} characters (aim for ≤ 160).`);
}

/** Inline Markdown for guides: `code`, ![img](src), [link](url), **bold**. Everything else is escaped. */
function guideInline(text) {
  const codes = [];
  let t = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  t = esc(t);
  const safeUrl = (u) => /^(https?:\/\/|\/|#|mailto:)/i.test(u.replace(/&amp;/g, '&'));
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (all, alt, src) => (safeUrl(src) ? `<img src="${src}" alt="${alt}" loading="lazy" decoding="async">` : alt));
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, href) => {
    if (!safeUrl(href)) return label;
    const external = /^https?:\/\//i.test(href) && !href.startsWith(cfg.siteUrl);
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[i]);
}

/**
 * Block Markdown for guides — exactly the README subset. Returns the HTML,
 * the "On this page" sections (## headings) and the steps of the first
 * numbered list under a heading containing "Step" (for HowTo JSON-LD).
 */
function renderGuide(src) {
  const out = [];
  const toc = [];
  const ids = new Set();
  let howTo = null;
  let heading = '';
  let para = [];
  let lst = null; // { tag, items: [[lines]], steps }
  const uniqueId = (text) => { let id = slugify(plain(text)); let n = 2; while (ids.has(id)) id = `${slugify(plain(text))}-${n++}`; ids.add(id); return id; };
  const flushPara = () => { if (para.length) { out.push(`<p>${guideInline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => {
    if (!lst) return;
    const items = lst.items.map((l) => guideInline(l.join(' ')));
    if (lst.steps) {
      out.push(`<ol class="step-list">\n${items.map((h) => `<li><div>${h}</div></li>`).join('\n')}\n</ol>`);
      if (!howTo) howTo = lst.items.map((l) => plain(l.join(' ')));
    } else {
      out.push(`<${lst.tag}>\n${items.map((h) => `<li>${h}</li>`).join('\n')}\n</${lst.tag}>`);
    }
    lst = null;
  };
  const flush = () => { flushPara(); flushList(); };
  const CALLOUT = /^\*\*(Tip|Note|Important):\*\*\s*(.*)$/;
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^(##|###) +(.+)$/))) {
      flush();
      const level = m[1].length;
      const id = uniqueId(m[2]);
      heading = m[2];
      if (level === 2) toc.push({ id, text: plain(m[2]) });
      out.push(`<h${level} id="${id}">${guideInline(m[2])}</h${level}>`);
      continue;
    }
    if ((m = line.match(/^- +(.*)$/)) || (m = line.match(/^\d+\. +(.*)$/))) {
      flushPara();
      const tag = line.startsWith('-') ? 'ul' : 'ol';
      if (!lst || lst.tag !== tag) { flushList(); lst = { tag, items: [], steps: tag === 'ol' && /step/i.test(heading) }; }
      lst.items.push([m[1]]);
      continue;
    }
    if (lst && /^\s+\S/.test(raw)) { lst.items[lst.items.length - 1].push(line.trim()); continue; } // wrapped list item
    if ((m = line.match(/^>\s?(.*)$/))) {
      flush();
      const c = m[1].match(CALLOUT);
      if (c) out.push(`<aside class="callout callout-${c[1].toLowerCase()}"><p><strong class="callout-label">${c[1]}</strong> ${guideInline(c[2])}</p></aside>`);
      else out.push(`<blockquote><p>${guideInline(m[1])}</p></blockquote>`);
      continue;
    }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) { flush(); out.push(`<figure>${guideInline(line)}</figure>`); continue; }
    flushList();
    para.push(line.trim());
  }
  flush();
  return { html: out.join('\n'), toc, howTo };
}

function loadGuides() {
  if (!existsSync(GUIDES_DIR)) return [];
  const files = readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md' && (INCLUDE_DRAFTS || !f.startsWith('_'))).sort();
  return files.map((file) => {
    const slug = file.replace(/\.md$/, '');
    if (!/^_?[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) guideError(file, 'the file name must be lowercase-with-dashes, e.g. scoring-lock.md.');
    const { data, body } = parseFrontMatter(file, readFileSync(join(GUIDES_DIR, file), 'utf8'));
    validateGuide(file, data);
    return {
      slug: slug.replace(/^_/, ''), file, draft: slug.startsWith('_'), ...data,
      order: Number(data.order), audiences: list(data.audience),
      sportList: data.sports.trim().toLowerCase() === 'all' ? [] : list(data.sports),
      ...renderGuide(body),
    };
  }).sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.order - b.order || a.title.localeCompare(b.title));
}

const guides = loadGuides();
{
  const seen = new Map();
  for (const g of guides) { if (seen.has(g.slug)) guideError(g.file, `same URL /guides/${g.slug}/ as ${seen.get(g.slug)}.`); seen.set(g.slug, g.file); }
}
const sportsLabel = (g) => (g.sportList.length ? g.sportList.map(titleCase).join(', ') : 'All sports');
const pills = (g) => `<ul class="pills" aria-label="For">${g.audiences.map((a) => `<li class="pill">${esc(a)}</li>`).join('')}${g.sportList.length ? `<li class="pill pill-sport">${esc(sportsLabel(g))}</li>` : ''}</ul>`;
const guideCard = (g) => `<li class="guide-card" data-q="${esc(`${g.title} ${g.description}`.toLowerCase())}"><a href="/guides/${g.slug}/"><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p>${pills(g)}</a></li>`;
const crumbsLd = (items) => ldJson({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${cfg.siteUrl}${path}` })),
});

function guidesIndex() {
  const cats = CATEGORIES.filter((c) => guides.some((g) => g.category === c));
  const sections = cats.map((c) => `
  <section class="guide-cat" id="${catId(c)}" aria-labelledby="${catId(c)}-h">
    <h2 id="${catId(c)}-h">${esc(c)}</h2>
    <ul class="guide-grid">
      ${guides.filter((g) => g.category === c).map(guideCard).join('\n      ')}
    </ul>
  </section>`).join('');
  const body = `
<main class="guides">
<section class="guides-hero"><div class="wrap">
  <p class="eyebrow">Help centre</p>
  <h1>Feature guides</h1>
  <p class="lead">Short, step-by-step guides to scoring matches, running tournaments and following the action in SportnNote.</p>
  ${guides.length ? `<div class="guide-filter" hidden>
    <label for="guide-q">Find a guide</label>
    <input id="guide-q" type="search" placeholder="e.g. scoring, fixtures, alerts" autocomplete="off">
  </div>
  <nav class="cat-chips" aria-label="Categories">${cats.map((c) => `<a class="chip" href="#${catId(c)}">${esc(c)}</a>`).join('')}</nav>` : ''}
</div></section>
<div class="wrap guides-list">
  ${guides.length ? sections : '<p class="sub">Guides are on their way. Meanwhile, <a href="' + cfg.appUrl + '">open SportnNote</a> and explore, or write to us at <a href="mailto:' + cfg.contactEmail + '">' + esc(cfg.contactEmail) + '</a>.</p>'}
  <p class="sub guide-empty" hidden>No guides match that. Try another word, or write to us at <a href="mailto:${cfg.contactEmail}">${esc(cfg.contactEmail)}</a>.</p>
</div>
</main>
${guides.length ? `<script>
(function () {
  var box = document.querySelector('.guide-filter'), q = document.getElementById('guide-q');
  if (!box || !q) return;
  box.hidden = false;
  var cards = document.querySelectorAll('.guide-card'), cats = document.querySelectorAll('.guide-cat'), empty = document.querySelector('.guide-empty');
  q.addEventListener('input', function () {
    var words = q.value.toLowerCase().split(/\\s+/).filter(Boolean), any = false;
    cards.forEach(function (c) {
      var t = c.getAttribute('data-q'), ok = words.every(function (w) { return t.indexOf(w) !== -1; });
      c.hidden = !ok; if (ok) any = true;
    });
    cats.forEach(function (s) { s.hidden = !s.querySelector('.guide-card:not([hidden])'); });
    empty.hidden = any;
  });
})();
</script>` : ''}`;
  return page({
    title: 'Feature guides — SportnNote',
    description: 'Step-by-step guides to live scoring, running tournaments, teams, alerts and streaming in SportnNote.',
    path: '/guides/',
    body,
    head: crumbsLd([['Home', '/'], ['Guides', '/guides/']]),
  });
}

function guidePage(g) {
  const path = `/guides/${g.slug}/`;
  const inCat = guides.filter((x) => x.category === g.category);
  const i = inCat.indexOf(g);
  const prev = inCat[i - 1];
  const next = inCat[i + 1];
  const related = [...inCat.slice(i + 1), ...inCat.slice(0, i)].slice(0, 3);
  const tocLinks = g.toc.length ? `<ol>${g.toc.map((s) => `<li><a href="#${s.id}">${esc(s.text)}</a></li>`).join('')}</ol>` : '';
  let head = crumbsLd([['Home', '/'], ['Guides', '/guides/'], [g.title, path]]);
  if (g.howTo && g.howTo.length) {
    head += ldJson({
      '@context': 'https://schema.org', '@type': 'HowTo', name: g.title, description: g.description,
      url: `${cfg.siteUrl}${path}`, dateModified: g.updated,
      step: g.howTo.map((text, n) => ({ '@type': 'HowToStep', position: n + 1, text, url: `${cfg.siteUrl}${path}#step-${n + 1}` })),
    });
  }
  // Step cards get anchors so the HowTo step URLs resolve.
  let stepN = 0;
  const html = g.html.replace(/<ol class="step-list">([\s\S]*?)<\/ol>/, (all) => all.replace(/<li>/g, () => `<li id="step-${++stepN}">`));
  const body = `
<main class="article-wrap wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/guides/">Guides</a></li><li><a href="/guides/#${catId(g.category)}">${esc(g.category)}</a></li></ol></nav>
  <div class="article-grid">
    <article class="article">
      <header>
        <h1>${esc(g.title)}</h1>
        <p class="lead">${esc(g.description)}</p>
        <p class="article-meta">${esc(g.audiences.join(', '))} · ${esc(sportsLabel(g))} · Updated <time datetime="${g.updated}">${fmtDate(g.updated)}</time></p>
      </header>
      ${tocLinks ? `<details class="toc toc-mobile"><summary>On this page</summary>${tocLinks}</details>` : ''}
      <div class="prose">
${html}
      </div>
      <div class="article-cta card">
        <div><h2>Try it in SportnNote</h2><p>Free on iPhone, Android and desktop.</p></div>
        <a class="btn btn-primary" href="${cfg.appUrl}">Open SportnNote</a>
      </div>
      ${prev || next ? `<nav class="pager" aria-label="More in ${esc(g.category)}">
        ${prev ? `<a class="pager-prev" href="/guides/${prev.slug}/"><span>Previous</span>${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="pager-next" href="/guides/${next.slug}/"><span>Next</span>${esc(next.title)}</a>` : ''}
      </nav>` : ''}
      ${related.length ? `<section class="related" aria-labelledby="related-h">
        <h2 id="related-h">Related guides</h2>
        <ul class="guide-grid">${related.map(guideCard).join('')}</ul>
      </section>` : ''}
    </article>
    ${tocLinks ? `<aside class="toc toc-side" aria-label="On this page"><p class="toc-title">On this page</p>${tocLinks}</aside>` : ''}
  </div>
</main>`;
  return page({ title: `${g.title} — SportnNote guides`, description: g.description, path, body, ogType: 'article', head, noindex: g.draft });
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

<section id="learn"><div class="wrap learn">
  <div>
    <h2>Learn how it works</h2>
    <p class="sub">Short, step-by-step guides for organisers, scorers, captains and fans — from your first match to a full tournament.</p>
  </div>
  <a class="btn btn-ghost" href="/guides/">Browse the guides</a>
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
mkdirSync(join(OUT, 'guides'), { recursive: true });
writeFileSync(join(OUT, 'guides/index.html'), guidesIndex());
for (const g of guides) {
  mkdirSync(join(OUT, 'guides', g.slug), { recursive: true });
  writeFileSync(join(OUT, 'guides', g.slug, 'index.html'), guidePage(g));
}
if (existsSync(join(GUIDES_DIR, 'img'))) cpSync(join(GUIDES_DIR, 'img'), join(OUT, 'guides/img'), { recursive: true });
copyFileSync(join(SITE, 'styles.css'), join(OUT, 'styles.css'));
copyFileSync(join(ROOT, 'assets/icon.png'), join(OUT, 'icon.png'));
copyFileSync(join(ROOT, 'assets/favicon.png'), join(OUT, 'favicon.png'));
// Versioned copy (browsers cache favicons by URL) + /favicon.ico for browsers that ask for it.
copyFileSync(join(ROOT, 'assets/favicon.png'), join(OUT, 'favicon-v2.png'));
copyFileSync(join(ROOT, 'assets/favicon.png'), join(OUT, 'favicon.ico'));
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`);
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/privacy/', '/terms/', '/guides/'].map((p) => `  <url><loc>${cfg.siteUrl}${p}</loc></url>`).join('\n')}
${guides.filter((g) => !g.draft).map((g) => `  <url><loc>${cfg.siteUrl}/guides/${g.slug}/</loc><lastmod>${g.updated}</lastmod></url>`).join('\n')}
</urlset>
`);
console.log(`✓ website built → ${OUT.replace(ROOT + '/', '')} (legal version ${legal.LEGAL_VERSION}; ${guides.length} guide${guides.length === 1 ? '' : 's'}${INCLUDE_DRAFTS ? ', drafts included' : ''})`);
