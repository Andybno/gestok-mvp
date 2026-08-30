export type Product = {
  id: string
  user_id?: string
  name: string
  category: string
  sku: string
  unit: string
  quantity: number
  minimum_stock: number
  unit_cost: number
  expires_at?: string | null
  created_at?: string
}

export type StockMovement = {
  id: string
  user_id?: string
  product_id: string
  type: 'entry' | 'exit' | 'adjustment'
  quantity: number
  reason: string
  notes?: string
  created_at: string
  product?: Pick<Product, 'name' | 'unit'>
}

export type Profile = {
  id: string
  full_name: string
  business_name: string
  trial_ends_at: string
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
  stripe_customer_id?: string | null
}

export type LeadFormData = {
  full_name: string
  email: string
  whatsapp: string
  business_name: string
  city: string
  state: string
  role: string
  operation_type: string
  sales_channels: string[]
  units_count: string
  employees_count: string
  monthly_orders: string
  sku_count: string
  inventory_method: string
  inventory_frequency: string
  uses_erp: string
  estimated_loss: string
  main_challenge: string
  contact_consent: boolean
  marketing_consent: boolean
  privacy_policy_version: string
}

export type InventoryScanItem = {
  name: string
  estimated_quantity: number
  unit: string
  confidence: number
  note?: string
}
