import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireBusiness } from "@/lib/business";
import { formatPhone } from "@/lib/booking/phone";
import { fmtDateTime } from "@/lib/format";
import { sql } from "@/lib/db";
import type { Customer } from "@/lib/types";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: PageProps<"/dashboard/customers">) {
  const { q = "" } = (await searchParams) as Record<string, string | undefined>;
  const { business: b } = await requireBusiness();
  const term = q.trim();
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const digits = term.replace(/\D/g, "");
  const phoneLike = digits.length >= 3 ? `%${digits}%` : null;

  const customers = await sql<Customer & { calls: number; bookings: number; last_call: string | null }>`
    select c.*,
      (select count(*) from calls k where k.customer_id = c.id) as calls,
      (select count(*) from appointments a where a.customer_id = c.id and a.status = 'booked') as bookings,
      (select max(k.started_at) from calls k where k.customer_id = c.id) as last_call
    from customers c
    where c.business_id = ${b.id}
      and (${term} = '' or c.name ilike ${like} or c.email ilike ${like} or (${phoneLike}::text is not null and c.phone like ${phoneLike}))
    order by c.updated_at desc
    limit 300`;
  const callCount = new Map(customers.map((c) => [c.id, c.calls]));
  const apptCount = new Map(customers.map((c) => [c.id, c.bookings]));
  const lastCall = new Map(customers.filter((c) => c.last_call).map((c) => [c.id, c.last_call!]));

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
