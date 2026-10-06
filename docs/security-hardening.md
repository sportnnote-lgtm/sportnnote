# Security hardening (migration 0025) — deploy checklist

**Why this exists:** the Supabase anon key ships inside the APK and anyone can sign up, so
"any signed-in user" means "anyone on the internet". Before 0025, many tables let any
signed-in user write any row, and several edge functions could be called by anyone holding
the app. 0025 scopes every client write to the people who should be able to make it.

## What changed

| Area | Before | After |
|---|---|---|
| `profiles.role` | Sign-up metadata or a self-update could set `support`/`admin`, which opens every ID document and allows editing any player | Only staff (SQL editor / service role) can grant `support`/`admin` |
| Player verification | Owners could set `phone_verified`, `email_verified`, and `verification.status = approved` on their own row | Server-only (OTP functions) or reviewer-only. Changing a verified DOB or guardian voids the approval |
| Provisional players | Any user could edit or claim any unclaimed player | Only the creator can edit. Claiming needs a matching phone number or confirmed email |
| Orgs / membership | Anyone could insert themselves as Owner, edit any org, or rewrite rosters | Owner/Admin rules enforced row by row (BEFORE triggers). An org can never drop to zero Owners |
| Teams / clubs / squads | Anyone could rename or delete any team, or edit any roster, squad or lineup | Creator, captain/VC, claimed staff, club admin, or org Owner/Admin/Organizer. Match scorers may edit rosters only |
| Invites | Tokens `JOIN-1, JOIN-2…` were guessable and readable by all, and anyone could self-insert as team staff | Random server-minted tokens, rate-limited RPCs, captain/coach invites are single-use |
| Tournaments | Only `organizer_id` / `host_ids` could manage (org-hosted events were broken); anyone could add matches to any tournament | Org Owners/Admins/Organizers manage org-hosted events; matches only go into tournaments you manage; ownership moves via an atomic RPC that hands control over |
| Audit trails | Anyone could forge or delete `activity_log` / ownership events | Insert-only, with the actor stamped server-side |
| Disputes | Anyone could edit any dispute, or "object" on someone else's behalf | Objections only about yourself; each side confirms only for itself; status changes are organizer-only |
| Listings | The "verified contact" badge and author name were client-claimed | Both are computed server-side |
| `schools`, `venues` | Writable by anyone | Read-only to clients |
| Edge functions | `push-send`: any user could push any text to any player. `support-assistant`: open to anyone (API spend). `send-invite`: open email relay. `support-escalate` / `verification-submit`: unauthenticated. `notify-*`: callable by anyone | Sign-in required, rate limits, relationship check for push, server-composed invite email, link stripping, and shared secrets for the webhook and cron |

Verified offline: schema + all migrations load into a real Postgres (PGlite), and **102
attacker/legitimate-user scenarios pass** (privilege escalation, verification, claims,
org lifecycle, invites incl. single-use + rate limit, tournaments + transfer, entries,
audit stamping, disputes, squads, listings, push relationships, service-role bypass).
The migration is idempotent (re-run tested).

## Migration 0026 — private contact details + privacy settings

`supabase/migrations/20261007120000_private_contact_details.sql`. Performance stays public
for talent scouting: name, photo, sports, city, school/house, bio, stats and **age in
years**. These become private: **phone, email, date of birth, guardian contact, and the
verification document**.

**Who can see private details:**
- The person themselves, and SportnNote support.
- The creator of a provisional (not yet registered) player.
- For a provisional player's **phone only**: whoever runs a team that player is on (they
  need it to send the WhatsApp/SMS invite).
- Anyone, **if an adult chooses** "Show my mobile/email" on Edit Profile. Off by default;
  never possible for under-18s.

**How it works:**
- Clients can no longer read those columns of `players`/`profiles` at all. Writes are
  unchanged.
- The app reads players through `players_view`, which fills the private columns only for
  allowed viewers. For everyone else it returns the age, guardian present/verified flags
  and verification status, so eligibility checks keep working.
- Lookups that used to filter on phone/email now go through rate-limited RPCs that return
  only an id and name: `find_player_by_phone`, `find_player_by_email`,
  `my_claimable_player`, `my_profile_private`.

**Future migrations:** a new public column on `players` or `profiles` must be added to the
column grants in 0026 and to `players_view`, otherwise clients can't read it.

**Verified:** 27 privacy scenarios pass in PGlite, and the 102 security scenarios still
pass with 0026 applied. These include: direct and filtered reads refused, the view masks
per viewer, minors' opt-in ignored, provisional-invite access, lookup shape and rate
limit, the claim lookup, and sign-up/insert/write paths unaffected.

**Known gaps, not covered by 0026:**
- Guardian phone/email "verified" flags are set on the device (there's no server-side
  guardian OTP yet).
- Own-phone verification can't complete on live until WhatsApp OTP works: 0025 makes
  `phone_verified` server-only, and the on-screen fallback code no longer counts.

For minors, support's document approval is still a human gate.

## Migration 0027 — in-app messaging + guardian accounts

`supabase/migrations/20261008120000_messaging.sql` + edge functions `message-notify` and
`guardian-link`.

**The rules:**
- **Only adults (18+) can send.** Under-18 accounts can't message anyone.
- **A message about an under-18 goes to their parent/guardian**, never to the child. The
  child's account can't read those conversations.
- **A guardian gets an inbox by linking their own account.** From the child's profile,
  "📧 Email them a link code" sends a one-time code to the guardian email on file. The
  guardian signs in with their own account and enters it under Settings → "Link as a
  parent/guardian". This also marks the guardian email verified, server-side.
- **Until the guardian links,** each message is emailed to them with the code (max 3
  emails per child per day).
