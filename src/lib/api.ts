import { demoStore } from './demoStore'
import { demoAdminOverview, demoAdminUserDetail, demoAiPrompts } from './adminDemo'
import { isSupabaseConfigured, supabase } from './supabase'
import type { AiPromptConfig, AdminOverview, AdminUserDetail, InventoryImageAnalysis, InventoryScan, InventoryScanItem, InventoryScanResult, LeadFormData, Product, ProductCountResult, ProductJourneyEvent, ProductVisualSignature, ScanAdjustment, ScanApplyResult, StockMovement } from '../types'

const uid = () => crypto.randomUUID()
const FUNNEL_SESSION_KEY = 'gestok_funnel_session_id'
const DEMO_FUNNEL_KEY = 'gestok_demo_funnel'
const META_SOURCES = new Set(['meta', 'facebook', 'instagram', 'fb', 'ig'])

function funnelSessionId() {
  const saved = localStorage.getItem(FUNNEL_SESSION_KEY)
  if (saved) return saved
  const id = uid()
  localStorage.setItem(FUNNEL_SESSION_KEY, id)
  return id
}

export async function startDiagnosticSession() {
  const sessionId = funnelSessionId()
  if (!supabase) {
    const saved = JSON.parse(localStorage.getItem(DEMO_FUNNEL_KEY) || '{}')
    localStorage.setItem(DEMO_FUNNEL_KEY, JSON.stringify({ ...saved, id: sessionId, started_at: saved.started_at || new Date().toISOString(), updated_at: new Date().toISOString() }))
    return
  }
  const { error } = await supabase.rpc('start_diagnostic_session', { p_session_id: sessionId })
  if (error) throw error
}

export async function trackLeadAnswer(questionKey: string, questionNumber: number, answers: Partial<LeadFormData>) {
  const sessionId = funnelSessionId()
  if (!supabase) {
    const saved = JSON.parse(localStorage.getItem(DEMO_FUNNEL_KEY) || '{}') as { answered_keys?: string[]; last_question?: number; started_at?: string; answers?: Partial<LeadFormData> }
    const answeredKeys = Array.from(new Set([...(saved.answered_keys || []), questionKey]))
    localStorage.setItem(DEMO_FUNNEL_KEY, JSON.stringify({ ...saved, answered_keys: answeredKeys, answers: { ...saved.answers, ...answers }, last_question: Math.max(saved.last_question || 0, questionNumber), started_at: saved.started_at || new Date().toISOString(), updated_at: new Date().toISOString() }))
    return
  }
  const { error } = await supabase.rpc('save_diagnostic_progress', { p_session_id: sessionId, p_question: questionNumber, p_question_key: questionKey, p_answers: answers })
  if (error) throw error
}

export async function trackAdLandingVisit() {
  const sessionId = funnelSessionId()
  const params = new URLSearchParams(window.location.search)
  const source = params.get('utm_source')
  const medium = params.get('utm_medium')
  const campaign = params.get('utm_campaign')
  const adset = params.get('utm_term')
  const ad = params.get('utm_content')
  const metaAttributed = META_SOURCES.has(source?.toLowerCase() || '')
    || medium?.toLowerCase() === 'paid_social'
    || params.has('fbclid')

  if (!supabase) return
  const { error } = await supabase.rpc('track_ad_landing_visit', {
    p_session_id: sessionId,
    p_source: source,
    p_medium: medium,
    p_campaign: campaign,
    p_adset: adset,
    p_ad: ad,
    p_meta_attributed: metaAttributed,
  })
  if (error) throw error
}

async function completeLeadFunnel(leadId: string) {
  const sessionId = funnelSessionId()
  if (!supabase) {
    const saved = JSON.parse(localStorage.getItem(DEMO_FUNNEL_KEY) || '{}')
    localStorage.setItem(DEMO_FUNNEL_KEY, JSON.stringify({ ...saved, lead_id: leadId, completed_at: new Date().toISOString() }))
    return
  }
  const { error } = await supabase.rpc('complete_lead_funnel', { p_session_id: sessionId, p_lead_id: leadId })
  if (error) throw error
}

