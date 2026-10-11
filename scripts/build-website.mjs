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
// SD-151: the .com switch is a config change — SITE_URL / APP_URL / SUPPORT_EMAIL in the
// build environment override config.json (docs/international/domain-move-com.md).
for (const [key, env] of [['siteUrl', 'SITE_URL'], ['appUrl', 'APP_URL'], ['contactEmail', 'SUPPORT_EMAIL']]) {
  const v = (process.env[env] ?? '').trim().replace(/\/+$/, '');
  if (v) cfg[key] = v;
}
// Node 24 runs .ts with type stripping; legal.ts has no imports.
const legal = await import(join(ROOT, 'src/data/legal.ts'));

const SPORTS = [
  ['🏏', 'Cricket'], ['⚽', 'Football'], ['🏀', 'Basketball'], ['🏐', 'Volleyball'], ['🤼', 'Kabaddi'],
  ['🎾', 'Tennis'], ['🏸', 'Badminton'], ['🏓', 'Table tennis'], ['⚫', 'Squash'], ['🟡', 'Padel'],
  ['🥒', 'Pickleball'], ['⛳', 'Golf'], ['♟️', 'Chess'], ['🎱', 'Carrom'], ['🏃', 'Athletics'], ['🏑', 'Hockey'], ['🤾', 'Handball'], ['🏒', 'Ice hockey'], ['🥅', 'Netball'], ['🏊', 'Swimming'], ['🏋️', 'Weightlifting'], ['🎯', 'Shooting'], ['🏹', 'Archery'], ['🚣', 'Rowing'], ['🛶', 'Canoe sprint'], ['🚴', 'Cycling'], ['🏉', 'Rugby'], ['⚾', 'Baseball & softball'], ['🏈', 'American football'],
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
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  <a class="brand" href="/"><img src="/icon.png" alt="" width="30" height="30">SportnNote</a>
  <nav>
    <a class="hide-sm" href="/#features">Features</a>
    <a${path.startsWith('/guides/') ? ' aria-current="page"' : ''} href="/guides/">Guides</a>
    <a class="hide-sm" href="/#get">Get the app</a>
    <a class="btn btn-primary btn-sm" href="${cfg.appUrl}">Open app</a>
  </nav>
</div></header>
${/<main\b/.test(body) ? body.replace(/<main(?![^>]*\bid=)/, '<main id="main"') : `<main id="main">${body}</main>`}
<footer><div class="wrap">
  <span>© ${new Date().getFullYear()} SportnNote · Built in ${esc(cfg.homeCountry)}, for sport everywhere</span>
  <nav>
    <a href="/guides/">Guides</a>
    <a href="/support/">Support</a>
    <a href="/privacy/">Privacy Policy</a>
    <a href="/terms/">Terms of Use</a>
    <a href="/delete-account/">Delete account</a>
    <a href="/accessibility/">Accessibility</a>
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
        <div><h2>Try it in SportnNote</h2><p>Works on iPhone, Android and desktop. ${esc(cfg.pricingLine)}</p></div>
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
  description: `Live scoring, tournaments, stats and player profiles for ${SPORTS.length} sports — cricket, football, badminton, golf and more. For schools, clubs and open tournaments anywhere.`,
  path: '/',
  body: `
<section class="hero"><div class="wrap">
  <div>
    <p class="eyebrow">Free while we’re new</p>
    <h1>Score every match.<br><em>Run any tournament.</em></h1>
    <p class="lead">Live scoring, fixtures, standings and player stats for ${SPORTS.length} sports — in one app your whole team can follow. Built for open tournaments, clubs and schools.</p>
    <div class="cta">
      <a class="btn btn-primary" href="${cfg.appUrl}">Open SportnNote</a>
      ${androidCta}
    </div>
    <p class="note">Works on iPhone, Android and desktop, in any country. ${esc(cfg.pricingLine)} No ads.</p>
  </div>
  <div class="phone" aria-hidden="true">
    <div class="score-card">
      <span class="live">LIVE</span>
      <div class="teams"><span>🏏 Riverside XI</span><span class="s">142/4</span><span>Northfield Strikers</span><span class="s">—</span></div>
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
  <p class="sub">${esc(cfg.pricingLine)} Sign up with your email or mobile number — from any country.</p>
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
  <p class="sub">We work closely with the organisers, schools and clubs who use SportnNote. Write to us at <a href="mailto:${cfg.contactEmail}">${esc(cfg.contactEmail)}</a> — ${esc(cfg.supportHours)}. <a href="/support/">More ways to get help</a>.</p>
</div></section>
`,
});

