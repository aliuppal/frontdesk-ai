import { describe, expect, it } from "vitest";
import { buildAgentDefinition } from "./prompt";
import type { BusinessConfig } from "../types";

function config(overrides: Partial<BusinessConfig["business"]> = {}, staffCount = 1): BusinessConfig {
  return {
    business: {
      id: "b1",
      name: "Riverside Plumbing",
      industry: "plumbing",
      timezone: "America/Chicago",
      notification_email: "owner@example.com",
      business_phone: null,
      address: null,
      greeting: null,
      agent_instructions: null,
      transfer_number: null,
      buffer_minutes: 0,
      min_notice_minutes: 60,
      max_days_ahead: 30,
      slot_interval_minutes: 30,
      requires_address: true,
      voice_id: "retell-Cimo",
      area_code: 512,
      retell_llm_id: null,
      retell_agent_id: null,
      phone_number: null,
      agent_synced_at: null,
      created_at: "2026-10-14T00:00:00Z",
      ...overrides,
    },
    hours: [{ id: "h1", business_id: "b1", weekday: 1, open_time: "08:00:00", close_time: "16:00:00" }],
    services: [
      { id: "s1", business_id: "b1", name: "Drain cleaning", duration_minutes: 90, price_note: "from $149", description: null, active: true },
      { id: "s2", business_id: "b1", name: "Old service", duration_minutes: 30, price_note: null, description: null, active: false },
    ],
    staff: Array.from({ length: staffCount }, (_, i) => ({
      id: `st${i}`,
      business_id: "b1",
      name: ["Ana", "Ben", "Cy"][i],
      email: null,
      calendar_id: "primary",
      is_default: i === 0,
      active: true,
    })),
    staffServices: [],
  };
}

interface ToolShape {
  name: string;
  url?: string;
  parameters?: { properties: Record<string, { enum?: string[] } | undefined> };
  transfer_destination?: { number: string };
}
const tool = (def: ReturnType<typeof buildAgentDefinition>, name: string) => (def.tools as unknown as ToolShape[]).find((t) => t.name === name);

describe("buildAgentDefinition", () => {
  it("describes the business, active services and hours", () => {
    const def = buildAgentDefinition(config(), "https://app.test");
    expect(def.generalPrompt).toContain("Riverside Plumbing, a plumbing company");
    expect(def.generalPrompt).toContain("Drain cleaning (90 minutes): from $149");
    expect(def.generalPrompt).not.toContain("Old service");
    expect(def.generalPrompt).toContain("Monday: 8:00 AM–4:00 PM");
    expect(def.generalPrompt).toContain("{{current_time}}");
    expect(def.generalPrompt).toContain("service address");
  });

  it("points tools at this app and limits service to known names", () => {
    const def = buildAgentDefinition(config(), "https://app.test");
    expect(tool(def, "check_availability")?.url).toBe("https://app.test/api/tools/check-availability");
    expect(tool(def, "book_appointment")?.parameters?.properties.service?.enum).toEqual(["Drain cleaning"]);
    expect(tool(def, "book_appointment")?.parameters?.properties.staff_name).toBeUndefined();
  });

  it("offers staff choice only with more than one person", () => {
    const def = buildAgentDefinition(config({}, 2), "https://app.test");
    expect(tool(def, "check_availability")?.parameters?.properties.staff_name?.enum).toEqual(["Ana", "Ben"]);
  });

  it("adds a transfer tool only when a transfer number is set", () => {
    expect(tool(buildAgentDefinition(config(), "x"), "transfer_to_team")).toBeUndefined();
    const def = buildAgentDefinition(config({ transfer_number: "+15125550100" }), "x");
    expect(tool(def, "transfer_to_team")?.transfer_destination?.number).toBe("+15125550100");
  });

  it("uses the custom greeting and extra instructions", () => {
    const def = buildAgentDefinition(config({ greeting: "Riverside, Ana speaking!", agent_instructions: "No work on Sundays." }), "x");
    expect(def.beginMessage).toBe("Riverside, Ana speaking!");
    expect(def.generalPrompt).toContain("No work on Sundays.");
  });
});
