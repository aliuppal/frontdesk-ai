import { checkAvailability } from "@/lib/booking/booking-service";
import { toolRoute } from "@/lib/voice/tool-route";

export const POST = toolRoute("check_availability", ({ businessId, args }) => checkAvailability(businessId, args));
