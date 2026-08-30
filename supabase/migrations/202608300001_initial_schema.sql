create extension if not exists pgcrypto;

create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
create type public.movement_type as enum ('entry', 'exit', 'adjustment');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  whatsapp text not null,
  business_name text not null,
  city text not null,
  state text not null,
  role text not null,
  operation_type text not null,
  sales_channels text[] not null default '{}',
  units_count text not null,
  employees_count text not null,
  monthly_orders text not null,
  sku_count text not null,
  inventory_method text not null,
  inventory_frequency text not null,
  uses_erp text not null,
  estimated_loss text not null,
  main_challenge text not null,
  contact_consent boolean not null check (contact_consent = true),
  contact_consent_at timestamptz not null,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  privacy_policy_version text not null,
  source text not null default 'landing_page',
  linked_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  business_name text not null default '',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  subscription_status public.subscription_status not null default 'trialing',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  subscription_current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  category text not null default '',
  sku text not null default '',
  unit text not null check (unit in ('un','kg','g','l','ml','cx','pct')),
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  type public.movement_type not null,
  quantity numeric(14,3) not null check (quantity > 0),
  previous_quantity numeric(14,3) not null,
  resulting_quantity numeric(14,3) not null check (resulting_quantity >= 0),
  reason text not null check (char_length(reason) between 1 and 100),
  notes text,
  created_at timestamptz not null default now()
);

create table public.inventory_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_filename text,
  items jsonb not null default '[]'::jsonb,
  model text,
  status text not null default 'completed' check (status in ('processing','completed','failed')),
  created_at timestamptz not null default now()
);

create table public.stripe_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index products_user_id_idx on public.products(user_id);
create unique index products_user_sku_unique_idx on public.products(user_id, sku) where sku <> '';
create index products_low_stock_idx on public.products(user_id, quantity, minimum_stock);
create index movements_user_created_idx on public.stock_movements(user_id, created_at desc);
create index scans_user_created_idx on public.inventory_scans(user_id, created_at desc);
create index leads_email_idx on public.leads(lower(email));

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.has_app_access(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = target_user
      and (subscription_status = 'active' or (subscription_status = 'trialing' and trial_ends_at > now()))
  );
$$;

revoke all on function public.has_app_access(uuid) from public;
grant execute on function public.has_app_access(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_text text;
begin
  insert into public.profiles (id, full_name, business_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'business_name', '')
  );

  lead_text := new.raw_user_meta_data ->> 'lead_id';
  if lead_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    update public.leads set linked_user_id = new.id
    where id = lead_text::uuid and lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.register_stock_movement(
  p_product_id uuid,
  p_type public.movement_type,
  p_quantity numeric,
  p_reason text,
  p_notes text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  current_product public.products;
  next_quantity numeric;
  movement public.stock_movements;
begin
  if auth.uid() is null or not public.has_app_access(auth.uid()) then
    raise exception 'Seu teste terminou. Ative a assinatura para continuar.';
  end if;
  if p_quantity <= 0 then raise exception 'A quantidade deve ser maior que zero.'; end if;

  select * into current_product from public.products
  where id = p_product_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Produto não encontrado.'; end if;

  next_quantity := case
    when p_type = 'entry' then current_product.quantity + p_quantity
    when p_type = 'exit' then current_product.quantity - p_quantity
    else p_quantity
  end;
  if next_quantity < 0 then raise exception 'A saída não pode superar o estoque atual.'; end if;

  update public.products set quantity = next_quantity where id = p_product_id;
  insert into public.stock_movements (user_id, product_id, type, quantity, previous_quantity, resulting_quantity, reason, notes)
  values (auth.uid(), p_product_id, p_type, p_quantity, current_product.quantity, next_quantity, p_reason, nullif(p_notes, ''))
  returning * into movement;
  return movement;
end;
$$;

revoke all on function public.register_stock_movement(uuid, public.movement_type, numeric, text, text) from public;
grant execute on function public.register_stock_movement(uuid, public.movement_type, numeric, text, text) to authenticated;

alter table public.leads enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.inventory_scans enable row level security;
alter table public.stripe_events enable row level security;

create policy "anonymous lead intake" on public.leads
for insert to anon, authenticated
with check (contact_consent = true and contact_consent_at is not null);

create policy "users read own profile" on public.profiles
for select to authenticated using (id = auth.uid());

create policy "users read own products" on public.products
for select to authenticated using (user_id = auth.uid());
create policy "users create products with access" on public.products
for insert to authenticated with check (user_id = auth.uid() and public.has_app_access(auth.uid()));
create policy "users update own products with access" on public.products
for update to authenticated using (user_id = auth.uid() and public.has_app_access(auth.uid()))
with check (user_id = auth.uid() and public.has_app_access(auth.uid()));
create policy "users delete own products with access" on public.products
for delete to authenticated using (user_id = auth.uid() and public.has_app_access(auth.uid()));

create policy "users read own movements" on public.stock_movements
for select to authenticated using (user_id = auth.uid());

create policy "users read own scans" on public.inventory_scans
for select to authenticated using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-scans', 'inventory-scans', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload own inventory images" on storage.objects
for insert to authenticated
with check (bucket_id = 'inventory-scans' and (storage.foldername(name))[1] = auth.uid()::text and public.has_app_access(auth.uid()));
create policy "users delete own inventory images" on storage.objects
for delete to authenticated
using (bucket_id = 'inventory-scans' and (storage.foldername(name))[1] = auth.uid()::text);

grant insert on public.leads to anon, authenticated;
grant select on public.profiles, public.products, public.stock_movements, public.inventory_scans to authenticated;
grant insert, update, delete on public.products to authenticated;

comment on table public.leads is 'Leads e trilha de consentimento LGPD; leitura apenas administrativa via service role.';
comment on table public.inventory_scans is 'Somente metadados e resultado; a imagem é removida após a análise.';
