-- O diagnóstico público agora possui seis etapas. As respostas históricas das
-- perguntas removidas permanecem armazenadas, mas novas sessões só registram o
-- funil ativo: operação, equipe, controle, problema, telefone e consentimento.
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
  if p_session_id is null or p_question < 1 or p_question > 6 then
    raise exception 'Etapa de diagnóstico inválida.';
  end if;
  if p_question_key not in ('operation_type','units_count','inventory_method','main_challenge','email','contact_consent') then
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
