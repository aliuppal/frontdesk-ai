import { describe, expect, it } from "vitest";
import { candidateStarts, describeHours, findSlots, isFree, slotsForDate, spokenLabel, spread, type BookingRules } from "./availability";

const tz = "America/New_York";
const hours = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, open: "09:00", close: "17:00" }));
const rules: BookingRules = {
  timezone: tz,
  durationMinutes: 60,
  bufferMinutes: 0,
  slotIntervalMinutes: 30,
  minNoticeMinutes: 60,
  maxDaysAhead: 30,
};
// Tuesday 2026-10-13, 08:00 New York (EDT, UTC-4)
const now = new Date("2026-10-13T12:00:00Z");
const local = (iso: string) => new Date(new Date(`${iso}-04:00`).toISOString());

describe("candidateStarts", () => {
  it("fills business hours on a weekday, ending so the service fits before close", () => {
    const starts = candidateStarts("2026-10-14", hours, rules, now);
    expect(starts[0].toFormat("HH:mm")).toBe("09:00");
    expect(starts.at(-1)!.toFormat("HH:mm")).toBe("16:00");
    expect(starts).toHaveLength(15);
  });

  it("returns nothing on a closed day", () => {
    expect(candidateStarts("2026-10-17", hours, rules, now)).toEqual([]); // Saturday
  });

  it("respects minimum notice", () => {
    const at1030 = new Date("2026-10-14T14:30:00Z"); // 10:30 local
    const starts = candidateStarts("2026-10-14", hours, rules, at1030);
    expect(starts[0].toFormat("HH:mm")).toBe("11:30");
  });

  it("respects max days ahead", () => {
    expect(candidateStarts("2026-12-30", hours, rules, now)).toEqual([]);
  });

  it("filters by time of day", () => {
    const afternoon = candidateStarts("2026-10-14", hours, rules, now, "afternoon");
    expect(afternoon.every((s) => s.hour >= 12 && s.hour < 17)).toBe(true);
    expect(candidateStarts("2026-10-14", hours, rules, now, "evening")).toEqual([]);
  });

  it("supports split shifts", () => {
    const split = [
      { weekday: 3, open: "09:00", close: "12:00" },
      { weekday: 3, open: "13:00", close: "15:00" },
    ];
    const starts = candidateStarts("2026-10-14", split, rules, now).map((s) => s.toFormat("HH:mm"));
    expect(starts).toContain("11:00");
    expect(starts).not.toContain("11:30");
    expect(starts).not.toContain("12:30");
    expect(starts).toContain("13:00");
  });

  it("uses local wall-clock hours across a DST change", () => {
    // 2026-11-02 is the Monday after US DST ends; 9 AM local is 14:00 UTC.
    const starts = candidateStarts("2026-11-02", hours, rules, now);
    expect(starts[0].toUTC().toFormat("HH:mm")).toBe("14:00");
  });
});

describe("isFree", () => {
  const busy = [{ start: local("2026-10-14T10:00:00"), end: local("2026-10-14T11:00:00") }];
  it("detects overlaps and allows back-to-back", () => {
    expect(isFree(local("2026-10-14T09:30:00"), local("2026-10-14T10:30:00"), busy, 0)).toBe(false);
    expect(isFree(local("2026-10-14T09:00:00"), local("2026-10-14T10:00:00"), busy, 0)).toBe(true);
    expect(isFree(local("2026-10-14T11:00:00"), local("2026-10-14T12:00:00"), busy, 0)).toBe(true);
  });
  it("keeps the buffer on both sides", () => {
    expect(isFree(local("2026-10-14T11:00:00"), local("2026-10-14T12:00:00"), busy, 15)).toBe(false);
    expect(isFree(local("2026-10-14T08:45:00"), local("2026-10-14T09:45:00"), busy, 15)).toBe(true);
  });
});

describe("slotsForDate", () => {
  it("lists which staff are free for each slot", () => {
    const staff = [
      { staffId: "ana", busy: [{ start: local("2026-10-14T09:00:00"), end: local("2026-10-14T12:00:00") }] },
      { staffId: "ben", busy: [] },
    ];
    const slots = slotsForDate("2026-10-14", hours, rules, staff, now);
    expect(slots[0].staffIds).toEqual(["ben"]);
    const noon = slots.find((s) => s.start.getTime() === local("2026-10-14T12:00:00").getTime())!;
    expect(noon.staffIds).toEqual(["ana", "ben"]);
  });
});

describe("findSlots", () => {
  it("rolls forward past a fully booked day and a weekend", () => {
    const friday = [{ start: local("2026-10-16T00:00:00"), end: local("2026-10-16T23:59:00") }];
    const result = findSlots("2026-10-16", hours, rules, [{ staffId: "a", busy: friday }], now);
    expect(result?.date).toBe("2026-10-19"); // Monday
  });

  it("treats a past date as today", () => {
    const result = findSlots("2020-01-01", hours, rules, [{ staffId: "a", busy: [] }], now);
    expect(result?.date).toBe("2026-10-13");
  });

  it("returns null when nothing is open in the window", () => {
    expect(findSlots("2026-10-13", [], rules, [{ staffId: "a", busy: [] }], now)).toBeNull();
  });
});

describe("formatting", () => {
  it("speaks a slot in the business timezone", () => {
    expect(spokenLabel(local("2026-10-14T14:30:00"), tz)).toBe("Wednesday, October 14 at 2:30 PM");
  });
  it("spreads a long list evenly, keeping first and last", () => {
    expect(spread([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([1, 4, 7, 10]);
  });
  it("describes hours for the prompt", () => {
    expect(describeHours(hours)).toContain("Monday: 9:00 AM–5:00 PM");
    expect(describeHours(hours)).toContain("Sunday: closed");
  });
});
