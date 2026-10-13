import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/business";
import { createTestWebCall } from "@/lib/voice/retell";

/** Access token for a browser test call to the owner's own agent. */
export async function POST() {
  const { business } = await requireBusiness();
  if (!business.retell_agent_id) return NextResponse.json({ error: "Activate your phone agent first." }, { status: 400 });
  try {
    return NextResponse.json({ accessToken: await createTestWebCall(business.retell_agent_id) });
  } catch (err) {
    console.error("test call failed", err);
    return NextResponse.json({ error: "Couldn't start a test call. Check your Retell API key." }, { status: 502 });
  }
}
