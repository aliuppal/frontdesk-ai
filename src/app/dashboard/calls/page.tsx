import Link from "next/link";
import { CallOutcome, Empty, PageHeader } from "@/components/ui";
import { requireBusiness } from "@/lib/business";
import { formatPhone } from "@/lib/booking/phone";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";
import type { Call } from "@/lib/types";

export const metadata = { title: "Calls" };

const PAGE = 50;
const FILTERS = [
  ["all", "All"],
  ["booked", "Booked"],
  ["callback", "Call back"],
  ["none", "No booking"],
] as const;

export default async function Calls({ searchParams }: PageProps<"/dashboard/calls">) {
  const sp = (await searchParams) as Record<string, string | undefined>;
  const q = sp.q?.trim() ?? "";
  const filter = sp.filter ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { business: b } = await requireBusiness();
  const db = await supabaseServer();

  let query = db
    .from("calls")
    .select("*", { count: "exact" })
    .eq("business_id", b.id)
    .order("started_at", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (filter === "booked") query = query.eq("appointment_booked", true);
  if (filter === "none") query = query.eq("appointment_booked", false);
  if (filter === "callback") query = query.eq("appointment_booked", false).eq("extracted->>follow_up_needed", "true");
  if (q) {
    const digits = q.replace(/\D/g, "");
    const safe = q.replace(/[%,()*]/g, " ");
    const ors = [`summary.ilike.%${safe}%`, `transcript.ilike.%${safe}%`, `extracted->>caller_name.ilike.%${safe}%`];
    if (digits.length >= 3) ors.push(`from_number.ilike.%${digits}%`);
    query = query.or(ors.join(","));
  }
  const { data, count } = await query;
  const calls = (data ?? []) as Call[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  const href = (next: { filter?: string; page?: number }) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    const f = next.filter ?? filter;
    if (f !== "all") s.set("filter", f);
    if (next.page && next.page > 1) s.set("page", String(next.page));
    return `/dashboard/calls${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Calls" sub={`${count ?? 0} call${count === 1 ? "" : "s"} answered by your agent`} />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <form className="flex-1 min-w-[220px] max-w-md" role="search">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <label htmlFor="q" className="sr-only">Search calls</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Search by name, number or anything said…" />
        </form>
        <div className="flex gap-1" role="group" aria-label="Filter calls">
          {FILTERS.map(([key, label]) => (
            <Link key={key} href={href({ filter: key })} aria-current={filter === key ? "true" : undefined} className={`btn btn-sm ${filter === key ? "btn-primary" : "btn-ghost"}`}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        {calls.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Caller</th>
                <th>When</th>
                <th>Length</th>
                <th>What they wanted</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/dashboard/calls/${c.id}`} className="font-medium hover:underline">
                      {(c.extracted?.caller_name as string) || formatPhone(c.from_number) || "Browser test call"}
                    </Link>
                    {c.extracted?.caller_name ? <div className="text-[13px] text-muted tabular">{formatPhone(c.from_number)}</div> : null}
                  </td>
                  <td className="whitespace-nowrap tabular">{fmtDateTime(c.started_at, b.timezone)}</td>
                  <td className="tabular">{fmtDuration(c.duration_seconds)}</td>
                  <td className="text-muted max-w-[360px]">
                    <span className="line-clamp-2">{(c.extracted?.service_requested as string) || c.summary || "—"}</span>
                  </td>
                  <td>
                    <CallOutcome call={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title={q || filter !== "all" ? "No calls match" : "No calls yet"}>
            {q || filter !== "all" ? <Link className="link" href="/dashboard/calls">Clear filters</Link> : "Calls appear here as soon as your agent answers them."}
          </Empty>
        )}
      </div>

      {pages > 1 && (
        <nav className="flex items-center justify-between mt-5 text-sm" aria-label="Pages">
          {page > 1 ? <Link className="btn btn-ghost btn-sm" href={href({ page: page - 1 })}>← Newer</Link> : <span />}
          <span className="text-muted tabular">Page {page} of {pages}</span>
          {page < pages ? <Link className="btn btn-ghost btn-sm" href={href({ page: page + 1 })}>Older →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
