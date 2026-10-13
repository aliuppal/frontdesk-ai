"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/business";
import { db, one, sql } from "@/lib/db";
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
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/onboarding?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const v = parsed.data;

  const existing = await one(sql`select 1 from business_members where user_id = ${user.id}`);
  if (existing) redirect("/dashboard");

  const services = parseServices(v.services);
  const businessId = crypto.randomUUID();
  const q = db();
  // One transaction: the business and everything it starts with exist together or not at all.
  await q.transaction([
    q`insert into businesses (id, name, industry, timezone, notification_email, area_code, requires_address)
      values (${businessId}, ${v.name}, ${v.industry}, ${v.timezone}, ${v.notification_email},
              ${v.area_code ? Number(v.area_code) : null}, ${ON_SITE.has(v.industry)})`,
    q`insert into business_members (business_id, user_id, role) values (${businessId}, ${user.id}, 'owner')`,
    q`insert into business_hours (business_id, weekday, open_time, close_time)
      select ${businessId}, d, '09:00', '17:00' from generate_series(1, 5) d`,
    q`insert into services (business_id, name, duration_minutes)
      select ${businessId}, s.name, s.duration_minutes
      from jsonb_to_recordset(${JSON.stringify(services)}::jsonb) as s(name text, duration_minutes int)`,
    q`insert into staff (business_id, name, calendar_id, is_default) values (${businessId}, ${v.name}, 'primary', true)`,
  ]);
  redirect("/dashboard/settings?welcome=1");
}
