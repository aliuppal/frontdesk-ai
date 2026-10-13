"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBusiness } from "@/lib/business";
import { normalizePhone } from "@/lib/booking/phone";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncAgent } from "@/lib/voice/retell";
import { INDUSTRIES } from "@/lib/voice/prompt";

// Each action: resolve the owner's business from their session, write with the service role scoped to
// that business id, then push the new settings to the live agent (if it's switched on).

type Section = "agent" | "calendar" | "profile" | "hours" | "services" | "staff";

async function finish(section: Section, opts: { sync?: boolean; error?: string } = {}): Promise<never> {
  const { business } = await requireBusiness();
  let syncError: string | undefined;
  if (opts.sync !== false && business.retell_agent_id && !opts.error) {
    try {
      await syncAgent(business.id);
    } catch (err) {
      console.error("agent sync failed", err);
      syncError = "Saved, but the phone agent couldn't be updated. Try “Update agent” in a minute.";
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
  const phone = text(form.get("business_phone"));
  const transfer = text(form.get("transfer_number"));
  const { error } = await supabaseAdmin()
    .from("businesses")
    .update({
      ...parsed.data,
      business_phone: phone ? normalizePhone(phone) : null,
      address: text(form.get("address")),
      greeting: text(form.get("greeting")),
      agent_instructions: text(form.get("agent_instructions")),
      transfer_number: transfer ? normalizePhone(transfer) : null,
      requires_address: form.get("requires_address") === "on",
      voice_id: text(form.get("voice_id")) ?? "retell-Cimo",
      buffer_minutes: int(form.get("buffer_minutes"), 0, 240, 0),
      min_notice_minutes: int(form.get("min_notice_minutes"), 0, 10080, 60),
      max_days_ahead: int(form.get("max_days_ahead"), 1, 365, 30),
      slot_interval_minutes: [10, 15, 20, 30, 60].includes(Number(form.get("slot_interval_minutes"))) ? Number(form.get("slot_interval_minutes")) : 30,
    })
    .eq("id", business.id);
  return finish("profile", { error: error?.message });
}

export async function saveHours(form: FormData) {
  const { business } = await requireBusiness();
  const rows: { business_id: string; weekday: number; open_time: string; close_time: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    if (form.get(`open_${d}_on`) !== "on") continue;
    const open = String(form.get(`open_${d}`) ?? "");
    const close = String(form.get(`close_${d}`) ?? "");
    if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close) || close <= open) {
      return finish("hours", { error: "Each open day needs a closing time after its opening time." });
    }
    rows.push({ business_id: business.id, weekday: d, open_time: open, close_time: close });
  }
  const db = supabaseAdmin();
  const del = await db.from("business_hours").delete().eq("business_id", business.id);
  const ins = rows.length ? await db.from("business_hours").insert(rows) : { error: null };
  return finish("hours", { error: del.error?.message ?? ins.error?.message });
}

export async function saveService(form: FormData) {
  const { business } = await requireBusiness();
  const id = text(form.get("id"));
  const name = text(form.get("name"));
  if (!name) return finish("services", { error: "Give the service a name." });
  const row = {
    business_id: business.id,
    name,
    duration_minutes: int(form.get("duration_minutes"), 5, 600, 60),
    price_note: text(form.get("price_note")),
    description: text(form.get("description")),
    active: id ? form.get("active") === "on" : true,
  };
  const db = supabaseAdmin();
  const { error } = id ? await db.from("services").update(row).eq("id", id).eq("business_id", business.id) : await db.from("services").insert(row);
  return finish("services", { error: error?.message });
}

export async function deleteService(form: FormData) {
  const { business } = await requireBusiness();
  const { error } = await supabaseAdmin().from("services").delete().eq("id", String(form.get("id"))).eq("business_id", business.id);
  return finish("services", { error: error?.message });
}

export async function saveStaff(form: FormData) {
  const { business } = await requireBusiness();
  const db = supabaseAdmin();
  const id = text(form.get("id"));
  const name = text(form.get("name"));
  if (!name) return finish("staff", { error: "Give the team member a name." });
  const row = {
    business_id: business.id,
    name,
    email: text(form.get("email")),
    calendar_id: text(form.get("calendar_id")) ?? "primary",
    active: id ? form.get("active") === "on" : true,
  };
  const res = id
    ? await db.from("staff").update(row).eq("id", id).eq("business_id", business.id).select("id").single()
    : await db.from("staff").insert(row).select("id").single();
  if (res.error || !res.data) return finish("staff", { error: res.error?.message ?? "Couldn't save" });

  // Services this person does. None ticked = they can do every service.
  const { data: owned } = await db.from("services").select("id").eq("business_id", business.id);
  const allowed = new Set((owned ?? []).map((s) => s.id));
  const picked = form.getAll("service_ids").map(String).filter((s) => allowed.has(s));
  await db.from("staff_services").delete().eq("staff_id", res.data.id);
  if (picked.length) await db.from("staff_services").insert(picked.map((service_id) => ({ staff_id: res.data.id, service_id })));
  return finish("staff");
}

export async function removeStaff(form: FormData) {
  const { business } = await requireBusiness();
  const db = supabaseAdmin();
  const id = String(form.get("id"));
  const { data: s } = await db.from("staff").select("is_default").eq("id", id).eq("business_id", business.id).single();
  if (!s) return finish("staff", { error: "Not found" });
  if (s.is_default) return finish("staff", { error: "The main calendar can't be removed. Rename it instead." });
  // Keep the row (past appointments point at it); just stop offering their time.
  const { error } = await db.from("staff").update({ active: false }).eq("id", id).eq("business_id", business.id);
  return finish("staff", { error: error?.message });
}

export async function disconnectCalendar() {
  const { business } = await requireBusiness();
  await supabaseAdmin().from("calendar_connections").delete().eq("business_id", business.id);
  return finish("calendar", { sync: false });
}

export async function activateAgent() {
  const { business } = await requireBusiness();
  let failure: string | undefined;
  try {
    await syncAgent(business.id);
  } catch (err) {
    console.error("activate agent failed", err);
    failure = `Couldn't switch the agent on: ${(err as Error).message}`;
  }
  return finish("agent", { sync: false, error: failure });
}
