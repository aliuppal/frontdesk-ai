import "server-only";
import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { appUrl, isConfigured, need, optional, voiceLlm } from "../env";
import { toolKey } from "../crypto";
import { sql } from "../db";
import { loadBusinessConfig } from "../business";
import { buildAgentDefinition, type ToolSpec } from "./prompt";
import { buyLocalNumber, twilioCredentials } from "./twilio";

// Everything that talks to the voice provider lives here. Booking, calendar and email code never
// imports this file, so switching providers again only touches this module and the webhook route.

export function elevenlabs() {
  return new ElevenLabsClient({ apiKey: need("ELEVENLABS_API_KEY") });
}

// English agents must use an English-only TTS model; Flash v2 is the low-latency one.
const TTS_MODEL = "eleven_flash_v2";

function toolConfig(spec: ToolSpec, businessId: string): ElevenLabs.ToolRequestModel {
  const properties: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(spec.params).map(([k, p]) => [k, { ...p }])),
    // Filled by ElevenLabs, not the LLM: ties a booking to its call and de-duplicates retries.
    conversation_id: { type: "string", dynamicVariable: "system__conversation_id" },
  };
  return {
    toolConfig: {
      type: "webhook",
      name: spec.name,
      description: spec.description,
      responseTimeoutSecs: 20,
      apiSchema: {
        url: `${appUrl()}${spec.path}?b=${businessId}`,
        method: "POST",
        requestHeaders: { "x-frontdesk-key": toolKey(businessId) },
        requestBodySchema: { type: "object", properties, required: spec.required },
      },
    },
  } as unknown as ElevenLabs.ToolRequestModel;
}

export interface SyncResult {
  phoneNumber: string | null;
  /** False when Twilio isn't configured yet: the agent works in the browser but has no number. */
  phoneReady: boolean;
}

/**
 * Create or update the business's ElevenLabs agent (and its two tools) from its settings, and give it a
 * phone number the first time Twilio is available. Safe to call repeatedly: it is how settings changes
 * reach the live agent.
 */
export async function syncAgent(businessId: string): Promise<SyncResult> {
  const config = await loadBusinessConfig(businessId);
  const b = config.business;
  const def = buildAgentDefinition(config);
  const ai = elevenlabs().conversationalAi;

  // Tools: update in place when we already own them, otherwise create.
  const toolIds: string[] = [];
  for (const [i, spec] of def.tools.entries()) {
    const existing = b.voice_tool_ids?.[i];
    const body = toolConfig(spec, b.id);
    toolIds.push(existing ? (await ai.tools.update(existing, body)).id : (await ai.tools.create(body)).id);
  }

  const builtInTools = {
    endCall: { type: "system", name: "end_call", description: "Hang up after saying goodbye, or if nobody is on the line.", params: { systemToolType: "end_call" } },
    transferToNumber: def.transferNumber
      ? {
          type: "system",
          name: "transfer_to_number",
          description: "Transfer the caller to a person at the business: emergencies, complaints, or when they ask for a human.",
          params: {
            systemToolType: "transfer_to_number",
            transfers: [{ transferDestination: { type: "phone", phoneNumber: def.transferNumber }, condition: "The caller has an emergency, is upset, or asks for a person." }],
          },
        }
      : null,
  };

  const agentBody = {
    name: `${b.name} (${b.id.slice(0, 8)})`,
    conversationConfig: {
      agent: {
        firstMessage: def.firstMessage,
        language: "en",
        prompt: { prompt: def.prompt, llm: voiceLlm(), temperature: 0.2, timezone: b.timezone, toolIds, builtInTools },
      },
      tts: { voiceId: b.voice_id, modelId: TTS_MODEL },
    },
    platformSettings: { dataCollection: def.dataCollection },
  };

  const agentId = b.voice_agent_id
    ? (await ai.agents.update(b.voice_agent_id, agentBody as never)).agentId
    : (await ai.agents.create(agentBody as never)).agentId;

  // Phone number: buy on Twilio and import into ElevenLabs once; afterwards keep it pointed at the agent.
  let phoneNumber = b.phone_number;
  let phoneNumberId = b.phone_number_id;
  if (phoneNumberId) {
    await ai.phoneNumbers.update(phoneNumberId, { agentId });
  } else if (isConfigured("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN")) {
    phoneNumber = phoneNumber ?? (await buyLocalNumber(b.area_code, `FrontDesk · ${b.name}`));
    const { sid, token } = twilioCredentials();
    const created = await ai.phoneNumbers.create({ provider: "twilio", phoneNumber, label: b.name.slice(0, 60), sid, token, agentId } as never);
    phoneNumberId = (created as { phoneNumberId: string }).phoneNumberId;
  }

  // WhatsApp: the business's WhatsApp Business number (connected in the workspace) answers with the same agent.
  if (b.whatsapp_phone_number_id) await setWhatsAppAgent(b.whatsapp_phone_number_id, agentId);

  await sql`update businesses set voice_agent_id = ${agentId}, voice_tool_ids = ${toolIds}, phone_number = ${phoneNumber},
              phone_number_id = ${phoneNumberId}, agent_synced_at = now() where id = ${businessId}`;
  return { phoneNumber, phoneReady: !!phoneNumberId };
}

export interface WhatsAppNumber {
  phoneNumberId: string;
  phoneNumber: string;
  name: string;
  assignedAgentId: string | null;
  tokenExpired: boolean;
}

/**
 * WhatsApp Business numbers imported into the ElevenLabs workspace. Importing is a one-time Meta sign-in
 * in the ElevenLabs dashboard (WhatsApp → Import account); everything after that happens here.
 */
export async function listWhatsAppNumbers(): Promise<WhatsAppNumber[]> {
  const res = await elevenlabs().conversationalAi.whatsappAccounts.list();
  return res.items.map((a) => ({
    phoneNumberId: a.phoneNumberId,
    phoneNumber: a.phoneNumber,
    name: a.phoneNumberName || a.businessAccountName,
    assignedAgentId: a.assignedAgentId ?? null,
    tokenExpired: !!a.isTokenExpired,
  }));
}

/** Point a WhatsApp number at an agent (null detaches it, so WhatsApp calls and messages stop being answered). */
export async function setWhatsAppAgent(phoneNumberId: string, agentId: string | null): Promise<void> {
  await elevenlabs().conversationalAi.whatsappAccounts.update(phoneNumberId, {
    assignedAgentId: agentId as string,
    enableMessaging: !!agentId,
    enableAudioMessageResponse: true,
    enableTypingIndicator: true,
  });
}

/** Short-lived signed URL so the owner can talk to their agent in the browser without a phone. */
export async function createTestSessionUrl(agentId: string): Promise<string> {
  const res = await elevenlabs().conversationalAi.conversations.getSignedUrl({ agentId });
  return res.signedUrl;
}

/** Verify the ElevenLabs-Signature header on a post-call webhook and return the parsed event, or null. */
export async function verifyWebhook(rawBody: string, signature: string | null): Promise<Record<string, unknown> | null> {
  const secret = optional("ELEVENLABS_WEBHOOK_SECRET");
  if (!signature || !secret) return null;
  try {
    return await new ElevenLabsClient({ apiKey: optional("ELEVENLABS_API_KEY") ?? "unused" }).webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return null;
  }
}
