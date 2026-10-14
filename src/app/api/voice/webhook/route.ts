import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql } from "@/lib/db";
import { businessIdForAgent } from "@/lib/business";
import { verifyWebhook } from "@/lib/voice/elevenlabs";
import { normalizePhone } from "@/lib/booking/phone";

// ElevenLabs post-call webhooks → our `calls` table. Two events arrive per call, in any order:
// post_call_transcription (transcript, summary, extracted fields) and post_call_audio (base64 MP3).
// Both are idempotent upserts on conversation_id, so retries are harmless.

export const maxDuration = 60;

interface TranscriptTurn {
  role: "agent" | "user";
  message?: string | null;
  time_in_call_secs?: number;
}

interface TranscriptionData {
  agent_id: string;
  conversation_id: string;
  transcript?: TranscriptTurn[];
  metadata?: {
    start_time_unix_secs?: number;
    call_duration_secs?: number;
    cost?: number;
    termination_reason?: string;
    phone_call?: { external_number?: string; agent_number?: string; direction?: string };
    // WhatsApp calls and chats: the user id is the customer's phone number in international format.
    whatsapp?: { whatsapp_user_id?: string; whatsapp_phone_number_id?: string };
  };
  analysis?: {
    transcript_summary?: string;
    call_successful?: "success" | "failure" | "unknown";
    data_collection_results?: Record<string, { value?: unknown }>;
  };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const event = (await verifyWebhook(raw, req.headers.get("elevenlabs-signature"))) as { type?: string; data?: Record<string, unknown> } | null;
  if (!event) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const data = event.data as { agent_id?: string; conversation_id?: string } | undefined;
  if (!data?.agent_id || !data.conversation_id) return new NextResponse(null, { status: 204 });
  const businessId = await businessIdForAgent(data.agent_id);
  if (!businessId) return new NextResponse(null, { status: 204 }); // agent isn't one of ours

  try {
    if (event.type === "post_call_transcription") await saveTranscription(businessId, event.data as unknown as TranscriptionData);
    if (event.type === "post_call_audio") await saveAudio(businessId, data.conversation_id, (event.data as { full_audio?: string }).full_audio);
  } catch (err) {
    console.error("voice webhook failed", event.type, data.conversation_id, err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // ElevenLabs retries
  }
  return new NextResponse(null, { status: 200 });
}

async function saveTranscription(businessId: string, d: TranscriptionData) {
  const m = d.metadata ?? {};
  const channel = m.whatsapp ? "whatsapp" : m.phone_call ? "phone" : "web";
  const rawFrom = m.whatsapp?.whatsapp_user_id ?? m.phone_call?.external_number;
  const from = rawFrom ? normalizePhone(rawFrom) : null;
  const started = m.start_time_unix_secs ? new Date(m.start_time_unix_secs * 1000) : null;
  const duration = m.call_duration_secs ?? null;
  const ended = started && duration != null ? new Date(started.getTime() + duration * 1000) : null;

  // Same shape the dashboard player already reads: words[0].start is where the line begins in the audio.
  const turns = (d.transcript ?? [])
    .filter((t) => t.message)
    .map((t) => ({ role: t.role, content: t.message!, words: t.time_in_call_secs != null ? [{ word: "", start: t.time_in_call_secs, end: t.time_in_call_secs }] : undefined }));
  const transcript = turns.map((t) => `${t.role === "agent" ? "Agent" : "Caller"}: ${t.content}`).join("\n");

  const extracted = Object.fromEntries(
    Object.entries(d.analysis?.data_collection_results ?? {})
      .map(([k, v]) => [k, v?.value])
      .filter(([, v]) => v !== null && v !== undefined && v !== ""),
  );
  const outcome = d.analysis?.call_successful;

  await sql`
    insert into calls (business_id, conversation_id, channel, status, from_number, to_number, started_at, ended_at, duration_seconds,
                       transcript, transcript_json, summary, successful, extracted, disconnection_reason, cost_cents,
                       appointment_booked, customer_id)
    values (${businessId}, ${d.conversation_id}, ${channel}, 'ended', ${from}, ${m.phone_call?.agent_number ?? null},
            ${started?.toISOString() ?? null}, ${ended?.toISOString() ?? null}, ${duration},
            ${transcript}, ${JSON.stringify(turns)}::jsonb, ${d.analysis?.transcript_summary ?? null},
            ${outcome === "success" ? true : outcome === "failure" ? false : null}, ${JSON.stringify(extracted)}::jsonb,
            ${m.termination_reason ?? null}, ${m.cost ?? null},
            exists (select 1 from appointments where conversation_id = ${d.conversation_id} and status = 'booked'),
            (select id from customers where business_id = ${businessId} and phone = ${from}))
    on conflict (conversation_id) do update set
      status = 'ended',
      channel = excluded.channel,
      from_number = coalesce(excluded.from_number, calls.from_number),
      to_number = coalesce(excluded.to_number, calls.to_number),
      started_at = coalesce(excluded.started_at, calls.started_at),
      ended_at = coalesce(excluded.ended_at, calls.ended_at),
      duration_seconds = coalesce(excluded.duration_seconds, calls.duration_seconds),
      transcript = excluded.transcript,
      transcript_json = excluded.transcript_json,
      summary = coalesce(excluded.summary, calls.summary),
      successful = coalesce(excluded.successful, calls.successful),
      extracted = excluded.extracted,
      disconnection_reason = coalesce(excluded.disconnection_reason, calls.disconnection_reason),
      cost_cents = coalesce(excluded.cost_cents, calls.cost_cents),
      appointment_booked = calls.appointment_booked or excluded.appointment_booked,
      customer_id = coalesce(calls.customer_id, excluded.customer_id)`;
}

async function saveAudio(businessId: string, conversationId: string, base64?: string) {
  if (!base64) return;
  const path = `recordings/${businessId}/${conversationId}.mp3`;
  await put(path, Buffer.from(base64, "base64"), { access: "private", contentType: "audio/mpeg", addRandomSuffix: false, allowOverwrite: true });
  // The audio can arrive before the transcript: create a placeholder row the transcript will fill in.
  await sql`
    insert into calls (business_id, conversation_id, status, recording_path) values (${businessId}, ${conversationId}, 'ended', ${path})
    on conflict (conversation_id) do update set recording_path = excluded.recording_path`;
}
