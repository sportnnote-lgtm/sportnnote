# Moving to sportnnote.com — founder steps

Written 2026-10-11 (SD-151). The .com is not bought yet. The code is ready: every public
link reads its host from one place, and the defaults are today's `.in` hosts, so nothing
changes until you set the values below.

**Rule that never changes: `.in` stays forever.** QR codes are printed on posters and
noticeboards, invites sit in old chats, and `@phone.sportnnote.in` is part of every
phone-login account's internal email. Keep `sportnnote.in` registered (auto-renew, 10
years), keep its DNS on Cloudflare, and never change the placeholder email domain. Also
never change the app id `in.sportnnote.app` (it doesn't need to match the domain).

## Where the hosts live in the code

| What | Where | Setting (default) |
|---|---|---|
| App links, share text, invites, QR codes, install link, footers | `src/core/hosts.ts` | `EXPO_PUBLIC_SITE_URL` (`https://sportnnote.in`), `EXPO_PUBLIC_APP_URL` (`https://app.sportnnote.in`) |
| Deep links the app accepts | `src/core/hosts.ts` → `linkPrefixes()` (used by `RootNavigator`) | always `sportnnote://` + `sportnnote.in`, `www.` and `app.sportnnote.in`; plus the two above and `EXPO_PUBLIC_EXTRA_LINK_ORIGINS` (comma-separated) |
| Support email shown in the app | `src/core/hosts.ts` | `EXPO_PUBLIC_SUPPORT_EMAIL` (`sportnnote@gmail.com`) |
| Edge functions (join, report-invite, notify-upcoming, send-invite allow-list) | `supabase/functions/_shared/hosts.ts` | secrets `APP_URL`, `SITE_URL`, `EXTRA_LINK_ORIGINS` |
| Website canonical, sitemap, Open-app buttons, contact email | `website/config.json` | `siteUrl`, `appUrl`, `contactEmail` — or `SITE_URL`, `APP_URL`, `SUPPORT_EMAIL` in the build environment |

`EXPO_PUBLIC_*` values are baked in at build time. `scripts/publish-web.sh` reads them
from `.env.local` (or `.env.local.bak`); for an OTA update or an APK, set them in the
environment of `eas update` / `eas build` (or as EAS environment variables).

## Steps, in order

### 0. Now, before buying anything (ships the SD-151 code)
Deploy the functions that now read `_shared/hosts.ts`. This also fixes email invites:
until now `send-invite` only accepted `https://sportnnote.in/` links, so invite links to
`app.sportnnote.in/i/…` were refused and the app fell back to opening the mail app.
```
npx supabase functions deploy send-invite notify-upcoming support-assistant --project-ref mpgbvbylmkwasjgupsbq
npx supabase functions deploy join --no-verify-jwt --project-ref mpgbvbylmkwasjgupsbq
npx supabase functions deploy report-invite --no-verify-jwt --project-ref mpgbvbylmkwasjgupsbq
```
No secrets are needed: the defaults are today's hosts.

Do them top to bottom. Steps 1–8 add the .com **next to** the .in; nothing users see
changes until step 9.

### 1. Buy the domain and put it on Cloudflare
1. Buy `sportnnote.com` (any registrar; Cloudflare Registrar is at-cost).
2. Cloudflare → **Add a site** → `sportnnote.com` → Free plan. Change the nameservers at
   the registrar to the two Cloudflare gives you. Wait for "Active".
3. While you're there: set `sportnnote.in` to auto-renew for the longest term offered.

### 2. Serve the website on the .com
1. Cloudflare → Workers & Pages → Worker `sportnnote` → **Settings → Domains & Routes →
   Add custom domain**: `sportnnote.com`, then `www.sportnnote.com`.
2. Check `https://sportnnote.com/` and `https://sportnnote.com/delete-account/` load.
   Canonical tags still say `.in` for now; that flips in step 9.

### 3. Serve the web app on app.sportnnote.com (no redirect)
App Links need the app host to answer directly, not with a redirect, so don't copy the
`app.sportnnote.in` redirect rule.
1. **Preferred:** expo.dev → project `sportnnote` → **Hosting → Custom domains → Add**
   `app.sportnnote.com`, then add the DNS record it shows in Cloudflare (DNS only, grey
   cloud, unless Expo says otherwise). Custom domains may need a paid EAS plan (verify on
   the page).
2. **If that isn't available:** a small Cloudflare Worker on `app.sportnnote.com` that
   proxies every request to `https://sportnnote.expo.app` (same path and query). Ask for
   it and it can be written in a few lines.
3. **Keep `sportnnote.expo.app` serving the app.** iPhone Home Screen apps and web push
   subscriptions are tied to that address (sign-in is stored per address). Never redirect
   it, or those users get signed out and lose web push.

### 4. Sign-in and login settings
1. **Supabase** → Authentication → URL Configuration → **Redirect URLs**: add
   `https://app.sportnnote.com/**`. Keep `https://sportnnote.expo.app/**` and anything
   `.in` that's already there. Don't change the Site URL yet.
2. **Firebase** (project `sportnnote-5c5e7`) → Authentication → Settings → **Authorized
   domains** → Add `app.sportnnote.com`. Keep `sportnnote.expo.app`. Without this, SMS
   codes on the web fail on the new address (reCAPTCHA).

### 5. Email
1. **Receiving:** Cloudflare → `sportnnote.com` → **Email → Email Routing**: create
   `support@sportnnote.com` and `privacy@sportnnote.com`, both forwarding to today's
   inbox. Free, takes 5 minutes.
2. **Sending (optional):** Resend → **Domains → Add** `sportnnote.com` → add the SPF,
   DKIM and MX records it shows in Cloudflare (DNS only), then add a DMARC record
   (`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:privacy@sportnnote.com`). Wait for
   "Verified". Until you do this, keep sending from `no-reply@sportnnote.in`; it works.
3. If you moved sending: `supabase secrets set SUPPORT_FROM="SportnNote <no-reply@sportnnote.com>" INVITE_FROM="SportnNote <no-reply@sportnnote.com>" OTP_FROM="SportnNote <no-reply@sportnnote.com>"`.
4. `supabase secrets set SUPPORT_EMAIL=support@sportnnote.com VAPID_SUBJECT=mailto:support@sportnnote.com`
   (the VAPID subject is only a contact address; existing push subscriptions keep working).

### 6. Edge functions: accept .com links
1. `supabase secrets set EXTRA_LINK_ORIGINS=https://sportnnote.com,https://www.sportnnote.com,https://app.sportnnote.com`
2. Redeploy `send-invite` so it picks up the secret:
   `npx supabase functions deploy send-invite --project-ref mpgbvbylmkwasjgupsbq`

### 7. The app: accept .com deep links before anyone shares one
1. Add to `.env.local.bak` (and the EAS environment):
   `EXPO_PUBLIC_EXTRA_LINK_ORIGINS=https://sportnnote.com,https://www.sportnnote.com,https://app.sportnnote.com`
2. Publish the web app (`scripts/publish-web.sh`) and an OTA update. Share links still
   say `.in`; the app now also understands `.com` ones.

### 8. Check, before flipping
- `https://app.sportnnote.com/m/<a real match id>` opens the match.
- Sign in with email and with phone on `app.sportnnote.com`.
- An email invite from the app arrives (send-invite accepts the link).
- `https://sportnnote.in/...` and `https://app.sportnnote.in/...` still work.

### 9. Flip the defaults to .com
1. `.env.local.bak` (and EAS environment):
   `EXPO_PUBLIC_SITE_URL=https://sportnnote.com`,
   `EXPO_PUBLIC_APP_URL=https://app.sportnnote.com`,
   `EXPO_PUBLIC_SUPPORT_EMAIL=support@sportnnote.com`.
   Publish the web app and an OTA update. New share links, invites and QR codes now say `.com`.
2. `supabase secrets set APP_URL=https://app.sportnnote.com SITE_URL=https://sportnnote.com`
   and redeploy `send-invite` and `notify-upcoming`, then `join` and `report-invite`
   (each with `--no-verify-jwt`).
3. `website/config.json`: `siteUrl` → `https://sportnnote.com`, `appUrl` →
   `https://app.sportnnote.com`, `contactEmail` → `support@sportnnote.com`. Commit and
   push; the site rebuilds with .com canonicals and sitemap.
4. Supabase → URL Configuration → **Site URL** → `https://app.sportnnote.com` (keep the
   old addresses in Redirect URLs).
5. `src/data/legal.ts` contact address (owned by the legal work) → the new mailbox, with a
   legal-version bump if the text changes.

### 10. Redirect .in to .com (path kept) — only after step 9 is live
Cloudflare → `sportnnote.in` → **Rules → Redirect Rules**:
1. `sportnnote.in` and `www.sportnnote.in`: dynamic 301 to
   `concat("https://sportnnote.com", http.request.uri.path)`, query string kept, **except**
   when the path starts with `/.well-known/` (App Links files must answer 200 on both
   domains).
2. `app.sportnnote.in`: change today's rule (301 to `sportnnote.expo.app`) to a 301 to
   `concat("https://app.sportnnote.com", http.request.uri.path)`, query kept, with the
   same `/.well-known/` exception. Printed QR codes keep working.
3. Never delete the `.in` DNS zone or the email records (`send`, `resend._domainkey`,
   `_dmarc`) — invites from `no-reply@sportnnote.in` may still be sending.

### 11. Search Console
1. Add `sportnnote.com` as a **Domain property** (DNS TXT record in Cloudflare).
2. Submit `https://sportnnote.com/sitemap.xml`.
3. On the `sportnnote.in` property: **Settings → Change of address** → `sportnnote.com`.
   It only works once the 301s from step 10 are live.

### 12. Later: one-tap App Links (needs the Play app signing key)
Native change, so it ships in a new APK/AAB, not an OTA.
1. Play Console → App integrity → copy the **app signing** SHA-256 (and the upload key's).
2. Serve `/.well-known/assetlinks.json` for `in.sportnnote.app` with both fingerprints on
   **both** `app.sportnnote.com` and `app.sportnnote.in` (answering 200, not redirected).
3. `app.json` → `android.intentFilters` with `autoVerify: true` for those two hosts and the
   paths `/m`, `/t`, `/g`, `/r`, `/p`, `/i`, `/join`, `/join-club`, `/join-tournament`.
4. iPhone (once the Apple account exists): `apple-app-site-association` on the same hosts
   and `ios.associatedDomains`.

## What you must never do
- Let `sportnnote.in` expire, or redirect `/.well-known/` on it.
- Change `@phone.sportnnote.in` (phone-login placeholder emails; it's an identity key).
- Change the app id `in.sportnnote.app`.
- Redirect or switch off `sportnnote.expo.app` (Home Screen installs and web push).
