alter table public.lead_funnel_sessions
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists excluded_from_analytics boolean not null default false;

-- Versões antigas podiam concluir um lead sem criar a sessão de funil. Gera a
-- sessão correspondente para que todos os diagnósticos históricos sejam visíveis.
insert into public.lead_funnel_sessions (
  id, answered_keys, last_question, lead_id, answers, started_at, updated_at, completed_at
)
select
  leads.id,
  array['operation_type','units_count','inventory_method','main_challenge','sku_count','sales_channels','whatsapp','email','contact_consent'],
  9,
  leads.id,
  jsonb_strip_nulls(jsonb_build_object(
    'full_name', leads.full_name, 'email', leads.email, 'whatsapp', leads.whatsapp,
    'business_name', leads.business_name, 'city', leads.city, 'state', leads.state, 'role', leads.role,
    'operation_type', leads.operation_type, 'sales_channels', to_jsonb(leads.sales_channels),
    'units_count', leads.units_count, 'employees_count', leads.employees_count,
    'monthly_orders', leads.monthly_orders, 'sku_count', leads.sku_count,
    'inventory_method', leads.inventory_method, 'inventory_frequency', leads.inventory_frequency,
    'uses_erp', leads.uses_erp, 'estimated_loss', leads.estimated_loss, 'main_challenge', leads.main_challenge,
    'contact_consent', leads.contact_consent, 'marketing_consent', leads.marketing_consent,
    'privacy_policy_version', leads.privacy_policy_version
  )),
  leads.created_at,
  leads.created_at,
  leads.created_at
from public.leads leads
where not exists (
  select 1 from public.lead_funnel_sessions sessions where sessions.lead_id = leads.id
)
on conflict (id) do nothing;

create or replace function public.start_diagnostic_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null then raise exception 'Sessão inválida.'; end if;

  insert into public.lead_funnel_sessions (id)
  values (p_session_id)
  on conflict (id) do update set updated_at = now();
end;
$$;

revoke all on function public.start_diagnostic_session(uuid) from public;
grant execute on function public.start_diagnostic_session(uuid) to anon, authenticated;

