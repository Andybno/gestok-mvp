import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Edit3, PackageOpen, Plus, Search, Trash2, X } from 'lucide-react'
import { deleteProduct, listProducts, saveProduct } from '../lib/api'
import type { Product } from '../types'

const emptyProduct = { name: '', category: '', sku: '', unit: 'un', quantity: 0, minimum_stock: 0, unit_cost: 0, expires_at: '' }
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low'>('all')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<typeof emptyProduct & { id?: string }>(emptyProduct)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = () => listProducts().then(setProducts).finally(() => setLoading(false))
  useEffect(() => { refresh() }, [])

  const filtered = useMemo(() => products.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (filter === 'all' || product.quantity <= product.minimum_stock)
  }), [products, search, filter])

  const openForm = (product?: Product) => {
    setForm(product ? { ...product, expires_at: product.expires_at || '' } : emptyProduct)
    setError(''); setModal(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    try {
      await saveProduct({ ...form, quantity: Number(form.quantity), minimum_stock: Number(form.minimum_stock), unit_cost: Number(form.unit_cost), expires_at: form.expires_at || null })
      setModal(false); await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.') }
  }

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

      {modal && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><div className="modal-heading"><div><span className="modal-icon"><PackageOpen size={20} /></span><div><h2 id="product-modal-title">{form.id ? 'Editar produto' : 'Novo produto'}</h2><p>Preencha as informações do item.</p></div></div><button onClick={() => setModal(false)} aria-label="Fechar"><X size={20} /></button></div><form onSubmit={submit} className="modal-form"><div className="field-grid"><label className="field full"><span>Nome do produto *</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Filé de frango" autoFocus /></label><label className="field"><span>Categoria *</span><input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex.: Proteínas" /></label><label className="field"><span>SKU / código</span><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="PRO-001" /></label><label className="field"><span>Unidade *</span><select required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option value="un">Unidade (un)</option><option value="kg">Quilograma (kg)</option><option value="g">Grama (g)</option><option value="l">Litro (l)</option><option value="ml">Mililitro (ml)</option><option value="cx">Caixa (cx)</option><option value="pct">Pacote (pct)</option></select></label><label className="field"><span>Estoque atual *</span><input required min="0" step="0.01" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></label><label className="field"><span>Estoque mínimo *</span><input required min="0" step="0.01" type="number" value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: Number(e.target.value) })} /></label><label className="field"><span>Custo unitário (R$)</span><input min="0" step="0.01" type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></label><label className="field"><span>Data de validade</span><input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></label></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="button">{form.id ? 'Salvar alterações' : 'Cadastrar produto'}</button></div></form></div></div>}
    </div>
  )
}
