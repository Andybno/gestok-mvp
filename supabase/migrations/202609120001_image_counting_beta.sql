-- Jornada beta de cadastro e contagem por imagem.
-- As imagens passam a ser mantidas no bucket privado para auditoria do piloto,
-- sempre mediante consentimento explícito na interface.

alter table public.profiles
  add column if not exists first_use_completed_at timestamptz;

alter table public.products
  add column if not exists reference_image_path text,
  add column if not exists reference_image_paths text[] not null default '{}',
  add column if not exists ai_identity_profile jsonb,
  add column if not exists ai_profile_scan_id uuid;

alter table public.inventory_scans
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists action text not null default 'inventory_count',
  add column if not exists image_path text,
  add column if not exists image_paths text[] not null default '{}',
  add column if not exists quality_response jsonb,
  add column if not exists ai_response jsonb,
  add column if not exists prompt_snapshot jsonb,
  add column if not exists image_review_consent boolean not null default false,
  add column if not exists accepted_quantity numeric(14,3),
  add column if not exists confirmed_at timestamptz,
  add column if not exists error_message text;

alter table public.inventory_scans drop constraint if exists inventory_scans_status_check;
alter table public.inventory_scans add constraint inventory_scans_status_check
  check (status in ('processing','completed','needs_new_photo','confirmed','failed'));

alter table public.inventory_scans drop constraint if exists inventory_scans_action_check;
alter table public.inventory_scans add constraint inventory_scans_action_check
  check (action in ('product_setup','inventory_count'));

-- Uma contagem real pode resultar em saldo zero. Entradas e saídas continuam positivas.
alter table public.stock_movements drop constraint if exists stock_movements_quantity_check;
alter table public.stock_movements add constraint stock_movements_quantity_check
  check ((type = 'adjustment' and quantity >= 0) or (type <> 'adjustment' and quantity > 0));

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
  if p_quantity < 0 or (p_type <> 'adjustment' and p_quantity = 0) then
    raise exception 'A quantidade informada é inválida.';
  end if;

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

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_ai_profile_scan_id_fkey') then
    alter table public.products add constraint products_ai_profile_scan_id_fkey
      foreign key (ai_profile_scan_id) references public.inventory_scans(id) on delete set null;
  end if;
end;
$$;

create index if not exists scans_product_created_idx
  on public.inventory_scans(product_id, created_at desc);

