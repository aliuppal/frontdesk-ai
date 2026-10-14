-- Calendar: Google Calendar → Cal.com. WhatsApp as a second channel next to the phone line.

-- Each business connects its own Cal.com account with an API key (stored encrypted).
create table cal_connections (
  business_id uuid primary key references businesses(id) on delete cascade,
  api_key_enc text not null,
  username text,
  time_zone text,
  connected_at timestamptz not null default now()
);
drop table calendar_connections;

-- Services imported from Cal.com event types book through Cal.com; others use the built-in schedule.
alter table services add column cal_event_type_id bigint;
create unique index services_business_cal_event_type on services (business_id, cal_event_type_id) where cal_event_type_id is not null;

-- Cal.com is the source of truth for its own bookings (and may book team hosts we don't model), so our
-- overlap guard only covers bookings made on the built-in schedule.
alter table appointments add column cal_booking_uid text;
alter table appointments drop constraint appointments_staff_id_tstzrange_excl;
alter table appointments add constraint appointments_no_overlap
  exclude using gist (staff_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status = 'booked' and cal_booking_uid is null);

-- WhatsApp Business number (connected in the ElevenLabs workspace) that this business's agent answers.
alter table businesses add column whatsapp_phone_number_id text unique;
alter table businesses add column whatsapp_number text;

alter table calls add column channel text not null default 'phone' check (channel in ('phone', 'whatsapp', 'web'));
