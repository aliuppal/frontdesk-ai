import { describeHours } from "../booking/availability";
import type { BusinessConfig } from "../types";

// Builds the agent's prompt and tool definitions from a business's settings. Pure: no Retell calls,
// so it can be unit-tested and previewed in the dashboard.

export interface AgentDefinition {
  generalPrompt: string;
  beginMessage: string;
  tools: Record<string, unknown>[];
  analysis: Record<string, unknown>[];
}

export const INDUSTRIES: Record<string, string> = {
  salon: "hair salon",
  spa: "spa",
  barber: "barbershop",
  plumbing: "plumbing company",
  hvac: "heating and air-conditioning company",
  electrical: "electrical contractor",
  cleaning: "cleaning service",
  auto: "auto repair shop",
  landscaping: "landscaping company",
  consulting: "consulting practice",
  other: "local business",
};

export function industryLabel(industry: string) {
  return INDUSTRIES[industry] ?? INDUSTRIES.other;
}

export function buildAgentDefinition(config: BusinessConfig, appUrl: string): AgentDefinition {
  const { business: b } = config;
  const services = config.services.filter((s) => s.active);
  const staff = config.staff.filter((s) => s.active);
  const hours = config.hours.map((h) => ({ weekday: h.weekday, open: h.open_time, close: h.close_time }));
  const serviceNames = services.map((s) => s.name);
  const staffNames = staff.map((s) => s.name);
  const multiStaff = staff.length > 1;

  const serviceLines = services
    .map((s) => {
      const extra = [s.price_note, s.description].filter(Boolean).join(". ");
      return `- ${s.name} (${s.duration_minutes} minutes)${extra ? `: ${extra}` : ""}`;
    })
    .join("\n");

  const addressStep = b.requires_address
    ? "- The full service address where the work will happen (street, city, and any gate or unit details). Read it back.\n"
    : "";

  const generalPrompt = `## Who you are
You are the friendly front-desk assistant for ${b.name}, a ${industryLabel(b.industry)}. You answer the phone 24 hours a day, help callers book appointments, and answer simple questions about the business. You are an AI assistant; if someone asks, say so honestly.

## How you speak
This is a phone call. Keep every reply short: one or two sentences, then let the caller talk. Ask one question at a time. Never use lists, bullet points, or symbols. Say times naturally ("two thirty in the afternoon"), never read out codes, ISO dates, or IDs. If you didn't catch something, ask the caller to repeat it.

## Facts you can rely on
- Right now it is {{current_time}}.
- Upcoming calendar for working out dates: {{current_calendar}}
- The caller is calling from {{user_number}}.
- Business hours: ${describeHours(hours)}.
${b.address ? `- Address: ${b.address}.\n` : ""}- Services offered:
${serviceLines || "- General appointment (60 minutes)"}
${multiStaff ? `- Team members who can be requested by name: ${staffNames.join(", ")}.\n` : ""}
## Booking an appointment
1. Find out what the caller needs and match it to one of the services above. If nothing matches, say you'll pass a message to the team, take their name and number, and don't book.
2. Ask what day and time of day suit them. Work out the date from the calendar above, then call check_availability. Never guess availability.
3. Offer two or three of the returned times. If none work, ask for another day and check again.
4. Collect, one at a time:
- Their full name.
- The best callback number. Offer the number they're calling from and confirm it.
- An email address for the confirmation, if they'd like one. Ask them to spell it, then read it back.
${addressStep}- A short note about the job or anything the team should know.
5. Recap the service, day, time and name, and ask them to confirm.
6. Call book_appointment with start_time copied exactly from the check_availability result. When it succeeds, tell them they're booked and mention the confirmation email if they gave one.
7. Ask if there's anything else, then say goodbye and end the call.

## Rules
- Never invent prices, availability, policies or promises. If you don't know, offer to have the team call back.
- If a tool fails or returns an error, apologise briefly, make sure you have their name, number and what they need, and tell them the team will call them back.
- Never share information about other customers or appointments.
${b.transfer_number ? "- If the caller has an emergency, is upset, or asks for a person, transfer them with transfer_to_team.\n" : "- If the caller asks for a person, explain the team is not available right now and take a message so they can call back.\n"}- If you reach voicemail or nobody is there, end the call.
${b.agent_instructions ? `\n## Extra instructions from ${b.name}\n${b.agent_instructions}\n` : ""}`;

  const beginMessage =
    b.greeting?.trim() || `Thanks for calling ${b.name}! This is the virtual assistant. How can I help you today?`;

  const serviceParam = serviceNames.length
    ? { type: "string", enum: serviceNames, description: "The service the caller wants, exactly as listed." }
    : { type: "string", description: "The service the caller wants." };
  const staffParam = multiStaff
    ? { staff_name: { type: "string", enum: staffNames, description: "Only if the caller asked for a specific team member." } }
    : {};

  const tools: Record<string, unknown>[] = [
    {
      type: "custom",
      name: "check_availability",
      description: "Look up open appointment times for a service on a given date. If that date is full, returns the next day with openings.",
      url: `${appUrl}/api/tools/check-availability`,
      method: "POST",
      speak_during_execution: true,
      execution_message_type: "static_text",
      execution_message_description: "One moment while I check the schedule.",
      timeout_ms: 15000,
      parameters: {
        type: "object",
        properties: {
          service: serviceParam,
          date: { type: "string", description: "The day the caller wants, as YYYY-MM-DD." },
          time_of_day: { type: "string", enum: ["morning", "afternoon", "evening", "any"], description: "Caller's preferred part of the day." },
          ...staffParam,
        },
        required: ["service", "date"],
      },
    },
    {
      type: "custom",
      name: "book_appointment",
      description: "Book the appointment once the caller has confirmed the time and their details.",
      url: `${appUrl}/api/tools/book-appointment`,
      method: "POST",
      speak_during_execution: true,
      execution_message_type: "static_text",
      execution_message_description: "Perfect, I'm booking that for you now.",
      timeout_ms: 20000,
      parameters: {
        type: "object",
        properties: {
          service: serviceParam,
          start_time: { type: "string", description: "The start_time value copied exactly from check_availability." },
          customer_name: { type: "string", description: "Caller's full name." },
          customer_phone: { type: "string", description: "Callback number the caller confirmed." },
          customer_email: { type: "string", description: "Email address, only if the caller gave and confirmed one." },
          address: { type: "string", description: "Service address, if collected." },
          notes: { type: "string", description: "Short summary of the job or request." },
          ...staffParam,
        },
        required: ["service", "start_time", "customer_name", "customer_phone"],
      },
    },
    { type: "end_call", name: "end_call", description: "Hang up after saying goodbye, or if nobody is on the line." },
  ];

  if (b.transfer_number) {
    tools.push({
      type: "transfer_call",
      name: "transfer_to_team",
      description: "Transfer the caller to a person at the business: emergencies, complaints, or when they ask for a human.",
      transfer_destination: { type: "predefined", number: b.transfer_number },
      transfer_option: { type: "cold_transfer" },
      speak_during_execution: true,
      execution_message_type: "static_text",
      execution_message_description: "Sure, let me connect you with the team now.",
    });
  }

  const analysis: Record<string, unknown>[] = [
    { type: "system-presets", name: "call_summary" },
    { type: "system-presets", name: "call_successful" },
    { type: "system-presets", name: "user_sentiment" },
    { type: "string", name: "caller_name", description: "The caller's full name, if given." },
    { type: "string", name: "caller_email", description: "The caller's email address, if given." },
    { type: "string", name: "service_requested", description: "What the caller wanted help with." },
    { type: "string", name: "service_address", description: "Address where the service is needed, if given." },
    { type: "boolean", name: "appointment_booked", description: "True if an appointment was successfully booked on this call." },
    { type: "boolean", name: "follow_up_needed", description: "True if the business should call this person back." },
    {
      type: "enum",
      name: "call_reason",
      description: "Main reason for the call.",
      choices: ["new_booking", "reschedule_or_cancel", "question", "emergency", "complaint", "spam_or_wrong_number", "other"],
    },
  ];

  return { generalPrompt, beginMessage, tools, analysis };
}
