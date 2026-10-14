import "server-only";
import { NextResponse } from "next/server";
import { verifyToolKey } from "../crypto";
import type { ToolReply } from "../booking/booking-service";

type Handler = (ctx: { businessId: string; callId: string | null; args: Record<string, unknown> }) => Promise<ToolReply>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shared wrapper for agent tool endpoints. The agent's tool config carries ?b=<businessId> and an
 * x-frontdesk-key derived from it (see toolKey), so the business comes from a value only we can sign,
 * never from what the caller says. Always answers 200 with something the agent can say.
 */
export function toolRoute(name: string, handler: Handler) {
  return async function POST(req: Request) {
    const businessId = new URL(req.url).searchParams.get("b") ?? "";
    if (!UUID.test(businessId) || !verifyToolKey(businessId, req.headers.get("x-frontdesk-key"))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "bad json" }, { status: 400 });
    }
    const { conversation_id, ...args } = body;
    const callId = typeof conversation_id === "string" && conversation_id ? conversation_id : null;

    try {
      return NextResponse.json(await handler({ businessId, callId, args }));
    } catch (err) {
      console.error(`tool ${name} failed`, { businessId, callId }, err);
      return NextResponse.json({
        result: "Something went wrong on our side. Take the caller's name, number and what they need, and tell them the team will call back.",
        error: "internal",
      });
    }
  };
}