export async function saveLead(lead: LeadFormData) {
  const id = uid()
  const payload = {
    id,
    ...lead,
    contact_consent_at: lead.contact_consent ? new Date().toISOString() : null,
    marketing_consent_at: lead.marketing_consent ? new Date().toISOString() : null,
    source: 'landing_page',
  }
  if (!supabase) {
    localStorage.setItem('gestok_lead', JSON.stringify(payload))
    localStorage.setItem('gestok_lead_id', id)
    await completeLeadFunnel(id)
    return id
  }
  // Leads anônimos podem inserir, mas não ler registros por segurança e LGPD.
  // O UUID é gerado no cliente para evitar um INSERT ... RETURNING bloqueado pelo RLS.
  const { error } = await supabase.from('leads').insert(payload)
  if (error) throw error
  localStorage.setItem('gestok_lead_id', id)
  await completeLeadFunnel(id).catch(() => undefined)
  return id
}

export async function touchLastSeen() {
  if (!supabase) return
  const { error } = await supabase.rpc('touch_last_seen')
  if (error) throw error
}

export async function scheduleOnboarding(scheduledAt: string, bookingUid?: string) {
  if (!supabase) {
    const saved = JSON.parse(localStorage.getItem('gestok_demo_profile') || '{}')
    localStorage.setItem('gestok_demo_profile', JSON.stringify({ ...saved, onboarding_status: 'scheduled', onboarding_scheduled_at: scheduledAt, onboarding_booking_uid: bookingUid || null }))
    return
  }
  const { error } = await supabase.rpc('schedule_onboarding', { p_scheduled_at: scheduledAt, p_booking_uid: bookingUid || null })
  if (error) throw error
}

export async function completeUserOnboarding(userId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_complete_onboarding', { p_user_id: userId })
  if (error) throw error
}

export async function setAdminUserAnalyticsExclusion(userId: string, excluded: boolean) {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_set_user_analytics_exclusion', { p_user_id: userId, p_excluded: excluded })
  if (error) throw error
}

export async function setAdminDiagnosticAnalyticsExclusion(sessionId: string, excluded: boolean) {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_set_diagnostic_analytics_exclusion', { p_session_id: sessionId, p_excluded: excluded })
  if (error) throw error
}

export async function setAdminAdCampaignMetrics(reach: number, impressions: number, linkClicks: number) {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_set_ad_campaign_metrics', {
    p_reach: reach,
    p_impressions: impressions,
    p_link_clicks: linkClicks,
  })
  if (error) throw error
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (!supabase) return demoAdminOverview()
  const { data, error } = await supabase.rpc('admin_overview')
  if (error) throw error
  return data as AdminOverview
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  if (!supabase) return demoAdminUserDetail(userId)
  const { data, error } = await supabase.rpc('admin_user_detail', { p_user_id: userId })
  if (error) throw error
  const [{ data: scans, error: scansError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from('inventory_scans').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    supabase.from('product_journey_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
  ])
  if (scansError) throw scansError
  if (eventsError) throw eventsError
  return { ...(data as AdminUserDetail), inventory_scans: await withSignedScanImages((scans || []) as InventoryScan[]), journey_events: (events || []) as ProductJourneyEvent[] }
}

export async function listProducts(): Promise<Product[]> {
  if (!supabase) return demoStore.products()
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as Product[]
}

export async function saveProduct(product: Omit<Product, 'id'> & { id?: string }): Promise<Product> {
  if (!supabase) return demoStore.saveProduct({ ...product, id: product.id || uid() } as Product)
  const { data: auth } = await supabase.auth.getUser()
  const payload = { ...product, user_id: auth.user?.id }
  const query = product.id
    ? supabase.from('products').update(payload).eq('id', product.id)
    : supabase.from('products').insert(payload)
  const { data, error } = await query.select().single()
  if (error) throw error
  return data as Product
}

export async function deleteProduct(id: string) {
  if (!supabase) return demoStore.deleteProduct(id)
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
}

export async function listMovements(): Promise<StockMovement[]> {
  if (!supabase) return demoStore.movements()
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*, product:products(name,unit)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data as StockMovement[]
}

export async function registerMovement(input: Omit<StockMovement, 'id' | 'created_at' | 'product'>) {
  if (!supabase) {
    return demoStore.registerMovement({ ...input, id: uid(), created_at: new Date().toISOString() })
  }
  const { data, error } = await supabase.rpc('register_stock_movement', {
    p_product_id: input.product_id,
    p_type: input.type,
    p_quantity: input.quantity,
    p_reason: input.reason,
    p_notes: input.notes || null,
  })
  if (error) throw error
  return data
}

