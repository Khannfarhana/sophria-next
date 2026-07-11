-- Client-provided pricing (11 Jul 2026): align the fare engine with the
-- published rate sheet.
--   * "Luxury Sedan" is now marketed as "Executive Sedan"; hourly $85
--     (airport-from stays $110 = base 95 + $15 airport fee).
--   * Luxury SUV: hourly $120; base 130 so airport-from = $145.
-- Idempotent: matched by name, and re-running the updates is a no-op.

update public.vehicles
set name = 'Executive Sedan', hourly_rate = 85
where name in ('Luxury Sedan', 'Executive Sedan');

update public.vehicles
set base_rate = 130, hourly_rate = 120
where name = 'Luxury SUV';

-- New main dispatch contact for the business.
update public.profiles
set phone = '+1 (437) 967-2334'
where email = 'ops@sophria.example';
