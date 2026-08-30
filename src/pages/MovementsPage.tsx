import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, Filter, PackageOpen, Plus, Repeat2, Search, X } from 'lucide-react'
import { listMovements, listProducts, registerMovement } from '../lib/api'
import type { Product, StockMovement } from '../types'

const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function MovementsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [type, setType] = useState<'entry' | 'exit' | 'adjustment'>('entry')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('Compra')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = () => Promise.all([listProducts(), listMovements()]).then(([p, m]) => { setProducts(p); setMovements(m) }).finally(() => setLoading(false))
  useEffect(() => { refresh() }, [])

  const filtered = useMemo(() => movements.filter((movement) => {
    const text = `${movement.product?.name} ${movement.reason} ${movement.notes}`.toLowerCase()
    return text.includes(search.toLowerCase()) && (typeFilter === 'all' || movement.type === typeFilter)
  }), [movements, search, typeFilter])

  const open = (movementType: 'entry' | 'exit' | 'adjustment' = 'entry') => {
    setType(movementType); setProductId(products[0]?.id || ''); setQuantity(1); setReason(movementType === 'entry' ? 'Compra' : movementType === 'exit' ? 'Produção' : 'Contagem'); setNotes(''); setError(''); setModal(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    try {
      await registerMovement({ product_id: productId, type, quantity: Number(quantity), reason, notes })
      setModal(false); await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar.') }
  }

  return (
    <div className="movements-page">
      <div className="page-title-row"><div><span className="kicker">Histórico operacional</span><h1>Entradas e saídas</h1><p>Registre cada mudança para manter o saldo sempre confiável.</p></div><div className="page-actions"><button className="button button-ghost entry-button" onClick={() => open('entry')}><ArrowDownLeft size={17} /> Nova entrada</button><button className="button exit-button" onClick={() => open('exit')}><ArrowUpRight size={17} /> Nova saída</button></div></div>
      <div className="movement-summary"><div><span className="movement-icon entry"><ArrowDownLeft /></span><div><small>Entradas no histórico</small><strong>{movements.filter((m) => m.type === 'entry').length}</strong></div></div><div><span className="movement-icon exit"><ArrowUpRight /></span><div><small>Saídas no histórico</small><strong>{movements.filter((m) => m.type === 'exit').length}</strong></div></div><div><span className="movement-icon adjustment"><Repeat2 /></span><div><small>Ajustes de contagem</small><strong>{movements.filter((m) => m.type === 'adjustment').length}</strong></div></div></div>
      <div className="toolbar"><label className="search-box"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto, motivo ou observação" /></label><label className="filter-select"><Filter size={16} /><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">Todos os tipos</option><option value="entry">Entradas</option><option value="exit">Saídas</option><option value="adjustment">Ajustes</option></select></label></div>
      <section className="table-panel">
        {loading ? <div className="content-loader">Carregando movimentações...</div> : filtered.length ? <div className="responsive-table"><table><thead><tr><th>Data e hora</th><th>Produto</th><th>Tipo</th><th>Quantidade</th><th>Motivo</th><th>Observação</th></tr></thead><tbody>{filtered.map((movement) => <tr key={movement.id}><td className="muted">{date.format(new Date(movement.created_at))}</td><td><div className="product-cell"><span>{(movement.product?.name || 'P').slice(0, 2).toUpperCase()}</span><strong>{movement.product?.name || 'Produto removido'}</strong></div></td><td><span className={`movement-type ${movement.type}`}>{movement.type === 'entry' ? <ArrowDownLeft size={14} /> : movement.type === 'exit' ? <ArrowUpRight size={14} /> : <Repeat2 size={14} />}{movement.type === 'entry' ? 'Entrada' : movement.type === 'exit' ? 'Saída' : 'Ajuste'}</span></td><td><strong className={movement.type}>{movement.type === 'entry' ? '+' : movement.type === 'exit' ? '-' : ''}{movement.quantity.toLocaleString('pt-BR')} {movement.product?.unit}</strong></td><td>{movement.reason}</td><td className="muted">{movement.notes || '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state"><span><PackageOpen size={28} /></span><h3>Nenhuma movimentação</h3><p>Registre uma entrada ou saída para começar o histórico.</p><button className="button" onClick={() => open()}><Plus size={17} /> Nova movimentação</button></div>}
      </section>

      {modal && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="movement-modal-title"><div className="modal-heading"><div><span className={`modal-icon ${type}`}><Repeat2 size={20} /></span><div><h2 id="movement-modal-title">Registrar movimentação</h2><p>O saldo do produto será atualizado automaticamente.</p></div></div><button onClick={() => setModal(false)} aria-label="Fechar"><X size={20} /></button></div><form onSubmit={submit} className="modal-form"><div className="movement-type-picker"><button type="button" className={type === 'entry' ? 'active entry' : ''} onClick={() => { setType('entry'); setReason('Compra') }}><ArrowDownLeft /> Entrada</button><button type="button" className={type === 'exit' ? 'active exit' : ''} onClick={() => { setType('exit'); setReason('Produção') }}><ArrowUpRight /> Saída</button><button type="button" className={type === 'adjustment' ? 'active adjustment' : ''} onClick={() => { setType('adjustment'); setReason('Contagem') }}><Repeat2 /> Ajuste</button></div><div className="field-grid"><label className="field full"><span>Produto *</span><select required value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Selecione um produto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — atual: {product.quantity} {product.unit}</option>)}</select></label><label className="field"><span>{type === 'adjustment' ? 'Novo saldo' : 'Quantidade'} *</span><input required min="0.01" step="0.01" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label><label className="field"><span>Motivo *</span><select required value={reason} onChange={(e) => setReason(e.target.value)}>{type === 'entry' ? <><option>Compra</option><option>Devolução</option><option>Transferência recebida</option><option>Outro</option></> : type === 'exit' ? <><option>Produção</option><option>Perda / descarte</option><option>Validade</option><option>Transferência enviada</option><option>Outro</option></> : <><option>Contagem</option><option>Correção de cadastro</option><option>Outro</option></>}</select></label><label className="field full"><span>Observação</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes opcionais desta movimentação" /></label></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="button">Registrar {type === 'entry' ? 'entrada' : type === 'exit' ? 'saída' : 'ajuste'}</button></div></form></div></div>}
    </div>
  )
}
