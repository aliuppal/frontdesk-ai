import { DateTime } from "luxon";
import { Notice, PageHeader } from "@/components/ui";
import { TestCallButton } from "@/components/TestCallButton";
import { loadBusinessConfig, requireBusiness } from "@/lib/business";
import { formatPhone } from "@/lib/booking/phone";
import { calendarFor, listCalendars } from "@/lib/calendar/google";
import { US_TIMEZONES } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase/server";
import { INDUSTRIES } from "@/lib/voice/prompt";
import { activateAgent, deleteService, disconnectCalendar, removeStaff, saveHours, saveProfile, saveService, saveStaff } from "./actions";

export const metadata = { title: "Settings" };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card p-6 scroll-mt-6">
      <h2 className="text-lg">{title}</h2>
      {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function Settings({ searchParams }: PageProps<"/dashboard/settings">) {
  const sp = (await searchParams) as Record<string, string | undefined>;
  const { business } = await requireBusiness();
  const admin = supabaseAdmin();
  const config = await loadBusinessConfig(admin, business.id);
  const b = config.business;
  const { data: connection } = await admin.from("calendar_connections").select("google_email, connected_at").eq("business_id", b.id).maybeSingle();

  let calendars: { id: string; name: string }[] = [];
  let calendarProblem = false;
  if (connection) {
    try {
      const cal = await calendarFor(admin, b.id);
      if (cal) calendars = await listCalendars(cal);
    } catch {
      calendarProblem = true;
    }
  }

  const hoursByDay = new Map(config.hours.map((h) => [h.weekday, h]));
  const activeServices = config.services.filter((s) => s.active);
  const servicesByStaff = new Map<string, Set<string>>();
  for (const r of config.staffServices) servicesByStaff.set(r.staff_id, (servicesByStaff.get(r.staff_id) ?? new Set()).add(r.service_id));
  const calendarOptions = (current: string) => {
    const list = calendars.length ? calendars : [{ id: "primary", name: "Primary calendar" }];
    return list.some((c) => c.id === current) ? list : [{ id: current, name: current }, ...list];
  };

  return (
    <>
      <PageHeader title="Settings" sub="Everything your phone agent knows and does. Changes go live on the next call." />

      {sp.welcome && <Notice>You&apos;re in. Connect your calendar, check your hours, then switch the agent on.</Notice>}
      {sp.saved && <Notice>Saved{b.retell_agent_id && sp.saved !== "calendar" ? " and sent to your agent" : ""}.</Notice>}
      {sp.error && <Notice tone="bad">{sp.error}</Notice>}
      {sp.calendar === "connected" && <Notice>Google Calendar connected. The agent will only offer times you&apos;re free.</Notice>}
      {sp.calendar === "error" && <Notice tone="bad">Google Calendar didn&apos;t connect. Please try again.</Notice>}

      <div className="space-y-6">
        <Section id="agent" title="Phone agent">
          {b.phone_number ? (
            <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
              <div>
                <span className="badge badge-ok">Answering 24/7</span>
                <div className="display text-[40px] leading-none mt-3 tabular">{formatPhone(b.phone_number)}</div>
                <p className="text-sm text-muted mt-2">Last updated {b.agent_synced_at ? DateTime.fromISO(b.agent_synced_at).toRelative() : "never"}.</p>
                <details className="mt-5 text-sm">
                  <summary className="cursor-pointer font-semibold">Send calls from your existing number</summary>
                  <div className="well p-4 mt-3 space-y-2 text-muted leading-relaxed">
                    <p>Keep your current number and forward calls to {formatPhone(b.phone_number)}:</p>
                    <p>
                      <strong className="text-fg">All calls:</strong> on most US mobile carriers dial <code className="tabular">*72</code> then the number above. Dial{" "}
                      <code>*73</code> to turn it off.
                    </p>
                    <p>
                      <strong className="text-fg">Only calls you miss:</strong> conditional forwarding codes differ by carrier (for example <code>*71</code> on Verizon,{" "}
                      <code>**61*number#</code> on AT&amp;T and T-Mobile). Office phone systems usually have a “forward on no answer” setting.
                    </p>
                  </div>
                </details>
              </div>
              <div className="flex flex-col gap-3 items-start md:items-end">
                <TestCallButton />
                <form action={activateAgent}>
                  <button className="btn btn-ghost btn-sm">Update agent now</button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-muted max-w-lg">
                Switching on buys a local {b.area_code ? `(${b.area_code}) ` : ""}number and sets up your agent from the settings below.
                {!connection && " Connect Google Calendar first so it can see when you're busy."}
              </p>
              <form action={activateAgent}>
                <button className="btn btn-primary" disabled={!activeServices.length || !config.hours.length}>
                  Switch on my phone agent
                </button>
              </form>
            </div>
          )}
        </Section>

        <Section id="calendar" title="Google Calendar" sub="The agent checks this before offering a time and adds every booking to it.">
          {connection ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm">
                <span className="badge badge-ok mr-2">Connected</span>
                {connection.google_email}
                {calendarProblem && <p className="text-[var(--bad)] mt-2">We can&apos;t reach this calendar any more. Reconnect it.</p>}
              </div>
              <div className="flex gap-2">
                <a href="/api/google/connect" className="btn btn-ghost btn-sm">Reconnect</a>
                <form action={disconnectCalendar}>
                  <button className="btn btn-danger btn-sm">Disconnect</button>
                </form>
              </div>
            </div>
          ) : (
            <a href="/api/google/connect" className="btn btn-primary">Connect Google Calendar</a>
          )}
        </Section>

        <Section id="profile" title="Business and how the agent talks">
          <form action={saveProfile} className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="label" htmlFor="name">Business name</label>
              <input className="input" id="name" name="name" defaultValue={b.name} required />
            </div>
            <div>
              <label className="label" htmlFor="industry">Type of business</label>
              <select className="select" id="industry" name="industry" defaultValue={b.industry}>
                {Object.entries(INDUSTRIES).map(([k, v]) => (
                  <option key={k} value={k}>{v[0].toUpperCase() + v.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="timezone">Time zone</label>
              <select className="select" id="timezone" name="timezone" defaultValue={b.timezone}>
                {US_TIMEZONES.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="notification_email">Booking alerts go to</label>
              <input className="input" id="notification_email" name="notification_email" type="email" defaultValue={b.notification_email} required />
            </div>
            <div>
              <label className="label" htmlFor="business_phone">Your main business phone</label>
              <input className="input tabular" id="business_phone" name="business_phone" defaultValue={formatPhone(b.business_phone)} />
              <p className="hint">Shown to customers in confirmation emails.</p>
            </div>
            <div>
              <label className="label" htmlFor="transfer_number">Transfer urgent calls to</label>
              <input className="input tabular" id="transfer_number" name="transfer_number" defaultValue={formatPhone(b.transfer_number)} placeholder="Leave empty to take messages instead" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="address">Business address</label>
              <input className="input" id="address" name="address" defaultValue={b.address ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="greeting">First thing the agent says</label>
              <input className="input" id="greeting" name="greeting" defaultValue={b.greeting ?? ""} placeholder={`Thanks for calling ${b.name}! This is the virtual assistant. How can I help you today?`} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="agent_instructions">Anything else it should know</label>
              <textarea
                className="textarea"
                id="agent_instructions"
                name="agent_instructions"
                defaultValue={b.agent_instructions ?? ""}
                placeholder={"We don't do same-day color appointments.\nParking is behind the building.\nFree estimates for jobs over $500."}
              />
              <p className="hint">Policies, parking, prices you&apos;re happy to quote, things to never promise.</p>
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="requires_address" defaultChecked={b.requires_address} />
              Ask for the service address (for jobs at the customer&apos;s place)
            </label>
            <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4 well p-4">
              <div>
                <label className="label" htmlFor="slot_interval_minutes">Start times every</label>
                <select className="select" id="slot_interval_minutes" name="slot_interval_minutes" defaultValue={b.slot_interval_minutes}>
                  {[10, 15, 20, 30, 60].map((n) => (
                    <option key={n} value={n}>{n} min</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="buffer_minutes">Gap between jobs</label>
                <input className="input tabular" id="buffer_minutes" name="buffer_minutes" type="number" min={0} max={240} defaultValue={b.buffer_minutes} />
                <p className="hint">minutes</p>
              </div>
              <div>
                <label className="label" htmlFor="min_notice_minutes">Earliest booking</label>
                <input className="input tabular" id="min_notice_minutes" name="min_notice_minutes" type="number" min={0} defaultValue={b.min_notice_minutes} />
                <p className="hint">minutes from now</p>
              </div>
              <div>
                <label className="label" htmlFor="max_days_ahead">Book up to</label>
                <input className="input tabular" id="max_days_ahead" name="max_days_ahead" type="number" min={1} max={365} defaultValue={b.max_days_ahead} />
                <p className="hint">days ahead</p>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="voice_id">Voice</label>
              <input className="input" id="voice_id" name="voice_id" defaultValue={b.voice_id} />
              <p className="hint">A voice id from the Retell voice library.</p>
            </div>
            <div className="sm:col-span-2">
              <button className="btn btn-primary">Save</button>
            </div>
          </form>
        </Section>

        <Section id="hours" title="Opening hours" sub="The agent only books inside these hours. It still answers the phone around the clock.">
          <form action={saveHours} className="space-y-2">
            {DAYS.map((day, i) => {
              const d = i + 1;
              const h = hoursByDay.get(d);
              return (
                <div key={day} className="grid grid-cols-[130px_1fr_1fr] sm:grid-cols-[150px_150px_150px] items-center gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" name={`open_${d}_on`} defaultChecked={!!h} /> {day}
                  </label>
                  <input className="input tabular" type="time" name={`open_${d}`} aria-label={`${day} opens`} defaultValue={h?.open_time.slice(0, 5) ?? "09:00"} />
                  <input className="input tabular" type="time" name={`close_${d}`} aria-label={`${day} closes`} defaultValue={h?.close_time.slice(0, 5) ?? "17:00"} />
                </div>
              );
            })}
            <button className="btn btn-primary mt-3">Save hours</button>
          </form>
        </Section>

        <Section id="services" title="Services" sub="What callers can book, and how long each one blocks on your calendar.">
          <div className="space-y-3">
            {config.services.map((s) => (
              <form key={s.id} action={saveService} className={`well p-4 grid sm:grid-cols-[1fr_110px_1fr] gap-3 items-end ${s.active ? "" : "opacity-60"}`}>
                <input type="hidden" name="id" value={s.id} />
                <div>
                  <label className="label" htmlFor={`sn-${s.id}`}>Name</label>
                  <input className="input" id={`sn-${s.id}`} name="name" defaultValue={s.name} required />
                </div>
                <div>
                  <label className="label" htmlFor={`sd-${s.id}`}>Minutes</label>
                  <input className="input tabular" id={`sd-${s.id}`} name="duration_minutes" type="number" min={5} max={600} defaultValue={s.duration_minutes} />
                </div>
                <div>
                  <label className="label" htmlFor={`sp-${s.id}`}>Price the agent can quote</label>
                  <input className="input" id={`sp-${s.id}`} name="price_note" defaultValue={s.price_note ?? ""} placeholder="e.g. from $45" />
                </div>
                <div className="sm:col-span-3">
                  <label className="label" htmlFor={`sx-${s.id}`}>Details</label>
                  <input className="input" id={`sx-${s.id}`} name="description" defaultValue={s.description ?? ""} placeholder="What's included, who it's for" />
                </div>
                <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm mr-auto">
                    <input type="checkbox" name="active" defaultChecked={s.active} /> Bookable
                  </label>
                  <button className="btn btn-primary btn-sm">Save</button>
                  <button formAction={deleteService} className="btn btn-danger btn-sm">Delete</button>
                </div>
              </form>
            ))}
            <form action={saveService} className="grid sm:grid-cols-[1fr_110px_auto] gap-3 items-end pt-2">
              <div>
                <label className="label" htmlFor="new-service">Add a service</label>
                <input className="input" id="new-service" name="name" placeholder="e.g. AC tune-up" required />
              </div>
              <div>
                <label className="label" htmlFor="new-duration">Minutes</label>
                <input className="input tabular" id="new-duration" name="duration_minutes" type="number" min={5} max={600} defaultValue={60} />
              </div>
              <button className="btn btn-ghost">Add</button>
            </form>
          </div>
        </Section>

        <Section id="staff" title="Team and calendars" sub="Add people if they keep their own calendar. Callers can ask for someone by name, or take whoever is free first.">
          {!connection && <p className="text-sm text-muted mb-4">Connect Google Calendar to pick which calendar each person uses.</p>}
          <div className="space-y-3">
            {config.staff.map((s) => (
              <form key={s.id} action={saveStaff} className={`well p-4 grid sm:grid-cols-2 gap-3 ${s.active ? "" : "opacity-60"}`}>
                <input type="hidden" name="id" value={s.id} />
                <div>
                  <label className="label" htmlFor={`tn-${s.id}`}>Name</label>
                  <input className="input" id={`tn-${s.id}`} name="name" defaultValue={s.name} required />
                </div>
                <div>
                  <label className="label" htmlFor={`tc-${s.id}`}>Calendar</label>
                  <select className="select" id={`tc-${s.id}`} name="calendar_id" defaultValue={s.calendar_id}>
                    {calendarOptions(s.calendar_id).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {activeServices.length > 1 && (
                  <fieldset className="sm:col-span-2">
                    <legend className="label">Does (leave all unticked for everything)</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {activeServices.map((svc) => (
                        <label key={svc.id} className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" name="service_ids" value={svc.id} defaultChecked={servicesByStaff.get(s.id)?.has(svc.id)} /> {svc.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm mr-auto">
                    <input type="checkbox" name="active" defaultChecked={s.active} /> Taking bookings
                    {s.is_default && <span className="badge ml-1">Main</span>}
                  </label>
                  <button className="btn btn-primary btn-sm">Save</button>
                  {!s.is_default && s.active && (
                    <button formAction={removeStaff} className="btn btn-danger btn-sm">Remove</button>
                  )}
                </div>
              </form>
            ))}
            <form action={saveStaff} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end pt-2">
              <div>
                <label className="label" htmlFor="new-staff">Add a team member</label>
                <input className="input" id="new-staff" name="name" placeholder="e.g. Maria" required />
              </div>
              <div>
                <label className="label" htmlFor="new-staff-cal">Their calendar</label>
                <select className="select" id="new-staff-cal" name="calendar_id" defaultValue="primary">
                  {calendarOptions("primary").map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-ghost">Add</button>
            </form>
          </div>
        </Section>
      </div>
    </>
  );
}
