# FrontDesk AI

An AI receptionist for US home and local service businesses (salons, spas, plumbers, HVAC, cleaners…).
Each business gets a local phone number answered 24/7 by a voice agent that talks to callers, finds a
free slot in the business's Cal.com schedule, books it there, and confirms. The same agent also answers WhatsApp calls and chats. Owners log into a dashboard to read
transcripts, play recordings and see every call, appointment and customer.

Design spec: [docs/superpowers/specs/2026-10-14-voice-booking-agent-design.md](docs/superpowers/specs/2026-10-14-voice-booking-agent-design.md)

## How it works

```
Caller → Twilio number or WhatsApp → ElevenLabs agent (speech ↔ LLM ↔ ElevenLabs voice)
                               │ HTTPS + per-business x-frontdesk-key
                               ▼
             /api/tools/check-availability  → Cal.com slots (or built-in hours + appointments in Neon)
             /api/tools/book-appointment    → Cal.com booking + appointment row + Resend emails
             /api/voice/webhook (signed)    → transcript, summary, extracted fields; MP3 → Vercel Blob (private)
Owner → /dashboard (email + password login, sessions in Neon; every query scoped to the owner's business)
```

| Piece | Service | Notes |
|---|---|---|
| Speech, call LLM, voice | [ElevenLabs Agents](https://elevenlabs.io/agents) | Billed per call minute by ElevenLabs plan |
| Phone numbers | [Twilio](https://twilio.com) | ~$1.15/month per local number + per-minute voice |
| Database | [Neon](https://neon.tech) Postgres | Accounts, sessions, businesses, calls, appointments |
| Call recordings | Vercel Blob (private store) | Streamed to owners through `/api/recordings/[callId]` |
| Calendar | [Cal.com](https://cal.com) API v2 | Each business pastes its own Cal.com API key; event types become services |
| WhatsApp | ElevenLabs WhatsApp + Meta Cloud API | Customer-started WhatsApp calls are free on Meta's side |
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
- **Voice agent:** add `ELEVENLABS_API_KEY`, then run `npm run elevenlabs:setup -- https://<your-app>` once.
  It creates the signed post-call webhook and turns on transcript + audio delivery; put the printed
  `ELEVENLABS_WEBHOOK_SECRET` in Vercel. With only these, owners can switch the agent on and talk to it in
  the browser.
- **Phone numbers:** add `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`. "Switch on my phone agent" (or "Update
  agent now") then buys a local number and imports it into ElevenLabs, assigned to that business's agent.
  ElevenLabs must reach the tool and webhook URLs, so test calls against the deployed site.
- **Cal.com:** each owner pastes a Cal.com API key in Settings → Cal.com. Event types are imported as services;
  Cal.com owns availability, buffers and confirmation emails. Bookings without a customer email use the
  business alert email as the attendee (Cal.com requires one).
- **WhatsApp:** import the WhatsApp Business number once in the ElevenLabs dashboard (Agents → WhatsApp →
  Import account) and allow voice calls in WhatsApp Manager. Owners then pick it in Settings → Phone agent.
- **Email:** verify a sending domain in Resend and set `RESEND_API_KEY` and `EMAIL_FROM`.

After adding env vars on Vercel, redeploy so they take effect.

## First booking, end to end

1. Settings → connect Cal.com, then **Switch on my phone agent** (buys a number when Twilio is set up).
2. Click **Talk to it in your browser**, or call the number, and book something.
3. Check: the booking is in Cal.com, the emails arrived, and the call shows under **Calls** with
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
- `src/lib/voice/elevenlabs.ts`: the only ElevenLabs client (agent + tools + number sync, test sessions, webhook signatures)
- `src/lib/voice/twilio.ts`: buys local numbers for new agents
- `src/lib/db.ts`, `src/lib/auth.ts`: Neon client and email/password sessions
- `src/app/api/voice/webhook`: post-call transcript/audio → `calls` table and private Blob
- `src/app/dashboard/*`: the owner website

## Not built yet

Stripe billing, number porting, SMS confirmations and reminders, rescheduling or cancelling by phone,
password reset email, Spanish, inviting extra users to a business, analytics charts.
