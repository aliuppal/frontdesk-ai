import { redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { US_TIMEZONES } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";
import { INDUSTRIES } from "@/lib/voice/prompt";
import { createBusiness } from "./actions";

export const metadata = { title: "Set up your business" };

const LABELS: Record<string, string> = {
  salon: "Hair salon",
  spa: "Spa / massage",
  barber: "Barbershop",
  plumbing: "Plumbing",
  hvac: "Heating & air",
  electrical: "Electrical",
  cleaning: "Cleaning",
  auto: "Auto repair",
  landscaping: "Landscaping",
  consulting: "Consulting / professional",
  other: "Something else",
};

export default async function Onboarding({ searchParams }: PageProps<"/onboarding">) {
  const { error } = (await searchParams) as Record<string, string | undefined>;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await db.from("business_members").select("business_id").eq("user_id", user.id).maybeSingle();
  if (member) redirect("/dashboard");

  return (
    <main className="flex-1 bg-surface-2 px-4 py-14">
      <div className="max-w-xl mx-auto">
        <p className="text-sm text-muted">Step 1 of 2 · then connect your calendar and switch the agent on</p>
        <h1 className="text-[32px] mt-2 mb-8">Tell us about your business</h1>
        {error && <Notice tone="bad">{error}</Notice>}
        <form action={createBusiness} className="card p-7 space-y-5">
          <div>
            <label className="label" htmlFor="name">Business name</label>
            <input className="input" id="name" name="name" required placeholder="e.g. Riverside Plumbing" />
            <p className="hint">The agent says this when it answers.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="industry">Type of business</label>
              <select className="select" id="industry" name="industry" defaultValue="salon">
                {Object.keys(INDUSTRIES).map((k) => (
                  <option key={k} value={k}>{LABELS[k] ?? k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="timezone">Time zone</label>
              <select className="select" id="timezone" name="timezone" defaultValue="America/New_York">
                {US_TIMEZONES.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid sm:grid-cols-[1fr_140px] gap-4">
            <div>
              <label className="label" htmlFor="notification_email">Send booking alerts to</label>
              <input className="input" id="notification_email" name="notification_email" type="email" required defaultValue={user.email ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="area_code">Area code</label>
              <input className="input tabular" id="area_code" name="area_code" inputMode="numeric" maxLength={3} placeholder="512" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="services">Services and how long they take</label>
            <textarea
              className="textarea font-mono text-[13px]"
              id="services"
              name="services"
              required
              rows={5}
              placeholder={"Haircut, 45\nColor, 120\nBlow-dry, 30"}
            />
            <p className="hint">One per line: name, then minutes. You can add prices and details later.</p>
          </div>
          <button className="btn btn-primary w-full h-11">Create my front desk</button>
          <p className="hint text-center">Hours start as Monday–Friday, 9 AM–5 PM. You can change them next.</p>
        </form>
      </div>
    </main>
  );
}
