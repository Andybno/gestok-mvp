import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, Camera, CheckCircle2, ImagePlus, LoaderCircle, PackageOpen, Sparkles, X } from 'lucide-react'
import { analyzeGuidedInventoryImage, inventoryScanImageUrl, linkProductScan, productPhotoUrl, saveProduct, trackProductJourneyEvent } from '../lib/api'
import type { InventoryImageAnalysis, Product, ProductIdentityProfile, ProductVisualSignature } from '../types'

const emptyProduct = { name: '', category: '', sku: '', unit: 'un', quantity: 0, minimum_stock: 0, unit_cost: 0, expires_at: '' }

type ProductForm = typeof emptyProduct & {
  id?: string
  photo_path?: string | null
  visual_signature?: ProductVisualSignature | null
  signature_model?: string | null
  signature_updated_at?: string | null
  reference_image_path?: string | null
  reference_image_paths?: string[]
  ai_identity_profile?: ProductIdentityProfile | null
  ai_profile_scan_id?: string | null
}

type Props = {
  product?: Product | null
  defaultName?: string
  stacked?: boolean
  onClose: () => void
  onSaved: (product: Product) => void
}

function fileIssue(file: File) {
  if (!file.type.startsWith('image/')) return 'Envie imagens JPG, PNG ou WEBP.'
  if (file.size > 10 * 1024 * 1024) return 'Cada imagem deve ter no máximo 10 MB.'
  return ''
}

function visualSignature(profile: ProductIdentityProfile): ProductVisualSignature {
  return {
    brand: profile.brand,
    product_kind: profile.category,
    package_type: profile.packaging,
    package_size: '',
    dominant_colors: profile.colors,
    label_text: profile.visual_markers,
    shape: profile.packaging,
    distinctive_marks: profile.visual_markers.join(' · '),
    photo_quality: 'boa',
    usable_for_matching: true,
  }
}

