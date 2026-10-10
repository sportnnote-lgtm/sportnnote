# A typo shouldn't become a meet record

| Field | Value |
|---|---|
| Publish | Thu 18 Feb 2027, 09:30 IST |
| Platform / format | LinkedIn text post + 2 screenshots, company page |
| Pillar | New feature (SD-112 athletics and swimming result-entry safety; live since 11 Oct 2026) |
| Guide | https://sportnnote.in/guides/run-athletics-track-events/ (also /run-athletics-field-events/, /run-a-swim-meet/) |
| Status | Draft – copy ready (awaiting founder approval) |
| AI | None. Real screenshots with demo data. |

"Careers and records" week. Leads into the sports-day season week and the Instagram Reel "1053 isn't 10.53" on Thu 25 Feb.

## Post text (post exactly)
```
A mistake that happens at sports days everywhere: the 800 m winner runs 2:15.30. Someone types 2153. The system reads 21.53 seconds, and the school has a meet record faster than the world record by more than a minute.

SportnNote now knows what's plausible for each event, and for each pool length in swimming:

• A mark outside the usual range is never refused, but it asks first: "Check this mark", with the usual range. Re-enter it, or confirm it if it's real.
• Until someone confirms it, it can't be a PB, a season's best or a meet record.
• Hand-timed? With Hand on, the last digit is the tenth: 2153 is 2:15.3.
• Before a final is locked, the check lists empty lanes, unconfirmed marks and every new meet record next to the one it replaces.
• Locked the wrong result? An organiser can reopen the final. Any record it set goes back to the previous holder, and its house points come off until it's locked again.

Records should mean something. Especially the ones a student will remember for years.

Running a track meet, step by step: https://sportnnote.in/guides/run-athletics-track-events/

#SchoolSports #PhysicalEducation #SportsEducation
```

## Hashtags
#SchoolSports #PhysicalEducation #SportsEducation

## Images
1. The 800 m final's **Enter results** screen with the **Check this mark** sheet: "21.53 looks too fast for the 800 m — the usual range is …", with **No, re-enter it** and **Yes, save 21.53**.
   - **Alt text:** SportnNote's athletics results screen. A sheet titled Check this mark says 21.53 looks too fast for the 800 metres and shows the usual range, with buttons No, re-enter it and Yes, save.
2. The **🏁 Finish & lock results** check: "New meet record: 2:15.30 by Meera (was 2:16.40)", with **No, keep entering** and **Yes, finish & lock**.
   - **Alt text:** The finish-and-lock check for an 800 metres final, listing a new meet record of 2:15.30 and the previous record of 2:16.40, with buttons No, keep entering and Yes, finish and lock.

## Call to action
Read the track events guide.

## Shot list and demo data
- **Account:** the marketing demo account, tournament **SportnNote Demo Meet 2026**, houses Red, Blue, Green and Yellow.
- **Event:** 800 m final, 8 fictional adult demo athletes (Meera, Asha Rao, Priya and others). Before recording, lock an earlier 800 m so the meet record stands at 2:16.40.
- **Screenshot 1:** type 2153 in lane 4 and tap **Next ›** so the sheet opens. Tap **No, re-enter it**, type 21530 (2:15.30).
- **Screenshot 2:** fill the other lanes, tap **🏁 Finish & lock results** and screenshot the check. Tap **No, keep entering** if the event is needed for the Reel on 25 Feb.
- Even demo athletes have no photos and no school names. A small "Demo data" label on both screenshots.

## Pre-post checks
- **Build:** SD-112 shipped on 11 Oct 2026. Recheck in the frozen launch build: **Check this mark**, **No, re-enter it**, **Yes, save …**, **Hand**, **🏁 Finish & lock results** wording, **↺ Reopen final**.
- **Range line:** copy the exact "looks too fast … the usual range is …" wording from the screen into the alt text if it differs.
- **Fact check:** the senior men's 800 m world record is 1:40.91, so 21.53 is over a minute faster. Keep "more than a minute".
