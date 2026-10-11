-- 0050 — Phone identity = the FULL international number (E.164), not the last 10 digits.
--
-- Security fix (docs/international/audit/identity.md #1, P0). phone_key() used to
-- be right(digits, 10), so a foreign number sharing an Indian number's last 10
-- digits — US +1 917 555 1234 vs Indian +91 91755 51234, Qatar +974 3312 3456 vs
-- +91 74331 23456 — could sign into that account (phone_login_lookup), claim its
-- invited players (phone_login_attach_player, my_claimable_player, the claim
-- check in guard_player_write) and pass phone verification.
--
-- After this migration:
--   • phone_key(p) = '+' || every digit of the international number, or NULL.
--     Bare digits (rows saved before E.164) keep their only sensible meaning: a
--     10-digit number (optionally with trunk 0s) is an Indian mobile → '+91…';
--     11–15 bare digits already carry a country code; shorter bare numbers have
--     no country and match NOTHING. Mirrors src/core/phone.ts phoneKey() and
--     supabase/functions/_shared/phone.ts.
--   • Every function that matches numbers already goes through phone_key()
--     (phone_login_lookup, phone_login_attach_player, find_player_by_phone,
--     discover_player_by_contact, my_claimable_player, guard_player_write,
--     guard_guardian_fields, stamp_listing), so redefining it makes all of them
--     require the whole number. No RLS policy uses phone numbers.
--   • Stored numbers are backfilled to E.164: Indian forms (bare 10-digit,
--     0-prefixed, 91…, +91 …, 0091…) → '+91XXXXXXXXXX'; already-international
--     '+…' values lose their spaces/dashes. Anything else (bare 8–9 digit local
--     numbers, bare non-Indian international digits) is left UNTOUCHED and
--     listed in phone_review for a human to fix.
--
-- Idempotent: safe to run again (phone_key is replaced, canonical values are
-- skipped, review rows are de-duplicated). Doesn't touch any RLS policy.
-- Run as the table owner (SQL editor). Client triggers skip non-client sessions.

-- ---------- 1. The identity key -------------------------------------------------
create or replace function phone_key(p text)
  returns text language plpgsql immutable as $$
declare
  s text := btrim(coalesce(p, ''));
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if s like '+%' then
    null;                                        -- international already
  elsif s like '00%' then
    d := substr(d, 3);                           -- 00 = international dialling prefix
  else
    d := regexp_replace(d, '^0+', '');           -- trunk zeros of a local number
    if length(d) = 10 then
      d := '91' || d;                            -- pre-E.164 rows: always an Indian mobile
    elsif length(d) < 11 then
      return null;                               -- a local number with no country
    end if;
  end if;
  if length(d) < 8 or length(d) > 15 or d like '0%' then return null; end if;
  return '+' || d;
end $$;

-- ---------- 2. Numbers that need a human ---------------------------------------
create table if not exists phone_review (
  table_name  text not null,
  row_id      text not null,
  field       text not null,
  value       text,
  reason      text not null,
  flagged_at  timestamptz not null default now(),
  primary key (table_name, row_id, field)
);
alter table phone_review enable row level security;   -- no policies: staff/SQL only
revoke all on phone_review from anon, authenticated;

-- One stored value → its canonical E.164, or NULL when we can't be sure.
create or replace function phone_canonical_or_null(v text)
  returns text language plpgsql immutable as $$
declare
  s text := btrim(coalesce(v, ''));
  k text := phone_key(v);
begin
  if s = '' or k is null then return null; end if;
  if s like '+%' or s like '00%' then return k; end if;          -- explicit international
  if k ~ '^\+91[6-9][0-9]{9}$' then return k; end if;            -- Indian forms (bare 10, 0…, 91…)
  return null;                                                   -- bare foreign-looking digits
end $$;
revoke all on function phone_canonical_or_null(text) from public, anon, authenticated;

-- ---------- 3. Backfill ---------------------------------------------------------
do $$
declare
  t record;
  r record;
  canon text;
begin
  -- (table, id column, text column) for plain phone columns that exist here.
  for t in
    select * from (values
      ('players', 'phone'), ('profiles', 'phone'), ('listings', 'contact_phone'),
      ('clubs', 'contact_phone'), ('tournaments', 'organiser_phone'), ('organizations', 'phone')
    ) v(tbl, col)
    where exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = v.tbl and c.column_name = v.col)
  loop
    for r in execute format(
      'select id::text as id, %1$I as val from %2$I where %1$I is not null and btrim(%1$I) <> %3$L', t.col, t.tbl, '')
    loop
      canon := phone_canonical_or_null(r.val);
      if canon is null then
        insert into phone_review (table_name, row_id, field, value, reason)
          values (t.tbl, r.id, t.col, r.val,
                  case when phone_key(r.val) is null then 'no-country' else 'bare-international' end)
          on conflict (table_name, row_id, field) do update set value = excluded.value, reason = excluded.reason;
        continue;
      end if;
      if canon = r.val then
        delete from phone_review where table_name = t.tbl and row_id = r.id and field = t.col;
        continue;
      end if;
      begin
        execute format('update %I set %I = $1 where id::text = $2', t.tbl, t.col) using canon, r.id;
        delete from phone_review where table_name = t.tbl and row_id = r.id and field = t.col;
      exception when unique_violation then
        -- Two rows are the same person (e.g. '9876543210' and '+919876543210').
        insert into phone_review (table_name, row_id, field, value, reason)
          values (t.tbl, r.id, t.col, r.val, 'duplicate-of-' || canon)
          on conflict (table_name, row_id, field) do update set value = excluded.value, reason = excluded.reason;
      end;
    end loop;
  end loop;

  -- Guardian numbers inside jsonb (players.guardian, profiles.guardian).
  for t in
    select * from (values ('players'), ('profiles')) v(tbl)
    where exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = v.tbl and c.column_name = 'guardian')
  loop
    for r in execute format(
      'select id::text as id, guardian->>%1$L as val from %2$I where coalesce(btrim(guardian->>%1$L), %3$L) <> %3$L', 'phone', t.tbl, '')
    loop
      canon := phone_canonical_or_null(r.val);
      if canon is null then
        insert into phone_review (table_name, row_id, field, value, reason)
          values (t.tbl, r.id, 'guardian.phone', r.val,
                  case when phone_key(r.val) is null then 'no-country' else 'bare-international' end)
          on conflict (table_name, row_id, field) do update set value = excluded.value, reason = excluded.reason;
      elsif canon <> r.val then
        -- Same number (phone_key unchanged) ⇒ guardian.phoneVerified is kept.
        execute format('update %I set guardian = jsonb_set(guardian, %L, to_jsonb($1::text)) where id::text = $2', t.tbl, '{phone}')
          using canon, r.id;
        delete from phone_review where table_name = t.tbl and row_id = r.id and field = 'guardian.phone';
      else
        delete from phone_review where table_name = t.tbl and row_id = r.id and field = 'guardian.phone';
      end if;
    end loop;
  end loop;
end $$;

-- What's left for a human (also: select * from phone_review order by reason;).
-- Note: auth.users.phone (phone sign-ups) is already E.164 — Firebase-verified.
