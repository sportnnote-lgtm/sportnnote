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

## Rollout order (do these together with the next APK)

1. **Prerequisite migrations.** Make sure 0012–0024 are applied on live, in order. 0025
   depends on the clubs, org-membership, ownership, houses and officials tables.
2. **Run `supabase/migrations/20261006120000_security_hardening.sql`** in the SQL editor.
3. **Secrets:**
   ```bash
   npx supabase secrets set WEBHOOK_SECRET=<long random string> --project-ref mpgbvbylmkwasjgupsbq
   ```
   Optional: `CRON_SECRET=<random>` if you'd rather not put the service-role key in the
   cron job.
4. **Deploy the changed functions.** `_shared/` is bundled automatically:
   ```bash
   for f in push-send support-assistant support-escalate send-invite verification-submit notify-followers notify-upcoming; do npx supabase functions deploy $f --project-ref mpgbvbylmkwasjgupsbq; done
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
- **Still open** (tracked separately): personal-data columns are still publicly readable
  (section 1 of the security review: private table + privacy settings, default hidden);
  `report-invite` / `join` links are keyed by guessable player ids (signed links later).
