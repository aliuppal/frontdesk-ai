-- FrontDesk AI schema (Neon Postgres). Tenant isolation is enforced in the app: every query for
-- business data is filtered by the business_id resolved from the signed-in session or the Retell agent.

create extension if not exists btree_gist;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Session id = sha256(cookie token), so a leaked database row can't be replayed as a cookie.
create table sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on sessions (user_id);

create table businesses (
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

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on business_members (user_id);

create table business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7), -- 1 = Monday … 7 = Sunday (ISO)
  open_time time not null,
  close_time time not null,
  check (close_time > open_time)
);
create index on business_hours (business_id);

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  duration_minutes int not null default 60 check (duration_minutes between 5 and 600),
  price_note text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on services (business_id);

create table staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  email text,
  calendar_id text not null default 'primary',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on staff (business_id);

create table staff_services (
  staff_id uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create table calendar_connections (
  business_id uuid primary key references businesses(id) on delete cascade,
  google_email text not null,
  refresh_token_enc text not null,
  connected_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text,
  phone text not null,
  email text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  retell_call_id text not null unique,
  status text not null default 'in_progress',
  from_number text,
  to_number text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  transcript text,
  transcript_json jsonb,
  recording_path text, -- Vercel Blob pathname (private store)
  summary text,
  sentiment text,
  successful boolean,
  appointment_booked boolean not null default false,
  extracted jsonb not null default '{}'::jsonb,
  disconnection_reason text,
  cost_cents numeric,
  customer_id uuid references customers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on calls (business_id, started_at desc);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  staff_id uuid not null references staff(id) on delete restrict,
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
create index on appointments (business_id, starts_at);
create unique index appointments_call_start_uniq on appointments (retell_call_id, starts_at)
  where retell_call_id is not null and status = 'booked';
