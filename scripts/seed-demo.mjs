// Creates (or resets) the admin test login and a sample business with example calls and bookings.
// Usage: npm run seed:demo   (optional: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD)
// Safe to re-run: the password is reset; sample data is only added the first time.
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "@neondatabase/serverless";

const scryptAsync = promisify(scrypt);
const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@frontdesk.test").toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");

// Same format as src/lib/auth.ts hashPassword()
async function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
const at = (hours) => new Date(Date.now() + hours * 3_600_000);
/** A weekday at hh:00 Central time, `days` from today (skips weekends). */
function slot(days, hour) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour + 5, 0, 0, 0); // CDT = UTC-5
  return d;
}

try {
  await db.query("begin");
  const hash = await hashPassword(password);
  const { rows: [user] } = await db.query(
    `insert into users (email, password_hash) values ($1, $2)
     on conflict (email) do update set password_hash = excluded.password_hash returning id`,
    [email, hash],
  );
  await db.query("delete from sessions where user_id = $1", [user.id]);

  const { rows: existing } = await db.query("select business_id from business_members where user_id = $1", [user.id]);
  if (existing.length) {
    console.log("Admin user already had a business; password reset, sample data left as is.");
  } else {
    const { rows: [b] } = await db.query(
      `insert into businesses (name, industry, timezone, notification_email, business_phone, address, area_code, requires_address, buffer_minutes,
                               agent_instructions)
       values ('Demo Plumbing Co.', 'plumbing', 'America/Chicago', $1, '+15125550100', '2100 S Lamar Blvd, Austin, TX', 512, true, 30,
               'Free estimates for jobs over $500. We do not service commercial buildings.') returning id`,
      [email],
    );
    await db.query("insert into business_members (business_id, user_id, role) values ($1, $2, 'owner')", [b.id, user.id]);
    await db.query(
      `insert into business_hours (business_id, weekday, open_time, close_time)
       select $1::uuid, d, '08:00'::time, '17:00'::time from generate_series(1, 5) d union all select $1::uuid, 6, '09:00'::time, '13:00'::time`,
      [b.id],
    );
    const { rows: services } = await db.query(
      `insert into services (business_id, name, duration_minutes, price_note) values
         ($1, 'Drain cleaning', 90, 'from $149'), ($1, 'Leak repair', 60, 'from $120'),
         ($1, 'Water heater install', 180, 'quote on site'), ($1, 'Free estimate', 30, 'free')
       returning id, name`,
      [b.id],
    );
    const svc = Object.fromEntries(services.map((r) => [r.name, r.id]));
    const { rows: staff } = await db.query(
      `insert into staff (business_id, name, calendar_id, is_default) values ($1, 'Demo Plumbing Co.', 'primary', true), ($1, 'Carlos', 'primary', false)
       returning id, name`,
      [b.id],
    );
    const main = staff.find((r) => r.name !== "Carlos").id;
    const carlos = staff.find((r) => r.name === "Carlos").id;

    const customers = [
      ["Maria Lopez", "+15125550148", "maria.lopez@example.com", "418 Oak St, Austin, TX"],
      ["James Carter", "+15125550172", null, "77 Riverside Dr, Austin, TX"],
      ["Priya Shah", "+15125550193", "priya@example.com", null],
    ];
    const cust = {};
    for (const [name, phone, mail, address] of customers) {
      const { rows: [c] } = await db.query(
        "insert into customers (business_id, name, phone, email, address) values ($1, $2, $3, $4, $5) returning id",
        [b.id, name, phone, mail, address],
      );
      cust[name] = c.id;
    }

    const turns = (lines) =>
      JSON.stringify(lines.map(([role, content, start]) => ({ role, content, words: [{ word: content.split(" ")[0], start, end: start + 0.4 }] })));
    const calls = [
      {
        id: "demo_call_1", from: "+15125550148", hoursAgo: 20, dur: 118, booked: true, cust: "Maria Lopez", sentiment: "Positive",
        summary: "Maria reported a backed-up kitchen sink and booked a drain cleaning.",
        extracted: { caller_name: "Maria Lopez", caller_email: "maria.lopez@example.com", service_requested: "Kitchen drain cleaning", service_address: "418 Oak St, Austin, TX", appointment_booked: true, follow_up_needed: false, call_reason: "new_booking" },
        lines: [["agent", "Thanks for calling Demo Plumbing Co.! How can I help?", 0.4], ["user", "Our kitchen sink is backing up. Can someone come tomorrow?", 4.1], ["agent", "Sorry about that. I have 9 AM or 1:30 PM tomorrow. Which works?", 9.3], ["user", "Nine, please.", 14.8], ["agent", "Great. What's the address for the visit?", 16.2], ["user", "418 Oak Street in Austin.", 19.5], ["agent", "You're booked for 9 AM. A confirmation email is on its way.", 24.0]],
      },
      {
        id: "demo_call_2", from: "+15125550172", hoursAgo: 6, dur: 95, booked: true, cust: "James Carter", sentiment: "Neutral",
        summary: "James has a slow leak under the bathroom sink and booked a leak repair with Carlos.",
        extracted: { caller_name: "James Carter", service_requested: "Leak repair under bathroom sink", service_address: "77 Riverside Dr, Austin, TX", appointment_booked: true, follow_up_needed: false, call_reason: "new_booking" },
        lines: [["agent", "Thanks for calling Demo Plumbing Co.! How can I help?", 0.4], ["user", "There's a leak under my bathroom sink. Is Carlos available this week?", 3.6], ["agent", "Carlos can come Thursday at 2 PM. Does that work?", 9.1], ["user", "Yes, that's fine.", 13.0]],
      },
      {
        id: "demo_call_3", from: "+15125550193", hoursAgo: 3, dur: 64, booked: false, cust: "Priya Shah", sentiment: "Negative",
        summary: "Priya's water heater stopped working. She wants a quote and asked for the owner to call back.",
        extracted: { caller_name: "Priya Shah", caller_email: "priya@example.com", service_requested: "Water heater replacement quote", appointment_booked: false, follow_up_needed: true, call_reason: "question" },
        lines: [["agent", "Thanks for calling Demo Plumbing Co.! How can I help?", 0.4], ["user", "My water heater died. How much is a replacement?", 3.2], ["agent", "That needs a quote on site. I'll have the team call you back today.", 8.5]],
      },
      {
        id: "demo_call_4", from: "+15125550111", hoursAgo: 1, dur: 22, booked: false, cust: null, sentiment: "Neutral",
        summary: "Caller asked about Saturday hours and hung up.",
        extracted: { service_requested: "Opening hours", appointment_booked: false, follow_up_needed: false, call_reason: "question" },
        lines: [["agent", "Thanks for calling Demo Plumbing Co.! How can I help?", 0.4], ["user", "Are you open Saturday?", 2.9], ["agent", "Yes, Saturday from 9 AM to 1 PM.", 5.0]],
      },
    ];
    for (const c of calls) {
      const start = at(-c.hoursAgo);
      await db.query(
        `insert into calls (business_id, conversation_id, status, from_number, to_number, started_at, ended_at, duration_seconds, transcript,
                            transcript_json, summary, sentiment, successful, appointment_booked, extracted, disconnection_reason, customer_id)
         values ($1, $2, 'ended', $3, '+15125550100', $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb, 'user_hangup', $14)`,
        [b.id, c.id, c.from, start, new Date(start.getTime() + c.dur * 1000), c.dur, c.lines.map(([r, t]) => `${r}: ${t}`).join("\n"),
         turns(c.lines), c.summary, c.sentiment, c.booked || c.extracted.call_reason === "question", c.booked, JSON.stringify(c.extracted),
         c.cust ? cust[c.cust] : null],
      );
    }

    const appts = [
      [cust["Maria Lopez"], svc["Drain cleaning"], main, "demo_call_1", "Drain cleaning", slot(1, 9), 90, "Maria Lopez", "+15125550148", "maria.lopez@example.com", "418 Oak St, Austin, TX", "Kitchen sink backing up"],
      [cust["James Carter"], svc["Leak repair"], carlos, "demo_call_2", "Leak repair", slot(2, 14), 60, "James Carter", "+15125550172", null, "77 Riverside Dr, Austin, TX", "Slow leak under bathroom sink"],
      [cust["Priya Shah"], svc["Free estimate"], main, null, "Free estimate", slot(-7, 10), 30, "Priya Shah", "+15125550193", "priya@example.com", null, "Earlier visit"],
    ];
    for (const [customer, service, staffId, callId, name, start, mins, cname, phone, mail, address, notes] of appts) {
      await db.query(
        `insert into appointments (business_id, customer_id, service_id, staff_id, conversation_id, service_name, starts_at, ends_at,
                                   customer_name, customer_phone, customer_email, address, notes, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [b.id, customer, service, staffId, callId, name, start, new Date(start.getTime() + mins * 60_000), cname, phone, mail, address, notes,
         start < new Date() ? "completed" : "booked"],
      );
    }
    console.log("Created business 'Demo Plumbing Co.' with sample calls, customers and appointments.");
  }
  await db.query("commit");
  console.log(`\nAdmin test login\n  email:    ${email}\n  password: ${password}\n`);
} catch (err) {
  await db.query("rollback");
  console.error(err);
  process.exitCode = 1;
} finally {
  db.release();
  await pool.end();
}
