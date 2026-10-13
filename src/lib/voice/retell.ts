import "server-only";
import Retell, { verify } from "retell-sdk";
import { appUrl, need, optional, retellModel } from "../env";
import { sql } from "../db";
import { loadBusinessConfig } from "../business";
import { buildAgentDefinition } from "./prompt";

// Everything that talks to Retell lives here, so swapping voice vendors only touches this file,
// the webhook route and the tool request parser.

export function retell() {
  return new Retell({ apiKey: need("RETELL_API_KEY") });
}

/** Verify `x-retell-signature` against the exact raw body. */
export async function verifyRetellRequest(rawBody: string, signature: string | null): Promise<boolean> {
  const key = optional("RETELL_API_KEY");
  if (!signature || !key) return false;
  try {
    return await verify(rawBody, key, signature);
  } catch {
    return false;
  }
}

/** Shape of a custom-function request from Retell (default, non args-at-root payload). */
export interface RetellToolRequest {
  name: string;
  args: Record<string, unknown>;
  call: { call_id: string; agent_id: string; from_number?: string; to_number?: string };
}

/**
 * Create or update the business's Retell LLM + agent from its settings, and buy a phone number the
 * first time. Safe to call repeatedly: it is how settings changes reach the live agent.
 */
export async function syncAgent(businessId: string): Promise<{ phoneNumber: string | null }> {
  const config = await loadBusinessConfig(businessId);
  const b = config.business;
  const def = buildAgentDefinition(config, appUrl());
  const client = retell();

  // The SDK's params are strict unions; our definition is plain JSON built by prompt.ts.
  const llmBody = {
    model: retellModel(),
    model_temperature: 0.2,
    start_speaker: "agent",
    general_prompt: def.generalPrompt,
    begin_message: def.beginMessage,
    general_tools: def.tools,
  } as never;

  const llmId = b.retell_llm_id
    ? (await client.llm.update(b.retell_llm_id, llmBody)).llm_id
    : (await client.llm.create(llmBody)).llm_id;

  const agentBody = {
    agent_name: `${b.name} (${b.id.slice(0, 8)})`,
    response_engine: { type: "retell-llm", llm_id: llmId },
    voice_id: b.voice_id,
    language: "en-US",
    timezone: b.timezone,
    webhook_url: `${appUrl()}/api/retell/webhook`,
    post_call_analysis_data: def.analysis,
    enable_backchannel: true,
    end_call_after_silence_ms: 30000,
    max_call_duration_ms: 20 * 60 * 1000,
  } as never;

  const agentId = b.retell_agent_id
    ? (await client.agent.update(b.retell_agent_id, agentBody)).agent_id
    : (await client.agent.create(agentBody)).agent_id;

  let phoneNumber = b.phone_number;
  if (!phoneNumber) {
    // "latest" makes the number always use the newest agent version, so settings saves go live at once.
    const base = {
      nickname: b.name.slice(0, 60),
      inbound_agents: [{ agent_id: agentId, weight: 1, agent_version: "latest" }],
    };
    let created;
    try {
      created = await client.phoneNumber.create({ ...base, ...(b.area_code ? { area_code: b.area_code } : {}) });
    } catch (err) {
      if (!b.area_code) throw err;
      created = await client.phoneNumber.create(base); // that area code is sold out: take any US number
    }
    phoneNumber = created.phone_number;
  }

  await sql`update businesses set retell_llm_id = ${llmId}, retell_agent_id = ${agentId}, phone_number = ${phoneNumber},
              agent_synced_at = now() where id = ${businessId}`;
  return { phoneNumber };
}

/** Short-lived token so the owner can talk to their agent from the browser without a phone. */
export async function createTestWebCall(agentId: string): Promise<string> {
  const res = await retell().call.createWebCall({ agent_id: agentId });
  return res.access_token;
}
