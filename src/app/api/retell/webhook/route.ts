import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { businessIdForAgent } from "@/lib/business";
import { verifyRetellRequest } from "@/lib/voice/retell";
import { normalizePhone } from "@/lib/booking/phone";

// Retell call lifecycle → our `calls` table. Every handler is an idempotent upsert on retell_call_id,
// so Retell's retries are harmless.

interface RetellCall {
  call_id: string;
  agent_id: string;
  from_number?: string;
  to_number?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  transcript?: string;
  transcript_object?: { role: string; content: string; words?: unknown[] }[];
  recording_url?: string;
  disconnection_reason?: string;
  call_cost?: { combined_cost?: number };
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, unknown>;
  };
}

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : undefined);

/** Drop undefined keys so an upsert never blanks a column another event already filled. */
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyRetellRequest(raw, req.headers.get("x-retell-signature")))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { event, call } = JSON.parse(raw) as { event: string; call: RetellCall };
  if (!call?.call_id) return new NextResponse(null, { status: 204 });

  const db = supabaseAdmin();
  const businessId = await businessIdForAgent(db, call.agent_id);
  if (!businessId) return new NextResponse(null, { status: 204 }); // agent not ours (or deleted)

  const fromNumber = call.from_number ? normalizePhone(call.from_number) : undefined;
  const base = {
    business_id: businessId,
    retell_call_id: call.call_id,
    from_number: fromNumber,
    to_number: call.to_number,
    started_at: iso(call.start_timestamp),
  };

  if (event === "call_started") {
    await db.from("calls").upsert(defined({ ...base, status: "in_progress" }), { onConflict: "retell_call_id" });
  }

  if (event === "call_ended" || event === "call_analyzed") {
    const row: Record<string, unknown> = {
      ...base,
      status: "ended",
      ended_at: iso(call.end_timestamp),
      duration_seconds: call.duration_ms != null ? Math.round(call.duration_ms / 1000) : undefined,
      transcript: call.transcript,
      transcript_json: call.transcript_object?.map(({ role, content, words }) => ({ role, content, words })),
      disconnection_reason: call.disconnection_reason,
      cost_cents: call.call_cost?.combined_cost,
    };

    // Link the call to an existing customer by phone number, if we know them.
    if (fromNumber) {
      const { data: customer } = await db.from("customers").select("id").eq("business_id", businessId).eq("phone", fromNumber).maybeSingle();
      if (customer) row.customer_id = customer.id;
    }

    if (event === "call_analyzed" && call.call_analysis) {
      const a = call.call_analysis;
      row.summary = a.call_summary;
      row.sentiment = a.user_sentiment;
      row.successful = a.call_successful;
      row.extracted = a.custom_analysis_data ?? {};
    }
    // appointment_booked is set by the booking tool; this handler never touches it.
    const { error } = await db.from("calls").upsert(defined(row), { onConflict: "retell_call_id" });
    if (error) {
      console.error("webhook upsert failed", call.call_id, error);
      return NextResponse.json({ error: "db" }, { status: 500 }); // Retell will retry
    }

    // Retell's recording links expire after ~10 minutes, so copy the audio into our own storage.
    if (event === "call_ended" && call.recording_url) {
      const url = call.recording_url;
      after(() => copyRecording(businessId, call.call_id, url));
    }
  }

  return new NextResponse(null, { status: 204 });
}

async function copyRecording(businessId: string, callId: string, url: string) {
  const db = supabaseAdmin();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const type = res.headers.get("content-type") ?? "audio/wav";
    const ext = type.includes("mpeg") ? "mp3" : "wav";
    const path = `${businessId}/${callId}.${ext}`;
    const { error } = await db.storage.from("recordings").upload(path, await res.arrayBuffer(), { contentType: type, upsert: true });
    if (error) throw new Error(error.message);
    await db.from("calls").update({ recording_path: path }).eq("retell_call_id", callId);
  } catch (err) {
    console.error("recording copy failed", callId, err);
  }
}
