import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTournamentToken, tournamentJoinLink, tournamentInviteMessage, isTournamentToken } from '../src/core/tournamentInvite.ts';
import { SHARE_BASE } from '../src/core/shareText.ts';

test('parseTournamentToken: code forms', () => {
  assert.equal(parseTournamentToken('T-ABC123'), 'T-ABC123');
  assert.equal(parseTournamentToken('  t-abc123 '), 'T-ABC123');
  assert.equal(parseTournamentToken('tabc123'), 'T-ABC123');
  assert.equal(parseTournamentToken('T ABC123'), 'T-ABC123');
});

test('parseTournamentToken: links', () => {
  assert.equal(parseTournamentToken('https://app.sportnnote.in/join-tournament/T-ABC123'), 'T-ABC123');
  assert.equal(parseTournamentToken('sportnnote://join-tournament/t-abc123'), 'T-ABC123');
  assert.equal(parseTournamentToken('https://app.sportnnote.in/join-tournament?c=T-XYZ789'), 'T-XYZ789');
});

test('parseTournamentToken: rejects team/club codes and junk', () => {
  assert.equal(parseTournamentToken('JOIN-7KQ2XH9MWD'), null);
  assert.equal(parseTournamentToken('T-ABC12'), null);
  assert.equal(parseTournamentToken('T-ABC1234'), null);
  assert.equal(parseTournamentToken(''), null);
  assert.equal(parseTournamentToken(undefined), null);
  assert.equal(parseTournamentToken('https://app.sportnnote.in/join-club/T-ABC123x'), null);
  assert.equal(isTournamentToken('JOIN-7KQ2XH9MWD'), false);
  assert.equal(isTournamentToken('t-abc123'), true);
});

test('tournamentJoinLink + message carry link and code', () => {
  assert.equal(tournamentJoinLink('T-ABC123'), `${SHARE_BASE}/join-tournament/T-ABC123`);
  const msg = tournamentInviteMessage({ tournamentName: 'Inter-house Cup', inviterName: 'Asha', token: 'T-ABC123' });
  assert.ok(msg.includes('Inter-house Cup'));
  assert.ok(msg.includes('Asha'));
  assert.ok(msg.includes(`${SHARE_BASE}/join-tournament/T-ABC123`));
  assert.ok(msg.includes('code: T-ABC123'));
  assert.equal(parseTournamentToken(msg.split('\n').find((l) => l.includes('join-tournament'))!), 'T-ABC123');
});
