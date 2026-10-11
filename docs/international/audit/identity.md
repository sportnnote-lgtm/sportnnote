# International readiness audit: Identity, contact and messaging

Area: sign-up/sign-in, phone entry/normalisation/identity, guardians/minors, invites and sharing, email, push, contact privacy, verification, names/addresses.
Audited 2026-10-11 on branch `feat/sport-formats-and-scoring`. This is a read-only audit. I didn't run anything against live.
Market order: Gulf (UAE, Qatar), UK, SG/MY, AU, US. One DB (Supabase Mumbai). English only. A .com domain is coming.

## Headline

The biggest problem is the phone number model. Phone is the identity key ("one number = one person", `src/core/phone.ts:1-12`). That model has three India-only assumptions:

1. **Any 10-digit number is treated as Indian.** It gets `91` / `+91` added for SMS and WhatsApp.
2. **Numbers are stored as typed digits, with no country.** The leading 0 is stripped.
3. **Identity matching uses the last 10 digits.** This happens in both the client and SQL.

What breaks:
- A UK or US user who types a local number gets their SMS code or WhatsApp invite sent to India.
- Gulf, Singapore and Australia local numbers (8–9 digits) can't be routed.
- Two people in different countries can collide on the same last-10 key. Phone login then signs one of them into the **other person's account**.

All of this can be fixed now. None of it needs company or store accounts.

## 1. Gap table

