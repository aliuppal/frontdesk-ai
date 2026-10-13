import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RETELL_API_KEY: z.string().min(1),
  RETELL_LLM_MODEL: z.string().default("gpt-4.1-mini"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  // 32 bytes, base64. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ENCRYPTION_KEY: z.string().min(40),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server env. Read lazily so `next build` works without secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${missing}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export const appUrl = () => env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
