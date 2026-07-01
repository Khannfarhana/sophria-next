-- Phase 1: trip-mode aware bookings (one_way | hourly | airport)
-- See docs/torontocitylimo-replication-plan.md §4

alter table public.bookings
  add column if not exists trip_type text not null default 'one_way',
  add column if not exists duration_hours integer,
  add column if not exists flight_number text,
  add column if not exists passenger_count integer,
  add column if not exists luggage_count integer;

comment on column public.bookings.trip_type is 'Booking mode: one_way | hourly | airport';
comment on column public.bookings.duration_hours is 'Hours reserved for hourly trips';
comment on column public.bookings.flight_number is 'Flight number for airport trips';
