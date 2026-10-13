import "server-only";
import { Resend } from "resend";
import { DateTime } from "luxon";
import { appUrl, env } from "./env";
import type { Appointment, Business } from "./types";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function when(a: Appointment, tz: string) {
  return DateTime.fromISO(a.starts_at).setZone(tz).toFormat("cccc, LLLL d, yyyy 'at' h:mm a ZZZZ");
}

function layout(title: string, rows: [string, string | null | undefined][], footerHtml: string) {
  const body = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#6b6b6b;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#242424">${esc(v)}</td></tr>`)
    .join("");
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#242424">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
<table style="border-collapse:collapse;font-size:15px">${body}</table>
<p style="font-size:13px;color:#6b6b6b;margin-top:24px">${footerHtml}</p></div>`;
}

async function send(to: string, subject: string, html: string, replyTo?: string) {
  const resend = new Resend(env().RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: env().EMAIL_FROM, to, subject, html, replyTo });
  if (error) throw new Error(`Email to ${to} failed: ${error.message}`);
}

/** Confirmation to the caller (if they gave an email) and a heads-up to the business. Never throws. */
export async function sendBookingEmails(business: Business, appt: Appointment): Promise<string[]> {
  const problems: string[] = [];
  const time = when(appt, business.timezone);
  const contactPhone = business.business_phone ?? business.phone_number;

  if (appt.customer_email) {
    try {
      await send(
        appt.customer_email,
        `You're booked: ${appt.service_name} with ${business.name}`,
        layout(
          `See you ${DateTime.fromISO(appt.starts_at).setZone(business.timezone).toFormat("cccc")}, ${appt.customer_name.split(" ")[0]}!`,
          [
            ["Service", appt.service_name],
            ["When", time],
            ["Where", appt.address ?? business.address],
            ["Business", business.name],
            ["Phone", contactPhone],
          ],
          `Need to change it? Reply to this email${contactPhone ? ` or call ${esc(contactPhone)}` : ""}.`,
        ),
        business.notification_email,
      );
    } catch (err) {
      problems.push((err as Error).message);
    }
  }

  try {
    await send(
      business.notification_email,
      `New booking: ${appt.customer_name} · ${appt.service_name} · ${DateTime.fromISO(appt.starts_at).setZone(business.timezone).toFormat("ccc LLL d, h:mm a")}`,
      layout(
        "New appointment booked by your phone agent",
        [
          ["Customer", appt.customer_name],
          ["Phone", appt.customer_phone],
          ["Email", appt.customer_email],
          ["Service", appt.service_name],
          ["When", time],
          ["Address", appt.address],
          ["Notes", appt.notes],
        ],
        `<a href="${appUrl()}/dashboard/appointments" style="color:#242424">Open in FrontDesk</a>`,
      ),
      appt.customer_email ?? undefined,
    );
  } catch (err) {
    problems.push((err as Error).message);
  }
  return problems;
}

export async function sendCancellationEmail(business: Business, appt: Appointment): Promise<void> {
  if (!appt.customer_email) return;
  const contactPhone = business.phone_number ?? business.business_phone;
  await send(
    appt.customer_email,
    `Cancelled: ${appt.service_name} with ${business.name}`,
    layout(
      "Your appointment was cancelled",
      [
        ["Service", appt.service_name],
        ["Was scheduled for", when(appt, business.timezone)],
      ],
      contactPhone ? `To book again, call ${esc(contactPhone)}.` : "Reply to this email to book again.",
    ),
    business.notification_email,
  );
}
