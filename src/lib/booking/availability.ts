import { DateTime } from "luxon";

// Pure slot computation. No I/O here: callers pass business hours, busy intervals and "now".

export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export interface HoursRow {
  weekday: number; // 1 = Monday … 7 = Sunday
  open: string; // "09:00" or "09:00:00", business-local
  close: string;
}

export interface Busy {
  start: Date;
  end: Date;
}

export interface BookingRules {
  timezone: string;
  durationMinutes: number;
  bufferMinutes: number;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
}

export interface StaffBusy {
  staffId: string;
  busy: Busy[];
}

export interface Slot {
  start: Date;
  end: Date;
  staffIds: string[]; // staff free for this slot, in the caller's priority order
}

function parseClock(day: DateTime, clock: string): DateTime {
  const [h, m] = clock.split(":").map(Number);
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}

function matchesTimeOfDay(start: DateTime, tod: TimeOfDay): boolean {
  if (tod === "morning") return start.hour < 12;
  if (tod === "afternoon") return start.hour >= 12 && start.hour < 17;
  if (tod === "evening") return start.hour >= 17;
  return true;
}

/** Candidate slot starts for one local date, before checking anyone's calendar. */
export function candidateStarts(
  date: string,
  hours: HoursRow[],
  rules: BookingRules,
  now: Date,
  timeOfDay: TimeOfDay = "any",
): DateTime[] {
  const day = DateTime.fromISO(date, { zone: rules.timezone }).startOf("day");
  if (!day.isValid) return [];

  const earliest = DateTime.fromJSDate(now).plus({ minutes: rules.minNoticeMinutes });
  const latestDay = DateTime.fromJSDate(now).setZone(rules.timezone).startOf("day").plus({ days: rules.maxDaysAhead });
  if (day > latestDay) return [];

  const starts: DateTime[] = [];
  for (const row of hours.filter((h) => h.weekday === day.weekday)) {
    const open = parseClock(day, row.open);
    const close = parseClock(day, row.close);
    for (let s = open; s.plus({ minutes: rules.durationMinutes }) <= close; s = s.plus({ minutes: rules.slotIntervalMinutes })) {
      if (s < earliest) continue;
      if (!matchesTimeOfDay(s, timeOfDay)) continue;
      starts.push(s);
    }
  }
  return starts.sort((a, b) => a.toMillis() - b.toMillis());
}

/** True if [start, end) is clear of every busy block, with the buffer kept on both sides. */
export function isFree(start: Date, end: Date, busy: Busy[], bufferMinutes: number): boolean {
  const pad = bufferMinutes * 60_000;
  const s = start.getTime();
  const e = end.getTime();
  return busy.every((b) => e + pad <= b.start.getTime() || s - pad >= b.end.getTime());
}

/** Free slots on one date across several staff members. */
export function slotsForDate(
  date: string,
  hours: HoursRow[],
  rules: BookingRules,
  staff: StaffBusy[],
  now: Date,
  timeOfDay: TimeOfDay = "any",
): Slot[] {
  const slots: Slot[] = [];
  for (const start of candidateStarts(date, hours, rules, now, timeOfDay)) {
    const s = start.toJSDate();
    const e = start.plus({ minutes: rules.durationMinutes }).toJSDate();
    const free = staff.filter((st) => isFree(s, e, st.busy, rules.bufferMinutes)).map((st) => st.staffId);
    if (free.length) slots.push({ start: s, end: e, staffIds: free });
  }
  return slots;
}

/**
 * Slots on the requested date; if none, walk forward day by day (up to searchDays) and return the
 * first day that has any. `date` is returned so the agent can say "the next opening is Thursday".
 */
export function findSlots(
  fromDate: string,
  hours: HoursRow[],
  rules: BookingRules,
  staff: StaffBusy[],
  now: Date,
  timeOfDay: TimeOfDay = "any",
  searchDays = 14,
): { date: string; slots: Slot[] } | null {
  let day = DateTime.fromISO(fromDate, { zone: rules.timezone });
  const today = DateTime.fromJSDate(now).setZone(rules.timezone).startOf("day");
  if (!day.isValid || day < today) day = today;

  for (let i = 0; i < searchDays; i++) {
    const date = day.plus({ days: i }).toISODate()!;
    const slots = slotsForDate(date, hours, rules, staff, now, timeOfDay);
    if (slots.length) return { date, slots };
  }
  return null;
}

/** Thin out a long list so the agent offers a spread of times rather than 9:00, 9:30, 10:00… */
export function spread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}

/** "Tuesday, October 14 at 2:30 PM" */
export function spokenLabel(start: Date, timezone: string): string {
  return DateTime.fromJSDate(start).setZone(timezone).toFormat("cccc, LLLL d 'at' h:mm a");
}

/** Business hours as a short sentence for the agent prompt: "Monday: 9:00 AM–5:00 PM; …" */
export function describeHours(hours: HoursRow[]): string {
  const names = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const fmt = (clock: string) => DateTime.fromFormat(clock.slice(0, 5), "HH:mm").toFormat("h:mm a");
  return [1, 2, 3, 4, 5, 6, 7]
    .map((d) => {
      const rows = hours.filter((h) => h.weekday === d).sort((a, b) => a.open.localeCompare(b.open));
      return `${names[d]}: ${rows.length ? rows.map((r) => `${fmt(r.open)}–${fmt(r.close)}`).join(", ") : "closed"}`;
    })
    .join("; ");
}
