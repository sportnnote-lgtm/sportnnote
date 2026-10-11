# Sports day from the stands: medal alerts, champions and your house's page

| Field | Value |
|---|---|
| Publish | Wed 24 Feb 2027, 12:30 IST |
| Platform / format | Instagram carousel, 7 slides, 1080×1350 |
| Pillar | New feature (follower alerts for finals and records, champions by category, house event results, athlete profile header; SD-130/131, live since 11 Oct 2026) |
| Guides | https://sportnnote.in/guides/choose-your-alerts/ · /sports-day-champions-and-age-groups/ · /house-event-results/ |
| Status | Draft – copy ready (awaiting founder approval) |
| AI | None. Graphic slides with real screenshots (demo data). |

"Sports-day season" week. Upgrades the outlined row "Your athletics day, step by step": the organiser's step-by-step now lives in the YouTube walkthrough (21 Jan) and the LinkedIn toolkit post (13 Jan), so this carousel turns to the people in the stands and at work. Audience: students, parents and house captains. Pairs with Thursday's "Check this mark" Reel (25 Feb).

## Caption (post exactly)
```
Can't make it to sports day? You'll still know the moment the 100 m final is done. 📲

Follow an athlete, a house or the meet on SportnNote:
🥇 One alert when a final is locked: who won, the time, and if it's a record
🏆 Champions by category: champion house and individual champion for every age group
🏠 Your house's page: golds, silvers, bronzes, points, finals and the records it holds
👟 An athlete's profile that fits their sport: Events, Finals, Medals, PBs

Heats send nothing. Only finals, only once. 🙌

Tag the house captain who'll be refreshing all day 👇

#SportnNote #SportsDay #InterHouse #Athletics #Swimming #SchoolSports
```

## Hashtags
#SportnNote #SportsDay #InterHouse #Athletics #Swimming #SchoolSports

## Slides

| # | Visual | Headline | Small line |
|---|---|---|---|
| 1 | A phone lock screen with one alert: "🥇 Meera won Open Women 100 m in 12.95 — meet record" | Sports day, from anywhere | One alert per final. Swipe → |
| 2 | **Follow** on an athlete and on **Red House**; the **Result** alert switch on | Follow who matters | An athlete, a house or the whole meet. Keep **Result** on. |
| 3 | The alert opened → the final's result sheet with **MR** | Finals only. Once. | Heats and semis send nothing. A reopened final doesn't alert twice. |
| 4 | **🏆 Champions by category** → **Open Women**: champion house, individual champion, top five | Champions, by category | Champion house and individual champion for every age group, live as finals lock. |
| 5 | **Red House** page → **Event results**: 🥇 🥈 🥉, Points, Finals, **Latest results** | Your house's page | Every medal, every point, every final, without a single match played. |
| 6 | **Records held** on the house page, and an athlete profile header **Events · Finals · Medals · PBs** | Records and PBs | The records your house holds, and a profile made for runners and swimmers. |
| 7 | S:N logo | Follow your house | app.sportnnote.in · guides at sportnnote.in/guides · @sportnnote |

## Alt text
A seven-slide carousel about following a sports day in SportnNote:
1. A phone notification: a demo athlete won the 100 metres final in a meet record.
2. Following an athlete and a house with result alerts on.
3. The alert opens the final's result sheet; heats send no alerts.
4. Champions by category: champion house and individual champion.
5. A house page showing golds, silvers, bronzes, points, finals and latest results.
6. The records a house holds, and an athlete profile showing events, finals, medals and personal bests.
7. Follow your house on SportnNote.

## Call to action
Tag the house captain who'll be refreshing all day.

## Instagram Stories (same day)
- "This or that" sticker: "Watch from the stands / Follow from class 😅".
- Reshare slide 1 with a link sticker to /guides/choose-your-alerts/.

## Shot list and demo data
- **Account:** the marketing demo account, tournament **SportnNote Demo Meet 2026**, Athletics, the four houses, a demo follower account on a second phone.
- **Athletes:** fictional adults in the Open category only (Meera, Asha Rao, Priya, Kavya for Open Women; Ravi, Arjun, Kabir, Dev for Open Men). The guide's example says "U14 Girls"; don't copy it into the demo.
- **Alert (slide 1):** a real notification on the follower phone after locking the 100 m final; lock screen with no other notifications and a neutral wallpaper.
- A small "Demo data" label on every screenshot slide.

## Pre-post checks
- **Build:** recheck in the frozen launch build: **Follow**, the **Result** alert, **🏆 Champions by category**, **Event results**, **Latest results**, **Records held**, the profile tiles **Events**, **Finals**, **Medals**, **PBs**.
- **Migration + function (founder action):** final and record alerts need `20261019124310_event_result_alerts.sql` run and `notify-followers` redeployed after it. If they aren't live, swap slide 1 for the house page and drop slides 2–3 and the first caption line.
- **Combined events:** a decathlon or heptathlon alerts after its last event only. Not claimed; don't add "every event".
- **Minors:** families are the audience, not the cast. No real children, names or schools. Real-school use needs the usual consents before any screenshot of a real meet.
