import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { Business, BusinessConfig } from "./types";

/** Everything the agent and booking engine need about one business. */
export async function loadBusinessConfig(db: SupabaseClient, businessId: string): Promise<BusinessConfig> {
  const [business, hours, services, staff] = await Promise.all([
    db.from("businesses").select("*").eq("id", businessId).single(),
    db.from("business_hours").select("*").eq("business_id", businessId),
    db.from("services").select("*").eq("business_id", businessId).order("created_at"),
    db.from("staff").select("*").eq("business_id", businessId).order("is_default", { ascending: false }).order("created_at"),
  ]);
  if (business.error || !business.data) throw new Error(`Business ${businessId} not found`);
  const staffIds = (staff.data ?? []).map((s) => s.id);
  const staffServices = staffIds.length
    ? ((await db.from("staff_services").select("staff_id, service_id").in("staff_id", staffIds)).data ?? [])
    : [];
  return {
    business: business.data,
    hours: hours.data ?? [],
    services: services.data ?? [],
    staff: staff.data ?? [],
    staffServices,
  };
}

/** Business id behind a Retell agent. Tool calls are trusted only after signature verification. */
export async function businessIdForAgent(db: SupabaseClient, agentId: string): Promise<string | null> {
  const { data } = await db.from("businesses").select("id").eq("retell_agent_id", agentId).maybeSingle();
  return data?.id ?? null;
}

/** Signed-in owner and their business, for dashboard pages. Redirects when either is missing. */
export async function requireBusiness(): Promise<{ business: Business; userId: string; email: string }> {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await db.from("business_members").select("business_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");
  const { data: business } = await db.from("businesses").select("*").eq("id", membership.business_id).single();
  if (!business) redirect("/onboarding");
  return { business, userId: user.id, email: user.email ?? "" };
}
