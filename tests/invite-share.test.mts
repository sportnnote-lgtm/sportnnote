/** SD-108 — invite / share text per invite type (exact strings), the QR payload,
 *  and the Android "open in the app" intent link. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inviteLabel, clubInviteMessage, provisionalInviteMessage, inviteMessage, teamAtTournament,
  matchRoleInviteText, tournamentRoleInviteText, androidIntentUrl, webDevice,
  inviteQrPayload, inviteQrFileName, parseClubToken, INSTALL_PAGE_URL,
} from '../src/core/inviteText.ts';
import { tournamentInviteMessage, parseTournamentToken } from '../src/core/tournamentInvite.ts';

test('inviteLabel: kind word before the name, not doubled', () => {
  assert.equal(inviteLabel('Team', 'L&H'), 'Team L&H');
  assert.equal(inviteLabel('Team', 'Team Titans'), 'Team Titans');
  assert.equal(inviteLabel('Team', 'Banjara Hills Team'), 'Banjara Hills Team');
  assert.equal(inviteLabel('Team', 'Steamers'), 'Team Steamers'); // "team" inside a word doesn't count
  assert.equal(inviteLabel('Tournament', 'Open Cup 2026'), 'Tournament Open Cup 2026');
  assert.equal(inviteLabel('Tournament', 'Hyderabad Open Tournament'), 'Hyderabad Open Tournament');
  assert.equal(inviteLabel('Organisation', 'DPS'), 'Organisation DPS');
  assert.equal(inviteLabel('Organisation', 'Sports Organization of India'), 'Sports Organization of India');
  assert.equal(inviteLabel('Team', '  '), 'Team');
});

test('team (club) invite — the founder message, with "Team" before the name', () => {
  assert.equal(
    clubInviteMessage({ clubName: 'L&H', inviterName: 'Hrudhay Organizer', token: 'JOIN-ZCK8AH5KUA' }),
    'Join Team L&H on SportnNote! Hrudhay Organizer invited you 🛡️\n\n'
    + 'Open this to join: https://app.sportnnote.in/join-club/JOIN-ZCK8AH5KUA\n\n'
    + 'Or in the app, go to Join a team and enter code: JOIN-ZCK8AH5KUA',
  );
});

test('tournament invite', () => {
  assert.equal(
    tournamentInviteMessage({ tournamentName: 'Open Cup', inviterName: 'Hrudhay', token: 'T-ABC123' }),
    'Enter your team in Tournament Open Cup on SportnNote! Hrudhay invited your team 🏆\n\n'
    + 'Open this to enter: https://app.sportnnote.in/join-tournament/T-ABC123\n\n'
    + 'Or in the app, go to Settings → Join a team with a code and enter code: T-ABC123',
  );
  assert.match(tournamentInviteMessage({ tournamentName: 'Hyderabad Open Tournament', token: 'T-ABC123' }), /^Enter your team in Hyderabad Open Tournament on SportnNote!\n/);
});

test('player added to a team by number (squad / match)', () => {
  assert.equal(
    provisionalInviteMessage({ name: 'Ravi', playerId: 'p1', teamName: 'L&H' }),
    "Hi Ravi! You've been added to Team L&H on SportnNote 🏆\n\n"
    + 'Tap the link and sign up with this mobile number (1 minute, no password) to confirm your spot and track your stats:\n'
    + 'https://app.sportnnote.in/i/p1\n\n'
    + "Not you / didn't expect this? Tell us (no app needed): https://app.sportnnote.in/i/p1?notme=1",
  );
  assert.match(provisionalInviteMessage({ name: 'Invited (…1234)', playerId: 'p1', teamName: 'L&H', captain: true }), /^Hi there! You're the captain of Team L&H on SportnNote 🧢\n/);
});

test('team manager + tournament co-host invites', () => {
  assert.equal(teamAtTournament('L&H', 'Open Cup'), 'Team L&H at Tournament Open Cup');
  assert.equal(teamAtTournament('L&H'), 'Team L&H');
  assert.equal(
    inviteMessage({ name: 'Asha', inviterName: 'Hrudhay', link: 'https://app.sportnnote.in/i/p2', context: teamAtTournament('L&H', 'Open Cup'), role: 'manage' }),
    'Hi Asha! Hrudhay invited you to manage Team L&H at Tournament Open Cup on SportnNote 🏆 Install the app and register with this number/email to join:\nhttps://app.sportnnote.in/i/p2',
  );
  assert.equal(
    inviteMessage({ name: '', inviterName: 'Hrudhay', link: 'L', context: inviteLabel('Tournament', 'Open Cup') }),
    'Hi there! Hrudhay invited you to co-host Tournament Open Cup on SportnNote 🏆 Install the app and register with this number/email to join:\nL',
  );
});

test('match scorer / official / host invites', () => {
  assert.equal(
    matchRoleInviteText({ role: 'scorer', name: 'Kiran', inviterName: 'Hrudhay', home: 'L&H', away: 'Titans', when: 'Sat 12 Oct, 6:00 pm IST', link: 'https://app.sportnnote.in/m/m1' }),
    'Hi Kiran! Hrudhay added you as the scorer for Match L&H vs Titans (Sat 12 Oct, 6:00 pm IST) on SportnNote 🏅\n\n'
    + 'Open this link and sign in with this mobile number to score it live:\nhttps://app.sportnnote.in/m/m1',
  );
  assert.equal(
    matchRoleInviteText({ role: 'official', home: 'A', away: 'B', link: 'L' }),
    'Hi! A friend added you as an official for Match A vs B on SportnNote 🏅\n\nOpen this link and sign in with this mobile number to follow the match:\nL',
  );
  assert.match(matchRoleInviteText({ role: 'host', home: 'A', away: 'B', link: 'L' }), /added you as a host for Match A vs B .*to manage the match:\nL$/s);
});

test('tournament host / official invites', () => {
  assert.equal(
    tournamentRoleInviteText({ role: 'host', name: 'Kiran', inviterName: 'Hrudhay', tournamentName: 'Open Cup', link: 'https://app.sportnnote.in/t/t1' }),
    'Hi Kiran! Hrudhay added you as a host of Tournament Open Cup on SportnNote 🏆\n\nOpen this link and sign in with this mobile number to help run it:\nhttps://app.sportnnote.in/t/t1',
  );
  assert.equal(
    tournamentRoleInviteText({ role: 'referee', tournamentName: 'Open Cup', link: 'L' }),
    'Hi! A friend added you as a referee for Tournament Open Cup on SportnNote 🏆\n\nOpen this link and sign in with this mobile number:\nL',
  );
  assert.match(tournamentRoleInviteText({ role: 'host', link: 'L' }), /a host of a tournament on SportnNote/);
});

test('QR payload = the same https link the message carries; scanner reads it back', () => {
  const club = inviteQrPayload('club', 'JOIN-ZCK8AH5KUA');
  assert.equal(club, 'https://app.sportnnote.in/join-club/JOIN-ZCK8AH5KUA');
  assert.ok(clubInviteMessage({ clubName: 'L&H', inviterName: 'X', token: 'JOIN-ZCK8AH5KUA' }).includes(club));
  assert.equal(parseClubToken(club), 'JOIN-ZCK8AH5KUA');
  const tour = inviteQrPayload('tournament', 'T-ABC123');
  assert.equal(tour, 'https://app.sportnnote.in/join-tournament/T-ABC123');
  assert.equal(parseTournamentToken(tour), 'T-ABC123');
  assert.equal(inviteQrFileName('club', 'L&H', 'JOIN-ZCK8AH5KUA'), 'sportnnote-team-l-h-JOIN-ZCK8AH5KUA.png');
  assert.equal(inviteQrFileName('tournament', '', 'T-ABC123'), 'sportnnote-tournament-T-ABC123.png');
});

test('Android intent link: opens the app on the join screen, else the download page', () => {
  assert.equal(
    androidIntentUrl('join-club/JOIN-ZCK8AH5KUA'),
    'intent://join-club/JOIN-ZCK8AH5KUA#Intent;scheme=sportnnote;package=in.sportnnote.app;'
    + `S.browser_fallback_url=${encodeURIComponent('https://sportnnote.in/#get')};end`,
  );
  assert.equal(INSTALL_PAGE_URL, 'https://sportnnote.in/#get');
  assert.equal(
    androidIntentUrl('/join-tournament/T-ABC123', 'https://app.sportnnote.in/join-tournament/T-ABC123'),
    'intent://join-tournament/T-ABC123#Intent;scheme=sportnnote;package=in.sportnnote.app;S.browser_fallback_url=https%3A%2F%2Fapp.sportnnote.in%2Fjoin-tournament%2FT-ABC123;end',
  );
});

test('webDevice', () => {
  assert.equal(webDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'), 'android');
  assert.equal(webDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'), 'ios');
  assert.equal(webDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5), 'ios'); // iPad
  assert.equal(webDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126 Safari/537.36'), 'other');
  assert.equal(webDevice(undefined), 'other');
});
