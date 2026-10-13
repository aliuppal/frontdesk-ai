import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import { z } from "zod";
import { loadBusinessConfig } from "../business";
import { calendarFor, createEvent, deleteEvent, freeBusy } from "../calendar/google";
import type { Appointment, Business, BusinessConfig, Service, Staff } from "../types";
import { findSlots, slotsForDate, spokenLabel, spread, type Busy, type BookingRules, type StaffBusy, type TimeOfDay } from "./availability";
import { normalizePhone } from "./phone";

// Orchestrates availability and booking for the voice agent. Every return value has a `result`
// sentence the agent can say or paraphrase; tools never throw at the caller.

export interface ToolReply {
  result: string;
  [key: string]: unknown;
}

const CALENDAR_DOWN =
  "I can't reach the schedule right now. Take the caller's name, number and what they need, and tell them the team will call back to book.";

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

/** Busy blocks per staff member: Google Calendar (if connected) plus appointments already in our DB. */
async function staffBusy(db: SupabaseClient, b: Business, staff: Staff[], from: Date, to: Date): Promise<StaffBusy[]> {
  const { data: appts, error } = await db
    .from("appointments")
    .select("staff_id, starts_at, ends_at")
    .eq("business_id", b.id)
    .eq("status", "booked")
    .in("staff_id", staff.map((s) => s.id))
    .lt("starts_at", to.toISOString())
    .gt("ends_at", from.toISOString());
  if (error) throw new Error(error.message);

  const cal = await calendarFor(db, b.id);
  const google = cal ? await freeBusy(cal, staff.map((s) => s.calendar_id), from, to) : {};

  return staff.map((s) => {
    const busy: Busy[] = [
      ...(google[s.calendar_id] ?? []),
      ...(appts ?? []).filter((a) => a.staff_id === s.id).map((a) => ({ start: new Date(a.starts_at), end: new Date(a.ends_at) })),
    ];
    return { staffId: s.id, busy };
  });
}

const checkArgs = z.object({
  service: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_of_day: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
  staff_name: z.string().optional(),
});

