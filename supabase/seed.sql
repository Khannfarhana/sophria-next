-- ============================================================================
--  SophRia — Seed data  (supabase/seed.sql)
-- ============================================================================
--  Mirrors src/data/data.ts. Load into Supabase with `supabase db reset`
--  (auto-runs seed.sql) or paste into the SQL editor.
--
--  Order respects foreign keys: profiles → user_roles → drivers →
--  driver_documents → vehicles → bookings → payments.
--  Idempotent via ON CONFLICT (id) DO NOTHING.
--
--  NOTE: `profiles.id` is normally FK → auth.users(id). These seed UUIDs
--  assume matching auth users exist (or the FK is deferred for local dev).
-- ============================================================================

------------------------------------------------------------------ profiles
insert into public.profiles (id, full_name, email, phone) values
  ('00000000-0000-4000-a000-000000000001', 'SophRia Operations', 'ops@sophria.example',        '+1 (416) 555-0188'),
  ('00000000-0000-4000-a000-000000000002', 'Jordan Avery',       'jordan.avery@example.com',   '+1 (416) 555-0123'),
  ('00000000-0000-4000-a000-000000000003', 'Priya Nair',         'priya.nair@example.com',     '+1 (647) 555-0456'),
  ('00000000-0000-4000-a000-000000000011', 'Marcus Bennett',     'marcus.bennett@example.com', '+1 (416) 555-0777'),
  ('00000000-0000-4000-a000-000000000012', 'Elena Rossi',        'elena.rossi@example.com',    '+1 (647) 555-0888'),
  ('00000000-0000-4000-a000-000000000013', 'Sam Okafor',         'sam.okafor@example.com',     '+1 (905) 555-0999')
on conflict (id) do nothing;

------------------------------------------------------------------ user_roles
insert into public.user_roles (id, user_id, role) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001', 'admin'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-a000-000000000002', 'customer'),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-a000-000000000003', 'customer'),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-a000-000000000011', 'driver'),
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-a000-000000000012', 'driver'),
  ('00000000-0000-4000-e000-000000000006', '00000000-0000-4000-a000-000000000013', 'driver')
on conflict (id) do nothing;

------------------------------------------------------------------ drivers
insert into public.drivers (id, user_id, license_number, experience_years, rating, total_earnings, is_available, is_verified) values
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-a000-000000000011', 'ON-DR-44821', 8, 4.9, 18250, true,  true),
  ('00000000-0000-4000-b000-000000000012', '00000000-0000-4000-a000-000000000012', 'ON-DR-77310', 5, 4.8, 12940, false, true),
  ('00000000-0000-4000-b000-000000000013', '00000000-0000-4000-a000-000000000013', 'ON-DR-90155', 3, 0.0, 0,     false, false)
on conflict (id) do nothing;

------------------------------------------------------------------ driver_documents
insert into public.driver_documents (id, driver_id, doc_type, file_url, status, notes) values
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-b000-000000000013', 'drivers_license', '/docs/sam-license.pdf',   'pending',  null),
  ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-b000-000000000013', 'insurance',       '/docs/sam-insurance.pdf', 'pending',  null),
  ('00000000-0000-4000-f000-000000000003', '00000000-0000-4000-b000-000000000011', 'drivers_license', '/docs/marcus-license.pdf','approved', 'Verified 2025')
on conflict (id) do nothing;

