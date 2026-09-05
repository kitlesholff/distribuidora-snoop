-- Cria o bucket público usado pelas imagens do catálogo.
-- Execute após o arquivo 01-restringir-admin.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin envia imagens de produtos" on storage.objects;
drop policy if exists "admin consulta imagens de produtos" on storage.objects;
drop policy if exists "admin exclui imagens de produtos" on storage.objects;

create policy "admin envia imagens de produtos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.is_admin()
);

create policy "admin consulta imagens de produtos"
on storage.objects for select to authenticated
using (
  bucket_id = 'product-images'
  and public.is_admin()
);

create policy "admin exclui imagens de produtos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and public.is_admin()
);

