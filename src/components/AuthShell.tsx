import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="flex-1 grid place-items-center px-4 py-16 bg-surface-2">
      <div className="w-full max-w-sm">
        <Link href="/" className="display text-lg block text-center mb-8">
          FrontDesk<span className="text-muted">.ai</span>
        </Link>
        <div className="card p-7">
          <h1 className="text-2xl mb-6">{title}</h1>
          {children}
        </div>
        <p className="text-sm text-muted text-center mt-6">{footer}</p>
      </div>
    </main>
  );
}
