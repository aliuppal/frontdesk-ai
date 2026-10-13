import { after, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql } from "@/lib/db";
import { businessIdForAgent } from "@/lib/business";
import { verifyRetellRequest } from "@/lib/voice/retell";
import { normalizePhone } from "@/lib/booking/phone";

// Retell call lifecycle → our `calls` table. One idempotent upsert on retell_call_id handles every event,
// so retries and out-of-order delivery are harmless: a null value never overwrites a filled column.

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

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyRetellRequest(raw, req.headers.get("x-retell-signature")))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { event, call } = JSON.parse(raw) as { event: string; call: RetellCall };
  if (!call?.call_id || !["call_started", "call_ended", "call_analyzed"].includes(event)) return new NextResponse(null, { status: 204 });

  const businessId = await businessIdForAgent(call.agent_id);
  if (!businessId) return new NextResponse(null, { status: 204 }); // agent not ours (or deleted)

  const from = call.from_number ? normalizePhone(call.from_number) : null;
  const ended = event !== "call_started";
  const a = event === "call_analyzed" ? call.call_analysis : undefined;
  const turns = call.transcript_object?.map(({ role, content, words }) => ({ role, content, words }));

  try {
    await sql`
      insert into calls (business_id, retell_call_id, status, from_number, to_number, started_at, ended_at, duration_seconds,
                         transcript, transcript_json, disconnection_reason, cost_cents, summary, sentiment, successful, extracted, customer_id)
      values (${businessId}, ${call.call_id}, ${ended ? "ended" : "in_progress"}, ${from}, ${call.to_number ?? null},
              ${iso(call.start_timestamp)}, ${iso(call.end_timestamp)},
              ${call.duration_ms != null ? Math.round(call.duration_ms / 1000) : null},
              ${call.transcript ?? null}, ${turns ? JSON.stringify(turns) : null}::jsonb, ${call.disconnection_reason ?? null},
              ${call.call_cost?.combined_cost ?? null}, ${a?.call_summary ?? null}, ${a?.user_sentiment ?? null},
              ${a?.call_successful ?? null}, coalesce(${a ? JSON.stringify(a.custom_analysis_data ?? {}) : null}::jsonb, '{}'::jsonb),
              (select id from customers where business_id = ${businessId} and phone = ${from}))
      on conflict (retell_call_id) do update set
        status = case when calls.status = 'ended' then 'ended' else excluded.status end,
        from_number = coalesce(excluded.from_number, calls.from_number),
        to_number = coalesce(excluded.to_number, calls.to_number),
        started_at = coalesce(excluded.started_at, calls.started_at),
        ended_at = coalesce(excluded.ended_at, calls.ended_at),
        duration_seconds = coalesce(excluded.duration_seconds, calls.duration_seconds),
        transcript = coalesce(excluded.transcript, calls.transcript),
        transcript_json = coalesce(excluded.transcript_json, calls.transcript_json),
        disconnection_reason = coalesce(excluded.disconnection_reason, calls.disconnection_reason),
        cost_cents = coalesce(excluded.cost_cents, calls.cost_cents),
        summary = coalesce(excluded.summary, calls.summary),
        sentiment = coalesce(excluded.sentiment, calls.sentiment),
        successful = coalesce(excluded.successful, calls.successful),
        extracted = case when ${!!a} then excluded.extracted else calls.extracted end,
        customer_id = coalesce(calls.customer_id, excluded.customer_id)`;
  } catch (err) {
    console.error("webhook upsert failed", call.call_id, err);
    return NextResponse.json({ error: "db" }, { status: 500 }); // Retell will retry
  }

  // Retell's recording links expire after ~10 minutes, so copy the audio into our own private storage.
  if (event === "call_ended" && call.recording_url) {
    const url = call.recording_url;
    after(() => copyRecording(businessId, call.call_id, url));
  }
  return new NextResponse(null, { status: 204 });
}

async function copyRecording(businessId: string, callId: string, url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const type = res.headers.get("content-type") ?? "audio/wav";
    const path = `recordings/${businessId}/${callId}.${type.includes("mpeg") ? "mp3" : "wav"}`;
    await put(path, Buffer.from(await res.arrayBuffer()), { access: "private", contentType: type, addRandomSuffix: false, allowOverwrite: true });
    await sql`update calls set recording_path = ${path} where retell_call_id = ${callId}`;
  } catch (err) {
    console.error("recording copy failed", callId, err);
  }
}
