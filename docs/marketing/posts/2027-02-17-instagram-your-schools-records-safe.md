# Your school's records, safe

| Field | Value |
|---|---|
| Publish | Wed 17 Feb 2027, 12:30 IST |
| Platform / format | Instagram carousel, 8 slides, 1080×1350 |
| Pillar | New feature (school record board + atomic records, re-sync, PB/SB/MR/SR; SD-130, live since 11 Oct 2026) |
| Guide | https://sportnnote.in/guides/school-record-board/ |
| Status | Draft – copy ready (awaiting founder approval) |
| AI | None. Graphic slides with real screenshots (demo data). |

"Careers and records" week. Upgrades the outlined row "PB, SB, MR, SR: personal bests and records explained": slide 2 keeps that explainer, and the rest shows why those letters can now be trusted. Tuesday's carousel (16 Feb) covered match records in team sports; this one is the record board of athletics, swimming and the other event sports. Audience: students, families and alumni who care whose name is on the board.

## Caption (post exactly)
```
Every school has one. A record board in the corridor, names going back years. 📜

On SportnNote it isn't a photo on the wall any more:
📖 Your PE teacher enters the old board once, typed or pasted
🏅 A final only shows MR (meet record) or SR (school record) when it really beats it
⚡ Two finals locking at the same moment? Both records are kept
↺ A final reopened? The record goes back to whoever held it
📶 Signal dropped while saving? Nothing is lost: one tap re-sends it

So when your name goes up, it stays up. 🙌

Swipe 👉 Whose record does your house want to break this year?

#SportnNote #SportsDay #Athletics #Swimming #SchoolSports #InterHouse #Records
```

## Hashtags
#SportnNote #SportsDay #Athletics #Swimming #SchoolSports #InterHouse #Records

## Slides

| # | Visual | Headline | Small line |
|---|---|---|---|
| 1 | A stylised wooden record board with names in gold (illustration, made-up names from the demo cast) | Your school's records, safe | From the corridor wall to the app → |
| 2 | Four tags as on a result sheet: **PB**, **SB**, **MR**, **SR** | What the letters mean | PB: your best ever. SB: your best this season. MR: best at this meet. SR: best at any meet your school runs. |
| 3 | **📖 Record board** → **Paste a list** with ✓ lines | Enter the board once | Your PE teacher pastes the old records: event, category, mark, holder, house, year. |
| 4 | A result sheet with **MR** next to a time, and the lock check "New meet record … (was 13.10 by Meera, 2018)" | Only real records | Without the board, the first final always "sets a record". With it, only a better mark does. |
| 5 | Two event cards locking at once: 100 m and long jump, both with **MR** | Two finals, one moment | The track and the jumps pit lock together. Both records are kept. Neither phone overwrites the other. |
| 6 | **↺ Reopen final**, then the board showing the old holder back | Reopened? Given back | Reopen a final and the record returns to whoever held it before, old board records included. |
| 7 | The red notice and **Retry saving results to profiles** | Lost signal? Not lost | Results and places are saved first. One tap re-sends the rest to every athlete's profile. |
| 8 | S:N logo | When your name goes up, it stays up | Guide at sportnnote.in/guides · @sportnnote |

## Alt text
An eight-slide carousel about school records in SportnNote:
1. Your school's records, safe: from the corridor wall to the app.
2. What PB, SB, MR and SR mean.
3. A PE teacher pastes the old record board into the app.
4. A result marked meet record only when it beats the old record, with the old holder shown.
5. Two finals locked at the same moment both keep their records.
6. Reopening a final gives the record back to its previous holder.
7. If the signal drops while saving, one tap re-sends the results to athletes' profiles.
8. When your name goes up, it stays up.

## Call to action
Comment: whose record does your house want to break this year?

## Instagram Stories (same day)
- Poll sticker: "Is your school's record board up to date?" Yes, every year / It stopped in 20XX 😅.
- Question sticker: "Oldest record at your school? Event + year" (no names of students, reshare answers without names).

## Shot list and demo data
- **Account:** the marketing demo account, tournament **SportnNote Demo Meet 2026**, Athletics, the four houses.
- **Board:** made-up historic records held by the demo cast (fictional adults), Open category only, for example `100 m, Open Women, 13.10, Meera, Red House, 2018`. No real school's records or real names, even on the slide-1 illustration.
- **Slide 5:** lock the 100 m and the long jump on two phones within a second of each other; both should show **MR**.
- **Slide 7:** turn on airplane mode while locking a final to make the red notice appear, then retry.
- A small "Demo data" label on every screenshot slide.

## Pre-post checks
- **Build:** recheck in the frozen launch build: **📖 Record board — add your school’s records**, **Meet records (this meet)**, **School records (every meet)**, **Paste a list**, **🏁 Finish & lock results**, **↺ Reopen final**, **Retry saving results to profiles**, **↻ Re-sync results to profiles**, the **MR**, **SR**, **=MR**, **PB**, **SB** tags.
- **Migration:** slides 5 and 6 and the "two finals" caption line need `20261019124330_field_record_book.sql` run on the live project. If it isn't, cut slide 5 and that caption line.
- **SR definition:** school records show only when the meet is hosted by the school's organisation; slide 2's wording ("any meet your school runs") matches that. Don't widen it to "any meet".
- **Wind and hand times:** marks with wind over +2.0, or unconfirmed out-of-range times, never set records. Not on the slides; don't contradict it.
- **Minors:** students are the audience, not the cast. No real names, faces or schools.
