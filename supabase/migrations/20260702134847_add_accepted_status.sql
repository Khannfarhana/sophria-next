-- New booking status: the assigned driver has explicitly accepted the ride.
-- Previously driver-accept reused 'confirmed', which visually downgraded the
-- customer's "Driver Assigned" badge and made an accepted ride
-- indistinguishable from an admin-confirmed unassigned one.
-- NOTE: ALTER TYPE ... ADD VALUE must not share a transaction with statements
-- that use the new value — keep this migration standalone.

alter type public.booking_status add value if not exists 'accepted';
