# International privacy policy and terms: draft for legal review

_SD-152 (wave I-1c), 2026-10-20. **This is not legal advice.** It is a working draft written by the product team so a qualified lawyer in each market can review it. Nothing here should be relied on until counsel has signed it off. Statute names and articles are from general knowledge and must be verified._

The text users see is in `src/data/legal.ts`:
- `INTL_PRIVACY_POLICY` and `INTL_TERMS`, version `INTL_LEGAL_VERSION` = `2026-10-20-intl-draft`.

Indian users keep `PRIVACY_POLICY` / `TERMS` unchanged (DPDP Act 2023). `privacyPolicyFor(country)` and `termsFor(country)` choose the text, and `LegalScreen` renders it by region. Every legal claim in the draft is listed below with a **LAWYER** marker and the question to answer. The source audit is `docs/international/audit/legal.md` (L1–L27).

The website (`/privacy/`, `/terms/`) still publishes only the India text. Publish the international text there only after sign-off. To do that, add `/privacy/international/` in `scripts/build-website.mjs` from `INTL_PRIVACY_POLICY`.

---

## 1. Which text a user sees

| User | Policy | Recorded at sign-up (`legal_accepted.version`) |
|---|---|---|
| Device or chosen country = India, or country unknown | India policy (unchanged) | `LEGAL_VERSION` |
| Any other country | International draft | `INTL_LEGAL_VERSION` |

The country comes from Settings → Region if the user set it, else the device time zone (`src/core/privacyRegion.ts`). The language setting is never used, because many Indian phones run "English (US)".

- **LAWYER L1:** Is one policy with regional sections acceptable in every market, or does any market need a standalone notice?
- **LAWYER:** Is the device time zone a reasonable basis for choosing the applicable notice?

## 2. Claims in the international privacy policy

