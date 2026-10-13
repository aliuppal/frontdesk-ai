import Link from "next/link";
import { DashboardNav } from "@/components/DashboardNav";
import { requireBusiness } from "@/lib/business";
import { formatPhone } from "@/lib/booking/phone";
import { signOut } from "../auth-actions";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { business, email } = await requireBusiness();
  return (
    <div className="flex-1 flex flex-col lg:flex-row bg-surface-2">
      <aside className="lg:w-60 lg:min-h-screen px-4 py-5 lg:py-7 flex flex-col gap-6 lg:sticky lg:top-0 lg:h-screen">
        <Link href="/dashboard" className="display text-lg px-3">
          FrontDesk<span className="text-muted">.ai</span>
        </Link>
        <div className="px-3">
          <div className="text-sm font-semibold truncate">{business.name}</div>
          {business.phone_number ? (
            <div className="text-[13px] text-muted tabular flex items-center gap-1.5 mt-0.5">
              <span className="size-1.5 rounded-full bg-[var(--ok)]" aria-hidden /> {formatPhone(business.phone_number)}
            </div>
          ) : (
            <Link href="/dashboard/settings#agent" className="text-[13px] text-[var(--warn)] mt-0.5 block">Agent not live yet</Link>
          )}
        </div>
        <DashboardNav />
        <form action={signOut} className="mt-auto px-3 hidden lg:block">
          <div className="text-xs text-muted truncate mb-2">{email}</div>
          <button className="text-sm text-muted hover:text-fg">Sign out</button>
        </form>
      </aside>
      <main className="flex-1 min-w-0 px-4 sm:px-8 py-7 lg:py-10 bg-bg lg:rounded-tl-2xl lg:shadow-[var(--ring)]">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
