# The sports day toolkit: entries, timetable, printed sheets, record board, champions

| Field | Value |
|---|---|
| Publish | Wed 13 Jan 2027, 09:30 IST |
| Platform / format | LinkedIn text post + document post (PDF), 7 slides, 1080×1350, company page (founder reshares) |
| Pillar | Pilot and community + New feature (Wave C meet management, SD-128/129/130/131; live since 11 Oct 2026) |
| Guides | https://sportnnote.in/guides/manage-meet-entries/ · /meet-timetable-and-printing/ · /school-record-board/ · /sports-day-champions-and-age-groups/ |
| Status | Draft – copy ready (awaiting founder approval) |
| AI | None. Real screenshots with demo data; slide design only. |

Launch week, Wednesday. Upgrades the outlined row "Built for schools: run your sports day on it". Audience: PE heads and sports coordinators planning Republic Day and February sports days. The 24 Dec document post showed the scoring side (events, heats, house table); this one is the meet office around it: who's entered, when it runs, the paper the officials need, the record board, and who the champions are. It points to the full YouTube walkthrough on Thu 21 Jan. Launch-week rule: it carries the full pricing line.

## Post text (post exactly)
```
Every PE head knows the week before sports day. Entry slips from four houses. A timetable on chart paper. Start lists photocopied at 7 a.m. A record board nobody has updated since 2019. And on the day, someone asking "so who's the U14 champion?"

SportnNote went live on Monday. Here's the part of it we built for that week:

• Entries on one grid: every athlete of an age group against every event. Set your school's limit (say 3 individual + 1 relay); it warns, it never blocks. Paste a house's list straight from a spreadsheet.
• Late entries and scratches on the day: the late runner gets a free outside lane, the injured one is listed DNS with the reason.
• A timetable by day and session, with what's on NOW and NEXT. Running late? Move the whole session back 15 minutes in one tap. It flags athletes doubling up.
• A4 sheets to print: start lists with signature lines, field cards with trial boxes, results, the house table.
• Your record board, typed or pasted in once. A final only shows MR or SR when it really beats it.
• Champions by category: champion house and individual champion for every age group, shared as one message for assembly.
• Hand one event to one teacher: the long-jump teacher runs the long jump, and nothing else.

Seven slides below. Free while we're new; a small fee later, announced well in advance (30 days' notice).

Start here: https://sportnnote.in/guides/manage-meet-entries/

#SchoolSports #PhysicalEducation #SportsDay #Athletics #SportsAdministration
```

## Hashtags
#SchoolSports #PhysicalEducation #SportsDay #Athletics #SportsAdministration

## Document title
The sports day toolkit

## Slides

| # | Headline | Body (max 2 lines) | Screenshot (demo data) |
|---|---|---|---|
| 1 | The sports day toolkit | Entries · timetable · printed sheets · record board · champions. | Cover: the **Athletics** page of "SportnNote Demo Meet 2026" with **📋 Entries (athletes × events)**, **🗓 Timetable & print sheets** and **📖 Record board** buttons visible |
| 2 | Every entry on one grid | Athletes × events per age group. A school limit that warns, never blocks. Paste a whole house list. | **📋 Entries** grid, Open Men, counts like "2/3 + 1/1R" under names; the **School rule: 3 individual + 1 relay** chip |
| 3 | Late entry? Scratch? Sorted. | Late runner → a free outside lane. Scratched → DNS with the reason, lane left empty. | The **🗂 Entries** card: "Goes into heat 2, lane 8" line, and a scratched row "DNS · Injured" |
| 4 | A timetable that keeps up | NOW and NEXT for the day. Running late? +15 min moves the whole session. | **🗓 Timetable**, Day 1 tab, NOW / NEXT rows, the **+10 min / +15 min / +30 min** buttons, a **Doubling up** warning |
| 5 | Paper, when you need it | Start lists, field cards, results, house table. A4, printed from any computer. | The **Field-event cards** sheet for long jump (trial boxes, wind box) beside a start list with signature lines |
| 6 | Your record board, finally in | Type or paste your old records once. MR and SR only when they're really beaten. | **📖 Record board** → **Paste a list** with ✓ lines, then a results sheet with an **MR** tag |
| 7 | Champions, by category | Champion house and individual champion for every age group. One tap to share for assembly. | **🏆 Champions by category**, Open Women chip, champion house + individual champion, **↗ Share all champions** |

## Alt text (for the PDF)
A seven-slide document about running a school sports day office in SportnNote:
1. Cover: the sports day toolkit, with entries, timetable, printed sheets, record board and champions.
2. An entries grid of athletes against events, with a per-athlete event limit.
3. A late entry placed in heat 2, lane 8, and a scratched athlete listed as did not start with the reason.
4. A timetable with now and next, buttons to shift a session by 10, 15 or 30 minutes, and a doubling-up warning.
5. Printable A4 field cards and start lists.
6. A school record board pasted from a spreadsheet, and a result marked meet record.
7. Champion house and individual champion for a category, with a share button.

## Call to action
Read the entries guide (one link; the other guides are linked from it and from sportnnote.in/guides).

## Shot list and demo data
- **Account:** the marketing demo account, tournament **SportnNote Demo Meet 2026** (Hyderabad), Athletics added, houses Red, Blue, Green and Yellow House.
- **Categories:** use **Open** (Men / Women) only. The demo cast are fictional adults (Ravi, Arjun, Kabir, Dev, Veer, Rahul, Imran, Asha Rao, Priya, Meera, plus Sameer, Karan, Vikram, Kavya, Nisha, Divya where a grid needs more names), with adult dates of birth. Don't build U14 rows with invented children: the copy can name U14, the screens show Open.
- **Records (slide 6):** paste 4–6 made-up historic records with made-up holders from the demo cast (for example `100 m, Open Men, 11.42, Ravi, Red House, 2019`). No real school's records.
- **Printing (slide 5):** print from a computer at app.sportnnote.in (**Print / Save as PDF**). Photograph or screenshot the PDF, not a printed sheet with anything else on the desk.
- A small "Demo data" label in a corner of every screenshot slide.

## Pre-post checks
- **Build:** recheck in the frozen launch build: **📋 Entries (athletes × events)**, **School rule: 3 individual + 1 relay**, **📥 Bulk add — paste a list**, **🗂 Entries**, **＋ Late entry**, **✕ Scratch**, **🗓 Timetable & print sheets**, **NOW / NEXT**, **+10 min / +15 min / +30 min**, **Doubling up**, **Print sheets**, **Field-event cards**, **📖 Record board — add your school’s records**, **Paste a list**, **🏆 Champions by category**, **↗ Share all champions**, **Event officials (optional)**.
- **Migration:** the atomic record book (two finals locking at once, school records across meets) needs `20261019124330_field_record_book.sql` run on the live project. If it hasn't been run, keep the record-board bullet but don't claim "school records across every meet".
- **Printing on phones:** printing from the Android app needs APK 38 (until then the phone shares a WhatsApp text). The post says "printed from any computer", which is true today. If APK 38 is out before 13 Jan, the founder can change it to "from a computer or the app".
- **Pricing:** launch week, the full line is in. Keep it.
- **No competitor names; no school names; no pupils.**
