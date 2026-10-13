import Link from "next/link";
import { DateTime } from "luxon";
import { Empty, PageHeader } from "@/components/ui";
import { requireBusiness } from "@/lib/business";
import { formatPhone } from "@/lib/booking/phone";
import { fmtTime } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";
import type { Appointment } from "@/lib/types";
import { cancelAppt } from "./actions";

export const metadata = { title: "Appointments" };

export default async function Appointments({ searchParams }: PageProps<"/dashboard/appointments">) {
  const { view } = (await searchParams) as Record<string, string | undefined>;
  const past = view === "past";
  const { business: b } = await requireBusiness();
  const db = await supabaseServer();
  const now = new Date().toISOString();

  const [{ data }, staff, calls] = await Promise.all([
    past
      ? db.from("appointments").select("*").eq("business_id", b.id).lt("starts_at", now).order("starts_at", { ascending: false }).limit(200)
      : db.from("appointments").select("*").eq("business_id", b.id).gte("starts_at", now).order("starts_at").limit(200),
    db.from("staff").select("id, name").eq("business_id", b.id),
    db.from("calls").select("id, retell_call_id").eq("business_id", b.id).eq("appointment_booked", true).limit(1000),
  ]);
  const appts = (data ?? []) as Appointment[];
  const staffName = new Map((staff.data ?? []).map((s) => [s.id, s.name]));
  const callFor = new Map((calls.data ?? []).map((c) => [c.retell_call_id, c.id]));
  const multiStaff = (staff.data ?? []).length > 1;

  // Group by local day so the list reads like a diary.
  const days = new Map<string, Appointment[]>();
  for (const a of appts) {
    const key = DateTime.fromISO(a.starts_at).setZone(b.timezone).toISODate()!;
    days.set(key, [...(days.get(key) ?? []), a]);
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        sub={past ? "Everything before today, most recent first." : "Booked by your agent, soonest first."}
        actions={
          <div className="flex gap-1" role="group" aria-label="Which appointments">
            <Link href="/dashboard/appointments" aria-current={!past ? "true" : undefined} className={`btn btn-sm ${!past ? "btn-primary" : "btn-ghost"}`}>Upcoming</Link>
            <Link href="/dashboard/appointments?view=past" aria-current={past ? "true" : undefined} className={`btn btn-sm ${past ? "btn-primary" : "btn-ghost"}`}>Past</Link>
          </div>
        }
      />

      {appts.length === 0 ? (
        <div className="card">
          <Empty title={past ? "No past appointments" : "Nothing coming up"}>{!past && "New bookings from calls land here and in your Google Calendar."}</Empty>
        </div>
      ) : (
        <div className="space-y-8">
          {[...days].map(([day, list]) => (
            <section key={day}>
              <h2 className="text-sm text-muted mb-2 px-1">{DateTime.fromISO(day).toFormat("cccc, LLLL d")}</h2>
              <ul className="card divide-y divide-black/5">
                {list.map((a) => {
                  const callId = a.retell_call_id ? callFor.get(a.retell_call_id) : undefined;
                  const cancelled = a.status === "cancelled";
                  return (
                    <li key={a.id} className={`p-4 sm:px-5 grid sm:grid-cols-[96px_1fr_auto] gap-x-5 gap-y-2 items-start ${cancelled ? "opacity-55" : ""}`}>
                      <div className="tabular font-semibold">
                        {fmtTime(a.starts_at, b.timezone)}
                        <div className="text-xs text-muted font-normal">to {fmtTime(a.ends_at, b.timezone)}</div>
                      </div>
                      <div className="min-w-0 text-sm">
                        <div className="font-medium">
                          {a.customer_name} <span className="text-muted font-normal">· {a.service_name}</span>
                          {multiStaff && <span className="text-muted font-normal"> · with {staffName.get(a.staff_id)}</span>}
                        </div>
                        <div className="text-muted mt-0.5 tabular">{[formatPhone(a.customer_phone), a.customer_email, a.address].filter(Boolean).join(" · ")}</div>
                        {a.notes && <p className="mt-1.5">{a.notes}</p>}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {cancelled && <span className="badge">Cancelled</span>}
                          {a.calendar_sync_error && <span className="badge badge-bad" title={a.calendar_sync_error}>Not in Google Calendar</span>}
                          {callId && <Link href={`/dashboard/calls/${callId}`} className="text-[13px] link">Hear the call</Link>}
                        </div>
                      </div>
                      {!past && !cancelled && (
                        <form action={cancelAppt} className="flex flex-col items-end gap-1.5">
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn btn-danger btn-sm">Cancel</button>
                          {a.customer_email && (
                            <label className="text-xs text-muted flex items-center gap-1.5">
                              <input type="checkbox" name="notify" defaultChecked /> email them
                            </label>
                          )}
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