create or replace function public.save_diagnostic_progress(
  p_session_id uuid,
  p_question smallint,
  p_question_key text,
  p_answers jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_answers jsonb;
begin
  if p_session_id is null or p_question < 1 or p_question > 9 then
    raise exception 'Etapa de diagnóstico inválida.';
  end if;
  if p_question_key not in ('operation_type','units_count','inventory_method','main_challenge','sku_count','sales_channels','whatsapp','email','contact_consent') then
    raise exception 'Pergunta de diagnóstico inválida.';
  end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'Respostas inválidas.';
  end if;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into safe_answers
  from jsonb_each(coalesce(p_answers, '{}'::jsonb)) item
  where item.key = any(array[
    'full_name','email','whatsapp','business_name','city','state','role','operation_type',
    'sales_channels','units_count','employees_count','monthly_orders','sku_count',
    'inventory_method','inventory_frequency','uses_erp','estimated_loss','main_challenge',
    'contact_consent','marketing_consent','privacy_policy_version'
  ]::text[]);

  if octet_length(safe_answers::text) > 8000 then
    raise exception 'Respostas excedem o limite permitido.';
  end if;

  insert into public.lead_funnel_sessions (id, answered_keys, last_question, answers)
  values (p_session_id, array[p_question_key], p_question, safe_answers)
  on conflict (id) do update set
    answered_keys = case
      when p_question_key = any(public.lead_funnel_sessions.answered_keys) then public.lead_funnel_sessions.answered_keys
      else array_append(public.lead_funnel_sessions.answered_keys, p_question_key)
    end,
    last_question = greatest(public.lead_funnel_sessions.last_question, p_question),
    answers = public.lead_funnel_sessions.answers || excluded.answers,
    updated_at = now();
end;
$$;

revoke all on function public.save_diagnostic_progress(uuid, smallint, text, jsonb) from public;
grant execute on function public.save_diagnostic_progress(uuid, smallint, text, jsonb) to anon, authenticated;

create or replace function public.admin_set_diagnostic_analytics_exclusion(
  p_session_id uuid,
  p_excluded boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso administrativo necessário.'; end if;
  if p_session_id is null then raise exception 'Diagnóstico inválido.'; end if;

  update public.lead_funnel_sessions
  set excluded_from_analytics = coalesce(p_excluded, false), updated_at = now()
  where id = p_session_id;

  if not found then raise exception 'Diagnóstico não encontrado.'; end if;
end;
$$;

revoke all on function public.admin_set_diagnostic_analytics_exclusion(uuid, boolean) from public;
grant execute on function public.admin_set_diagnostic_analytics_exclusion(uuid, boolean) to authenticated;

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
  diagnostic_rows jsonb;
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
  where not sessions.excluded_from_analytics
    and coalesce(profiles.excluded_from_analytics, false) = false;

  select count(*)::integer into completed_count
  from public.leads leads
  left join public.lead_funnel_sessions sessions on sessions.lead_id = leads.id
  left join public.profiles profiles on profiles.id = leads.linked_user_id
  where coalesce(sessions.excluded_from_analytics, false) = false
    and coalesce(profiles.excluded_from_analytics, false) = false;

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
    and coalesce(sessions.excluded_from_analytics, false) = false
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
        and not sessions.excluded_from_analytics
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sessions.id,
    'answered_keys', sessions.answered_keys,
    'last_question', sessions.last_question,
    'started_at', sessions.started_at,
    'updated_at', sessions.updated_at,
    'completed_at', sessions.completed_at,
    'lead_id', sessions.lead_id,
    'linked_user_id', leads.linked_user_id,
    'excluded_from_analytics', sessions.excluded_from_analytics,
    'answers', sessions.answers || coalesce(jsonb_strip_nulls(jsonb_build_object(
      'full_name', leads.full_name,
      'email', leads.email,
      'whatsapp', leads.whatsapp,
      'business_name', leads.business_name,
      'city', leads.city,
      'state', leads.state,
      'role', leads.role,
      'operation_type', leads.operation_type,
      'sales_channels', to_jsonb(leads.sales_channels),
      'units_count', leads.units_count,
      'employees_count', leads.employees_count,
      'monthly_orders', leads.monthly_orders,
      'sku_count', leads.sku_count,
      'inventory_method', leads.inventory_method,
      'inventory_frequency', leads.inventory_frequency,
      'uses_erp', leads.uses_erp,
      'estimated_loss', leads.estimated_loss,
      'main_challenge', leads.main_challenge,
      'contact_consent', leads.contact_consent,
      'marketing_consent', leads.marketing_consent,
      'privacy_policy_version', leads.privacy_policy_version
    )), '{}'::jsonb),
    'source', visits.source,
    'medium', visits.medium,
    'campaign', visits.campaign,
    'adset', visits.adset,
    'ad', visits.ad,
    'meta_attributed', coalesce(visits.meta_attributed, false)
  ) order by sessions.updated_at desc), '[]'::jsonb)
  into diagnostic_rows
  from public.lead_funnel_sessions sessions
  left join public.leads leads on leads.id = sessions.lead_id
  left join public.ad_landing_visits visits on visits.session_id = sessions.id;

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
    'diagnostic_sessions', diagnostic_rows,
    'users', user_rows
  );
end;
$$;

revoke all on function public.admin_overview() from public;
grant execute on function public.admin_overview() to authenticated;

comment on column public.lead_funnel_sessions.answers is 'Respostas confirmadas em cada etapa, inclusive de diagnósticos não concluídos.';
comment on column public.lead_funnel_sessions.excluded_from_analytics is 'Remove sessões de teste dos indicadores sem apagar o registro.';
