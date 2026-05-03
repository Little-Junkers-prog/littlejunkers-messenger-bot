-- Little Junkers Sprint 2A PoC schema
-- Run in Supabase SQL Editor after creating the littlejunkers-poc project.
-- Purpose: fast, functional single-source-of-truth tables for Units, Customers, Rentals, Payments, Pricing, and Events.

create extension if not exists pgcrypto;

-- Reusable timestamp trigger
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Units: 7 named dumpsters
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  size_yards integer not null check (size_yards in (11, 16, 21)),
  status text not null default 'available' check (status in ('available', 'deployed', 'maintenance')),
  current_assignment uuid null,
  return_date date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Customers: migrated from Odoo plus manually added broker/customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text null,
  address text null,
  city text null,
  zip text null,
  customer_type text null check (customer_type is null or customer_type in ('residential', 'contractor', 'broker')),
  zone text null check (zone is null or zone in ('local', 'zone2', 'zone3')),
  preferred_size text null check (preferred_size is null or preferred_size in ('11', '16', '21')),
  notes text null,
  odoo_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_name_idx on public.customers using gin (to_tsvector('simple', coalesce(name, '')));
create index if not exists customers_odoo_id_idx on public.customers (odoo_id);

-- Rentals: core transaction record
create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  unit_id uuid null references public.units(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'awaiting_date', 'confirmed', 'active', 'returned', 'cancelled')),
  size_yards integer not null check (size_yards in (11, 16, 21)),
  delivery_address text not null,
  zone text not null check (zone in ('local', 'zone2', 'zone3')),
  dropoff_date date null,
  scheduled_return date null,
  actual_return date null,
  rental_days integer null,
  base_price numeric(10,2) null,
  total_price numeric(10,2) null,
  payment_source text not null default 'funnel' check (payment_source in ('funnel', 'manual_link', 'cash', 'broker')),
  stripe_session_id text null,
  stripe_payment_id text null,
  amount_paid numeric(10,2) null,
  calendar_event_id text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rentals_customer_id_idx on public.rentals (customer_id);
create index if not exists rentals_unit_id_idx on public.rentals (unit_id);
create index if not exists rentals_status_idx on public.rentals (status);
create index if not exists rentals_dates_idx on public.rentals (dropoff_date, scheduled_return);
create index if not exists rentals_stripe_session_id_idx on public.rentals (stripe_session_id);

-- Add FK from units.current_assignment after rentals exists
alter table public.units
  add constraint units_current_assignment_fkey
  foreign key (current_assignment)
  references public.rentals(id)
  on delete set null;

-- Payments: Stripe/manual payment audit trail
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid null references public.rentals(id) on delete set null,
  customer_id uuid null references public.customers(id) on delete set null,
  source text not null check (source in ('stripe', 'cash', 'manual', 'other')),
  stripe_session_id text null,
  stripe_payment_id text null,
  amount numeric(10,2) not null default 0,
  currency text not null default 'usd',
  status text not null default 'received',
  payload jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_rental_id_idx on public.payments (rental_id);
create index if not exists payments_customer_id_idx on public.payments (customer_id);
create index if not exists payments_stripe_session_id_idx on public.payments (stripe_session_id);

-- Events: agent/event feed
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'payment_received',
    'date_captured',
    'rental_confirmed',
    'unit_assigned',
    'dropoff_completed',
    'return_completed',
    'availability_checked',
    'sms_sent',
    'calendar_created',
    'admin_override'
  )),
  source text not null check (source in ('funnel', 'manual_link', 'twilio_sms', 'manual_entry', 'admin', 'system')),
  rental_id uuid null references public.rentals(id) on delete set null,
  customer_id uuid null references public.customers(id) on delete set null,
  payload jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists events_event_type_idx on public.events (event_type);
create index if not exists events_rental_id_idx on public.events (rental_id);
create index if not exists events_customer_id_idx on public.events (customer_id);
create index if not exists events_created_at_idx on public.events (created_at desc);

