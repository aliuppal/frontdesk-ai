import "server-only";
import { DateTime } from "luxon";
import { z } from "zod";
import { loadBusinessConfig } from "../business";
import { calCancelBooking, calCreateBooking, calKeyFor, calSlots, CalError } from "../calendar/calcom";
import { one, pgCode, sql } from "../db";
import type { Appointment, Business, BusinessConfig, Service, Staff } from "../types";
import { findSlots, slotsForDate, spokenLabel, spread, type Busy, type BookingRules, type StaffBusy, type TimeOfDay } from "./availability";
import { pickCalSlots } from "./cal-slots";
import { normalizePhone } from "./phone";

// Orchestrates availability and booking for the voice agent. Every return value has a `result`
// sentence the agent can say or paraphrase; tools never throw at the caller.
//
// Two schedules:
// - Cal.com: services imported from a connected Cal.com account (cal_event_type_id set). Cal.com owns
//   availability and the booking; we keep a copy of the appointment for the dashboard.
// - Built-in: everything else. Business hours + our own appointments, with the overlap guard in Postgres.

export interface ToolReply {
  result: string;
  [key: string]: unknown;
}

const SCHEDULE_DOWN =
  "I can't reach the schedule right now. Take the caller's name, number and what they need, and tell them the team will call back to book.";
const SLOT_TAKEN = "Sorry, that time is no longer available. Check availability again and offer the caller other times.";

function matchService(services: Service[], name: string): Service | undefined {
  const active = services.filter((s) => s.active);
  const n = name.trim().toLowerCase();
  return active.find((s) => s.name.toLowerCase() === n) ?? active.find((s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase()));
}

function eligibleStaff(config: BusinessConfig, service: Service, staffName?: string): Staff[] {
  const byStaff = new Map<string, string[]>();
  for (const row of config.staffServices) byStaff.set(row.staff_id, [...(byStaff.get(row.staff_id) ?? []), row.service_id]);
  let staff = config.staff.filter((s) => s.active && (!byStaff.has(s.id) || byStaff.get(s.id)!.includes(service.id)));
  if (staffName) staff = staff.filter((s) => s.name.toLowerCase() === staffName.trim().toLowerCase());
  return staff;
}

function rulesFor(b: Business, service: Service): BookingRules {
  return {
    timezone: b.timezone,
    durationMinutes: service.duration_minutes,
    bufferMinutes: b.buffer_minutes,
    slotIntervalMinutes: b.slot_interval_minutes,
    minNoticeMinutes: b.min_notice_minutes,
    maxDaysAhead: b.max_days_ahead,
  };
}

/** Busy blocks per staff member from appointments booked on the built-in schedule. */
async function staffBusy(b: Business, staff: Staff[], from: Date, to: Date): Promise<StaffBusy[]> {
  const ids = staff.map((s) => s.id);
  const appts = await sql<{ staff_id: string; starts_at: string; ends_at: string }>`
    select staff_id, starts_at, ends_at from appointments
    where business_id = ${b.id} and status = 'booked' and staff_id = any(${ids}::uuid[])
      and starts_at < ${to.toISOString()} and ends_at > ${from.toISOString()}`;
  return staff.map((s) => ({
    staffId: s.id,
    busy: appts.filter((a) => a.staff_id === s.id).map((a): Busy => ({ start: new Date(a.starts_at), end: new Date(a.ends_at) })),
  }));
}

const checkArgs = z.object({
  service: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_of_day: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
  staff_name: z.string().optional(),
});

