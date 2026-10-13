import { get } from "@vercel/blob";
import { currentUser } from "@/lib/auth";
import { one, sql } from "@/lib/db";

// Streams a call recording from the private Blob store, only to a member of the call's business.
// Range requests are passed through so the dashboard player can seek to any transcript line.
export async function GET(req: Request, ctx: RouteContext<"/api/recordings/[callId]">) {
  const { callId } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const call = await one<{ recording_path: string | null }>(sql`
    select c.recording_path from calls c
    join business_members m on m.business_id = c.business_id and m.user_id = ${user.id}
    where c.id = ${callId}`);
  if (!call?.recording_path) return new Response("Not found", { status: 404 });

  const range = req.headers.get("range");
  const blob = await get(call.recording_path, { access: "private", headers: range ? { range } : undefined });
  if (!blob || blob.statusCode !== 200) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "content-type": blob.blob.contentType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = blob.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(blob.stream, { status: blob.headers.get("content-range") ? 206 : 200, headers });
}
