/**
 * SD-151 — domain-agnostic links, region-aware sharing + speech, support copy.
 *  • hosts: one source of truth, .in defaults, .com only when configured, .in kept forever
 *  • send-invite allow-list (edge _shared/hosts.ts) accepts app.sportnnote.in and configured .com
 *  • chatRegion: WhatsApp-first only where it's the norm; India / unknown unchanged
 *  • speech locale by region (en-GB / en-AU / en-US, en-IN default)
 *  • support KB: pricing line, install anywhere, account deletion, contact hours with a time zone
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hostConfig, linkPrefixes, SITE_URL, APP_URL, SITE_HOST, APP_HOST, INSTALL_PAGE_URL, DELETE_ACCOUNT_URL, KEEP_IN_ORIGINS, PLANNED_COM_ORIGINS, SUPPORT_EMAIL, SUPPORT_HOURS } from '../src/core/hosts.ts';
import { SHARE_BASE, matchLink, matchShareText } from '../src/core/shareText.ts';
import { INSTALL_PAGE_URL as INSTALL_FROM_INVITE, joinLink, androidIntentUrl } from '../src/core/inviteText.ts';
import { fixturesPrintHtml } from '../src/core/fixturesText.ts';
import { regionFromLocale, regionFromTimeZone, whatsappFirst, preferredChat, speechLangs } from '../src/core/chatRegion.ts';
import { ARTICLES, getArticle, searchArticles } from '../src/data/supportKB.ts';
import { GUIDES } from '../src/data/supportGuides.ts';

describe('hosts — one source of truth', () => {
  test('defaults are today\'s .in hosts (nothing changes until the env is set)', () => {
    assert.equal(SITE_URL, 'https://sportnnote.in');
    assert.equal(APP_URL, 'https://app.sportnnote.in');
    assert.equal(SITE_HOST, 'sportnnote.in');
    assert.equal(APP_HOST, 'app.sportnnote.in');
    assert.equal(INSTALL_PAGE_URL, 'https://sportnnote.in/#get');
    assert.equal(DELETE_ACCOUNT_URL, 'https://sportnnote.in/delete-account/');
    assert.equal(SHARE_BASE, APP_URL);
    assert.equal(INSTALL_FROM_INVITE, INSTALL_PAGE_URL);
    assert.equal(matchLink('m1'), 'https://app.sportnnote.in/m/m1');
    assert.equal(joinLink('p1'), 'https://app.sportnnote.in/i/p1');
    assert.ok(androidIntentUrl('join-club/X').includes(encodeURIComponent('https://sportnnote.in/#get')));
  });

  test('a .com config flips the links; bad values fall back to .in', () => {
    const c = hostConfig({ site: 'https://sportnnote.com/', app: ' https://app.sportnnote.com ', extra: 'https://sportnnote.com, nonsense ,https://app.sportnnote.com' });
    assert.equal(c.siteUrl, 'https://sportnnote.com');
    assert.equal(c.appUrl, 'https://app.sportnnote.com');
    assert.deepEqual(c.extraOrigins, ['https://sportnnote.com', 'https://app.sportnnote.com']);
    const bad = hostConfig({ site: 'sportnnote.com', app: 'https://x.com/path', extra: '' });
    assert.equal(bad.siteUrl, 'https://sportnnote.in');
    assert.equal(bad.appUrl, 'https://app.sportnnote.in');
  });

  test('deep-link prefixes: scheme + every .in host (incl. app.) — .com only when configured', () => {
    const today = linkPrefixes();
    assert.deepEqual(today, ['sportnnote://', 'https://sportnnote.in', 'https://www.sportnnote.in', 'https://app.sportnnote.in']);
    for (const com of PLANNED_COM_ORIGINS) assert.ok(!today.includes(com), `${com} must not be live before the domain is bought`);
    const later = linkPrefixes(hostConfig({ site: 'https://sportnnote.com', app: 'https://app.sportnnote.com', extra: PLANNED_COM_ORIGINS.join(',') }));
    for (const o of [...KEEP_IN_ORIGINS, ...PLANNED_COM_ORIGINS]) assert.ok(later.includes(o), `missing ${o}`);
    assert.equal(new Set(later).size, later.length, 'no duplicates');
  });

  test('footers use the configured host', () => {
    assert.ok(matchShareText({ sportIcon: '⚽', status: 'final', home: 'A', away: 'B' }).endsWith('Scored on SportnNote — sportnnote.in'));
    assert.ok(fixturesPrintHtml({ tournament: 'Cup', rows: [] } as never).includes('Live scores on SportnNote · sportnnote.in'));
  });

  test('support contact has a time zone in its hours', () => {
    assert.match(SUPPORT_EMAIL, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
    assert.match(SUPPORT_HOURS, /UTC[+-]\d/);
  });
});

describe('edge _shared/hosts.ts — invite link allow-list', () => {
  async function load(env: Record<string, string>) {
    (globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => env[k] } };
    return import(`../supabase/functions/_shared/hosts.ts?${Math.random()}`);
  }
  const ok = (prefixes: string[], link: string) => prefixes.some((p) => link.startsWith(p));

  test('defaults accept every .in host — including app.sportnnote.in, where invites point', async () => {
    const h = await load({});
    const p: string[] = h.inviteLinkPrefixes('https://proj.supabase.co');
    assert.equal(h.APP_URL, 'https://app.sportnnote.in');
    for (const l of ['https://app.sportnnote.in/i/abc', 'https://sportnnote.in/guides/', 'https://www.sportnnote.in/x', 'sportnnote://join-club/X', 'https://proj.supabase.co/functions/v1/join?p=1']) assert.ok(ok(p, l), l);
    for (const l of ['https://sportnnote.in.evil.com/x', 'https://sportnnote.com/i/abc', 'https://evil.com/']) assert.ok(!ok(p, l), l);
  });

  test('configured .com hosts are accepted alongside .in', async () => {
    const h = await load({ APP_URL: 'https://app.sportnnote.com', EXTRA_LINK_ORIGINS: 'https://sportnnote.com' });
    const p: string[] = h.inviteLinkPrefixes('https://proj.supabase.co');
    assert.equal(h.APP_URL, 'https://app.sportnnote.com');
    for (const l of ['https://app.sportnnote.com/i/abc', 'https://sportnnote.com/x', 'https://app.sportnnote.in/i/abc', 'https://sportnnote.in/x']) assert.ok(ok(p, l), l);
    delete (globalThis as { Deno?: unknown }).Deno;
  });
});

describe('chatRegion — WhatsApp-first only where it is the norm', () => {
  test('region from locale and time zone', () => {
    assert.equal(regionFromLocale('en-GB'), 'GB');
    assert.equal(regionFromLocale('en_AU'), 'AU');
    assert.equal(regionFromLocale('en'), null);
    assert.equal(regionFromLocale('zh-Hans-SG'), 'SG');
    assert.equal(regionFromTimeZone('Asia/Kolkata'), 'IN');
    assert.equal(regionFromTimeZone('Asia/Calcutta'), 'IN');
    assert.equal(regionFromTimeZone('Asia/Dubai'), 'AE');
    assert.equal(regionFromTimeZone('Europe/London'), 'GB');
    assert.equal(regionFromTimeZone('Australia/Sydney'), 'AU');
    assert.equal(regionFromTimeZone('America/New_York'), 'US');
    assert.equal(regionFromTimeZone('America/Indiana/Indianapolis'), 'US');
    assert.equal(regionFromTimeZone('America/Sao_Paulo'), null);
  });

  test('India and unknown keep WhatsApp first (unchanged); Gulf, UK, SG/MY too', () => {
    for (const r of ['IN', null, 'AE', 'QA', 'GB', 'SG', 'MY']) {
      assert.equal(whatsappFirst(r), true, String(r));
      assert.equal(preferredChat(r), 'whatsapp');
    }
  });

  test('US / Australia / Canada lead with text messages', () => {
    for (const r of ['US', 'AU', 'CA']) {
      assert.equal(whatsappFirst(r), false, r);
      assert.equal(preferredChat(r), 'sms');
    }
  });

  test('speech language by region; Indian English by default', () => {
    assert.deepEqual(speechLangs('GB'), ['en-GB', 'en-US']);
    assert.deepEqual(speechLangs('AU'), ['en-AU', 'en-GB', 'en-US']);
    assert.deepEqual(speechLangs('US'), ['en-US']);
    assert.deepEqual(speechLangs('IN'), ['en-IN', 'en-US']);
    assert.deepEqual(speechLangs(null), ['en-IN', 'en-US']);
    assert.deepEqual(speechLangs('AE'), ['en-IN', 'en-US']);
  });
});

describe('support KB — region-neutral answers', () => {
  test('pricing uses the approved line', () => {
    const a = getArticle('pricing')!;
    assert.ok(a.summary.includes("Free while we're new; a small fee later, announced 30 days in advance."));
    assert.equal(searchArticles('is it free')[0]?.article.id, 'pricing');
  });
  test('install works outside India; deletion and contact articles exist', () => {
    assert.ok(getArticle('install-app')!.body.includes('any country'));
    assert.ok(getArticle('delete-account')!.body.includes(DELETE_ACCOUNT_URL));
    assert.ok(getArticle('contact-support')!.body.includes(SUPPORT_HOURS));
    assert.equal(searchArticles('delete my account')[0]?.article.id, 'delete-account');
  });
  test('no India-only defaults or WhatsApp-only wording left', () => {
    const all = [...ARTICLES.map((a) => `${a.summary} ${a.body}`), ...Object.values(GUIDES)].join('\n');
    assert.ok(!/default India|India \/ IST|Hyderabad/.test(all));
    assert.ok(!/and WhatsApp opens with an invite/.test(all));
  });
});
