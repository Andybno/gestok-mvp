import { AlertCircle, ArrowRight, ClipboardCheck, X } from 'lucide-react'
import { ProductThumb } from './ProductThumb'
import type { ScanAdjustment } from '../types'

type Ignored = { name: string; reason: string }

type Props = {
  adjustments: ScanAdjustment[]
  ignored: Ignored[]
  applying: boolean
  onCancel: () => void
  onConfirm: () => void
}

const number = (value: number) => value.toLocaleString('pt-BR')

/** Double check obrigatório: nada é escrito no estoque antes desta confirmação. */
export function ScanConfirmModal({ adjustments, ignored, applying, onCancel, onConfirm }: Props) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="scan-confirm-title">
        <div className="modal-heading">
          <div><span className="modal-icon"><ClipboardCheck size={20} /></span><div><h2 id="scan-confirm-title">Confirme a contagem</h2><p>Revise as mudanças antes de atualizar o estoque.</p></div></div>
          <button type="button" onClick={onCancel} aria-label="Fechar" disabled={applying}><X size={20} /></button>
        </div>

        <div className="modal-form">
          {adjustments.length ? (
            <ul className="confirm-list">
              {adjustments.map((adjustment) => (
                <li key={adjustment.product.id}>
                  <ProductThumb name={adjustment.product.name} photoPath={adjustment.product.photo_path} size="sm" />
                  <div className="confirm-copy">
                    <strong>{adjustment.product.name}</strong>
                    <small>{number(adjustment.current)} <ArrowRight size={12} /> {number(adjustment.counted)} {adjustment.product.unit}</small>
                  </div>
                  <span className={`confirm-delta ${adjustment.delta > 0 ? 'up' : 'down'}`}>
                    {adjustment.delta > 0 ? '+' : '−'}{number(Math.abs(adjustment.delta))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="form-warning"><AlertCircle size={16} /> Nenhum item da contagem está pronto para atualizar o estoque.</div>
          )}

          {ignored.length > 0 && (
            <div className="confirm-ignored">
              <strong>Não serão alterados ({ignored.length})</strong>
              <ul>{ignored.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}</span><small>{item.reason}</small></li>)}</ul>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onCancel} disabled={applying}>Voltar e revisar</button>
            <button type="button" className="button" onClick={onConfirm} disabled={applying || !adjustments.length}>
              {applying ? 'Aplicando...' : `Aplicar ${adjustments.length} ${adjustments.length === 1 ? 'item' : 'itens'} ao estoque`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
