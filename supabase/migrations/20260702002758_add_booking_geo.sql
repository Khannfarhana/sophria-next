-- Phase 2: geocoded pickup/drop-off + driving distance for distance-based pricing.
-- Populated by the Mapbox Search Box + Directions integration. All nullable so
-- existing string-only bookings keep working.

alter table public.bookings
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists dropoff_lat double precision,
  add column if not exists dropoff_lng double precision,
  add column if not exists distance_km numeric,
  add column if not exists duration_min numeric;

comment on column public.bookings.pickup_lat is 'Pickup latitude (Mapbox geocoded)';
comment on column public.bookings.pickup_lng is 'Pickup longitude (Mapbox geocoded)';
comment on column public.bookings.dropoff_lat is 'Drop-off latitude (Mapbox geocoded)';
comment on column public.bookings.dropoff_lng is 'Drop-off longitude (Mapbox geocoded)';
comment on column public.bookings.distance_km is 'Driving distance in km (Mapbox Directions)';
comment on column public.bookings.duration_min is 'Estimated driving duration in minutes (Mapbox Directions)';
