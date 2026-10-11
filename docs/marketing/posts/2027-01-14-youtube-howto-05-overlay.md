# YouTube How-to #5: Livestream your match with a score overlay

| Field | Value |
|---|---|
| Publish | Thu 14 Jan 2027, 10:00 IST (Short: same day 18:00) |
| Platform / format | YouTube long video, ~6 min, 16:9 + one Short (9:16) |
| Pillar | How-to |
| Guide it mirrors | [Put a live score bar on your stream (OBS)](https://sportnnote.in/guides/live-score-overlay/) |
| Status | Draft – awaiting founder approval |
| Presenter | AI presenter (picture-in-picture, bottom right) + AI voice, over real screen recordings (phone and computer) |

## Title
Livestream your match with a live score overlay (OBS) | SportnNote how-to #5

## Description (post exactly)
```text
Put a live score bar on your YouTube or Facebook stream. Every SportnNote match has a free score overlay link: pick a style (Bar, Pill or Corner), add a sponsor logo, copy the link into OBS as a browser source, and the score updates by itself as the scorer taps. Wickets, fours, sixes and goals flash on screen. No login on the streaming computer, no extra app.

Every sport on SportnNote has a live overlay: cricket, football, hockey, handball, basketball, volleyball, kabaddi, tennis, badminton, table tennis, squash, padel, pickleball, carrom, chess, golf, athletics, swimming, weightlifting, shooting, archery, rowing, canoe sprint and cycling.

SportnNote is open to everyone at https://app.sportnnote.in. Free while we're new; a small fee later, announced well in advance (30 days' notice).

Written steps: https://sportnnote.in/guides/live-score-overlay/
More guides: https://sportnnote.in/guides/

Chapters
0:00 Your score, on your stream
0:20 What you need
0:45 Get the overlay link
1:15 Styles: Bar, Pill and Corner
2:05 Add a sponsor logo
2:35 Test flash
2:55 Add it in OBS
4:00 Go live: what viewers see
4:45 Troubleshooting
5:40 What's next

AI disclosure: the presenter and the voice in this video are AI-generated. Every app screen is a real recording of SportnNote, using demo teams and demo players (no real students).

#SportnNote #Livestream #SchoolSports
```

## Tags
sportnnote, live score overlay, obs score overlay, obs browser source scoreboard, livestream school sports, youtube live cricket score, live football score bar, streaming scoreboard free, college media club streaming, sports livestream india

## Thumbnail
- **Layout:** a 16:9 frame of an empty ground with the SportnNote score bar along the bottom and a big **GOAL!** flash.
- **Text:** "LIVE SCORE ON YOUR STREAM".
- **Branding:** the S:N logo, top left.
- **No face** on the thumbnail.

## AI disclosure settings
- YouTube Studio → "Altered or synthetic content" = **Yes**: the AI presenter is a realistic-looking person and the voice is synthetic.
- Keep the disclosure line in the description.

## Script (end to end)

Times are targets for the edit. "VO" is the AI voice-over, word for word. Screen = what to record: phone shots at 1080×2400 framed in a 16:9 canvas, and computer screen recordings of OBS at 1920×1080, with the presenter bottom right. A small "Demo data" label sits top left for the whole video.

| Time | Screen (what to record) | On-screen text | VO |
|---|---|---|---|
| 0:00 | Hook: an OBS preview of an empty ground with the **Bar** along the bottom: Red House 1 – 0 Blue House, the match clock. A **GOAL!** flash plays with the scorer and minute. | Your score. On your stream. | When your media club streams the inter-house final, viewers want the score on screen. Here's how to add a live score bar that updates by itself, in about five minutes. |
| 0:12 | Presenter full frame. | How-to #5 | I'm your SportnNote guide. Let's put the score on your stream. |
| 0:20 | A simple diagram: scorer's phone → SportnNote → overlay link → OBS → YouTube. | What you need | You need three things. First, you must be a host of the match or its tournament. Only hosts see the overlay settings. Second, OBS Studio, which is free, on the computer that runs the stream. Any software with a browser source works the same way. And third, someone scoring the match live in SportnNote. The overlay shows whatever the scorer records. |
| 0:45 | On the host's phone: open the match → **Info** tab. Tap **🎥 Score overlay for OBS**. The card opens with a preview. | Info → 🎥 Score overlay for OBS | Open the match and go to the Info tab. Tap Score overlay for OBS. The card opens with a preview of how the score will look. |
| 1:00 | Scroll the card: style chips, position, preview, **Sponsor logo (optional)**, **Overlay link** with **Copy link** and **Open**, and **Add it in OBS**. | Everything on one card | Everything is on this one card: the style, the position, a sponsor, and the link you'll paste into OBS. |
| 1:15 | Tap **Bar**. The preview shows a full-width strip. Tap **Bottom**, then **Top**. | Bar · Bottom / Top | There are three styles. Bar is a full-width strip, with the team names, colours and the score. You choose bottom or top of the screen. |
| 1:35 | Tap **Pill**. The preview shows a compact rounded score. | Pill | Pill is a compact, rounded score. It also goes at the bottom or the top. |
| 1:45 | Tap **Corner**. The preview shows a small scorebug in the top-left corner. | Corner | Corner is a small scorebug in the top-left corner. It's good when you don't want to cover the play. |
| 1:55 | Tap back to **Bar** and **Bottom**. | We'll use Bar · Bottom | We'll use the bar, at the bottom. |
| 2:05 | Under **Sponsor logo (optional)**, tap **Add sponsor** → pick the demo sponsor logo. The preview shows "Powered by" next to the score. Point at **Remove**. | Sponsor logo (optional) | Got a sponsor for the final? Under Sponsor logo, tap Add sponsor and pick the logo. It shows as powered by, next to the score. Tap Remove to take it off. |
| 2:25 | Text card over the preview. | Changed anything? Copy the link again. | One important thing. Changing the style, the position or the sponsor changes the link. So if you change anything, copy the new link and paste it into OBS again. |
| 2:35 | Tap **⚡ Test flash**. The preview plays a big-moment flash. | ⚡ Test flash | Tap Test flash to see how a big moment will look on screen. |
| 2:45 | Under **Overlay link**, tap **Copy link**. Point at **Open**. | Overlay link → Copy link | Happy with it? Under Overlay link, tap Copy link. Or tap Open to see the overlay in your browser. Send the link to the computer that runs the stream. |
| 2:55 | Computer: OBS Studio. Under Sources, click ＋ → **Browser**. Name it "SportnNote score". | OBS → Sources → ＋ → Browser | Now OBS. Under Sources, click the plus and choose Browser. |
| 3:10 | Paste the overlay link as the URL. Set Width `1920`, Height `1080`. Point at the default Custom CSS; don't change it. Click OK. | URL · 1920 × 1080 · leave Custom CSS | Paste the link as the URL. Set the width to nineteen twenty and the height to ten eighty. Leave the custom CSS as it is. It keeps the page see-through, so only the score bar shows. Click OK. |
| 3:35 | Drag the browser source to the top of the Sources list. The bar appears over the camera shot. | Move it to the top | Move the browser source to the top of your sources list, so it sits above the camera. There's your score bar. |
| 3:45 | Phone: the card's **Add it in OBS** steps. Then the OBS preview before kick-off: the bar shows the two teams and the start time. | Steps are on the card · Test before the match | These steps are printed on the card too, under Add it in OBS. Set it up and test it before the match. Before kick-off, the bar shows the two teams and the start time. |
| 4:00 | Split screen: the scorer's phone on the left, the OBS preview on the right. Scorer taps **Kick off**, then **Goal — Red House** → **Ravi**. A few seconds later the bar updates to 1–0 and **GOAL!** flashes with Ravi and the minute. | GOAL! with the scorer and minute | Now the match is on. The scorer taps a goal on the phone, and a few seconds later the bar updates and a goal flash plays, with the scorer and the minute. |
| 4:20 | Cut to a cricket demo match in OBS: the bar shows overs; a **SIX!** flash. Then a badminton result: games won and each game's score. Then a "Rain break" bar. | Every sport · breaks · results | Every sport has a live overlay. Cricket shows the overs, with wicket, four and six flashes. Set and game sports show each set's score. A break shows as a break, and after the match, the final result. |
| 4:45 | OBS: right-click the browser source → **Refresh cache of current page**. | Stuck? Refresh cache of current page | Now, troubleshooting. If the score stops updating, right-click the browser source in OBS and choose Refresh cache of current page. |
| 4:58 | Phone: the scorer's sync state. | Is the scorer's phone online? | Also check the scorer's phone is online. The overlay can only show taps that have uploaded. |
| 5:07 | Phone: the sponsor area showing "Preview only". | Logo missing? Add it again, online | If your sponsor logo shows in the preview but not in OBS, the card may say preview only. The logo has to finish uploading first. Add it again while you're online, then copy the new link. |
| 5:22 | Text card. | No sign-in needed · Share the link only with your stream team | The streaming computer doesn't need to sign in. Anyone with the link can open it, so share it only with your stream team. And your style, position and sponsor are remembered on that phone or computer for your next match. |
| 5:40 | Presenter full frame. End screen: two video cards (#6 Fix a mistake and correct a finished match, #4 Run an athletics sports day) + Subscribe. | sportnnote.in/guides | That's a live score on your stream. The written steps are at sportnnote dot in slash guides. Next: how to fix a mistake, during a match and after it. Open app dot sportnnote dot in. Free while we're new; a small fee later, announced well in advance, with thirty days' notice. See you there. |
| 6:00 | End. | | |

## Shot list and demo data
1. **Account:** the marketing demo account, signed in on the host's phone (a host of the match). The streaming computer is not signed in.
2. **Match:** a football friendly, Red House v Blue House, 7-a-side, with Priya (fictional adult demo scorer) scoring on a second phone. Red House: Kabir (GK), Ravi, Arjun, Veer, Sameer, Rohan, Neil. Blue House: Imran (GK), Dev, Rahul, Karan, Vikram, Suhas, Nikhil.
3. **Extra clips:** a demo cricket match (Red House v Blue House) with a six, a demo badminton match result, and a demo match on a "Rain break". Demo names only; never the FIFA World Cup replay data.
4. **Sponsor logo:** a made-up "Demo Sponsor" placeholder logo designed in-house. Never a real company's logo or name.
5. **Camera shot:** an empty ground, or a stock-free shot we filmed ourselves, with no people in it.
6. **Computer:** OBS Studio on a clean desktop: no personal files, tabs, notifications or stream keys on screen. Hide the stream key field if the Settings window is ever shown.
7. **Overlay link:** blur or crop the full link in every shot, so the demo match link isn't published.
8. **Overlay label:** "Demo data" in small text, top left, for the whole video.

## YouTube Short
- **Publish:** Thu 14 Jan, 18:00. 9:16, 25 s, cut from 4:00–4:20 and 2:45–3:35 (vertical crop of the OBS preview, phone inset).
- **Title:** GOAL! on your stream, live #shorts
- **On-screen text:** "Tap a goal on the phone…" … "…it flashes on your stream" … "One link in OBS" … "Full guide on our channel".
- **VO:** "The scorer taps a goal on the phone. Seconds later, it flashes on your stream, with the scorer and the minute. It's one link: copy it from the match, paste it into OBS as a browser source, done. SportnNote, at app dot sportnnote dot in."
- **Description:** "Full overlay how-to on our channel. Guide: https://sportnnote.in/guides/live-score-overlay/ · Free while we're new; a small fee later, announced well in advance (30 days' notice). AI-generated voice; real app screens with demo data. #SportnNote #Livestream #Football"
- **Disclosure:** "Altered or synthetic content" = Yes.

## Pre-post checks
- Recheck every button label against the frozen launch build (23 Nov–6 Dec). Labels here come from the overlay guide as of 10 Oct 2026.
- The guide only promises cricket and football flashes and the set-sport result line. Confirm the 4:20 clips (cricket six, badminton result, rain break) look as described in the frozen build.
- Confirm the "Preview only" text on the sponsor area still appears as the guide describes.
- OBS labels (Sources, ＋, Browser, Width, Height, Custom CSS, Refresh cache of current page) are OBS Studio's own; recheck against the OBS version used for recording.
- No real overlay link, stream key or personal desktop item is visible anywhere.
- Check that every "free" sits with the full "small fee later, 30 days' notice" line. The description calls the overlay "free" as the guide does: keep the pricing line next to it.
