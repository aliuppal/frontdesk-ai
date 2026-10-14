import "server-only";
import { decrypt, encrypt } from "../crypto";
import { one, sql } from "../db";
import type { CalSlotsData } from "../booking/cal-slots";

// Cal.com API v2. Each business connects its own account with an API key; Cal.com then owns
// availability (schedule, buffers, notice, connected calendars) and the bookings themselves.

const BASE = "https://api.cal.com/v2";
const VERSION = { eventTypes: "2024-06-14", slots: "2024-09-04", bookings: "2024-08-13" } as const;

export class CalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function cal<T>(apiKey: string, path: string, version: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "cal-api-version": version, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(12_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === "error") throw new CalError(body.error?.message ?? `Cal.com ${res.status}`, res.status);
  return body.data as T;
}

export interface CalEventType {
  id: number;
  title: string;
  slug: string;
  lengthInMinutes: number;
  hidden: boolean;
  description?: string | null;
}

export const calMe = (apiKey: string) => cal<{ username: string; timeZone: string }>(apiKey, "/me", VERSION.eventTypes);
export const calEventTypes = (apiKey: string) => cal<CalEventType[]>(apiKey, "/event-types", VERSION.eventTypes);

/** Open slots for an event type between two local dates (inclusive), keyed by date. */
export function calSlots(apiKey: string, eventTypeId: number, startDate: string, endDate: string, timeZone: string) {
  const q = new URLSearchParams({ eventTypeId: String(eventTypeId), start: startDate, end: endDate, timeZone });
  return cal<CalSlotsData>(apiKey, `/slots?${q}`, VERSION.slots);
}

export function calCreateBooking(
  apiKey: string,
  b: { eventTypeId: number; start: Date; name: string; email: string; phone: string; timeZone: string; notes: string | null; metadata: Record<string, string> },
) {
  return cal<{ uid: string; start: string; end: string }>(apiKey, "/bookings", VERSION.bookings, {
    method: "POST",
    body: JSON.stringify({
      eventTypeId: b.eventTypeId,
      start: b.start.toISOString(),
      attendee: { name: b.name, email: b.email, timeZone: b.timeZone, phoneNumber: b.phone, language: "en" },
      bookingFieldsResponses: b.notes ? { notes: b.notes } : undefined,
      metadata: b.metadata,
    }),
  });
}

export function calCancelBooking(apiKey: string, uid: string, reason: string) {
  return cal<unknown>(apiKey, `/bookings/${encodeURIComponent(uid)}/cancel`, VERSION.bookings, {
    method: "POST",
    body: JSON.stringify({ cancellationReason: reason }),
  });
}

// ── Per-business connection ─────────────────────────────────────────────────

export function calConnection(businessId: string) {
  return one<{ username: string | null; time_zone: string | null; connected_at: string }>(
    sql`select username, time_zone, connected_at from cal_connections where business_id = ${businessId}`,
  );
}

export async function calKeyFor(businessId: string): Promise<string | null> {
  const row = await one<{ api_key_enc: string }>(sql`select api_key_enc from cal_connections where business_id = ${businessId}`);
  return row ? decrypt(row.api_key_enc) : null;
}

/** Validate the key, store it encrypted, and import the account's event types as services. */
export async function connectCal(businessId: string, apiKey: string): Promise<number> {
  const me = await calMe(apiKey);
  await sql`insert into cal_connections (business_id, api_key_enc, username, time_zone) values (${businessId}, ${encrypt(apiKey)}, ${me.username}, ${me.timeZone})
            on conflict (business_id) do update set api_key_enc = excluded.api_key_enc, username = excluded.username,
              time_zone = excluded.time_zone, connected_at = now()`;
  return importCalEventTypes(businessId, apiKey);
}

/** Upsert one service per Cal.com event type (hidden types become inactive). Returns how many. */
export async function importCalEventTypes(businessId: string, apiKey: string): Promise<number> {
  const types = await calEventTypes(apiKey);
  for (const t of types) {
    await sql`insert into services (business_id, name, duration_minutes, description, active, cal_event_type_id)
              values (${businessId}, ${t.title}, ${t.lengthInMinutes}, ${t.description || null}, ${!t.hidden}, ${t.id})
              on conflict (business_id, cal_event_type_id) where cal_event_type_id is not null
              do update set name = excluded.name, duration_minutes = excluded.duration_minutes`;
  }
  return types.length;
}
