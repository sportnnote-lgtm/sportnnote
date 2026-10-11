# International audit — Distribution

Area: app distribution and store readiness, web app / PWA, moving the domain to .com, website copy, support, performance from far regions, accessibility, and readiness for a future fee.
Audited 2026-10-11, read-only. Nothing was run against live and no other file was edited.
Markets in order: Gulf (UAE, Qatar), then UK, then Singapore/Malaysia (SG-MY), then Australia (AU), then US.
"verify" means the point could not be confirmed from the repo, or depends on an outside policy that may have changed.

## Where things stand today

- **Android:** a sideloaded APK only. The link is `website/config.json:4`, an `expo.dev/artifacts/...apk` URL, and `scripts/build-website.mjs:366-368` tells users to allow "Install unknown apps". There is no Play listing.
- **iPhone:** the web app only, installed with Add to Home Screen (`build-website.mjs:450`, `src/components/OpenInAppBanner.tsx:22-27`). There is no App Store build and no Apple account.
- **Web app:** published to EAS Hosting at `sportnnote.expo.app` (`scripts/publish-web.sh:2`). `app.sportnnote.in` is a Cloudflare 301 redirect to it (`docs/website.md:9-10`).
- **Website:** the static site `sportnnote.in`, served by Cloudflare Workers (`docs/website.md:4-8`).
- **Identifiers:** the app id is `in.sportnnote.app` on both iOS and Android (`app.json:11,22`), and the EAS owner is `sportnnote.in` (`app.json:79`).
- **EAS build profiles** (`eas.json`):
  - `preview` builds an APK.
  - `production` builds an AAB, which is what Play needs.
  - `submit.production` is empty: there is no Play service account and no Apple app id (ascAppId).

## 1. Gap table

P0 means it blocks or breaks use for users outside India, or creates legal or store-rejection exposure. P1 means a real school or organiser abroad will hit it soon. P2 is polish. The "Acct" column says whether the fix depends on company or store accounts, or on buying the .com domain.

