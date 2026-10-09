---
title: Put a live score bar on your stream (OBS)
description: Add a free, live score bar to your YouTube or Facebook stream with OBS. Pick a style, add a sponsor logo, and paste one link.
category: Streaming & sharing
audience: Organisers
sports: all
order: 10
updated: 2026-10-09
---

When a college media club streams the inter-house final, viewers want to see the score on the video. SportnNote gives every match a free score overlay link. Add it to OBS once and the score bar updates by itself as the scorer taps. Big moments flash on screen too, such as a wicket, a six or a goal. There's no login and no extra app to install.

## Before you start
- You must be a host of the match or its tournament. Only hosts see the overlay settings.
- You need OBS Studio (free) on the computer that runs the stream. Other streaming software that has a "browser source" works the same way.
- Someone must score the match live in SportnNote. The overlay shows whatever the scorer records.

## Step by step: get the overlay link
1. Open the match → **Info** tab.
2. Tap **🎥 Score overlay for OBS** to open the card.
3. Pick a style: **Bar** (a full-width strip), **Pill** (a compact rounded score) or **Corner** (a small scorebug in the top-left corner).
4. For **Bar** or **Pill**, choose **Bottom** or **Top** of the screen.
5. Check the preview. Tap **⚡ Test flash** to see how a big moment will look.
6. Optional: under **Sponsor logo (optional)**, tap **Add sponsor** and pick the logo. It shows as "Powered by" next to the score. Tap **Remove** to take it off.
7. Under **Overlay link**, tap **Copy link**. Or tap **Open** to see the overlay in your browser.

> **Important:** Changing the style, position or sponsor changes the link. If you change anything, copy the new link and paste it into OBS again.

## Step by step: add it in OBS
1. In OBS, under Sources, click ＋ and choose **Browser**.
2. Paste the overlay link as the URL.
3. Set Width to `1920` and Height to `1080`. Leave the default Custom CSS as it is, because it keeps the page see-through.
4. Click OK. Move the browser source to the top of your sources list so it sits above the camera.

These steps are also printed on the card under **Add it in OBS**.

> **Tip:** Add the overlay and test it before the match starts. Before kick-off, the bar shows the two teams and the start time.

## What viewers see
- The team names, colours and the live score, with sport detail such as overs in cricket or the match clock in football.
- Flashes for big moments: **WICKET!**, **FOUR!** and **SIX!** in cricket, and **GOAL!** with the scorer and minute in football.
- During a break, the break is shown, for example "Rain break".
- After the match, the final result.

The overlay follows the live score a few seconds behind the scorer's taps.

## Common questions

### The score on my stream stopped updating. What do I do?
In OBS, right-click the browser source and choose **Refresh cache of current page**. Also check that the scorer's phone is online, because the overlay can only show taps that have uploaded.

### Does the overlay work for every sport?
Yes, it shows the score for any sport SportnNote scores. Cricket and football also show extra detail and flashes.

### Do I need to be signed in on the streaming computer?
No. The overlay link works without signing in. Anyone with the link can open it, so share it only with your stream team.

### Will the overlay remember my style next time?
Yes. Your style, position and sponsor are remembered on that phone or computer for your next match.

### My sponsor logo shows in the preview but not in OBS. Why?
The logo has to finish uploading before the link can carry it. If the card says "Preview only", add the logo again while you're online, then copy the new link.