create table if not exists public.ai_prompt_configs (
  key text primary key check (key in ('product_photo_quality','product_profile','count_photo_quality','inventory_count')),
  label text not null,
  description text not null,
  prompt text not null check (char_length(prompt) between 40 and 8000),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.ai_prompt_configs (key, label, description, prompt)
values
  ('product_photo_quality', 'Qualidade das fotos do produto', 'Decide se o conjunto de 1 a 5 fotos permite criar uma referência visual confiável.', 'Avalie em conjunto de 1 a 5 fotos obrigatórias do mesmo produto. Aprove somente quando todas representarem o mesmo item e ao menos uma mostrar frente ou rótulo com nitidez, boa iluminação e enquadramento útil. Valorize ângulos complementares, como laterais, verso, tampa e detalhes. Reprove conjuntos incoerentes, escuros, desfocados, distantes ou muito encobertos. Explique o motivo em linguagem simples e dê uma orientação objetiva para refazer ou complementar as fotos.'),
  ('product_profile', 'Características visuais do produto', 'Consolida os diferentes ângulos no perfil visual usado nas contagens seguintes.', 'Consolide de 1 a 5 fotos do mesmo produto em um único perfil visual padronizado. Use os diferentes ângulos para registrar somente características realmente visíveis: marca legível, embalagem, cores predominantes, textos, símbolos, tampa, rótulo e marcadores que distingam o item de produtos parecidos. Sugira categoria e unidade de contagem. Não invente características encobertas ou ilegíveis. A orientação de contagem deve explicar o que representa uma unidade visível.'),
  ('count_photo_quality', 'Qualidade da foto de contagem', 'Verifica iluminação, enquadramento, obstáculos e visibilidade antes de contar.', 'Avalie se a imagem permite contar o produto selecionado com segurança. Considere iluminação, nitidez, distância, sobreposição, obstáculos, cortes nas bordas e se a área fotografada está completa. Aprove somente quando for possível localizar e distinguir unidades do produto. Quando reprovar, descreva a principal causa e indique exatamente como refazer a foto, por exemplo aproximar, iluminar ou fotografar uma prateleira por vez.'),
  ('inventory_count', 'Contagem do produto selecionado', 'Conta apenas o produto escolhido usando seu perfil cadastrado.', 'Conte exclusivamente o produto selecionado e use o perfil visual cadastrado como referência. Considere apenas unidades realmente visíveis e compatíveis com os marcadores do perfil. Não some produtos parecidos e não estime itens totalmente escondidos. Quando houver oclusão parcial, informe a incerteza e reduza a confiança. Explique brevemente quais evidências visuais sustentam a quantidade. O resultado sempre será revisado pelo usuário antes de alterar o estoque.')
on conflict (key) do nothing;

create table if not exists public.product_journey_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (char_length(event_name) between 2 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_journey_user_created_idx
  on public.product_journey_events(user_id, created_at desc);

alter table public.ai_prompt_configs enable row level security;
alter table public.product_journey_events enable row level security;

drop policy if exists "admins read ai prompts" on public.ai_prompt_configs;
create policy "admins read ai prompts" on public.ai_prompt_configs
for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "users create own journey events" on public.product_journey_events;
create policy "users create own journey events" on public.product_journey_events
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users read own journey events" on public.product_journey_events;
create policy "users read own journey events" on public.product_journey_events
for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "admins read inventory scans" on public.inventory_scans;
create policy "admins read inventory scans" on public.inventory_scans
for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "users and admins read inventory scan images" on storage.objects;
create policy "users and admins read inventory scan images" on storage.objects
for select to authenticated using (
  bucket_id = 'inventory-scans'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
);

grant select on public.ai_prompt_configs to authenticated;
grant select, insert on public.product_journey_events to authenticated;

create or replace function public.admin_update_ai_prompt(p_key text, p_prompt text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso administrativo necessário.'; end if;
  if p_key not in ('product_photo_quality','product_profile','count_photo_quality','inventory_count') then
    raise exception 'Etapa de prompt inválida.';
  end if;
  if char_length(trim(coalesce(p_prompt, ''))) < 40 or char_length(p_prompt) > 8000 then
    raise exception 'O prompt deve possuir entre 40 e 8000 caracteres.';
  end if;

  update public.ai_prompt_configs
  set prompt = trim(p_prompt), version = version + 1, updated_at = now(), updated_by = auth.uid()
  where key = p_key;
  if not found then raise exception 'Prompt não encontrado.'; end if;
end;
$$;

revoke all on function public.admin_update_ai_prompt(text, text) from public;
grant execute on function public.admin_update_ai_prompt(text, text) to authenticated;

create or replace function public.link_product_scan(p_scan_id uuid, p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_scan public.inventory_scans;
begin
  if auth.uid() is null or not public.has_app_access(auth.uid()) then
    raise exception 'Acesso à ferramenta necessário.';
  end if;
  select * into selected_scan from public.inventory_scans
  where id = p_scan_id and user_id = auth.uid() and action = 'product_setup';
  if not found then raise exception 'Análise do produto não encontrada.'; end if;
  if not exists (select 1 from public.products where id = p_product_id and user_id = auth.uid()) then
    raise exception 'Produto não encontrado.';
  end if;

  update public.inventory_scans set product_id = p_product_id where id = p_scan_id;
  update public.products
  set ai_profile_scan_id = p_scan_id,
      reference_image_path = coalesce(selected_scan.image_path, reference_image_path),
      reference_image_paths = case when cardinality(selected_scan.image_paths) > 0 then selected_scan.image_paths else reference_image_paths end,
      ai_identity_profile = coalesce(selected_scan.ai_response -> 'product_profile', ai_identity_profile)
  where id = p_product_id and user_id = auth.uid();
end;
$$;

revoke all on function public.link_product_scan(uuid, uuid) from public;
grant execute on function public.link_product_scan(uuid, uuid) to authenticated;

create or replace function public.confirm_inventory_scan(p_scan_id uuid, p_product_id uuid, p_quantity numeric)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_scan public.inventory_scans;
  movement public.stock_movements;
begin
  if p_quantity < 0 then raise exception 'A quantidade não pode ser negativa.'; end if;
  select * into selected_scan from public.inventory_scans
  where id = p_scan_id and user_id = auth.uid() and action = 'inventory_count'
    and status in ('completed','confirmed');
  if not found then raise exception 'Contagem por imagem não encontrada.'; end if;

  select public.register_stock_movement(
    p_product_id,
    'adjustment'::public.movement_type,
    p_quantity,
    'Contagem com IA',
    'Contagem revisada e confirmada pelo usuário'
  ) into movement;

  update public.inventory_scans
  set product_id = p_product_id, status = 'confirmed', accepted_quantity = p_quantity, confirmed_at = now()
  where id = p_scan_id;
  return movement;
end;
$$;

revoke all on function public.confirm_inventory_scan(uuid, uuid, numeric) from public;
grant execute on function public.confirm_inventory_scan(uuid, uuid, numeric) to authenticated;

create or replace function public.complete_first_use_experience()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sessão expirada.'; end if;
  if not exists (select 1 from public.products where user_id = auth.uid()) then
    raise exception 'Cadastre ao menos um produto antes de concluir.';
  end if;
  if not exists (select 1 from public.stock_movements where user_id = auth.uid()) then
    raise exception 'Faça a primeira contagem antes de concluir.';
  end if;
  update public.profiles set first_use_completed_at = coalesce(first_use_completed_at, now()) where id = auth.uid();
end;
$$;

revoke all on function public.complete_first_use_experience() from public;
grant execute on function public.complete_first_use_experience() to authenticated;

-- Quem já usava o estoque não deve ser enviado novamente para a introdução.
update public.profiles profile
set first_use_completed_at = coalesce(profile.first_use_completed_at, now())
where exists (select 1 from public.products product where product.user_id = profile.id);

comment on column public.profiles.first_use_completed_at is 'Conclusão da primeira jornada guiada de produto e contagem.';
comment on table public.ai_prompt_configs is 'Prompts editáveis usados nas etapas de visão computacional.';
comment on table public.product_journey_events is 'Telemetria funcional da primeira experiência e das contagens beta.';
