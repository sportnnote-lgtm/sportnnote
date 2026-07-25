# Turning on live support (phase 2)

The in-app help centre already works today in demo mode: the **knowledge base**
(18 articles + search) and **"Contact support"** (opens a pre-filled email to
`hrudhaypvtemp@gmail.com`) need nothing wired up.

Phase 2 adds two things, both of which run as **Supabase Edge Functions** so no
API key ever ships inside the app:

1. **AI answers** — `support-assistant` forwards a question (grounded in the
   matched help articles) to Claude and returns a written answer.
2. **Server-side case recording + auto-email** — `support-escalate` saves the
   case to a `support_cases` table and emails a copy to you via Resend, so you
   don't depend on the reporter's mail client.

Both are **dormant until you complete the steps below.** Nothing here changes the
demo; the app keeps falling back to the knowledge base + mailto until the
functions are deployed and the secrets are set.

---

## Prerequisites

These require the app to be running in **live mode** — i.e. a Supabase project
is configured (`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
`.env`). Edge functions run *on* Supabase, so this is the same "go live" step on
the launch plan. If you're still demo-only, do that first; the code below is
ready and waiting.

You'll also need the Supabase CLI once:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

---

## Step 1 — Create the `support_cases` table

It's already in `supabase/schema.sql`. Apply it to your project (via the SQL
editor in the Supabase dashboard, or `supabase db push`). Just the new table if
you prefer to paste it manually — copy the `create table ... support_cases` and
its RLS policy from `supabase/schema.sql`.

## Step 2 — Get a Claude API key (for AI answers)

1. Go to **console.anthropic.com** → sign in (or create an Anthropic account).
2. **Billing** → add a payment method. (Support answers are cheap — each is a
   short, grounded request — but the API needs billing enabled.)
3. **API keys** → **Create key** → copy it (starts with `sk-ant-`).

Set it as a secret (never commit it):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

> The function defaults to `claude-opus-4-8`. If you'd rather trade a little
> answer quality for lower cost/latency on the support bot, change `MODEL` in
> `supabase/functions/support-assistant/index.ts` to `claude-haiku-4-5`.

## Step 3 — Get an email sender (for auto-emailing you)

We use **Resend** (resend.com) — one HTTP call, free tier ~3,000 emails/month.

1. Sign up at **resend.com**.
2. **API Keys** → **Create** → copy it (starts with `re_`).
3. (Optional but recommended) **Domains** → add & verify a domain so mail comes
   from e.g. `support@yourdomain.com`. Until you do, use Resend's shared sender
   `onboarding@resend.dev` (fine for testing; may land in spam).

Set the secrets:

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set SUPPORT_EMAIL=hrudhaypvtemp@gmail.com
supabase secrets set SUPPORT_FROM="Sportfolio Support <onboarding@resend.dev>"
```

> Prefer SendGrid/Postmark/etc.? Swap the one `fetch(...)` call in
> `supabase/functions/support-escalate/index.ts` (`sendEmail`) — the rest is
> provider-agnostic.
>
> If you skip Resend entirely, `support-escalate` still **records** every case in
> `support_cases` and returns `delivered:false`, so the app falls back to opening
> a pre-filled email — nothing breaks, you just read cases from the dashboard.

## Step 4 — Deploy the functions

```bash
supabase functions deploy support-assistant
supabase functions deploy support-escalate
```

That's it. The app auto-detects them: `core/supportAI.ts` and
`data/repos.ts → submitSupportCase` call `supabase.functions.invoke(...)`
whenever Supabase is configured. No app rebuild or endpoint URL to paste in.

---

## Verifying

- **AI answers:** in the app (live build) open **Settings → Help & support**,
  type a question, tap **"Ask the assistant"** — you should get a written answer.
  If the function isn't deployed or the key is missing, it silently falls back to
  the knowledge-base results (by design).
- **Escalation:** tap **"Contact support"**. In live mode with Resend set up you
  should see **"Sent to support"** and receive the email; a row also appears in
  `support_cases`. Without Resend, it opens a pre-filled email instead.

## Changing the support address later

When you buy a domain + custom mailbox, update **one** place for the mailto
fallback — `SUPPORT_EMAIL` in `src/data/repos.ts` — and the
`supabase secrets set SUPPORT_EMAIL=...` for the server email. (Keep the two in
sync.)

## Cost notes

- **Claude:** billed per token; a support answer is ~1–2K tokens in, a few
  hundred out. Pennies per question at Opus rates, less on Haiku.
- **Resend:** free tier covers early volume; paid tiers start well beyond that.
- Both scale to zero when unused — you pay only for questions actually asked.