- **The sender only ever sees "Parent/guardian of <child>"**, never the guardian's name,
  email or account.
- **Abuse controls:** block (Conversation → "Block this person") and report (long-press a
  message). Limits: 10 new conversations and 100 messages per sender per day.
- **Writes only through server functions:** `send_message`, `reply_message`,
  `mark_thread_read`, `block_thread_sender`, `report_message`, `claim_guardian_link`.
  Participants can only read their own conversations; support can read everything, for
  reports.
- **Guardian fields are server-only.** The app can no longer set the guardian
  `emailVerified` / `phoneVerified` flags or the account link. Changing the guardian email
  drops the link.

**Moderation and safety:**
- **Report review (support):** Settings → Support tools → "🚩 Message reports". Each report
  keeps a snapshot of the reported text, plus the sender, reporter and how many reports
  that sender has. Support can **Dismiss**, **Remove message** (both sides then see
  "removed by SportnNote") or **Remove + turn off their messaging** (`messaging_bans`), and
  can turn messaging back on later. "View conversation" opens it read-only.
- **Unblock:** Messages → "🚫 Blocked" lists the people you've blocked, as you saw them.
  A blocked guardian only ever appears as "Parent/guardian of …". The block's underlying
  account id never reaches the app.
- **Live updates:** an open conversation subscribes to Supabase Realtime (`messages` is
  added to the `supabase_realtime` publication). Realtime applies the read policy, so only
  participants receive a conversation's rows.

**Guardian phone verification (server-side):**
- `send-contact-otp` / `verify-contact-otp` have a new `guardian_phone` channel. The code
  goes to the guardian's number on file over WhatsApp, and only the server sets
  `guardian.phoneVerified`.
- The guardian card's phone row uses it. The email row stays "verified by linking".
- **Delivery depends on WhatsApp OTP** (`docs/whatsapp-otp-setup.md`, currently blocked on
  Meta Business Verification). Until then the app says "Phone verification over WhatsApp is
  coming soon" instead of showing a fake code.
- The same applies to a player's own phone. Live mode no longer falls back to on-screen
  codes, which since 0025 the server ignored anyway.
- OTP codes now come from a cryptographic random source, and sending is capped at 5 per
  player per channel per hour.

**Verified:**
- 70 messaging scenarios pass in PGlite: routing, privacy, block/unblock with no account-id
  leak, report snapshot, the support queue (non-support refused), remove, ban, lift,
  realtime publication and the `guardian_phone` channel. The 27 privacy and 102 security
  scenarios also pass.
- `deno check` passes on all changed functions.
- UI clicked through in offline demo: adult and minor Message buttons, send, inbox,
  Edit Profile privacy card, and the Message reports screen.

## Rollout order (do these together with the next APK)

1. **Prerequisite migrations.** Make sure 0012–0024 are applied on live, in order. 0025
   depends on the clubs, org-membership, ownership, houses and officials tables.
2. **Run `20261006120000_security_hardening.sql`, then
   `20261007120000_private_contact_details.sql`, then `20261008120000_messaging.sql`,
   then `20261009120000_golf_field_events.sql`** (Golf) in the SQL editor. Old APKs can't
   read player lists once 0026 runs (they query the locked columns), so ship the APK at
   the same time.
3. **Secrets:**
   ```bash
   npx supabase secrets set WEBHOOK_SECRET=<long random string> --project-ref mpgbvbylmkwasjgupsbq
   ```
   Optional: `CRON_SECRET=<random>` if you'd rather not put the service-role key in the
   cron job.
4. **Deploy the changed functions.** `_shared/` is bundled automatically:
   ```bash
   for f in push-send support-assistant support-escalate send-invite verification-submit notify-followers notify-upcoming message-notify guardian-link send-contact-otp verify-contact-otp verify-phone-firebase; do npx supabase functions deploy $f --project-ref mpgbvbylmkwasjgupsbq; done
   ```
5. **Webhook / cron** (when you set up background push): add the HTTP header
   `x-webhook-secret: <WEBHOOK_SECRET>` to the `stat_lines` → `notify-followers` webhook.
   The `notify-upcoming` cron must send `Authorization: Bearer <SERVICE_ROLE_KEY>` (as in
   its header comment) or `x-cron-secret: <CRON_SECRET>`.
6. **Ship the new APK.** Older builds keep working for viewing and scoring, but these break
   on them once 0025 is live:
   - creating and redeeming team/club invites
   - non-admin org membership edits (leaving, accepting invites)
   - tournament ownership transfer

   Invite emails from old builds fall back to the mail composer.

## Things to know

- **Rows created before 0025 have no `created_by`.** A team that has no captain, club or org
  can then only be edited by its tournament's match scorers (roster only). The planned
  clean-slate wipe (`docs/seed-and-wipe.md`) makes this moot.
- **Claiming by phone trusts the profile's phone number** until WhatsApp OTP is live
  (see `docs/whatsapp-otp-setup.md`). Confirmed email is already a strong claim path.
- **Granting support access** (SQL editor):
  `update profiles set role = 'support' where handle = '<handle>';`
- **Rate limits:**

  | What | Limit |
  |---|---|
  | Invite lookups / claims | 30 per user per hour |
  | Push calls | 120 per user per hour |
  | AI help | 20 per user per hour |
  | Support cases | 5 per user per hour |
  | Invite emails | 20 per user per day |
  | Verification submissions | 10 per user per day |

  To tune them, edit the numbers in the RPCs / functions.
- **Still open** (tracked separately): in-app messaging (messages to under-18s go to
  their guardian); `report-invite` / `join` links are keyed by guessable player ids
  (signed links later).