------------------------------------------------------------------ vehicles
insert into public.vehicles (id, name, type, capacity, luggage, base_rate, hourly_rate, features, description, image_url, is_active) values
  ('00000000-0000-4000-c000-000000000001', 'Luxury Sedan',       'sedan',     3,  2,  95, 75, array['Mercedes E-Class / Cadillac CT6','Leather interior','Bottled water','Phone chargers'], 'Refined executive sedan for airport transfers, corporate travel, and private city rides.', '/vehicles/sedan.jpg',    true),
  ('00000000-0000-4000-c000-000000000002', 'Business Class',     'business',  3,  3, 130, 95, array['Mercedes S-Class','Extra legroom','Privacy partition','Onboard Wi-Fi'],                  'First-class comfort for executives and VIP airport coordination.',                         '/vehicles/business.jpg', true),
  ('00000000-0000-4000-c000-000000000003', 'Luxury SUV',         'suv',       6,  5, 145,110, array['Cadillac Escalade / GMC Yukon','Seats up to 6','Ample luggage','Winter-ready'],        'Spacious luxury SUV for family transfers, group travel, and extra luggage capacity.',       '/vehicles/suv.jpg',      true),
  ('00000000-0000-4000-c000-000000000004', 'Stretch Limousine',  'limousine', 8,  4, 260,180, array['Lincoln Stretch','Mood lighting','Premium sound','Champagne service'],                  'Elegant stretch limousine — the ultimate statement for weddings and special events.',       '/vehicles/limo.jpg',     true),
  ('00000000-0000-4000-c000-000000000005', 'Executive Sprinter', 'party_bus',14, 10, 320,220, array['Mercedes-Benz Sprinter','Standing room','Group transport','Event-ready'],               'Corporate shuttle and group transport for airport groups and private event transfers.',     '/vehicles/sprinter.jpg', true)
on conflict (id) do nothing;

------------------------------------------------------------------ bookings
insert into public.bookings
  (id, reference, customer_id, driver_id, vehicle_id, trip_type, pickup_location, dropoff_location, pickup_datetime, duration_hours, flight_number, passenger_count, luggage_count, fare_estimate, passenger_name, passenger_phone, special_requests, status, payment_status, stripe_payment_id)
values
  ('00000000-0000-4000-d000-000000000001', 'SR-7F3A2K', '00000000-0000-4000-a000-000000000002', null,                                   '00000000-0000-4000-c000-000000000001', 'one_way', '100 Front St W, Toronto',            'Toronto Pearson (YYZ)',           '2026-07-02T13:30:00Z', null, null, 1, 2,  95, 'Jordan Avery', '+1 (416) 555-0123', 'Meet at the lobby.',                'pending',         'pending',  null),
  ('00000000-0000-4000-d000-000000000002', 'SR-K92BX1', '00000000-0000-4000-a000-000000000003', null,                                   '00000000-0000-4000-c000-000000000002', 'airport', 'Toronto Pearson (YYZ), Terminal 1', 'Ritz-Carlton, 181 Wellington St W','2026-07-03T22:15:00Z', null, 'AC 118', 2, 3, 145, 'Priya Nair',   '+1 (647) 555-0456', 'Flight from Vancouver — track.',    'confirmed',       'pending',  null),
  ('00000000-0000-4000-d000-000000000003', 'SR-M5QD7P', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000011', '00000000-0000-4000-c000-000000000003', 'hourly',  'King West, Toronto',                'As directed (hourly)',            '2026-07-05T15:00:00Z', 4,    null, 4, 2, 440, 'Jordan Avery', '+1 (416) 555-0123', 'Multi-stop: showroom visits.',      'driver_assigned', 'pending',  null),
  ('00000000-0000-4000-d000-000000000004', 'SR-T1W8RC', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-b000-000000000012', '00000000-0000-4000-c000-000000000004', 'one_way', 'Casa Loma, 1 Austin Terrace',       'The Carlu, 444 Yonge St',         '2026-06-20T20:00:00Z', null, null, 6, 0, 260, 'Priya Nair',   '+1 (647) 555-0456', 'Wedding party.',                    'completed',       'paid',     'pi_mock_3a91'),
  ('00000000-0000-4000-d000-000000000005', 'SR-Z0H4VN', '00000000-0000-4000-a000-000000000002', null,                                   '00000000-0000-4000-c000-000000000001', 'one_way', 'Union Station, Toronto',            'Mississauga, ON',                 '2026-06-25T12:00:00Z', null, null, 1, 1,  95, 'Jordan Avery', '+1 (416) 555-0123', null,                                'cancelled',       'refunded', null)
on conflict (id) do nothing;

------------------------------------------------------------------ payments
insert into public.payments (id, booking_id, amount, currency, status, stripe_id) values
  ('00000000-0000-4000-a100-000000000001', '00000000-0000-4000-d000-000000000004', 260, 'CAD', 'paid',     'pi_mock_3a91'),
  ('00000000-0000-4000-a100-000000000002', '00000000-0000-4000-d000-000000000005',  95, 'CAD', 'refunded', 'pi_mock_8b22')
on conflict (id) do nothing;