-- Pricing: zone/size/day matrix
create table if not exists public.pricing (
  id uuid primary key default gen_random_uuid(),
  size_yards integer not null check (size_yards in (11, 16, 21)),
  zone text not null check (zone in ('local', 'zone2', 'zone3')),
  day_type text not null check (day_type in ('weekday', 'weekend')),
  base_price numeric(10,2) not null,
  extra_day_price numeric(10,2) null,
  included_tons numeric(4,2) not null,
  overage_per_ton numeric(10,2) null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (size_yards, zone, day_type)
);

-- Triggers
create trigger set_units_updated_at
before update on public.units
for each row execute function public.update_updated_at();

create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.update_updated_at();

create trigger set_rentals_updated_at
before update on public.rentals
for each row execute function public.update_updated_at();

create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.update_updated_at();

create trigger set_pricing_updated_at
before update on public.pricing
for each row execute function public.update_updated_at();

-- Enable RLS. Service role bypasses RLS server-side; do not expose service role key client-side.
alter table public.units enable row level security;
alter table public.customers enable row level security;
alter table public.rentals enable row level security;
alter table public.payments enable row level security;
alter table public.events enable row level security;
alter table public.pricing enable row level security;

-- Seed 7 dumpsters. Update statuses in Supabase Studio after checking today's real field status.
insert into public.units (name, size_yards, status)
values
  ('Daisy Junker', 11, 'available'),
  ('Marc Jose Junker', 11, 'available'),
  ('Missy Junker', 11, 'available'),
  ('Jasmine Junker', 16, 'available'),
  ('Julissa Junker', 16, 'available'),
  ('Mrs Betsy Junker', 21, 'available'),
  ('Rosie the Junker', 21, 'available')
on conflict (name) do update set
  size_yards = excluded.size_yards,
  updated_at = now();

-- Starter pricing. Replace zone2/zone3 values with actual Little Junkers zone pricing before go-live.
insert into public.pricing (size_yards, zone, day_type, base_price, extra_day_price, included_tons, overage_per_ton, active)
values
  (11, 'local', 'weekday', 275, null, 1.0, null, true),
  (11, 'local', 'weekend', 295, null, 1.0, null, true),
  (16, 'local', 'weekday', 325, null, 1.5, null, true),
  (16, 'local', 'weekend', 345, null, 1.5, null, true),
  (21, 'local', 'weekday', 385, null, 2.0, null, true),
  (21, 'local', 'weekend', 405, null, 2.0, null, true),
  (11, 'zone2', 'weekday', 324, null, 1.0, null, true),
  (11, 'zone2', 'weekend', 344, null, 1.0, null, true),
  (16, 'zone2', 'weekday', 374, null, 1.5, null, true),
  (16, 'zone2', 'weekend', 394, null, 1.5, null, true),
  (21, 'zone2', 'weekday', 434, null, 2.0, null, true),
  (21, 'zone2', 'weekend', 454, null, 2.0, null, true),
  (11, 'zone3', 'weekday', 364, null, 1.0, null, true),
  (11, 'zone3', 'weekend', 384, null, 1.0, null, true),
  (16, 'zone3', 'weekday', 414, null, 1.5, null, true),
  (16, 'zone3', 'weekend', 434, null, 1.5, null, true),
  (21, 'zone3', 'weekday', 474, null, 2.0, null, true),
  (21, 'zone3', 'weekend', 494, null, 2.0, null, true)
on conflict (size_yards, zone, day_type) do update set
  base_price = excluded.base_price,
  extra_day_price = excluded.extra_day_price,
  included_tons = excluded.included_tons,
  overage_per_ton = excluded.overage_per_ton,
  active = excluded.active,
  updated_at = now();

-- Verification queries
-- select count(*) as unit_count from public.units;
-- select size_yards, count(*) from public.units group by size_yards order by size_yards;
-- select count(*) as pricing_rows from public.pricing;
