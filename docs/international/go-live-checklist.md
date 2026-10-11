# Go-live checklist (India pilot and other countries)

Everything the founder does by hand before or at go-live, in one place. Code work is not listed here; it ships through publishes. Tick items as you go.

## Before the India launch (11 Jan 2027)

- [x] **Daily ID-proof cleanup job.** Done 2026-10-12 (job 4, active). This deletes uploaded ID documents 30 days after they are reviewed, as the privacy policy promises.
  1. Supabase dashboard → project **sportfolio-staging** → **SQL Editor** → **New query**.
  2. Paste the block below and click **Run**. It should return one number, which is the job id.
  3. To check it worked: `select jobname, schedule from cron.job where jobname = 'privacy-retention';` should return one row.

  ```sql
  select cron.schedule(
    'privacy-retention', '30 3 * * *',
    $$ select net.http_post(
         url := 'https://mpgbvbylmkwasjgupsbq.supabase.co/functions/v1/privacy-retention',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'functions_anon_key'),
           'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
         body := '{}'::jsonb) $$
  );
  ```
- [ ] **Firebase SMS budget alert.** Google Cloud console → **Billing** → **Budgets & alerts** → **Create budget** for the Firebase project. Set alerts at 50%, 90% and 100%.
- [ ] **Test APK 38 on a phone:**
  - spoken voice scoring;
  - PDF printing;
  - Settings → Region with Dubai, London and Sydney;
  - phone numbers from other countries;
  - screen stays on while scoring, scoring buzz;
  - QR image arrives in WhatsApp.
- [x] **Fix the 2 phone numbers** listed by `select * from phone_review;`. Done 2026-10-13: both numbers removed (placeholder + duplicate); players kept.
- [x] **Turn on Cloudflare Web Analytics** (cookie-free; the privacy policy says so from 2026-10-13). Done: automatic setup, confirmed loading on the live site 2026-10-13. Cloudflare adds the script only for browsers, so a plain `curl` won't show it.
  1. Log in at dash.cloudflare.com and pick your account.
  2. Open **Workers & Pages** → the website project → **Metrics** tab → under **Web Analytics**, click **Enable**. Cloudflare adds its script to every page itself; no code change.
  3. Data shows under **Analytics & Logs → Web Analytics** within a few minutes.
  4. To check: on sportnnote.in, right-click → **View page source**, press Ctrl/Cmd+F and search for `cloudflareinsights`. "Found" means it is on.
  - Never turn on anything in Cloudflare that sets cookies or tracks visitors; the policy promises it doesn't.

## Before opening to other countries

- [ ] **Company and store accounts** (planned before December):
  - Google Play developer account;
  - Apple Developer Program;
  - company legal name and address in the privacy policy (`src/data/legal.ts` placeholders).
- [ ] **Firebase SMS region policy.** Firebase console → **Authentication** → **Settings** → **SMS region policy** → **Allow**: IN, AE, QA, GB, SG, MY, AU, US. Today it should be India only.
- [ ] **Lawyer review:**
  - the international privacy policy and terms draft (`docs/international/legal-draft.md`, every item tagged LAWYER);
  - UK Online Safety Act scope;
  - Australia's under-16 social-media rule;
  - whether pending child accounts are auto-deleted;
  - confirm cookie-free Cloudflare Web Analytics needs no consent banner in the UK and EU.
- [ ] **Appointments:** a data protection officer (Singapore, Malaysia) and a UK representative.
- [ ] **US under-13s:** contract a COPPA parental-consent verification vendor. Until then, US under-13s can't sign themselves up.
- [ ] **School data agreements:** a template DPA with country add-ons (UK transfer addendum; US FERPA / state student-privacy terms).
- [ ] **.com domain:** buy it, then follow `docs/international/domain-move-com.md` step by step. .in keeps working forever.
- [ ] **Store listings** (draft answers are in `docs/international/audit/distribution.md`):
  - Play: mixed audience including children, data-safety form, account-deletion URL (`/delete-account/`);
  - App Store: privacy labels, age rating.
- [ ] **One-tap app links:** the SD-108 steps (assetlinks.json on a host with no redirect, intent filters, new APK).
- [ ] **Native phone sign-in and iPhone push:** need the store accounts (APNs key).
- [ ] **Rules marked "verify":** confirm with organisers in each market. The app lets organisers change all of them:
  - walkover scores, ban lengths and tie-breaks for the new sports;
  - school age cut-offs (BSME/ESAA 31 Aug, Singapore A/B/C, US 1 Sep);
  - swimming yards ranges.
- [ ] **Payments**, if the small fee starts: currencies, store billing rules, tax. This is design only so far.
