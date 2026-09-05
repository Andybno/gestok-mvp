import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, Box, CalendarDays, CheckCircle2, ChevronRight, Clock3, Eye, LogOut, PackageCheck, Search, ShieldCheck, UserPlus, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import { completeUserOnboarding, getAdminOverview, getAdminUserDetail } from '../lib/api'
import type { AdminOverview, AdminUserDetail, AdminUserSummary, LeadFormData } from '../types'

const fullDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const statusLabels: Record<AdminUserSummary['subscription_status'], string> = {
  trialing: 'Teste grátis', active: 'Ativo', past_due: 'Pagamento pendente', canceled: 'Cancelado', expired: 'Teste encerrado',
}

const onboardingLabels: Record<AdminUserSummary['onboarding_status'], string> = {
  pending_booking: 'Aguardando agenda', scheduled: 'Reunião marcada', completed: 'Acesso liberado',
}

const answerLabels: Array<[keyof LeadFormData, string]> = [
  ['operation_type', 'Tipo de operação'], ['sales_channels', 'Canais de venda'], ['units_count', 'Número de unidades'],
  ['sku_count', 'Itens no estoque'], ['inventory_method', 'Controle atual'], ['main_challenge', 'Maior desafio'],
  ['whatsapp', 'Telefone'], ['email', 'E-mail'], ['marketing_consent', 'Marketing'],
]

