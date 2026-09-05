import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, LogOut, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import { scheduleOnboarding } from '../lib/api'
import { trackMetaOnboardingBooked } from '../lib/metaPixel'

const CAL_NAMESPACE = 'gestokOnboarding'
const CAL_LINK = 'gestokbr/onboarding'
const fullDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })

type CalApi = ((...args: unknown[]) => void) & {
  loaded?: boolean
  ns: Record<string, CalApi>
  q: unknown[][]
}

type CalEmbedEvent = {
  detail?: {
    data?: {
      startTime?: string
      uid?: string
    }
  }
}

type CalWindow = Window & typeof globalThis & {
  Cal?: CalApi
  __gestokCalListenersBound?: boolean
  __gestokCalInlineMounted?: boolean
  __gestokCalBookingHandler?: (event: CalEmbedEvent) => void
  __gestokCalReadyHandler?: () => void
}

function getCalApi() {
  const target = window as CalWindow
  if (target.Cal) return target.Cal

  const cal = ((...args: unknown[]) => {
    if (!cal.loaded) {
      const script = document.createElement('script')
      script.src = 'https://app.cal.com/embed/embed.js'
      script.async = true
      document.head.appendChild(script)
      cal.loaded = true
    }

    if (args[0] === 'init') {
      const namespace = args[1]
      const api = ((...callArgs: unknown[]) => { api.q.push(callArgs) }) as CalApi
      api.q = []
      api.ns = {}
      if (typeof namespace === 'string') {
        cal.ns[namespace] = api
        api.q.push(args)
      } else cal.q.push(args)
      return
    }
    cal.q.push(args)
  }) as CalApi

  cal.q = []
  cal.ns = {}
  target.Cal = cal
  return cal
}

export function OnboardingPage() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [embedReady, setEmbedReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isScheduled = profile?.onboarding_status === 'scheduled' && profile.onboarding_scheduled_at

  useEffect(() => {
    if (!user || !profile || profile.onboarding_status !== 'pending_booking') return
    const target = window as CalWindow
    let active = true
    const Cal = getCalApi()

    if (!Cal.ns[CAL_NAMESPACE]) Cal('init', CAL_NAMESPACE, { origin: 'https://cal.com' })
    const api = Cal.ns[CAL_NAMESPACE]

    target.__gestokCalBookingHandler = async (event) => {
      if (!active) return
      const startTime = event.detail?.data?.startTime
      const bookingUid = event.detail?.data?.uid
      if (!startTime) {
        setError('A reunião foi criada, mas não conseguimos atualizar o status. Entre novamente ou fale com nossa equipe.')
        return
      }
      setSaving(true)
      setError('')
      try {
        await scheduleOnboarding(startTime, bookingUid)
        trackMetaOnboardingBooked(bookingUid)
        await refreshProfile()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'A reunião foi criada, mas não conseguimos atualizar o status da conta.')
      } finally {
        if (active) setSaving(false)
      }
    }
    target.__gestokCalReadyHandler = () => { if (active) setEmbedReady(true) }

    if (!target.__gestokCalListenersBound) {
      api('on', { action: 'bookingSuccessfulV2', callback: (event: CalEmbedEvent) => target.__gestokCalBookingHandler?.(event) })
      api('on', { action: 'linkReady', callback: () => target.__gestokCalReadyHandler?.() })
      target.__gestokCalListenersBound = true
    }

    api('ui', { hideEventTypeDetails: false, layout: 'month_view' })
    if (!target.__gestokCalInlineMounted) {
      api('inline', {
        elementOrSelector: '#gestok-cal-inline',
        calLink: CAL_LINK,
        config: {
          layout: 'month_view',
          theme: 'light',
          name: profile.full_name,
          email: user.email || '',
          'metadata[userId]': profile.id,
        },
      })
      target.__gestokCalInlineMounted = true
    }

    return () => {
      active = false
      delete target.__gestokCalBookingHandler
      delete target.__gestokCalReadyHandler
      window.setTimeout(() => {
        if (!document.getElementById('gestok-cal-inline')) target.__gestokCalInlineMounted = false
      }, 0)
    }
  }, [profile, refreshProfile, user])

  const leave = async () => { await signOut(); navigate('/') }

  return (
    <div className="onboarding-page">
      <header className="onboarding-header"><Brand /><button type="button" className="button button-ghost button-sm" onClick={leave}><LogOut size={16} /> Sair</button></header>
      <main className="onboarding-layout onboarding-layout-cal">
        <section className="onboarding-copy">
          <span className="kicker"><Sparkles size={14} /> Conta criada com sucesso</span>
          <h1>Antes de começar, vamos conhecer sua operação.</h1>
          <p>O acesso à ferramenta será liberado depois de uma reunião rápida de onboarding. Assim, configuramos a Gestok de acordo com a rotina do seu negócio.</p>
          <div className="onboarding-benefits">
            <div><span><Users /></span><strong>Reunião personalizada</strong><small>Entendemos seu estoque e seu processo atual.</small></div>
            <div><span><Clock3 /></span><strong>Cerca de 30 minutos</strong><small>Escolha um horário disponível no fuso de Brasília.</small></div>
            <div><span><ShieldCheck /></span><strong>Acesso acompanhado</strong><small>A equipe libera a plataforma após o onboarding.</small></div>
          </div>
        </section>

        <section className={`onboarding-card ${isScheduled ? '' : 'onboarding-card-cal'}`}>
          {isScheduled ? <div className="onboarding-confirmed">
            <span className="onboarding-success-icon"><CheckCircle2 /></span>
            <span className="kicker">Onboarding agendado</span>
            <h2>Seu horário está reservado.</h2>
            <div className="onboarding-booking"><CalendarDays /><span><small>Data e horário</small><strong>{fullDate.format(new Date(profile.onboarding_scheduled_at!))}</strong><em>Google Meet · duração de 30 minutos</em></span></div>
            <p>O convite e os links para cancelar ou reagendar foram enviados pelo Cal.com. Após a reunião, um administrador liberará seu acesso e os 7 dias de teste começarão.</p>
            <button type="button" className="button button-ghost" onClick={() => void refreshProfile()}>Atualizar status</button>
          </div> : <>
            <div className="onboarding-card-heading"><span className="auth-icon"><CalendarDays size={21} /></span><div><h2>Escolha seu horário</h2><p>A reserva acontece aqui, com confirmação automática pelo Google Agenda.</p></div></div>
            <div className="cal-embed-shell">
              {!embedReady && <div className="cal-embed-loading"><span /><p>Carregando horários disponíveis...</p></div>}
              <div id="gestok-cal-inline" className={embedReady ? 'ready' : ''} />
              {saving && <div className="cal-booking-saving"><span /><p>Confirmando seu agendamento...</p></div>}
            </div>
            {error && <div className="form-error">{error}</div>}
            <p className="cal-privacy-note">Ao reservar, seus dados de contato e o horário escolhido serão enviados ao Cal.com e ao Google Agenda para organizar a reunião.</p>
          </>}
        </section>
      </main>
    </div>
  )
}
