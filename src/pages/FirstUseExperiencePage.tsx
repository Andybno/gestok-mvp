import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ImagePlus, LoaderCircle, PackagePlus, ScanLine, ShieldCheck, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import { analyzeGuidedInventoryImage, completeFirstUseExperience, confirmInventoryScan, linkProductScan, listProducts, registerMovement, saveProduct, trackProductJourneyEvent } from '../lib/api'
import type { InventoryImageAnalysis, Product, ProductIdentityProfile, ProductVisualSignature } from '../types'

type Draft = {
  name: string
  category: string
  unit: string
  minimum_stock: number
  unit_cost: number
}

const emptyDraft: Draft = { name: '', category: '', unit: 'un', minimum_stock: 0, unit_cost: 0 }
const stageCopy = ['Boas-vindas', 'Produto', 'Foto de referência', 'Revisão do cadastro', 'Produto cadastrado', 'Produto da contagem', 'Tipo de contagem', 'Preparação', 'Foto do estoque', 'Revisão da contagem', 'Tudo pronto']

function validImage(file: File) {
  if (!file.type.startsWith('image/')) return 'Escolha uma imagem JPG, PNG ou WEBP.'
  if (file.size > 10 * 1024 * 1024) return 'A imagem deve ter no máximo 10 MB.'
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

export function FirstUseExperiencePage() {
  const navigate = useNavigate()
  const { profile, refreshProfile } = useAuth()
  const productCameraRef = useRef<HTMLInputElement>(null)
  const productGalleryRef = useRef<HTMLInputElement>(null)
  const countCameraRef = useRef<HTMLInputElement>(null)
  const countGalleryRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState(0)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [productPhotos, setProductPhotos] = useState<File[]>([])
  const [productPreviews, setProductPreviews] = useState<string[]>([])
  const [productConsent, setProductConsent] = useState(false)
  const [productAnalysis, setProductAnalysis] = useState<InventoryImageAnalysis | null>(null)
  const [productProfile, setProductProfile] = useState<ProductIdentityProfile | null>(null)
  const [countMode, setCountMode] = useState<'ai' | 'manual' | null>(null)
  const [countPhoto, setCountPhoto] = useState<File | null>(null)
  const [countPreview, setCountPreview] = useState('')
  const [countConsent, setCountConsent] = useState(false)
  const [countAnalysis, setCountAnalysis] = useState<InventoryImageAnalysis | null>(null)
  const [quantity, setQuantity] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selectedProduct = products.find((product) => product.id === selectedProductId)
  const progress = Math.min(100, Math.max(5, (stage / (stageCopy.length - 1)) * 100))

  useEffect(() => { void trackProductJourneyEvent('first_use_started', { source: 'guided_flow' }).catch(() => undefined) }, [])

  const go = (next: number) => { setError(''); setStage(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const goBack = () => go(Math.max(0, stage - 1))

  const chooseProductPhotos = (selected?: FileList | null) => {
    const incoming = Array.from(selected || [])
    if (!incoming.length) return
    const issue = incoming.map(validImage).find(Boolean)
    if (issue) return setError(issue)
    if (productPhotos.length + incoming.length > 5) return setError('Você pode cadastrar no máximo 5 fotos por produto.')
    setProductPhotos((current) => [...current, ...incoming])
    setProductPreviews((current) => [...current, ...incoming.map((file) => URL.createObjectURL(file))])
    setProductAnalysis(null); setProductConsent(false); setError('')
  }

  const removeProductPhoto = (index: number) => {
    URL.revokeObjectURL(productPreviews[index])
    setProductPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))
    setProductPreviews((current) => current.filter((_, photoIndex) => photoIndex !== index))
    setProductAnalysis(null); setProductConsent(false)
  }

  const chooseCountPhoto = (file?: File) => {
    if (!file) return
    const issue = validImage(file)
    if (issue) return setError(issue)
    if (countPreview) URL.revokeObjectURL(countPreview)
    setCountPhoto(file); setCountPreview(URL.createObjectURL(file)); setCountAnalysis(null); setCountConsent(false); setError(''); go(8)
  }

  const analyzeProduct = async () => {
    if (!productPhotos.length || !productConsent) return
    setBusy(true); setError('')
    try {
      await trackProductJourneyEvent('product_reference_photo_submitted', { product_name: draft.name, photo_count: productPhotos.length })
      const analysis = await analyzeGuidedInventoryImage(productPhotos, { action: 'product_setup', productName: draft.name, imageReviewConsent: true })
      setProductAnalysis(analysis)
      if (!analysis.quality.acceptable || !analysis.product_profile) {
        await trackProductJourneyEvent('product_reference_photo_rejected', { reason: analysis.quality.reason, score: analysis.quality.score })
        return
      }
      setProductProfile(analysis.product_profile)
      setDraft((current) => ({ ...current, category: analysis.product_profile?.category || current.category, unit: analysis.product_profile?.suggested_unit || current.unit }))
      await trackProductJourneyEvent('product_reference_photo_accepted', { score: analysis.quality.score })
      go(3)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível analisar a foto.') }
    finally { setBusy(false) }
  }

  const saveFirstProduct = async (event: FormEvent) => {
    event.preventDefault()
    if (!productAnalysis?.quality.acceptable || !productAnalysis.product_profile) return setError('A foto de referência precisa ser aprovada antes do cadastro.')
    setBusy(true); setError('')
    try {
      const product = await saveProduct({
        ...draft, quantity: 0, sku: '', expires_at: null,
        reference_image_path: productAnalysis.image_path,
        reference_image_paths: productAnalysis.image_paths,
        ai_identity_profile: productProfile,
        ai_profile_scan_id: productAnalysis.scan_id,
        visual_signature: visualSignature(productAnalysis.product_profile),
        signature_model: 'guided-reference-v1',
        signature_updated_at: new Date().toISOString(),
      })
      await linkProductScan(productAnalysis.scan_id, product.id)
      const nextProducts = await listProducts()
      setProducts(nextProducts); setSelectedProductId(product.id)
      await trackProductJourneyEvent('first_product_created', { product_id: product.id, with_ai_profile: true })
      go(4)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar o produto.') }
    finally { setBusy(false) }
  }

  const startAnotherProduct = () => {
    setDraft(emptyDraft); setProductPhotos([]); setProductAnalysis(null); setProductProfile(null); setProductConsent(false)
    productPreviews.forEach((preview) => URL.revokeObjectURL(preview))
    setProductPreviews([]); go(1)
  }

  const selectMode = async (mode: 'ai' | 'manual') => {
    setCountMode(mode); setQuantity(selectedProduct?.quantity || 0)
    await trackProductJourneyEvent('first_count_method_selected', { method: mode, product_id: selectedProductId }).catch(() => undefined)
    go(7)
  }

  const analyzeCount = async () => {
    if (!countPhoto || !countConsent || !selectedProduct) return
    setBusy(true); setError('')
    try {
      await trackProductJourneyEvent('inventory_photo_submitted', { product_id: selectedProduct.id, first_use: true })
      const analysis = await analyzeGuidedInventoryImage(countPhoto, { action: 'inventory_count', productId: selectedProduct.id, productName: selectedProduct.name, imageReviewConsent: true })
      setCountAnalysis(analysis)
      if (!analysis.quality.acceptable || !analysis.items[0]) {
        await trackProductJourneyEvent('inventory_photo_rejected', { product_id: selectedProduct.id, reason: analysis.quality.reason, score: analysis.quality.score })
        return
      }
      setQuantity(analysis.items[0].estimated_quantity)
      await trackProductJourneyEvent('inventory_count_generated', { product_id: selectedProduct.id, confidence: analysis.items[0].confidence })
      go(9)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível contar o produto.') }
    finally { setBusy(false) }
  }

  const finishCount = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedProduct || quantity < 0) return
    setBusy(true); setError('')
    try {
      if (countMode === 'ai' && countAnalysis) await confirmInventoryScan(countAnalysis.scan_id, selectedProduct.id, quantity)
      else await registerMovement({ product_id: selectedProduct.id, type: 'adjustment', quantity, reason: 'Contagem manual', notes: 'Primeira contagem guiada' })
      await trackProductJourneyEvent('first_count_confirmed', { product_id: selectedProduct.id, method: countMode, quantity })
      await completeFirstUseExperience()
      await trackProductJourneyEvent('first_use_completed', { product_id: selectedProduct.id, method: countMode })
      await refreshProfile()
      go(10)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a contagem.') }
    finally { setBusy(false) }
  }

  return <div className="first-use-shell">
    <header className="first-use-header"><Brand compact /><div><small>{stageCopy[stage]}</small><strong>{Math.round(progress)}%</strong></div></header>
    <div className="first-use-progress"><span style={{ width: `${progress}%` }} /></div>
    <main className="first-use-main">
      {stage > 0 && stage < 10 && <button type="button" className="first-use-back" onClick={goBack}><ArrowLeft size={17} /> Voltar</button>}
      {error && <div className="form-error"><AlertCircle size={17} /> {error}</div>}

      {stage === 0 && <section className="first-use-card first-use-welcome"><span className="first-use-hero-icon"><Sparkles /></span><small>PRIMEIROS PASSOS</small><h1>Seja bem-vindo, {profile?.full_name?.split(' ')[0] || 'gestor'}!</h1><p>Vamos cadastrar um produto e fazer sua primeira contagem juntos. Você verá uma etapa por vez e poderá revisar tudo antes de atualizar o estoque.</p><ul><li><CheckCircle2 /> Foto de referência do produto</li><li><CheckCircle2 /> Contagem por IA ou manual</li><li><ShieldCheck /> Nenhum saldo muda sem sua confirmação</li></ul><button className="button button-lg" onClick={() => go(1)}>Vamos iniciar <ArrowRight size={18} /></button></section>}

      {stage === 1 && <section className="first-use-card"><span className="step-chip">1 · Cadastre seu primeiro produto</span><h1>Qual é o nome do produto?</h1><p>Use o nome que sua equipe reconhece no dia a dia.</p><label className="field first-use-field"><span>Nome do produto *</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Óleo de soja 900 ml" autoFocus /></label><button className="button button-lg" disabled={!draft.name.trim()} onClick={() => go(2)}>Continuar <ArrowRight size={18} /></button></section>}

      {stage === 2 && <section className="first-use-card"><span className="step-chip">2 · Fotos obrigatórias</span><h1>Fotografe o produto de vários ângulos</h1><p>Envie de 1 a 5 fotos de <strong>{draft.name}</strong>. Quanto mais lados visíveis, melhor a IA poderá diferenciá-lo de produtos parecidos.</p><div className="photo-guidance"><div><Check /> Comece pela frente e pelo rótulo</div><div><Check /> Acrescente laterais, tampa ou verso</div><div><Check /> Uma unidade por foto, com boa luz</div></div>{productPreviews.length > 0 && <div className="reference-photo-grid">{productPreviews.map((preview, index) => <div key={preview}><img src={preview} alt={`Ângulo ${index + 1} de ${draft.name}`} /><span>Foto {index + 1}</span><button type="button" onClick={() => removeProductPhoto(index)} aria-label={`Remover foto ${index + 1}`}>×</button></div>)}</div>}<div className="guided-photo-actions"><button className="camera-primary" disabled={productPhotos.length >= 5} onClick={() => productCameraRef.current?.click()}><Camera size={28} /><strong>{productPhotos.length ? 'Tirar outro ângulo' : 'Abrir câmera'}</strong><small>{productPhotos.length}/5 fotos</small></button><button className="gallery-secondary" disabled={productPhotos.length >= 5} onClick={() => productGalleryRef.current?.click()}><ImagePlus size={21} /> Escolher da galeria</button></div><input ref={productCameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { chooseProductPhotos(event.target.files); event.currentTarget.value = '' }} /><input ref={productGalleryRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { chooseProductPhotos(event.target.files); event.currentTarget.value = '' }} />{productPhotos.length > 0 && <label className="image-consent"><input type="checkbox" checked={productConsent} onChange={(event) => setProductConsent(event.target.checked)} /><span><strong>Autorizo o uso destas fotos no piloto da contagem por IA.</strong><small>As imagens serão armazenadas de forma privada e poderão ser revisadas pela equipe Gestok para validar e melhorar o recurso beta. Evite fotografar pessoas.</small></span></label>}{productAnalysis && !productAnalysis.quality.acceptable && <div className="photo-quality-card bad"><AlertCircle /><div><strong>O conjunto precisa ser melhorado</strong><p>{productAnalysis.quality.reason}</p><small>{productAnalysis.quality.guidance}</small></div></div>}<button className="button button-lg" disabled={!productPhotos.length || !productConsent || busy} onClick={analyzeProduct}>{busy ? <><LoaderCircle className="spin" /> Avaliando {productPhotos.length} {productPhotos.length === 1 ? 'foto' : 'fotos'}...</> : <><Sparkles /> Avaliar fotos e continuar</>}</button></section>}

      {stage === 3 && <section className="first-use-card"><span className="step-chip">3 · Revise o cadastro</span><h1>A IA preparou o produto</h1><p>Confira os dados antes de salvar. Você poderá alterá-los depois.</p>{productProfile && <div className="ai-profile-summary"><Sparkles /><div><strong>{productProfile.packaging}</strong><p>{productProfile.visual_markers.join(' · ')}</p><small>{productProfile.counting_guidance}</small></div></div>}<form onSubmit={saveFirstProduct}><div className="field-grid"><label className="field full"><span>Produto *</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span>Categoria *</span><input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label><label className="field"><span>Unidade *</span><select value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })}><option value="un">Unidade</option><option value="kg">Quilograma</option><option value="g">Grama</option><option value="l">Litro</option><option value="ml">Mililitro</option><option value="cx">Caixa</option><option value="pct">Pacote</option></select></label><label className="field"><span>Estoque mínimo</span><input type="number" min="0" step="0.01" value={draft.minimum_stock} onChange={(event) => setDraft({ ...draft, minimum_stock: Number(event.target.value) })} /></label><label className="field"><span>Custo unitário</span><input type="number" min="0" step="0.01" value={draft.unit_cost} onChange={(event) => setDraft({ ...draft, unit_cost: Number(event.target.value) })} /></label></div><button className="button button-lg" disabled={busy}>{busy ? 'Salvando...' : <><PackagePlus /> Cadastrar produto</>}</button></form></section>}

      {stage === 4 && <section className="first-use-card first-use-success"><span><Check /></span><small>PRODUTO CADASTRADO</small><h1>{selectedProduct?.name || draft.name} está pronto</h1><p>A referência visual foi salva. Quer cadastrar mais um produto ou seguir para a primeira contagem?</p><div className="first-use-two-actions"><button className="button button-ghost button-lg" onClick={startAnotherProduct}><PackagePlus /> Cadastrar outro</button><button className="button button-lg" onClick={() => go(5)}>Fazer primeira contagem <ArrowRight /></button></div></section>}

      {stage === 5 && <section className="first-use-card"><span className="step-chip">4 · Escolha o produto</span><h1>Qual produto deseja contar?</h1><p>Selecione um item cadastrado. A contagem atualizará somente esse produto.</p><div className="guided-product-list">{products.map((product) => <button key={product.id} className={selectedProductId === product.id ? 'selected' : ''} onClick={() => setSelectedProductId(product.id)}><span>{product.name.slice(0, 2).toUpperCase()}</span><div><strong>{product.name}</strong><small>{product.category} · {product.unit}</small></div>{selectedProductId === product.id && <Check />}</button>)}</div><button className="button button-lg" disabled={!selectedProductId} onClick={() => go(6)}>Continuar <ArrowRight /></button></section>}

      {stage === 6 && <section className="first-use-card"><span className="step-chip">5 · Método</span><h1>Como deseja realizar a contagem?</h1><p>Você sempre revisa o resultado antes de atualizar o saldo.</p><div className="count-method-grid"><button onClick={() => void selectMode('ai')}><span><Sparkles /></span><strong>Contar com IA</strong><p>Fotografe a área e receba uma estimativa.</p><em>Recomendado</em></button><button onClick={() => void selectMode('manual')}><span><ScanLine /></span><strong>Preencher manualmente</strong><p>Digite a quantidade contada pela equipe.</p></button></div></section>}

      {stage === 7 && countMode === 'ai' && <section className="first-use-card"><span className="step-chip">6 · Prepare a foto</span><h1>Uma área por vez</h1><p>Para contar <strong>{selectedProduct?.name}</strong>, deixe todas as unidades visíveis e fotografe a prateleira de frente.</p><div className="camera-instructions"><div><span>1</span><p><strong>Ilumine bem</strong>Evite sombras e reflexos.</p></div><div><span>2</span><p><strong>Afaste obstáculos</strong>Não misture objetos na frente.</p></div><div><span>3</span><p><strong>Enquadre a área toda</strong>Não corte produtos nas bordas.</p></div></div><div className="guided-photo-actions"><button className="camera-primary" onClick={() => countCameraRef.current?.click()}><Camera size={28} /><strong>Abrir câmera</strong><small>Fotografar agora</small></button><button className="gallery-secondary" onClick={() => countGalleryRef.current?.click()}><ImagePlus size={21} /> Escolher da galeria</button></div><input ref={countCameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => chooseCountPhoto(event.target.files?.[0])} /><input ref={countGalleryRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseCountPhoto(event.target.files?.[0])} /></section>}

      {stage === 7 && countMode === 'manual' && <section className="first-use-card"><span className="step-chip">6 · Contagem manual</span><h1>Quantas unidades você contou?</h1><p>Informe o saldo total atual de <strong>{selectedProduct?.name}</strong>.</p><form onSubmit={(event) => { event.preventDefault(); go(9) }}><label className="quantity-field"><input type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} autoFocus /><span>{selectedProduct?.unit}</span></label><button className="button button-lg">Revisar contagem <ArrowRight /></button></form></section>}

      {stage === 8 && <section className="first-use-card"><span className="step-chip">7 · Foto do estoque</span><h1>A foto ficou boa?</h1><p>Confira se todas as unidades de <strong>{selectedProduct?.name}</strong> aparecem antes de enviar.</p>{countPreview && <div className="guided-photo-preview large"><img src={countPreview} alt="Área do estoque para contagem" /><button type="button" className="button button-ghost" onClick={() => countCameraRef.current?.click()}><Camera /> Refazer foto</button></div>}<input ref={countCameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => chooseCountPhoto(event.target.files?.[0])} />{countPhoto && <label className="image-consent"><input type="checkbox" checked={countConsent} onChange={(event) => setCountConsent(event.target.checked)} /><span><strong>Autorizo o uso desta foto no piloto da contagem por IA.</strong><small>A imagem ficará privada e poderá ser revisada pela equipe Gestok. Evite incluir pessoas ou informações sensíveis.</small></span></label>}{countAnalysis && !countAnalysis.quality.acceptable && <div className="photo-quality-card bad"><AlertCircle /><div><strong>A IA pediu uma nova foto</strong><p>{countAnalysis.quality.reason}</p><small>{countAnalysis.quality.guidance}</small></div></div>}<button className="button button-lg" disabled={!countConsent || busy} onClick={analyzeCount}>{busy ? <><LoaderCircle className="spin" /> Avaliando e contando...</> : <><Sparkles /> Enviar para a IA contar</>}</button></section>}

      {stage === 9 && <section className="first-use-card"><span className="step-chip">8 · Confirmação</span><h1>Você concorda com a contagem?</h1><p>Ajuste se necessário. O estoque só será atualizado quando você confirmar.</p>{countAnalysis?.items[0] && <div className="ai-count-evidence"><Sparkles /><div><strong>{Math.round(countAnalysis.items[0].confidence * 100)}% de confiança</strong><p>{countAnalysis.items[0].visual_evidence}</p><small>{countAnalysis.items[0].note}</small></div></div>}<form onSubmit={finishCount}><label className="quantity-field"><input type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /><span>{selectedProduct?.unit}</span></label><p className="stock-change-copy">Saldo atual: {selectedProduct?.quantity.toLocaleString('pt-BR')} {selectedProduct?.unit} → novo saldo: <strong>{quantity.toLocaleString('pt-BR')} {selectedProduct?.unit}</strong></p><button className="button button-lg" disabled={busy}>{busy ? 'Atualizando estoque...' : <><Check /> Confirmar e atualizar estoque</>}</button></form></section>}

      {stage === 10 && <section className="first-use-card first-use-success"><span><Check /></span><small>PRIMEIRA CONTAGEM CONCLUÍDA</small><h1>Seu estoque está atualizado</h1><p>Da próxima vez, use os botões <strong>Contar com IA</strong> ou <strong>Contagem manual</strong> diretamente na página de Produtos.</p><button className="button button-lg" onClick={() => navigate('/app/produtos', { replace: true })}>Ir para meus produtos <ArrowRight /></button></section>}
    </main>
  </div>
}
