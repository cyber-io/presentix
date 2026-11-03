-- Run in a NEW Supabase project using the SQL editor. Do not use the old starter schema.
begin;
create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
  address text not null, latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  radius_meters double precision not null check(radius_meters between 20 and 1000)
);
create table if not exists public.attendance (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  office_id uuid not null references public.offices(id), office_name text not null,
  check_type text not null check(check_type in ('CHECK_IN','CHECK_OUT')),
  timestamp timestamptz not null default now(), latitude double precision not null,
  longitude double precision not null, accuracy_meters double precision not null,
  distance_meters double precision not null, photo_path text not null
);
create index if not exists attendance_user_time on public.attendance(user_id,timestamp desc);
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null check(length(name) between 1 and 100),
  email text not null check(length(email) between 3 and 150),
  designation text not null default 'Team Member',
  monthly_salary numeric not null default 0 check(monthly_salary >= 0),
  currency text not null default 'INR',
  photo_base64 text,
  created_at timestamptz not null default now()
);
alter table public.employees add column if not exists photo_base64 text;
alter table public.employees add column if not exists employee_id text;
alter table public.employees add column if not exists department text default 'Operations';
alter table public.employees add column if not exists shift text default 'General Morning (09:00 - 18:00)';
alter table public.employees add column if not exists joining_date timestamptz default now();
alter table public.employees add column if not exists is_active boolean default true;

-- Attendance tracking extensions per SRS v2.0
alter table public.attendance add column if not exists arrival_status text default 'On-time';
alter table public.attendance add column if not exists worked_minutes double precision;
alter table public.attendance add column if not exists shortfall_minutes double precision default 0;
alter table public.attendance add column if not exists correction_reason text;
alter table public.attendance add column if not exists original_timestamp timestamptz;

-- Audit Logs Table (SRS v2.0 Section 12)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  actor_email text not null,
  action text not null,
  target text not null,
  reason text,
  before_value text,
  after_value text,
  timestamp timestamptz not null default now()
);

-- Super Admin System Settings (SRS v2.0 Section 10 & 14)
create table if not exists public.system_settings (
  id text primary key default 'default',
  company_name text not null default 'Present Technologies Pvt Ltd',
  workplace_code text not null default 'WRK-HQ',
  support_email text not null default 'superadmin@present.local',
  default_currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  date_format text not null default 'DD/MM/YYYY',
  shift_start text not null default '09:00',
  shift_end text not null default '18:00',
  grace_period_mins int not null default 15,
  min_work_hours double precision not null default 8.0,
  half_day_hours double precision not null default 4.0,
  days_in_salary_month int not null default 26,
  salary_model text not null default 'fixed_26',
  overtime_multiplier double precision not null default 1.5,
  default_geofence_radius int not null default 50,
  max_gps_accuracy int not null default 100,
  strict_geofence boolean not null default true,
  face_match_threshold double precision not null default 0.45,
  face_check_mode text not null default 'both',
  require_first_login_pass_change boolean not null default true,
  auto_checkout_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text default 'superadmin@present.local'
);
insert into public.system_settings (id) values ('default') on conflict (id) do nothing;
grant all on public.system_settings to service_role;

-- Payroll Runs Table (SRS v2.0 Section 8 & 12)
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null,
  period_name text not null,
  total_employees int not null default 0,
  total_payroll numeric not null default 0,
  status text not null default 'Approved & Published',
  approved_by text,
  approved_at timestamptz default now(),
  notes text,
  unique(year, month)
);
-- Seed Krishna Gaushala Jainabad office
insert into public.offices (id, name, address, latitude, longitude, radius_meters)
values (
  'adcb9f93-c67a-4a46-a091-30a63dd7ec25',
  'Krishna Gaushala Jainabad',
  'Main Gate, Krishna Gaushala, Jainabad, Burhanpur, Madhya Pradesh',
  28.257000,
  76.634000,
  150
) on conflict (id) do nothing;
create unique index if not exists employees_email_idx on public.employees(lower(email));
create index if not exists employees_user_id_idx on public.employees(user_id);
alter table public.offices enable row level security;
alter table public.attendance enable row level security;
alter table public.employees enable row level security;
-- Browser clients have no direct table access. The authenticated .NET API owns writes.
revoke all on public.offices, public.attendance, public.employees from anon, authenticated;
grant all on public.offices, public.attendance, public.employees to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('attendance-photos','attendance-photos',false,2000000,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=2000000,allowed_mime_types=array['image/jpeg'];
-- Serializes each user's transitions across API instances; no double check-ins.
create or replace function public.mark_attendance(record jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare last_type text; saved public.attendance; person uuid;
begin
 person := (record->>'user_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(person::text,0));
 select check_type into last_type from public.attendance where user_id=person order by timestamp desc limit 1;
 if coalesce(last_type,'CHECK_OUT') = record->>'check_type' then
   raise exception 'Invalid attendance sequence';
 end if;
 insert into public.attendance select * from jsonb_populate_record(null::public.attendance, record || jsonb_build_object('timestamp',clock_timestamp())) returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.mark_attendance(jsonb) from public,anon,authenticated;
grant execute on function public.mark_attendance(jsonb) to service_role;
commit;
