alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists last_seen_at timestamptz not null default now();

create table if not exists public.lead_funnel_sessions (
  id uuid primary key,
  answered_keys text[] not null default '{}',
  last_question smallint not null default 0 check (last_question between 0 and 10),
  lead_id uuid references public.leads(id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists lead_funnel_updated_idx on public.lead_funnel_sessions(updated_at desc);
create index if not exists profiles_last_seen_idx on public.profiles(last_seen_at desc);

alter table public.lead_funnel_sessions enable row level security;

create or replace function public.is_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = target_user), false);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

create or replace function public.track_lead_progress(
  p_session_id uuid,
  p_question smallint,
  p_question_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null or p_question < 1 or p_question > 10 then
    raise exception 'Etapa de funil inválida.';
  end if;
  if p_question_key not in ('operation_type','sales_channels','units_count','sku_count','inventory_method','main_challenge','full_name','business_name','email','contact_consent') then
    raise exception 'Pergunta de funil inválida.';
  end if;

  insert into public.lead_funnel_sessions (id, answered_keys, last_question)
  values (p_session_id, array[p_question_key], p_question)
  on conflict (id) do update set
    answered_keys = case
      when p_question_key = any(public.lead_funnel_sessions.answered_keys) then public.lead_funnel_sessions.answered_keys
      else array_append(public.lead_funnel_sessions.answered_keys, p_question_key)
    end,
    last_question = greatest(public.lead_funnel_sessions.last_question, p_question),
    updated_at = now();
end;
$$;

revoke all on function public.track_lead_progress(uuid, smallint, text) from public;
grant execute on function public.track_lead_progress(uuid, smallint, text) to anon, authenticated;

create or replace function public.complete_lead_funnel(p_session_id uuid, p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_funnel_sessions
  set lead_id = p_lead_id, completed_at = now(), updated_at = now()
  where id = p_session_id and exists (select 1 from public.leads where id = p_lead_id);
end;
$$;

revoke all on function public.complete_lead_funnel(uuid, uuid) from public;
grant execute on function public.complete_lead_funnel(uuid, uuid) to anon, authenticated;

create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    update public.profiles set last_seen_at = now() where id = auth.uid();
  end if;
end;
$$;

revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;

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
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso administrativo necessário.'; end if;

  select count(*)::integer into started_count from public.lead_funnel_sessions;
  select count(*)::integer into completed_count from public.leads;
  select count(*)::integer into accounts_count from public.profiles where not is_admin;
  select count(distinct products.user_id)::integer into product_users_count
  from public.products join public.profiles on profiles.id = products.user_id
  where not profiles.is_admin;

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
    'question_steps', question_steps,
    'users', user_rows
  );
end;
$$;

revoke all on function public.admin_overview() from public;
grant execute on function public.admin_overview() to authenticated;

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

revoke all on function public.admin_user_detail(uuid) from public;
grant execute on function public.admin_user_detail(uuid) to authenticated;

comment on table public.lead_funnel_sessions is 'Mede apenas as etapas respondidas; não armazena respostas ou dados pessoais antes do consentimento.';