export async function checkAvailability(businessId: string, rawArgs: unknown, now = new Date()): Promise<ToolReply> {
  const parsed = checkArgs.safeParse(rawArgs);
  if (!parsed.success) return { result: "I need the service and the date as YYYY-MM-DD to check the schedule." };
  const args = parsed.data;

  const config = await loadBusinessConfig(businessId);
  const b = config.business;
  const service = matchService(config.services, args.service);
  if (!service) {
    return { result: `We don't offer "${args.service}". Services available: ${config.services.filter((s) => s.active).map((s) => s.name).join(", ")}.` };
  }

  const tz = b.timezone;
  const tod = (args.time_of_day ?? "any") as TimeOfDay;
  const today = DateTime.fromJSDate(now).setZone(tz).startOf("day");
  const requested = DateTime.fromISO(args.date, { zone: tz }).startOf("day");
  const from = requested.isValid && requested > today ? requested : today;

  let found: { date: string; starts: Date[]; with?: (d: Date) => string | undefined } | null;

  if (service.cal_event_type_id) {
    const apiKey = await calKeyFor(b.id);
    if (!apiKey) return { result: SCHEDULE_DOWN, error: "calendar_not_connected" };
    try {
      const data = await calSlots(apiKey, service.cal_event_type_id, from.toISODate()!, from.plus({ days: 14 }).toISODate()!, tz);
      found = pickCalSlots(data, tz, tod, from.toISODate()!);
    } catch (err) {
      console.error("availability: Cal.com lookup failed", businessId, err);
      return { result: SCHEDULE_DOWN, error: "calendar_unavailable" };
    }
  } else {
    const staff = eligibleStaff(config, service, args.staff_name);
    if (!staff.length) {
      return { result: args.staff_name ? `${args.staff_name} doesn't do ${service.name}. Offer anyone else on the team.` : `Nobody is currently set up for ${service.name}. Take a message.` };
    }
    const hours = config.hours.map((h) => ({ weekday: h.weekday, open: h.open_time, close: h.close_time }));
    const busy = await staffBusy(b, staff, from.toJSDate(), from.plus({ days: 15 }).toJSDate());
    const slots = findSlots(from.toISODate()!, hours, rulesFor(b, service), busy, now, tod);
    const names = new Map(staff.map((s) => [s.id, s.name]));
    const withFor = new Map(slots?.slots.map((s) => [s.start.getTime(), s.staffIds.map((id) => names.get(id)).join(" or ")]) ?? []);
    found = slots ? { date: slots.date, starts: slots.slots.map((s) => s.start), with: config.staff.length > 1 ? (d) => withFor.get(d.getTime()) : undefined } : null;
  }

  if (!found) {
    return { result: `There are no openings for ${service.name} in the next two weeks${tod !== "any" ? ` in the ${tod}` : ""}. Offer a different time of day, or take a message for the team.` };
  }

  const slots = spread(found.starts, 6).map((start) => ({
    start_time: DateTime.fromJSDate(start).setZone(tz).toISO(),
    label: spokenLabel(start, tz),
    ...(found.with?.(start) ? { with: found.with(start) } : {}),
  }));
  const dayLabel = DateTime.fromISO(found.date, { zone: tz }).toFormat("cccc, LLLL d");
  return {
    result:
      found.date === args.date
        ? `Openings for ${service.name} (${service.duration_minutes} minutes) on ${dayLabel}.`
        : `No openings on the requested day. The next openings for ${service.name} are on ${dayLabel}.`,
    date: found.date,
    slots,
  };
}

const bookArgs = z.object({
  service: z.string().min(1),
  start_time: z.string().min(10),
  customer_name: z.string().min(1),
  customer_phone: z.string().min(7),
  customer_email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  notes: z.string().optional(),
  staff_name: z.string().optional(),
});

export interface BookingOutcome {
  reply: ToolReply;
  appointment?: Appointment;
  business?: Business;
  /** True only when this request created the booking (so emails go out once). */
  created?: boolean;
}

const existingBooking = (callId: string, startIso: string) =>
  one<Appointment>(sql`select * from appointments where conversation_id = ${callId} and starts_at = ${startIso} and status = 'booked'`);

