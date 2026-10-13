"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/dashboard", "Overview"],
  ["/dashboard/calls", "Calls"],
  ["/dashboard/appointments", "Appointments"],
  ["/dashboard/customers", "Customers"],
  ["/dashboard/settings", "Settings"],
] as const;

export function DashboardNav() {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex lg:flex-col gap-1 overflow-x-auto">
      {LINKS.map(([href, label]) => {
        const active = href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`px-3 h-9 flex items-center rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              active ? "bg-surface text-fg shadow-[var(--elev)]" : "text-muted hover:text-fg hover:bg-black/[0.04]"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
