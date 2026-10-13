# FrontDesk AI

An AI receptionist for US home and local service businesses (salons, spas, plumbers, HVAC, cleaners…).
Each business gets a local phone number answered 24/7 by a voice agent that talks to callers, finds a
free slot in Google Calendar, books it, and emails confirmations. Owners log into a dashboard to read
transcripts, play recordings and see every call, appointment and customer.

Design spec: [docs/superpowers/specs/2026-10-14-voice-booking-agent-design.md](docs/superpowers/specs/2026-10-14-voice-booking-agent-design.md)

## How it works

```
Caller → Retell phone number → Retell agent (speech ↔ LLM ↔ voice)
                                   │ signed HTTPS
                                   ▼
             /api/tools/check-availability  → Google free/busy + booked appointments
             /api/tools/book-appointment    → appointment row + Google event + Resend emails
             /api/retell/webhook            → call row, transcript, summary; recording copied to Storage
Owner → /dashboard (Supabase Auth, row-level security per business)
```

| Piece | Service | Notes |
|---|---|---|
| Phone number, speech, voice, call LLM | [Retell AI](https://retellai.com) | ~$0.07–0.15/min all-in, ~$2/month per number |
| Database, login, recordings | [Supabase](https://supabase.com) | Postgres + Auth + private Storage bucket |
| Calendar | Google Calendar API | Each business connects its own Google account |
| Email | [Resend](https://resend.com) | Customer confirmation + owner alert |
| Hosting | Vercel (or any Node host) | No always-on server needed |

## Setup

1. **Install:** `npm install`
2. **Supabase:** create a project, then run `supabase/migrations/0001_init.sql` in the SQL editor
   (or `supabase db push`). It creates the tables, row-level security, and the private `recordings` bucket.
   In Auth → URL configuration set the Site URL to your app URL. If email confirmation is on, set the
   "Confirm signup" template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
3. **Google:** in Google Cloud, enable the Calendar API, create an OAuth web client with redirect URI
   `<APP_URL>/api/google/callback`, and add the calendar scopes to the consent screen. While the app is in
   "Testing" mode, add each owner's Google account as a test user. Going public needs Google verification
   for the calendar scopes.
4. **Retell:** create an account and API key. Numbers are bought through the API when an owner switches
   their agent on, so there's nothing to click in the Retell dashboard.
5. **Resend:** verify your sending domain and create an API key.
6. **Env:** `cp .env.example .env.local` and fill it in.
7. **Run:** `npm run dev`. Retell must be able to reach your tool and webhook URLs, so for local testing
   run `ngrok http 3000` and set `NEXT_PUBLIC_APP_URL` to the https tunnel URL.

## First booking, end to end

1. Sign up → onboarding (name, type, timezone, services) → Settings.
2. Connect Google Calendar, adjust hours, then **Switch on my phone agent** (buys the number).
3. Click **Talk to it in your browser**, or call the number, and book something.
4. Check: the event is in Google Calendar, the emails arrived, and the call shows under **Calls** with
   transcript, summary and recording (the recording appears a few seconds after hang-up).

## Development

```bash
npm test          # slot engine + prompt builder unit tests
npm run lint
npm run build
```

Code map:

- `src/lib/booking/availability.ts`: pure slot maths (hours, buffers, notice, DST, multi-staff)
- `src/lib/booking/booking-service.ts`: availability + booking orchestration used by the agent tools
- `src/lib/voice/prompt.ts`: builds the agent prompt, tools and post-call analysis from settings
- `src/lib/voice/retell.ts`: the only Retell API client (provision/sync agent, verify signatures)
- `src/app/api/retell/webhook`: call lifecycle → `calls` table, recording copy
- `src/app/dashboard/*`: the owner website

## Not built yet

Stripe billing, number porting, SMS confirmations and reminders, rescheduling or cancelling by phone,
Spanish, inviting extra users to a business, analytics charts.