function lastSeenLabel(value: string) {
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (diffMinutes < 2) return 'Agora'
  if (diffMinutes < 60) return `Há ${diffMinutes} min`
  const hours = Math.floor(diffMinutes / 60)
  if (hours < 24) return `Há ${hours} h`
  const days = Math.floor(hours / 24)
  return `Há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

function answerValue(value: unknown) {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  return String(value || 'Não informado')
}

export function AdminPage() {
  const { profile, isDemo, signOut } = useAuth()
  const navigate = useNavigate()
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getAdminOverview().then(setOverview).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o painel.'))
  }, [])

  const users = useMemo(() => (overview?.users || []).filter((user) => `${user.full_name} ${user.business_name} ${user.email}`.toLowerCase().includes(search.toLowerCase())), [overview, search])

  const openUser = async (userId: string) => {
    setDetailLoading(true); setError('')
    try { setDetail(await getAdminUserDetail(userId)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar este usuário.') }
    finally { setDetailLoading(false) }
  }

  const releaseUser = async () => {
    if (!detail) return
    setReleasing(true); setError('')
    try {
      await completeUserOnboarding(detail.user.id)
      const [nextOverview, nextDetail] = await Promise.all([getAdminOverview(), getAdminUserDetail(detail.user.id)])
      setOverview(nextOverview); setDetail(nextDetail)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível liberar o acesso.')
    } finally { setReleasing(false) }
  }

  const leave = async () => { await signOut(); navigate('/') }

  if (!overview && !error) return <div className="app-loader"><span /><p>Preparando indicadores administrativos...</p></div>

  const base = Math.max(overview?.started || 0, 1)
  const funnel = overview ? [
    ...overview.question_steps,
    { key: 'account', label: 'Conta criada', count: overview.accounts_created },
    { key: 'onboarding-scheduled', label: 'Onboarding agendado', count: overview.scheduled_onboardings },
    { key: 'onboarding-completed', label: 'Acesso liberado', count: overview.completed_onboardings },
    { key: 'product', label: 'Primeiro produto cadastrado', count: overview.product_users },
  ] : []
  const leadConversion = overview ? Math.round((overview.completed_leads / base) * 100) : 0

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Brand compact />
        <div className="admin-header-actions">
          {isDemo && <span className="admin-demo-badge">Modo demonstração</span>}
          <div className="admin-identity"><ShieldCheck size={18} /><span><small>Administrador</small><strong>{profile?.full_name || 'Gestok'}</strong></span></div>
          <Link className="button button-ghost button-sm" to="/app">Ver aplicativo</Link>
          <button className="icon-button" onClick={leave} aria-label="Sair"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="admin-content">
        <div className="page-title-row admin-title"><div><span className="kicker">Central de administração</span><h1>Visão da operação</h1><p>Acompanhe conversão, atividade e dados cadastrados pelos usuários.</p></div><span className="admin-updated"><Activity size={15} /> Atualizado agora</span></div>
        {error && <div className="form-error">{error}</div>}

        {overview && <>
          <section className="admin-stats">
            <article><span className="stat-icon green"><BarChart3 /></span><div><small>Iniciaram o diagnóstico</small><strong>{overview.started}</strong><em>Topo do funil</em></div></article>
            <article><span className="stat-icon blue"><PackageCheck /></span><div><small>Concluíram o formulário</small><strong>{overview.completed_leads}</strong><em>{leadConversion}% de conversão</em></div></article>
            <article><span className="stat-icon purple"><UserPlus /></span><div><small>Criaram uma conta</small><strong>{overview.accounts_created}</strong><em>{Math.round((overview.accounts_created / base) * 100)}% do total</em></div></article>
            <article><span className="stat-icon amber"><Box /></span><div><small>Cadastraram produto</small><strong>{overview.product_users}</strong><em>{Math.round((overview.product_users / Math.max(overview.accounts_created, 1)) * 100)}% das contas</em></div></article>
          </section>

          <section className="admin-grid">
            <article className="panel admin-funnel-panel">
              <div className="panel-heading"><div><h2>Análise do funil</h2><p>Usuários que responderam cada pergunta e avançaram no produto.</p></div><span className="admin-live"><span /> Em tempo real</span></div>
              <div className="admin-funnel">
                {funnel.map((step, index) => <div className={`admin-funnel-row ${index >= overview.question_steps.length ? 'milestone' : ''}`} key={step.key}>
                  <span className="funnel-index">{index < overview.question_steps.length ? index + 1 : <ChevronRight size={14} />}</span>
                  <div className="funnel-label"><strong>{step.label}</strong><small>{Math.round((step.count / base) * 100)}% do início</small></div>
                  <div className="funnel-track"><span style={{ width: `${Math.max(3, (step.count / base) * 100)}%` }} /></div>
                  <b>{step.count}</b>
                </div>)}
              </div>
            </article>

            <aside className="panel admin-activity-panel">
              <div className="panel-heading"><div><h2>Atividade recente</h2><p>Último acesso registrado por usuário.</p></div><Clock3 size={18} /></div>
              <div className="admin-activity-list">{overview.users.slice(0, 6).map((user) => <button key={user.id} onClick={() => openUser(user.id)}><span className="avatar">{user.full_name.slice(0, 1)}</span><span><strong>{user.full_name}</strong><small>{user.business_name}</small></span><time>{lastSeenLabel(user.last_seen_at)}</time></button>)}</div>
            </aside>
          </section>

          <section className="table-panel admin-users-panel">
            <div className="panel-heading admin-users-heading"><div><h2>Usuários da plataforma</h2><p>Consulte atividade, assinatura e dados operacionais.</p></div><label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuário ou estabelecimento" /></label></div>
            <div className="responsive-table"><table><thead><tr><th>Usuário</th><th>Onboarding</th><th>Assinatura</th><th>Produtos</th><th>Movimentações</th><th>Último acesso</th><th>Conta criada</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="product-cell"><span>{user.full_name.slice(0, 2).toUpperCase()}</span><div><strong>{user.full_name}</strong><small>{user.business_name} · {user.email}</small></div></div></td><td><span className={`onboarding-status ${user.onboarding_status}`}>{onboardingLabels[user.onboarding_status]}</span>{user.onboarding_scheduled_at && <small className="admin-schedule-date">{fullDate.format(new Date(user.onboarding_scheduled_at))}</small>}</td><td><span className={`admin-status ${user.subscription_status}`}>{statusLabels[user.subscription_status]}</span></td><td><strong>{user.products_count}</strong></td><td>{user.movements_count}</td><td><span className="last-seen"><span />{lastSeenLabel(user.last_seen_at)}</span></td><td className="muted">{fullDate.format(new Date(user.created_at))}</td><td><button className="admin-view-button" onClick={() => openUser(user.id)}><Eye size={15} /> Visualizar</button></td></tr>)}</tbody></table></div>
          </section>
        </>}
      </main>

      {(detail || detailLoading) && <div className="admin-drawer-backdrop" onClick={() => !detailLoading && setDetail(null)}><aside className="admin-drawer" onClick={(event) => event.stopPropagation()} aria-label="Detalhes do usuário">
        {detailLoading ? <div className="content-loader">Carregando dados do usuário...</div> : detail && <>
          <div className="admin-drawer-header"><div><span className="avatar">{detail.user.full_name.slice(0, 1)}</span><span><h2>{detail.user.full_name}</h2><p>{detail.user.business_name} · {detail.user.email}</p></span></div><button className="icon-button" onClick={() => setDetail(null)} aria-label="Fechar"><X size={19} /></button></div>
          <div className="admin-drawer-body">
            <div className="admin-detail-summary"><div><small>Último acesso</small><strong>{lastSeenLabel(detail.user.last_seen_at)}</strong><span>{fullDate.format(new Date(detail.user.last_seen_at))}</span></div><div><small>Assinatura</small><strong>{statusLabels[detail.user.subscription_status]}</strong><span>Desde {fullDate.format(new Date(detail.user.created_at))}</span></div><div><small>Uso do estoque</small><strong>{detail.user.products_count} produtos</strong><span>{detail.user.movements_count} movimentações</span></div><div><small>Onboarding</small><strong>{onboardingLabels[detail.user.onboarding_status]}</strong><span>{detail.user.onboarding_scheduled_at ? fullDate.format(new Date(detail.user.onboarding_scheduled_at)) : 'Horário ainda não escolhido'}</span></div></div>

            <section className={`admin-onboarding-action ${detail.user.onboarding_status}`}><span><CalendarDays /></span><div><small>Liberação da ferramenta</small><strong>{detail.user.onboarding_status === 'completed' ? 'Acesso já liberado' : detail.user.onboarding_status === 'scheduled' ? 'Reunião de onboarding agendada' : 'Aguardando agendamento do usuário'}</strong><p>{detail.user.onboarding_status === 'completed' ? 'O usuário já pode acessar todas as funções da Gestok.' : detail.user.onboarding_scheduled_at ? `Horário: ${fullDate.format(new Date(detail.user.onboarding_scheduled_at))}. Libere o acesso depois da reunião.` : 'Quando o usuário escolher um horário, ele aparecerá aqui.'}</p></div>{detail.user.onboarding_status !== 'completed' && <button type="button" className="button button-sm" onClick={releaseUser} disabled={releasing}>{releasing ? 'Liberando...' : <><CheckCircle2 size={15} /> Liberar acesso</>}</button>}</section>

            <section className="admin-detail-section"><h3>Respostas do diagnóstico</h3>{detail.lead ? <div className="admin-answer-grid">{answerLabels.map(([key, label]) => <div key={key}><small>{label}</small><strong>{answerValue(detail.lead?.[key])}</strong></div>)}</div> : <p className="admin-empty-copy">Este usuário não possui diagnóstico vinculado.</p>}</section>

            <section className="admin-detail-section"><h3>Produtos cadastrados <span>{detail.products.length}</span></h3>{detail.products.length ? <div className="admin-detail-table"><table><thead><tr><th>Produto</th><th>Saldo</th><th>Mínimo</th><th>Valor</th></tr></thead><tbody>{detail.products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.category} · {product.sku || 'Sem SKU'}</small></td><td>{product.quantity} {product.unit}</td><td>{product.minimum_stock} {product.unit}</td><td>{money.format(product.quantity * product.unit_cost)}</td></tr>)}</tbody></table></div> : <p className="admin-empty-copy">Nenhum produto cadastrado.</p>}</section>

            <section className="admin-detail-section"><h3>Movimentações recentes <span>{detail.movements.length}</span></h3>{detail.movements.length ? <div className="admin-detail-table"><table><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Quantidade</th></tr></thead><tbody>{detail.movements.map((movement) => <tr key={movement.id}><td>{fullDate.format(new Date(movement.created_at))}</td><td><strong>{movement.product?.name || 'Produto'}</strong></td><td>{movement.type === 'entry' ? 'Entrada' : movement.type === 'exit' ? 'Saída' : 'Ajuste'}</td><td>{movement.quantity} {movement.product?.unit}</td></tr>)}</tbody></table></div> : <p className="admin-empty-copy">Nenhuma movimentação registrada.</p>}</section>
          </div>
        </>}
      </aside></div>}
    </div>
  )
}
