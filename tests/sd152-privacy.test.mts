/**
 * SD-152 — privacy rights for international markets (not legal advice).
 *  • region rules: UK/GDPR ask before analytics; India unchanged; US under-13 blocked
 *  • analytics decision (what telemetry may do) per choice + country
 *  • legal: India text untouched and chosen for IN; international draft has every section
 *  • invites carry the privacy notice
 *  • migration: the server mirrors the client rules (static checks; RPC behaviour is
 *    exercised in the PGlite harness — scratchpad/pg/privacy.mjs, 67 checks)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyticsDecision, analyticsNeedsConsent, countryFromTimeZone, guardianConfirmRequired, policyRegion,
  privacyCountry, setPrivacyCountry, usUnder13Blocked, US_UNDER_13_MESSAGE,
} from '../src/core/privacyRegion.ts';
import {
  INTL_LEGAL_VERSION, INTL_PRIVACY_POLICY, INTL_TERMS, LEGAL_VERSION, PRIVACY_POLICY, TERMS,
  legalVersionFor, privacyPolicyFor, termsFor,
} from '../src/data/legal.ts';
import { provisionalInviteMessage, inviteMessage, PRIVACY_NOTICE_URL } from '../src/core/inviteText.ts';

const sql = readFileSync(new URL('../supabase/migrations/20261020120000_privacy_rights.sql', import.meta.url), 'utf8');
const roleSql = readFileSync(new URL('../supabase/migrations/20261020115900_signup_role_guard.sql', import.meta.url), 'utf8');

describe('country from the device time zone', () => {
  test('our markets', () => {
    assert.equal(countryFromTimeZone('Asia/Kolkata'), 'IN');
    assert.equal(countryFromTimeZone('Asia/Calcutta'), 'IN');
    assert.equal(countryFromTimeZone('Asia/Dubai'), 'AE');
    assert.equal(countryFromTimeZone('Asia/Qatar'), 'QA');
    assert.equal(countryFromTimeZone('Europe/London'), 'GB');
    assert.equal(countryFromTimeZone('Asia/Singapore'), 'SG');
    assert.equal(countryFromTimeZone('Asia/Kuching'), 'MY');
    assert.equal(countryFromTimeZone('Australia/Perth'), 'AU');
    assert.equal(countryFromTimeZone('America/Indiana/Indianapolis'), 'US');
    assert.equal(countryFromTimeZone('Pacific/Honolulu'), 'US');
    assert.equal(countryFromTimeZone('America/Toronto'), 'CA');
  });
  test('any other European zone counts as GDPR; unknown → undefined', () => {
    assert.equal(countryFromTimeZone('Europe/Berlin'), 'DE');
    assert.equal(countryFromTimeZone('Europe/Kyiv'), 'EU');
    assert.equal(countryFromTimeZone('Africa/Nairobi'), undefined);
    assert.equal(countryFromTimeZone(''), undefined);
  });
  test('unknown → India (Indian users see no change); a chosen country wins', () => {
    assert.equal(privacyCountry('Africa/Nairobi'), 'IN');
    assert.equal(privacyCountry(undefined), 'IN');
    setPrivacyCountry('gb');
    assert.equal(privacyCountry('Asia/Kolkata'), 'GB');
    setPrivacyCountry(null);
    assert.equal(privacyCountry('Asia/Kolkata'), 'IN');
  });
});

describe('analytics consent gating', () => {
  test('UK / EEA / CH ask first; India and the other markets are notice-only', () => {
    for (const c of ['GB', 'DE', 'FR', 'IE', 'NO', 'CH', 'EU']) assert.equal(analyticsNeedsConsent(c), true, c);
    for (const c of ['IN', 'AE', 'QA', 'SG', 'MY', 'AU', 'US']) assert.equal(analyticsNeedsConsent(c), false, c);
  });
  test('decision: a saved choice wins; otherwise wait (UK) or allow (India)', () => {
    assert.equal(analyticsDecision(null, 'GB'), 'undecided');
    assert.equal(analyticsDecision(null, 'IN'), 'allowed');
    assert.equal(analyticsDecision('denied', 'IN'), 'denied');
    assert.equal(analyticsDecision('granted', 'GB'), 'allowed');
    assert.equal(analyticsDecision('denied', 'GB'), 'denied');
  });
  test('telemetry obeys it: no device id, no sends unless allowed', () => {
    const t = readFileSync(new URL('../src/core/telemetry.ts', import.meta.url), 'utf8');
    assert.match(t, /if \(analyticsState\(\) !== 'allowed'\) return null;/);
    assert.match(t, /analyticsState\(\) === 'denied'\) return;/);
    assert.match(t, /if \(consent === 'undecided'\)/);
    assert.match(t, /removeItem\(ANON_KEY\)/);
  });
  test('server: opted-out accounts are never linked; pre-sign-up choice carries over', () => {
    assert.match(sql, /not coalesce\(analytics_opt_out, false\)/);
    assert.match(sql, /meta->>'analytics' = 'denied'/);
  });
});

describe('under-18 rules', () => {
  test('guardian confirms by email everywhere except India', () => {
    assert.equal(guardianConfirmRequired('IN'), false);
    assert.equal(guardianConfirmRequired(undefined), false);
    for (const c of ['GB', 'AE', 'QA', 'SG', 'MY', 'AU', 'US']) assert.equal(guardianConfirmRequired(c), true, c);
    assert.match(sql, /select p_country is not null and upper\(p_country\) <> 'IN'/);
  });
  test('US under-13: no self sign-up (client + server)', () => {
    assert.equal(usUnder13Blocked('US', 12), true);
    assert.equal(usUnder13Blocked('us', 0), true);
    assert.equal(usUnder13Blocked('US', 13), false);
    assert.equal(usUnder13Blocked('GB', 10), false);
    assert.equal(usUnder13Blocked('IN', 9), false);
    assert.equal(usUnder13Blocked('US', undefined), false);
    assert.match(US_UNDER_13_MESSAGE, /parent or guardian can add them/);
    assert.match(sql, /yrs < 13 and \(cc = 'US' or nanp\)/);
    assert.match(sql, /US_UNDER_13/);
  });
  test('limited state blocks follows + messages; consent columns are server-only', () => {
    assert.match(sql, /"guardian pending: no follows" on follows as restrictive for insert/);
    assert.match(sql, /create trigger guard_message_limited_minor before insert on messages/);
    assert.match(sql, /create trigger guard_privacy_columns before update on profiles/);
    assert.match(sql, /new\.guardian_consent := null;/); // never from a client insert
  });
  test('sign-up metadata can never grant staff roles', () => {
    assert.match(roleSql, /new\.role := 'fan'/);
    assert.match(roleSql, /before insert on profiles/);
  });
});

describe('rights RPCs exist with the right grants', () => {
  const grants: [string, string][] = [
    ['export_my_data()', 'authenticated'],
    ['guardian_children()', 'authenticated'],
    ['guardian_export_child(uuid)', 'authenticated'],
    ['guardian_set_consent(uuid, boolean)', 'authenticated'],
    ['guardian_consent_preview(text)', 'anon, authenticated'],
    ['guardian_consent_decide(text, boolean, text)', 'anon, authenticated'],
    ['create_guardian_consent_code(uuid)', 'service_role'],
    ['guardian_delete_target(uuid, uuid)', 'service_role'],
    ['due_verification_docs(int)', 'service_role'],
    ['mark_verification_doc_deleted(uuid)', 'service_role'],
    ['due_withdrawn_accounts(int)', 'service_role'],
  ];
  for (const [fn, to] of grants) {
    test(fn, () => assert.ok(sql.includes(`grant execute on function ${fn} to ${to};`), `${fn} → ${to}`));
  }
  test('export has every section', () => {
    for (const k of ['account', 'login', 'players', 'statLines', 'messagesSent', 'follows', 'memberships', 'guardianOf', 'consents']) {
      assert.ok(sql.includes(`'${k}'`), k);
    }
  });
  test('ID proofs: 30-day grace after the decision, outcome kept, file refs stripped', () => {
    assert.match(sql, /p_grace_days int default 30/);
    assert.match(sql, /verification->>'status' in \('approved', 'rejected'\)/);
    assert.match(sql, /\(verification - 'docPath' - 'docName'\)/);
    const fn = readFileSync(new URL('../supabase/functions/privacy-retention/index.ts', import.meta.url), 'utf8');
    assert.match(fn, /cron\.schedule/);
    assert.match(fn, /if \(!isCron\(req\)\) return new Response\('forbidden'/);
  });
});

describe('policy text', () => {
  test('India keeps its own policy + version', () => {
    assert.equal(privacyPolicyFor('IN'), PRIVACY_POLICY);
    assert.equal(termsFor('in'), TERMS);
    assert.equal(legalVersionFor('IN'), LEGAL_VERSION);
    assert.equal(policyRegion('IN'), 'india');
    assert.match(PRIVACY_POLICY, /Digital Personal Data Protection Act, 2023/);
  });
  test('everyone else gets the international draft', () => {
    assert.equal(privacyPolicyFor('GB'), INTL_PRIVACY_POLICY);
    assert.equal(termsFor('US'), INTL_TERMS);
    assert.equal(legalVersionFor('AE'), INTL_LEGAL_VERSION);
    for (const h of ['## Who we are', '## Why we use it, and our legal basis', '## Data an organiser adds about you', '## Children',
      '## Where your data is stored', '## Who we share it with', '## How long we keep it', '## Cookies', '## Rights in your country',
      '### United Kingdom', '### United Arab Emirates', '### Qatar', '### Singapore', '### Malaysia', '### Australia', '### United States']) {
      assert.ok(INTL_PRIVACY_POLICY.includes(h), h);
    }
    for (const p of ['Supabase', 'Expo', 'Firebase', 'Resend', 'Cloudflare', 'Anthropic']) assert.ok(INTL_PRIVACY_POLICY.includes(p), p);
    assert.match(INTL_PRIVACY_POLICY, /\*\*India\*\* \(Mumbai\)/);
    assert.match(INTL_TERMS, /Nothing in these terms limits rights you have by law/);
  });
});

describe('organiser-added people get a privacy notice', () => {
  test('provisional + co-host invites end with the notice link', () => {
    assert.ok(provisionalInviteMessage({ name: 'Ravi', playerId: 'p1', teamName: 'L&H' }).endsWith(`How we handle your details: ${PRIVACY_NOTICE_URL}`));
    assert.ok(inviteMessage({ name: 'Asha', inviterName: 'H', link: 'L' }).endsWith(PRIVACY_NOTICE_URL));
    const fn = readFileSync(new URL('../supabase/functions/send-invite/index.ts', import.meta.url), 'utf8');
    assert.match(fn, /How we handle your details: \$\{SITE_URL\}\/privacy\//);
  });
});
