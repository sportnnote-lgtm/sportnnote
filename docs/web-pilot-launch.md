# Web pilot launch — ordered checklist

Goal: friends (iPhone and Android) use **https://sportnnote.expo.app** in a browser
("Share → Add to Home Screen" on iPhone). Free (EAS Hosting). Live backend.

| # | Who | Step |
|---|---|---|
| 1 | You | ✅ `npx supabase login` done (2026-10-07). `WEBHOOK_SECRET` set. |
| 2 | You | ✅ Done 2026-10-07 (verified via the API). Supabase SQL editor: paste the whole of `supabase/release/2026-10-pilot-migrations-0012-0028.sql` → Run. One transaction (all-or-nothing); safe even if some of 0012–0024 already ran. |
| 3 | You | ✅ Done 2026-10-07. Supabase → Authentication → URL Configuration: **Site URL** `https://sportnnote.expo.app`; add it to **Redirect URLs** (email-confirmation links land there). |
| 4 | Me | ✅ Done 2026-10-07 — all 12 deployed; anonymous calls refused as designed. Deploy the 12 changed/new functions (list in `docs/security-hardening.md`), incl. `verify-phone-firebase`. |
| 5 | You | ✅ Web app registered 2026-10-07 (project `sportnnote-5c5e7`; `FIREBASE_PROJECT_ID` secret set; config in `.env.local.bak`). Firebase steps in `docs/firebase-phone-setup.md` (project, Blaze + budget alert, Phone provider, India-only SMS region, authorized domain, web config). |
| 6 | Me | ✅ Published 2026-10-07 (live mode, verified sign-in screen). ✅ Republished with Firebase SMS 2026-10-07. `scripts/publish-web.sh` → production at https://sportnnote.expo.app. Smoke test (sign-up, match, golf round, messaging) ✅ passed on iPhone 2026-10-07; phone SMS still to test after Firebase. |
| 7 | You | Share the link with the pilot group. |

Notes: the web app has no background push notifications or QR scanning; everything
else works. A preview build with **demo data only** was published to test hosting:
https://sportnnote--hfy8phv5cd.expo.app (can be deleted any time).

Note: `WEBHOOK_SECRET`'s value isn't retrievable. When the `notify-followers` database webhook is created, generate a new secret and set it in both the webhook header and `supabase secrets` together.