| # | Pri | Gap | Evidence | Markets | Fix (one line) | Size | Needs co./store |
|---|---|---|---|---|---|---|---|
| 1 | P0 | **Cross-country account takeover via last-10-digit identity key.** Phone login signs into the first *verified* account whose last 10 digits match. Example: US +1 917 555 1234 has key `9175551234`, the same as Indian mobile 91755 51234. Qatar +974 3312 3456 has key `7433123456`, also a valid Indian mobile. The same key also claims an unclaimed invited player (`phone_login_attach_player`) and passes `verify-phone-firebase`. | `src/core/phone.ts:21-24`; SQL `phone_key()` = `right(digits,10)` in `supabase/migrations/20261006120000_security_hardening.sql:180-182`; `supabase/functions/phone-login/index.ts:25,66-71` → `sessionFor()`; `supabase/migrations/20261016120000_phone_login.sql:57-72,84-95`; `supabase/functions/verify-phone-firebase/index.ts:23,48` | all (US, QA, SG, AU collide with Indian 6–9xxxxxxxxx keys) | Make the identity key the full E.164 number (client + `phone_key()` + edge functions). Backfill existing 10-digit Indian rows to `91…` first. | M | no |
| 2 | P0 | **10-digit local numbers get +91 / 91 added.** UK `07700 900123` (leading 0 stripped) and US `(202) 555-0123` both become `+91…`. Firebase SMS codes and wa.me/sms invites go to an Indian number, which could be a stranger. | `src/core/firebasePhone.ts:32-37` (`toE164`); `src/core/connect.ts:31-38` (`intlDigits`, used by `openWhatsApp`/`openSms`) | UK, US (also MY 10-digit `01x`) | Parse with libphonenumber-js and a default region taken from the user/org country. Never assume +91 once the country isn't IN. | M | no |
| 3 | P0 | **Stored numbers have no country code, and local formats become unroutable.** `normalizePhone` keeps digits and drops leading 0s, so UAE `050 123 4567` is stored as `501234567`. `toE164` then makes `+501234567`, an invalid/foreign number. The same happens to AU `0412…`, SG `9123 4567` and QA `3312 3456`. The same person typed as `+971…` and as `050…` gets 2 different keys, which breaks the dedupe that the "one number = one person" model relies on. | `src/core/phone.ts:15-17`; writes in `src/data/repos.ts:2222,2227,2341,2347,3351,3796`; `src/core/auth.tsx:187` | Gulf, SG, AU (MY partly) | Store only E.164 (`+9715…`) in `players.phone`, `profiles.phone`, `guardian.phone` and `contact_phone`. Normalise on write and reject numbers that can't be parsed. | M | no |
| 4 | P0 | **Under-13 consent is a checkbox the child ticks on their own sign-up.** It isn't verifiable parental consent under US COPPA. The guardian is only *named*; their email is verified later and optionally (`guardian-link`). | `supabase/functions/phone-login/index.ts:90-98`; `src/screens/AuthScreen.tsx:71,225-226`; `src/components/PhoneLoginCard.tsx:41,67`; `supabase/functions/guardian-link/index.ts:1-30` | US (UK AADC / AU also expect parent-led flows for young children) | For under-13 users outside IN, hold the account as pending until the guardian confirms through the emailed link/code. Cross-reference the legal area. | M | no |
| 5 | P1 | **Under 10 digits can't be discovered or deduped.** Discover and contact lookups reject keys shorter than 10 digits, so SG/QA numbers entered locally (8 digits) can never be found. | `supabase/migrations/20261015120000_discover_by_contact.sql:59`; `supabase/migrations/20261007120000_private_contact_details.sql:129` | SG, QA, UAE, AU | Validate with libphonenumber (`isValidNumber`) instead of a length check, once numbers are stored as E.164 (#3). | S | no |
| 6 | P1 | **No country anywhere.** Profiles, orgs, teams and tournaments have free-text City only, so the app can't pick a default dial code, SMS region, legal regime or time zone. | `rg -i country src/core/types.ts supabase/migrations` finds no country field; City fields: `src/screens/OrganizationScreen.tsx:961`, `src/components/TournamentDetailsFields.tsx:78`, `src/screens/CreateClubScreen.tsx:87` | all non-IN | Add `country` (ISO-3166) to profile and org. Default it from device locale/timezone at sign-up. | S | no |
| 7 | P1 | **"+91" placeholders and India-only validation copy.** 14 phone fields show `+91…`. Phone login says "Enter your 10-digit mobile number" and shows the placeholder `98765 43210`. These lead users into the mis-parsing in #2/#3. | `src/screens/AuthScreen.tsx:197,215,226`; `src/components/PhoneLoginCard.tsx:50,92,125`; `src/screens/EditProfileScreen.tsx:287,352`; `src/screens/TournamentTeamsScreen.tsx:606`; `src/screens/CreateCommunityScreen.tsx:78`; `src/screens/ClubHomeScreen.tsx:251`; `src/screens/CreateListingScreen.tsx:145`; `src/components/CoHostPicker.tsx:163` | all non-IN | Build one `PhoneField` with a country-code chip (default from #6) and an example number per country. Use it everywhere. | S | no |
| 8 | P1 | **Picked contacts arrive in the phone's local format.** A UK parent's address book holds `07…` numbers, which then go through the broken normalisation. | `src/core/pickContact.ts:32,39`; `src/components/AddInvitePlayer.tsx:120` | UK, Gulf, SG, AU | Same parser as #2. Use the device region as the default. | S | no |
| 9 | P1 | **SMS fraud and cost exposure once numbers are global.** Firebase phone auth will send to any country the client asks for. Opening up internationally invites SMS-pumping fraud, and the cost per SMS varies by country. Region policy: **verify** in the Firebase console. | `src/core/firebasePhone.ts:4-6,64-79`; `supabase/functions/phone-login/index.ts:58,66` (rate limits are per IP and per number only) | all | Set the Firebase Auth SMS region policy to an allowlist: IN, AE, QA, GB, SG, MY, AU, US. Add a Firebase budget alert. | S | no |
| 10 | P1 | **Phone login and phone verification are web-only.** Native phone verification falls back to WhatsApp OTP. That needs a production WABA, which is blocked until the company exists. Native users abroad can therefore only use email sign-in, and the phone row says "coming soon". | `src/core/firebasePhone.ts:14-16,29-30`; `src/data/repos.ts:3501-3531`; `src/components/ContactCard.tsx:87-98`; `src/screens/AuthScreen.tsx:35` (`SMS_LOGIN_ENABLED=false`) | all | Add native Firebase phone auth (`@react-native-firebase/auth`, no reCAPTCHA needed). Alternatively, finish WhatsApp OTP after Meta business verification. | M | WhatsApp path: yes. Native Firebase: no (but iOS needs an APNs key for silent push, which needs an Apple account) |
| 11 | P1 | **WhatsApp-first sharing.** On desktop web the share fallback is `wa.me`. Adding a player auto-opens WhatsApp. Team-claim buttons, Connect contact, QR-share copy and 10 website guides all say WhatsApp. This works in the Gulf, UK and SG/MY. In the US, and to a lesser degree AU, most parents use iMessage/SMS. | `src/core/share.ts:13,22`; `src/components/AddInvitePlayer.tsx:168-170,249,258`; `src/screens/TournamentTeamsScreen.tsx:181,418,630`; `src/components/ConnectBoard.tsx:65,110`; `src/components/InviteQrShare.tsx:16`; `website/guides/teams-join-a-tournament.md:11` etc. | US, AU (minor: UK) | Lead with the system share sheet. Use "Text / WhatsApp" order by country (US/AU: Messages first). On desktop, fall back to copy-link rather than wa.me. Make the guide copy neutral ("WhatsApp, Messages or any chat"). | S | no |
| 12 | P1 | **Install path is an Android APK download plus iPhone home-screen steps.** Invites and the "open in app" fallback point to `sportnnote.in/#get`. iPhone share is high in the Gulf, UK, AU and US, and APK sideloading scares school IT/parents. | `src/core/inviteText.ts:110-114,126-128`; `src/screens/InviteScreen.tsx:88`; `src/core/invite.ts:9` | all (strongest for UK/US/AU/Gulf) | Switch the install CTA to Play Store / App Store badges, choosing per device by `webDevice()`. | S | yes |
| 13 | P1 | **No universal links or App Links.** Links like `sportnnote.in/join/…` and `app.sportnnote.in/m/…` open the web app, not the installed app. Android uses intent-URL workarounds. | `app.json` (no `ios.associatedDomains`, no `android.intentFilters`); `src/navigation/RootNavigator.tsx:149` | all | Add an apple-app-site-association file and assetlinks.json on the final (.com) domain, plus app.json entries. | S | yes (Team ID, Play signing key) |
| 14 | P1 | **Domain is hard-coded as .in in about 15 places.** The send-invite link allowlist would *reject* .com links, so email invites would silently fail after the switch. | `src/core/shareText.ts:8,81`; `src/core/invite.ts:9`; `src/core/inviteText.ts:114`; `src/core/fixturesText.ts:71`; `src/navigation/RootNavigator.tsx:111,149`; `supabase/functions/send-invite/index.ts:34`; `supabase/functions/report-invite/index.ts:21`; `supabase/functions/notify-upcoming/index.ts:66`; `src/screens/SquadScreen.tsx:280`; `src/screens/LiveScoringScreen.tsx:699`; `src/screens/TournamentProfileScreen.tsx:163,501` | all | Put the domain in one `SITE`/`APP_URL` config (client + `_shared`). Allow both .in and .com. Keep .in links redirecting forever because they're printed on QR sheets. | S | no (domain only) |
| 15 | P1 | **Login and email domains for .com.** These need updating at the switch: Firebase authorised domains, Supabase Site URL/redirects, the Resend sending domain (SPF/DKIM/DMARC) and the VAPID subject. Current config is **verify**. | `src/core/firebasePhone.ts:22-27`; `supabase/functions/_shared/webpush.ts:12` | all | Make a .com cutover checklist. Keep `@phone.sportnnote.in` placeholder emails unchanged, because they're internal (`phone-login/index.ts:101`, `_shared/guard.ts:82`). | S | no |
| 16 | P1 | **Reminder push falls back to India time and format.** A profile with no `time_zone` gets reminder times in IST and en-IN formatting. | `supabase/functions/notify-upcoming/index.ts:218,261-262`; `src/core/time.ts:38` (`DEFAULT_TIME_ZONE='Asia/Kolkata'`) | all non-IN | Save the device timezone (`Intl…resolvedOptions().timeZone`) to `profiles.time_zone` at sign-up. Fall back to the tournament venue tz, not Kolkata. | S | no |
| 17 | P1 | **Native iOS push needs APNs.** Expo push goes through FCM (global) and APNs. Web push works worldwide, but on iPhone only after "Add to Home Screen". | `supabase/functions/push-send/index.ts:69,86-88` | all iOS-heavy (UK, US, AU, Gulf) | Upload the APNs key to EAS after the Apple account exists. Until then, web push plus email. | S | yes |
| 18 | P2 | **Email sender fallbacks and support inbox.** Without env vars, mail goes from `onboarding@resend.dev`. Reply-to and the support address are `sportnnote@gmail.com`, which looks less trustworthy to UK and Gulf schools. | `supabase/functions/send-contact-otp/index.ts:36-37`; `supabase/functions/send-invite/index.ts:27,30`; `supabase/functions/support-escalate/index.ts:36`; `_shared/guard.ts:86`; `_shared/webpush.ts:12` | all | Use `support@<domain>` once the company and domain exist. Remove the resend.dev fallback (fail closed). | S | yes (company mailbox) |
| 19 | P2 | **Invite emails have no sender postal address or opt-out line.** CAN-SPAM (US) and PECR (UK) expect this for emails to people who haven't signed up. Resend is a US processor: a cross-border note for the legal area. | `supabase/functions/send-invite/index.ts:39-55` | US, UK | Add a footer with the company postal address and a "don't email me again" link. The address needs the company. | S | yes |
| 20 | P2 | **"Findable by phone/email" is on by default** for adults. UK GDPR and AU APP expect privacy-protective defaults. Minors are already excluded, which is good. | `supabase/migrations/20261015120000_discover_by_contact.sql:10,65-68` | UK, AU (SG PDPA softer) | Default to off when `country≠IN`, or ask once at sign-up. | S | no |
| 21 | P2 | **WhatsApp OTP template is a single `en` template.** Meta auth-template pricing and availability vary by recipient country. Rates are **verify**: recent figures put UAE/UK/US auth messages at several times India's rate. | `supabase/functions/send-contact-otp/index.ts:45-68` | Gulf, UK, US | Budget per country. Keep Firebase SMS as the fallback where WhatsApp cost or reach is worse (US). | S | yes (production WABA) |
| 22 | P2 | **The dormant Supabase SMS login path sends `normalizePhone()` output with no `+`.** If it were switched on, it would mis-route the same way. | `src/core/auth.tsx:246,251` | all | Pass E.164 from the shared parser, or delete the dead path. | S | no |
| 23 | P2 | **Indian sample names and cities in placeholders.** Names: "Aarav Mehta", "Priya Mehta", "Mr Rao". Cities: "Hyderabad", "Bengaluru". Not wrong, but it signals "Indian app". | `src/screens/AuthScreen.tsx:196,225`; `src/components/PhoneLoginCard.tsx:114,124`; `src/screens/EditProfileScreen.tsx:266`; `src/screens/CreateClubScreen.tsx:81,87`; `src/components/TournamentDetailsFields.tsx:78`; `src/components/golf/GolfCourseEditor.tsx:100` | all non-IN | Use neutral placeholders ("Full name", "City"), or pick examples by country. | S | no |
| 24 | P2 | **Bundle ID / package is `in.sportnnote.app`.** It's permanent once published on the stores. That's cosmetic only, but it's the last chance to change it. | `app.json:11,20` | all | Decide before the first store submission: keep it, or use `com.sportnnote.app`. Changing Android breaks updates for existing APK installs. | S | yes |
| 25 | P2 | **Internal weekly KPI report is fixed to the IST week.** This is an internal ops item and doesn't affect users. | `supabase/functions/weekly-report/index.ts:50-69,94` | — | Fine for now. Add a per-country breakdown later. | S | no |

