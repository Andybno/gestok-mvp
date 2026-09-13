import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, safeError } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'

type PromptKey = 'product_photo_quality' | 'product_profile' | 'count_photo_quality' | 'inventory_count'
type GuidedAction = 'product_setup' | 'inventory_count'

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)))
  }
  return btoa(binary)
}

async function imageDataUrl(blob: Blob) {
  return `data:${blob.type || 'image/jpeg'};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`
}

async function hashIdentifier(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 64)
}

type VisionInput = {
  userId: string
  instructions: string
  content: unknown[]
  schemaName: string
  schema: Record<string, unknown>
}

async function askVision({ userId, instructions, content, schemaName, schema }: VisionInput) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.')
  const model = 'gpt-5.6-luna'
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      safety_identifier: await hashIdentifier(userId),
      instructions,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
    }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error?.message || 'A análise da imagem falhou.')
  const outputText = result.output
    ?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content || [])
    .filter((item: { type?: string; text?: string }) => item.type === 'output_text')
    .map((item: { text?: string }) => item.text || '')
    .join('')
  if (!outputText) throw new Error('A IA não retornou um resultado utilizável.')
  return { parsed: JSON.parse(outputText) as Record<string, unknown>, model }
}

async function requireAppAccess(admin: SupabaseClient, userId: string, message: string) {
  const { data: profile } = await admin.from('profiles')
    .select('is_admin,onboarding_status,subscription_status,trial_ends_at')
    .eq('id', userId).single()
  const hasAccess = Boolean(profile?.is_admin)
    || (profile?.onboarding_status === 'completed'
      && (profile?.subscription_status === 'active'
        || (profile?.subscription_status === 'trialing' && new Date(profile.trial_ends_at).getTime() > Date.now())))
  if (!hasAccess) throw new Error(message)
}

/** Teto de produtos enviados no prompt, para manter custo e latência previsíveis. */
const CATALOG_LIMIT = 120

const fallbackPrompts: Record<PromptKey, string> = {
  product_photo_quality: 'Avalie em conjunto de 1 a 5 fotos obrigatórias do mesmo produto. Aprove somente quando todas representarem o mesmo item e ao menos uma mostrar frente ou rótulo com nitidez, boa iluminação e enquadramento útil. Valorize ângulos complementares, como laterais, verso, tampa e detalhes. Reprove conjuntos incoerentes, escuros, desfocados, distantes ou muito encobertos. Explique o motivo e como refazer ou complementar as fotos.',
  product_profile: 'Consolide de 1 a 5 fotos do mesmo produto em um único perfil visual padronizado. Use os diferentes ângulos para registrar somente características realmente visíveis: marca legível, embalagem, cores, textos, símbolos, tampa e marcadores distintivos. Sugira categoria e unidade. Não invente informações encobertas e não confunda produtos parecidos.',
  count_photo_quality: 'Avalie se a foto permite contar o produto selecionado. Considere iluminação, nitidez, distância, sobreposição, obstáculos, cortes e área completa. Reprove quando unidades não puderem ser distinguidas e explique objetivamente como refazer.',
  inventory_count: 'Conte exclusivamente o produto selecionado usando seu perfil visual. Considere apenas unidades realmente visíveis, não some itens parecidos e não estime produtos totalmente escondidos. Informe incertezas, confiança e evidências visuais. O usuário revisará o resultado.',
}

const QUALITY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['acceptable', 'score', 'reason', 'guidance'],
  properties: {
    acceptable: { type: 'boolean' }, score: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' }, guidance: { type: 'string' },
  },
}

const PRODUCT_PROFILE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['category', 'suggested_unit', 'brand', 'packaging', 'colors', 'visual_markers', 'counting_guidance'],
  properties: {
    category: { type: 'string' },
    suggested_unit: { type: 'string', enum: ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct'] },
    brand: { type: 'string' }, packaging: { type: 'string' },
    colors: { type: 'array', items: { type: 'string' } },
    visual_markers: { type: 'array', items: { type: 'string' } },
    counting_guidance: { type: 'string' },
  },
}

const GUIDED_COUNT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['estimated_quantity', 'unit', 'confidence', 'note', 'visual_evidence'],
  properties: {
    estimated_quantity: { type: 'number', minimum: 0 },
    unit: { type: 'string', enum: ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    note: { type: 'string' }, visual_evidence: { type: 'string' },
  },
}

