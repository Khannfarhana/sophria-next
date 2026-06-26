
CREATE POLICY "Drivers manage own documents" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'driver-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'driver-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Admins view all driver documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'driver-documents' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage all driver documents" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'driver-documents' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'driver-documents' AND public.has_role(auth.uid(), 'admin'));