Things I checked that are already OK internationally:
- **Names:** a single "Full name" field with no first/last split, so it handles mononyms and Arabic/Malay naming.
- **Age proof:** the examples are generic (birth certificate, school ID, passport), with no Aadhaar (`src/components/ProfileView.tsx:545`).
- **Minor threshold:** 18 everywhere (`src/core/age.ts:21-24`), which is at least as strict as GDPR/PDPA/COPPA thresholds.
- **Discovery:** minors are never discoverable.
- **SMS and WhatsApp invites:** they're opened in the user's own messaging app (`sms:` / `wa.me`). That's person-to-person, not A2P, so no 10DLC / sender-ID registration and no TCPA exposure.
- **QR invites and join codes** have nothing country-specific.
- **FCM and web push** are global.
- **Email OTP sign-in** uses 6-digit codes, not links, so it doesn't depend on the domain.

## 2. Per-market notes (messaging norms, SMS)

SMS prices and deliverability are **verify** items. Check the current Firebase phone-auth pricing table and Meta's WhatsApp rate card before budgeting.

| Market | Default chat | Firebase SMS OTP | WhatsApp OTP | Phone format traps | Matters most |
|---|---|---|---|---|---|
| UAE | WhatsApp (near-universal; messaging works, VoIP calls restricted) | Works. Higher cost tier than IN. Sender-ID rules (TDRA) are handled by Google's route. Deliverability: **verify** with test sends on du/Etisalat. | Strong channel, but needs a production WABA (company). | `05x xxx xxxx` local (9 sig. digits). Expats often save foreign numbers (+91, +44) in contacts, so the parser must respect an explicit `+`. | #1–3, #7, #12 |
| Qatar | WhatsApp | As UAE: **verify** deliverability on Ooredoo/Vodafone QA. | Strong. | 8-digit numbers (`3xxx xxxx`, `5…`, `6…`, `7…`). The last-10 key collides with Indian 74/97… numbers. | #1, #3, #5 |
| UK | WhatsApp (school parent groups) plus iMessage/SMS | Works well; mid-tier cost. | Good, but SMS is fine. | `07xxx xxxxxx`. After dropping the 0 it's 10 digits, so it's **mis-routed to +91** today. | #2, #4 (AADC), #11 (minor), #19, #20 |
| Singapore | WhatsApp | Works; mid/high tier. | Strong. | 8-digit (`8xxx`/`9xxx`). Can't be discovered (#5), and is unroutable unless typed with +65. | #3, #5 |
| Malaysia | WhatsApp (dominant) | Works; **verify** deliverability. | Strong, often better than SMS. | `01x-xxx xxxx` (10–11 digits). Some local forms are mis-routed to +91. | #2, #3 |
| Australia | iMessage/SMS and Messenger; WhatsApp moderate | Works; mid tier. | Optional. | `04xx xxx xxx`. Becomes 9 digits, so unroutable. | #3, #11, #20 |
| US | iMessage/SMS (WhatsApp is a minority) | Works; low cost tier. | Poor reach, so prefer SMS. | `(xxx) xxx-xxxx` is 10 digits, so **mis-routed to +91**. Collides with Indian keys (#1). | #1, #2, #4 (COPPA), #11, #19 |

## 3. Can do now vs needs company/store accounts

**Can do now (no accounts needed):**
- **Phone model, #1 #2 #3 #5 #6 #7 #8 #22:**
  - Add libphonenumber-js and a `country` field on profile/org.
  - Build a single `PhoneField`.
  - Store E.164 everywhere.
  - Make the key the full E.164 in `phone_key()` and the edge functions.
  - Backfill: existing 10-digit rows become `91…`, and existing `91…` 12-digit rows are already fine. Do this in one migration, then make it live via the founder's SQL editor.
- **Under-13 guardian-confirm gate for non-IN, #4.** Coordinate with the legal area.
- **Firebase SMS region allowlist and budget alert, #9.** This is console config.
- **Native Firebase phone auth, #10** (non-WhatsApp route).
- **Share-sheet-first, country-ordered sharing copy plus guide wording, #11.**
- **Centralise domain config, #14, and write the .com cutover checklist, #15,** ready for the day the domain lands.
- **Save device timezone at sign-up and drop the Kolkata fallback, #16.**
- **Privacy-default for discover outside IN, #20, and neutral placeholders, #23.**

**Needs company / store accounts:**
- **#12:** store install CTAs (Play/App Store listings).
- **#13:** universal links / App Links (Apple Team ID, Play app-signing SHA-256).
- **#17:** APNs key for native iOS push.
- **#10 (WhatsApp part), #21:** production WABA and Meta business verification for WhatsApp OTP.
- **#18, #19:** company support mailbox and postal address for email footers.
- **#24:** final bundle ID decision at first submission.

## 4. Top 5 for identity

1. **Fix the cross-country account takeover (#1).** Make the identity key the full E.164 number in the client, SQL `phone_key()`, `phone-login` and `verify-phone-firebase`, then backfill. Ship before any non-IN user can sign in with a phone.
2. **Country-aware phone parsing and E.164 storage (#2, #3, #5, #8).** Use libphonenumber-js and stop assuming +91. Today UK and US local numbers get SMS codes and invites sent to India.
3. **A country field plus one `PhoneField` with a dial-code chip (#6, #7).** This replaces 14 `+91…` placeholders and the "10-digit" copy, and gives every later fix its default region.
4. **Lock down international SMS (#9) and add native phone auth (#10).** Set the Firebase region allowlist and budget alert now, then add native Firebase phone auth so the iOS/Android apps aren't email-only abroad while WhatsApp OTP waits on the company.
5. **Gate under-13 accounts on guardian confirmation outside India (#4), and go share-sheet-first for US/AU (#11).** The first is COPPA exposure; the second fits how US/AU parents message.
