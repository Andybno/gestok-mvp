alter table public.profiles
  add column if not exists excluded_from_analytics boolean not null default false;

create table if not exists public.ad_campaign_metrics (
  campaign_key text primary key,
  reach integer not null default 0 check (reach >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  link_clicks integer not null default 0 check (link_clicks >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.ad_landing_visits (
  session_id uuid primary key,
  source text,
  medium text,
  campaign text,
  adset text,
  ad text,
  meta_attributed boolean not null default false,
  visit_count integer not null default 1 check (visit_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists ad_landing_visits_meta_idx
  on public.ad_landing_visits(meta_attributed, first_seen_at desc);

alter table public.ad_campaign_metrics enable row level security;
alter table public.ad_landing_visits enable row level security;

create or replace function public.track_ad_landing_visit(
  p_session_id uuid,
  p_source text default null,
  p_medium text default null,
  p_campaign text default null,
  p_adset text default null,
  p_ad text default null,
  p_meta_attributed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null then raise exception 'Sessão inválida.'; end if;

  insert into public.ad_landing_visits (
    session_id, source, medium, campaign, adset, ad, meta_attributed
  ) values (
    p_session_id,
    left(nullif(trim(p_source), ''), 120),
    left(nullif(trim(p_medium), ''), 120),
    left(nullif(trim(p_campaign), ''), 200),
    left(nullif(trim(p_adset), ''), 200),
    left(nullif(trim(p_ad), ''), 200),
    p_meta_attributed
  )
  on conflict (session_id) do update set
    source = coalesce(excluded.source, public.ad_landing_visits.source),
    medium = coalesce(excluded.medium, public.ad_landing_visits.medium),
    campaign = coalesce(excluded.campaign, public.ad_landing_visits.campaign),
    adset = coalesce(excluded.adset, public.ad_landing_visits.adset),
    ad = coalesce(excluded.ad, public.ad_landing_visits.ad),
    meta_attributed = public.ad_landing_visits.meta_attributed or excluded.meta_attributed,
    visit_count = public.ad_landing_visits.visit_count + 1,
    last_seen_at = now();
end;
$$;

revoke all on function public.track_ad_landing_visit(uuid, text, text, text, text, text, boolean) from public;
grant execute on function public.track_ad_landing_visit(uuid, text, text, text, text, text, boolean) to anon, authenticated;

create or replace function public.admin_set_user_analytics_exclusion(
  p_user_id uuid,
  p_excluded boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso administrativo necessário.'; end if;
  if p_user_id is null or public.is_admin(p_user_id) then raise exception 'Usuário inválido.'; end if;

  update public.profiles
  set excluded_from_analytics = coalesce(p_excluded, false)
  where id = p_user_id and not is_admin;

  if not found then raise exception 'Usuário não encontrado.'; end if;
end;
$$;

revoke all on function public.admin_set_user_analytics_exclusion(uuid, boolean) from public;
grant execute on function public.admin_set_user_analytics_exclusion(uuid, boolean) to authenticated;

create or replace function public.admin_set_ad_campaign_metrics(
  p_reach integer,
  p_impressions integer,
  p_link_clicks integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso administrativo necessário.'; end if;
  if p_reach < 0 or p_impressions < 0 or p_link_clicks < 0 then
    raise exception 'As métricas não podem ser negativas.';
  end if;

  insert into public.ad_campaign_metrics (
    campaign_key, reach, impressions, link_clicks, updated_at, updated_by
  ) values (
    'gestok-diagnostico', p_reach, p_impressions, p_link_clicks, now(), auth.uid()
  )
  on conflict (campaign_key) do update set
    reach = excluded.reach,
    impressions = excluded.impressions,
    link_clicks = excluded.link_clicks,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

revoke all on function public.admin_set_ad_campaign_metrics(integer, integer, integer) from public;
grant execute on function public.admin_set_ad_campaign_metrics(integer, integer, integer) to authenticated;

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
  ad_metrics_json jsonb;
  started_count integer;
  completed_count integer;
  accounts_count integer;
  product_users_count integer;
  scheduled_onboardings_count integer;
  completed_onboardings_count integer;
  site_visits_count integer;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso administrativo necessário.'; end if;

  select count(*)::integer into started_count
  from public.lead_funnel_sessions sessions
  left join public.leads leads on leads.id = sessions.lead_id
  left join public.profiles profiles on profiles.id = leads.linked_user_id
  where coalesce(profiles.excluded_from_analytics, false) = false;

  select count(*)::integer into completed_count
  from public.leads leads
  left join public.profiles profiles on profiles.id = leads.linked_user_id
  where coalesce(profiles.excluded_from_analytics, false) = false;

  select count(*)::integer into accounts_count
  from public.profiles
  where not is_admin and not excluded_from_analytics;

  select count(distinct products.user_id)::integer into product_users_count
  from public.products products
  join public.profiles profiles on profiles.id = products.user_id
  where not profiles.is_admin and not profiles.excluded_from_analytics;

  select count(*)::integer into scheduled_onboardings_count
  from public.profiles
  where not is_admin and not excluded_from_analytics and onboarding_scheduled_at is not null;

  select count(*)::integer into completed_onboardings_count
  from public.profiles
  where not is_admin and not excluded_from_analytics and onboarding_status = 'completed';

  select count(*)::integer into site_visits_count
  from public.ad_landing_visits visits
  left join public.lead_funnel_sessions sessions on sessions.id = visits.session_id
  left join public.leads leads on leads.id = sessions.lead_id
  left join public.profiles profiles on profiles.id = leads.linked_user_id
  where visits.meta_attributed
    and coalesce(profiles.excluded_from_analytics, false) = false;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', question.key,
    'label', question.label,
    'count', (
      select count(*)::integer
      from public.lead_funnel_sessions sessions
      left join public.leads leads on leads.id = sessions.lead_id
      left join public.profiles profiles on profiles.id = leads.linked_user_id
      where sessions.answered_keys @> array[question.key]
        and coalesce(profiles.excluded_from_analytics, false) = false
    )
  ) order by question.position), '[]'::jsonb)
  into question_steps
  from (values
    (1, 'operation_type', 'Tipo de operação'),
    (2, 'units_count', 'Tamanho da equipe'),
    (3, 'inventory_method', 'Controle atual'),
    (4, 'main_challenge', 'Principal problema'),
    (5, 'sku_count', 'Frequência do inventário'),
    (6, 'sales_channels', 'Canal de contato'),
    (7, 'whatsapp', 'Período da demonstração'),
    (8, 'email', 'Telefone'),
    (9, 'contact_consent', 'E-mail e consentimento LGPD')
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
      profiles.excluded_from_analytics,
      (select count(*)::integer from public.products where products.user_id = profiles.id) as products_count,
      (select count(*)::integer from public.stock_movements where stock_movements.user_id = profiles.id) as movements_count
    from public.profiles profiles
    join auth.users users on users.id = profiles.id
    where not profiles.is_admin
  ) user_row;

  select jsonb_build_object(
    'reach', coalesce((select reach from public.ad_campaign_metrics where campaign_key = 'gestok-diagnostico'), 0),
    'impressions', coalesce((select impressions from public.ad_campaign_metrics where campaign_key = 'gestok-diagnostico'), 0),
    'link_clicks', coalesce((select link_clicks from public.ad_campaign_metrics where campaign_key = 'gestok-diagnostico'), 0),
    'site_visits', site_visits_count,
    'updated_at', (select updated_at from public.ad_campaign_metrics where campaign_key = 'gestok-diagnostico')
  ) into ad_metrics_json;

  return jsonb_build_object(
    'started', started_count,
    'completed_leads', completed_count,
    'accounts_created', accounts_count,
    'product_users', product_users_count,
    'scheduled_onboardings', scheduled_onboardings_count,
    'completed_onboardings', completed_onboardings_count,
    'question_steps', question_steps,
    'ad_metrics', ad_metrics_json,
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
    'onboarding_status', profiles.onboarding_status,
    'onboarding_scheduled_at', profiles.onboarding_scheduled_at,
    'onboarding_completed_at', profiles.onboarding_completed_at,
    'onboarding_booking_uid', profiles.onboarding_booking_uid,
    'excluded_from_analytics', profiles.excluded_from_analytics,
    'products_count', (select count(*)::integer from public.products where user_id = profiles.id),
    'movements_count', (select count(*)::integer from public.stock_movements where user_id = profiles.id)
  ) into user_json
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where profiles.id = p_user_id and not profiles.is_admin;

  if user_json is null then raise exception 'Usuário não encontrado.'; end if;

  select to_jsonb(lead_row) into lead_json from (
    select * from public.leads where linked_user_id = p_user_id order by created_at desc limit 1
  ) lead_row;

  select coalesce(jsonb_agg(to_jsonb(product_row) order by product_row.created_at desc), '[]'::jsonb)
  into products_json from (select * from public.products where user_id = p_user_id) product_row;

  select coalesce(jsonb_agg(
    to_jsonb(movement_row) || jsonb_build_object(
      'product', jsonb_build_object('name', movement_row.product_name, 'unit', movement_row.product_unit)
    ) order by movement_row.created_at desc
  ), '[]'::jsonb)
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

comment on column public.profiles.excluded_from_analytics is 'Remove contas de teste dos totais sem apagar seus dados.';
comment on table public.ad_landing_visits is 'Visitas anônimas agregáveis, sem armazenar fbclid ou dados pessoais.';
comment on table public.ad_campaign_metrics is 'Números oficiais copiados do Gerenciador de Anúncios até a integração com a Marketing API.';
