import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronLeft, Clock3, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { saveLead, trackLeadAnswer } from '../lib/api'
import { trackMetaDiagnosticLead, trackMetaDiagnosticStart, trackMetaOnboardingBooked, trackMetaScheduleStart } from '../lib/metaPixel'
import type { LeadFormData } from '../types'

type QuestionId = keyof LeadFormData
type FunnelKey = 'operation_type' | 'sales_channels' | 'units_count' | 'sku_count' | 'inventory_method' | 'main_challenge' | 'whatsapp' | 'email' | 'contact_consent'
type Option = { value: string; label: string; detail?: string }
type Question = {
  id: QuestionId
  progressKey: FunnelKey
  eyebrow: string
  title: string
  subtitle: string
  type: 'choice' | 'tel' | 'contact'
  placeholder?: string
  options?: Option[]
}
const questions: Question[] = [
  { id: 'operation_type', progressKey: 'operation_type', eyebrow: 'Sua operação', title: 'Qual opção descreve melhor seu restaurante?', subtitle: 'Escolha o formato que mais representa sua operação hoje.', type: 'choice', options: [
    { value: 'Restaurante presencial', label: 'Restaurante presencial', detail: 'Salão, balcão ou retirada no local' },
    { value: 'Delivery / iFood', label: 'Delivery ou iFood', detail: 'Pedidos concentrados em aplicativos e entregas' },
    { value: 'Presencial + delivery', label: 'Presencial + delivery', detail: 'Salão e entregas fazem parte da rotina' },
    { value: 'Dark kitchen', label: 'Dark kitchen', detail: 'Produção focada exclusivamente em entregas' },
    { value: 'Outro food service', label: 'Outro negócio de alimentação', detail: 'Cafeteria, padaria, bar, marmitaria ou similar' },
  ] },
  { id: 'employees_count', progressKey: 'units_count', eyebrow: 'Tamanho da equipe', title: 'Quantas pessoas trabalham na operação?', subtitle: 'Considere cozinha, salão, compras, estoque e gestão.', type: 'choice', options: [
    { value: '1 a 5 pessoas', label: '1 a 5 pessoas' },
    { value: '6 a 10 pessoas', label: '6 a 10 pessoas' },
    { value: '11 a 20 pessoas', label: '11 a 20 pessoas' },
    { value: '21 a 50 pessoas', label: '21 a 50 pessoas' },
    { value: 'Mais de 50 pessoas', label: 'Mais de 50 pessoas' },
  ] },
  { id: 'inventory_method', progressKey: 'inventory_method', eyebrow: 'Controle atual', title: 'Como o estoque é controlado hoje?', subtitle: 'Escolha o método usado na maior parte do tempo.', type: 'choice', options: [
    { value: 'Papel / caderno', label: 'Papel ou caderno' },
    { value: 'Planilha', label: 'Planilha' },
    { value: 'Sistema de PDV', label: 'Sistema de PDV' },
    { value: 'Software de estoque / ERP', label: 'Software de estoque ou ERP' },
    { value: 'Sem controle formal', label: 'Ainda não controlamos formalmente' },
  ] },
  { id: 'main_challenge', progressKey: 'main_challenge', eyebrow: 'Principal desafio', title: 'Qual problema mais afeta seu estoque?', subtitle: 'Selecione a dor que mais impacta a rotina do restaurante.', type: 'choice', options: [
    { value: 'Perdas e desperdícios', label: 'Perdas e desperdícios', detail: 'Validade, preparo ou descarte de produtos' },
    { value: 'Falta de produtos', label: 'Falta de produtos', detail: 'Ingredientes acabam em momentos importantes' },
    { value: 'Compras em excesso', label: 'Compras em excesso', detail: 'Dinheiro parado em produtos sem giro' },
    { value: 'Contagem manual demorada', label: 'Contagem manual demorada', detail: 'O inventário consome muito tempo da equipe' },
    { value: 'Falta de visibilidade', label: 'Falta de visibilidade', detail: 'É difícil saber o saldo e decidir o que comprar' },
  ] },
  { id: 'inventory_frequency', progressKey: 'sku_count', eyebrow: 'Inventário', title: 'Com que frequência o estoque é contado?', subtitle: 'Considere a contagem completa ou a conferência dos principais itens.', type: 'choice', options: [
    { value: 'Todos os dias', label: 'Todos os dias' },
    { value: 'Algumas vezes por semana', label: 'Algumas vezes por semana' },
    { value: 'Uma vez por semana', label: 'Uma vez por semana' },
    { value: 'Uma vez por mês', label: 'Uma vez por mês' },
    { value: 'Não fazemos inventário', label: 'Não fazemos inventário' },
  ] },
  { id: 'role', progressKey: 'sales_channels', eyebrow: 'Preferência de contato', title: 'Qual é o melhor canal para falarmos com você?', subtitle: 'Usaremos sua preferência para dar continuidade ao diagnóstico.', type: 'choice', options: [
    { value: 'WhatsApp', label: 'WhatsApp' },
    { value: 'Ligação', label: 'Ligação telefônica' },
    { value: 'E-mail', label: 'E-mail' },
    { value: 'Sem preferência', label: 'Sem preferência' },
  ] },
  { id: 'estimated_loss', progressKey: 'whatsapp', eyebrow: 'Demonstração', title: 'Qual é o melhor período para a demonstração?', subtitle: 'No calendário você poderá escolher o dia e o horário exatos.', type: 'choice', options: [
    { value: 'Manhã', label: 'Manhã', detail: 'Entre 8h e 12h' },
    { value: 'Início da tarde', label: 'Início da tarde', detail: 'Entre 12h e 15h' },
    { value: 'Fim da tarde', label: 'Fim da tarde', detail: 'Entre 15h e 18h' },
    { value: 'Sem preferência', label: 'Sem preferência' },
  ] },
  { id: 'whatsapp', progressKey: 'email', eyebrow: 'Seus dados', title: 'Qual é o seu número de telefone?', subtitle: 'Inclua o DDD. Este dado será usado somente conforme suas autorizações.', type: 'tel', placeholder: '(11) 99999-9999' },
  { id: 'contact_consent', progressKey: 'contact_consent', eyebrow: 'Contato e privacidade', title: 'Qual é o seu melhor e-mail?', subtitle: 'Última etapa: informe seu e-mail e revise as autorizações de contato.', type: 'contact', placeholder: 'voce@empresa.com' },
]

