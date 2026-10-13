import "server-only";
import { neon, types, type NeonQueryFunction } from "@neondatabase/serverless";

// One HTTP-based Postgres client for the whole app (fits serverless: no pool to exhaust).
// Timestamps come back as ISO strings and numerics/bigints as numbers, to match src/lib/types.ts.

const TIMESTAMPTZ = 1184;
const TIMESTAMP = 1114;
const NUMERIC = 1700;
const INT8 = 20;

const toIso = (v: string) => new Date(/[+-]\d\d(:?\d\d)?$|Z$/.test(v) ? v : `${v}Z`).toISOString();

// Registered globally: the driver ignores a `types` option passed to neon() for tagged-template queries.
types.setTypeParser(TIMESTAMPTZ, toIso);
types.setTypeParser(TIMESTAMP, toIso);
types.setTypeParser(NUMERIC, Number);
types.setTypeParser(INT8, Number);

let client: NeonQueryFunction<false, false> | null = null;

export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
    client = neon(url);
  }
  return client;
}

/** Tagged-template SQL: sql`select * from calls where business_id = ${id}` (values are always parameterised). */
export function sql<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
  return db()(strings, ...values) as unknown as Promise<T[]>;
}

/** First row or null. */
export async function one<T>(rows: Promise<T[]>): Promise<T | null> {
  return (await rows)[0] ?? null;
}

/** Postgres error code (e.g. 23P01 exclusion violation, 23505 unique violation), if any. */
export function pgCode(err: unknown): string | undefined {
  return (err as { code?: string })?.code;
}
