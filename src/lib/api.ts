import { demoStore } from './demoStore'
import { isSupabaseConfigured, supabase } from './supabase'
import type { InventoryScanItem, LeadFormData, Product, StockMovement } from '../types'

const uid = () => crypto.randomUUID()

export async function saveLead(lead: LeadFormData) {
  const payload = {
    ...lead,
    contact_consent_at: lead.contact_consent ? new Date().toISOString() : null,
    marketing_consent_at: lead.marketing_consent ? new Date().toISOString() : null,
    source: 'landing_page',
  }
  if (!supabase) {
    const id = uid()
    localStorage.setItem('gestok_lead', JSON.stringify({ id, ...payload }))
    localStorage.setItem('gestok_lead_id', id)
    return id
  }
  const { data, error } = await supabase.from('leads').insert(payload).select('id').single()
  if (error) throw error
  localStorage.setItem('gestok_lead_id', data.id)
  return data.id as string
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
