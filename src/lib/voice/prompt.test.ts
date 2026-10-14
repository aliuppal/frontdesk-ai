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
      voice_id: "EXAVITQu4vr4xnSDxMaL",
      area_code: 512,
      voice_agent_id: null,
      voice_tool_ids: [],
      phone_number: null,
      phone_number_id: null,
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

const tool = (def: ReturnType<typeof buildAgentDefinition>, name: string) => def.tools.find((t) => t.name === name);

describe("buildAgentDefinition", () => {
  it("describes the business, active services and hours", () => {
    const def = buildAgentDefinition(config());
    expect(def.prompt).toContain("Riverside Plumbing, a plumbing company");
    expect(def.prompt).toContain("Drain cleaning (90 minutes): from $149");
    expect(def.prompt).not.toContain("Old service");
    expect(def.prompt).toContain("Monday: 8:00 AM–4:00 PM");
    expect(def.prompt).toContain("America/Chicago");
    expect(def.prompt).toContain("service address");
  });

  it("points tools at our endpoints and limits service to known names", () => {
    const def = buildAgentDefinition(config());
    expect(tool(def, "check_availability")?.path).toBe("/api/tools/check-availability");
    expect(tool(def, "book_appointment")?.params.service?.enum).toEqual(["Drain cleaning"]);
    expect(tool(def, "book_appointment")?.params.staff_name).toBeUndefined();
    expect(tool(def, "book_appointment")?.required).toContain("start_time");
  });

  it("offers staff choice only with more than one person", () => {
    const def = buildAgentDefinition(config({}, 2));
    expect(tool(def, "check_availability")?.params.staff_name?.enum).toEqual(["Ana", "Ben"]);
  });

  it("only enables transfers when a transfer number is set", () => {
    expect(buildAgentDefinition(config()).transferNumber).toBeNull();
    const def = buildAgentDefinition(config({ transfer_number: "+15125550100" }));
    expect(def.transferNumber).toBe("+15125550100");
    expect(def.prompt).toContain("transfer them to the team");
  });

  it("uses the custom greeting and extra instructions", () => {
    const def = buildAgentDefinition(config({ greeting: "Riverside, Ana speaking!", agent_instructions: "No work on Sundays." }));
    expect(def.firstMessage).toBe("Riverside, Ana speaking!");
    expect(def.prompt).toContain("No work on Sundays.");
  });

  it("asks the provider to extract the dashboard's call fields", () => {
    const keys = Object.keys(buildAgentDefinition(config()).dataCollection);
    expect(keys).toEqual(expect.arrayContaining(["caller_name", "service_requested", "follow_up_needed", "call_reason"]));
  });
});
