import { after } from "next/server";
import { bookAppointment } from "@/lib/booking/booking-service";
import { sendBookingEmails } from "@/lib/email";
import { toolRoute } from "@/lib/voice/tool-route";

export const POST = toolRoute("book_appointment", async ({ businessId, callId, args }) => {
  const outcome = await bookAppointment(businessId, callId, args);
  const { appointment, business } = outcome;
  if (outcome.created && appointment && business) {
    // Emails go out after the agent has its answer, so the caller isn't kept waiting.
    after(async () => {
      const problems = await sendBookingEmails(business, appointment);
      if (problems.length) console.error("booking emails", appointment.id, problems);
    });
  }
  return outcome.reply;
});
