# How to share SportnNote

*Updated 2026-10-07.*

## Now (pilot, free)

| | iPhone | Android |
|---|---|---|
| **What they get** | The web app | The APK (full app), or the web app |
| **Link** | **app.sportnnote.in** (or the QR `docs/share/sportnnote-web-qr.png`) | The APK link from the latest EAS build, or app.sportnnote.in |
| **Install** | Open in **Safari** → Share → **Add to Home Screen**. It opens full-screen like an app. | Open the APK link → Download → allow "Install unknown apps" for the browser when asked → Install. |
| **Updates** | Automatic: every `npm run web:publish` is live on next open. | Code-only changes: `eas update` reaches installed APKs on next open, no reinstall. New native features: a new APK to send. |
| **Missing** | No background push notifications, no QR scanning | Nothing |
| **Cost** | Free | Free |

**Message to send friends:**

> I'm piloting SportnNote, an app to score our matches and run tournaments.
> iPhone: open app.sportnnote.in in Safari → Share → Add to Home Screen.
> Android: install from <APK link>, or use app.sportnnote.in.
> Sign up with your email, then add your phone on your profile and tap Verify.

## Later (stores)

**iPhone (App Store via TestFlight):**
- Needs an **Apple Developer account**, about ₹8,700/year.
- Enrol it as the **company** (needs a D-U-N-S number) so the listing shows the company
  name, not a person. So: after the Pvt Ltd is formed.
- **TestFlight:** up to 10,000 testers by link; review takes about a day.
- **App Store:** after that.

**Android (Google Play):**
- A **Play Console account** costs $25 once.
- Open it as an **organisation** (after the company is formed). New *personal* accounts must
  run a closed test with 12+ testers for 14 days before going public; organisation accounts
  don't.
- Start on the internal testing track, then production.

**Until the stores:** iPhone users stay on the web app and Android users on the APK. All of
them use the same live data and accounts, so nothing is lost when they move to the store
apps.
