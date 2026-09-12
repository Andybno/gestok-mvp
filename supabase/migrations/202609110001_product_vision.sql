-- Foto do produto e ficha visual usadas pela contagem por foto para reconhecer
-- os itens do catálogo de cada cliente.
alter table public.products add column if not exists photo_path text;
alter table public.products add column if not exists visual_signature jsonb;
alter table public.products add column if not exists signature_model text;
alter table public.products add column if not exists signature_updated_at timestamptz;

-- Marca quando uma contagem foi efetivamente aplicada ao estoque.
alter table public.inventory_scans add column if not exists applied_at timestamptz;

-- Acelera o carregamento do catálogo de referência na Edge Function.
create index if not exists products_user_signature_idx
  on public.products(user_id)
  where visual_signature is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Diferente de inventory-scans, a foto do produto permanece salva e é lida pelo
-- cliente por URL assinada, então esse bucket também precisa de policy de leitura.
drop policy if exists "users read own product photos" on storage.objects;
create policy "users read own product photos" on storage.objects
for select to authenticated
using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users upload own product photos" on storage.objects;
create policy "users upload own product photos" on storage.objects
for insert to authenticated
with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.has_app_access(auth.uid()));

drop policy if exists "users update own product photos" on storage.objects;
create policy "users update own product photos" on storage.objects
for update to authenticated
using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.has_app_access(auth.uid()))
with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.has_app_access(auth.uid()));

drop policy if exists "users delete own product photos" on storage.objects;
create policy "users delete own product photos" on storage.objects
for delete to authenticated
using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);

comment on column public.products.visual_signature is 'Ficha visual em JSON gerada pela IA a partir da foto, usada para reconhecer o produto na contagem.';
comment on column public.inventory_scans.applied_at is 'Momento em que o usuário confirmou a contagem e ela virou movimentações de ajuste.';

-- inventory_scans só tem policy de leitura para o cliente, então a marcação de
-- "contagem aplicada" passa por uma função controlada.
create or replace function public.mark_scan_applied(p_scan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  update public.inventory_scans
  set applied_at = now()
  where id = p_scan_id and user_id = auth.uid() and applied_at is null;
end;
$$;

revoke all on function public.mark_scan_applied(uuid) from public;
grant execute on function public.mark_scan_applied(uuid) to authenticated;

comment on function public.mark_scan_applied(uuid) is 'Marca uma contagem por foto como já aplicada ao estoque.';
