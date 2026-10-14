import "server-only";

// Core settings are required for the site to run at all. Integration keys are optional so the dashboard
// can be deployed first; each integration asks for its keys when it is actually used.

type Key =
  | "DATABASE_URL"
  | "ENCRYPTION_KEY"
  | "ELEVENLABS_API_KEY"
  | "ELEVENLABS_WEBHOOK_SECRET"
  | "ELEVENLABS_LLM"
  | "TWILIO_ACCOUNT_SID"
  | "TWILIO_AUTH_TOKEN"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "RESEND_API_KEY"
  | "EMAIL_FROM";

const FEATURE: Partial<Record<Key, string>> = {
  ELEVENLABS_API_KEY: "The phone agent (ElevenLabs)",
  ELEVENLABS_WEBHOOK_SECRET: "Call history (ElevenLabs webhook)",
  TWILIO_ACCOUNT_SID: "Phone numbers (Twilio)",
  TWILIO_AUTH_TOKEN: "Phone numbers (Twilio)",
  GOOGLE_CLIENT_ID: "Google Calendar",
  GOOGLE_CLIENT_SECRET: "Google Calendar",
  RESEND_API_KEY: "Email",
  EMAIL_FROM: "Email",
  ENCRYPTION_KEY: "Encryption",
  DATABASE_URL: "The database",
};

/** Value of a required setting, with an error that says what to configure. */
export function need(key: Key): string {
  const v = process.env[key]?.trim();
  if (!v) throw new Error(`${FEATURE[key] ?? key} isn't configured yet: set ${key} (see .env.example).`);
  return v;
}

export function optional(key: Key): string | undefined {
  return process.env[key]?.trim() || undefined;
}

export const isConfigured = (...keys: Key[]) => keys.every((k) => !!process.env[k]?.trim());

/** Public base URL. Falls back to Vercel's production domain so deploys work without extra config. */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Conversation model the ElevenLabs agent runs on (billed by ElevenLabs per minute). */
export const voiceLlm = () => optional("ELEVENLABS_LLM") ?? "gpt-4.1-mini";
