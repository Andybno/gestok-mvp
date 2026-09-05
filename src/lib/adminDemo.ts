import type { AdminOverview, AdminUserDetail, AdminUserSummary, Product, StockMovement } from '../types'

const ago = (days: number, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600000).toISOString()
const ahead = (days: number, hours = 0) => new Date(Date.now() + (days * 24 + hours) * 3600000).toISOString()

const users: AdminUserSummary[] = [
  { id: 'user-1', email: 'ana@bistrodemo.com', full_name: 'Ana Souza', business_name: 'Bistrô da Ana', subscription_status: 'trialing', created_at: ago(2), last_seen_at: ago(0, 1), products_count: 0, movements_count: 0, onboarding_status: 'scheduled', onboarding_scheduled_at: ahead(1, 2) },
  { id: 'user-2', email: 'carlos@pizzariademo.com', full_name: 'Carlos Lima', business_name: 'Pizzaria Central', subscription_status: 'active', created_at: ago(18), last_seen_at: ago(0, 5), products_count: 18, movements_count: 47, onboarding_status: 'completed', onboarding_completed_at: ago(16) },
  { id: 'user-3', email: 'marina@cafedemo.com', full_name: 'Marina Alves', business_name: 'Café do Parque', subscription_status: 'trialing', created_at: ago(5), last_seen_at: ago(1, 3), products_count: 0, movements_count: 0, onboarding_status: 'pending_booking' },
  { id: 'user-4', email: 'joao@deliverydemo.com', full_name: 'João Santos', business_name: 'Prato Rápido Delivery', subscription_status: 'past_due', created_at: ago(34), last_seen_at: ago(8), products_count: 24, movements_count: 83, onboarding_status: 'completed', onboarding_completed_at: ago(31) },
  { id: 'user-5', email: 'beatriz@padariademo.com', full_name: 'Beatriz Costa', business_name: 'Padaria Aurora', subscription_status: 'expired', created_at: ago(12), last_seen_at: ago(12), products_count: 0, movements_count: 0, onboarding_status: 'scheduled', onboarding_scheduled_at: ahead(3) },
]

const productNames = ['Filé de frango', 'Arroz branco', 'Tomate italiano', 'Azeite extra virgem', 'Queijo muçarela']

function productsFor(user: AdminUserSummary): Product[] {
  return productNames.slice(0, Math.min(user.products_count, productNames.length)).map((name, index) => ({
    id: `${user.id}-p${index + 1}`,
    user_id: user.id,
    name,
    category: ['Proteínas', 'Secos', 'Hortifruti', 'Mercearia', 'Laticínios'][index],
    sku: `DEM-${String(index + 1).padStart(3, '0')}`,
    unit: index === 3 ? 'un' : 'kg',
    quantity: [18.5, 8, 6.2, 4, 11][index],
    minimum_stock: [12, 15, 5, 6, 8][index],
    unit_cost: [21.9, 6.4, 8.7, 34.5, 39.9][index],
    created_at: ago(Math.max(1, index + 1)),
  }))
}

function movementsFor(user: AdminUserSummary, products: Product[]): StockMovement[] {
  return products.slice(0, 3).map((product, index) => ({
    id: `${user.id}-m${index + 1}`,
    user_id: user.id,
    product_id: product.id,
    type: index === 0 ? 'entry' : 'exit',
    quantity: [10, 5, 2.4][index],
    reason: index === 0 ? 'Compra' : 'Produção',
    notes: index === 0 ? 'Fornecedor habitual' : 'Uso diário',
    created_at: ago(index, index + 2),
    product: { name: product.name, unit: product.unit },
  }))
}

export function demoAdminOverview(): AdminOverview {
  return {
    started: 184,
    completed_leads: 91,
    accounts_created: 57,
    product_users: 39,
    scheduled_onboardings: 46,
    completed_onboardings: 39,
    question_steps: [
      { key: 'operation_type', label: 'Tipo de operação', count: 184 },
      { key: 'sales_channels', label: 'Canais de venda', count: 171 },
      { key: 'units_count', label: 'Número de unidades', count: 158 },
      { key: 'sku_count', label: 'Itens no estoque', count: 146 },
      { key: 'inventory_method', label: 'Controle atual', count: 133 },
      { key: 'main_challenge', label: 'Maior desafio', count: 121 },
      { key: 'whatsapp', label: 'Telefone', count: 112 },
      { key: 'email', label: 'E-mail', count: 103 },
      { key: 'contact_consent', label: 'Consentimento LGPD', count: 91 },
    ],
    users,
  }
}

export function demoAdminUserDetail(userId: string): AdminUserDetail {
  const user = users.find((item) => item.id === userId) || users[0]
  const products = productsFor(user)
  return {
    user,
    lead: {
      full_name: user.full_name,
      email: user.email,
      whatsapp: '(11) 99999-0000',
      business_name: user.business_name,
      operation_type: user.id === 'user-2' ? 'Restaurante' : 'Delivery / dark kitchen',
      sales_channels: ['Atendimento presencial', 'iFood / marketplaces'],
      units_count: user.id === 'user-2' ? '2 a 3 unidades' : '1 unidade',
      sku_count: user.products_count > 15 ? '101 a 300' : '31 a 100',
      inventory_method: 'Planilha',
      main_challenge: 'Contagem manual demorada',
      marketing_consent: user.id !== 'user-4',
      contact_consent: true,
      created_at: user.created_at,
    },
    products,
    movements: movementsFor(user, products),
  }
}
