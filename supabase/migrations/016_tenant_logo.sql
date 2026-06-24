-- Ajout logo_url sur tenants + politique Storage pour le bucket logos

alter table public.tenants
  add column if not exists logo_url text;

-- Politique Storage : un tenant ne peut lire/écrire que dans son propre dossier
-- Le path attendu : logos/{tenant_id}/logo.{ext}

create policy "tenant upload own logo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (
      select tenant_id::text from public.users where id = auth.uid()
    )
  );

create policy "tenant update own logo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (
      select tenant_id::text from public.users where id = auth.uid()
    )
  );

create policy "tenant read own logo"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (
      select tenant_id::text from public.users where id = auth.uid()
    )
  );
