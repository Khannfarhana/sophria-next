-- Private storage bucket for driver onboarding uploads (photo + documents).
-- The RLS policies on storage.objects ("Drivers manage own documents",
-- "Admins manage all driver documents") already reference this bucket; it was
-- just never created. Private so licence/background docs aren't world-readable.

insert into storage.buckets (id, name, public)
values ('driver-documents', 'driver-documents', false)
on conflict (id) do nothing;
