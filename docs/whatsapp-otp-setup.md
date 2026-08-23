# WhatsApp phone verification (Meta Cloud API)

Phone OTP works exactly like email OTP — the app generates a 6-digit code, stores
a hash in `contact_otps` (10-min expiry), and `verify-contact-otp` checks it and
flips `phone_verified`. The only new piece is **delivery over WhatsApp** via the
Meta Cloud API. We send the code inside an **approved authentication template**.

## One-time Meta setup (you)

1. **Meta app + WhatsApp product** — at <https://developers.facebook.com> create an
   app (Business type) and add the **WhatsApp** product. This gives you a test
   sender number and a **Phone Number ID**.
2. **Access token** — for production use a **System User** permanent token (Business
   Settings → Users → System users → generate token) with `whatsapp_business_messaging`
   permission. (The dashboard's temporary token works for a quick test but expires
   in ~24h.)
3. **Authentication template** — WhatsApp → Message Templates → **Create** →
   category **Authentication**. Name it **`sportnnote_otp`** (or anything — set the
   name as a secret below), language **English** (`en`). Use the standard
   authentication template: a body that includes the `{{1}}` code and the built-in
   **copy-code button**. Submit and wait for approval (usually minutes–hours).
4. **Business verification** — sending to arbitrary numbers at volume needs Meta
   Business Verification. For testing you can add recipient numbers as **test
   numbers** on the app first.

## Secrets (Supabase)

Set on the project, then redeploy the function:

```bash
npx supabase secrets set "WHATSAPP_TOKEN=YOUR_PERMANENT_TOKEN" --project-ref mpgbvbylmkwasjgupsbq
npx supabase secrets set "WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID" --project-ref mpgbvbylmkwasjgupsbq
# Optional — only if your template name/language differ from the defaults:
npx supabase secrets set "WHATSAPP_OTP_TEMPLATE=sportnnote_otp" --project-ref mpgbvbylmkwasjgupsbq
npx supabase secrets set "WHATSAPP_TEMPLATE_LANG=en" --project-ref mpgbvbylmkwasjgupsbq
```

## Deploy the function

```bash
npx supabase functions deploy send-contact-otp --project-ref mpgbvbylmkwasjgupsbq
```

## How it behaves

- Profile → your contact card → **Verify** on the phone row → the app calls
  `send-contact-otp` with `channel: 'phone'` → Meta delivers the code on WhatsApp →
  you enter it → `verify-contact-otp` flips `phone_verified`.
- If WhatsApp isn't configured yet (or a send fails), the app falls back to the
  on-screen labelled code, so nothing breaks before setup is done.
- The recipient number is read from the player row (never client-supplied) and
  sent to Meta as digits only (no `+`).

## Troubleshooting

`send-contact-otp` returns `{ sent, reason, detail }`; `reason` surfaces the cause:
- `no-whatsapp-config` — `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` not set.
- `no-phone` — the player has no usable phone number saved.
- `whatsapp-<status>` (+ `detail`) — Meta rejected the send (common: template not
  approved / wrong name or language, recipient not a test number pre-verification,
  or an expired token). The detail is logged in the function logs.
