"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/business";
import { syncConversations } from "@/lib/voice/sync";

/** "Refresh" on the Calls page: pull new conversations from ElevenLabs now, ignoring the throttle. */
export async function refreshCalls() {
  const { business } = await requireBusiness();
  await syncConversations(business.id, { force: true });
  revalidatePath("/dashboard/calls");
}
