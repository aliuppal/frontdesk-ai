-- FrontDesk AI schema. Every tenant table carries business_id and is protected by RLS:
-- a signed-in user can only see rows of businesses they are a member of.
-- Webhooks and voice-agent tools use the service-role key, which bypasses RLS.

create extension if not exists btree_gist;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null default 'other',
  timezone text not null default 'America/New_York',
  notification_email text not null,
  business_phone text,
  address text,
  greeting text,
  agent_instructions text,
  transfer_number text,
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 240),
  min_notice_minutes int not null default 60 check (min_notice_minutes between 0 and 10080),
  max_days_ahead int not null default 30 check (max_days_ahead between 1 and 365),
  slot_interval_minutes int not null default 30 check (slot_interval_minutes in (10, 15, 20, 30, 60)),
  requires_address boolean not null default false,
  voice_id text not null default 'retell-Cimo',
  area_code int,
  retell_llm_id text,
  retell_agent_id text unique,
  phone_number text unique,
  agent_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on public.business_members (user_id);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7), -- 1 = Monday … 7 = Sunday (ISO)
  open_time time not null,
  close_time time not null,
  check (close_time > open_time)
);
create index on public.business_hours (business_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  duration_minutes int not null default 60 check (duration_minutes between 5 and 600),
  price_note text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.services (business_id);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  email text,
  calendar_id text not null default 'primary',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.staff (business_id);

create table public.staff_services (
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create table public.calendar_connections (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  google_email text not null,
  refresh_token_enc text not null,
  connected_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text,
  phone text not null,
  email text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  retell_call_id text not null unique,
  status text not null default 'in_progress',
  from_number text,
  to_number text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  transcript text,
  transcript_json jsonb,
  recording_path text,
  summary text,
  sentiment text,
  successful boolean,
  appointment_booked boolean not null default false,
  extracted jsonb not null default '{}'::jsonb,
  disconnection_reason text,
  cost_cents numeric,
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.calls (business_id, started_at desc);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  staff_id uuid not null references public.staff(id) on delete restrict,
  retell_call_id text,
  service_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'completed', 'no_show')),
  customer_name text not null,
  customer_phone text,
  customer_email text,
  address text,
  notes text,
  google_event_id text,
  calendar_sync_error text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- One booked appointment per staff member at any instant: protects against two callers
  -- grabbing the same slot at the same moment.
  exclude using gist (staff_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'booked')
);
create index on public.appointments (business_id, starts_at);
create unique index appointments_call_start_uniq on public.appointments (retell_call_id, starts_at)
  where retell_call_id is not null and status = 'booked';

-- ── Row level security ────────────────────────────────────────────────────────

create or replace function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = b and user_id = auth.uid());
$$;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_hours enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.staff_services enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.customers enable row level security;
alter table public.calls enable row level security;
alter table public.appointments enable row level security;

create policy "members read business" on public.businesses for select using (public.is_member(id));
create policy "members update business" on public.businesses for update using (public.is_member(id));
create policy "read own memberships" on public.business_members for select using (user_id = auth.uid());

-- Settings tables: members have full control.
create policy "members all" on public.business_hours for all
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy "members all" on public.services for all
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy "members all" on public.staff for all
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy "members all" on public.staff_services for all
  using (exists (select 1 from public.staff s where s.id = staff_id and public.is_member(s.business_id)))
  with check (exists (select 1 from public.staff s where s.id = staff_id and public.is_member(s.business_id)));

-- calendar_connections has RLS on and no policies: the encrypted Google token is only ever read by
-- the server with the service-role key. The dashboard reads connection status server-side too.

-- Data written by calls: members read and update (e.g. cancel an appointment, fix a customer name).
create policy "members read" on public.customers for select using (public.is_member(business_id));
create policy "members update" on public.customers for update using (public.is_member(business_id));
create policy "members read" on public.calls for select using (public.is_member(business_id));
create policy "members read" on public.appointments for select using (public.is_member(business_id));
create policy "members update" on public.appointments for update using (public.is_member(business_id));

-- ── Storage: private bucket for call recordings, path = {business_id}/{call_id}.wav ──

insert into storage.buckets (id, name, public) values ('recordings', 'recordings', false)
  on conflict (id) do nothing;

create policy "members read recordings" on storage.objects for select
  using (bucket_id = 'recordings' and public.is_member(((storage.foldername(name))[1])::uuid));
