create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_source') then
    create type appointment_source as enum ('csv_upload', 'email');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_status') then
    create type appointment_status as enum ('pending', 'confirmed', 'canceled_by_patient', 'canceled_auto');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'token_purpose') then
    create type token_purpose as enum ('confirm', 'cancel');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_channel') then
    create type message_channel as enum ('sms', 'email');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_template') then
    create type message_template as enum (
      'confirm_request',
      'confirmed_ack',
      'auto_cancel_notice',
      'clinic_cancel_notice'
    );
  end if;
end $$;

create table if not exists clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Europe/Bucharest',
  export_hour integer not null default 10 check (export_hour between 0 and 23),
  deadline_hour integer not null default 18 check (deadline_hour between 0 and 23),
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid not null unique references clinics(id) on delete cascade,
  role text not null default 'manager' check (role = 'manager'),
  created_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  external_appointment_id text not null,
  start_datetime timestamptz not null,
  phone text not null,
  appointment_type text not null,
  patient_name text,
  provider_name text,
  source appointment_source not null default 'csv_upload',
  status appointment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, external_appointment_id, start_datetime)
);

create table if not exists tokens (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  token text not null unique,
  purpose token_purpose not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (appointment_id, purpose)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  channel message_channel not null,
  template message_template not null,
  "to" text not null,
  sent_at timestamptz not null default now(),
  provider_message_id text,
  delivery_status text,
  raw jsonb,
  unique (appointment_id, channel, template)
);

create index if not exists idx_appointments_clinic_start
  on appointments (clinic_id, start_datetime);

create index if not exists idx_appointments_clinic_status_start
  on appointments (clinic_id, status, start_datetime);

create index if not exists idx_tokens_token
  on tokens (token);

create index if not exists idx_messages_template
  on messages (template, channel);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_appointments_set_updated_at on appointments;
create trigger trg_appointments_set_updated_at
before update on appointments
for each row
execute function set_updated_at();