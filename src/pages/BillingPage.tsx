import { useState } from 'react'
import { ArrowRight, CalendarClock, Check, CreditCard, ExternalLink, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { createCheckoutSession, openCustomerPortal } from '../lib/api'

export function BillingPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const trialEnds = new Date(profile?.trial_ends_at || Date.now() + 7 * 86400000)
  const days = Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000))
  const active = ['active', 'past_due'].includes(profile?.subscription_status || '')

  const action = async () => {
    setLoading(true); setError('')
    try { if (active) await openCustomerPortal(); else await createCheckoutSession() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o Stripe.') }
    finally { setLoading(false) }
  }

  return (
    <div className="billing-page">
      <div className="page-title-row"><div><span className="kicker">Plano e cobrança</span><h1>Sua assinatura</h1><p>Gerencie o teste e os dados de pagamento com segurança.</p></div></div>
      <div className="billing-grid">
        <section className="trial-status-panel">
          <div className="status-orb"><CalendarClock size={31} /></div>
          <span className="status-tag"><Sparkles size={14} /> {active ? 'Assinatura ativa' : 'Teste gratuito ativo'}</span>
          <h2>{active ? 'Sua operação continua organizada.' : `${days} ${days === 1 ? 'dia restante' : 'dias restantes'} para experimentar.`}</h2>
          <p>{active ? 'O plano Gestok Essencial está ativo para esta conta.' : `Seu teste termina em ${trialEnds.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}. Cadastre um cartão para que o acesso continue sem interrupção.`}</p>
          <div className="trial-timeline"><span className="done"><i><Check size={13} /></i><small>Hoje</small><strong>Conta criada</strong></span><em /><span className={active ? 'done' : ''}><i>{active ? <Check size={13} /> : '2'}</i><small>{trialEnds.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</small><strong>{active ? 'Plano ativado' : 'Fim do teste'}</strong></span></div>
        </section>

        <section className="plan-card">
          <div className="plan-card-heading"><div><span>PLANO RECOMENDADO</span><h2>Gestok Essencial</h2><p>Para operações que precisam enxergar e movimentar o estoque todos os dias.</p></div><CreditCard /></div>
          <div className="plan-price"><strong>R$ <b>99</b><sup>,90</sup></strong><span>por mês<br />por operação</span></div>
          <ul><li><Check /> Produtos ilimitados</li><li><Check /> Entradas, saídas e ajustes</li><li><Check /> Alertas de estoque mínimo</li><li><Check /> Histórico de movimentações</li><li><Check /> Contagem por foto com IA <small>beta</small></li></ul>
          {error && <div className="form-error">{error}</div>}
          <button className="button button-lg plan-action" onClick={action} disabled={loading}>{loading ? 'Abrindo ambiente seguro...' : active ? 'Gerenciar cobrança' : 'Ativar assinatura'} {active ? <ExternalLink size={17} /> : <ArrowRight size={17} />}</button>
          {!active && <p className="charge-note"><LockKeyhole size={14} /> Nenhuma cobrança hoje. O primeiro pagamento ocorre ao final do teste.</p>}
        </section>
      </div>
      <div className="billing-security"><ShieldCheck size={22} /><div><strong>Pagamento seguro pelo Stripe</strong><p>Os dados do cartão são enviados diretamente ao Stripe e não ficam armazenados na Gestok. Você poderá cancelar a renovação pelo portal de cobrança.</p></div></div>
    </div>
  )
}
