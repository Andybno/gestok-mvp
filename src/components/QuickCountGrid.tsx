import { useMemo, useState } from 'react'
import { AlertCircle, Check, Minus, PackageOpen, Plus, RotateCcw } from 'lucide-react'
import { registerMovement } from '../lib/api'
import { ProductThumb } from './ProductThumb'
import type { Product } from '../types'

type Props = {
  products: Product[]
  /** Chamado depois de salvar, para a lista de produtos recarregar o saldo. */
  onApplied: () => Promise<unknown> | void
}

const WEIGHT_UNITS = new Set(['kg', 'g', 'l', 'ml'])

/** Produtos por unidade/caixa/pacote andam de 1 em 1; por peso ou volume, de 0,1 em 0,1. */
function stepFor(unit: string) {
  return WEIGHT_UNITS.has(unit) ? 0.1 : 1
}

/** Evita sobras de ponto flutuante como 0.1 + 0.2 = 0.30000000000000004. */
function round(value: number) {
  return Math.round(value * 100) / 100
}

/**
 * Grade de contagem rápida: cada clique só acumula um ajuste pendente por
 * produto (entrada se positivo, saída se negativo). Nada é gravado até o
 * cliente confirmar em "Salvar contagem".
 */
export function QuickCountGrid({ products, onApplied }: Props) {
  const [deltas, setDeltas] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ product: string; message: string }[]>([])
  const [savedCount, setSavedCount] = useState(0)

  const changed = useMemo(() => products.filter((product) => deltas[product.id]), [products, deltas])

  const clearFeedback = () => { setErrors([]); setSavedCount(0) }

  const adjust = (product: Product, amount: number) => {
    clearFeedback()
    setDeltas((current) => ({ ...current, [product.id]: round((current[product.id] || 0) + amount) }))
  }

  const setExact = (product: Product, value: number) => {
    clearFeedback()
    setDeltas((current) => ({ ...current, [product.id]: Number.isFinite(value) ? round(value) : 0 }))
  }

  const discard = () => { setDeltas({}); clearFeedback() }

  const save = async () => {
    setSaving(true)
    const nextErrors: { product: string; message: string }[] = []
    let applied = 0
    for (const product of changed) {
      const delta = deltas[product.id]
      if (!delta) continue
      try {
        await registerMovement({ product_id: product.id, type: delta > 0 ? 'entry' : 'exit', quantity: Math.abs(delta), reason: 'Contagem manual' })
        applied += 1
      } catch (cause) {
        nextErrors.push({ product: product.name, message: cause instanceof Error ? cause.message : 'Não foi possível registrar.' })
      }
    }
    setDeltas((current) => {
      const rest = { ...current }
      for (const product of changed) if (!nextErrors.some((item) => item.product === product.name)) delete rest[product.id]
      return rest
    })
    setErrors(nextErrors)
    setSavedCount(applied)
    setSaving(false)
    if (applied) await onApplied()
  }

  return (
    <div className="quick-count">
      {products.length ? (
        <div className="quick-count-grid">
          {products.map((product) => {
            const delta = deltas[product.id] || 0
            const step = stepFor(product.unit)
            return (
              <div className={`quick-count-card${delta ? ' changed' : ''}`} key={product.id}>
                <div className="quick-count-head">
                  <ProductThumb name={product.name} photoPath={product.photo_path} />
                  <div><strong>{product.name}</strong><small>Atual: {product.quantity.toLocaleString('pt-BR')} {product.unit}</small></div>
                </div>
                <div className="quick-count-controls">
                  <button type="button" onClick={() => adjust(product, -step)} aria-label={`Diminuir ${product.name}`}><Minus size={16} /></button>
                  <input type="number" step={step} value={delta} onChange={(e) => setExact(product, e.target.valueAsNumber)} aria-label={`Ajuste pendente de ${product.name}`} />
                  <button type="button" onClick={() => adjust(product, step)} aria-label={`Aumentar ${product.name}`}><Plus size={16} /></button>
                </div>
                {delta !== 0 && <small className={`quick-count-delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? 'Entrada' : 'Saída'} de {Math.abs(delta).toLocaleString('pt-BR')} {product.unit}</small>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty-state"><span><PackageOpen size={28} /></span><h3>Nenhum produto para contar</h3><p>Ajuste a busca ou os filtros acima.</p></div>
      )}

      {(changed.length > 0 || savedCount > 0 || errors.length > 0) && (
        <div className="quick-count-bar">
          <div className="quick-count-bar-copy">
            {errors.length > 0 && <span className="quick-count-bar-error"><AlertCircle size={15} /> {errors.map((item) => `${item.product}: ${item.message}`).join(' · ')}</span>}
            {savedCount > 0 && !changed.length && !errors.length && <span className="quick-count-bar-success"><Check size={15} /> {savedCount} {savedCount === 1 ? 'produto atualizado' : 'produtos atualizados'}.</span>}
            {changed.length > 0 && <span>{changed.length} {changed.length === 1 ? 'produto alterado' : 'produtos alterados'}</span>}
          </div>
          {changed.length > 0 && <div className="quick-count-actions">
            <button type="button" className="button button-ghost" onClick={discard} disabled={saving}><RotateCcw size={15} /> Descartar</button>
            <button type="button" className="button" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar contagem'}</button>
          </div>}
        </div>
      )}
    </div>
  )
}