const legalPage = (title, path, content) => page({
  title: `${title} — SportnNote`,
  description: `SportnNote ${title}.`,
  path,
  body: `<main class="doc">${md(content)}</main>`,
});

// SD-151: public support / contact page (email + hours with the time zone).
const supportPage = page({
  title: 'Support — SportnNote',
  description: 'Get help with SportnNote: guides, in-app help, and how to reach the team by email, with our support hours.',
  path: '/support/',
  body: `<main class="doc">
<h2>Support</h2>
<p>Stuck on something? Most answers are one tap away.</p>
<h3>Help yourself first</h3>
<ul>
  <li><strong>In the app:</strong> Settings → <strong>Help &amp; support</strong>. Type your question for an instant answer.</li>
  <li><strong>Guides:</strong> step-by-step pages for organisers, scorers and players at <a href="/guides/">Guides</a>.</li>
</ul>
<h3>Contact us</h3>
<p>Email <a href="mailto:${cfg.contactEmail}">${esc(cfg.contactEmail)}</a>, or use <strong>Contact support</strong> in the app’s help.</p>
<ul>
  <li><strong>Support hours:</strong> ${esc(cfg.supportHours)}.</li>
  <li>${esc(cfg.supportReply)}</li>
  <li>Tell us the match or tournament name, the sport, and what you tapped. A screenshot helps.</li>
</ul>
<p>SportnNote works in any country. Write to us in English, wherever you are.</p>
<h3>Privacy and your account</h3>
<ul>
  <li>Questions about your data: see the <a href="/privacy/">Privacy Policy</a>, or email us.</li>
  <li>To delete your account: <a href="/delete-account/">Delete your account</a>.</li>
</ul>
<h3>Price</h3>
<p>${esc(cfg.pricingLine)}</p>
</main>`,
});

// SD-151 (Google Play requirement): how to delete an account, with or without the app.
const deleteAccountPage = page({
  title: 'Delete your account — SportnNote',
  description: 'How to delete your SportnNote account and data — in the app or by email — and what is kept afterwards.',
  path: '/delete-account/',
  body: `<main class="doc">
<h2>Delete your SportnNote account</h2>
<p>You can delete your account and personal data at any time. This page explains how, and what happens next.</p>
<h3>In the app (fastest)</h3>
<ol>
  <li>Open SportnNote (the phone app, or the web app at <a href="${cfg.appUrl}">${esc(cfg.appUrl.replace('https://', ''))}</a>) and sign in.</li>
  <li>Go to <strong>Profile</strong> → <strong>⚙ Settings</strong>.</li>
  <li>Under <strong>Privacy &amp; legal</strong>, tap <strong>Delete my account</strong>.</li>
  <li>Read what is removed, type <strong>DELETE</strong> and confirm. It happens straight away.</li>
</ol>
<h3>Without the app</h3>
<p>Can’t sign in, or no longer have the app? Email <a href="mailto:${cfg.contactEmail}?subject=Delete%20my%20account">${esc(cfg.contactEmail)}</a> with the subject <strong>Delete my account</strong>.</p>
<ul>
  <li>Send it from the email address on your account, or include the mobile number on your account.</li>
  <li>We check the request is really from you, then delete the account and tell you when it’s done — within 30 days.</li>
  <li>A parent or guardian can ask the same way for a child’s account.</li>
</ul>
<h3>What is deleted</h3>
<ul>
  <li>Your name, mobile number, email, date of birth, photo, bio and guardian details.</li>
  <li>Uploaded age or ID proofs.</li>
  <li>The text of messages you sent.</li>
  <li>Your follows, notification settings and team or club memberships.</li>
  <li>Your login. You won’t be able to sign in again.</li>
</ul>
<h3>What stays</h3>
<ul>
  <li>Scores of matches you played stay in other people’s match histories and standings, shown as “Deleted player”, no longer linked to you. This keeps tables and results correct for everyone else.</li>
  <li>Tournaments you organised stay up for their players.</li>
  <li>Usage and error data is kept for up to 13 months, then deleted, as set out in the Privacy Policy.</li>
</ul>
<p>More detail is in our <a href="/privacy/">Privacy Policy</a>. Questions? See <a href="/support/">Support</a>.</p>
</main>`,
});

