alter table public.profiles add column if not exists onboarding_status text not null default 'pending_booking';
alter table public.profiles add column if not exists onboarding_scheduled_at timestamptz;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists onboarding_booking_uid text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_onboarding_status_check') then
    alter table public.profiles add constraint profiles_onboarding_status_check
      check (onboarding_status in ('pending_booking', 'scheduled', 'completed'));
  end if;
end;
$$;

create index if not exists profiles_onboarding_schedule_idx
  on public.profiles(onboarding_status, onboarding_scheduled_at);

-- Administradores e usuários que já utilizavam o estoque não perdem o acesso.
update public.profiles profile
set onboarding_status = 'completed',
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
where profile.is_admin
   or exists (select 1 from public.products product where product.user_id = profile.id);

drop function if exists public.schedule_onboarding(timestamptz);

create or replace function public.schedule_onboarding(p_scheduled_at timestamptz, p_booking_uid text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_schedule timestamp;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para agendar.'; end if;
  if public.is_admin(auth.uid()) then raise exception 'Contas administrativas não precisam de onboarding.'; end if;
  if p_booking_uid is not null and length(p_booking_uid) > 200 then raise exception 'Identificador de reserva inválido.'; end if;
  if p_scheduled_at < now() + interval '2 hours' or p_scheduled_at > now() + interval '45 days' then
    raise exception 'Escolha um horário disponível nos próximos 45 dias.';
  end if;

  local_schedule := p_scheduled_at at time zone 'America/Sao_Paulo';
  if extract(isodow from local_schedule) not between 1 and 5
     or local_schedule::time < time '09:00'
     or local_schedule::time > time '17:00' then
    raise exception 'Escolha um horário comercial de segunda a sexta.';
  end if;

  update public.profiles
  set onboarding_status = 'scheduled',
      onboarding_scheduled_at = p_scheduled_at,
      onboarding_booking_uid = p_booking_uid,
      onboarding_completed_at = null
  where id = auth.uid() and onboarding_status <> 'completed';
end;
$$;

revoke all on function public.schedule_onboarding(timestamptz, text) from public;
grant execute on function public.schedule_onboarding(timestamptz, text) to authenticated;

create or replace function public.admin_complete_onboarding(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso administrativo necessário.'; end if;
  if p_user_id is null or public.is_admin(p_user_id) then raise exception 'Usuário inválido.'; end if;

  update public.profiles
  set onboarding_status = 'completed',
      onboarding_completed_at = now(),
      trial_started_at = case when subscription_status = 'trialing' then now() else trial_started_at end,
      trial_ends_at = case when subscription_status = 'trialing' then now() + interval '7 days' else trial_ends_at end
  where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado.'; end if;
end;
$$;

revoke all on function public.admin_complete_onboarding(uuid) from public;
grant execute on function public.admin_complete_onboarding(uuid) to authenticated;

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
      and (
        is_admin
        or (
          onboarding_status = 'completed'
          and (subscription_status = 'active' or (subscription_status = 'trialing' and trial_ends_at > now()))
        )
      )
  );
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  question_steps jsonb;
  user_rows jsonb;
  started_count integer;
  completed_count integer;
  accounts_count integer;
  product_users_count integer;
  scheduled_onboardings_count integer;
  completed_onboardings_count integer;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso administrativo necessário.'; end if;

  select count(*)::integer into started_count from public.lead_funnel_sessions;
  select count(*)::integer into completed_count from public.leads;
  select count(*)::integer into accounts_count from public.profiles where not is_admin;
  select count(distinct products.user_id)::integer into product_users_count
  from public.products join public.profiles on profiles.id = products.user_id
  where not profiles.is_admin;
  select count(*)::integer into scheduled_onboardings_count
  from public.profiles where not is_admin and onboarding_scheduled_at is not null;
  select count(*)::integer into completed_onboardings_count
  from public.profiles where not is_admin and onboarding_status = 'completed';

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', question.key,
    'label', question.label,
    'count', (select count(*)::integer from public.lead_funnel_sessions where answered_keys @> array[question.key])
  ) order by question.position), '[]'::jsonb)
  into question_steps
  from (values
    (1, 'operation_type', 'Tipo de operação'),
    (2, 'sales_channels', 'Canais de venda'),
    (3, 'units_count', 'Número de unidades'),
    (4, 'sku_count', 'Itens no estoque'),
    (5, 'inventory_method', 'Controle atual'),
    (6, 'main_challenge', 'Maior desafio'),
    (7, 'full_name', 'Nome'),
    (8, 'business_name', 'Estabelecimento'),
    (9, 'email', 'E-mail'),
    (10, 'contact_consent', 'Consentimento LGPD')
  ) as question(position, key, label);

  select coalesce(jsonb_agg(to_jsonb(user_row) order by user_row.last_seen_at desc), '[]'::jsonb)
  into user_rows
  from (
    select
      profiles.id,
      coalesce(users.email, '') as email,
      profiles.full_name,
      profiles.business_name,
      profiles.subscription_status,
      profiles.created_at,
      profiles.last_seen_at,
      profiles.onboarding_status,
      profiles.onboarding_scheduled_at,
      profiles.onboarding_completed_at,
      profiles.onboarding_booking_uid,
      (select count(*)::integer from public.products where products.user_id = profiles.id) as products_count,
      (select count(*)::integer from public.stock_movements where stock_movements.user_id = profiles.id) as movements_count
    from public.profiles profiles
    join auth.users users on users.id = profiles.id
    where not profiles.is_admin
  ) user_row;

  return jsonb_build_object(
    'started', started_count,
    'completed_leads', completed_count,
    'accounts_created', accounts_count,
    'product_users', product_users_count,
    'scheduled_onboardings', scheduled_onboardings_count,
    'completed_onboardings', completed_onboardings_count,
    'question_steps', question_steps,
    'users', user_rows
  );
