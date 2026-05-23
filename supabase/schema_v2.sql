
-- RideMate V2 schema / migration
-- Safe to run on a new project. For an existing project, back up first.
create extension if not exists pgcrypto;

do $$ begin create type public.user_role as enum ('passenger','driver','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.gender_type as enum ('male','female'); exception when duplicate_object then null; end $$;
do $$ begin create type public.travel_mode_type as enum ('solo','family'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ride_rule_type as enum ('mixed','male_only','female_only','family_only'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ride_status as enum ('open','closed','cancelled','completed','expired'); exception when duplicate_object then null; end $$;
do $$ begin create type public.booking_status as enum ('pending','accepted','rejected','cancelled','active','completed','expired'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('unpaid','paid','refunded','not_required'); exception when duplicate_object then null; end $$;
do $$ begin create type public.report_status as enum ('open','reviewing','resolved'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'passenger',
  gender public.gender_type not null,
  travel_mode public.travel_mode_type not null default 'solo',
  rating numeric(3,2) not null default 5.00,
  status text not null default 'active',
  verification_status text not null default 'unverified',
  created_at timestamptz not null default now()
);

create table if not exists public.private_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text not null,
  emergency_contact text,
  cnic_number text,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  car_model text not null,
  plate_number text not null,
  color text,
  registration_number text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null check (doc_type in ('cnic_front','cnic_back','license','vehicle_registration','selfie')),
  file_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  from_city text not null,
  to_city text not null,
  pickup_area text not null,
  dropoff_area text not null,
  via_route text,
  departure_at timestamptz not null,
  total_seats int not null check (total_seats between 1 and 6),
  price_per_seat numeric(12,2) not null default 0,
  ride_rule public.ride_rule_type not null default 'mixed',
  trip_type text not null default 'one_way',
  recurrence_type text not null default 'once',
  recurrence_days text,
  allow_monthly_booking boolean not null default false,
  monthly_price numeric(12,2),
  notes text,
  status public.ride_status not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  seats_requested int not null default 1,
  note text,
  status public.booking_status not null default 'pending',
  payment_status public.payment_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  unique(ride_id, passenger_id)
);

create table if not exists public.trip_locations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lat numeric not null,
  lng numeric not null,
  accuracy numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_history (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid references public.rides(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  driver_id uuid references public.profiles(id) on delete set null,
  passenger_id uuid references public.profiles(id) on delete set null,
  from_city text,
  to_city text,
  pickup_area text,
  dropoff_area text,
  price_per_seat numeric(12,2),
  status text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  from_city text not null,
  to_city text not null,
  pickup_area text,
  dropoff_area text,
  notify_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  report_type text not null,
  details text not null,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.private_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.driver_documents enable row level security;
alter table public.rides enable row level security;
alter table public.bookings enable row level security;
alter table public.trip_locations enable row level security;
alter table public.trip_history enable row level security;
alter table public.saved_routes enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active')
$$;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());
drop policy if exists "private own read" on public.private_profiles;
create policy "private own read" on public.private_profiles for select using (user_id=auth.uid() or public.is_admin());
drop policy if exists "private own update" on public.private_profiles;
create policy "private own update" on public.private_profiles for update using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "vehicles owner read" on public.vehicles;
create policy "vehicles owner read" on public.vehicles for select using (owner_id=auth.uid() or public.is_admin());
drop policy if exists "vehicles owner insert" on public.vehicles;
create policy "vehicles owner insert" on public.vehicles for insert with check (owner_id=auth.uid());
drop policy if exists "vehicles owner update" on public.vehicles;
create policy "vehicles owner update" on public.vehicles for update using (owner_id=auth.uid() or public.is_admin());
drop policy if exists "docs own read" on public.driver_documents;
create policy "docs own read" on public.driver_documents for select using (user_id=auth.uid() or public.is_admin());
drop policy if exists "docs own insert" on public.driver_documents;
create policy "docs own insert" on public.driver_documents for insert with check (user_id=auth.uid());
drop policy if exists "docs admin update" on public.driver_documents;
create policy "docs admin update" on public.driver_documents for update using (public.is_admin());
drop policy if exists "rides public read" on public.rides;
create policy "rides public read" on public.rides for select using (true);
drop policy if exists "rides driver insert" on public.rides;
create policy "rides driver insert" on public.rides for insert with check (driver_id=auth.uid());
drop policy if exists "rides driver update" on public.rides;
create policy "rides driver update" on public.rides for update using (driver_id=auth.uid() or public.is_admin());
drop policy if exists "bookings own read" on public.bookings;
create policy "bookings own read" on public.bookings for select using (passenger_id=auth.uid() or exists(select 1 from public.rides r where r.id=ride_id and r.driver_id=auth.uid()) or public.is_admin());
drop policy if exists "bookings passenger insert" on public.bookings;
create policy "bookings passenger insert" on public.bookings for insert with check (passenger_id=auth.uid());
drop policy if exists "bookings own update" on public.bookings;
create policy "bookings own update" on public.bookings for update using (passenger_id=auth.uid() or exists(select 1 from public.rides r where r.id=ride_id and r.driver_id=auth.uid()) or public.is_admin());
drop policy if exists "locations booking parties" on public.trip_locations;
create policy "locations booking parties" on public.trip_locations for select using (exists(select 1 from public.bookings b join public.rides r on r.id=b.ride_id where b.id=booking_id and (b.passenger_id=auth.uid() or r.driver_id=auth.uid())) or public.is_admin());
drop policy if exists "locations own insert" on public.trip_locations;
create policy "locations own insert" on public.trip_locations for insert with check (user_id=auth.uid());
drop policy if exists "history own read" on public.trip_history;
create policy "history own read" on public.trip_history for select using (passenger_id=auth.uid() or driver_id=auth.uid() or public.is_admin());
drop policy if exists "saved own" on public.saved_routes;
create policy "saved own" on public.saved_routes for all using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "reports own insert" on public.reports;
create policy "reports own insert" on public.reports for insert with check (reporter_id=auth.uid());
drop policy if exists "reports admin read" on public.reports;
create policy "reports admin read" on public.reports for select using (reporter_id=auth.uid() or public.is_admin());
drop policy if exists "reports admin update" on public.reports;
create policy "reports admin update" on public.reports for update using (public.is_admin());
drop policy if exists "notifications own" on public.notifications;
create policy "notifications own" on public.notifications for select using (user_id=auth.uid() or public.is_admin());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, role, gender)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name','User'),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role,'passenger'),
    coalesce((new.raw_user_meta_data->>'gender')::public.gender_type,'male')
  )
  on conflict (id) do nothing;
  insert into public.private_profiles(user_id, phone)
  values(new.id, coalesce(new.raw_user_meta_data->>'phone',''))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop view if exists public.rides_public;
create or replace view public.rides_public as
select r.*, 
  (r.total_seats - coalesce((select sum(b.seats_requested) from public.bookings b where b.ride_id=r.id and b.status in ('accepted','active','completed')),0))::int as seats_left,
  p.full_name as driver_name, p.gender as driver_gender, p.rating as driver_rating,
  v.car_model, v.plate_number, v.color, v.is_verified as vehicle_verified
from public.rides r
join public.profiles p on p.id=r.driver_id
left join public.vehicles v on v.id=r.vehicle_id;

drop view if exists public.bookings_public;
create or replace view public.bookings_public as
select b.*, r.driver_id, r.from_city, r.to_city, r.pickup_area, r.dropoff_area, r.via_route, r.departure_at, r.price_per_seat, r.ride_rule,
       dp.full_name as driver_name, dp.gender as driver_gender,
       pp.full_name as passenger_name, pp.gender as passenger_gender, pp.travel_mode
from public.bookings b
join public.rides r on r.id=b.ride_id
join public.profiles dp on dp.id=r.driver_id
join public.profiles pp on pp.id=b.passenger_id;

drop view if exists public.trip_history_public;
create or replace view public.trip_history_public as
select h.*, 
  case when h.passenger_id=auth.uid() then dp.full_name else pp.full_name end as other_party
from public.trip_history h
left join public.profiles dp on dp.id=h.driver_id
left join public.profiles pp on pp.id=h.passenger_id;

drop view if exists public.reports_public;
create or replace view public.reports_public as
select r.*, p.full_name as reporter_name from public.reports r join public.profiles p on p.id=r.reporter_id;

drop view if exists public.driver_documents_public;
create or replace view public.driver_documents_public as
select d.*, p.full_name from public.driver_documents d join public.profiles p on p.id=d.user_id;

create or replace function public.ensure_passenger_allowed(p_ride_id uuid, p_passenger_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare rr public.ride_rule_type; pg public.gender_type; tm public.travel_mode_type; st text;
begin
  select r.ride_rule into rr from public.rides r where r.id=p_ride_id;
  select gender, travel_mode, status into pg, tm, st from public.profiles where id=p_passenger_id;
  if st <> 'active' then raise exception 'Your account is not active'; end if;
  if rr='male_only' and pg<>'male' then raise exception 'Male passengers only'; end if;
  if rr='female_only' and pg<>'female' then raise exception 'Female passengers only'; end if;
  if rr='family_only' and tm<>'family' then raise exception 'Family profile required'; end if;
end $$;

create or replace function public.create_ride_v2(
  p_vehicle_id uuid, p_from_city text, p_to_city text, p_pickup_area text, p_dropoff_area text, p_via_route text,
  p_departure_at timestamptz, p_total_seats int, p_price_per_seat numeric, p_ride_rule public.ride_rule_type,
  p_trip_type text, p_recurrence_type text, p_recurrence_days text, p_allow_monthly_booking boolean, p_monthly_price numeric, p_notes text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_driver uuid := auth.uid();
begin
  if not exists(select 1 from public.profiles where id=v_driver and role='driver' and status='active' and verification_status='verified') then
    raise exception 'Driver KYC approval is required before posting rides';
  end if;
  if not exists(select 1 from public.vehicles where id=p_vehicle_id and owner_id=v_driver) then raise exception 'Vehicle not found'; end if;
  if p_departure_at <= now() then raise exception 'Departure time must be in future'; end if;
  insert into public.rides(driver_id,vehicle_id,from_city,to_city,pickup_area,dropoff_area,via_route,departure_at,total_seats,price_per_seat,ride_rule,trip_type,recurrence_type,recurrence_days,allow_monthly_booking,monthly_price,notes)
  values(v_driver,p_vehicle_id,trim(p_from_city),trim(p_to_city),trim(p_pickup_area),trim(p_dropoff_area),p_via_route,p_departure_at,p_total_seats,p_price_per_seat,p_ride_rule,p_trip_type,p_recurrence_type,p_recurrence_days,p_allow_monthly_booking,p_monthly_price,p_notes)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_booking_request_v2(p_ride_id uuid, p_seats_requested int default 1, p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_booking uuid; v_ride public.rides%rowtype; v_left int;
begin
  select * into v_ride from public.rides where id=p_ride_id;
  if not found then raise exception 'Ride not found'; end if;
  if v_ride.status <> 'open' or v_ride.departure_at <= now() then raise exception 'Ride is not available'; end if;
  if v_ride.driver_id = auth.uid() then raise exception 'You cannot book your own ride'; end if;
  perform public.ensure_passenger_allowed(p_ride_id, auth.uid());
  select v_ride.total_seats - coalesce(sum(seats_requested),0) into v_left from public.bookings where ride_id=p_ride_id and status in ('accepted','active','completed');
  if coalesce(v_left,0) < p_seats_requested then raise exception 'No seats available'; end if;
  insert into public.bookings(ride_id,passenger_id,seats_requested,note)
  values(p_ride_id, auth.uid(), p_seats_requested, p_note)
  returning id into v_booking;
  insert into public.notifications(user_id,title,body) values(v_ride.driver_id,'New seat request','A passenger requested a seat and added pickup details.');
  return v_booking;
exception when unique_violation then
  raise exception 'You already requested this ride';
end $$;

create or replace function public.accept_booking_request(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_driver uuid;
begin
  select r.driver_id into v_driver from public.bookings b join public.rides r on r.id=b.ride_id where b.id=p_booking_id;
  if v_driver <> auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  update public.bookings set status='accepted' where id=p_booking_id;
end $$;

create or replace function public.reject_booking_request(p_booking_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v record;
begin
  select b.*, r.driver_id, r.from_city, r.to_city, r.pickup_area, r.dropoff_area, r.price_per_seat into v from public.bookings b join public.rides r on r.id=b.ride_id where b.id=p_booking_id;
  if v.driver_id <> auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  update public.bookings set status='rejected' where id=p_booking_id;
  insert into public.trip_history(ride_id,booking_id,driver_id,passenger_id,from_city,to_city,pickup_area,dropoff_area,price_per_seat,status,reason)
  values(v.ride_id,p_booking_id,v.driver_id,v.passenger_id,v.from_city,v.to_city,v.pickup_area,v.dropoff_area,v.price_per_seat,'rejected',p_reason);
end $$;

create or replace function public.cancel_booking_request(p_booking_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v record;
begin
  select b.*, r.driver_id, r.from_city, r.to_city, r.pickup_area, r.dropoff_area, r.price_per_seat into v from public.bookings b join public.rides r on r.id=b.ride_id where b.id=p_booking_id;
  if v.passenger_id <> auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  update public.bookings set status='cancelled' where id=p_booking_id;
  insert into public.trip_history(ride_id,booking_id,driver_id,passenger_id,from_city,to_city,pickup_area,dropoff_area,price_per_seat,status,reason)
  values(v.ride_id,p_booking_id,v.driver_id,v.passenger_id,v.from_city,v.to_city,v.pickup_area,v.dropoff_area,v.price_per_seat,'cancelled',p_reason);
end $$;

create or replace function public.start_booking_trip(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_driver uuid;
begin
  select r.driver_id into v_driver from public.bookings b join public.rides r on r.id=b.ride_id where b.id=p_booking_id;
  if v_driver <> auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  update public.bookings set status='active' where id=p_booking_id;
end $$;

create or replace function public.close_ride(p_ride_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.rides set status='closed' where id=p_ride_id and (driver_id=auth.uid() or public.is_admin());
end $$;

create or replace function public.expire_old_rides()
returns void language plpgsql security definer set search_path=public as $$
declare r record;
begin
  for r in select * from public.rides where status='open' and departure_at < now() loop
    update public.rides set status='expired' where id=r.id;
    insert into public.trip_history(ride_id,driver_id,from_city,to_city,pickup_area,dropoff_area,price_per_seat,status,reason)
    values(r.id,r.driver_id,r.from_city,r.to_city,r.pickup_area,r.dropoff_area,r.price_per_seat,'expired','Departure time passed');
  end loop;
  update public.bookings set status='expired' where status in ('pending','accepted') and ride_id in (select id from public.rides where status='expired');
end $$;

create or replace function public.get_booking_contact(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v record; target uuid;
begin
  select b.*, r.driver_id into v from public.bookings b join public.rides r on r.id=b.ride_id where b.id=p_booking_id;
  if v.status not in ('accepted','active','completed') then raise exception 'Contact is available after acceptance only'; end if;
  if auth.uid()=v.passenger_id then target:=v.driver_id;
  elsif auth.uid()=v.driver_id then target:=v.passenger_id;
  elsif public.is_admin() then target:=v.passenger_id;
  else raise exception 'Not allowed'; end if;
  return (select jsonb_build_object('full_name',p.full_name,'phone',pp.phone,'emergency_contact',pp.emergency_contact) from public.profiles p left join public.private_profiles pp on pp.user_id=p.id where p.id=target);
end $$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.profiles set status=p_status where id=p_user_id;
end $$;

create or replace function public.admin_set_driver_verified(p_user_id uuid, p_verified boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.profiles set verification_status=case when p_verified then 'verified' else 'unverified' end where id=p_user_id and role='driver';
end $$;

-- Optional: run this manually sometimes, or schedule it later with pg_cron if available:
-- select public.expire_old_rides();


-- KYC document image storage bucket
insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', true)
on conflict (id) do update set public = true;

drop policy if exists "kyc docs owner upload" on storage.objects;
create policy "kyc docs owner upload"
on storage.objects for insert
with check (
  bucket_id = 'kyc-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "kyc docs owner read" on storage.objects;
create policy "kyc docs owner read"
on storage.objects for select
using (
  bucket_id = 'kyc-documents'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or public.is_admin()
  )
);

drop policy if exists "kyc docs public read" on storage.objects;
create policy "kyc docs public read"
on storage.objects for select
using (bucket_id = 'kyc-documents');

drop policy if exists "kyc docs owner update" on storage.objects;
create policy "kyc docs owner update"
on storage.objects for update
using (
  bucket_id = 'kyc-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);


-- Driver rating after completed trips
create table if not exists public.driver_ratings (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.trip_history(id) on delete cascade,
  ride_id uuid references public.rides(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now(),
  unique(history_id, passenger_id)
);

alter table public.driver_ratings enable row level security;

drop policy if exists "ratings read" on public.driver_ratings;
create policy "ratings read" on public.driver_ratings
for select using (driver_id=auth.uid() or passenger_id=auth.uid() or public.is_admin());

drop policy if exists "ratings passenger insert" on public.driver_ratings;
create policy "ratings passenger insert" on public.driver_ratings
for insert with check (passenger_id=auth.uid());

create or replace function public.refresh_driver_rating(p_driver_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.profiles
  set rating = coalesce((select round(avg(rating)::numeric,2) from public.driver_ratings where driver_id=p_driver_id),5.00)
  where id=p_driver_id;
end $$;

create or replace function public.submit_driver_rating(p_history_id uuid, p_rating int, p_review_text text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare h record; v_id uuid;
begin
  select * into h from public.trip_history where id=p_history_id;
  if not found then raise exception 'Trip history not found'; end if;
  if h.passenger_id <> auth.uid() then raise exception 'Only passenger can rate this trip'; end if;
  if h.status <> 'completed' then raise exception 'Only completed trips can be rated'; end if;
  insert into public.driver_ratings(history_id,ride_id,booking_id,driver_id,passenger_id,rating,review_text)
  values(p_history_id,h.ride_id,h.booking_id,h.driver_id,h.passenger_id,p_rating,p_review_text)
  returning id into v_id;
  perform public.refresh_driver_rating(h.driver_id);
  return v_id;
exception when unique_violation then
  raise exception 'You already rated this trip';
end $$;


create or replace function public.start_ride_for_passengers(p_ride_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r record;
begin
  select * into r from public.rides where id=p_ride_id;
  if not found then raise exception 'Ride not found'; end if;
  if r.driver_id <> auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  update public.bookings
  set status='active'
  where ride_id=p_ride_id and status='accepted';

  insert into public.notifications(user_id,title,body)
  select b.passenger_id,
         'Ride started',
         'Your driver has started the ride and is coming for pickup. Open Live tab to see location.'
  from public.bookings b
  where b.ride_id=p_ride_id and b.status='active';
end $$;

create or replace function public.start_booking_trip(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v record;
begin
  select b.*, r.driver_id, r.from_city, r.to_city into v
  from public.bookings b join public.rides r on r.id=b.ride_id
  where b.id=p_booking_id;
  if v.driver_id <> auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  update public.bookings set status='active' where id=p_booking_id;
  insert into public.notifications(user_id,title,body)
  values(v.passenger_id,'Ride started','Your driver has started the ride and is coming for pickup. Open Live tab to see location.');
end $$;