/** Caminho no storage isolado por usuário: as policies exigem a pasta = auth.uid(). */
async function userScopedPath(fileName: string) {
  const { data: auth } = await supabase!.auth.getUser()
  return `${auth.user?.id}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '-')}`
}

export async function uploadProductPhoto(file: File): Promise<string> {
  if (!supabase) {
    // No modo demo o "path" é a própria imagem em data URL, para a miniatura
    // sobreviver ao recarregamento da página.
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      reader.readAsDataURL(file)
    })
  }
  const path = await userScopedPath(file.name)
  const { error } = await supabase.storage.from('product-photos').upload(path, file)
  if (error) throw error
  return path
}

/**
 * supabase.functions.invoke só expõe "Edge Function returned a non-2xx status
 * code" no erro genérico; a mensagem real (em português) vem no corpo da
 * resposta. Extrai o corpo quando disponível, senão usa um texto de reserva.
 */
async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response = error && typeof error === 'object' && 'context' in error && (error as { context: unknown }).context instanceof Response
    ? (error as { context: Response }).context
    : null
  if (response) {
    const payload = await response.clone().json().catch(() => null) as { error?: string } | null
    if (payload?.error) return payload.error
  }
  return fallback
}

export async function describeProductPhoto(path: string): Promise<{ signature: ProductVisualSignature; model: string }> {
  if (!isSupabaseConfigured || !supabase) {
    await new Promise((resolve) => setTimeout(resolve, 1400))
    return {
      signature: { brand: 'Marca exemplo', product_kind: 'produto de estoque', package_type: 'caixa', package_size: '1 kg', dominant_colors: ['vermelho', 'branco'], label_text: ['EXEMPLO', '1kg'], shape: 'caixa retangular', distinctive_marks: 'faixa diagonal no rótulo', photo_quality: 'boa', usable_for_matching: true },
      model: 'demo',
    }
  }
  const { data, error } = await supabase.functions.invoke('describe-product-photo', { body: { path } })
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível gerar a ficha visual desta foto.'))
  return data as { signature: ProductVisualSignature; model: string }
}

const photoUrlCache = new Map<string, { url: string; expiresAt: number }>()

/** URL assinada com cache em memória, para a lista não reassinar a cada render. */
export async function productPhotoUrl(path: string): Promise<string> {
  if (!supabase) return path
  const cached = photoUrlCache.get(path)
  if (cached && cached.expiresAt > Date.now()) return cached.url
  const { data, error } = await supabase.storage.from('product-photos').createSignedUrl(path, 3600)
  if (error) throw error
  photoUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}

const inventoryScanUrlCache = new Map<string, { url: string; expiresAt: number }>()

export async function inventoryScanImageUrl(path: string): Promise<string> {
  if (!supabase) return path
  const cached = inventoryScanUrlCache.get(path)
  if (cached && cached.expiresAt > Date.now()) return cached.url
  const { data, error } = await supabase.storage.from('inventory-scans').createSignedUrl(path, 3600)
  if (error) throw error
  inventoryScanUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}

export async function removeProductPhoto(path: string) {
  photoUrlCache.delete(path)
  if (!supabase) return
  const { error } = await supabase.storage.from('product-photos').remove([path])
  if (error) throw error
}

export async function analyzeInventoryImage(file: File): Promise<InventoryScanResult> {
  if (!isSupabaseConfigured || !supabase) {
    await new Promise((resolve) => setTimeout(resolve, 1600))
    // Aponta para os produtos do seed, para o fluxo completo de contagem e
    // ajuste ser demonstrável sem Supabase.
    return {
      items: [
        { name: 'Arroz branco', estimated_quantity: 12, unit: 'kg', confidence: 0.93, product_id: 'p2', match_confidence: 0.91 },
        { name: 'Azeite extra virgem', estimated_quantity: 4, unit: 'un', confidence: 0.88, product_id: 'p4', match_confidence: 0.84, note: '2 itens parcialmente encobertos' },
        { name: 'Molho de tomate 340 g', estimated_quantity: 9, unit: 'un', confidence: 0.81, product_id: null },
      ],
      scan_id: null,
    }
  }
  const path = await userScopedPath(file.name)
  const { error: uploadError } = await supabase.storage.from('inventory-scans').upload(path, file)
  if (uploadError) throw uploadError
  const { data, error } = await supabase.functions.invoke('analyze-inventory-image', { body: { path } })
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível analisar esta imagem.'))
  return { items: data.items as InventoryScanItem[], scan_id: data.scan_id ?? null }
}

