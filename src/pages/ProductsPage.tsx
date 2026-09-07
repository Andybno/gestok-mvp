import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Edit3, PackageOpen, Plus, Search, Trash2 } from 'lucide-react'
import { deleteProduct, listProducts } from '../lib/api'
import { ProductFormModal } from '../components/ProductFormModal'
import type { Product } from '../types'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low'>('all')
  const [editing, setEditing] = useState<Product | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = () => listProducts().then(setProducts).finally(() => setLoading(false))
  useEffect(() => { refresh() }, [])

  const filtered = useMemo(() => products.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (filter === 'all' || product.quantity <= product.minimum_stock)
  }), [products, search, filter])

  const openForm = (product?: Product) => { setError(''); setEditing(product ?? null) }

  const remove = async (product: Product) => {
    if (!window.confirm(`Excluir “${product.name}”? O histórico relacionado também poderá ser removido.`)) return
    try { await deleteProduct(product.id); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir.') }
  }

  return (
    <div className="products-page">
      <div className="page-title-row"><div><span className="kicker">Catálogo de insumos</span><h1>Produtos</h1><p>Cadastre itens e defina níveis mínimos para receber alertas.</p></div><button className="button" onClick={() => openForm()}><Plus size={17} /> Cadastrar produto</button></div>
      <div className="toolbar"><label className="search-box"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, SKU ou categoria" /></label><div className="segmented"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos <span>{products.length}</span></button><button className={filter === 'low' ? 'active' : ''} onClick={() => setFilter('low')}>Estoque baixo <span>{products.filter((p) => p.quantity <= p.minimum_stock).length}</span></button></div></div>
      {error && <div className="form-error">{error}</div>}
      <section className="table-panel">
        {loading ? <div className="content-loader">Carregando produtos...</div> : filtered.length ? <div className="responsive-table"><table><thead><tr><th>Produto</th><th>Categoria</th><th>SKU</th><th>Estoque atual</th><th>Mínimo</th><th>Custo unit.</th><th>Valor total</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{filtered.map((product) => {
          const low = product.quantity <= product.minimum_stock
          return <tr key={product.id}><td><div className="product-cell"><span>{product.name.slice(0, 2).toUpperCase()}</span><div><strong>{product.name}</strong>{product.expires_at && <small>Validade: {new Date(`${product.expires_at}T12:00:00`).toLocaleDateString('pt-BR')}</small>}</div></div></td><td><span className="category-tag">{product.category || 'Sem categoria'}</span></td><td className="muted">{product.sku || '—'}</td><td><strong className={low ? 'stock-low' : ''}>{low && <AlertTriangle size={14} />}{product.quantity.toLocaleString('pt-BR')} {product.unit}</strong></td><td>{product.minimum_stock.toLocaleString('pt-BR')} {product.unit}</td><td>{money.format(product.unit_cost)}</td><td><strong>{money.format(product.quantity * product.unit_cost)}</strong></td><td><div className="row-actions"><button onClick={() => openForm(product)} aria-label={`Editar ${product.name}`}><Edit3 size={17} /></button><button onClick={() => remove(product)} aria-label={`Excluir ${product.name}`}><Trash2 size={17} /></button></div></td></tr>
        })}</tbody></table></div> : <div className="empty-state"><span><PackageOpen size={28} /></span><h3>Nenhum produto encontrado</h3><p>{search ? 'Tente outro termo de busca.' : 'Cadastre o primeiro item para começar a controlar seu estoque.'}</p>{!search && <button className="button" onClick={() => openForm()}><Plus size={17} /> Cadastrar produto</button>}</div>}
      </section>

      {editing !== undefined && <ProductFormModal
        product={editing}
        onClose={() => setEditing(undefined)}
        onSaved={async () => { setEditing(undefined); await refresh() }}
      />}
    </div>
  )
}
