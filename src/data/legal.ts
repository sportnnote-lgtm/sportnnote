/**
 * Privacy Policy + Terms of Use, shown in-app (LegalScreen) and at the public
 * URLs /privacy and /terms. Written in the Markdown subset `components/Markdown`
 * renders.
 *
 * Bump LEGAL_VERSION whenever either text changes materially — sign-ups record
 * which version they agreed to (auth metadata `legal_accepted`).
 *
 * NOTE for the founder: have a lawyer review before the public launch, and
 * replace "SportnNote" with the company's legal name once it is incorporated
 * (docs/company/COMPANY_SETUP.md).
 */

export const LEGAL_VERSION = '2026-10-07';
export const LEGAL_CONTACT = 'sportnnote@gmail.com';

export const PRIVACY_POLICY = `## Privacy Policy

**Effective ${LEGAL_VERSION}.** This policy explains what SportnNote ("we", "us") collects, why, who it is shared with, and the rights you have under India's Digital Personal Data Protection Act, 2023 (DPDP Act).

## What we collect

- **Account:** name, email, mobile number, date of birth, and the role you choose (player, organiser, parent…).
- **Parent/guardian details** for anyone under 18: the guardian's name, mobile and/or email, and their consent.
- **Sports profile:** sports you play, city, gender (optional), bio, jersey number, photo, team and club memberships.
- **Sporting records:** matches, scores, ball-by-ball and point-by-point events, stats, tournaments and results you take part in or record.
- **Age/ID proofs** you upload so an organiser can confirm age eligibility.
- **Messages** you send and receive in the app, and reports you make about messages.
- **Device data:** a notification token if you allow notifications.
- **Usage and error data:** which screens are opened, actions such as "match completed", the app version and platform, and error reports when something breaks. We don't record what you type, and we strip emails and phone numbers out of error reports.

## Why we use it

- To run the service: your account, scoring, tournaments, profiles, stats and messaging.
- To show sporting records publicly. Following players and discovering talent is the purpose of SportnNote.
- To verify contact details (codes by SMS or email) and age eligibility for age-group events.
- To keep people safe: guardian controls, blocking and reporting, and moderation.
- To send notifications you've asked for, such as match reminders and live scores.
- To fix bugs and improve the app, using usage and error data.

We do **not** sell your data, show ads, or build advertising profiles.

## What is public

Your **name, photo, sports, teams, stats, scores and match history** are visible to other users.

**Shared links:**
- Match, tournament and golf pages can be opened by anyone with the link, without an account.
- So can the profiles of players aged **18 and over**.
- **Under-18 players** (and anyone whose age isn't confirmed by a date of birth) show only their **initials** to people who aren't signed in, and **no photo**.
- Signed-in members who aren't connected to an under-18 player see their name, sports and team, but **not their photo, city, school or bio**. Those are visible only to their **teammates, coaches, tournament organisers, school/club members and parent/guardian**, and only those people can **follow** them and get their match alerts.
- These app pages are not listed in search engines.

Your **mobile number and email are hidden by default**, and you can choose to show them in Edit profile. Date of birth, guardian details, ID proofs, messages and who you follow are never public.

## Children (under 18)

- An under-18 account needs the **verifiable consent of a parent or guardian**, given at sign-up.
- Messages about a child go to the linked **parent/guardian**, not to the child.
- We don't track or behaviourally monitor children. Usage data from under-18 accounts is recorded **anonymously** and never linked to the child.
- We don't use children's data for advertising of any kind.

## Who we share it with

We use these service providers to run SportnNote. Each processes data only on our instructions:

- **Supabase:** database, sign-in and file storage.
- **Expo:** app delivery, updates and notifications.
- **Google Firebase:** sending SMS verification codes (it receives your mobile number).
- **Resend:** sending emails (it receives your email address).
- **Meta (WhatsApp):** if WhatsApp codes are used, it receives your mobile number.

Their servers may be outside India. We will share data with authorities only when Indian law requires it.

## How long we keep it

- **Account and sporting data:** while your account is open.
- **Verification codes:** minutes.
- **Usage and error data:** 13 months.
- **After you delete your account:** your personal details, photo, ID proofs and message text are erased. Results of matches you played remain in other people's match histories, shown as "Deleted player", so standings stay correct.

## Your rights

You can:
- **see and correct** your data (Edit profile);
- **delete your account** (Settings → Delete my account);
- **withdraw consent** (delete your account, or ask us);
- **nominate** someone to exercise your rights if you die or become incapacitated;
- **complain** to us, and then to the **Data Protection Board of India**.

Email **${LEGAL_CONTACT}** for any request. We reply within 7 days and resolve within 30.

## Grievance officer

The SportnNote Grievance Officer can be reached at **${LEGAL_CONTACT}**.

## Security

Data is encrypted in transit and access is limited by strict database rules. No system is perfectly secure. If a breach affects you, we will tell you and the Data Protection Board as the law requires.

## Changes

If we change this policy materially, we will tell you in the app before the change applies.
`;