| # | Pri | Gap | Evidence | Markets | Fix | Size | Acct |
|---|---|---|---|---|---|---|---|
| D1 | P0 | Android outside India is sideload-only. Schools abroad will not let staff turn on "Install unknown apps" on managed or BYOD phones. Google's developer-verification rule for sideloaded apps starts in Singapore (and Brazil, Indonesia, Thailand) from Sept 2026 and goes global in 2027, so an unverified APK may be blocked on certified devices (verify the current dates). | `website/config.json:4`; `build-website.mjs:366-368` | all; **SG now** | Publish to Play: production AAB, Play listing, and a verified developer identity. Keep the APK link only as a fallback. | M | yes |
| D2 | P0 | No App Store app. UK, AU and US schools buy software that is in the App Store. A Home-Screen web app is weaker: web push needs iOS 16.4+, and there is no store trust. | `build-website.mjs:448-452`; `PROGRESS.md:160` ("iPhone stays on the web app") | UK/AU/US (Gulf: P1) | Apple Developer account in the company's name. EAS iOS build, TestFlight, then App Store. | L | yes |
| D3 | P0 | Play requires a public **account-deletion URL**, and none exists. The app has in-app delete (Settings → Delete my account) and the privacy policy mentions it, but there is no standalone web page explaining how to request deletion without the app. | `src/data/legal.ts:85`; no `/delete-account/` in `website/dist` | all (Play) | Add `website` page `/delete-account/` with the steps, the email address, and what is kept (results show as "Deleted player"). | S | no |
| D4 | P0 | The store age-audience decision has not been made. Accounts are allowed at any age under 18 with guardian consent, and there is no minimum age (`legal.ts:107`, `src/core/age.ts`). On Play, a target audience that includes children under 13 triggers the **Families policy**: every SDK must be Families-compliant (Firebase Auth and Expo notifications: verify against Google's list), plus a neutral age screen and Teacher Approved rules. On Apple, the **Kids category** forbids third-party analytics and links out without a parental gate. | `legal.ts:58-62`; `app.json` plugins | all, especially UK (AADC) and US (COPPA) | Decide: list as a general **Sports** app with a "Mixed audience (includes children)" target on Play, and **do not** opt into Apple's Kids category. Answers are in section 1b. | S (decision) | yes |
| D5 | P0 | Website and legal copy says the product is India-only. Examples: "Free during our **Hyderabad** pilot", "Made in Hyderabad", "We're working closely with our first organisers in Hyderabad", the DPDP-only privacy policy, "Data Protection Board of India", and "Courts in Hyderabad". | `build-website.mjs:375,379,382,459,85`; `website/config.json:6`; `legal.ts:19,72,88,149` | all | Rewrite the hero, footer and contact lines to be market-neutral ("Built in India, used worldwide"). The legal rewrite belongs to the compliance area. | S | no (legal: yes, needs the entity) |
| D6 | P0 | The pricing line is inconsistent, and on the website it is wrong. The site says "Free", "No credit card", and "Free during our Hyderabad pilot" with no hint of a future fee. The Terms say "free during the pilot". Marketing has standardised on "free while we're new; a small fee later, announced well in advance (30 days' notice)". UK CMA, ACCC (AU) and FTC (US) "free" rules make an unqualified "Free" risky once a fee is planned. | `build-website.mjs:374,375,381,429,447`; `legal.ts:111`; `docs/marketing/README.md:34` | UK/AU/US (all) | Use the marketing line everywhere: hero, Get-the-app, guide CTA ("Free on iPhone, Android and desktop", `build-website.mjs:347`) and Terms. | S | no |
| D7 | P1 | There is no published **support address or support hours**. The only contact is `sportnnote@gmail.com` (`website/config.json:5`, `legal.ts:15`), and a Gmail address reads as unofficial to UK and US schools. The only response time stated is "We reply within 7 days" (`legal.ts:90`), and no timezone is given. | as cited | all | Create `support@` and `privacy@` on the brand domain. State the hours with timezones, for example "Sun–Thu Gulf hours, Mon–Fri UK hours", plus first-response targets. | S | .com/domain mail |
| D8 | P1 | The **grievance officer** has no standalone page and is only a Gmail address (`legal.ts:92-94`). Indian IT Rules still need it, so keep it, but UK and Gulf readers also expect a named controller and address, a UK representative (Art 27), and a DPO contact. | `legal.ts:92-94` | India (keep), UK, Gulf | Add a `/contact/` page: company name, address, grievance officer (India), privacy contact, UK representative once one is appointed. | S | yes (entity, address) |
| D9 | P1 | **Hard-coded .in URLs in the app.** Without a host switch, a .com move ships mixed links. List: `SHARE_BASE='https://app.sportnnote.in'` (`src/core/shareText.ts:8`); `APP_INSTALL_URL` (`src/core/invite.ts:9`); `INSTALL_PAGE_URL` (`src/core/inviteText.ts:114`); the "sportnnote.in" footer text (`src/core/fixturesText.ts:71`, `shareText.ts:81`); the fallback link (`LiveScoringScreen.tsx:699`); the copy "sportnnote.in/join/CODE" (`SquadScreen.tsx:280`, `JoinTeamScreen.tsx:77`); and "Download it from sportnnote.in" (`InviteScreen.tsx:88`). | as cited | all | Move to one `src/core/hosts.ts` (`SITE_URL`, `APP_URL`, `INSTALL_URL`) read from `EXPO_PUBLIC_*`, and switch to .com in a single OTA. | S | .com purchase |
| D10 | P1 | **Hard-coded .in URLs in edge functions.** `APP_URL` falls back to `app.sportnnote.in` in `join/index.ts:22` and `report-invite/index.ts:21`, and is fixed (no env var) in `notify-upcoming/index.ts:66`. The `send-invite` allow-list `LINK_PREFIXES` holds only `https://sportnnote.in/` (`send-invite/index.ts:34`). That list already misses `https://app.sportnnote.in/` (verify whether app links pass through it), and **every .com link would be rejected**. | as cited | all | Read `APP_URL` from env everywhere. Make `LINK_PREFIXES` a list built from env that covers `.in`, `app.*.in`, `.com` and `app.*.com`. | S | .com |
| D11 | P1 | Deep-link prefixes are only `sportnnote://` and `https://sportnnote.in`. `app.sportnnote.in` (where `SHARE_BASE` points) is missing, and so is .com. | `src/navigation/RootNavigator.tsx:149` | all | Add `https://app.sportnnote.in`, `https://sportnnote.com` and `https://app.sportnnote.com`. Keep .in in the list for good. | S | no (the .com entries need the domain) |
| D12 | P1 | One-tap Android App Links are not set up (SD-108 founder steps 1–6 are not done). `app.sportnnote.in` 301s to `expo.app`, so it cannot serve `assetlinks.json`. There are no `intentFilters` and no release SHA-256. iOS universal links would also need `associatedDomains` and an AASA file. | `docs/sport-depth/PROGRESS.md:160`; `app.json` has no `intentFilters` | all | Plan: (1) serve the web app on `app.sportnnote.com` directly, not by redirect. EAS Hosting custom domains need a paid plan (verify). (2) Serve `/.well-known/assetlinks.json` for `in.sportnnote.app` with **both** the upload and the **Play App Signing** SHA-256. (3) Add `intentFilters` `autoVerify` for `/join-club`, `/join-tournament`, `/m`, `/t`, `/i`. (4) Serve the AASA file and add `ios.associatedDomains` once there is an App Store app. (5) Point `SHARE_BASE` at the .com host. Keep `.in` App Links verified as well, so printed QR codes still open the app. | M | yes (Play signing key, Apple team id, .com) |
| D13 | P1 | **Printed and shared artefacts are permanent.** QR codes on posters and noticeboards, WhatsApp invites and match links all encode `app.sportnnote.in/...` and `sportnnote.in/join/...`. The phone-login placeholder emails `@phone.sportnnote.in` are part of the identity key (`phone-login/index.ts:101`, `migrations/20261016120000_phone_login.sql:29`). | as cited | all | **Never retire .in.** Auto-renew it for 10 years. Redirect `sportnnote.in/*` to `sportnnote.com/*` with a path-preserving 301 only **after** App Links are verified on both domains. Never change the placeholder email domain. | S | .com |
| D14 | P1 | SEO when .com goes live. Canonical and `og:url` come from `cfg.siteUrl` (`build-website.mjs:51-65`), as do `sitemap.xml` and `robots.txt` (`:500-506`), so they flip cleanly. There is no `hreflang` today, and none is needed because the site is English only. The risk is duplicate content if both domains serve pages. | `build-website.mjs:59,65,500` | all | Set `siteUrl` to .com. 301 every .in path to .com (keep a rule for `app.`). Use Search Console change-of-address. Do not add hreflang unless regional English pages exist. If they do, use `en-IN`/`en-GB`/`en-AE`/`en-US` plus `x-default`. | S | .com |
| D15 | P1 | **Auth and web config tied to the host:** Supabase Site URL and Redirect URLs (`docs/web-pilot-launch.md:10`), Firebase phone-auth **authorized domains** (reCAPTCHA on web), Resend sending domain `no-reply@sportnnote.in`, `VAPID_SUBJECT` (`_shared/webpush.ts:12`), and `SUPPORT_FROM` / `OTP_FROM` defaults that fall back to `onboarding@resend.dev` (`support-escalate/index.ts:38`, `send-invite/index.ts:28`, `send-contact-otp/index.ts:36`, `weekly-report/index.ts:24`). | as cited | all | Checklist for the .com switch: add the .com origins to Supabase and Firebase, verify a .com sending domain (SPF/DKIM/DMARC) or keep sending from .in, and replace the `resend.dev` fallbacks with the brand sender. | S | .com |
| D16 | P1 | The support KB and AI prompt are India-defaulted, and they have no answers for the questions people abroad will ask: how to install outside India, whether it is free or will cost money, which phone numbers and countries work, whether I get SMS codes abroad, the timezone default. KB says "default India / IST" (`supportKB.ts:240-241`, `supportGuides.ts:184`) and invites go via WhatsApp (`supportGuides.ts:149`). The `support-assistant` SYSTEM prompt does not state the user's country or timezone, so answers inherit the KB's India bias. | `supabase/functions/support-assistant/index.ts:39-46` | all | Add KB articles: install by store or web, pricing line, supported countries and phone formats, timezone. Pass the user's country and time zone into the assistant context. Re-word "WhatsApp" to "WhatsApp, SMS or any app". | S | no |
| D17 | P1 | The **guides** are written for India. README rule: "Write for a … scorer in India" (`website/guides/README.md:68`). Examples: "the Indian way: 05/03/2012 is 5 March" (`manage-meet-entries.md:40`), "English (India)" (`score-by-voice.md:49`), "Indian Golf Union" (`golf-handicaps-and-match-play.md:11`), "Indian opens" (`category-prizes-and-divisions.md:35`), and School "house" terminology (`house-event-results.md`, works in UK/AU). | as cited | US (dates), all | Change the README audience to "a PE teacher, coach or volunteer scorer anywhere". Give dates as "day first (UK/India); US users …" once locale parsing exists. Say "your national golf union (e.g. …)". | S | no |
| D18 | P1 | **Data and latency from far regions.** There is one database, Supabase ap-south-1 (Mumbai). Round trips are roughly: Gulf 30–50 ms, SG 60–80, UK 120–150, AU 150–180, US 220–280 (verify with real probes). Scoring is optimistic with a durable outbox (`src/data/useLiveMatch.ts:251,276,379`), so scorers do not wait. Followers see realtime with about +RTT delay (`useLiveMatch.ts:263`), which is fine. Pain points: (a) cold screen loads that make several sequential REST calls (US about 1 s+), (b) edge functions that run near the user but then query Mumbai over several round trips, (c) Storage photos and logos served from Mumbai with no CDN caching (verify the Smart CDN plan). | as cited | UK/AU/US | Pin edge functions to ap-south-1 (`x-region` header or invoke option). Use the Storage CDN / image transforms with long `Cache-Control`. Batch first-load queries into RPCs. Add RTT to analytics per country. OTA (Expo CDN) and the web (EAS Hosting / Cloudflare) are already global. | M | no (Supabase plan: maybe) |
| D19 | P1 | **US public-school procurement accessibility.** The ADA Title II rule (2024) requires WCAG 2.1 AA for web content and apps used by state and local entities, public schools included: Apr 2026 for large entities, Apr 2027 for small. Districts ask for a **VPAT/ACR**. Section 508 matters for federal-funded procurement, and UK PSBAR applies to public bodies' services (verify how far it reaches vendors). The EU Accessibility Act is not a target market and the micro-enterprise exemption applies. | n/a | US (P0 at sale time), UK, AU | Run a WCAG 2.1 AA pass on the core flows (D20–D23), then publish an Accessibility Statement and a VPAT 2.5 (WCAG edition). | M | no |
| D20 | P1 | **Contrast failures** on core scoring screens. White on `danger #FF5C5C` measures **2.82:1** and is used on 11 px badges: "LIVE" scorer pill (`LiveScoringScreen.tsx:2681-2683`), dispute count (`:2723-2724`), "UNDER REVIEW" (`:2560`). White on `primaryDark` measures 2.81:1 if that pair is used (verify). The main Button is fine: dark `#06120D` text on colour (`src/components/ui.tsx:113`), and `textMuted` on surface is 6.85:1. | `src/core/theme.ts:11-16` | all (US/UK procurement) | Use dark text on danger pills, or darken `danger` for fills (about `#C62828` gives ≥4.5:1 with white). | S | no |
| D21 | P1 | **Screen-reader labels are thin** on sport scoring pads. Many controls go through the labelled `Button` (`ui.tsx:119-121`), but icon and number pads do not: `cricket/OverEditor.tsx` has 37 `onPress` and 1 `accessibilityLabel`; `sports/PointButtons.tsx` has 11 and 2; `cricket/WagonWheel.tsx` has no role; `football/Pitch.tsx` has none. There are only 14 live-region or announce calls in the whole app, so score changes are not announced. | grep counts | all | Label every scoring pad control ("Add 4 runs", "Point to Home"). Add `accessibilityLiveRegion="polite"` on the score line. Offer a list alternative to the wagon wheel. | M | no |
| D22 | P2 | **Text scaling.** No `allowFontScaling={false}` anywhere (good), but sizes are fixed px (`theme.ts:22-29`, tiny = 11). Fixed-height pills and score boards may clip at 200% (verify on device). The web uses px, so browser zoom works but the browser text-size setting does not. | `theme.ts:22-29` | all | Test at 200% (iOS Larger Text, Android font scale 2.0). Use `minHeight` instead of `height`. Raise `tiny` to 12. | S | no |
| D23 | P2 | **Keyboard focus on the web app.** The website has `:focus-visible` (`website/styles.css:21`). The RN-web app has no focus styling (verify tab order and visible focus on Live Scoring). The website has no skip link. | `styles.css:21`; `ui.tsx` | US/UK | Add a focus ring to `Button`/`Chip` on web, and a "Skip to content" link on the site. | S | no |
| D24 | P1 | **Speech recognition is India-first:** `['en-IN','en-US']` (`src/core/speechSetup.native.ts:23`, `speechNative.ts:72`), web `en-US` (`speech.ts:87`). UK and AU accents work best with `en-GB` / `en-AU`. | as cited | UK/AU/SG-MY/Gulf | Choose the speech locale from the device locale (en-GB, en-AU, en-SG, en-AE), falling back to en-US. | S | no |
| D25 | P2 | Server-sent reminders format dates with `en-IN` and default to `Asia/Kolkata` (`notify-upcoming/index.ts:218,261-262`). The app default is `DEFAULT_TIME_ZONE='Asia/Kolkata'` (`src/core/time.ts:38`). This is the locale area's job; it is noted here only because it shows up in pushes and emails. | as cited | all | Default the time zone from the device at sign-up. Format pushes with `en-GB`/`en-US` per profile. | S | no |
| D26 | P2 | Missing or unchecked native config for store review. `expo-image-picker` is installed but not in `plugins`, so the iOS photo-library usage string may be the generic default (verify; Apple rejects vague strings). No `ios.config.usesNonExemptEncryption:false`, so every TestFlight build asks about export compliance. No `expo-splash-screen` config (`assets/splash-icon.png` exists). Privacy manifest: Expo SDK 56 ships one for its modules, but `react-native-share` and `firebase` are unchecked (verify). | `app.json`; `package.json` | all (stores) | Add the image-picker plugin with explicit strings, set `usesNonExemptEncryption:false`, configure the splash, and audit `PrivacyInfo.xcprivacy` output. | S | no |
| D27 | P2 | Keep the identifiers `in.sportnnote.app` (`app.json:11,22`). The package and bundle id **cannot change** after a Play or App Store listing. Changing now would make the sideloaded APK and the Play app two different apps, and FCM `google-services.json` is tied to the package. The id does not need to match the .com domain. | as cited | all | Decision: **keep**. Note it in the DEVLOG so nobody "fixes" it after the .com move. | S | no |
| D28 | P2 | The `expo.dev/artifacts` APK link is an EAS build artifact. Retention depends on the plan, so it may expire (verify), and the URL changes with every APK. | `website/config.json:4` | all | Host the APK at a stable `sportnnote.com/android.apk` (Cloudflare R2/asset) until Play is live. | S | no |
| D29 | P2 | Hero sample data is Hyderabad-specific ("Banjara Hills XI", "Gachibowli Strikers") and `og:image` is the bare icon (`build-website.mjs:65-66,388`). | as cited | all | Use neutral or mixed names. Make a 1200×630 OG card. | S | no |
| D30 | P1 | **Future fee, store billing rules.** A digital subscription sold inside the app must use Apple IAP (15% small-business rate) or Google Play Billing (15% on subscriptions). | none built (no `stripe`/`razorpay`/currency code found) | all | Design notes are in section 1c. Nothing to build now. | — | yes |

**Counts:** P0 = 6 (D1–D6). P1 = 16 (D7–D21, D24, D30). P2 = 7 (D22, D23, D25–D29).

### 1b. Store answers we would give

All of these are store-dependent and are filled in once the accounts exist. They are based on `src/data/legal.ts:21-31,64-72` and `app.json`.

**Google Play — Data safety**

- **Collected:**
  - Name, email, phone number, and other personal info (date of birth, gender if given, city if given).
  - Photos: profile and logo uploads, and age/ID proofs.
  - In-app messages.
  - Contacts: one contact the user picks, for that number only. Verify whether this counts as "Contacts" or user-entered "Phone number" (it is safer to declare it).
  - App interactions (analytics).
  - Crash logs and diagnostics.
  - Device or other IDs (push token).
- **Purposes:** App functionality, Account management, Analytics, Developer communications (reminders). Not Advertising.
- **Shared:** No. Supabase, Expo, Firebase, Resend and Meta are service providers, which Play treats as "not shared".
- **Audio:** not collected. Recognition runs in the OS speech service and only text is used (`app.json:15`). Note in the listing that Google's service may process the audio.
- **Location:** not collected. City is free text.
- **Encrypted in transit:** Yes.
- **Deletion:** Yes, in the app plus a web URL (D3).
- **Content rating (IARC):** "Users can interact" (messaging), "Shares info" (public profiles and stats), no gambling or violence. Expected around Everyone / PEGI 3 with interactive elements (verify).
- **Target audience:** Mixed, including under-13. This triggers the Families policy (D4): a neutral age gate (DOB at sign-up, already there), no ads, and Families-compliant SDKs (verify Firebase Auth and expo-notifications).
- **"Designed for Families" opt-in:** No.
- **Permissions to justify:** `READ_CONTACTS`, `RECORD_AUDIO`, `CAMERA` (QR scan), `POST_NOTIFICATIONS`.

**Apple — App Privacy labels**

- **Data Linked to You:** Contact Info (name, email, phone), User Content (photos, messages, other content such as scores), Identifiers (user ID), Sensitive Info (ID proofs: verify the category; "Other Data" may fit better).
- **Data Not Linked to You:** Usage Data and Diagnostics. Under-18 analytics are anonymous (`legal.ts:61`). Adult analytics are linked to the user id, so declare them as linked (verify).
- **Tracking:** None.
- **Category:** Sports, not Kids.
- **Age rating** (2025 questionnaire with 13+/16+/18+ tiers): unrestricted user-to-user messaging pushes the rating up. With guardian-routed messaging for minors plus block and report, expect around 9+ or 13+ (verify against the live questionnaire).
- **Review notes:** a demo account; explain the guardian consent flow.
- **Sign in with Apple:** required only if third-party social login is added. Today it is email or phone, so not required.

### 1c. Payments readiness: design notes only

- **Who pays:** sell to **organisations** (school, club or tournament host) on the web, not per user in the app.
  - Apple 3.1.3(b) multiplatform and Play allow using a subscription bought elsewhere, provided the app has no purchase UI and no "buy on our site" link outside the US storefront. The US storefront now allows link-outs after the Epic ruling (verify the current state).
  - If an individual "Pro" tier is ever sold in the app, it must use Apple IAP and Play Billing at 15%. Plan pricing around that.
- **Processors:**
  - Razorpay for INR (UPI and cards; GST invoices).
  - Stripe for international: available to merchants in UAE, SG, MY, UK, AU and US. **Qatar is not a Stripe merchant country**, but Qatari cards can pay.
  - The company's country decides which Stripe account is possible. Stripe India limits cross-border payments (verify).
  - Alternative: Paddle or Lemon Squeezy as **merchant of record**, which takes on foreign VAT/GST collection.
- **Multi-currency:** store prices as `{amount_minor, currency}` and never assume ₹. Present local prices in AED, QAR, GBP, SGD, MYR, AUD and USD (the code has no currency assumption today, so this is greenfield). Invoices go to schools as a PO plus bank transfer, so support "invoice" billing.
- **Tax** (verify thresholds with an accountant):
  - India: GST 18%. Exports are zero-rated under an LUT.
  - UAE: VAT 5%. B2B reverse charge; register for B2C.
  - Qatar: no VAT yet.
  - UK: VAT 20%. B2B reverse charge; B2C requires registration from the first sale.
  - Singapore: GST 9% via OVR on B2C above the thresholds.
  - Malaysia: SST on digital services (verify the current rate) above RM500k.
  - Australia: GST 10% on B2C above A$75k.
  - US: state sales tax on SaaS varies, with economic nexus; public schools are usually exempt (collect certificates).
  - A merchant of record, or Stripe Tax, removes most of this.
- **Copy:** use "free while we're new" (D6) and give 30 days' notice before any charge (Terms `legal.ts:111` already promises notice). For UK/EU B2C subscriptions, auto-renew disclosure and easy cancellation are needed (UK DMCC Act subscription rules, 2026: verify the dates).

## 2. Can do now vs needs company / store accounts / .com

**Can do now** (no accounts, no domain):
- D3 account-deletion page.
- D5 market-neutral website copy (not the legal text).
- D6 a single pricing line everywhere.
- D9–D11 a host-config module, env-driven `APP_URL`, `LINK_PREFIXES` built from env, and the missing `app.sportnnote.in` prefix. All of this is ready to flip.
- D16 KB articles and the assistant context.
- D17 guide wording and README audience.
- D18 edge-function region pinning, batched loads, Storage cache headers.
- D20 contrast.
- D21 scoring-pad labels and live regions.
- D22 and D23 text scaling and focus.
- D24 speech locale.
- D25 time-zone default from the device.
- D26 app.json native config.
- D27 record the decision to keep the identifiers.
- D28 a stable APK URL.
- D29 the OG card.
- Draft the answers in section 1b now so submission is a paste.

**Needs the company or store accounts:**
- D1 Play listing and developer verification.
- D2 Apple Developer account and App Store.
- D4 store audience settings.
- D7 support mailboxes on a company domain.
- D8 legal entity, address and UK representative.
- D12 Play App Signing SHA-256 and Apple team id for App Links and universal links.
- D30 payment and merchant accounts, tax registrations.
- `eas.json` `submit.production` credentials.

**Needs the .com purchase:**
- D9–D11 flipping the env values.
- D12 host for `assetlinks.json` and AASA.
- D13 the redirect plan; the .in renewal can be done now.
- D14 canonical, sitemap and Search Console.
- D15 Supabase and Firebase origins, Resend domain, VAPID subject.

**Order for the .com move:**
1. Buy .com, put it on Cloudflare, and keep .in for good.
2. Serve the site and the app on .com directly, without a redirect.
3. Add the .com origins to Supabase, Firebase and Resend.
4. Update `assetlinks.json` and AASA on **both** domains.
5. Ship an OTA or APK with both hosts in the linking prefixes and `LINK_PREFIXES`.
6. Flip `SHARE_BASE`, `siteUrl` and `APP_URL` to .com.
7. 301 every .in path to the same .com path (the App Links file stays served with a 200, no redirect).
8. Search Console change of address.

## 3. Top 5 for distribution

1. **Get on Google Play** (production AAB, mixed-audience Families settings, data-safety answers from 1b, developer verification). Sideloading will not pass a school abroad, and Singapore enforcement has started (D1, D4).
2. **App Store presence for UK, AU and US** through an Apple Developer account in the company's name. Prepare the privacy labels, age rating and native config (D26) now (D2).
3. **Domain-agnostic hosts before buying .com.** Add one host module plus env-driven edge functions, fix `LINK_PREFIXES` and the deep-link prefixes, and treat .in as permanent because printed QR codes and placeholder emails depend on it (D9–D13, D15).
4. **Fix the outward copy:** remove "Hyderabad pilot" and unqualified "Free", use "free while we're new; small fee later, 30 days' notice", add a deletion page, a support address with hours by timezone, and a contact or grievance page (D3, D5–D8).
5. **A WCAG 2.1 AA pass on the scoring screens, then a VPAT.** Fix the 2.8:1 contrast on the white-on-red badges, label the scoring pads, announce score changes, and test 200% text. US public schools fall under ADA Title II from 2026–27 (D19–D23).
