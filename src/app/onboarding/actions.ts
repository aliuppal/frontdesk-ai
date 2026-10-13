"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { INDUSTRIES } from "@/lib/voice/prompt";

const ON_SITE = new Set(["plumbing", "hvac", "electrical", "cleaning", "landscaping"]);

const schema = z.object({
  name: z.string().trim().min(2, "Enter your business name"),
  industry: z.string().refine((v) => v in INDUSTRIES),
  timezone: z.string().min(3),
  notification_email: z.string().email("Enter a valid email for booking alerts"),
  area_code: z.union([z.literal(""), z.string().regex(/^\d{3}$/, "Area code is 3 digits")]),
  services: z.string().trim().min(2, "Add at least one service"),
});

/** "Haircut, 45" / "Drain cleaning - 90" / "Consultation" → { name, minutes } */
function parseServices(text: string): { name: string; duration_minutes: number }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)[\s,–-]+(\d{1,3})\s*(?:min(?:utes)?|m)?$/i);
      const minutes = m ? Math.min(600, Math.max(5, Number(m[2]))) : 60;
      return { name: (m ? m[1] : line).trim(), duration_minutes: minutes };
    })
    .filter((s) => s.name.length > 0)
    .slice(0, 30);
}

export async function createBusiness(form: FormData) {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/onboarding?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const v = parsed.data;

  const db = supabaseAdmin();
  const { data: existing } = await db.from("business_members").select("business_id").eq("user_id", user.id).maybeSingle();
  if (existing) redirect("/dashboard");

  const { data: business, error } = await db
    .from("businesses")
    .insert({
      name: v.name,
      industry: v.industry,
      timezone: v.timezone,
      notification_email: v.notification_email,
      area_code: v.area_code ? Number(v.area_code) : null,
      requires_address: ON_SITE.has(v.industry),
    })
    .select("id")
    .single();
  if (error || !business) redirect(`/onboarding?error=${encodeURIComponent(error?.message ?? "Could not create business")}`);

  const services = parseServices(v.services);
  const results = await Promise.all([
    db.from("business_members").insert({ business_id: business.id, user_id: user.id, role: "owner" }),
    db.from("business_hours").insert([1, 2, 3, 4, 5].map((weekday) => ({ business_id: business.id, weekday, open_time: "09:00", close_time: "17:00" }))),
    db.from("services").insert(services.map((s) => ({ ...s, business_id: business.id }))),
    db.from("staff").insert({ business_id: business.id, name: v.name, calendar_id: "primary", is_default: true }),
  ]);
  const failed = results.find((r) => r.error);
  if (failed) {
    await db.from("businesses").delete().eq("id", business.id);
    redirect(`/onboarding?error=${encodeURIComponent(failed.error!.message)}`);
  }
  redirect("/dashboard/settings?welcome=1");
}
