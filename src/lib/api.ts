import { demoStore } from './demoStore'
import { demoAdminOverview, demoAdminUserDetail } from './adminDemo'
import { isSupabaseConfigured, supabase } from './supabase'
import type { AdminOverview, AdminUserDetail, InventoryScanItem, LeadFormData, Product, StockMovement } from '../types'

const uid = () => crypto.randomUUID()
const FUNNEL_SESSION_KEY = 'gestok_funnel_session_id'
const DEMO_FUNNEL_KEY = 'gestok_demo_funnel'

function funnelSessionId() {
  const saved = localStorage.getItem(FUNNEL_SESSION_KEY)
  if (saved) return saved
  const id = uid()
  localStorage.setItem(FUNNEL_SESSION_KEY, id)
  return id
}

export async function trackLeadAnswer(questionKey: string, questionNumber: number) {
  const sessionId = funnelSessionId()
  if (!supabase) {
    const saved = JSON.parse(localStorage.getItem(DEMO_FUNNEL_KEY) || '{}') as { answered_keys?: string[]; last_question?: number; started_at?: string }
    const answeredKeys = Array.from(new Set([...(saved.answered_keys || []), questionKey]))
    localStorage.setItem(DEMO_FUNNEL_KEY, JSON.stringify({ answered_keys: answeredKeys, last_question: Math.max(saved.last_question || 0, questionNumber), started_at: saved.started_at || new Date().toISOString(), updated_at: new Date().toISOString() }))
    return
  }
  const { error } = await supabase.rpc('track_lead_progress', { p_session_id: sessionId, p_question: questionNumber, p_question_key: questionKey })
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
  const metaAttributed = source?.toLowerCase() === 'meta'
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
  return data as AdminUserDetail
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

export async function analyzeInventoryImage(file: File): Promise<InventoryScanItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    await new Promise((resolve) => setTimeout(resolve, 1600))
    return [
      { name: 'Óleo de soja 900 ml', estimated_quantity: 8, unit: 'un', confidence: 0.93 },
      { name: 'Molho de tomate', estimated_quantity: 12, unit: 'un', confidence: 0.88, note: '2 itens parcialmente encobertos' },
      { name: 'Farinha de trigo 1 kg', estimated_quantity: 5, unit: 'un', confidence: 0.81 },
    ]
  }
  const path = `${(await supabase.auth.getUser()).data.user?.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`
  const { error: uploadError } = await supabase.storage.from('inventory-scans').upload(path, file)
  if (uploadError) throw uploadError
  const { data, error } = await supabase.functions.invoke('analyze-inventory-image', { body: { path } })
  if (error) throw error
  return data.items as InventoryScanItem[]
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
