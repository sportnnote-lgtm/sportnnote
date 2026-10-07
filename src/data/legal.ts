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
- **Profiles of under-18 players are only visible to signed-in members.**
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
