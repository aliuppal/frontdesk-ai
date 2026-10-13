// Row shapes for the tables in db/migrations/0001_init.sql. Timestamps are ISO strings.

export interface Business {
  id: string;
  name: string;
  industry: string;
  timezone: string;
  notification_email: string;
  business_phone: string | null;
  address: string | null;
  greeting: string | null;
  agent_instructions: string | null;
  transfer_number: string | null;
  buffer_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  slot_interval_minutes: number;
  requires_address: boolean;
  voice_id: string;
  area_code: number | null;
  retell_llm_id: string | null;
  retell_agent_id: string | null;
  phone_number: string | null;
  agent_synced_at: string | null;
  created_at: string;
}

export interface BusinessHour {
  id: string;
  business_id: string;
  weekday: number;
  open_time: string;
  close_time: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  duration_minutes: number;
  price_note: string | null;
  description: string | null;
  active: boolean;
}

export interface Staff {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  calendar_id: string;
  is_default: boolean;
  active: boolean;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  created_at: string;
}

export interface TranscriptTurn {
  role: "agent" | "user" | string;
  content: string;
  words?: { word: string; start: number; end: number }[];
}

export interface Call {
  id: string;
  business_id: string;
  retell_call_id: string;
  status: string;
  from_number: string | null;
  to_number: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  transcript_json: TranscriptTurn[] | null;
  recording_path: string | null;
  summary: string | null;
  sentiment: string | null;
  successful: boolean | null;
  appointment_booked: boolean;
  extracted: Record<string, unknown>;
  disconnection_reason: string | null;
  cost_cents: number | null;
  customer_id: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  business_id: string;
  customer_id: string | null;
  service_id: string | null;
  staff_id: string;
  retell_call_id: string | null;
  service_name: string;
  starts_at: string;
  ends_at: string;
  status: "booked" | "cancelled" | "completed" | "no_show";
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  address: string | null;
  notes: string | null;
  google_event_id: string | null;
  calendar_sync_error: string | null;
  created_at: string;
}

export interface BusinessConfig {
  business: Business;
  hours: BusinessHour[];
  services: Service[];
  staff: Staff[];
  staffServices: { staff_id: string; service_id: string }[];
}
