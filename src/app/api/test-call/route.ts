import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/business";
import { createTestSessionUrl } from "@/lib/voice/elevenlabs";

/** Signed URL for a browser test call to the owner's own agent. */
export async function POST() {
  const { business } = await requireBusiness();
  if (!business.voice_agent_id) return NextResponse.json({ error: "Switch on your phone agent first." }, { status: 400 });
  try {
    return NextResponse.json({ signedUrl: await createTestSessionUrl(business.voice_agent_id) });
  } catch (err) {
    console.error("test call failed", err);
    return NextResponse.json({ error: "Couldn't start a test call. Check the ElevenLabs API key." }, { status: 502 });
  }
}
