import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Target of Supabase's sign-up confirmation email (set the email template link to
// {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email).
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const db = await supabaseServer();
    const { error } = await db.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/onboarding", req.url));
  }
  return NextResponse.redirect(new URL("/login?error=confirm", req.url));
}
