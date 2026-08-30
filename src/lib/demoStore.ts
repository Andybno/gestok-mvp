import type { Product, StockMovement } from '../types'

const PRODUCTS_KEY = 'gestok_demo_products'
const MOVEMENTS_KEY = 'gestok_demo_movements'

const seedProducts: Product[] = [
  { id: 'p1', name: 'Filé de frango', category: 'Proteínas', sku: 'PRO-001', unit: 'kg', quantity: 18.5, minimum_stock: 12, unit_cost: 21.9 },
  { id: 'p2', name: 'Arroz branco', category: 'Secos', sku: 'SEC-004', unit: 'kg', quantity: 8, minimum_stock: 15, unit_cost: 6.4 },
  { id: 'p3', name: 'Tomate italiano', category: 'Hortifruti', sku: 'HOR-012', unit: 'kg', quantity: 6.2, minimum_stock: 5, unit_cost: 8.7 },
  { id: 'p4', name: 'Azeite extra virgem', category: 'Mercearia', sku: 'MER-023', unit: 'un', quantity: 4, minimum_stock: 6, unit_cost: 34.5 },
  { id: 'p5', name: 'Queijo muçarela', category: 'Laticínios', sku: 'LAT-008', unit: 'kg', quantity: 11, minimum_stock: 8, unit_cost: 39.9 },
]

const seedMovements: StockMovement[] = [
  { id: 'm1', product_id: 'p1', type: 'entry', quantity: 10, reason: 'Compra', notes: 'Fornecedor habitual', created_at: new Date(Date.now() - 2 * 3600000).toISOString(), product: { name: 'Filé de frango', unit: 'kg' } },
  { id: 'm2', product_id: 'p3', type: 'exit', quantity: 2.4, reason: 'Produção', notes: 'Almoço', created_at: new Date(Date.now() - 5 * 3600000).toISOString(), product: { name: 'Tomate italiano', unit: 'kg' } },
  { id: 'm3', product_id: 'p2', type: 'exit', quantity: 5, reason: 'Produção', notes: 'Uso diário', created_at: new Date(Date.now() - 26 * 3600000).toISOString(), product: { name: 'Arroz branco', unit: 'kg' } },
]

function read<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key)
  return value ? JSON.parse(value) : fallback
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

export const demoStore = {
  products: () => read(PRODUCTS_KEY, seedProducts),
  movements: () => read(MOVEMENTS_KEY, seedMovements),
  saveProduct(product: Product) {
    const products = this.products()
    const existing = products.findIndex((item) => item.id === product.id)
    if (existing >= 0) products[existing] = product
    else products.unshift(product)
    write(PRODUCTS_KEY, products)
    return product
  },
  deleteProduct(id: string) {
    write(PRODUCTS_KEY, this.products().filter((item) => item.id !== id))
  },
  registerMovement(movement: StockMovement) {
    const products = this.products()
    const product = products.find((item) => item.id === movement.product_id)
    if (!product) throw new Error('Produto não encontrado')
    if (movement.type === 'exit' && movement.quantity > product.quantity) {
      throw new Error('A saída não pode ser maior que o estoque atual.')
    }
    if (movement.type === 'entry') product.quantity += movement.quantity
    if (movement.type === 'exit') product.quantity -= movement.quantity
    if (movement.type === 'adjustment') product.quantity = movement.quantity
    write(PRODUCTS_KEY, products)
    const complete = { ...movement, product: { name: product.name, unit: product.unit } }
    write(MOVEMENTS_KEY, [complete, ...this.movements()])
    return complete
  },
}
