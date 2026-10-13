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
             /api/tools/check-availability  → Google free/busy + booked appointments (Neon)
             /api/tools/book-appointment    → appointment row + Google event + Resend emails
             /api/retell/webhook            → call row, transcript, summary; recording → Vercel Blob (private)
Owner → /dashboard (email + password login, sessions in Neon; every query scoped to the owner's business)
```

| Piece | Service | Notes |
|---|---|---|
| Phone number, speech, voice, call LLM | [Retell AI](https://retellai.com) | ~$0.07–0.15/min all-in, ~$2/month per number |
| Database | [Neon](https://neon.tech) Postgres | Accounts, sessions, businesses, calls, appointments |
| Call recordings | Vercel Blob (private store) | Streamed to owners through `/api/recordings/[callId]` |
| Calendar | Google Calendar API | Each business connects its own Google account |
| Email | [Resend](https://resend.com) | Customer confirmation + owner alert |
| Hosting | Vercel | No always-on server needed |

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL` (Neon pooled connection string) and `ENCRYPTION_KEY`.
3. `npm run db:migrate` creates the tables in Neon (safe to re-run; applies only new files in `db/migrations`).
4. `npm run dev` and open http://localhost:3000. Sign up, then fill in onboarding.

The site runs with only those two settings. Each integration switches on when its keys are added:

- **Recordings:** in Vercel → Storage, create a **private** Blob store and connect it to the project
  (adds `BLOB_READ_WRITE_TOKEN`).
- **Phone agent:** add `RETELL_API_KEY`. Retell must reach the tool and webhook URLs, so test real calls on
  the deployed site (or through `ngrok http 3000` with `NEXT_PUBLIC_APP_URL` set to the tunnel).
- **Google Calendar:** enable the Calendar API, create an OAuth web client with redirect URI
  `<APP_URL>/api/google/callback`, add the calendar scopes to the consent screen, and add owners as test
  users while the app is in Testing mode. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Email:** verify a sending domain in Resend and set `RESEND_API_KEY` and `EMAIL_FROM`.

After adding env vars on Vercel, redeploy so they take effect.

## First booking, end to end

1. Settings → connect Google Calendar, adjust hours, then **Switch on my phone agent** (buys the number).
2. Click **Talk to it in your browser**, or call the number, and book something.
3. Check: the event is in Google Calendar, the emails arrived, and the call shows under **Calls** with
   transcript, summary and recording.

## Development

```bash
npm test            # slot engine + prompt builder unit tests
npm run lint
npm run build
npm run db:migrate  # apply new SQL files in db/migrations
```

Code map:

- `src/lib/booking/availability.ts`: pure slot maths (hours, buffers, notice, DST, multi-staff)
- `src/lib/booking/booking-service.ts`: availability + booking orchestration used by the agent tools
- `src/lib/voice/prompt.ts`: builds the agent prompt, tools and post-call analysis from settings
- `src/lib/voice/retell.ts`: the only Retell API client (provision/sync agent, verify signatures)
- `src/lib/db.ts`, `src/lib/auth.ts`: Neon client and email/password sessions
- `src/app/api/retell/webhook`: call lifecycle → `calls` table, recording copy
- `src/app/dashboard/*`: the owner website

## Not built yet

Stripe billing, number porting, SMS confirmations and reminders, rescheduling or cancelling by phone,
password reset email, Spanish, inviting extra users to a business, analytics charts.
