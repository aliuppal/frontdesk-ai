import "server-only";
import { redirect } from "next/navigation";
import { currentUser, type SessionUser } from "./auth";
import { one, sql } from "./db";
import type { Business, BusinessConfig, BusinessHour, Service, Staff } from "./types";

/** Everything the agent and booking engine need about one business. */
export async function loadBusinessConfig(businessId: string): Promise<BusinessConfig> {
  const [business, hours, services, staff, staffServices] = await Promise.all([
    one<Business>(sql`select * from businesses where id = ${businessId}`),
    sql<BusinessHour>`select id, business_id, weekday, open_time::text as open_time, close_time::text as close_time
                      from business_hours where business_id = ${businessId} order by weekday, open_time`,
    sql<Service>`select * from services where business_id = ${businessId} order by created_at`,
    sql<Staff>`select * from staff where business_id = ${businessId} order by is_default desc, created_at`,
    sql<{ staff_id: string; service_id: string }>`select ss.staff_id, ss.service_id from staff_services ss
        join staff s on s.id = ss.staff_id where s.business_id = ${businessId}`,
  ]);
  if (!business) throw new Error(`Business ${businessId} not found`);
  return { business, hours, services, staff, staffServices };
}

/** Business id behind a Retell agent. Tool calls are trusted only after signature verification. */
export async function businessIdForAgent(agentId: string): Promise<string | null> {
  const row = await one<{ id: string }>(sql`select id from businesses where retell_agent_id = ${agentId}`);
  return row?.id ?? null;
}

/** Signed-in user, or redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Signed-in owner and their business, for dashboard pages and actions. Every dashboard query is then
 * filtered by this business id, which is what keeps one business from seeing another's data.
 */
export async function requireBusiness(): Promise<{ business: Business; userId: string; email: string }> {
  const user = await requireUser();
  const business = await one<Business>(
    sql`select b.* from businesses b join business_members m on m.business_id = b.id
        where m.user_id = ${user.id} order by m.created_at limit 1`,
  );
  if (!business) redirect("/onboarding");
  return { business, userId: user.id, email: user.email };
}
