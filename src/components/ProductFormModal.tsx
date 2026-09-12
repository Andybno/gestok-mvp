import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, Camera, ImagePlus, LoaderCircle, PackageOpen, Sparkles, Trash2, X } from 'lucide-react'
import { describeProductPhoto, productPhotoUrl, removeProductPhoto, saveProduct, uploadProductPhoto } from '../lib/api'
import type { Product, ProductVisualSignature } from '../types'

const emptyProduct = { name: '', category: '', sku: '', unit: 'un', quantity: 0, minimum_stock: 0, unit_cost: 0, expires_at: '' }

type ProductForm = typeof emptyProduct & {
  id?: string
  photo_path?: string | null
  visual_signature?: ProductVisualSignature | null
  signature_model?: string | null
  signature_updated_at?: string | null
}

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

/** Nome sugerido a partir da ficha, para a foto adiantar o cadastro. */
function suggestedName(signature: ProductVisualSignature) {
  return [signature.brand, signature.product_kind, signature.package_size].filter(Boolean).join(' ').trim()
}

function signatureChips(signature: ProductVisualSignature) {
  return [signature.brand, signature.package_type, signature.package_size, ...signature.dominant_colors].filter(Boolean)
}

export function ProductFormModal({ product, defaultName = '', stacked = false, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProductForm>(product ? { ...product, expires_at: product.expires_at || '' } : { ...emptyProduct, name: defaultName })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [photoUrl, setPhotoUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [photoNotice, setPhotoNotice] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef('')

  // Carrega a foto já cadastrada por URL assinada; o preview local vem do File.
  useEffect(() => {
    if (!product?.photo_path) return
    let active = true
    productPhotoUrl(product.photo_path)
      .then((url) => { if (active) setPhotoUrl(url) })
      .catch(() => undefined)
    return () => { active = false }
  }, [product?.photo_path])

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }, [])

  const choosePhoto = async (selected?: File) => {
    if (!selected) return
    if (!selected.type.startsWith('image/')) return setError('Envie uma imagem JPG, PNG ou WEBP.')
    if (selected.size > 10 * 1024 * 1024) return setError('A imagem deve ter no máximo 10 MB.')

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = URL.createObjectURL(selected)
    setPhotoUrl(objectUrlRef.current)
    setError(''); setPhotoNotice(''); setAnalyzing(true)

    const previousPath = form.photo_path
    try {
      const path = await uploadProductPhoto(selected)
      setForm((current) => ({ ...current, photo_path: path }))
      if (previousPath && previousPath !== path) await removeProductPhoto(previousPath).catch(() => undefined)

      const { signature, model } = await describeProductPhoto(path)
      setForm((current) => ({
        ...current,
        visual_signature: signature,
        signature_model: model,
        signature_updated_at: new Date().toISOString(),
        name: current.name.trim() ? current.name : suggestedName(signature),
      }))
      if (!signature.usable_for_matching) {
        setPhotoNotice('Esta foto dificilmente será reconhecida na contagem. Tente uma foto mais nítida, com a embalagem de frente e bem iluminada.')
      }
    } catch (cause) {
      // A ficha é opcional: sem ela o produto entra no catálogo sem reconhecimento.
      setPhotoNotice(cause instanceof Error ? cause.message : 'Não foi possível ler as características da foto. O produto pode ser salvo mesmo assim.')
    } finally {
      setAnalyzing(false)
    }
  }

  const clearPhoto = async () => {
    const path = form.photo_path
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = '' }
    setPhotoUrl(''); setPhotoNotice('')
    setForm((current) => ({ ...current, photo_path: null, visual_signature: null, signature_model: null, signature_updated_at: null }))
    if (path) await removeProductPhoto(path).catch(() => undefined)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSaving(true)
    try {
      const saved = await saveProduct({ ...form, quantity: Number(form.quantity), minimum_stock: Number(form.minimum_stock), unit_cost: Number(form.unit_cost), expires_at: form.expires_at || null })
      onSaved(saved)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.')
    } finally { setSaving(false) }
  }

  const signature = form.visual_signature

  return (
    <div className={`modal-backdrop${stacked ? ' modal-backdrop-stacked' : ''}`} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <div className="modal-heading">
          <div><span className="modal-icon"><PackageOpen size={20} /></span><div><h2 id="product-modal-title">{form.id ? 'Editar produto' : 'Novo produto'}</h2><p>Preencha as informações do item.</p></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="photo-field">
            {photoUrl ? (
              <div className="photo-preview">
                <img src={photoUrl} alt={`Foto de ${form.name || 'produto'}`} />
                {analyzing && <span className="photo-analyzing"><LoaderCircle className="spin" size={16} /> Lendo as características...</span>}
              </div>
            ) : (
              <button type="button" className="photo-placeholder" onClick={() => photoInputRef.current?.click()}>
                <Camera size={24} />
                <strong>Adicionar foto</strong>
                <small>A IA usa a foto para reconhecer este produto na contagem</small>
              </button>
            )}
            <div className="photo-details">
              {signature ? (
                <>
                  <span className="photo-badge"><Sparkles size={14} /> Ficha visual gerada</span>
                  <div className="signature-chips">{signatureChips(signature).map((chip) => <span key={chip}>{chip}</span>)}</div>
                  {signature.distinctive_marks && <small>{signature.distinctive_marks}</small>}
                </>
              ) : (
                <small>Sem ficha visual: este produto não será reconhecido automaticamente na contagem por foto.</small>
              )}
              <div className="photo-actions">
                <button type="button" className="button button-ghost" onClick={() => photoInputRef.current?.click()} disabled={analyzing}>
                  <ImagePlus size={16} /> {form.photo_path ? 'Trocar foto' : 'Escolher foto'}
                </button>
                {form.photo_path && <button type="button" className="icon-button danger" onClick={clearPhoto} disabled={analyzing} aria-label="Remover foto"><Trash2 size={16} /></button>}
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => choosePhoto(e.target.files?.[0])} />
          </div>
          {photoNotice && <div className="form-warning"><AlertCircle size={16} /> {photoNotice}</div>}

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
            <button className="button" disabled={saving || analyzing}>{saving ? 'Salvando...' : analyzing ? 'Analisando foto...' : form.id ? 'Salvar alterações' : 'Cadastrar produto'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