export async function checkAvailability(db: SupabaseClient, businessId: string, rawArgs: unknown, now = new Date()): Promise<ToolReply> {
  const parsed = checkArgs.safeParse(rawArgs);
  if (!parsed.success) return { result: "I need the service and the date as YYYY-MM-DD to check the schedule." };
  const args = parsed.data;

  const config = await loadBusinessConfig(db, businessId);
  const b = config.business;
  const service = matchService(config.services, args.service);
  if (!service) {
    return { result: `We don't offer "${args.service}". Services available: ${config.services.filter((s) => s.active).map((s) => s.name).join(", ")}.` };
  }
  const staff = eligibleStaff(config, service, args.staff_name);
  if (!staff.length) {
    return { result: args.staff_name ? `${args.staff_name} doesn't do ${service.name}. Offer anyone else on the team.` : `Nobody is currently set up for ${service.name}. Take a message.` };
  }

  const tz = b.timezone;
  const today = DateTime.fromJSDate(now).setZone(tz).startOf("day");
  const requested = DateTime.fromISO(args.date, { zone: tz }).startOf("day");
  const from = requested.isValid && requested > today ? requested : today;
  const to = from.plus({ days: 15 });
  const hours = config.hours.map((h) => ({ weekday: h.weekday, open: h.open_time, close: h.close_time }));

  let busy: StaffBusy[];
  try {
    busy = await staffBusy(db, b, staff, from.toJSDate(), to.toJSDate());
  } catch (err) {
    console.error("availability: calendar lookup failed", businessId, err);
    return { result: CALENDAR_DOWN, error: "calendar_unavailable" };
  }

  const found = findSlots(from.toISODate()!, hours, rulesFor(b, service), busy, now, (args.time_of_day ?? "any") as TimeOfDay);
  if (!found) {
    return { result: `There are no openings for ${service.name} in the next two weeks${args.time_of_day && args.time_of_day !== "any" ? ` in the ${args.time_of_day}` : ""}. Offer a different time of day, or take a message for the team.` };
  }

  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const slots = spread(found.slots, 6).map((s) => ({
    start_time: DateTime.fromJSDate(s.start).setZone(tz).toISO(),
    label: spokenLabel(s.start, tz),
    ...(config.staff.length > 1 ? { with: s.staffIds.map((id) => staffName.get(id)).join(" or ") } : {}),
  }));
  const sameDay = found.date === args.date;
  const dayLabel = DateTime.fromISO(found.date, { zone: tz }).toFormat("cccc, LLLL d");

  return {
    result: sameDay
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

export async function bookAppointment(
  db: SupabaseClient,
  businessId: string,
  callId: string | null,
  rawArgs: unknown,
  now = new Date(),
): Promise<BookingOutcome> {
  const parsed = bookArgs.safeParse(rawArgs);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    return { reply: { result: `Booking details are incomplete or invalid (${fields}). Ask the caller again, then retry.` } };
  }
  const args = parsed.data;
  const config = await loadBusinessConfig(db, businessId);
  const b = config.business;
  const tz = b.timezone;

  const service = matchService(config.services, args.service);
  if (!service) return { reply: { result: `"${args.service}" isn't one of our services.` } };

  const start = DateTime.fromISO(args.start_time, { setZone: true });
  if (!start.isValid) return { reply: { result: "That start time wasn't understood. Check availability again and use a start_time from the results." } };
  const startUtc = start.toUTC();

  // Retell retries or the model calling twice must not create two bookings.
  if (callId) {
    const { data: existing } = await db
      .from("appointments")
      .select("*")
      .eq("retell_call_id", callId)
      .eq("starts_at", startUtc.toISO())
      .eq("status", "booked")
      .maybeSingle();
    if (existing) {
      return { reply: { result: `Already booked for ${spokenLabel(new Date(existing.starts_at), tz)}.`, appointment_id: existing.id }, appointment: existing, business: b };
    }
  }

  const staff = eligibleStaff(config, service, args.staff_name);
  if (!staff.length) return { reply: { result: "Nobody on the team is set up for that service. Take a message instead." } };

  const localDate = start.setZone(tz).toISODate()!;
  const hours = config.hours.map((h) => ({ weekday: h.weekday, open: h.open_time, close: h.close_time }));
  let busy: StaffBusy[];
  try {
    const dayStart = DateTime.fromISO(localDate, { zone: tz }).startOf("day");
    busy = await staffBusy(db, b, staff, dayStart.toJSDate(), dayStart.plus({ days: 1 }).toJSDate());
  } catch (err) {
    console.error("booking: calendar lookup failed", businessId, err);
    return { reply: { result: CALENDAR_DOWN, error: "calendar_unavailable" } };
  }

  const slot = slotsForDate(localDate, hours, rulesFor(b, service), busy, now).find((s) => s.start.getTime() === startUtc.toMillis());
  if (!slot) {
    return { reply: { result: "Sorry, that time is no longer available. Check availability again and offer the caller other times.", error: "slot_taken" } };
  }
  const chosen = config.staff.find((s) => s.id === slot.staffIds[0])!;

  const phone = normalizePhone(args.customer_phone);
  const email = args.customer_email ? args.customer_email.trim().toLowerCase() : null;

  const { data: customer, error: custErr } = await db
    .from("customers")
    .upsert(
      {
        business_id: b.id,
        phone,
        name: args.customer_name.trim(),
        ...(email ? { email } : {}),
        ...(args.address ? { address: args.address.trim() } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id,phone" },
    )
    .select("id")
    .single();
  if (custErr) console.error("booking: customer upsert failed", custErr);

  const { data: appt, error: insErr } = await db
    .from("appointments")
    .insert({
      business_id: b.id,
      customer_id: customer?.id ?? null,
      service_id: service.id,
      staff_id: chosen.id,
      retell_call_id: callId,
      service_name: service.name,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      customer_name: args.customer_name.trim(),
      customer_phone: phone,
      customer_email: email,
      address: args.address?.trim() || null,
      notes: args.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (insErr || !appt) {
    // 23P01 = exclusion violation: another caller took this slot a moment ago.
    if (insErr?.code === "23P01") return { reply: { result: "Sorry, someone just booked that time. Check availability again and offer other times.", error: "slot_taken" } };
    console.error("booking: insert failed", insErr);
    return { reply: { result: CALENDAR_DOWN, error: "booking_failed" } };
  }

  // Calendar event is best-effort: the booking stands even if Google is down, and the dashboard flags it.
  try {
    const cal = await calendarFor(db, b.id);
    if (cal) {
      const eventId = await createEvent(cal, chosen.calendar_id, {
        summary: `${service.name} — ${appt.customer_name}`,
        description: [`Phone: ${phone}`, email && `Email: ${email}`, appt.address && `Address: ${appt.address}`, appt.notes && `Notes: ${appt.notes}`, "Booked by FrontDesk AI phone agent."]
          .filter(Boolean)
          .join("\n"),
        start: slot.start,
        end: slot.end,
        timezone: tz,
        location: appt.address,
      });
      await db.from("appointments").update({ google_event_id: eventId }).eq("id", appt.id);
      appt.google_event_id = eventId;
    }
  } catch (err) {
    console.error("booking: google event failed", err);
    await db.from("appointments").update({ calendar_sync_error: (err as Error).message.slice(0, 500) }).eq("id", appt.id);
  }

  if (callId) {
    await db.from("calls").update({ appointment_booked: true, customer_id: customer?.id ?? null }).eq("retell_call_id", callId);
  }

  return {
    reply: {
      result: `Booked: ${service.name} on ${spokenLabel(slot.start, tz)}${config.staff.length > 1 ? ` with ${chosen.name}` : ""}.${email ? " A confirmation email is on its way." : ""}`,
      appointment_id: appt.id,
    },
    appointment: appt,
    business: b,
    created: true,
  };
}

/** Owner cancels from the dashboard: mark cancelled, remove the Google event. */
export async function cancelAppointment(db: SupabaseClient, businessId: string, appointmentId: string): Promise<{ appointment: Appointment; business: Business }> {
  const { data: appt } = await db.from("appointments").select("*").eq("id", appointmentId).eq("business_id", businessId).single();
  if (!appt) throw new Error("Appointment not found");
  const { data: business } = await db.from("businesses").select("*").eq("id", businessId).single();
  await db.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
  if (appt.google_event_id) {
    const { data: staff } = await db.from("staff").select("calendar_id").eq("id", appt.staff_id).single();
    const cal = await calendarFor(db, businessId);
    if (cal && staff) await deleteEvent(cal, staff.calendar_id, appt.google_event_id);
  }
  return { appointment: { ...appt, status: "cancelled" }, business: business! };
}