export function ProductFormModal({ product, defaultName = '', stacked = false, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProductForm>(product ? { ...product, expires_at: product.expires_at || '' } : { ...emptyProduct, name: defaultName })
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [existingUrls, setExistingUrls] = useState<string[]>([])
  const [consent, setConsent] = useState(false)
  const [analysis, setAnalysis] = useState<InventoryImageAnalysis | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef<string[]>([])

  useEffect(() => {
    let active = true
    const paths = product?.reference_image_paths?.length
      ? product.reference_image_paths
      : product?.reference_image_path ? [product.reference_image_path] : []
    if (paths.length) {
      Promise.all(paths.map(inventoryScanImageUrl)).then((urls) => { if (active) setExistingUrls(urls) }).catch(() => undefined)
    } else if (product?.photo_path) {
      productPhotoUrl(product.photo_path).then((url) => { if (active) setExistingUrls([url]) }).catch(() => undefined)
    }
    return () => { active = false }
  }, [product])

  useEffect(() => () => { previewUrlsRef.current.forEach((preview) => URL.revokeObjectURL(preview)) }, [])

  const choosePhotos = (selected?: FileList | null) => {
    const incoming = Array.from(selected || [])
    if (!incoming.length) return
    const issue = incoming.map(fileIssue).find(Boolean)
    if (issue) return setError(issue)
    if (files.length + incoming.length > 5) return setError('Você pode cadastrar no máximo 5 fotos por produto.')
    const nextPreviews = incoming.map((file) => URL.createObjectURL(file))
    previewUrlsRef.current = [...previewUrlsRef.current, ...nextPreviews]
    setFiles((current) => [...current, ...incoming])
    setPreviews((current) => [...current, ...nextPreviews])
    setConsent(false); setAnalysis(null); setError('')
  }

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(previews[index])
    previewUrlsRef.current = previewUrlsRef.current.filter((_, currentIndex) => currentIndex !== index)
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
    setPreviews((current) => current.filter((_, currentIndex) => currentIndex !== index))
    setConsent(false); setAnalysis(null)
  }

  const analyzePhotos = async () => {
    if (!form.name.trim()) return setError('Informe o nome do produto antes de analisar as fotos.')
    if (!files.length) return setError('Adicione ao menos uma foto do produto.')
    if (!consent) return setError('Confirme o uso privado das fotos para continuar.')
    setAnalyzing(true); setError('')
    try {
      await trackProductJourneyEvent('product_reference_photo_submitted', { product_name: form.name, photo_count: files.length, source: 'product_form' })
      const result = await analyzeGuidedInventoryImage(files, { action: 'product_setup', productName: form.name, imageReviewConsent: true })
      setAnalysis(result)
      if (!result.quality.acceptable || !result.product_profile) {
        await trackProductJourneyEvent('product_reference_photo_rejected', { product_name: form.name, reason: result.quality.reason, score: result.quality.score })
        return
      }
      const profile = result.product_profile
      setForm((current) => ({
        ...current,
        category: current.category || profile.category,
        unit: profile.suggested_unit || current.unit,
        reference_image_path: result.image_path,
        reference_image_paths: result.image_paths,
        ai_identity_profile: profile,
        ai_profile_scan_id: result.scan_id,
        visual_signature: visualSignature(profile),
        signature_model: 'guided-reference-v1',
        signature_updated_at: new Date().toISOString(),
      }))
      await trackProductJourneyEvent('product_reference_photo_accepted', { product_name: form.name, score: result.quality.score, photo_count: files.length })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível analisar as fotos.')
    } finally { setAnalyzing(false) }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const hasExistingReference = Boolean(form.reference_image_path || form.reference_image_paths?.length || form.photo_path || form.visual_signature)
    if (!hasExistingReference && !analysis?.quality.acceptable) return setError('A foto do produto é obrigatória. Envie e aprove ao menos uma foto.')
    if (files.length && !analysis?.quality.acceptable) return setError('Analise as fotos antes de salvar o produto.')
    setSaving(true)
    try {
      const saved = await saveProduct({ ...form, quantity: Number(form.quantity), minimum_stock: Number(form.minimum_stock), unit_cost: Number(form.unit_cost), expires_at: form.expires_at || null })
      if (analysis) await linkProductScan(analysis.scan_id, saved.id)
      await trackProductJourneyEvent(product ? 'product_updated' : 'product_created', { product_id: saved.id, photo_count: analysis?.image_paths.length || form.reference_image_paths?.length || 1 })
      onSaved(saved)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.')
    } finally { setSaving(false) }
  }

  const shownPreviews = previews.length ? previews : existingUrls

  return (
    <div className={`modal-backdrop${stacked ? ' modal-backdrop-stacked' : ''}`} role="presentation">
      <div className="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <div className="modal-heading">
          <div><span className="modal-icon"><PackageOpen size={20} /></span><div><h2 id="product-modal-title">{form.id ? 'Editar produto' : 'Novo produto'}</h2><p>A referência visual é obrigatória.</p></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="field-grid">
            <label className="field full"><span>Nome do produto *</span><input required value={form.name} onChange={(event) => { setForm({ ...form, name: event.target.value }); setAnalysis(null) }} placeholder="Ex.: Óleo de soja 900 ml" autoFocus /></label>
            <label className="field"><span>Categoria *</span><input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Ex.: Mercearia" /></label>
            <label className="field"><span>SKU / código</span><input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="MER-001" /></label>
            <label className="field"><span>Unidade *</span><select required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}><option value="un">Unidade (un)</option><option value="kg">Quilograma (kg)</option><option value="g">Grama (g)</option><option value="l">Litro (l)</option><option value="ml">Mililitro (ml)</option><option value="cx">Caixa (cx)</option><option value="pct">Pacote (pct)</option></select></label>
            <label className="field"><span>Estoque atual *</span><input required min="0" step="0.01" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></label>
            <label className="field"><span>Estoque mínimo *</span><input required min="0" step="0.01" type="number" value={form.minimum_stock} onChange={(event) => setForm({ ...form, minimum_stock: Number(event.target.value) })} /></label>
            <label className="field"><span>Custo unitário (R$)</span><input min="0" step="0.01" type="number" value={form.unit_cost} onChange={(event) => setForm({ ...form, unit_cost: Number(event.target.value) })} /></label>
            <label className="field"><span>Data de validade</span><input type="date" value={form.expires_at} onChange={(event) => setForm({ ...form, expires_at: event.target.value })} /></label>
          </div>

          <section className="product-photo-section">
            <div><span className="step-chip">Referência visual · 1 a 5 fotos</span><h3>Mostre o produto em ângulos diferentes</h3><p>Comece pela frente e pelo rótulo. Depois, acrescente laterais, verso, tampa ou detalhes que ajudem a IA a diferenciar a embalagem.</p></div>
            {shownPreviews.length > 0 && <div className="reference-photo-grid">{shownPreviews.map((preview, index) => <div key={`${preview}-${index}`}><img src={preview} alt={`Foto ${index + 1} de ${form.name || 'produto'}`} /><span>Foto {index + 1}</span>{previews.length > 0 && <button type="button" onClick={() => removePhoto(index)} aria-label={`Remover foto ${index + 1}`}>×</button>}</div>)}</div>}
            <div className="photo-guidance"><div><CheckCircle2 /> Frente e rótulo legíveis</div><div><CheckCircle2 /> Laterais, verso ou tampa</div><div><CheckCircle2 /> Uma unidade por foto e boa iluminação</div></div>
            <div className="guided-photo-actions compact">
              <button type="button" className="camera-primary" disabled={files.length >= 5 || analyzing} onClick={() => cameraRef.current?.click()}><Camera /><strong>{files.length ? 'Outro ângulo' : shownPreviews.length ? 'Substituir fotos' : 'Abrir câmera'}</strong><small>{files.length || shownPreviews.length}/5 fotos</small></button>
              <button type="button" className="gallery-secondary" disabled={files.length >= 5 || analyzing} onClick={() => galleryRef.current?.click()}><ImagePlus /> Galeria</button>
            </div>
            <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { choosePhotos(event.target.files); event.currentTarget.value = '' }} />
            <input ref={galleryRef} hidden multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { choosePhotos(event.target.files); event.currentTarget.value = '' }} />
            {files.length > 0 && <label className="image-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>Autorizo o uso privado destas fotos no piloto da IA.</strong><small>Elas poderão ser revisadas pela equipe Gestok para validar e melhorar a identificação. Evite incluir pessoas.</small></span></label>}
            {analysis && <div className={`photo-quality-card ${analysis.quality.acceptable ? 'good' : 'bad'}`}>{analysis.quality.acceptable ? <CheckCircle2 /> : <AlertCircle />}<div><strong>{analysis.quality.acceptable ? 'Referência visual aprovada' : 'As fotos precisam ser melhoradas'}</strong><p>{analysis.quality.reason}</p><small>{analysis.quality.guidance}</small></div></div>}
            {files.length > 0 && !analysis?.quality.acceptable && <button type="button" className="button button-ghost photo-analyze-button" disabled={analyzing || !consent} onClick={() => void analyzePhotos()}>{analyzing ? <><LoaderCircle className="spin" /> Analisando...</> : <><Sparkles /> Analisar {files.length} {files.length === 1 ? 'foto' : 'fotos'} com IA</>}</button>}
          </section>

          {error && <div className="form-error"><AlertCircle size={16} /> {error}</div>}
          <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button className="button" disabled={saving || analyzing || (!product && !analysis?.quality.acceptable)}>{saving ? 'Salvando...' : analyzing ? 'Analisando fotos...' : form.id ? 'Salvar alterações' : 'Cadastrar produto'}</button></div>
        </form>
      </div>
    </div>
  )
}