export async function bookAppointment(businessId: string, callId: string | null, rawArgs: unknown, now = new Date()): Promise<BookingOutcome> {
  const parsed = bookArgs.safeParse(rawArgs);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    return { reply: { result: `Booking details are incomplete or invalid (${fields}). Ask the caller again, then retry.` } };
  }
  const args = parsed.data;
  const config = await loadBusinessConfig(businessId);
  const b = config.business;
  const tz = b.timezone;

  const service = matchService(config.services, args.service);
  if (!service) return { reply: { result: `"${args.service}" isn't one of our services.` } };

  const start = DateTime.fromISO(args.start_time, { setZone: true });
  if (!start.isValid) return { reply: { result: "That start time wasn't understood. Check availability again and use a start_time from the results." } };
  const startIso = start.toUTC().toISO()!;
  const already = (a: Appointment): BookingOutcome => ({
    reply: { result: `Already booked for ${spokenLabel(new Date(a.starts_at), tz)}.`, appointment_id: a.id },
    appointment: a,
    business: b,
  });

  // Tool retries or the model calling twice must not create two bookings.
  if (callId) {
    const existing = await existingBooking(callId, startIso);
    if (existing) return already(existing);
  }

  const phone = normalizePhone(args.customer_phone);
  const email = args.customer_email ? args.customer_email.trim().toLowerCase() : null;
  const name = args.customer_name.trim();
  const address = args.address?.trim() || null;
  const notes = args.notes?.trim() || null;
  const end = start.plus({ minutes: service.duration_minutes });

  // Pick who/what holds the slot: Cal.com booking, or a staff member on the built-in schedule.
  let staffId: string;
  let calUid: string | null = null;
  let withName: string | null = null;

  if (service.cal_event_type_id) {
    const apiKey = await calKeyFor(b.id);
    if (!apiKey) return { reply: { result: SCHEDULE_DOWN, error: "calendar_not_connected" } };
    try {
      const booking = await calCreateBooking(apiKey, {
        eventTypeId: service.cal_event_type_id,
        start: start.toJSDate(),
        name,
        // Cal.com requires an attendee email; without one the confirmation goes to the business instead.
        email: email ?? b.notification_email,
        phone,
        timeZone: tz,
        notes: [notes, address && `Address: ${address}`, `Phone: ${phone}`].filter(Boolean).join("\n"),
        metadata: { source: "frontdesk-ai", ...(callId ? { conversation_id: callId } : {}) },
      });
      calUid = booking.uid;
    } catch (err) {
      // Only a genuinely unavailable time should send the agent back to re-check; anything else (bad email,
      // misconfigured event type) means "take a message", with the real reason in the logs.
      const message = err instanceof CalError ? err.message : String(err);
      if (err instanceof CalError && err.status >= 400 && err.status < 500 && /no_available_users|not available|unavailable|already (has|have) (a )?booking|busy|reserved/i.test(message)) {
        return { reply: { result: SLOT_TAKEN, error: "slot_taken" } };
      }
      if (err instanceof CalError && /email/i.test(message) && email) {
        return { reply: { result: "That email address doesn't seem to work. Ask the caller to spell it again, or book without an email.", error: "invalid_email" } };
      }
      console.error("booking: Cal.com booking failed", businessId, message);
      return { reply: { result: SCHEDULE_DOWN, error: "calendar_unavailable" } };
    }
    staffId = (config.staff.find((s) => s.is_default) ?? config.staff[0]).id;
  } else {
    const staff = eligibleStaff(config, service, args.staff_name);
    if (!staff.length) return { reply: { result: "Nobody on the team is set up for that service. Take a message instead." } };
    const localDate = start.setZone(tz).toISODate()!;
    const dayStart = DateTime.fromISO(localDate, { zone: tz }).startOf("day");
    const hours = config.hours.map((h) => ({ weekday: h.weekday, open: h.open_time, close: h.close_time }));
    const busy = await staffBusy(b, staff, dayStart.toJSDate(), dayStart.plus({ days: 1 }).toJSDate());
    const slot = slotsForDate(localDate, hours, rulesFor(b, service), busy, now).find((s) => s.start.getTime() === start.toMillis());
    if (!slot) return { reply: { result: SLOT_TAKEN, error: "slot_taken" } };
    staffId = slot.staffIds[0];
    if (config.staff.length > 1) withName = config.staff.find((s) => s.id === staffId)?.name ?? null;
  }

  let customerId: string | null = null;
  try {
    const row = await one<{ id: string }>(sql`
      insert into customers (business_id, phone, name, email, address)
      values (${b.id}, ${phone}, ${name}, ${email}, ${address})
      on conflict (business_id, phone) do update set
        name = excluded.name,
        email = coalesce(excluded.email, customers.email),
        address = coalesce(excluded.address, customers.address),
        updated_at = now()
      returning id`);
    customerId = row?.id ?? null;
  } catch (err) {
    console.error("booking: customer upsert failed", err);
  }

  let appt: Appointment | null;
  try {
    appt = await one<Appointment>(sql`
      insert into appointments (business_id, customer_id, service_id, staff_id, conversation_id, service_name, starts_at, ends_at,
                                customer_name, customer_phone, customer_email, address, notes, cal_booking_uid)
      values (${b.id}, ${customerId}, ${service.id}, ${staffId}, ${callId}, ${service.name}, ${start.toUTC().toISO()},
              ${end.toUTC().toISO()}, ${name}, ${phone}, ${email}, ${address}, ${notes}, ${calUid})
      returning *`);
  } catch (err) {
    // 23P01 = overlap on the built-in schedule: another caller took this slot a moment ago.
    if (pgCode(err) === "23P01") return { reply: { result: SLOT_TAKEN, error: "slot_taken" } };
    // 23505 = the same call booked the same start concurrently (a retry raced the first request).
    if (pgCode(err) === "23505" && callId) {
      const existing = await existingBooking(callId, startIso);
      if (existing) return already(existing);
    }
    console.error("booking: insert failed", err);
    // The Cal.com booking (if any) exists even though our copy failed; the owner still sees it in Cal.com.
    return { reply: { result: calUid ? `Booked: ${service.name} on ${spokenLabel(start.toJSDate(), tz)}.` : SCHEDULE_DOWN, error: "record_failed" } };
  }
  if (!appt) return { reply: { result: SCHEDULE_DOWN, error: "booking_failed" } };

  if (callId) {
    await sql`update calls set appointment_booked = true, customer_id = coalesce(${customerId}, customer_id) where conversation_id = ${callId}`;
  }

  const sentence = `Booked: ${service.name} on ${spokenLabel(start.toJSDate(), tz)}${withName ? ` with ${withName}` : ""}`.replace(/\.$/, "");
  return {
    reply: { result: `${sentence}.${email ? " A confirmation email is on its way." : ""}`, appointment_id: appt.id },
    appointment: appt,
    business: b,
    created: true,
  };
}

/** Owner cancels from the dashboard: mark cancelled here and in Cal.com. */
export async function cancelAppointment(businessId: string, appointmentId: string): Promise<{ appointment: Appointment; business: Business }> {
  const appt = await one<Appointment>(sql`
    update appointments set status = 'cancelled'
    where id = ${appointmentId} and business_id = ${businessId} and status = 'booked'
    returning *`);
  if (!appt) throw new Error("Appointment not found or already cancelled");
  const business = (await one<Business>(sql`select * from businesses where id = ${businessId}`))!;
  if (appt.cal_booking_uid) {
    try {
      const apiKey = await calKeyFor(businessId);
      if (apiKey) await calCancelBooking(apiKey, appt.cal_booking_uid, "Cancelled from the FrontDesk dashboard");
    } catch (err) {
      console.error("cancel: Cal.com cancel failed", err);
    }
  }
  return { appointment: appt, business };
}
