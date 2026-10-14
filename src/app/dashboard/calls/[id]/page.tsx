import Link from "next/link";
import { notFound } from "next/navigation";
import { CallPlayer, type Turn } from "@/components/CallPlayer";
import { CallOutcome } from "@/components/ui";
import { requireBusiness } from "@/lib/business";
import { formatPhone } from "@/lib/booking/phone";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { one, sql } from "@/lib/db";
import type { Appointment, Call } from "@/lib/types";

export const metadata = { title: "Call" };

const FIELDS: [string, string][] = [
  ["caller_name", "Name"],
  ["caller_email", "Email"],
  ["service_requested", "Needed"],
  ["service_address", "Address"],
  ["call_reason", "Reason"],
];

export default async function CallDetail({ params }: PageProps<"/dashboard/calls/[id]">) {
  const { id } = await params;
  const { business: b } = await requireBusiness();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const call = await one<Call>(sql`select * from calls where id = ${id} and business_id = ${b.id}`);
  if (!call) notFound();
  const appointments = await sql<Appointment>`
    select * from appointments where conversation_id = ${call.conversation_id} and business_id = ${b.id} order by starts_at`;

  const turns: Turn[] = (call.transcript_json ?? []).map((t) => ({ role: t.role, content: t.content, start: t.words?.[0]?.start ?? null }));
  const name = (call.extracted?.caller_name as string) || formatPhone(call.from_number) || "Browser test call";

  return (
    <>
      <Link href="/dashboard/calls" className="text-sm text-muted hover:text-fg">← All calls</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mt-3 mb-6">
        <div>
          <h1 className="text-[28px] leading-tight">{name}</h1>
          <p className="text-sm text-muted mt-1 tabular">
            {formatPhone(call.from_number) || "Web call"} · {fmtDateTime(call.started_at, b.timezone)} · {fmtDuration(call.duration_seconds)}
          </p>
        </div>
        <CallOutcome call={call} />
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <CallPlayer src={call.recording_path ? `/api/recordings/${call.id}` : null} turns={turns} agentName="Agent" />

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="text-base mb-2">Summary</h2>
            <p className="text-sm leading-relaxed text-muted">
              {call.summary ?? (call.status === "in_progress" ? "The call is still going." : "Summary is being written. Refresh in a minute.")}
            </p>
          </section>

          <section className="card p-5">
            <h2 className="text-base mb-3">What the agent collected</h2>
            <dl className="grid grid-cols-[96px_1fr] gap-y-2.5 text-sm">
              {FIELDS.map(([key, label]) =>
                call.extracted?.[key] ? (
                  <div key={key} className="contents">
                    <dt className="text-muted">{label}</dt>
                    <dd className="break-words">{String(call.extracted[key]).replaceAll("_", " ")}</dd>
                  </div>
                ) : null,
              )}
              {call.sentiment && (
                <>
                  <dt className="text-muted">Mood</dt>
                  <dd>{call.sentiment}</dd>
                </>
              )}
              {call.extracted?.follow_up_needed ? (
                <>
                  <dt className="text-muted">Follow up</dt>
                  <dd>
                    <span className="badge badge-bad">Call them back</span>
                  </dd>
                </>
              ) : null}
            </dl>
            {!Object.keys(call.extracted ?? {}).length && <p className="text-sm text-muted">Details appear after the call is analysed.</p>}
          </section>

          {appointments.map((a) => (
            <section key={a.id} className="card p-5">
              <h2 className="text-base mb-3">Appointment</h2>
              <dl className="grid grid-cols-[96px_1fr] gap-y-2.5 text-sm">
                <dt className="text-muted">Service</dt>
                <dd>{a.service_name}</dd>
                <dt className="text-muted">When</dt>
                <dd>{fmtDateTime(a.starts_at, b.timezone)}</dd>
                <dt className="text-muted">Status</dt>
                <dd className="capitalize">{a.status.replace("_", " ")}</dd>
                {a.notes && (
                  <>
                    <dt className="text-muted">Notes</dt>
                    <dd>{a.notes}</dd>
                  </>
                )}
              </dl>
              {a.calendar_sync_error && <p className="text-xs text-[var(--bad)] mt-3">Not added to Google Calendar: {a.calendar_sync_error}</p>}
            </section>
          ))}

          {call.cost_cents != null && (
            <p className="text-xs text-muted px-1 tabular">
              Call cost ${(Number(call.cost_cents) / 100).toFixed(2)}
              {call.disconnection_reason ? ` · ended by ${call.disconnection_reason.replaceAll("_", " ")}` : ""}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
