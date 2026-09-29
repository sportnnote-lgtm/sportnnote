# SportnNote — Continuity note (resume here)

Concise pointer for picking this project up on another machine. Full cross-project
handover: `~/Desktop/rudy/HANDOVER/PROJECT_CONTINUITY.md`. Full log: `DEVLOG.md`.

## Where we are now
- Branch **`feat/sport-formats-and-scoring`** — pushed to `hrudhaypv-byte/sportfolio`.
- Just shipped a large epic (all committed + demo-verified; clean `tsc`; 292 tests):
  - **Multi-sport Teams (“Clubs”)** — one team, many sports; per-sport captain/squad/roles;
    invite link + QR + in-app **QR scanner**; logo upload. Migrations **0018, 0019**.
  - **Individual / Org / Membership / Roles / Ownership / School (M1–M5):**
    Owner+Referee roles & invite/join-request lifecycle (**0020**); Personal⇄Org context
    switcher; tournament ownership creator+transfer+audit (**0021**); school **Houses**
    first-class + per-student House timeline + participation rules incl. inter-house
    (**0022, 0023**); per-tournament **scorer/referee assignment** + **activity audit** (**0024**).
- **Migrations 0018–0024 are RUN on live.**

## Data model notes
- Membership normalized into `org_members` (join table); `Organization.members` is
  re-assembled on read so `src/core/org.ts` helpers + the org console stay unchanged.
- Invariant enforced in `setOrgMembers`: an org always keeps ≥1 **Owner**.
- Houses = `Organization.houses` + per-student `HouseStint` timeline (mirrors grades).
- Ownership + activity audit trails snapshot display names (`tournament_ownership_events`,
  `activity_log`).

## What to do next
- **APK + QR:** EAS free build quota resets **Oct 1**. Build: `npx eas-cli build -p android --profile preview`, then share the artifact URL / QR. (versionCode is at 31 after failed pre-reset attempts — harmless.)
- Before go-live: set `TESTING_ALLOW_UNVERIFIED = false` (src/core/eligibility.ts).
- App is in **demo mode** locally (`.env.local` renamed to `.env.local.bak`). Restore live:
  `mv .env.local.bak .env.local`.
- Optional: wire `tournament_officials` into per-match scorer assignment; WhatsApp OTP
  blocked on a production WABA.

## Run it
- Demo (no backend): `npx expo start --web --port 8091`.
- Tests: `node --test tests/*.test.mts`.  Typecheck: `npx tsc --noEmit`.
- Secrets NOT in git (restore from backup): `~/keys/…firebase-adminsdk….json`, `.env.local.bak`.
  Live build env also lives in the EAS “preview” environment.
