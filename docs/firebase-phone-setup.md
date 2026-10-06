# Firebase SMS phone verification — setup (≈15 minutes, founder)

Why: Indian OTP SMS needs TRAI DLT registration (a registered business + ₹5,900).
Firebase sends the SMS under Google's registration, so phone numbers can be verified
now. Cost ≈ **$0.07 (≈₹6) per SMS** on the pay-as-you-go **Blaze** plan. Firebase is
only the SMS courier — our login stays Supabase. Works in the **web app** (iPhone
pilot). The Android app keeps its current path until a native module is added.

## Steps (Firebase console — https://console.firebase.google.com)
1. **Create a project** (or reuse the one planned for push notifications), e.g. "SportnNote".
   Google Analytics: optional (off is fine).
2. **Upgrade to Blaze** (Spark/free can't send SMS since Sept 2024) and immediately set a
   **budget alert** (Google Cloud → Billing → Budgets) — e.g. ₹1,000/month.
3. **Authentication → Get started → Sign-in method → Phone → Enable.**
4. **Authentication → Settings → SMS region policy → Allow only India** (plus any countries
   you need). Blocks SMS-pumping fraud to premium numbers abroad.
5. **Authentication → Settings → Authorized domains → Add** `sportnnote.expo.app`
   (`localhost` is there already for testing).
6. **Project settings → General → Your apps → Add app → Web (</>)** → name "SportnNote web"
   → copy the config values `apiKey`, `authDomain`, `projectId`, `appId`.

## Give the values to the app
Add to `.env.local.bak` (the live-keys file) — these are public web keys, not secrets:
```
EXPO_PUBLIC_FIREBASE_API_KEY=…
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=…firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=…
EXPO_PUBLIC_FIREBASE_APP_ID=…
```
And the server secret (after `npx supabase login`):
```
npx supabase secrets set FIREBASE_PROJECT_ID=<projectId> --project-ref mpgbvbylmkwasjgupsbq
npx supabase functions deploy verify-phone-firebase --project-ref mpgbvbylmkwasjgupsbq
```

## How it works (for reference)
Profile → contact card → mobile **Verify** → Firebase sends an SMS (invisible reCAPTCHA) →
user enters the code → app gets Firebase's signed ID token → `verify-phone-firebase` checks
Google's signature, freshness (≤10 min) and that the number matches the profile → sets
`phone_verified` (or the guardian's `phoneVerified`). The app can never set these itself.
