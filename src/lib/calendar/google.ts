import "server-only";
import { google, type calendar_v3 } from "googleapis";
import { appUrl, need } from "../env";
import { decrypt, encrypt } from "../crypto";
import { one, sql } from "../db";
import type { Busy } from "../booking/availability";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

function oauthClient() {
  return new google.auth.OAuth2(need("GOOGLE_CLIENT_ID"), need("GOOGLE_CLIENT_SECRET"), `${appUrl()}/api/google/callback`);
}

export function googleAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES, state, include_granted_scopes: true });
}

/** Exchange the OAuth code and store the encrypted refresh token for the business. */
export async function saveGoogleConnection(businessId: string, code: string): Promise<string> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Remove the app's access in your Google account and try again.");
  client.setCredentials(tokens);
  const { data: me } = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  const email = me.email ?? "unknown";
  await sql`insert into calendar_connections (business_id, google_email, refresh_token_enc, connected_at)
            values (${businessId}, ${email}, ${encrypt(tokens.refresh_token)}, now())
            on conflict (business_id) do update
              set google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc, connected_at = now()`;
  return email;
}

export async function calendarConnection(businessId: string) {
  return one<{ google_email: string; connected_at: string }>(
    sql`select google_email, connected_at from calendar_connections where business_id = ${businessId}`,
  );
}

/** Calendar API client for a business, or null if they haven't connected Google. */
export async function calendarFor(businessId: string): Promise<calendar_v3.Calendar | null> {
  const row = await one<{ refresh_token_enc: string }>(sql`select refresh_token_enc from calendar_connections where business_id = ${businessId}`);
  if (!row) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(row.refresh_token_enc) });
  return google.calendar({ version: "v3", auth: client });
}

/** Busy blocks per calendar id between two instants. */
export async function freeBusy(cal: calendar_v3.Calendar, calendarIds: string[], from: Date, to: Date): Promise<Record<string, Busy[]>> {
  const ids = [...new Set(calendarIds)];
  const res = await cal.freebusy.query({
    requestBody: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: ids.map((id) => ({ id })) },
  });
  const out: Record<string, Busy[]> = {};
  for (const id of ids) {
    const entry = res.data.calendars?.[id];
    if (entry?.errors?.length) throw new Error(`Calendar ${id}: ${entry.errors.map((e) => e.reason).join(", ")}`);
    out[id] = (entry?.busy ?? []).map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
  }
  return out;
}

export async function createEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  e: { summary: string; description: string; start: Date; end: Date; timezone: string; location?: string | null },
): Promise<string> {
  const res = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: e.summary,
      description: e.description,
      location: e.location ?? undefined,
      start: { dateTime: e.start.toISOString(), timeZone: e.timezone },
      end: { dateTime: e.end.toISOString(), timeZone: e.timezone },
      reminders: { useDefault: true },
    },
  });
  return res.data.id!;
}

export async function deleteEvent(cal: calendar_v3.Calendar, calendarId: string, eventId: string): Promise<void> {
  try {
    await cal.events.delete({ calendarId, eventId });
  } catch (err) {
    const status = (err as { code?: number }).code;
    if (status !== 404 && status !== 410) throw err; // already gone is fine
  }
}

export async function listCalendars(cal: calendar_v3.Calendar): Promise<{ id: string; name: string }[]> {
  const res = await cal.calendarList.list({ minAccessRole: "writer" });
  return (res.data.items ?? []).map((c) => ({ id: c.id!, name: c.summary ?? c.id! }));
}