// SD-155: public accessibility statement (WCAG 2.1 AA — US ADA Title II, UK PSBAR).
// Source of truth: docs/international/accessibility-statement.md — keep in step.
const A11Y_ROWS = [
  ['1.1.1 Non-text content', 'A', 'part', 'Icon buttons, scoreboards, the wagon wheel and pitch maps have text alternatives. A few charts outside the scoring screens have no table version yet.'],
  ['1.3.1 Info and relationships', 'A', 'part', 'Headings, labels and grouped score lines are exposed. Stats tables on the web are not yet marked up as data tables.'],
  ['1.3.2 Meaningful sequence · 1.3.3 Sensory characteristics', 'A', 'yes', 'Reading order follows the screen. Instructions never rely on colour or position alone.'],
  ['1.4.1 Use of colour', 'A', 'yes', 'Team buttons carry team names, results carry W/D/L, and LIVE is written out.'],
  ['2.1.1 Keyboard · 2.1.2 No keyboard trap', 'A', 'part', 'Every scoring pad, tab, chip and dialog works with Tab, Enter and Space, and Escape closes sheets. Some drag-to-reorder lists outside the core flows need a mouse or touch.'],
  ['2.2.1 Timing adjustable · 2.2.2 Pause, stop, hide', 'A', 'yes', 'Nothing times out your input. The pulsing LIVE dot stops when you turn on Reduce Motion.'],
  ['2.3.1 Three flashes', 'A', 'yes', 'Nothing flashes.'],
  ['2.4.1 Bypass blocks', 'A', 'part', 'This website has a skip link. The app has short headers but no skip link.'],
  ['2.4.2–2.4.4 Titles, focus order, link purpose', 'A', 'yes', 'Every screen is titled, focus follows the layout, and links say where they go.'],
  ['2.5.1–2.5.3 Pointer gestures, cancellation, label in name', 'A', 'yes', 'Long-press always has a tap alternative, and spoken names start with the visible text.'],
  ['3.1.1 Language · 3.2.1/3.2.2 Predictable · 3.3.1/3.3.2 Input help', 'A', 'yes', 'Language is set, and nothing changes on focus. Errors are shown in words and announced.'],
  ['4.1.2 Name, role, value', 'A', 'yes', 'Every control on the core screens has a role, a name and its state (selected, expanded, disabled). An automated test checks this on every build.'],
  ['1.3.4 Orientation · 1.3.5 Input purpose', 'AA', 'part', 'Works in either orientation. Sign-in fields support autofill, but profile fields don’t yet.'],
  ['1.4.3 Contrast (minimum)', 'AA', 'yes', 'All text meets 4.5:1 (large text 3:1), checked by an automated test over the theme. Team colours are adjusted so they always read.'],
  ['1.4.4 Resize text', 'AA', 'part', 'The apps follow your phone’s text size and the web app zooms to 200%. Very large score digits stop growing at 1.5×. Full 200% device testing is in progress.'],
  ['1.4.10 Reflow · 1.4.11 Non-text contrast', 'AA', 'yes', 'No sideways scrolling at phone width (wide tables scroll in place). Field edges and the focus ring meet 3:1.'],
  ['1.4.12 Text spacing · 1.4.13 Hover or focus content', 'AA', 'part', 'Boxes grow with their text. Long single-line names shorten with “…” on screen but are read out in full. There are no hover pop-ups.'],
  ['2.4.5–2.4.7 Multiple ways, headings, focus visible', 'AA', 'yes', 'Search, browse and follow. Every control shows a clear amber focus ring when you use a keyboard.'],
  ['3.2.3/3.2.4 Consistency · 3.3.3/3.3.4 Error help and prevention', 'AA', 'yes', 'Shared controls look and behave the same everywhere. Ending a match, deleting or clearing always asks first, and results can be undone.'],
  ['4.1.3 Status messages', 'AA', 'yes', 'Score changes are announced by VoiceOver, TalkBack and screen readers on the web as they happen.'],
  ['1.2.x Audio and video · 2.5.4 Motion actuation · 3.1.2 Language of parts', 'A/AA', 'na', 'Not applicable: no hosted media, no shake or tilt input, English only.'],
];
const A11Y_WORD = { yes: ['Supports', 'a11y-yes'], part: ['Partially supports', 'a11y-part'], na: ['Not applicable', 'a11y-na'] };
const accessibilityPage = page({
  title: 'Accessibility — SportnNote',
  description: 'SportnNote’s accessibility statement: how the scoring app meets WCAG 2.1 AA, what we know is not there yet, and how to tell us about a problem.',
  path: '/accessibility/',
  body: `<main class="doc">
<h2>Accessibility</h2>
<p>SportnNote should work for every player, scorer, parent and organiser, including people who use a screen reader, a keyboard, larger text or reduced motion. Our target is <strong>WCAG 2.1 Level AA</strong>, the standard US public schools must meet under ADA Title II and the one UK public bodies follow.</p>
<h3>What works today</h3>
<ul>
  <li><strong>Screen readers:</strong> VoiceOver (iPhone), TalkBack (Android) and screen readers on the web read every scoring button by name (for example “Four (boundary)” or “Point to Red House, serving”) and <strong>announce each score change</strong> as it happens.</li>
  <li><strong>Keyboard:</strong> in the web app every scoring pad, tab and dialog works with Tab, Enter and Space, with a clear amber focus ring.</li>
  <li><strong>Contrast:</strong> all text meets the 4.5:1 minimum, and team colours are adjusted so a dark kit still reads.</li>
  <li><strong>Larger text:</strong> the apps follow your phone’s text size, and buttons grow instead of cutting words off.</li>
  <li><strong>Reduce motion:</strong> pulsing and sliding animations stop when you ask your phone or browser to reduce motion.</li>
  <li><strong>Colour is never the only signal:</strong> team buttons carry names, and results carry W / D / L.</li>
</ul>
<h3>Conformance summary (WCAG 2.1)</h3>
<p>Assessed on ${esc(new Date().toISOString().slice(0, 10))} for sign-in, Home, live scoring in every sport, standings and brackets, player and tournament pages, and results entry.</p>
<div class="a11y-table-wrap" tabindex="0" role="region" aria-label="Conformance table (scrolls sideways on small screens)"><table class="a11y-table">
<caption>Criteria, level and how well we meet them</caption>
<thead><tr><th scope="col">Criterion</th><th scope="col">Level</th><th scope="col">Conformance</th><th scope="col">Notes</th></tr></thead>
<tbody>
${A11Y_ROWS.map(([c, l, k, n]) => `<tr><th scope="row">${esc(c)}</th><td>${l}</td><td class="${A11Y_WORD[k][1]}">${A11Y_WORD[k][0]}</td><td>${esc(n)}</td></tr>`).join('\n')}
</tbody></table></div>
<h3>Known gaps we are working on</h3>
<ul>
  <li>A full real-device VoiceOver and TalkBack walk-through of every sport, and 200% text checks on iOS and Android.</li>
  <li>Stats tables on the web marked up as proper data tables.</li>
  <li>The same label and keyboard pass on admin screens (organisation settings, messages, meet setup wizards).</li>
  <li>The browser’s “text size only” setting (zoom works; text-only resizing does not yet).</li>
</ul>
<h3>Tell us about a problem</h3>
<p>If something is hard or impossible to use, email <a href="mailto:${cfg.contactEmail}?subject=Accessibility">${esc(cfg.contactEmail)}</a> with “Accessibility” in the subject. Tell us the screen, the sport and the device or assistive technology. We answer within our support hours (${esc(cfg.supportHours)}) and fix anything that blocks scoring first.</p>
<p>Schools and districts can ask for our VPAT (Accessibility Conformance Report, WCAG edition) at the same address.</p>
</main>`,
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
mkdirSync(join(OUT, 'support'), { recursive: true });
writeFileSync(join(OUT, 'support/index.html'), supportPage);
mkdirSync(join(OUT, 'delete-account'), { recursive: true });
writeFileSync(join(OUT, 'delete-account/index.html'), deleteAccountPage);
mkdirSync(join(OUT, 'accessibility'), { recursive: true });
writeFileSync(join(OUT, 'accessibility/index.html'), accessibilityPage);
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
${['/', '/privacy/', '/terms/', '/support/', '/delete-account/', '/accessibility/', '/guides/'].map((p) => `  <url><loc>${cfg.siteUrl}${p}</loc></url>`).join('\n')}
${guides.filter((g) => !g.draft).map((g) => `  <url><loc>${cfg.siteUrl}/guides/${g.slug}/</loc><lastmod>${g.updated}</lastmod></url>`).join('\n')}
</urlset>
`);
console.log(`✓ website built → ${OUT.replace(ROOT + '/', '')} (legal version ${legal.LEGAL_VERSION}; ${guides.length} guide${guides.length === 1 ? '' : 's'}${INCLUDE_DRAFTS ? ', drafts included' : ''})`);