/**
 * Conta apenas o produto informado na foto, ignorando qualquer outro item
 * visível — usado pelo botão "Contar" na lista de produtos.
 */
export async function countProductByPhoto(product: Product, file: File): Promise<ProductCountResult> {
  if (!isSupabaseConfigured || !supabase) {
    await new Promise((resolve) => setTimeout(resolve, 1400))
    const drift = Math.round((Math.random() - 0.5) * 6)
    return { visible: true, estimated_quantity: Math.max(0, product.quantity + drift), unit: product.unit, confidence: 0.88, scan_id: null }
  }
  if (!product.visual_signature) throw new Error('Cadastre uma foto deste produto antes de contar por IA.')
  const path = await userScopedPath(file.name)
  const { error: uploadError } = await supabase.storage.from('inventory-scans').upload(path, file)
  if (uploadError) throw uploadError
  const { data, error } = await supabase.functions.invoke('analyze-inventory-image', { body: { path, focus_product_id: product.id } })
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível contar este produto nessa foto.'))
  return data as ProductCountResult
}

/**
 * Aplica a contagem revisada como movimentações de ajuste.
 * O RPC trata 'adjustment' como valor absoluto, então enviamos o total contado.
 * Uma falha isolada não aborta o lote: os erros voltam por produto.
 */
export async function applyScanCount(adjustments: ScanAdjustment[], scanId?: string | null): Promise<ScanApplyResult> {
  const errors: ScanApplyResult['errors'] = []
  let applied = 0

  for (const adjustment of adjustments) {
    try {
      await registerMovement({
        product_id: adjustment.product.id,
        type: 'adjustment',
        quantity: adjustment.counted,
        reason: 'Contagem por foto',
        notes: `Contagem por foto: ${adjustment.current} → ${adjustment.counted} ${adjustment.product.unit}`,
      })
      applied += 1
    } catch (cause) {
      errors.push({ product: adjustment.product.name, message: cause instanceof Error ? cause.message : 'Não foi possível ajustar este item.' })
    }
  }

  if (applied && scanId && supabase) {
    await supabase.rpc('mark_scan_applied', { p_scan_id: scanId })
  }
  return { applied, errors }
}

export async function analyzeGuidedInventoryImage(fileOrFiles: File | File[], options: {
  action: 'product_setup' | 'inventory_count'
  productId?: string
  productName?: string
  imageReviewConsent: boolean
}): Promise<InventoryImageAnalysis> {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]
  if (!files.length || files.length > 5) throw new Error('Envie entre 1 e 5 fotos.')
  if (!isSupabaseConfigured || !supabase) {
    await new Promise((resolve) => setTimeout(resolve, 1600))
    const scanId = uid()
    return options.action === 'product_setup' ? {
      scan_id: scanId,
      action: options.action,
      image_path: `demo/${scanId}-${files[0].name}`,
      image_paths: files.map((file, index) => `demo/${scanId}-${index + 1}-${file.name}`),
      quality: { acceptable: true, score: 0.94, reason: 'Produto nítido e bem enquadrado.', guidance: 'Foto adequada para criar a referência visual.' },
      items: [],
      product_profile: { category: 'Mercearia', suggested_unit: 'un', brand: 'Marca visível', packaging: 'Embalagem individual', colors: ['verde', 'branco'], visual_markers: ['logotipo frontal', 'formato retangular'], counting_guidance: 'Contar cada embalagem frontal ou lateral visível.' },
    } : {
      scan_id: scanId,
      action: options.action,
      image_path: `demo/${scanId}-${files[0].name}`,
      image_paths: [`demo/${scanId}-${files[0].name}`],
      quality: { acceptable: true, score: 0.9, reason: 'Área iluminada e produto identificável.', guidance: 'Contagem pronta para revisão.' },
      items: [{ name: options.productName || 'Produto selecionado', estimated_quantity: 8, unit: 'un', confidence: 0.91, note: 'Uma embalagem pode estar parcialmente encoberta.', visual_evidence: '8 volumes compatíveis visíveis na prateleira.' }],
    }
  }
  if (!options.imageReviewConsent) throw new Error('Confirme o uso da imagem para continuar.')
  const client = supabase
  const userId = (await client.auth.getUser()).data.user?.id
  if (!userId) throw new Error('Entre novamente para usar a contagem por foto.')
  const batchId = `${Date.now()}-${uid()}`
  const paths = await Promise.all(files.map(async (file, index) => {
    const path = `${userId}/${batchId}/${index + 1}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`
    const { error: uploadError } = await client.storage.from('inventory-scans').upload(path, file)
    if (uploadError) throw uploadError
    return path
  }))
  const { data, error } = await client.functions.invoke('analyze-inventory-image', { body: { paths, action: options.action, productId: options.productId, productName: options.productName, imageReviewConsent: options.imageReviewConsent } })
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível analisar estas imagens.'))
  return data as InventoryImageAnalysis
}

