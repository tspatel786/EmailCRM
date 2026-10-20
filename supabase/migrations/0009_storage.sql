insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-documents',
  'org-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Path convention: {organization_id}/{document_id}/{filename}

create policy storage_org_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'org-documents'
    and public.is_org_member((split_part(name, '/', 1))::uuid)
  );

create policy storage_org_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-documents'
    and public.has_write_role((split_part(name, '/', 1))::uuid)
  );

create policy storage_org_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'org-documents'
    and public.has_admin_role((split_part(name, '/', 1))::uuid)
  );
