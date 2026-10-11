# One fixture, five matches: team ties, explained

| Field | Value |
|---|---|
| Publish | Tue 9 Feb 2027, 12:30 IST |
| Platform / format | Instagram carousel, 8 slides, 1080×1350 |
| Pillar | New feature (team ties: N rubbers, federation presets, lineups, stop at the majority, tie standings, one tie alert; live since 11 Oct 2026, SD-48) |
| Guide | https://sportnnote.in/guides/run-team-ties/ |
| Status | Draft – copy ready (awaiting founder approval) |
| AI | None. Graphic slides with real screenshots (demo data). |

"Racket and mind sports" week, in the free Tuesday Instagram slot. The day after the YouTube how-to (Mon 8 Feb) and the day before the LinkedIn post for schools (Wed 10 Feb). The founder's LinkedIn post "Chess, carrom and table tennis deserve real tables too" goes out the same morning at 09:30.

## Caption (post exactly)
```
Inter-house table tennis isn't one match. It's five. 🏓

SportnNote now runs team events as one tie:
👥 Pick the format: World Team Champs, Corbillon, Thomas / Uber Cup, Sudirman, Davis Cup, chess team matches, or build your own
📝 Both captains' lineups stay hidden until both are in
🎯 Score each rubber like any match
⏹ Settles itself at 3 of 5: knockouts stop, group ties play every rubber
📊 The table counts the tie once, with the federation's tie-breakers
🔔 One alert for the tie, not five

Table tennis, badminton, tennis, squash, chess, carrom, padel and pickleball.
Swipe 👉 Full how-to on our YouTube.

#SportnNote #TableTennis #Badminton #Chess #InterSchool #InterHouse #SchoolSports
```

## Hashtags
#SportnNote #TableTennis #Badminton #Chess #InterSchool #InterHouse #SchoolSports

## Slides

| # | Visual | Headline | Small line |
|---|---|---|---|
| 1 | 🏓 🏸 ♟️ icons on the brand background | One fixture. Five matches. | Team ties, the way federations run them → |
| 2 | **How the tie is played**: the preset list for table tennis and badminton | Pick the format | World Team Champs (ABC v XYZ), Corbillon, Olympic, Thomas / Uber, Sudirman, Davis Cup, 4 or 6 chess boards. Or custom rubbers. |
| 3 | **Enter our lineup** on a captain's phone: positions A, B, C with players picked; the other team shows **✓ In** | Sealed lineups | Each captain enters their own. The other side sees only ✓ In until both are in. Once a rubber starts, they lock. |
| 4 | A scoring screen with the banner **👥 Rubber 2 of 5 · View tie ›** | Every rubber is a normal match | Score it like any singles or doubles. View tie takes you back. |
| 5 | The tie page at **3–1**, the fifth rubber **Not played** | 3 of 5 decides | Settled the moment the 3rd rubber ends. Knockout ties stop; group ties play every rubber, because tie-breaks count them. |
| 6 | A chess tie: four boards, one ½–½, tie **2½–1½** | Chess: half points | Four or six boards. Boards by rating sets the order. 2½ of 4 wins. |
| 7 | A group table with the **R** column | The table counts the tie once | Rubbers won and lost, then the federation's tie-breakers. One alert for the tie, not one per rubber. |
| 8 | S:N logo | Run your inter-school team event | Full how-to on YouTube · guides at sportnnote.in/guides · @sportnnote |

## Alt text
An eight-slide carousel about team ties on SportnNote:
1. One fixture, five matches: team ties, the way federations run them.
2. Pick the format, such as World Team Champs, Corbillon, Thomas and Uber Cup, Sudirman Cup, Davis Cup or chess boards, or build custom rubbers.
3. Lineups stay hidden until both are in, and lock once a rubber starts.
4. Every rubber is scored like a normal match, with a banner showing Rubber 2 of 5.
5. A tie page at 3–1 with the fifth rubber marked Not played.
6. A chess tie on four boards with a draw, won 2½ to 1½.
7. A group table with a column for rubbers won and lost; one alert per tie.
8. Run your inter-school team event: guides at sportnnote.in/guides.

## Call to action
Watch the full how-to on YouTube (link in bio).

## Shot list and demo data
- **Account:** the marketing demo account, tournament **SportnNote Demo Meet 2026**. Re-use the how-to's demo ties (8 Feb): table tennis Red House v Blue House (World Team Champs, Stop), chess Green House v Yellow House (4 boards), and the four-house group with two ties finished.
- **Players:** fictional adults only (Ravi, Arjun, Kabir, Dev, Veer, Rahul, Imran, Sameer, Karan, Vikram, Asha Rao, Priya, Meera, Kavya, Nisha, Divya). Never type a real school's name, even in the "inter-school" slide.
- A small "Demo data" label on every screenshot slide. No photos of students; graphics and screens only.

## Pre-post checks
- **SD-127 (batch 6 update):** slides 3 and 5 and the caption's settle line need migration `20261019123500_team_tie_ops.sql` run on the live project (captain lineups, sealing, dead rubbers by stage). If it isn't, revert to host-entered lineups.
- **Build:** recheck in the frozen launch build: **How the tie is played**, the preset names (slide 2 uses short forms; the app labels are **World Team Champs · 5 singles (ABC v XYZ)**, **Corbillon · 4 singles + doubles**, **Olympic · doubles + 4 singles**, **Thomas / Uber Cup · 3 singles + 2 doubles**, **Sudirman Cup · 5 events (mixed team)**, **Davis Cup tie · 4 singles + doubles**, **Team match · 4 boards**), **Enter our lineup**, **✓ In**, **⏹ Always stop**, **▶️ Always play them**, **🔀 By stage (default)**, **👥 Rubber 2 of 5 · View tie ›**, **Not played**, **Boards by rating**, the **R** column.
- **One tie alert:** needs the redeployed `notify-followers` edge function. If it isn't live by posting day, drop "🔔 One alert for the tie, not five" from the caption and the last line of slide 7.
- **Sports list:** team ties cover table tennis, badminton, tennis, squash, chess, carrom, padel and pickleball (the guide). Don't add other sports.
- **Federation names:** used only to name formats. No federation logos.
