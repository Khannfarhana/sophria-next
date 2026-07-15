-- Correct the driver's fare share (16 Jul 2026).
--
-- `drivers.commission_rate` is, per 20260711120000, "the fraction of the fare
-- PAID TO THE DRIVER" — not the platform's cut. 20260711140000 then set it to
-- 0.20 under the heading "a driver's default share of the fare is 20%" and
-- backfilled every existing driver from 0.80 down to 0.20. Read literally that
-- pays a chauffeur $19 of a $95 sedan fare and keeps $76 — no chauffeur network
-- operates on those terms, and it is the opposite of the stated business model.
-- It is a misreading of "commission 20%" (the platform's cut) against a column
-- that stores the driver's share.
--
-- Client direction (14 Jul): GetTransfer "takes away 33% ... we can charge 25%".
-- Platform charges 25% => the driver's share is 0.75.
--
-- The column keeps its (misleading) name here to avoid breaking the generated
-- types and the live schema in the same change; the admin UI label is what
-- actually caused the misreading and is corrected alongside this migration.
-- Renaming it to driver_payout_rate is a worthwhile follow-up.

alter table public.drivers
  alter column commission_rate set default 0.75;

comment on column public.drivers.commission_rate is
  'Fraction of the PRE-TAX fare paid to the driver (0-1). Default 0.75 = the '
  'platform charges a 25% commission. This is the driver''s share, NOT the '
  'platform cut - setting it to 0.25 pays the driver 25% and keeps 75%.';

-- Move drivers sitting on the erroneous 0.20, and the 0.80 from the original
-- migration in case any row predates the 11 Jul backfill. Rates an admin
-- genuinely customised to some other value are left alone.
update public.drivers
set commission_rate = 0.75
where commission_rate in (0.20, 0.80);

-- Re-snapshot payouts for rides that have not happened yet, at the corrected
-- rate. Completed/cancelled/rejected bookings keep their historical figures:
-- those drivers were already paid out against the old snapshot, and rewriting
-- settled money would desync the earnings ledger.
update public.bookings b
set driver_payout = round((b.fare_estimate * d.commission_rate)::numeric, 2)
from public.drivers d
where b.driver_id = d.id
  and b.status in ('driver_assigned', 'accepted', 'in_progress');
