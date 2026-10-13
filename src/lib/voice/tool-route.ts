import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabase/server";
import { businessIdForAgent } from "../business";
import { verifyRetellRequest, type RetellToolRequest } from "./retell";
import type { ToolReply } from "../booking/booking-service";

type Handler = (ctx: { db: SupabaseClient; businessId: string; callId: string; args: Record<string, unknown> }) => Promise<ToolReply>;

/**
 * Shared wrapper for agent tool endpoints: verify Retell's signature, resolve the business from the
 * agent id (never from caller-controlled args), and always answer 200 with something sayable.
 */
export function toolRoute(name: string, handler: Handler) {
  return async function POST(req: Request) {
    const raw = await req.text();
    if (!(await verifyRetellRequest(raw, req.headers.get("x-retell-signature")))) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    let body: RetellToolRequest;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "bad json" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const businessId = body.call?.agent_id ? await businessIdForAgent(db, body.call.agent_id) : null;
    if (!businessId) {
      return NextResponse.json({ result: "This line isn't set up for booking yet. Take a message for the team." });
    }

    try {
      const reply = await handler({ db, businessId, callId: body.call.call_id, args: body.args ?? {} });
      return NextResponse.json(reply);
    } catch (err) {
      console.error(`tool ${name} failed`, { businessId, callId: body.call.call_id }, err);
      return NextResponse.json({
        result: "Something went wrong on our side. Take the caller's name, number and what they need, and tell them the team will call back.",
        error: "internal",
      });
    }
  };
}
