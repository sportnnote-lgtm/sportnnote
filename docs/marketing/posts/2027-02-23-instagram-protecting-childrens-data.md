# How we protect children's data

| Field | Value |
|---|---|
| Publish | Tue 23 Feb 2027, 12:30 IST |
| Platform / format | Instagram carousel, 8 slides, 4:5 |
| Pillar | Pilot and community (trust) |
| Guides | https://sportnnote.in/guides/parent-guardian-consent/ · https://sportnnote.in/guides/your-data-and-privacy/ · https://sportnnote.in/guides/import-a-roster/ |
| Status | Draft – copy ready (awaiting founder approval; gated on the live checks below) |
| AI | None. Designed slides with real app screens (demo data). |

"Sports-day season" week, in the free Tuesday Instagram slot (the only new Instagram post that week). The next day's carousel, "Sports day from the stands", shows parents the alerts and results; this one tells them what happens to their child's details first. Audience: parents and guardians, and the PE teachers who forward it to them.

**Tone rule (founder):** this is how we protect children, said plainly and positively. It never implies a past exposure, never says "now" or "we fixed", never names a security change, and makes no legal-compliance claim (the international privacy policy is still a draft for a lawyer). Every line describes how the app works today.

## Caption (post exactly)
```
Your child's sport, their records, their privacy. Here's how SportnNote looks after under-18s 👇

🛡 A parent or guardian for every child's account
🙈 Strangers see initials, not a child's full profile
💬 Coaches and organisers never message an under-18 directly. Messages go to the parent.
📒 Guardian contacts stay private, even when a school imports a whole class
⬇️ Download your child's data, or delete it, from your own account
📊 A child's activity is never linked to them in our analytics. No ads, ever.

Swipe for how it works. Questions? Ask in the comments, or read the guides at sportnnote.in/guides

#SportnNote #SchoolSports #Parenting #ChildSafety #SportsDay
```

## Hashtags
#SportnNote #SchoolSports #Parenting #ChildSafety #SportsDay

## Alt text
An eight-slide carousel titled "How we protect children's data". The slides explain that every under-18 account has a parent or guardian, that people outside a child's teams see initials and a jersey number instead of the full profile, that coaches cannot message children directly, that guardian contacts are private, that parents can download or delete their child's data, and that children's activity is never linked to them in analytics.

## Call to action
Ask your questions in the comments (the guides are linked in the caption).

## Slides

| # | Visual | Slide text |
|---|---|---|
| 1 | Title on the brand background, a small shield icon. No child imagery. | **How we protect children's data.** Privacy by default for every under-18 on SportnNote. |
| 2 | Phone screen: the sign-up step with the parent or guardian fields (demo data). | **A parent for every child.** Every account for someone under 18 needs a parent or guardian. In India, the parent ticks the consent box at sign-up. In other countries, the parent confirms from their own email. |
| 3 | Two cards side by side: the full player card (as the team sees it) and the initials card (as a visitor sees it), both demo. | **Strangers see initials.** Visitors who aren't signed in see a child as initials, a jersey number and their sports. The full profile is for their own teams, tournaments, school and parent. |
| 4 | Icon of a message bubble going to a parent. | **No direct messages to children.** Coaches and organisers can never message an under-18 player directly. Messages about a child go to their parent or guardian. |
| 5 | Phone screen: the roster import preview, with the guardian column highlighted (demo rows). | **Contacts belong to the parent.** When a school imports a class list, phone numbers and emails are saved on the guardian, never on the child. Only the guardian, the school's admins and coaches can see them. |
| 6 | Phone screen: **Settings → Link as a parent/guardian → Manage**, showing **👁️ View**, **⬇️ Download**, **✅ Confirm consent**, **Withdraw consent**, **Delete their data** (demo child). | **You're in charge.** Link your own account as the parent, then view, download or delete your child's data, or withdraw consent, whenever you like. |
| 7 | Simple list graphic. | **Small things, on purpose.** Age groups use the 1st or the last day of a month as the cut-off, so a child's birthday can't be worked out. A child's activity is never linked to them in our analytics. No ads. We never sell data. |
| 8 | End card: S:N logo. | **Your child's sport, their records, their privacy.** Read how it works: sportnnote.in/guides |

## Production notes
- Every app screen is recorded on the marketing demo account. The "child" on slides 3, 5 and 6 is a clearly fictional demo profile (for example "Demo Player A", initials "D.A.", jersey 7), with no photo. Don't invent a realistic child with a name, school and face.
- No photos of children anywhere in the carousel, even stock.
- Plain, warm language. No fear words ("danger", "predators", "leak", "breach").

## Pre-post checks
- **Live checks (gate):** the privacy work is in DEVLOG (12 Oct 2026, SD-148 and SD-152). Before scheduling, confirm with the founder that these are run on live: `20261019124600_protect_minors.sql`, `20261020120000_privacy_rights.sql`, and the `guardian-consent` and `privacy-retention` functions deployed (PROGRESS.md "Founder live steps"). If any isn't live, hold the post.
- **Wording checks, line by line against the guides:**
  - Slide 2: India consent box at sign-up, email confirmation elsewhere (parent-guardian-consent).
  - Slide 3: "initials, a jersey number and their sports" for logged-out visitors (DEVLOG SD-148: initials + jersey/sports/house). Signed-in people outside the child's circle see a reduced card; the slide doesn't go into that. Keep "full profile is for their own teams, tournaments, school and parent".
  - Slide 4: "Coaches and organisers can never message an under-18 player directly" (parent-guardian-consent, Common questions).
  - Slide 5: contacts only on the guardian; visible to the guardian, school admins and coaches (import-a-roster).
  - Slide 6: the five Manage options (parent-guardian-consent). "Withdraw consent" locks the account; don't add more.
  - Slide 7: month-start/month-end cut-offs (DEVLOG SD-130); under-18 analytics never linked; no ads, never sell data (your-data-and-privacy).
- **Don't say:** "compliant with" any law (DPDP, GDPR, COPPA): the international policy is a lawyer's draft. Don't say "on-device", "encrypted" or "can never be seen by anyone"; don't mention ID-proof handling or sign-up role changes; no "now", "new" or "we fixed".
- **Data location:** not mentioned. If someone asks in the comments, the guide's answer is "servers in Mumbai, India".
- **Minors:** no children's photos, names or schools, demo or real.