const INSTRUCTIONS = `Você é especialista em contagem de estoque de restaurantes e food service. Transforme uma foto de prateleira, câmara fria ou despensa em uma contagem confiável, item por item.

CONTAGEM
- Conte apenas produtos ou insumos realmente visíveis. Ignore pessoas, preços, etiquetas, espaços vazios e prateleiras sem produto.
- Agrupe embalagens idênticas, somando a quantidade total visível.
- Para itens empilhados ou parcialmente encobertos, estime pelo padrão de empilhamento, reduza "confidence" e explique em "note". Nunca finja certeza sobre o que está oculto.
- Não conte a mesma unidade duas vezes por reflexos.
- Para produtos a granel ou vendidos por peso, estime o peso total pelo volume no recipiente.
- Uma caixa ou fardo fechado com quantidade impressa conta como aquela quantidade, salvo se o catálogo cadastrar a caixa como unidade.

RECONHECIMENTO
- Compare marca, cores, embalagem, tamanho e texto do rótulo com a ficha visual.
- Só preencha "product_id" quando a correspondência for clara. Em dúvida, deixe vazio e explique.
- Nunca associe dois itens diferentes ao mesmo "product_id".
- "match_confidence" mede o casamento com o catálogo; "confidence" mede a certeza da contagem.

Não invente informações e responda sempre em português do Brasil.`

const FOCUS_INSTRUCTIONS = `Conte UM ÚNICO produto específico, descrito pela ficha visual fornecida.
- Conte apenas unidades deste produto exato e ignore todos os outros itens.
- Compare marca, cores, embalagem, tamanho e rótulo com a ficha visual.
- Some embalagens idênticas. Para itens encobertos, reduza a confiança e explique.
- Não duplique reflexos. Para produtos a granel, estime pelo volume.
- Se o produto não aparecer claramente, marque "visible" como falso e quantidade 0.
- Não invente informações e responda em português do Brasil.`

const FOCUS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['visible', 'estimated_quantity', 'unit', 'confidence', 'note'],
  properties: {
    visible: { type: 'boolean' }, estimated_quantity: { type: 'number', minimum: 0 },
    unit: { type: 'string', enum: ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 }, note: { type: 'string' },
  },
}

function catalogCountSchema(productIds: string[]) {
  return {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['name', 'product_id', 'match_confidence', 'estimated_quantity', 'unit', 'confidence', 'note'],
          properties: {
            name: { type: 'string' }, product_id: { type: 'string', enum: [...productIds, ''] },
            match_confidence: { type: 'number', minimum: 0, maximum: 1 },
            estimated_quantity: { type: 'number', minimum: 0 },
            unit: { type: 'string', enum: ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 }, note: { type: 'string' },
          },
        },
      },
    },
  }
}

