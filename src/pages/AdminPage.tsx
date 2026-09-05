import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, BarChart3, Box, CalendarDays, CheckCircle2, ChevronRight, Clock3, Eye, LogOut, Megaphone, MousePointerClick, PackageCheck, PencilLine, RotateCcw, Search, ShieldCheck, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import { completeUserOnboarding, getAdminOverview, getAdminUserDetail, setAdminAdCampaignMetrics, setAdminUserAnalyticsExclusion } from '../lib/api'
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
  ['operation_type', 'Tipo de operação'], ['employees_count', 'Tamanho da equipe'], ['inventory_method', 'Controle atual'],
  ['main_challenge', 'Principal problema'], ['inventory_frequency', 'Frequência do inventário'], ['role', 'Canal de contato preferido'],
  ['estimated_loss', 'Melhor período para demonstração'], ['whatsapp', 'Telefone'], ['email', 'E-mail'], ['marketing_consent', 'Marketing'],
]

const funnelLabels: Record<string, string> = {
  operation_type: 'Tipo de operação',
  units_count: 'Tamanho da equipe',
  inventory_method: 'Controle atual',
  main_challenge: 'Principal problema',
  sku_count: 'Frequência do inventário',
  sales_channels: 'Canal de contato',
  whatsapp: 'Período da demonstração',
  email: 'Telefone',
  contact_consent: 'E-mail e consentimento LGPD',
}

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
  const [updatingExclusion, setUpdatingExclusion] = useState(false)
  const [confirmingExclusion, setConfirmingExclusion] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [editingAdMetrics, setEditingAdMetrics] = useState(false)
  const [savingAdMetrics, setSavingAdMetrics] = useState(false)
  const [adMetricsDraft, setAdMetricsDraft] = useState({ reach: '0', impressions: '0', link_clicks: '0' })
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getAdminOverview().then((next) => {
      setOverview(next)
      setAdMetricsDraft({ reach: String(next.ad_metrics?.reach || 0), impressions: String(next.ad_metrics?.impressions || 0), link_clicks: String(next.ad_metrics?.link_clicks || 0) })
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o painel.'))
  }, [])

  const activeUsers = useMemo(() => (overview?.users || []).filter((user) => !user.excluded_from_analytics), [overview])
  const excludedCount = (overview?.users.length || 0) - activeUsers.length
  const users = useMemo(() => (overview?.users || []).filter((user) => (showExcluded || !user.excluded_from_analytics) && `${user.full_name} ${user.business_name} ${user.email}`.toLowerCase().includes(search.toLowerCase())), [overview, search, showExcluded])

  const openUser = async (userId: string) => {
    setDetailLoading(true); setConfirmingExclusion(false); setError('')
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

  const updateUserExclusion = async (excluded: boolean) => {
    if (!detail) return
    setUpdatingExclusion(true); setError('')
    try {
      await setAdminUserAnalyticsExclusion(detail.user.id, excluded)
      const [nextOverview, nextDetail] = await Promise.all([getAdminOverview(), getAdminUserDetail(detail.user.id)])
      setOverview(nextOverview); setDetail(nextDetail); setConfirmingExclusion(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a participação deste usuário nas análises.')
    } finally { setUpdatingExclusion(false) }
  }

  const saveAdMetrics = async (event: FormEvent) => {
    event.preventDefault()
    const reach = Math.max(0, Number.parseInt(adMetricsDraft.reach, 10) || 0)
    const impressions = Math.max(0, Number.parseInt(adMetricsDraft.impressions, 10) || 0)
    const linkClicks = Math.max(0, Number.parseInt(adMetricsDraft.link_clicks, 10) || 0)
    setSavingAdMetrics(true); setError('')
    try {
      await setAdminAdCampaignMetrics(reach, impressions, linkClicks)
      const nextOverview = await getAdminOverview()
      setOverview(nextOverview); setEditingAdMetrics(false)
      setAdMetricsDraft({ reach: String(nextOverview.ad_metrics?.reach || 0), impressions: String(nextOverview.ad_metrics?.impressions || 0), link_clicks: String(nextOverview.ad_metrics?.link_clicks || 0) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as métricas dos anúncios.')
    } finally { setSavingAdMetrics(false) }
  }

  const leave = async () => { await signOut(); navigate('/') }

  if (!overview && !error) return <div className="app-loader"><span /><p>Preparando indicadores administrativos...</p></div>

  const base = Math.max(overview?.started || 0, 1)
  const adMetrics = overview?.ad_metrics || { reach: 0, impressions: 0, link_clicks: 0, site_visits: 0, updated_at: null }
  const ratio = (count: number, reference: number, suffix: string) => reference > 0 ? `${Math.round((count / reference) * 100)}% ${suffix}` : 'Aguardando dados'
  const funnel = overview ? [
    { key: 'ad-reach', label: 'Pessoas alcançadas', count: adMetrics.reach, denominator: adMetrics.reach, detail: adMetrics.reach ? 'Topo do anúncio' : 'Atualize com dados da Meta', kind: 'ad' },
    { key: 'ad-click', label: 'Cliques no link', count: adMetrics.link_clicks, denominator: adMetrics.reach, detail: ratio(adMetrics.link_clicks, adMetrics.reach, 'do alcance'), kind: 'ad' },
    { key: 'ad-visit', label: 'Visitas vindas do anúncio', count: adMetrics.site_visits, denominator: adMetrics.link_clicks, detail: ratio(adMetrics.site_visits, adMetrics.link_clicks, 'dos cliques'), kind: 'ad' },
    { key: 'diagnostic-start', label: 'Iniciaram o diagnóstico', count: overview.started, denominator: adMetrics.site_visits || overview.started, detail: adMetrics.site_visits ? ratio(overview.started, adMetrics.site_visits, 'das visitas') : 'Base do diagnóstico', kind: 'start' },
    ...overview.question_steps.map((step) => ({ ...step, label: funnelLabels[step.key] || step.label, denominator: base, detail: `${Math.round((step.count / base) * 100)}% do início`, kind: 'question' })),
    { key: 'account', label: 'Conta criada', count: overview.accounts_created, denominator: base, detail: ratio(overview.accounts_created, base, 'do início'), kind: 'milestone' },
    { key: 'onboarding-scheduled', label: 'Onboarding agendado', count: overview.scheduled_onboardings, denominator: base, detail: ratio(overview.scheduled_onboardings, base, 'do início'), kind: 'milestone' },
    { key: 'onboarding-completed', label: 'Acesso liberado', count: overview.completed_onboardings, denominator: base, detail: ratio(overview.completed_onboardings, base, 'do início'), kind: 'milestone' },
    { key: 'product', label: 'Primeiro produto cadastrado', count: overview.product_users, denominator: base, detail: ratio(overview.product_users, base, 'do início'), kind: 'milestone' },
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

          <section className="panel admin-ads-panel">
            <div className="panel-heading"><div><h2>Métricas dos anúncios</h2><p>Compare a entrega da Meta com as visitas identificadas automaticamente no site.</p></div><button type="button" className="button button-ghost button-sm" onClick={() => setEditingAdMetrics((current) => !current)}><PencilLine size={15} /> {editingAdMetrics ? 'Cancelar' : 'Atualizar Meta Ads'}</button></div>
            <div className="admin-ad-metrics">
              <div><span className="stat-icon purple"><Users /></span><small>Pessoas alcançadas</small><strong>{adMetrics.reach}</strong><em>Dado da Meta</em></div>
              <div><span className="stat-icon blue"><Megaphone /></span><small>Impressões</small><strong>{adMetrics.impressions}</strong><em>Dado da Meta</em></div>
              <div><span className="stat-icon amber"><MousePointerClick /></span><small>Cliques no link</small><strong>{adMetrics.link_clicks}</strong><em>{adMetrics.impressions ? `${((adMetrics.link_clicks / adMetrics.impressions) * 100).toFixed(1)}% CTR` : 'Dado da Meta'}</em></div>
              <div><span className="stat-icon green"><Activity /></span><small>Visitas do anúncio</small><strong>{adMetrics.site_visits}</strong><em>UTM/Meta no site</em></div>
            </div>
            {editingAdMetrics && <form className="admin-ad-form" onSubmit={saveAdMetrics}><label>Alcance<input type="number" min="0" inputMode="numeric" value={adMetricsDraft.reach} onChange={(event) => setAdMetricsDraft((current) => ({ ...current, reach: event.target.value }))} /></label><label>Impressões<input type="number" min="0" inputMode="numeric" value={adMetricsDraft.impressions} onChange={(event) => setAdMetricsDraft((current) => ({ ...current, impressions: event.target.value }))} /></label><label>Cliques no link<input type="number" min="0" inputMode="numeric" value={adMetricsDraft.link_clicks} onChange={(event) => setAdMetricsDraft((current) => ({ ...current, link_clicks: event.target.value }))} /></label><button className="button button-sm" disabled={savingAdMetrics}>{savingAdMetrics ? 'Salvando...' : 'Salvar métricas'}</button></form>}
            <p className="admin-ad-note">As visitas são contadas automaticamente quando a URL contém UTMs da campanha ou identificador da Meta. Alcance, impressões e cliques oficiais podem ser copiados do Gerenciador de Anúncios; a sincronização automática exige acesso à Marketing API.</p>
          </section>

          <section className="admin-grid">
            <article className="panel admin-funnel-panel">
              <div className="panel-heading"><div><h2>Análise do funil</h2><p>Usuários que responderam cada pergunta e avançaram no produto.</p></div><span className="admin-live"><span /> Em tempo real</span></div>
              <div className="admin-funnel">
                {funnel.map((step, index) => <div className={`admin-funnel-row ${step.kind}`} key={step.key}>
                  <span className="funnel-index">{step.kind === 'question' ? index - 3 : <ChevronRight size={14} />}</span>
                  <div className="funnel-label"><strong>{step.label}</strong><small>{step.detail}</small></div>
                  <div className="funnel-track"><span style={{ width: `${step.count ? Math.max(3, Math.min(100, (step.count / Math.max(step.denominator, 1)) * 100)) : 0}%` }} /></div>
                  <b>{step.count}</b>
                </div>)}
              </div>
            </article>

            <aside className="panel admin-activity-panel">
              <div className="panel-heading"><div><h2>Atividade recente</h2><p>Último acesso registrado por usuário.</p></div><Clock3 size={18} /></div>
              <div className="admin-activity-list">{activeUsers.slice(0, 6).map((user) => <button key={user.id} onClick={() => openUser(user.id)}><span className="avatar">{user.full_name.slice(0, 1)}</span><span><strong>{user.full_name}</strong><small>{user.business_name}</small></span><time>{lastSeenLabel(user.last_seen_at)}</time></button>)}</div>
            </aside>
          </section>

          <section className="table-panel admin-users-panel">
            <div className="panel-heading admin-users-heading"><div><h2>Usuários da plataforma</h2><p>Consulte atividade, assinatura e dados operacionais.</p></div><div className="admin-user-tools"><button type="button" className={`button button-ghost button-sm ${showExcluded ? 'selected' : ''}`} onClick={() => setShowExcluded((current) => !current)}>{showExcluded ? 'Ocultar removidos' : `Mostrar removidos (${excludedCount})`}</button><label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuário ou estabelecimento" /></label></div></div>
            <div className="responsive-table"><table><thead><tr><th>Usuário</th><th>Análise</th><th>Onboarding</th><th>Assinatura</th><th>Produtos</th><th>Movimentações</th><th>Último acesso</th><th>Conta criada</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className={user.excluded_from_analytics ? 'admin-user-excluded' : ''}><td><div className="product-cell"><span>{user.full_name.slice(0, 2).toUpperCase()}</span><div><strong>{user.full_name}</strong><small>{user.business_name} · {user.email}</small></div></div></td><td><span className={`analytics-status ${user.excluded_from_analytics ? 'excluded' : ''}`}>{user.excluded_from_analytics ? 'Removido' : 'Incluído'}</span></td><td><span className={`onboarding-status ${user.onboarding_status}`}>{onboardingLabels[user.onboarding_status]}</span>{user.onboarding_scheduled_at && <small className="admin-schedule-date">{fullDate.format(new Date(user.onboarding_scheduled_at))}</small>}</td><td><span className={`admin-status ${user.subscription_status}`}>{statusLabels[user.subscription_status]}</span></td><td><strong>{user.products_count}</strong></td><td>{user.movements_count}</td><td><span className="last-seen"><span />{lastSeenLabel(user.last_seen_at)}</span></td><td className="muted">{fullDate.format(new Date(user.created_at))}</td><td><button className="admin-view-button" onClick={() => openUser(user.id)}><Eye size={15} /> Visualizar</button></td></tr>)}</tbody></table></div>
          </section>
        </>}
      </main>

      {(detail || detailLoading) && <div className="admin-drawer-backdrop" onClick={() => !detailLoading && setDetail(null)}><aside className="admin-drawer" onClick={(event) => event.stopPropagation()} aria-label="Detalhes do usuário">
        {detailLoading ? <div className="content-loader">Carregando dados do usuário...</div> : detail && <>
          <div className="admin-drawer-header"><div><span className="avatar">{detail.user.full_name.slice(0, 1)}</span><span><h2>{detail.user.full_name}</h2><p>{detail.user.business_name} · {detail.user.email}</p></span></div><button className="icon-button" onClick={() => setDetail(null)} aria-label="Fechar"><X size={19} /></button></div>
          <div className="admin-drawer-body">
            <div className="admin-detail-summary"><div><small>Último acesso</small><strong>{lastSeenLabel(detail.user.last_seen_at)}</strong><span>{fullDate.format(new Date(detail.user.last_seen_at))}</span></div><div><small>Assinatura</small><strong>{statusLabels[detail.user.subscription_status]}</strong><span>Desde {fullDate.format(new Date(detail.user.created_at))}</span></div><div><small>Uso do estoque</small><strong>{detail.user.products_count} produtos</strong><span>{detail.user.movements_count} movimentações</span></div><div><small>Onboarding</small><strong>{onboardingLabels[detail.user.onboarding_status]}</strong><span>{detail.user.onboarding_scheduled_at ? fullDate.format(new Date(detail.user.onboarding_scheduled_at)) : 'Horário ainda não escolhido'}</span></div></div>

            <section className={`admin-onboarding-action ${detail.user.onboarding_status}`}><span><CalendarDays /></span><div><small>Liberação da ferramenta</small><strong>{detail.user.onboarding_status === 'completed' ? 'Acesso já liberado' : detail.user.onboarding_status === 'scheduled' ? 'Reunião de onboarding agendada' : 'Aguardando agendamento do usuário'}</strong><p>{detail.user.onboarding_status === 'completed' ? 'O usuário já pode acessar todas as funções da Gestok.' : detail.user.onboarding_scheduled_at ? `Horário: ${fullDate.format(new Date(detail.user.onboarding_scheduled_at))}. Libere o acesso depois da reunião.` : 'Quando o usuário escolher um horário, ele aparecerá aqui.'}</p></div>{detail.user.onboarding_status !== 'completed' && <button type="button" className="button button-sm" onClick={releaseUser} disabled={releasing}>{releasing ? 'Liberando...' : <><CheckCircle2 size={15} /> Liberar acesso</>}</button>}</section>

            <section className={`admin-exclusion-action ${detail.user.excluded_from_analytics ? 'excluded' : ''}`}><span>{detail.user.excluded_from_analytics ? <RotateCcw /> : <UserMinus />}</span><div><small>Participação nas análises</small><strong>{detail.user.excluded_from_analytics ? 'Usuário removido dos indicadores' : 'Usuário incluído nos indicadores'}</strong><p>{detail.user.excluded_from_analytics ? 'A conta e os dados continuam intactos. Restaure quando quiser.' : 'Use esta opção para retirar contas de teste dos totais e do funil sem apagar nada.'}</p></div>{detail.user.excluded_from_analytics ? <button type="button" className="button button-ghost button-sm" onClick={() => updateUserExclusion(false)} disabled={updatingExclusion}>{updatingExclusion ? 'Restaurando...' : 'Restaurar nas análises'}</button> : confirmingExclusion ? <div className="admin-exclusion-confirm"><button type="button" className="button button-ghost button-sm" onClick={() => setConfirmingExclusion(false)}>Cancelar</button><button type="button" className="button button-danger button-sm" onClick={() => updateUserExclusion(true)} disabled={updatingExclusion}>{updatingExclusion ? 'Removendo...' : 'Confirmar remoção'}</button></div> : <button type="button" className="button button-ghost button-sm" onClick={() => setConfirmingExclusion(true)}>Remover da análise</button>}</section>

            <section className="admin-detail-section"><h3>Respostas do diagnóstico</h3>{detail.lead ? <div className="admin-answer-grid">{answerLabels.map(([key, label]) => <div key={key}><small>{label}</small><strong>{answerValue(detail.lead?.[key])}</strong></div>)}</div> : <p className="admin-empty-copy">Este usuário não possui diagnóstico vinculado.</p>}</section>

            <section className="admin-detail-section"><h3>Produtos cadastrados <span>{detail.products.length}</span></h3>{detail.products.length ? <div className="admin-detail-table"><table><thead><tr><th>Produto</th><th>Saldo</th><th>Mínimo</th><th>Valor</th></tr></thead><tbody>{detail.products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.category} · {product.sku || 'Sem SKU'}</small></td><td>{product.quantity} {product.unit}</td><td>{product.minimum_stock} {product.unit}</td><td>{money.format(product.quantity * product.unit_cost)}</td></tr>)}</tbody></table></div> : <p className="admin-empty-copy">Nenhum produto cadastrado.</p>}</section>

            <section className="admin-detail-section"><h3>Movimentações recentes <span>{detail.movements.length}</span></h3>{detail.movements.length ? <div className="admin-detail-table"><table><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Quantidade</th></tr></thead><tbody>{detail.movements.map((movement) => <tr key={movement.id}><td>{fullDate.format(new Date(movement.created_at))}</td><td><strong>{movement.product?.name || 'Produto'}</strong></td><td>{movement.type === 'entry' ? 'Entrada' : movement.type === 'exit' ? 'Saída' : 'Ajuste'}</td><td>{movement.quantity} {movement.product?.unit}</td></tr>)}</tbody></table></div> : <p className="admin-empty-copy">Nenhuma movimentação registrada.</p>}</section>
          </div>
        </>}
      </aside></div>}
    </div>
  )
}
