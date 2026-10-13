import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/business";
import { signState } from "@/lib/crypto";
import { googleAuthUrl } from "@/lib/calendar/google";

export async function GET(req: Request) {
  const { business, userId } = await requireBusiness();
  try {
    return NextResponse.redirect(googleAuthUrl(signState({ b: business.id, u: userId })));
  } catch (err) {
    const back = new URL("/dashboard/settings", req.url);
    back.searchParams.set("error", (err as Error).message);
    return NextResponse.redirect(back);
  }
}
