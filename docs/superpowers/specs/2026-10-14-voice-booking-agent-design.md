# FrontDesk AI — phone voice agent that books appointments (design)

Date: 2026-10-14 · Status: architecture approved in chat, build started on request

> **Update 2026-10-14:** the owner chose Neon over Supabase. Postgres now runs on Neon, login is the app's
> own email + password with database sessions (`src/lib/auth.ts`), tenant isolation is enforced by
> scoping every query to the session's business (no RLS), and recordings live in a private Vercel Blob
> store streamed through `/api/recordings/[callId]`. Sections below that mention Supabase describe the
> original plan; the data model is otherwise unchanged (`db/migrations/0001_init.sql`).

## 1. Intent

A multi-tenant SaaS for US home & local service businesses (salons, spas, plumbers, HVAC, cleaners,
auto shops, consultants). Each business gets a US phone number answered 24/7 by an AI voice agent that
has a natural conversation, collects the caller's details, books an appointment into the business's
Google Calendar and sends confirmation emails. The owner logs into a website to read transcripts,
play recordings and see all call / appointment / customer data.

**Success for v1:** a test business can sign up, connect Google Calendar, activate its agent, call
the number, book a real slot (no double-booking), receive the emails and see the call (audio +
transcript + extracted data) on the dashboard.

Not in v1 (roadmap): Stripe billing, number porting, SMS confirmations/reminders, rescheduling or
cancelling by phone, Spanish, multiple users per business in the UI (schema supports it), analytics.
HIPAA is out of scope (no medical customers).

## 2. Architecture

```
Caller → Retell number → Retell agent (STT → LLM → TTS, one agent per business)
                               │ signed HTTPS (x-retell-signature)
                               ▼
                  Next.js 16 on Vercel
                    /api/tools/check-availability   → Google Calendar free/busy + DB appointments
                    /api/tools/book-appointment     → Google event + DB row + Resend emails
                    /api/retell/webhook             → calls table, recording copied to Supabase Storage
                    /api/google/connect|callback    → OAuth, refresh token stored AES-256-GCM encrypted
                    /dashboard/*                    → owner UI (Supabase Auth)
```

- **Voice vendor isolation:** only `src/lib/voice/retell.ts`, the tool route auth and the webhook know
  about Retell. Booking (`lib/booking`), calendar (`lib/calendar`) and email (`lib/email`) are vendor-neutral.
- **LLM cost:** the conversation LLM and post-call analysis run inside Retell (billed per minute).
  No separate LLM key is needed. Model is configurable (`RETELL_LLM_MODEL`).

## 3. Data model (Supabase Postgres)

All tenant tables carry `business_id`; RLS allows members of a business (`business_members`) to read and
update their rows. Server webhooks/tools use the service-role key.

| Table | Purpose |
|---|---|
| `businesses` | name, industry, timezone, owner/notification email, greeting, extra instructions, booking rules (buffer, min notice, max days ahead), transfer number, Retell ids + phone number |
| `business_members` | user ↔ business (role `owner`/`staff`) |
| `business_hours` | weekday (1=Mon…7=Sun), open/close local time; multiple rows per day allowed |
| `services` | name, duration, price note, description, active |
| `staff` | name, Google `calendar_id` (default `primary`), active, is_default |
| `staff_services` | which staff do which services (no rows = staff does every service) |
| `calendar_connections` | Google account per business, encrypted refresh token |
| `customers` | per-business, unique on phone; name, email, address |
| `calls` | Retell call id, numbers, times, duration, transcript (text + json), recording path, summary, sentiment, success, extracted data, cost |
| `appointments` | customer, service, staff, call, starts/ends, status, contact snapshot, address, notes, Google event id. **Exclusion constraint** prevents overlapping `booked` appointments for the same staff member. |

Recordings live in private Storage bucket `recordings/{business_id}/{call_id}.wav`, played back via
short-lived signed URLs.

## 4. Call flow

1. Inbound call reaches the business's Retell agent. The prompt (generated from settings) includes the
   business name, services + durations, hours, staff, timezone, `{{current_time_<tz>}}`,
   `{{current_calendar_<tz>}}` and `{{user_number}}`.
2. Agent learns the need, then calls `check_availability {service, date, staff_name?, time_of_day?}`.
   Server computes slots = business hours ∩ (not busy in Google free/busy ∪ booked DB appointments),
   respecting service duration, buffer, minimum notice and max-days-ahead; if the date has no slots it
   searches forward up to 14 days. Returns ≤ 6 slots with spoken labels and ISO start times.
3. Agent collects name, confirms callback number, optional email (spelled back), service address for
   on-site trades, notes, then reads back and calls `book_appointment`.
4. Server re-validates the slot, inserts the appointment (exclusion constraint guards races), creates the
   Google event (best-effort; booking stands if Google fails and is flagged), upserts the customer, and
   sends a customer confirmation (if email) + owner notification via Resend. Idempotent per
   `(call, start time)`.
5. Agent can `transfer_call` to the business's transfer number (if set) and `end_call`.
6. Webhooks: `call_started` creates the call row; `call_ended` stores transcript/timing and copies the
   recording (Retell URLs expire in ~10 min) into Storage; `call_analyzed` stores summary, sentiment,
   success and custom fields (`caller_name`, `service_requested`, `service_address`, `appointment_booked`,
   `follow_up_needed`) and links the customer.

## 5. Owner website

- `/` marketing page, `/signup`, `/login`.
- `/onboarding`: business name, industry, timezone, notification email, preferred area code, first
  services; creates default hours (Mon–Fri 9–5) and a default staff member.
- `/dashboard`: this-week calls, bookings, booking rate, minutes; recent calls; upcoming appointments.
- `/dashboard/calls` (search + outcome filter) and `/dashboard/calls/[id]`: audio player, transcript as
  a conversation, summary, extracted data, linked appointment.
- `/dashboard/appointments`: upcoming/past, cancel (removes Google event).
- `/dashboard/customers`: everyone who called, with call/appointment counts.
- `/dashboard/settings`: profile & agent behaviour, hours, services, staff, Google Calendar connect,
  phone agent activation/sync (provisions Retell LLM + agent + number; re-syncs prompt on save).

## 6. Errors, security, testing

- Every Retell request is verified with `Retell.verify(rawBody, RETELL_API_KEY, signature)`; tool calls
  resolve the business from `call.agent_id` — never from caller-supplied args.
- Tool endpoints never throw to the agent: they return a short plain-language message the agent can say
  ("I couldn't reach the calendar, let me take your details and have the team call you back").
- Google refresh tokens encrypted with `ENCRYPTION_KEY` (AES-256-GCM). OAuth `state` is signed.
- Webhook handlers are idempotent upserts keyed by `retell_call_id`.
- Unit tests (Vitest) for slot computation (hours, busy merge, buffers, notice, DST, time-of-day filter)
  and prompt building. Manual end-to-end: Retell web-call test from the dashboard + real phone call.