export async function linkProductScan(scanId: string, productId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('link_product_scan', { p_scan_id: scanId, p_product_id: productId })
  if (error) throw error
}

export async function confirmInventoryScan(scanId: string, productId: string, quantity: number) {
  if (!supabase) {
    return demoStore.registerMovement({ id: uid(), product_id: productId, type: 'adjustment', quantity, reason: 'Contagem com IA', notes: `Revisão do scan ${scanId}`, created_at: new Date().toISOString() })
  }
  const { data, error } = await supabase.rpc('confirm_inventory_scan', { p_scan_id: scanId, p_product_id: productId, p_quantity: quantity })
  if (error) throw error
  return data
}

export async function completeFirstUseExperience() {
  if (!supabase) {
    const saved = JSON.parse(localStorage.getItem('gestok_demo_profile') || '{}')
    localStorage.setItem('gestok_demo_profile', JSON.stringify({ ...saved, first_use_completed_at: new Date().toISOString() }))
    return
  }
  const { error } = await supabase.rpc('complete_first_use_experience')
  if (error) throw error
}

export async function trackProductJourneyEvent(eventName: string, metadata: Record<string, unknown> = {}) {
  if (!supabase) {
    const events = JSON.parse(localStorage.getItem('gestok_demo_journey_events') || '[]')
    localStorage.setItem('gestok_demo_journey_events', JSON.stringify([{ id: uid(), user_id: 'demo-user', event_name: eventName, metadata, created_at: new Date().toISOString() }, ...events]))
    return
  }
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('product_journey_events').insert({ user_id: auth.user?.id, event_name: eventName, metadata })
  if (error) throw error
}

async function withSignedScanImages(scans: InventoryScan[]) {
  if (!supabase) return scans
  const client = supabase
  return Promise.all(scans.map(async (scan) => {
    const paths = scan.image_paths?.length ? scan.image_paths : scan.image_path ? [scan.image_path] : []
    if (!paths.length) return scan
    const urls = await Promise.all(paths.map(async (path) => {
      const { data } = await client.storage.from('inventory-scans').createSignedUrl(path, 3600)
      return data?.signedUrl || ''
    }))
    return { ...scan, image_url: urls[0] || null, image_urls: urls.filter(Boolean) }
  }))
}

export async function listAdminInventoryScans(): Promise<InventoryScan[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('inventory_scans').select('*').order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return withSignedScanImages((data || []) as InventoryScan[])
}

export async function listAiPromptConfigs(): Promise<AiPromptConfig[]> {
  if (!supabase) return demoAiPrompts()
  const { data, error } = await supabase.from('ai_prompt_configs').select('*').order('key')
  if (error) throw error
  return (data || []) as AiPromptConfig[]
}

export async function updateAiPromptConfig(key: AiPromptConfig['key'], prompt: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_update_ai_prompt', { p_key: key, p_prompt: prompt })
  if (error) throw error
}

export async function createCheckoutSession() {
  if (!supabase) throw new Error('Conecte o Supabase e o Stripe para ativar a assinatura.')
  const { data, error } = await supabase.functions.invoke('create-checkout-session')
  if (error) throw error
  if (!data?.url) throw new Error('O checkout não retornou uma URL.')
  window.location.assign(data.url)
}

export async function openCustomerPortal() {
  if (!supabase) throw new Error('O portal estará disponível após conectar o Stripe.')
  const { data, error } = await supabase.functions.invoke('create-customer-portal')
  if (error) throw error
  window.location.assign(data.url)
}