end;
$$;

create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  user_json jsonb;
  lead_json jsonb;
  products_json jsonb;
  movements_json jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso administrativo necessário.'; end if;

  select jsonb_build_object(
    'id', profiles.id,
    'email', coalesce(users.email, ''),
    'full_name', profiles.full_name,
    'business_name', profiles.business_name,
    'subscription_status', profiles.subscription_status,
    'created_at', profiles.created_at,
    'last_seen_at', profiles.last_seen_at,
    'onboarding_status', profiles.onboarding_status,
    'onboarding_scheduled_at', profiles.onboarding_scheduled_at,
    'onboarding_completed_at', profiles.onboarding_completed_at,
    'onboarding_booking_uid', profiles.onboarding_booking_uid,
    'products_count', (select count(*)::integer from public.products where user_id = profiles.id),
    'movements_count', (select count(*)::integer from public.stock_movements where user_id = profiles.id)
  ) into user_json
  from public.profiles profiles join auth.users users on users.id = profiles.id
  where profiles.id = p_user_id and not profiles.is_admin;

  if user_json is null then raise exception 'Usuário não encontrado.'; end if;

  select to_jsonb(lead_row) into lead_json from (
    select * from public.leads where linked_user_id = p_user_id order by created_at desc limit 1
  ) lead_row;

  select coalesce(jsonb_agg(to_jsonb(product_row) order by product_row.created_at desc), '[]'::jsonb)
  into products_json from (select * from public.products where user_id = p_user_id) product_row;

  select coalesce(jsonb_agg(to_jsonb(movement_row) || jsonb_build_object('product', jsonb_build_object('name', movement_row.product_name, 'unit', movement_row.product_unit)) order by movement_row.created_at desc), '[]'::jsonb)
  into movements_json from (
    select movements.*, products.name as product_name, products.unit as product_unit
    from public.stock_movements movements
    join public.products products on products.id = movements.product_id
    where movements.user_id = p_user_id
    order by movements.created_at desc
    limit 100
  ) movement_row;

  return jsonb_build_object('user', user_json, 'lead', lead_json, 'products', products_json, 'movements', movements_json);
end;
$$;

comment on function public.schedule_onboarding(timestamptz, text) is 'Registra no perfil a reserva criada pelo usuário no Cal.com.';
comment on function public.admin_complete_onboarding(uuid) is 'Libera o acesso à ferramenta após o onboarding, somente por administradores.';
