import { NextResponse, type NextRequest } from "next/server";
import { requireBusiness } from "@/lib/business";
import { verifyState } from "@/lib/crypto";
import { saveGoogleConnection } from "@/lib/calendar/google";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const settings = new URL("/dashboard/settings", req.url);
  const code = req.nextUrl.searchParams.get("code");
  const state = verifyState(req.nextUrl.searchParams.get("state") ?? "");
  const { business, userId } = await requireBusiness();

  // The signed state must match the signed-in owner, so a link can't attach a calendar to someone else's business.
  if (!code || !state || state.b !== business.id || state.u !== userId) {
    settings.searchParams.set("calendar", "error");
    return NextResponse.redirect(settings);
  }
  try {
    await saveGoogleConnection(supabaseAdmin(), business.id, code);
    settings.searchParams.set("calendar", "connected");
  } catch (err) {
    console.error("google connect failed", err);
    settings.searchParams.set("calendar", "error");
  }
  return NextResponse.redirect(settings);
}
