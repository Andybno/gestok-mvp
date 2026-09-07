import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import type { Product } from '../types'

type Props = {
  products: Product[]
  value: string
  onChange: (productId: string) => void
  /** Chamado ao pedir o cadastro de um novo produto; recebe o termo digitado. */
  onCreate: (query: string) => void
  id?: string
}

export function ProductCombobox({ products, value, onChange, onCreate, id = 'product-combobox' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapper = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const selected = products.find((product) => product.id === value) || null

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return products
    return products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(term))
  }, [products, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const openList = () => { setOpen(true); setQuery(''); setHighlight(0); requestAnimationFrame(() => input.current?.focus()) }

  const changeQuery = (next: string) => { setQuery(next); setHighlight(0) }

  const select = (product: Product) => { onChange(product.id); setOpen(false); setQuery('') }

  const create = () => { setOpen(false); onCreate(query.trim()) }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((i) => Math.min(i + 1, matches.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)) }
    else if (event.key === 'Enter') {
      event.preventDefault()
      if (matches[highlight]) select(matches[highlight])
      else create()
    } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
  }

  return (
    <div className="product-combobox" ref={wrapper}>
      <button type="button" id={id} className="product-combobox-trigger" onClick={() => (open ? setOpen(false) : openList())} aria-haspopup="listbox" aria-expanded={open}>
        {selected
          ? <span className="product-combobox-value"><strong>{selected.name}</strong><small>atual: {selected.quantity.toLocaleString('pt-BR')} {selected.unit}</small></span>
          : <span className="product-combobox-placeholder">Selecione um produto</span>}
        <ChevronDown size={17} />
      </button>

      {open && (
        <div className="product-combobox-panel">
          <label className="product-combobox-search">
            <Search size={16} />
            <input ref={input} value={query} onChange={(e) => changeQuery(e.target.value)} onKeyDown={onKeyDown} placeholder="Buscar por nome, SKU ou categoria" aria-label="Buscar produto" autoComplete="off" />
          </label>
          <ul className="product-combobox-list" role="listbox" aria-label="Produtos">
            {matches.map((product, index) => (
              <li key={product.id}>
                <button type="button" role="option" aria-selected={product.id === value} className={`${index === highlight ? 'highlight' : ''}${product.id === value ? ' selected' : ''}`} onMouseEnter={() => setHighlight(index)} onClick={() => select(product)}>
                  <span className="product-combobox-initial">{product.name.slice(0, 2).toUpperCase()}</span>
                  <span className="product-combobox-copy">
                    <strong>{product.name}</strong>
                    <small>{product.category || 'Sem categoria'} · saldo {product.quantity.toLocaleString('pt-BR')} {product.unit}</small>
                  </span>
                  {product.id === value && <Check size={16} />}
                </button>
              </li>
            ))}
            {!matches.length && <li className="product-combobox-empty">Nenhum produto encontrado{query.trim() && <> para “{query.trim()}”</>}.</li>}
          </ul>
          <button type="button" className="product-combobox-create" onClick={create}>
            <Plus size={16} /> {query.trim() ? <>Cadastrar “{query.trim()}”</> : 'Cadastrar novo produto'}
          </button>
        </div>
      )}
    </div>
  )
}
