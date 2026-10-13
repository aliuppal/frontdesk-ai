import type { ReactNode } from "react";
import type { Call } from "@/lib/types";

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[28px] leading-tight">{title}</h1>
        {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="card p-5">
      <div className="text-[13px] text-muted font-medium">{label}</div>
      <div className="display text-[32px] leading-none mt-3 tabular">{value}</div>
      {note && <div className="text-xs text-muted mt-2">{note}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <h3 className="text-base">{title}</h3>
      {children && <div className="text-sm text-muted mt-2 max-w-md mx-auto">{children}</div>}
    </div>
  );
}

/** One word for what happened on a call, as an owner would describe it. */
export function CallOutcome({ call }: { call: Pick<Call, "status" | "appointment_booked" | "extracted"> }) {
  if (call.status === "in_progress") return <span className="badge badge-warn">● Live now</span>;
  if (call.appointment_booked) return <span className="badge badge-ok">Booked</span>;
  if (call.extracted?.follow_up_needed) return <span className="badge badge-bad">Call back</span>;
  const reason = call.extracted?.call_reason as string | undefined;
  if (reason === "spam_or_wrong_number") return <span className="badge">Spam</span>;
  if (reason === "question") return <span className="badge">Question</span>;
  return <span className="badge">No booking</span>;
}

export function Notice({ tone = "ok", children }: { tone?: "ok" | "bad" | "warn"; children: ReactNode }) {
  const cls = tone === "ok" ? "badge-ok" : tone === "bad" ? "badge-bad" : "badge-warn";
  return (
    <div role="status" className={`${cls} rounded-lg px-4 py-3 text-sm font-medium mb-6`}>
      {children}
    </div>
  );
}
