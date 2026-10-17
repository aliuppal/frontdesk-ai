import { NextResponse } from "next/server";
import { businessIdForAgent } from "@/lib/business";
import { verifyWebhook } from "@/lib/voice/elevenlabs";
import { saveAudio, saveConversation, type ConversationDetail } from "@/lib/voice/calls";

// ElevenLabs post-call webhooks → our `calls` table (the fast path; the dashboard also pulls conversations
// from the ElevenLabs API, see lib/voice/sync.ts). Two events arrive per call, in any order:
// post_call_transcription and post_call_audio (base64 MP3). Both are idempotent upserts.

export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.text();
  const event = (await verifyWebhook(raw, req.headers.get("elevenlabs-signature"))) as { type?: string; data?: Record<string, unknown> } | null;
  if (!event) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const data = event.data as { agent_id?: string; conversation_id?: string; full_audio?: string } | undefined;
  if (!data?.agent_id || !data.conversation_id) return new NextResponse(null, { status: 204 });
  const businessId = await businessIdForAgent(data.agent_id);
  if (!businessId) return new NextResponse(null, { status: 204 }); // agent isn't one of ours

  try {
    if (event.type === "post_call_transcription") await saveConversation(businessId, event.data as unknown as ConversationDetail);
    if (event.type === "post_call_audio" && data.full_audio) await saveAudio(businessId, data.conversation_id, Buffer.from(data.full_audio, "base64"));
  } catch (err) {
    console.error("voice webhook failed", event.type, data.conversation_id, err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // ElevenLabs retries
  }
  return new NextResponse(null, { status: 200 });
}
