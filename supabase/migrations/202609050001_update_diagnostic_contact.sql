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
  if p_session_id is null or p_question < 1 or p_question > 9 then
    raise exception 'Etapa de funil inválida.';
  end if;
  if p_question_key not in ('operation_type','sales_channels','units_count','sku_count','inventory_method','main_challenge','whatsapp','email','contact_consent') then
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
    (7, 'whatsapp', 'Telefone'),
    (8, 'email', 'E-mail'),
    (9, 'contact_consent', 'Consentimento LGPD')
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

revoke all on function public.admin_overview() from public;
grant execute on function public.admin_overview() to authenticated;
