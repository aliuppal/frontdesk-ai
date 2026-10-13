import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireBusiness } from "@/lib/business";
import { formatPhone } from "@/lib/booking/phone";
import { fmtDateTime } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: PageProps<"/dashboard/customers">) {
  const { q = "" } = (await searchParams) as Record<string, string | undefined>;
  const { business: b } = await requireBusiness();
  const db = await supabaseServer();

  let query = db.from("customers").select("*").eq("business_id", b.id).order("updated_at", { ascending: false }).limit(300);
  if (q.trim()) {
    const safe = q.replace(/[%,()*]/g, " ").trim();
    const digits = q.replace(/\D/g, "");
    query = query.or([`name.ilike.%${safe}%`, `email.ilike.%${safe}%`, ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : [])].join(","));
  }
  const [{ data }, calls, appts] = await Promise.all([
    query,
    db.from("calls").select("customer_id, started_at").eq("business_id", b.id).not("customer_id", "is", null),
    db.from("appointments").select("customer_id").eq("business_id", b.id).eq("status", "booked").not("customer_id", "is", null),
  ]);
  const customers = (data ?? []) as Customer[];

  const callCount = new Map<string, number>();
  const lastCall = new Map<string, string>();
  for (const c of calls.data ?? []) {
    callCount.set(c.customer_id, (callCount.get(c.customer_id) ?? 0) + 1);
    if (c.started_at && (!lastCall.has(c.customer_id) || c.started_at > lastCall.get(c.customer_id)!)) lastCall.set(c.customer_id, c.started_at);
  }
  const apptCount = new Map<string, number>();
  for (const a of appts.data ?? []) apptCount.set(a.customer_id, (apptCount.get(a.customer_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Customers" sub="Everyone who has booked through your agent." />
      <form role="search" className="max-w-md mb-5">
        <label htmlFor="q" className="sr-only">Search customers</label>
        <input id="q" name="q" defaultValue={q} className="input" placeholder="Search by name, phone or email…" />
      </form>
      <div className="card overflow-x-auto">
        {customers.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Bookings</th>
                <th>Last call</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name ?? "—"}</td>
                  <td className="tabular whitespace-nowrap">
                    <a href={`tel:${c.phone}`} className="hover:underline">{formatPhone(c.phone)}</a>
                  </td>
                  <td>{c.email ? <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : "—"}</td>
                  <td className="text-muted max-w-[240px]">{c.address ?? "—"}</td>
                  <td className="text-right tabular">{callCount.get(c.id) ?? 0}</td>
                  <td className="text-right tabular">{apptCount.get(c.id) ?? 0}</td>
                  <td className="tabular whitespace-nowrap">
                    {lastCall.get(c.id) ? (
                      <Link className="hover:underline" href={`/dashboard/calls?q=${encodeURIComponent(c.phone.slice(-10))}`}>
                        {fmtDateTime(lastCall.get(c.id), b.timezone)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title={q ? "No customers match" : "No customers yet"}>{!q && "A customer is saved the first time they book on a call."}</Empty>
        )}
      </div>
    </>
  );
}
