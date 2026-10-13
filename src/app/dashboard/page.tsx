import Link from "next/link";
import { DateTime } from "luxon";
import { CallOutcome, Empty, PageHeader, Stat } from "@/components/ui";
import { requireBusiness } from "@/lib/business";
import { formatPhone } from "@/lib/booking/phone";
import { fmtDateTime, fmtDay, fmtDuration, fmtTime } from "@/lib/format";
import { calendarConnection } from "@/lib/calendar/google";
import { sql } from "@/lib/db";
import type { Appointment, Call } from "@/lib/types";

export const metadata = { title: "Overview" };

export default async function Overview() {
  const { business: b } = await requireBusiness();
  const weekAgo = DateTime.now().minus({ days: 7 }).toISO();

  const [calls, recentCalls, upcoming, calendar] = await Promise.all([
    sql<{ duration_seconds: number | null; appointment_booked: boolean }>`
      select duration_seconds, appointment_booked from calls where business_id = ${b.id} and started_at >= ${weekAgo}`,
    sql<Call>`select * from calls where business_id = ${b.id} order by started_at desc nulls last limit 6`,
    sql<Appointment>`select * from appointments where business_id = ${b.id} and status = 'booked' and starts_at >= now()
                     order by starts_at limit 6`,
    calendarConnection(b.id),
  ]);

  const booked = calls.filter((c) => c.appointment_booked).length;
  const minutes = Math.round(calls.reduce((n, c) => n + (c.duration_seconds ?? 0), 0) / 60);
  const callBacks = recentCalls.filter((c) => c.extracted?.follow_up_needed && !c.appointment_booked);

  const steps = [
    { done: true, label: "Business details added", href: "/dashboard/settings" },
    { done: calendar != null, label: "Google Calendar connected", href: "/dashboard/settings#calendar" },
    { done: !!b.phone_number, label: "Phone agent switched on", href: "/dashboard/settings#agent" },
  ];

  return (
    <>
      <PageHeader title="Overview" sub="The last 7 days at your front desk." />

      {steps.some((s) => !s.done) && (
        <div className="card p-6 mb-8">
          <h2 className="text-lg">Finish setting up</h2>
          <ol className="mt-4 space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span className={`size-5 rounded-full grid place-items-center text-[11px] ${s.done ? "bg-fg text-white" : "shadow-[var(--ring)]"}`} aria-hidden>
                  {s.done ? "✓" : ""}
                </span>
                {s.done ? <span className="text-muted line-through">{s.label}</span> : <Link className="link" href={s.href}>{s.label}</Link>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Calls answered" value={calls.length} />
        <Stat label="Appointments booked" value={booked} />
        <Stat label="Booking rate" value={calls.length ? `${Math.round((booked / calls.length) * 100)}%` : "—"} />
        <Stat label="Minutes on the phone" value={minutes} />
      </div>

      {callBacks.length > 0 && (
        <section className="card mb-8">
          <h2 className="text-base px-5 pt-5 pb-2">Waiting for a call back</h2>
          <ul>
            {callBacks.map((c) => (
              <li key={c.id} className="px-5 py-3 flex items-center justify-between gap-4 border-t border-black/5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{(c.extracted?.caller_name as string) || formatPhone(c.from_number) || "Unknown caller"}</div>
                  <div className="text-muted truncate">{c.summary ?? (c.extracted?.service_requested as string) ?? ""}</div>
                </div>
                <Link href={`/dashboard/calls/${c.id}`} className="btn btn-ghost btn-sm">Listen</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <h2 className="text-base">Recent calls</h2>
            <Link href="/dashboard/calls" className="text-sm text-muted hover:text-fg">All calls →</Link>
          </div>
          {recentCalls.length ? (
            <ul>
              {recentCalls.map((c) => (
                <li key={c.id} className="border-t border-black/5">
                  <Link href={`/dashboard/calls/${c.id}`} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-surface-2">
                    <div className="min-w-0 text-sm">
                      <div className="font-medium truncate">{(c.extracted?.caller_name as string) || formatPhone(c.from_number) || "Browser test call"}</div>
                      <div className="text-muted text-[13px]">{fmtDateTime(c.started_at, b.timezone)} · {fmtDuration(c.duration_seconds)}</div>
                    </div>
                    <CallOutcome call={c} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No calls yet">Once your agent is on, every call shows up here with its recording and transcript.</Empty>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <h2 className="text-base">Coming up</h2>
            <Link href="/dashboard/appointments" className="text-sm text-muted hover:text-fg">All appointments →</Link>
          </div>
          {upcoming.length ? (
            <ul>
              {upcoming.map((a) => (
                <li key={a.id} className="px-5 py-3 border-t border-black/5 flex gap-4 text-sm">
                  <div className="w-24 shrink-0">
                    <div className="font-semibold">{fmtDay(a.starts_at, b.timezone)}</div>
                    <div className="text-muted tabular">{fmtTime(a.starts_at, b.timezone)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.customer_name}</div>
                    <div className="text-muted truncate">{a.service_name}{a.address ? ` · ${a.address}` : ""}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Nothing booked yet" />
          )}
        </section>
      </div>
    </>
  );
}
