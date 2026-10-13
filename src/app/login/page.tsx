import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Notice } from "@/components/ui";
import { signIn } from "../auth-actions";

export const metadata = { title: "Log in" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { error, check, next } = (await searchParams) as Record<string, string | undefined>;
  return (
    <AuthShell
      title="Welcome back"
      footer={
        <>
          New here? <Link className="link" href="/signup">Create an account</Link>
        </>
      }
    >
      {check && <Notice>Check your inbox to confirm your email, then log in.</Notice>}
      {error && <Notice tone="bad">{error === "confirm" ? "That confirmation link is invalid or expired." : error}</Notice>}
      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn btn-primary w-full">Log in</button>
      </form>
    </AuthShell>
  );
}