async function guidedAnalysis(input: {
  admin: SupabaseClient
  userId: string
  body: Record<string, unknown>
  action: GuidedAction
  onScanCreated: (scanId: string) => void
}) {
  const { admin, userId, body, action, onScanCreated } = input
  const rawPaths = Array.isArray(body.paths) ? body.paths : body.path ? [body.path] : []
  const paths = rawPaths.map(String).filter(Boolean).slice(0, 5)
  const productId = body.productId ? String(body.productId) : null
  const productName = String(body.productName || '').trim()

  if (!paths.length || paths.some((path) => !path.startsWith(`${userId}/`))) throw new Error('Imagem inválida para esta conta.')
  if (action === 'product_setup' && !productName) throw new Error('Informe o nome do produto antes de analisar as fotos.')
  if (action === 'inventory_count' && paths.length !== 1) throw new Error('Envie uma foto por contagem.')
  if (body.imageReviewConsent !== true) throw new Error('Confirme o uso da imagem para continuar.')
  await requireAppAccess(admin, userId, 'Seu acesso à ferramenta ainda não está disponível.')

  const images = await Promise.all(paths.map(async (path) => {
    const { data: blob, error } = await admin.storage.from('inventory-scans').download(path)
    if (error || !blob) throw new Error('Não foi possível ler uma das imagens enviadas.')
    return imageDataUrl(blob)
  }))

  const neededKeys: PromptKey[] = action === 'product_setup'
    ? ['product_photo_quality', 'product_profile'] : ['count_photo_quality', 'inventory_count']
  const { data: promptRows } = await admin.from('ai_prompt_configs').select('key,prompt,version').in('key', neededKeys)
  const prompts = Object.fromEntries(neededKeys.map((key) => {
    const row = promptRows?.find((item) => item.key === key)
    return [key, { prompt: row?.prompt || fallbackPrompts[key], version: row?.version || 1 }]
  })) as Record<PromptKey, { prompt: string; version: number }>
  const promptSnapshot = Object.fromEntries(neededKeys.map((key) => [key, prompts[key].prompt]))

  const { data: scan, error: scanError } = await admin.from('inventory_scans').insert({
    user_id: userId, product_id: productId, action,
    original_filename: paths.map((path) => path.split('/').pop()).join(', '),
    image_path: paths[0], image_paths: paths, image_review_consent: true,
    prompt_snapshot: promptSnapshot, status: 'processing',
  }).select('id').single()
  if (scanError || !scan) throw new Error('Não foi possível iniciar o registro da análise.')
  onScanCreated(String(scan.id))

  const qualityKey: PromptKey = action === 'product_setup' ? 'product_photo_quality' : 'count_photo_quality'
  const qualityResult = await askVision({
    userId,
    instructions: `Você auxilia inventários de restaurantes. Responda em português do Brasil. ${prompts[qualityKey].prompt}`,
    content: [
      { type: 'input_text', text: action === 'product_setup'
        ? `Produto informado: ${productName}. Avalie estas ${paths.length} fotos em conjunto: confirme que mostram o mesmo produto e possuem ângulos e nitidez suficientes para uma referência visual confiável.`
        : 'Avalie se a área fotografada permite uma contagem confiável do produto selecionado.' },
      ...images.map((image) => ({ type: 'input_image', image_url: image, detail: 'high' })),
    ],
    schemaName: `${qualityKey}_v${prompts[qualityKey].version}`,
    schema: QUALITY_SCHEMA,
  })
  const quality = qualityResult.parsed as { acceptable: boolean; score: number; reason: string; guidance: string }

  if (!quality.acceptable) {
    await admin.from('inventory_scans').update({ status: 'needs_new_photo', model: qualityResult.model, quality_response: quality, ai_response: { quality } }).eq('id', scan.id)
    return { scan_id: scan.id, action, image_path: paths[0], image_paths: paths, quality, items: [] }
  }

  if (action === 'product_setup') {
    const profileResult = await askVision({
      userId,
      instructions: `Você auxilia inventários de restaurantes. Responda em português do Brasil. ${prompts.product_profile.prompt}`,
      content: [
        { type: 'input_text', text: `Nome informado: ${productName}. Consolide os ângulos em uma única referência visual sem alterar o nome.` },
        ...images.map((image) => ({ type: 'input_image', image_url: image, detail: 'high' })),
      ],
      schemaName: `product_profile_v${prompts.product_profile.version}`,
      schema: PRODUCT_PROFILE_SCHEMA,
    })
    const productProfile = profileResult.parsed
    await admin.from('inventory_scans').update({ status: 'completed', model: profileResult.model, quality_response: quality, ai_response: { quality, product_profile: productProfile } }).eq('id', scan.id)
    return { scan_id: scan.id, action, image_path: paths[0], image_paths: paths, quality, product_profile: productProfile, items: [] }
  }

  if (!productId) throw new Error('Selecione o produto que deseja contar.')
  const { data: product } = await admin.from('products')
    .select('id,name,unit,ai_identity_profile,visual_signature')
    .eq('id', productId).eq('user_id', userId).single()
  if (!product) throw new Error('Produto não encontrado para esta conta.')
  const countResult = await askVision({
    userId,
    instructions: `Você auxilia inventários de restaurantes. Responda em português do Brasil. ${prompts.inventory_count.prompt}`,
    content: [
      { type: 'input_text', text: `Produto: ${product.name}. Unidade: ${product.unit}. Perfil visual: ${JSON.stringify(product.ai_identity_profile || product.visual_signature || { observacao: 'sem perfil; seja conservador' })}.` },
      { type: 'input_image', image_url: images[0], detail: 'high' },
    ],
    schemaName: `guided_inventory_count_v${prompts.inventory_count.version}`,
    schema: GUIDED_COUNT_SCHEMA,
  })
  const counted = countResult.parsed as { estimated_quantity: number; unit: string; confidence: number; note: string; visual_evidence: string }
  const items = [{ name: product.name, ...counted, unit: product.unit }]
  await admin.from('inventory_scans').update({ product_id: product.id, status: 'completed', model: countResult.model, quality_response: quality, items, ai_response: { quality, count: counted } }).eq('id', scan.id)
  return { scan_id: scan.id, action, image_path: paths[0], image_paths: paths, quality, items }
}

