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
  is_admin?: boolean
  last_seen_at?: string
  created_at?: string
  onboarding_status: 'pending_booking' | 'scheduled' | 'completed'
  onboarding_scheduled_at?: string | null
  onboarding_completed_at?: string | null
  onboarding_booking_uid?: string | null
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

export type AdminFunnelStep = {
  key: string
  label: string
  count: number
}

export type AdminUserSummary = {
  id: string
  email: string
  full_name: string
  business_name: string
  subscription_status: Profile['subscription_status']
  created_at: string
  last_seen_at: string
  products_count: number
  movements_count: number
  onboarding_status: Profile['onboarding_status']
  onboarding_scheduled_at?: string | null
  onboarding_completed_at?: string | null
  onboarding_booking_uid?: string | null
}

export type AdminOverview = {
  started: number
  completed_leads: number
  accounts_created: number
  product_users: number
  scheduled_onboardings: number
  completed_onboardings: number
  question_steps: AdminFunnelStep[]
  users: AdminUserSummary[]
}

export type AdminUserDetail = {
  user: AdminUserSummary
  lead: (Partial<LeadFormData> & { created_at?: string }) | null
  products: Product[]
  movements: StockMovement[]
}
