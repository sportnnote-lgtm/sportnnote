-- ============================================================================
--  Sportfolio · migration 0006 — Contact verification codes (OTP)
--  Delta on top of schema.sql + migrations 0001–0005. Idempotent — safe to re-run.
--
--  Backs real email verification of a player's contact: the send-contact-otp
--  edge function stores a hashed 6-digit code here (one active code per
--  player+channel), emails it, and verify-contact-otp checks it and flips the
--  player's *_verified flag. Only the service role (edge functions) touches this
--  table — RLS is on with no client policies, so it's server-only.
-- ============================================================================

create table if not exists contact_otps (
  player_id  uuid not null references players(id) on delete cascade,
  channel    text not null check (channel in ('email', 'phone')),
  code_hash  text not null,              -- sha-256 of the 6-digit code (never store plaintext)
  target     text not null,              -- the email/phone the code was sent to
  attempts   int  not null default 0,    -- wrong-guess counter (cap enforced in the function)
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (player_id, channel)       -- one active code per channel; a resend upserts
);

alter table contact_otps enable row level security;
-- No policies on purpose: only the service-role edge functions read/write this.