async function legacyAnalysis(admin: SupabaseClient, userId: string, body: Record<string, unknown>, path: string) {
  await requireAppAccess(admin, userId, 'Seu teste terminou. Ative a assinatura para usar a contagem por foto.')
  const { data: blob, error } = await admin.storage.from('inventory-scans').download(path)
  if (error || !blob) throw new Error('Não foi possível ler a imagem enviada.')

  const focusProductId = body.focus_product_id ? String(body.focus_product_id) : null
  if (focusProductId) {
    const { data: product } = await admin.from('products').select('id,name,category,unit,visual_signature')
      .eq('user_id', userId).eq('id', focusProductId).single()
    if (!product) throw new Error('Produto não encontrado.')
    if (!product.visual_signature) throw new Error('Cadastre fotos deste produto antes de contar por IA.')
    const { parsed, model } = await askVision({
      userId, instructions: FOCUS_INSTRUCTIONS,
      content: [
        { type: 'input_text', text: `Ficha visual (JSON): ${JSON.stringify({ name: product.name, category: product.category, unit: product.unit, visual_signature: product.visual_signature })}` },
        { type: 'input_image', image_url: await imageDataUrl(blob), detail: 'high' },
      ],
      schemaName: 'single_product_count', schema: FOCUS_SCHEMA,
    })
    const visible = Boolean(parsed.visible)
    const estimatedQuantity = visible ? Number(parsed.estimated_quantity) || 0 : 0
    const unit = (parsed.unit as string) || product.unit
    const confidence = Number(parsed.confidence) || 0
    const note = (parsed.note as string) || undefined
    const items = [{ name: product.name, product_id: product.id, match_confidence: 1, estimated_quantity: estimatedQuantity, unit, confidence, note }]
    const { data: scan } = await admin.from('inventory_scans').insert({ user_id: userId, original_filename: path.split('/').pop(), items, model, status: 'completed' }).select('id').single()
    return { visible, estimated_quantity: estimatedQuantity, unit, confidence, note, scan_id: scan?.id || null }
  }

  const { data: catalog } = await admin.from('products').select('id,name,category,unit,visual_signature')
    .eq('user_id', userId).not('visual_signature', 'is', null).order('created_at', { ascending: false }).limit(CATALOG_LIMIT)
  const products = catalog || []
  const content: unknown[] = [{ type: 'input_text', text: 'Conte os itens visíveis seguindo as regras de contagem e reconhecimento.' }]
  if (products.length) content.push({ type: 'input_text', text: `Catálogo deste cliente (JSON): ${JSON.stringify(products)}` })
  content.push({ type: 'input_image', image_url: await imageDataUrl(blob), detail: 'high' })
  const { parsed, model } = await askVision({
    userId, instructions: INSTRUCTIONS, content,
    schemaName: 'inventory_count', schema: catalogCountSchema(products.map((product) => product.id as string)),
  })
  const rawItems = Array.isArray(parsed.items) ? parsed.items as Record<string, unknown>[] : []
  const items = rawItems.map((item) => ({ ...item, product_id: item.product_id || null, note: item.note || undefined }))
  const { data: scan } = await admin.from('inventory_scans').insert({ user_id: userId, original_filename: path.split('/').pop(), items, model, status: 'completed' }).select('id').single()
  return { items, scan_id: scan?.id || null }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405)
  const admin = adminClient()
  let legacyPath = ''
  let guidedScanId = ''
  try {
    const user = await requireUser(request)
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || '')
    if (action === 'product_setup' || action === 'inventory_count') {
      const result = await guidedAnalysis({ admin, userId: user.id, body, action, onScanCreated: (id) => { guidedScanId = id } })
      return json(request, result)
    }
    legacyPath = String(body.path || '')
    if (!legacyPath.startsWith(`${user.id}/`)) throw new Error('Imagem inválida para esta conta.')
    return json(request, await legacyAnalysis(admin, user.id, body, legacyPath))
  } catch (error) {
    const message = safeError(error)
    console.error('analyze-inventory-image:', message)
    if (guidedScanId) await admin.from('inventory_scans').update({ status: 'failed', error_message: message.slice(0, 1000) }).eq('id', guidedScanId)
    return json(request, { error: message }, 400)
  } finally {
    // A jornada guiada retém imagens privadas para auditoria; o fluxo legado continua temporário.
    if (legacyPath) await admin.storage.from('inventory-scans').remove([legacyPath])
  }
})
