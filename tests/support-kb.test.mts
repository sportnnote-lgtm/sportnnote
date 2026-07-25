/**
 * Support knowledge-base search — the self-serve answer layer that runs offline
 * with no AI. If a user's plain-English question doesn't surface the right
 * article, they fall through to emailing a human unnecessarily, so the ranking
 * has to actually work on the phrases people type.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { searchArticles, articlesByCategory, getArticle, buildSupportMailto, ARTICLES } from '../src/data/supportKB.ts';

const top = (q: string) => searchArticles(q)[0]?.article.id;

describe('support KB: search finds the right article', () => {
  const cases: [string, string][] = [
    ['how do I undo a mistake', 'undo-fix-mistake'],
    ['I lost internet while scoring', 'offline-scoring'],
    ['sync keeps failing', 'offline-scoring'],
    ['create a tournament', 'create-tournament'],
    ['generate the fixtures', 'generate-fixtures'],
    ['add a new player', 'add-players'],
    ['change my timezone', 'change-timezone'],
    ['set the playing 11', 'set-lineup-squad'],
    ['rain reduced overs', 'rain-dls'],
    ['how to follow a team', 'follow-players'],
    ['match reminders before a game', 'match-reminders'],
    ['verify my age', 'verification'],
  ];
  for (const [query, expected] of cases) {
    test(`"${query}" → ${expected}`, () => {
      const hits = searchArticles(query);
      const ids = hits.map((h) => h.article.id);
      assert.ok(ids.includes(expected), `expected ${expected} in results, got [${ids.join(', ')}]`);
      assert.equal(hits[0].article.id, expected, `expected ${expected} to rank first, got ${hits[0].article.id}`);
    });
  }
});

describe('support KB: ranking hygiene', () => {
  test('a query with no real words returns nothing (so we escalate, not misfire)', () => {
    assert.equal(searchArticles('the and for you how').length, 0);
    assert.equal(searchArticles('').length, 0);
    assert.equal(searchArticles('!!!').length, 0);
  });

  test('results are sorted by score, best first', () => {
    const hits = searchArticles('score a match live');
    for (let i = 1; i < hits.length; i++) {
      assert.ok(hits[i - 1].score >= hits[i].score, 'scores must be non-increasing');
    }
  });

  test('limit is respected', () => {
    assert.ok(searchArticles('match', 3).length <= 3);
  });
});

describe('support KB: data integrity', () => {
  test('every article id is unique', () => {
    const ids = ARTICLES.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate article id');
  });

  test('every article has a title, summary and non-trivial body', () => {
    for (const a of ARTICLES) {
      assert.ok(a.title.length > 0, `${a.id} missing title`);
      assert.ok(a.summary.length > 0, `${a.id} missing summary`);
      assert.ok(a.body.length > 40, `${a.id} body too short`);
    }
  });

  test('getArticle round-trips; categories cover every article', () => {
    for (const a of ARTICLES) assert.equal(getArticle(a.id)?.id, a.id);
    const grouped = articlesByCategory().flatMap((g) => g.articles);
    assert.equal(grouped.length, ARTICLES.length, 'a category is missing from articlesByCategory order');
  });
});

describe('support escalation: mailto', () => {
  test('carries the question, account and context, all URL-encoded', () => {
    const url = buildSupportMailto('help@example.com', {
      question: 'My score won\'t sync',
      triedSummary: 'Scoring offline & how syncing works',
      handle: 'aarav',
      appVersion: '1.0.0',
    });
    assert.ok(url.startsWith('mailto:help@example.com?'));
    assert.ok(url.includes('subject='));
    const body = decodeURIComponent(url.split('body=')[1]);
    assert.ok(body.includes("My score won't sync"));
    assert.ok(body.includes('Already tried: Scoring offline'));
    assert.ok(body.includes('Account: @aarav'));
    assert.ok(body.includes('App version: 1.0.0'));
    // no raw spaces/newlines leaked into the URL
    assert.ok(!/\s/.test(url), 'mailto URL must be fully encoded');
  });

  test('omits optional lines when not provided', () => {
    const url = buildSupportMailto('help@example.com', { question: 'Hi' });
    const body = decodeURIComponent(url.split('body=')[1]);
    assert.ok(!body.includes('Already tried'));
    assert.ok(!body.includes('Account:'));
  });
});
