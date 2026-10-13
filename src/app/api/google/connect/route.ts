import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/business";
import { signState } from "@/lib/crypto";
import { googleAuthUrl } from "@/lib/calendar/google";

export async function GET() {
  const { business, userId } = await requireBusiness();
  return NextResponse.redirect(googleAuthUrl(signState({ b: business.id, u: userId })));
}
