import { DateTime } from "luxon";
import type { TimeOfDay } from "./availability";

/** Cal.com /v2/slots response data: local date → slots with ISO start times. */
export type CalSlotsData = Record<string, { start: string }[]>;

function matches(start: DateTime, tod: TimeOfDay): boolean {
  if (tod === "morning") return start.hour < 12;
  if (tod === "afternoon") return start.hour >= 12 && start.hour < 17;
  if (tod === "evening") return start.hour >= 17;
  return true;
}

/**
 * First business-local day on or after `fromDate` with at least one Cal.com slot in the wanted part of
 * the day. Cal.com already applies the owner's schedule, buffers, notice and connected calendars.
 */
export function pickCalSlots(data: CalSlotsData, timezone: string, timeOfDay: TimeOfDay, fromDate: string): { date: string; starts: Date[] } | null {
  const byDay = new Map<string, Date[]>();
  for (const slots of Object.values(data)) {
    for (const { start } of slots) {
      const local = DateTime.fromISO(start, { setZone: true }).setZone(timezone);
      if (!local.isValid || !matches(local, timeOfDay)) continue;
      const day = local.toISODate()!;
      if (day < fromDate) continue;
      byDay.set(day, [...(byDay.get(day) ?? []), local.toJSDate()]);
    }
  }
  const first = [...byDay.keys()].sort()[0];
  if (!first) return null;
  return { date: first, starts: byDay.get(first)!.sort((a, b) => a.getTime() - b.getTime()) };
}
