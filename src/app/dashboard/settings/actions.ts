"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBusiness } from "@/lib/business";
import { normalizePhone } from "@/lib/booking/phone";
import { db, one, sql } from "@/lib/db";
import { syncAgent } from "@/lib/voice/retell";
import { INDUSTRIES } from "@/lib/voice/prompt";

// Each action: resolve the owner's business from their session, write rows scoped to that business id,
// then push the new settings to the live agent (if it's switched on).

type Section = "agent" | "calendar" | "profile" | "hours" | "services" | "staff";

async function finish(section: Section, opts: { sync?: boolean; error?: string } = {}): Promise<never> {
  const { business } = await requireBusiness();
  let syncError: string | undefined;
  if (opts.sync !== false && business.retell_agent_id && !opts.error) {
    try {
      await syncAgent(business.id);
    } catch (err) {
      console.error("agent sync failed", err);
      syncError = "Saved, but the phone agent couldn't be updated. Try “Update agent now” in a minute.";
    }
  }
  revalidatePath("/dashboard", "layout");
  const message = opts.error ?? syncError;
  const params = new URLSearchParams(message ? { error: message } : { saved: section });
  redirect(`/dashboard/settings?${params}#${section}`);
}

const text = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
};
const int = (v: FormDataEntryValue | null, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const errorText = (err: unknown) => (err as Error)?.message ?? "Something went wrong";

const profile = z.object({
  name: z.string().trim().min(2),
  industry: z.string().refine((v) => v in INDUSTRIES),
  timezone: z.string().min(3),
  notification_email: z.string().email(),
});

export async function saveProfile(form: FormData) {
  const { business } = await requireBusiness();
  const parsed = profile.safeParse(Object.fromEntries(form));
  if (!parsed.success) return finish("profile", { error: "Check the business name, type and alert email." });
  const v = parsed.data;
  const phone = text(form.get("business_phone"));
  const transfer = text(form.get("transfer_number"));
  const interval = Number(form.get("slot_interval_minutes"));
  try {
    await sql`update businesses set
      name = ${v.name}, industry = ${v.industry}, timezone = ${v.timezone}, notification_email = ${v.notification_email},
      business_phone = ${phone ? normalizePhone(phone) : null},
      address = ${text(form.get("address"))},
      greeting = ${text(form.get("greeting"))},
      agent_instructions = ${text(form.get("agent_instructions"))},
      transfer_number = ${transfer ? normalizePhone(transfer) : null},
      requires_address = ${form.get("requires_address") === "on"},
      voice_id = ${text(form.get("voice_id")) ?? "retell-Cimo"},
      buffer_minutes = ${int(form.get("buffer_minutes"), 0, 240, 0)},
      min_notice_minutes = ${int(form.get("min_notice_minutes"), 0, 10080, 60)},
      max_days_ahead = ${int(form.get("max_days_ahead"), 1, 365, 30)},
      slot_interval_minutes = ${[10, 15, 20, 30, 60].includes(interval) ? interval : 30}
      where id = ${business.id}`;
  } catch (err) {
    return finish("profile", { error: errorText(err) });
  }
  return finish("profile");
}

export async function saveHours(form: FormData) {
  const { business } = await requireBusiness();
  const rows: { weekday: number; open_time: string; close_time: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    if (form.get(`open_${d}_on`) !== "on") continue;
    const open = String(form.get(`open_${d}`) ?? "");
    const close = String(form.get(`close_${d}`) ?? "");
    if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close) || close <= open) {
      return finish("hours", { error: "Each open day needs a closing time after its opening time." });
    }
    rows.push({ weekday: d, open_time: open, close_time: close });
  }
  const q = db();
  try {
    await q.transaction([
      q`delete from business_hours where business_id = ${business.id}`,
      q`insert into business_hours (business_id, weekday, open_time, close_time)
        select ${business.id}::uuid, r.weekday, r.open_time::time, r.close_time::time
        from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(weekday int, open_time text, close_time text)`,
    ]);
  } catch (err) {
    return finish("hours", { error: errorText(err) });
  }
  return finish("hours");
}

export async function saveService(form: FormData) {
  const { business } = await requireBusiness();
  const id = text(form.get("id"));
  const name = text(form.get("name"));
  if (!name) return finish("services", { error: "Give the service a name." });
  const minutes = int(form.get("duration_minutes"), 5, 600, 60);
  const price = text(form.get("price_note"));
  const description = text(form.get("description"));
  try {
    if (id) {
      await sql`update services set name = ${name}, duration_minutes = ${minutes}, price_note = ${price},
                description = ${description}, active = ${form.get("active") === "on"}
                where id = ${id} and business_id = ${business.id}`;
    } else {
      await sql`insert into services (business_id, name, duration_minutes, price_note, description)
                values (${business.id}, ${name}, ${minutes}, ${price}, ${description})`;
    }
  } catch (err) {
    return finish("services", { error: errorText(err) });
  }
  return finish("services");
}

export async function deleteService(form: FormData) {
  const { business } = await requireBusiness();
  await sql`delete from services where id = ${String(form.get("id"))} and business_id = ${business.id}`;
  return finish("services");
}

export async function saveStaff(form: FormData) {
  const { business } = await requireBusiness();
  const id = text(form.get("id"));
  const name = text(form.get("name"));
  if (!name) return finish("staff", { error: "Give the team member a name." });
  const email = text(form.get("email"));
  const calendarId = text(form.get("calendar_id")) ?? "primary";
  // Services this person does. None ticked = they can do every service.
  const picked = form.getAll("service_ids").map(String);

  try {
    const row = id
      ? await one<{ id: string }>(sql`update staff set name = ${name}, email = ${email}, calendar_id = ${calendarId},
                active = ${form.get("active") === "on"} where id = ${id} and business_id = ${business.id} returning id`)
      : await one<{ id: string }>(sql`insert into staff (business_id, name, email, calendar_id)
                values (${business.id}, ${name}, ${email}, ${calendarId}) returning id`);
    if (!row) return finish("staff", { error: "Team member not found." });
    const q = db();
    await q.transaction([
      q`delete from staff_services where staff_id = ${row.id}`,
      // Only services that belong to this business can be linked.
      q`insert into staff_services (staff_id, service_id)
        select ${row.id}::uuid, s.id from services s where s.business_id = ${business.id} and s.id::text = any(${picked}::text[])`,
    ]);
  } catch (err) {
    return finish("staff", { error: errorText(err) });
  }
  return finish("staff");
}

export async function removeStaff(form: FormData) {
  const { business } = await requireBusiness();
  const id = String(form.get("id"));
  const s = await one<{ is_default: boolean }>(sql`select is_default from staff where id = ${id} and business_id = ${business.id}`);
  if (!s) return finish("staff", { error: "Not found" });
  if (s.is_default) return finish("staff", { error: "The main calendar can't be removed. Rename it instead." });
  // Keep the row (past appointments point at it); just stop offering their time.
  await sql`update staff set active = false where id = ${id} and business_id = ${business.id}`;
  return finish("staff");
}

export async function disconnectCalendar() {
  const { business } = await requireBusiness();
  await sql`delete from calendar_connections where business_id = ${business.id}`;
  return finish("calendar", { sync: false });
}

export async function activateAgent() {
  const { business } = await requireBusiness();
  let failure: string | undefined;
  try {
    await syncAgent(business.id);
  } catch (err) {
    console.error("activate agent failed", err);
    failure = `Couldn't switch the agent on: ${errorText(err)}`;
  }
  return finish("agent", { sync: false, error: failure });
}