export const TERMS = `## Terms of Use

**Effective ${LEGAL_VERSION}.** By creating an account or using SportnNote you agree to these terms. If you're under 18, your parent or guardian must agree to them for you.

## The service

SportnNote lets you score matches, run tournaments, keep sporting records and follow players. It's **free during the pilot**. Features may change, and we will give notice before charging for anything.

## Your account

- Give accurate details, especially your date of birth, which decides age-group eligibility.
- Keep your login safe. You're responsible for activity on your account.
- One person, one account. Don't impersonate anyone.

## Your content

- Scores, stats, photos and messages you add stay **yours**.
- You let us store and display them so the service works. For example, a match you scored appears in both teams' histories.
- Only upload photos and documents you have the right to share.

## Fair play

You agree not to:
- enter false scores or results on purpose, or tamper with other people's matches;
- harass, threaten, bully or spam anyone, or send sexual content, especially to or about a child;
- upload someone else's ID documents or personal details;
- try to break, overload or get around the app's security.

We may remove content, limit messaging, or suspend accounts that break these rules.

## Scores and results

Scores are entered by users, so we can't guarantee they are correct. Organisers are responsible for their own tournaments and for deciding disputes. SportnNote isn't an official governing body.

## Liability

The service is provided "as is". To the extent the law allows, we aren't liable for indirect losses, or for losses from inaccurate user-entered information or from events organised through the app.

## Ending

You can delete your account at any time (Settings → Delete my account). We may suspend accounts that break these terms.

## Law

These terms are governed by the laws of India. Courts in Hyderabad, Telangana have jurisdiction.

## Contact

**${LEGAL_CONTACT}**
`;

/* ===================== SD-152: users outside India (DRAFT) =====================
 * NOT LEGAL ADVICE. A draft for a lawyer's review before any non-India launch —
 * the annotated copy, with every claim that needs counsel marked LAWYER, is
 * docs/international/legal-draft.md. Keep the two in step.
 *
 * Indian users keep PRIVACY_POLICY / TERMS above, unchanged (DPDP Act). Users
 * outside India (device country / Settings → Region; see core/privacyRegion.ts)
 * see these. Placeholders in [square brackets] are filled once the company is
 * incorporated (legal name, address, DPO, UK representative).
 * This file must stay import-free: scripts/build-website.mjs imports it.
 */

export const INTL_LEGAL_VERSION = '2026-10-20-intl-draft';

/** Which version a sign-up agrees to (recorded in auth metadata legal_accepted). */
export const legalVersionFor = (country: string): string => (country.toUpperCase() === 'IN' ? LEGAL_VERSION : INTL_LEGAL_VERSION);

const INTL_CONTROLLER = '[Company legal name — to be added on incorporation], [registered address]';

