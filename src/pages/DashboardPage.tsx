import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BrainCircuit, CircleDollarSign, Package, Plus, Repeat2, TrendingDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listMovements, listProducts } from '../lib/api'
import type { Product, StockMovement } from '../types'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function DashboardPage() {
  const { profile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listProducts(), listMovements()]).then(([p, m]) => { setProducts(p); setMovements(m) }).finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const value = products.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0)
    const low = products.filter((item) => item.quantity <= item.minimum_stock)
    const exits = movements.filter((item) => item.type === 'exit').reduce((sum, item) => sum + item.quantity, 0)
    return { value, low, exits }
  }, [products, movements])

  if (loading) return <div className="content-loader">Carregando indicadores...</div>

  return (
    <div className="dashboard-page">
      <div className="page-title-row"><div><span className="kicker">Resumo de hoje</span><h1>Olá, {profile?.full_name?.split(' ')[0] || 'gestor'}!</h1><p>Aqui está o pulso do estoque da {profile?.business_name || 'sua operação'}.</p></div><div className="page-actions"><Link className="button button-ghost" to="/app/movimentacoes"><Repeat2 size={17} /> Nova movimentação</Link><Link className="button" to="/app/produtos"><Plus size={17} /> Novo produto</Link></div></div>

      <div className="stats-grid">
        <article className="stat-card"><span className="stat-icon green"><CircleDollarSign /></span><div><small>Valor em estoque</small><strong>{money.format(stats.value)}</strong><em className="positive"><ArrowUpRight size={14} /> estimativa atual</em></div></article>
        <article className="stat-card"><span className="stat-icon blue"><Package /></span><div><small>Itens cadastrados</small><strong>{products.length}</strong><em>{products.length ? `${products.filter((p) => p.quantity > p.minimum_stock).length} em nível saudável` : 'Comece seu cadastro'}</em></div></article>
        <article className="stat-card"><span className="stat-icon amber"><AlertTriangle /></span><div><small>Estoque baixo</small><strong>{stats.low.length}</strong><em className={stats.low.length ? 'negative' : 'positive'}>{stats.low.length ? 'precisam de atenção' : 'tudo em ordem'}</em></div></article>
        <article className="stat-card"><span className="stat-icon purple"><TrendingDown /></span><div><small>Saídas registradas</small><strong>{stats.exits.toLocaleString('pt-BR')}</strong><em><ArrowDownRight size={14} /> no histórico recente</em></div></article>
      </div>

      <div className="dashboard-grid">
        <section className="panel consumption-panel">
          <div className="panel-heading"><div><h2>Movimentação da semana</h2><p>Volume registrado por dia</p></div><select aria-label="Período"><option>Últimos 7 dias</option></select></div>
          <div className="chart-area"><div className="chart-labels"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="big-bars">{[45, 68, 54, 82, 64, 91, 58].map((height, index) => <div key={index}><i style={{ height: `${height}%` }} /><span>{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][index]}</span></div>)}</div></div>
        </section>

        <section className="panel alerts-panel">
          <div className="panel-heading"><div><h2>Itens em atenção</h2><p>Abaixo do estoque mínimo</p></div><span className="count-badge">{stats.low.length}</span></div>
          <div className="alert-list">
            {stats.low.length ? stats.low.slice(0, 4).map((product) => <div key={product.id}><span className="product-initial">{product.name.slice(0, 2).toUpperCase()}</span><div><strong>{product.name}</strong><small>Mínimo: {product.minimum_stock} {product.unit}</small></div><em>{product.quantity} {product.unit}</em></div>) : <div className="empty-mini"><Package size={25} /><span>Nenhum item com estoque baixo.</span></div>}
          </div>
          <Link className="panel-link" to="/app/produtos">Ver todos os produtos <ArrowRight size={15} /></Link>
        </section>

        <section className="panel recent-panel">
          <div className="panel-heading"><div><h2>Atividade recente</h2><p>Últimas entradas e saídas</p></div><Link to="/app/movimentacoes">Ver histórico</Link></div>
          <div className="movement-list">
            {movements.slice(0, 5).map((movement) => <div key={movement.id}><span className={`movement-icon ${movement.type}`}>{movement.type === 'entry' ? <ArrowDownRight /> : <ArrowUpRight />}</span><div><strong>{movement.product?.name || 'Produto'}</strong><small>{movement.reason} · {shortDate.format(new Date(movement.created_at))}</small></div><em className={movement.type}>{movement.type === 'entry' ? '+' : '-'}{movement.quantity} {movement.product?.unit}</em></div>)}
          </div>
        </section>

        <section className="ai-card"><span className="ai-badge"><BrainCircuit size={15} /> Beta</span><h2>Conte seu estoque com uma foto.</h2><p>Envie uma imagem das prateleiras e deixe a IA preparar uma contagem para revisão.</p><Link to="/app/contagem-ia">Testar contagem inteligente <ArrowRight size={16} /></Link><div className="ai-decoration"><span /><span /><span /></div></section>
      </div>
    </div>
  )
}
