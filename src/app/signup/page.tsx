import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Notice } from "@/components/ui";
import { signUp } from "../auth-actions";

export const metadata = { title: "Create your account" };

export default async function Signup({ searchParams }: PageProps<"/signup">) {
  const { error } = (await searchParams) as Record<string, string | undefined>;
  return (
    <AuthShell
      title="Get your AI front desk"
      footer={
        <>
          Already have an account? <Link className="link" href="/login">Log in</Link>
        </>
      }
    >
      {error && <Notice tone="bad">{error}</Notice>}
      <form action={signUp} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <p className="hint">At least 8 characters.</p>
        </div>
        <button className="btn btn-primary w-full">Create account</button>
      </form>
    </AuthShell>
  );
}