export const INTL_PRIVACY_POLICY = `## Privacy Policy (outside India)

**Effective ${INTL_LEGAL_VERSION}.** This policy applies if you live outside India. We are preparing to launch outside India, and this version is still being reviewed by our lawyers, so it may change before launch. If you live in India, our India policy applies instead.

## Who we are

SportnNote is run by ${INTL_CONTROLLER} ("we", "us"). We decide how your personal data is used (we are the "controller").

- **Privacy contact:** ${LEGAL_CONTACT}
- **Data protection officer:** [to be appointed]
- **UK representative:** [to be appointed]

When a school or club uses SportnNote to run its own events under a written agreement with us, the school or club may be the controller for its pupils' or members' data, and we act on its instructions.

## What we collect

- **Account:** name, email, mobile number, date of birth, country, and the role you choose (player, organiser, parent…).
- **Parent/guardian details** for anyone under 18: the guardian's name, mobile and/or email, and a record of their consent.
- **Sports profile:** sports you play, city, gender (optional), bio, jersey number, photo, team and club memberships.
- **Sporting records:** matches, scores, events, stats, tournaments and results you take part in or record.
- **Age/ID proofs** you upload so an organiser can confirm age eligibility.
- **Messages** you send and receive, and reports you make.
- **Data an organiser adds about you** (see below).
- **Device data:** a notification token if you allow notifications, and a random device ID for analytics only if you allow analytics.
- **Usage and error data:** which screens are opened, actions such as "match completed", the app version, and error reports. We don't record what you type, and we strip emails and phone numbers out of error reports.
- **Questions you ask the in-app help assistant.**

## Why we use it, and our legal basis

- **Running your account and the service** (scoring, tournaments, profiles, stats, messaging): to perform our contract with you (the Terms of Use).
- **Showing sporting results to others:** our legitimate interest, and yours, in a shared sporting record. Children's full profiles are shown only to their own teams and tournaments.
- **Checking contact details and age eligibility:** contract and legitimate interests. ID documents: your consent (or your guardian's), which you can withdraw.
- **Keeping people safe** (guardian controls, blocking, reporting, moderation): legitimate interests and legal obligations.
- **Notifications you ask for:** your consent. Turn them off in Settings at any time.
- **Analytics:** in the UK and the European Economic Area, only with your consent. Elsewhere, our legitimate interest in improving the app. You can switch it off in Settings → Your data & privacy.
- **Crash reports:** our legitimate interest in keeping the app working. They carry no device ID unless you allowed analytics.
- **Meeting legal requirements:** legal obligation.

We do **not** sell your data, show ads, or build advertising profiles. We make no decisions about you by automated means that have legal or similar effects.

## Data an organiser adds about you

Organisers (for example a school PE teacher or a club captain) can add players to a team or event before those players join, with a name and, if needed, a mobile number or email so they can be invited. If that happens:
- the invite tells you who added you and links to this policy;
- you can tap **Not you** in the invite to have it removed, without an app or account;
- when you join, the record becomes yours. Settings → **Your data & privacy** shows who added you and when, and you can download, correct or delete it.

Organisers must have the right to add the people they add (for example under the school's own consent arrangements). For children, organisers should give a parent's contact, not the child's.

## What is public

- Match, tournament and golf pages can be opened by anyone with the link.
- Players **18 and over:** name, photo, sports, teams, stats and match history can be seen by others.
- **Under-18 players** (and anyone whose age isn't confirmed): visitors who aren't signed in see only initials. Signed-in members who aren't connected to the player see their name, sports and team, but not their photo, city, school or bio. Only their teammates, coaches, organisers, school or club and parent/guardian see the full profile and can follow them.
- Your mobile number and email are hidden unless you choose to show them (adults only). Date of birth, guardian details, ID proofs, messages and who you follow are never public.

## Children

- **Under 18:** a parent or guardian must agree. We email them a link, and they confirm from their own email. Until they do, the account is limited: nobody can follow the child or message about them, and only the child's teams see the profile.
- **Under 13 in the United States:** children can't create their own account. A parent or guardian can add them as a player from the parent's own account.
- Messages about a child go to the parent or guardian, never to the child.
- We never link a child's activity to analytics, never show them ads, and never use their data for advertising.
- **A parent or guardian can**, from their own linked account: see and download the child's data, delete it, and withdraw consent. Withdrawing locks the account at once, and it is deleted after 30 days unless they confirm again.

## Where your data is stored

Your data is stored in **India** (Mumbai), on servers run by our database provider. If you live outside India, your data is therefore transferred to India. We protect it with contracts with our providers, encryption in transit, strict access rules, and, where the law of your country requires it, approved transfer terms (for example the UK International Data Transfer Addendum or the EU Standard Contractual Clauses).

## Who we share it with

We use these service providers. Each processes data only on our instructions:

- **Supabase** (database, sign-in, file storage): India (Mumbai); company in the United States.
- **Expo / EAS** (app delivery, updates, push notifications): United States.
- **Google Firebase** (SMS verification codes, Android notifications): United States and worldwide.
- **Apple, Google and Mozilla push services** (web and phone notifications): worldwide.
- **Resend** (emails): United States.
- **Cloudflare** (website hosting and network): worldwide.
- **Anthropic** (the in-app help assistant reads the questions you type there): United States.
- **Meta (WhatsApp)**: only if WhatsApp codes are switched on (not yet).

We share data with authorities only when the law requires it.

## How long we keep it

- **Account and sporting data:** while your account is open.
- **After you delete your account:** personal details, photo, ID proofs and message text are erased. Results of matches you played stay in others' histories as "Deleted player".
- **ID proofs:** deleted 30 days after the review decision. We keep only the result ("verified on <date>").
- **Child accounts whose guardian declined or withdrew consent:** deleted after 30 days.
- **Verification codes:** minutes. Guardian confirmation links: 7 days.
- **Usage and error data:** 13 months.
- **Consent records:** while your account is open, and afterwards only as long as the law requires.

## Cookies and similar technologies

The app stores your sign-in and settings on your device; these are needed for it to work. The analytics device ID is stored only if you choose **Allow analytics**. The SportnNote website sets no cookies and runs no analytics.

## Your rights

You can:
- **see and download** your data (Settings → Your data & privacy → **Download my data**);
- **correct** it (Edit profile);
- **delete** your account (Settings → Delete my account);
- **withdraw consent** (analytics, notifications, ID proofs) at any time;
- **object** to uses based on our legitimate interests, or ask us to **restrict** them;
- **complain** to us, and to the regulator in your country (below).

Email **${LEGAL_CONTACT}** for any request. We reply within the time your law sets (usually one month).

## Rights in your country

### United Kingdom
UK GDPR and the Data Protection Act 2018 apply, and we follow the ICO's Age Appropriate Design Code for children. You can complain to the Information Commissioner's Office (ico.org.uk).

### European Economic Area
The GDPR applies. You can complain to the data protection authority where you live or work.

### United Arab Emirates
The Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) applies; schools in the DIFC or ADGM have their own data protection laws. You can access, correct, delete and object, and complain to the UAE Data Office.

### Qatar
Law No. 13 of 2016 on Personal Data Privacy Protection applies. Children's data gets extra protection. You can complain to the National Data Privacy Office.

### Singapore
The Personal Data Protection Act 2012 applies. You can ask for access and correction, and withdraw consent. You can complain to the Personal Data Protection Commission.

### Malaysia
The Personal Data Protection Act 2010 (as amended) applies. You can ask for access, correction and a copy of your data, and withdraw consent. You can complain to the Personal Data Protection Commissioner.

### Australia
The Privacy Act 1988 and the Australian Privacy Principles apply. You can ask for access and correction. You can complain to the Office of the Australian Information Commissioner (oaic.gov.au).

### United States
Parents of children under 13 have rights under COPPA: to review, delete, and stop further use of their child's data. Residents of some states (for example California) have rights to know, delete and correct. We don't sell personal data or share it for targeted advertising.

## Security and breaches

Data is encrypted in transit and access is limited by strict database rules. No system is perfectly secure. If a breach affects you, we will tell you and the regulators as each country's law requires.

## Changes

If we change this policy materially, we will tell you in the app before the change applies.

## Contact

**${LEGAL_CONTACT}** · ${INTL_CONTROLLER}
`;