const operationChannels: Record<string, string[]> = {
  'Restaurante presencial': ['Atendimento presencial'],
  'Delivery / iFood': ['iFood / marketplaces'],
  'Presencial + delivery': ['Atendimento presencial', 'iFood / marketplaces'],
  'Dark kitchen': ['Delivery próprio', 'iFood / marketplaces'],
  'Outro food service': ['Outro'],
}

const initialData: LeadFormData = {
  full_name: '', email: '', whatsapp: '', business_name: '', city: '', state: '', role: '', operation_type: '', sales_channels: [],
  units_count: '', employees_count: '', monthly_orders: '', sku_count: '', inventory_method: '', inventory_frequency: '', uses_erp: '',
  estimated_loss: '', main_challenge: '', contact_consent: false, marketing_consent: false, privacy_policy_version: '2026-09-05',
}

const CAL_NAMESPACE = 'gestokDiagnostic'
const CAL_LINK = 'gestokbr/onboarding'

type CalApi = ((...args: unknown[]) => void) & { loaded?: boolean; ns: Record<string, CalApi>; q: unknown[][] }
type CalEmbedEvent = { detail?: { data?: { startTime?: string; uid?: string } } }
type CalWindow = Window & typeof globalThis & { Cal?: CalApi }

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

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function LeadFormPage() {
  const [started, setStarted] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [bookingStarted, setBookingStarted] = useState(false)
  const [bookingConfirmed, setBookingConfirmed] = useState(false)
  const [embedReady, setEmbedReady] = useState(false)
  const [leadId, setLeadId] = useState('')
  const [index, setIndex] = useState(0)
  const [data, setData] = useState(initialData)
  const [transitioning, setTransitioning] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const calMounted = useRef(false)
  const question = questions[index]
  const progress = started ? ((index + 1) / questions.length) * 100 : 0
  const selectionPhase = question.type === 'choice'

  const selectedValue = useMemo(() => String(data[question.id] ?? ''), [data, question.id])
  const update = (key: QuestionId, value: string | boolean | string[]) => setData((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    if (!bookingStarted || bookingConfirmed || calMounted.current) return
    calMounted.current = true
    let active = true
    const Cal = getCalApi()
    if (!Cal.ns[CAL_NAMESPACE]) Cal('init', CAL_NAMESPACE, { origin: 'https://cal.com' })
    const api = Cal.ns[CAL_NAMESPACE]
    api('on', { action: 'bookingSuccessfulV2', callback: (event: CalEmbedEvent) => {
      if (!active) return
      const bookingUid = event.detail?.data?.uid
      trackMetaOnboardingBooked(bookingUid)
      localStorage.setItem('gestok_public_booking', JSON.stringify({ lead_id: leadId, booking_uid: bookingUid || null, start_time: event.detail?.data?.startTime || null }))
      setBookingConfirmed(true)
    } })
    api('on', { action: 'linkReady', callback: () => { if (active) setEmbedReady(true) } })
    api('ui', { hideEventTypeDetails: false, layout: 'month_view' })
    api('inline', {
      elementOrSelector: '#gestok-diagnostic-cal',
      calLink: CAL_LINK,
      config: { layout: 'month_view', theme: 'light', email: data.email, 'metadata[leadId]': leadId },
    })
    return () => { active = false }
  }, [bookingConfirmed, bookingStarted, data.email, leadId])

  const isValid = () => {
    const value = data[question.id]
    if (question.type === 'tel') return data.whatsapp.replace(/\D/g, '').length >= 10
    if (question.type === 'contact') return /\S+@\S+\.\S+/.test(data.email) && data.contact_consent
    return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
  }

  const begin = () => {
    trackMetaDiagnosticStart()
    setStarted(true)
  }

  const advance = () => {
    if (index >= questions.length - 1) return
    setTransitioning(true)
    window.setTimeout(() => {
      setIndex((current) => current + 1)
      setTransitioning(false)
      setError('')
    }, 220)
  }

  const choose = (value: string) => {
    if (transitioning) return
    update(question.id, value)
    if (question.id === 'operation_type') update('sales_channels', operationChannels[value] || [])
    void trackLeadAnswer(question.progressKey, index + 1).catch(() => undefined)
    setError('')
    setTransitioning(true)
    window.setTimeout(() => {
      setIndex((current) => Math.min(questions.length - 1, current + 1))
      setTransitioning(false)
    }, 300)
  }

  const goBack = () => {
    if (index === 0) {
      setStarted(false)
      return
    }
    setIndex((current) => current - 1)
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isValid()) {
      if (question.type === 'tel') return setError('Informe um telefone válido com DDD.')
      if (question.type === 'contact') return setError(!/\S+@\S+\.\S+/.test(data.email) ? 'Informe um e-mail válido.' : 'Confirme o consentimento necessário para concluir.')
      return setError('Preencha esta resposta para continuar.')
    }
    await trackLeadAnswer(question.progressKey, index + 1).catch(() => undefined)
    if (index < questions.length - 1) return advance()
    setSubmitting(true)
    setError('')
    try {
      const savedLeadId = await saveLead(data)
      setLeadId(savedLeadId)
      trackMetaDiagnosticLead(savedLeadId)
      setCompleted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const startBooking = () => {
    trackMetaScheduleStart(leadId)
    setBookingStarted(true)
    window.setTimeout(() => document.getElementById('diagnostic-booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  if (!started) return (
    <div className="form-page conversational-form-page">
      <header className="form-header container"><Brand /><Link to="/"><ArrowLeft size={16} /><span>Voltar ao site</span></Link></header>
      <div className="form-progress" role="progressbar" aria-label="Progresso do diagnóstico" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={0}><span style={{ width: '0%' }} /></div>
      <main className="diagnostic-intro-layout container">
        <section className="diagnostic-intro-card">
          <span className="kicker"><Sparkles size={14} /> Diagnóstico gratuito</span>
          <h1>Descubra como reduzir perdas e organizar o estoque do seu restaurante</h1>
          <p>Responda algumas perguntas sobre sua operação. No final, você poderá agendar uma demonstração personalizada da Gestokapp.</p>
          <div className="diagnostic-intro-meta"><span><Clock3 size={17} /> Leva cerca de 2 minutos</span><span><ShieldCheck size={17} /> Seus dados são protegidos</span></div>
          <button type="button" className="button button-lg" onClick={begin}>Começar diagnóstico <ArrowRight size={18} /></button>
        </section>
      </main>
    </div>
  )

  if (completed) return (
    <div className="form-page conversational-form-page diagnostic-success-page">
      <header className="form-header container"><Brand /><Link to="/"><ArrowLeft size={16} /><span>Voltar ao site</span></Link></header>
      <div className="form-progress complete" aria-hidden="true"><span style={{ width: '100%' }} /></div>
      <main className="diagnostic-success-layout container">
        <section className="diagnostic-success-card">
          {bookingConfirmed ? <>
            <span className="diagnostic-success-icon"><CheckCircle2 /></span>
            <span className="kicker">Demonstração agendada</span>
            <h1>Seu horário está reservado.</h1>
            <p>Você receberá a confirmação e os dados da reunião pelo Cal.com. Nossa equipe conhecerá sua operação e apresentará a Gestokapp de forma personalizada.</p>
            <strong className="access-release-note">O acesso à ferramenta será liberado após a realização da demonstração.</strong>
          </> : <>
            <span className="diagnostic-success-icon"><CheckCircle2 /></span>
            <span className="kicker">Diagnóstico enviado</span>
            <h1>Seu diagnóstico foi concluído</h1>
            <p>Agora agende uma demonstração para vermos como a Gestokapp pode se adaptar à rotina do seu restaurante.</p>
            <p>Durante a reunião, vamos entender sua operação, apresentar a ferramenta e explicar os próximos passos para liberar seu acesso.</p>
            <strong className="access-release-note">O acesso à ferramenta será liberado após a realização da demonstração.</strong>
            {!bookingStarted && <button type="button" className="button button-lg diagnostic-booking-cta" onClick={startBooking}><CalendarDays size={18} /> Agendar minha demonstração</button>}
          </>}
        </section>
        {bookingStarted && !bookingConfirmed && <section id="diagnostic-booking" className="diagnostic-booking-card">
          <div className="onboarding-card-heading"><span className="auth-icon"><CalendarDays size={21} /></span><div><h2>Escolha seu horário</h2><p>A reserva acontece aqui, com confirmação automática pelo Google Agenda.</p></div></div>
          <div className="cal-embed-shell">
            {!embedReady && <div className="cal-embed-loading"><span /><p>Carregando horários disponíveis...</p></div>}
            <div id="gestok-diagnostic-cal" className={embedReady ? 'ready' : ''} />
          </div>
          <p className="cal-privacy-note">Ao reservar, seus dados de contato e o horário escolhido serão enviados ao Cal.com e ao Google Agenda para organizar a reunião.</p>
        </section>}
      </main>
    </div>
  )

  return (
    <div className="form-page conversational-form-page">
      <header className="form-header container"><Brand /><Link to="/"><ArrowLeft size={16} /><span>Voltar ao site</span></Link></header>
      <div className="form-progress" role="progressbar" aria-label="Progresso do diagnóstico" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={index + 1}><span style={{ width: `${progress}%` }} /></div>
      <main className="conversation-layout container">
        <aside className="conversation-aside">
          <span className="conversation-count">{String(index + 1).padStart(2, '0')}<small>/ {questions.length}</small></span>
          <div><span className="kicker"><Sparkles size={13} /> Diagnóstico inteligente</span><h1>Uma pergunta de cada vez.</h1><p>Responda no seu ritmo. Nas escolhas, basta tocar em uma opção para avançar.</p></div>
          <div className="conversation-meta"><span><Clock3 size={16} /> Cerca de {Math.max(1, Math.ceil((questions.length - index) * .18))} min restantes</span><span><ShieldCheck size={16} /> Respostas protegidas</span></div>
        </aside>

        <form className={`question-card ${transitioning ? 'question-leaving' : ''}`} onSubmit={submit} key={index}>
          <div className="question-number-mobile">Pergunta {index + 1} de {questions.length}</div>
          <span className="form-step-label">{question.eyebrow}</span>
          <h2>{question.title}</h2>
          <p className="question-subtitle">{question.subtitle}</p>

          {question.type === 'choice' && <div className={`single-choice-list ${question.options!.length <= 4 ? 'compact' : ''}`}>
            {question.options!.map((option) => <button type="button" key={option.value} className={selectedValue === option.value ? 'selected' : ''} aria-pressed={selectedValue === option.value} onClick={() => choose(option.value)} disabled={transitioning}><span className="choice-radio">{selectedValue === option.value && <Check size={14} />}</span><span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span><ArrowRight className="choice-arrow" size={17} /></button>)}
          </div>}

          {question.type === 'tel' && <div className="single-answer-field"><input autoFocus type="tel" inputMode="tel" value={data.whatsapp} onChange={(event) => update('whatsapp', formatPhone(event.target.value))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (isValid()) void trackLeadAnswer(question.progressKey, index + 1).catch(() => undefined).finally(advance); else setError('Informe um telefone válido com DDD.') } }} enterKeyHint="next" placeholder={question.placeholder} autoComplete="tel" /><small>Pressione Enter ou use o botão para continuar</small></div>}

          {question.type === 'contact' && <div className="contact-final-step">
            <div className="single-answer-field"><input autoFocus type="email" inputMode="email" value={data.email} onChange={(event) => update('email', event.target.value)} placeholder={question.placeholder} autoComplete="email" /><small>Usaremos este e-mail para confirmar o contato e a demonstração</small></div>
            <div className="consent-block conversation-consent">
              <div className="privacy-summary"><LockKeyhole size={21} /><div><strong>Você mantém o controle</strong><p>As respostas serão usadas para preparar seu diagnóstico, entrar em contato e personalizar a demonstração.</p></div></div>
              <label className="check-field"><input type="checkbox" checked={data.contact_consent} onChange={(event) => update('contact_consent', event.target.checked)} /><span><strong>Concordo com o tratamento para atender este pedido *</strong>Autorizo o armazenamento das respostas e o contato por e-mail ou telefone sobre o diagnóstico e a demonstração. Li a <Link to="/privacidade" target="_blank">Política de Privacidade</Link>.</span></label>
              <label className="check-field"><input type="checkbox" checked={data.marketing_consent} onChange={(event) => update('marketing_consent', event.target.checked)} /><span><strong>Quero receber conteúdos e novidades (opcional)</strong>Autorizo comunicações de marketing da Gestokapp. Posso cancelar a qualquer momento.</span></label>
              <p className="legal-note">O aceite de marketing não é necessário para concluir o diagnóstico. Veja também os <Link to="/termos" target="_blank">Termos de Uso</Link>.</p>
            </div>
          </div>}

          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="question-footer">
            <button type="button" className="question-back" onClick={goBack}><ChevronLeft size={17} /> Voltar</button>
            {selectionPhase && <span className="auto-advance-note"><span /> Selecione para avançar</span>}
            {!selectionPhase && <button className="button button-lg" disabled={submitting}>{submitting ? 'Enviando...' : question.type === 'contact' ? 'Concluir diagnóstico' : 'Continuar'} <ArrowRight size={17} /></button>}
          </div>
        </form>
      </main>
    </div>
  )
}