| # | Section | Claim | LAWYER question |
|---|---|---|---|
| P1 | Who we are | Controller = `[company legal name]`, `[registered address]`. DPO and UK representative `[to be appointed]`. | **LAWYER L2/L13:** Fill these in at incorporation. Is a UK Art 27 representative needed? Is an EU one needed if we don't target the EU? Is a DPO mandatory in SG and MY (yes per PDPA; verify the MY 2025 guideline thresholds)? Does Qatar require registration? |
| P2 | Who we are | Schools and clubs "may be the controller" under a written agreement. | **LAWYER L19:** Confirm the controller/processor split for schools. The master DPA is still to be drafted. |
| P3 | Legal basis | Contract for the service; legitimate interests for public sporting records, safety and crash reports; consent for notifications, ID proofs, and analytics in the UK/EEA; legitimate interests for analytics elsewhere; legal obligation. | **LAWYER L26:** Write a legitimate-interests assessment (LIA) for public results and kept "Deleted player" results. Is consent the right basis for ID proofs, or is it contract? Does a child's contract hold, or must the basis be the guardian's consent? |
| P4 | Legal basis | "No automated decisions with legal or similar effects." | Confirm that eligibility checks (age groups) aren't "automated decisions" under Art 22. |
| P5 | Organiser-added data | Organisers must have the right to add people. The invite carries notice, a link to this policy and a "Not you" opt-out. Records become the person's own on joining. | **LAWYER L21:** Is an Art 14 notice delivered by the invite sufficient? Should organisers tick a warranty when adding minors? Is a minor's phone number acceptable at all (PECR, COPPA)? |
| P6 | What is public | Adults: public card. Under-18 and unknown age: initials to logged-out viewers, a reduced card to strangers, a full card only to the child's circle. | Relies on migration `20261019124600_protect_minors.sql` (minors-privacy agent). **LAWYER L16:** Children's Code standard 7 (default settings): is the "circle" narrow enough? |
| P7 | Children | Under 18 outside India: the guardian confirms by email, and the account is limited until then. | **LAWYER L4:** Is email-plus-link "verifiable" enough for UK DPA 2018 s.9 (under 13 where consent is the basis), UAE PDPL, Qatar PDPPL (children's data as "special nature"), SG/MY (no fixed age; 13 per PDPC guidance), and AU? |
| P8 | Children | US under 13: no self sign-up; a parent adds the child as a player. | **LAWYER L4 (COPPA):** Is a parent-created player record (no child login, no child contact data) outside COPPA's "collection from a child"? Which FTC-approved VPC method and vendor should we use before opening child accounts? Can schools consent in an educational context? |
| P9 | Children | A guardian can view, download and delete the child's data, and withdraw consent (locks the account; deleted after 30 days). | **LAWYER L11:** Is 30 days acceptable? Does COPPA 312.6 require immediate deletion on request (we do delete immediately via "Delete their data")? |
| P10 | Storage | All data is stored in India (Mumbai) and transferred to India from other countries. Safeguards: contracts, encryption, and the UK IDTA/Addendum or EU SCCs where required. | **LAWYER L7:** For UK users collected directly, is this a restricted transfer? Do we need an IDTA plus a transfer risk assessment? What is the UAE PDPL Art 22/23 basis (does India have adequacy? consent?), Qatar PDPPL Art 15, SG s.26 (contractual clauses with Supabase), MY s.129 (as amended 2024), AU APP 8 accountability? |
| P11 | Processors | Supabase (India region; US company), Expo/EAS (US), Google Firebase (US/global), Apple/Google/Mozilla push (global), Resend (US), Cloudflare (global), Anthropic (US; help assistant), Meta WhatsApp (not live). | **LAWYER L8:** Confirm each provider's DPA and transfer terms. Should the help assistant be off for under-18 accounts? |
| P12 | Retention | See the table in section 4. | **LAWYER:** Retention for consent records and support emails. Legal-hold exceptions. |
| P13 | Cookies | The app stores sign-in and settings (essential). The analytics ID is stored only with "Allow analytics". The website sets no cookies and runs no analytics. | **LAWYER L9/L24:** Does PECR reg 6 apply to the app's AsyncStorage/localStorage? Is the DUAA 2025 statistical-analytics exemption in force and usable instead of consent? **Founder:** confirm that Cloudflare Web Analytics is off in the dashboard (or disclose it). |
| P14 | Rights | Access/download, correction, deletion, withdrawing consent, objection/restriction, complaint. Reply "within the time your law sets (usually one month)". | Confirm the deadlines: UK one month (+2), SG 30 days, MY 21 days, AU 30 days, CCPA 45 days, UAE/Qatar (verify). |
| P15 | Regional | UK: UK GDPR, DPA 2018, Children's Code, ICO. EEA: GDPR. UAE: PDPL 45/2021, DIFC/ADGM, UAE Data Office. Qatar: Law 13/2016, National Data Privacy Office. SG: PDPA 2012, PDPC. MY: PDPA 2010 as amended, Commissioner. AU: Privacy Act 1988, APPs, OAIC. US: COPPA, state laws, no sale or sharing. | **LAWYER L22:** One Gulf opinion: name the right regulator, DIFC/ADGM schools, and the UAE child digital safety law 2025. **LAWYER L27:** US state watch-list. **LAWYER L5/L6:** UK Online Safety Act scope and the AU under-16 social-media minimum age are **not** addressed in the policy yet. |
| P16 | Breaches | "We'll tell you and regulators as each country's law requires." | **LAWYER L12:** Write an incident runbook with the clocks: UK 72h, SG 3 days, MY 72h then 7 days, AU NDB, Qatar 72h (verify), UAE "without delay" (verify). |

## 3. Claims in the international terms

| # | Claim | LAWYER question |
|---|---|---|
| T1 | "Free while we're new", with notice before charging. | Consumer-law wording for a free service. Does an auto-renew or pricing change need specific notice? |
| T2 | US under-13s can't hold an account. | Matches P8. |
| T3 | Liability: reasonable care and skill; no liability for unforeseeable losses or user-entered data. "Nothing limits rights you have by law that can't be limited." | **LAWYER L18:** UK CRA 2015, ACL guarantees (AU), SG/MY consumer law, US state law. Are liability caps needed per market? |
| T4 | Consumers: the law of their country and their local courts. Organisations: Indian law, Hyderabad courts, unless the written agreement says otherwise. | **LAWYER L18:** Confirm enforceability. Should there be an arbitration clause for B2B? |
| T5 | Organisers must have the right to add the people they add. | Pair with the organiser warranty (P5) and the school DPA. |

## 4. Retention (what the product does today)

| Data | Kept | Mechanism |
|---|---|---|
| Account, profile, sporting data | While the account is open | n/a |
| After account deletion | Personal fields erased. Results kept as "Deleted player". Sent message text blanked. | `delete_account_data` (0030) + `privacy_after_delete` |
| **ID proofs (files)** | **30 days after the approve/reject decision**, then deleted. The row keeps status, date and reviewer; file names are stripped from the history. | `privacy-retention` edge function (daily) → `due_verification_docs` / `mark_verification_doc_deleted` |
| Child accounts whose guardian declined or withdrew | 30 days after the withdrawal, then deleted like "Delete my account" | `privacy-retention` → `due_withdrawn_accounts` |
| Pending child accounts (guardian never answered) | Kept, limited (no follows, no messages, hidden from strangers) | **LAWYER:** Should these be deleted after N days? COPPA requires deleting a parent's contact details if consent isn't obtained in a reasonable time (but US under-13 self sign-up is blocked). |
| Guardian confirmation links | 7 days | `guardian_consent_requests.expires_at` |
| Contact verification codes | Minutes | existing |
| Usage and error data | 13 months | existing (0029/0030) |
| Consent log | While the account is open (cascade with the profile row, which is kept scrubbed) | `consent_log` **LAWYER:** How long must consent evidence be kept after deletion? |
| Support emails | not defined | **LAWYER + founder:** Set a period. |

## 5. Children: product rules shipped with this draft

| Country | Under 13 | 13–17 |
|---|---|---|
| India (and unknown) | Sign-up allowed with the guardian checkbox (unchanged) | Same (unchanged) |
| UK, EEA, UAE, Qatar, SG, MY, AU | Allowed; the guardian confirms by email; limited until then | Same |
| US | **Blocked.** A parent adds the child as a player instead. | The guardian confirms by email; limited until then |
| +1 mobile with no country (old app builds, phone sign-up) | Treated as US (blocked) | Guardian confirmation |

"Limited" means nobody can follow the child, the child can't follow anyone, and no messages are sent about them. The minors-privacy migration already restricts strangers to a reduced card. Hooks for stricter visibility while limited: `minor_account_limited(profile)` and `player_account_limited(player)` in migration `20261020120000_privacy_rights.sql`. `players_view` could hide the card entirely for limited accounts; this is not done yet because that view belongs to the minors-privacy work.

- **LAWYER L6 (AU):** The under-16 social-media minimum age may require stricter treatment (guardian-held accounts, no follows) for under-16s in AU.
- **LAWYER L5 (UK):** Online Safety Act duties (risk assessments, age assurance) are separate from this draft.

## 6. Analytics consent

| Market | Default | Choice |
|---|---|---|
| UK, EEA, Switzerland ("consent-first") | Nothing sent or stored until the user chooses | First-visit banner: **Essential only** / **Allow analytics** (equal buttons). Settings → Your data & privacy. |
| Everyone else, including India (DPDP notice) | On, with a notice | Settings → Your data & privacy |
| Under 18 (everywhere) | Never linked to a profile, device or session (0030) | n/a |

"Essential only" means the app sends no usage events and stores no device ID. Crash reports are still sent, without any device ID. On the server, `profiles.analytics_opt_out` stops `analytics_actor()` linking events to the person. Database-trigger KPI counts stay anonymous. The choice is recorded in `consent_log`.

- **LAWYER:** Are anonymous crash reports "strictly necessary" under PECR?

## 7. Open items needing the company or store accounts
- The legal name, address, privacy mailbox on the .com domain, DPO and UK representative (L2, L13).
- A COPPA VPC vendor contract, before any US under-13 accounts (L4).
- Store privacy labels (App Store, Play Data safety, Families policy), from the processor table in P11 (L20).
- Signed school DPAs with the IDTA/SCC annex (L19).