export const INTL_TERMS = `## Terms of Use (outside India)

**Effective ${INTL_LEGAL_VERSION}.** These terms apply if you live outside India. They are still being reviewed by our lawyers and may change before launch. By creating an account or using SportnNote you agree to them. If you're under 18, your parent or guardian must agree for you.

## Who we are

SportnNote is provided by ${INTL_CONTROLLER}.

## The service

SportnNote lets you score matches, run tournaments, keep sporting records and follow players. It's **free while we're new**. Features may change, and we will give notice before charging for anything.

## Your account

- Give accurate details, especially your date of birth and country, which decide age-group eligibility and the rules for children.
- Keep your login safe. You're responsible for activity on your account.
- One person, one account. Don't impersonate anyone.
- In the United States, children under 13 can't hold their own account.

## Your content

- Scores, stats, photos and messages you add stay **yours**.
- You let us store and display them so the service works. For example, a match you scored appears in both teams' histories.
- Only upload photos and documents you have the right to share. Organisers must have the right to add the people they add.

## Fair play

You agree not to:
- enter false scores or results on purpose, or tamper with other people's matches;
- harass, threaten, bully or spam anyone, or send sexual content, especially to or about a child;
- upload someone else's ID documents or personal details;
- try to break, overload or get around the app's security.

We may remove content, limit messaging, or suspend accounts that break these rules. You can report content in the app.

## Scores and results

Scores are entered by users, so we can't guarantee they are correct. Organisers are responsible for their own tournaments and for deciding disputes. SportnNote isn't an official governing body.

## Liability

We provide the service with reasonable care and skill. We aren't responsible for losses that weren't foreseeable, for inaccurate user-entered information, or for events organised through the app.

**Nothing in these terms limits rights you have by law that can't be limited**, such as your rights as a consumer in your country, or our liability for death or personal injury caused by negligence, or for fraud.

## Ending

You can delete your account at any time (Settings → Delete my account). We may suspend accounts that break these terms.

## Law and disputes

If you use SportnNote as a consumer, the law of the country where you live applies to these terms, and you can bring a claim in your local courts. If you use SportnNote for a school, club or other organisation, the laws of India apply and the courts of Hyderabad, Telangana have jurisdiction, unless your written agreement with us says otherwise.

## Contact

**${LEGAL_CONTACT}**
`;

/** The privacy policy and terms for a country: India keeps its own text. */
export const privacyPolicyFor = (country: string): string => (country.toUpperCase() === 'IN' ? PRIVACY_POLICY : INTL_PRIVACY_POLICY);
export const termsFor = (country: string): string => (country.toUpperCase() === 'IN' ? TERMS : INTL_TERMS);
