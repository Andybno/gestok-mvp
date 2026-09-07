import { useState, type FormEvent } from 'react'
import { PackageOpen, X } from 'lucide-react'
import { saveProduct } from '../lib/api'
import type { Product } from '../types'

const emptyProduct = { name: '', category: '', sku: '', unit: 'un', quantity: 0, minimum_stock: 0, unit_cost: 0, expires_at: '' }

type ProductForm = typeof emptyProduct & { id?: string }

type Props = {
  /** Produto existente para edição. Ausente = novo cadastro. */
  product?: Product | null
  /** Nome pré-preenchido (usado quando a busca não encontra o item). */
  defaultName?: string
  /** Empilha acima de outro modal já aberto. */
  stacked?: boolean
  onClose: () => void
  onSaved: (product: Product) => void
}

export function ProductFormModal({ product, defaultName = '', stacked = false, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProductForm>(product ? { ...product, expires_at: product.expires_at || '' } : { ...emptyProduct, name: defaultName })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSaving(true)
    try {
      const saved = await saveProduct({ ...form, quantity: Number(form.quantity), minimum_stock: Number(form.minimum_stock), unit_cost: Number(form.unit_cost), expires_at: form.expires_at || null })
      onSaved(saved)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.')
    } finally { setSaving(false) }
  }

  return (
    <div className={`modal-backdrop${stacked ? ' modal-backdrop-stacked' : ''}`} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <div className="modal-heading">
          <div><span className="modal-icon"><PackageOpen size={20} /></span><div><h2 id="product-modal-title">{form.id ? 'Editar produto' : 'Novo produto'}</h2><p>Preencha as informações do item.</p></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="field-grid">
            <label className="field full"><span>Nome do produto *</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Filé de frango" autoFocus /></label>
            <label className="field"><span>Categoria *</span><input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex.: Proteínas" /></label>
            <label className="field"><span>SKU / código</span><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="PRO-001" /></label>
            <label className="field"><span>Unidade *</span><select required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option value="un">Unidade (un)</option><option value="kg">Quilograma (kg)</option><option value="g">Grama (g)</option><option value="l">Litro (l)</option><option value="ml">Mililitro (ml)</option><option value="cx">Caixa (cx)</option><option value="pct">Pacote (pct)</option></select></label>
            <label className="field"><span>Estoque atual *</span><input required min="0" step="0.01" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
            <label className="field"><span>Estoque mínimo *</span><input required min="0" step="0.01" type="number" value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: Number(e.target.value) })} /></label>
            <label className="field"><span>Custo unitário (R$)</span><input min="0" step="0.01" type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></label>
            <label className="field"><span>Data de validade</span><input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
            <button className="button" disabled={saving}>{saving ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Cadastrar produto'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
