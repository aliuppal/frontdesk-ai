"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/business";
import { cancelAppointment } from "@/lib/booking/booking-service";
import { sendCancellationEmail } from "@/lib/email";

export async function cancelAppt(form: FormData) {
  const { business } = await requireBusiness(); // scopes the cancel to the signed-in owner's business
  const id = String(form.get("id") ?? "");
  const { appointment, business: b } = await cancelAppointment(business.id, id);
  if (form.get("notify") === "on") {
    try {
      await sendCancellationEmail(b, appointment);
    } catch (err) {
      console.error("cancel email failed", err);
    }
  }
  revalidatePath("/dashboard/appointments");
}
