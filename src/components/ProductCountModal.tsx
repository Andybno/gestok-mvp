import { useRef, useState } from 'react'
import { AlertCircle, Camera, Check, ImagePlus, ScanLine, Trash2, UploadCloud, X } from 'lucide-react'
import { applyScanCount, countProductByPhoto } from '../lib/api'
import { ProductThumb } from './ProductThumb'
import { ScanConfirmModal } from './ScanConfirmModal'
import type { Product, ScanAdjustment } from '../types'

type Props = {
  product: Product
  onClose: () => void
  /** Chamado após aplicar o ajuste, para a lista de produtos recarregar o saldo. */
  onApplied: () => void
}

/** Contagem restrita a um único produto: a foto pode ter outros itens, mas só este é considerado. */
export function ProductCountModal({ product, onClose, onApplied }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [notVisibleNote, setNotVisibleNote] = useState('')
  const [adjustment, setAdjustment] = useState<ScanAdjustment | null>(null)
  const [scanId, setScanId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  const choose = (selected?: File) => {
    if (!selected) return
    if (!selected.type.startsWith('image/')) return setError('Envie uma imagem JPG, PNG ou WEBP.')
    if (selected.size > 10 * 1024 * 1024) return setError('A imagem deve ter no máximo 10 MB.')
    if (preview) URL.revokeObjectURL(preview)
    setFile(selected); setPreview(URL.createObjectURL(selected)); setNotVisibleNote(''); setError('')
  }

  const removePhoto = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null); setPreview('')
  }

  const analyze = async () => {
    if (!file) return
    setAnalyzing(true); setError(''); setNotVisibleNote('')
    try {
      const count = await countProductByPhoto(product, file)
      setScanId(count.scan_id)
      if (!count.visible) {
        setNotVisibleNote(count.note || `Não conseguimos identificar ${product.name} com clareza nesta foto. Tente uma foto mais próxima e bem iluminada.`)
        return
      }
      const counted = count.estimated_quantity
      setAdjustment({
        item: { name: product.name, estimated_quantity: counted, unit: count.unit, confidence: count.confidence, note: count.note, product_id: product.id },
        product,
        current: product.quantity,
        counted,
        delta: counted - product.quantity,
      })
      setConfirming(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A contagem falhou. Tente com outra foto.')
    } finally {
      setAnalyzing(false)
    }
  }

  const apply = async () => {
    if (!adjustment) return
    setApplying(true); setError('')
    try {
      const result = await applyScanCount([adjustment], scanId)
      if (result.errors.length) throw new Error(result.errors[0].message)
      setConfirming(false); setApplied(true)
      onApplied()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível aplicar a contagem.')
    } finally {
      setApplying(false)
    }
  }

  if (confirming && adjustment) {
    return (
      <ScanConfirmModal
        adjustments={[adjustment]}
        ignored={[]}
        applying={applying}
        note={`Apenas ${product.name} foi contado nesta foto — qualquer outro item foi ignorado.`}
        onCancel={() => setConfirming(false)}
        onConfirm={apply}
      />
    )
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="count-modal-title">
        <div className="modal-heading">
          <div><span className="modal-icon"><ScanLine size={20} /></span><div><h2 id="count-modal-title">Contar {product.name}</h2><p>Envie uma foto do estoque; apenas este produto será contado.</p></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="modal-form">
          <div className="count-target">
            <ProductThumb name={product.name} photoPath={product.photo_path} referencePhotoPath={product.reference_image_path || product.reference_image_paths?.[0]} />
            <div><strong>{product.name}</strong><small>Estoque atual: {product.quantity.toLocaleString('pt-BR')} {product.unit}</small></div>
          </div>

          {applied ? (
            <div className="form-success"><Check size={16} /> Estoque atualizado para {adjustment?.counted.toLocaleString('pt-BR')} {product.unit}.</div>
          ) : (
            <>
              {!file ? (
                <button type="button" className="upload-zone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0]) }}>
                  <span className="upload-icon"><UploadCloud size={26} /></span>
                  <h2>Envie uma foto</h2>
                  <p>Outros produtos que aparecerem na foto serão ignorados</p>
                  <small>JPG, PNG ou WEBP · até 10 MB</small>
                  <em><ImagePlus size={16} /> Escolher imagem</em>
                </button>
              ) : (
                <div className="image-workspace">
                  <div className="image-frame">
                    <img src={preview} alt={`Foto para contar ${product.name}`} />
                    {analyzing && <div className="scan-overlay"><i /><span><ScanLine size={20} /> Contando {product.name}...</span></div>}
                  </div>
                  <div className="image-actions">
                    <div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></div>
                    <button type="button" className="icon-button" onClick={() => inputRef.current?.click()} aria-label="Trocar imagem"><Camera size={18} /></button>
                    <button type="button" className="icon-button danger" onClick={removePhoto} aria-label="Remover imagem"><Trash2 size={18} /></button>
                  </div>
                </div>
              )}
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => choose(e.target.files?.[0])} />

              {notVisibleNote && <div className="form-warning"><AlertCircle size={16} /> {notVisibleNote}</div>}
              {error && <div className="form-error"><AlertCircle size={16} /> {error}</div>}
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>{applied ? 'Fechar' : 'Cancelar'}</button>
            {!applied && <button type="button" className="button" onClick={analyze} disabled={!file || analyzing}>{analyzing ? 'Analisando...' : 'Contar com IA'}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
