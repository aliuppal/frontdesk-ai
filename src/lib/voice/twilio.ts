import "server-only";
import { need } from "../env";

// Buys US local numbers on the platform's Twilio account. ElevenLabs then imports the number and points
// it at the business's agent (see elevenlabs.ts). Plain REST: two calls don't justify the Twilio SDK.

function auth() {
  const sid = need("TWILIO_ACCOUNT_SID");
  return { sid, header: `Basic ${Buffer.from(`${sid}:${need("TWILIO_AUTH_TOKEN")}`).toString("base64")}` };
}

async function twilio(path: string, init?: RequestInit) {
  const { sid, header } = auth();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    ...init,
    headers: { Authorization: header, ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Twilio: ${body.message ?? res.statusText}`);
  return body;
}

/** Buys a voice-capable local number, preferring the area code. Returns E.164, e.g. +15125550123. */
export async function buyLocalNumber(areaCode: number | null, friendlyName: string): Promise<string> {
  const search = async (q: string) =>
    (await twilio(`/AvailablePhoneNumbers/US/Local.json?VoiceEnabled=true&PageSize=1${q}`)).available_phone_numbers?.[0]?.phone_number as string | undefined;
  const number = (areaCode && (await search(`&AreaCode=${areaCode}`))) || (await search(""));
  if (!number) throw new Error("Twilio has no US local numbers available right now.");
  await twilio("/IncomingPhoneNumbers.json", {
    method: "POST",
    body: new URLSearchParams({ PhoneNumber: number, FriendlyName: friendlyName.slice(0, 64) }),
  });
  return number;
}

export function twilioCredentials() {
  return { sid: need("TWILIO_ACCOUNT_SID"), token: need("TWILIO_AUTH_TOKEN") };
}
