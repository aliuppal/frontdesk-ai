import { describe, expect, it } from "vitest";
import { pickCalSlots, type CalSlotsData } from "./cal-slots";

const tz = "America/Chicago";
const data: CalSlotsData = {
  "2026-10-19": [{ start: "2026-10-19T16:00:00.000-05:00" }],
  "2026-10-20": [
    { start: "2026-10-20T14:30:00.000Z" }, // 9:30 local
    { start: "2026-10-20T09:00:00.000-05:00" },
    { start: "2026-10-20T13:00:00.000-05:00" },
  ],
  "2026-10-21": [{ start: "2026-10-21T10:00:00.000-05:00" }],
};

describe("pickCalSlots", () => {
  it("returns the first day on or after the requested date, sorted", () => {
    const r = pickCalSlots(data, tz, "any", "2026-10-20")!;
    expect(r.date).toBe("2026-10-20");
    expect(r.starts.map((d) => d.toISOString())).toEqual(["2026-10-20T14:00:00.000Z", "2026-10-20T14:30:00.000Z", "2026-10-20T18:00:00.000Z"]);
  });

  it("filters by part of day in the business time zone", () => {
    const r = pickCalSlots(data, tz, "afternoon", "2026-10-20")!;
    expect(r.starts.map((d) => d.toISOString())).toEqual(["2026-10-20T18:00:00.000Z"]);
  });

  it("rolls forward when the requested day has nothing in that part of the day", () => {
    expect(pickCalSlots(data, tz, "evening", "2026-10-19")).toBeNull();
    expect(pickCalSlots(data, tz, "morning", "2026-10-19")?.date).toBe("2026-10-20");
  });

  it("returns null when there are no slots", () => {
    expect(pickCalSlots({}, tz, "any", "2026-10-20")).toBeNull();
  });
});
