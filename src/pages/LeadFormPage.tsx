import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Clock3, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { saveLead, trackLeadAnswer } from '../lib/api'
import { trackMetaDiagnosticLead } from '../lib/metaPixel'
import type { LeadFormData } from '../types'

type QuestionId = keyof LeadFormData
type Option = { value: string; label: string; detail?: string }
type Question = {
  id: QuestionId
  eyebrow: string
  title: string
  subtitle: string
  type: 'choice' | 'text' | 'email' | 'tel' | 'consent'
  placeholder?: string
  options?: Option[]
}

const questions: Question[] = [
  { id: 'operation_type', eyebrow: 'Sobre o negócio', title: 'Qual opção descreve melhor sua operação?', subtitle: 'Escolha a alternativa mais próxima da sua realidade.', type: 'choice', options: [
    { value: 'Restaurante', label: 'Restaurante', detail: 'Atendimento com salão e cozinha' },
    { value: 'Delivery / dark kitchen', label: 'Delivery ou dark kitchen', detail: 'Produção focada em entregas' },
    { value: 'Cafeteria / padaria', label: 'Cafeteria ou padaria', detail: 'Cafés, produção própria e balcão' },
    { value: 'Bar / lanchonete', label: 'Bar ou lanchonete', detail: 'Bebidas, porções e refeições rápidas' },
    { value: 'Marmitaria / outro', label: 'Marmitaria ou outro', detail: 'Refeições prontas ou outro formato' },
  ] },
  { id: 'sales_channels', eyebrow: 'Canais de venda', title: 'Como seus clientes compram hoje?', subtitle: 'Considere o canal que melhor representa sua rotina atual.', type: 'choice', options: [
    { value: 'presencial', label: 'Somente presencial', detail: 'Salão, balcão ou retirada no local' },
    { value: 'ifood', label: 'Somente iFood ou marketplace', detail: 'Pedidos concentrados em aplicativos' },
    { value: 'presencial_ifood', label: 'Presencial + iFood', detail: 'Os dois canais fazem parte da operação' },
    { value: 'delivery_proprio', label: 'Delivery próprio', detail: 'WhatsApp, site ou entregadores próprios' },
    { value: 'varios', label: 'Vários canais', detail: 'Presencial, marketplace e delivery próprio' },
  ] },
  { id: 'units_count', eyebrow: 'Tamanho da operação', title: 'Quantas unidades o negócio possui?', subtitle: 'Conte lojas, cozinhas ou pontos de produção ativos.', type: 'choice', options: [
    { value: '1 unidade', label: '1 unidade' }, { value: '2 a 3 unidades', label: '2 a 3 unidades' }, { value: '4 a 10 unidades', label: '4 a 10 unidades' }, { value: 'Mais de 10', label: 'Mais de 10 unidades' },
  ] },
  { id: 'sku_count', eyebrow: 'Complexidade do estoque', title: 'Quantos itens diferentes existem no estoque?', subtitle: 'Pense em ingredientes, bebidas, embalagens e materiais de consumo.', type: 'choice', options: [
    { value: 'Até 30', label: 'Até 30 itens' }, { value: '31 a 100', label: '31 a 100 itens' }, { value: '101 a 300', label: '101 a 300 itens' }, { value: 'Mais de 300', label: 'Mais de 300 itens' },
  ] },
  { id: 'inventory_method', eyebrow: 'Rotina atual', title: 'Como vocês controlam o estoque hoje?', subtitle: 'Escolha o método usado na maior parte do tempo.', type: 'choice', options: [
    { value: 'Papel / caderno', label: 'Papel ou caderno' }, { value: 'Planilha', label: 'Planilha' }, { value: 'Sistema de PDV', label: 'Sistema de PDV' }, { value: 'Software de estoque / ERP', label: 'Software de estoque ou ERP' }, { value: 'Não controlamos formalmente', label: 'Ainda não controlamos formalmente' },
  ] },
  { id: 'main_challenge', eyebrow: 'O que mais importa', title: 'Qual é o maior desafio do estoque hoje?', subtitle: 'Selecione o problema que mais impacta sua operação.', type: 'choice', options: [
    { value: 'Contagem manual demorada', label: 'Contagem manual demorada', detail: 'O inventário consome muito tempo da equipe' },
    { value: 'Perdas e desperdícios', label: 'Perdas e desperdícios', detail: 'Validade, preparo ou descarte de produtos' },
    { value: 'Falta de itens na operação', label: 'Falta de itens na operação', detail: 'Ingredientes acabam em momentos importantes' },
    { value: 'Compras em excesso', label: 'Compras em excesso', detail: 'Dinheiro parado em produtos sem giro' },
    { value: 'Diferenças e falta de visibilidade', label: 'Diferenças e falta de visibilidade', detail: 'O físico não bate e é difícil acompanhar saldos' },
  ] },
  { id: 'whatsapp', eyebrow: 'Contato', title: 'Qual é o seu número de telefone?', subtitle: 'Inclua o DDD para entrarmos em contato sobre o diagnóstico e o onboarding.', type: 'tel', placeholder: '(11) 99999-9999' },
  { id: 'email', eyebrow: 'Acesso à conta', title: 'Qual é o seu melhor e-mail?', subtitle: 'Ele será usado para criar sua conta e enviar informações do teste.', type: 'email', placeholder: 'voce@empresa.com' },
  { id: 'contact_consent', eyebrow: 'Privacidade', title: 'Como podemos usar seus dados?', subtitle: 'Escolha com transparência antes de criar sua conta.', type: 'consent' },
]

const channelValues: Record<string, string[]> = {
  presencial: ['Atendimento presencial'],
  ifood: ['iFood / marketplaces'],
  presencial_ifood: ['Atendimento presencial', 'iFood / marketplaces'],
  delivery_proprio: ['Delivery próprio'],
  varios: ['Atendimento presencial', 'iFood / marketplaces', 'Delivery próprio'],
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

const initialData: LeadFormData = {
  full_name: '', email: '', whatsapp: '', business_name: '', city: '', state: '', role: '', operation_type: '', sales_channels: [],
  units_count: '', employees_count: '', monthly_orders: '', sku_count: '', inventory_method: '', inventory_frequency: '', uses_erp: '',
  estimated_loss: '', main_challenge: '', contact_consent: false, marketing_consent: false, privacy_policy_version: '2026-08-30',
}

export function LeadFormPage() {
  const [index, setIndex] = useState(0)
  const [data, setData] = useState(initialData)
  const [transitioning, setTransitioning] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const question = questions[index]
  const progress = ((index + 1) / questions.length) * 100
  const selectionPhase = question.type === 'choice'

  const selectedValue = useMemo(() => {
    if (question.id !== 'sales_channels') return String(data[question.id] ?? '')
    const entry = Object.entries(channelValues).find(([, values]) => values.length === data.sales_channels.length && values.every((value) => data.sales_channels.includes(value)))
    return entry?.[0] || ''
  }, [data, question.id])

  const update = (key: QuestionId, value: string | boolean | string[]) => setData((current) => ({ ...current, [key]: value }))

  const isValid = () => {
    const value = data[question.id]
    if (question.id === 'email') return /\S+@\S+\.\S+/.test(data.email)
    if (question.id === 'whatsapp') return data.whatsapp.replace(/\D/g, '').length >= 10
    if (question.id === 'sales_channels') return data.sales_channels.length > 0
    if (question.type === 'consent') return data.contact_consent
    return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
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
    if (question.id === 'sales_channels') update('sales_channels', channelValues[value])
    else update(question.id, value)
    void trackLeadAnswer(question.id, index + 1).catch(() => undefined)
    setError('')
    setTransitioning(true)
    window.setTimeout(() => {
      setIndex((current) => Math.min(questions.length - 1, current + 1))
      setTransitioning(false)
    }, 300)
  }

  const goBack = () => {
    if (index === 0) return
    setIndex((current) => current - 1)
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isValid()) return setError(question.type === 'consent' ? 'Confirme o consentimento necessário para continuar.' : 'Preencha esta resposta para continuar.')
    await trackLeadAnswer(question.id, index + 1).catch(() => undefined)
    if (index < questions.length - 1) return advance()
    setSubmitting(true); setError('')
    try {
      const leadId = await saveLead(data)
      trackMetaDiagnosticLead(leadId)
      localStorage.setItem('gestok_signup_prefill', JSON.stringify({ email: data.email }))
      navigate('/cadastro', { state: { fromLead: true } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar. Tente novamente.')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="form-page conversational-form-page">
      <header className="form-header container"><Brand /><Link to="/"><ArrowLeft size={16} /><span>Voltar ao site</span></Link></header>
      <div className="form-progress" role="progressbar" aria-label="Progresso do diagnóstico" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={index + 1}><span style={{ width: `${progress}%` }} /></div>
      <main className="conversation-layout container">
        <aside className="conversation-aside">
          <span className="conversation-count">{String(index + 1).padStart(2, '0')}<small>/ {questions.length}</small></span>
          <div><span className="kicker"><Sparkles size={13} /> Diagnóstico inteligente</span><h1>Uma pergunta de cada vez.</h1><p>Responda no seu ritmo. Nas escolhas, basta tocar em uma opção para avançar.</p></div>
          <div className="conversation-meta"><span><Clock3 size={16} /> Cerca de {Math.max(1, Math.ceil((questions.length - index) * .12))} min restantes</span><span><ShieldCheck size={16} /> Respostas protegidas</span></div>
        </aside>

        <form className={`question-card ${transitioning ? 'question-leaving' : ''}`} onSubmit={submit} key={index}>
          <div className="question-number-mobile">Pergunta {index + 1} de {questions.length}</div>
          <span className="form-step-label">{question.eyebrow}</span>
          <h2>{question.title}</h2>
          <p className="question-subtitle">{question.subtitle}</p>

          {question.type === 'choice' && <div className={`single-choice-list ${question.options!.length <= 4 ? 'compact' : ''}`}>
            {question.options!.map((option) => <button type="button" key={option.value} className={selectedValue === option.value ? 'selected' : ''} aria-pressed={selectedValue === option.value} onClick={() => choose(option.value)} disabled={transitioning}><span className="choice-radio">{selectedValue === option.value && <Check size={14} />}</span><span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span><ArrowRight className="choice-arrow" size={17} /></button>)}
          </div>}

          {['text','email','tel'].includes(question.type) && <div className="single-answer-field"><input autoFocus type={question.type} inputMode={question.id === 'whatsapp' ? 'tel' : undefined} value={String(data[question.id])} onChange={(event) => update(question.id, question.id === 'whatsapp' ? formatPhone(event.target.value) : event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (isValid()) void trackLeadAnswer(question.id, index + 1).catch(() => undefined).finally(advance); else setError(question.id === 'whatsapp' ? 'Informe um telefone válido com DDD.' : 'Preencha esta resposta para continuar.') } }} enterKeyHint="next" placeholder={question.placeholder} autoComplete={question.id === 'whatsapp' ? 'tel' : question.id === 'email' ? 'email' : 'off'} /><small>Pressione Enter ou use o botão para continuar</small></div>}

          {question.type === 'consent' && <div className="consent-block conversation-consent">
            <div className="privacy-summary"><LockKeyhole size={21} /><div><strong>Você mantém o controle</strong><p>As respostas serão usadas para criar sua experiência, atender ao teste e entender o perfil das operações interessadas.</p></div></div>
            <label className="check-field"><input type="checkbox" checked={data.contact_consent} onChange={(event) => update('contact_consent', event.target.checked)} /><span><strong>Concordo com o tratamento para atender este pedido *</strong>Autorizo o armazenamento das respostas e o contato por e-mail ou telefone sobre diagnóstico, teste e contratação. Li a <Link to="/privacidade" target="_blank">Política de Privacidade</Link>.</span></label>
            <label className="check-field"><input type="checkbox" checked={data.marketing_consent} onChange={(event) => update('marketing_consent', event.target.checked)} /><span><strong>Quero receber conteúdos e novidades (opcional)</strong>Autorizo comunicações de marketing da Gestok. Posso cancelar a qualquer momento.</span></label>
            <p className="legal-note">O aceite de marketing não é necessário para usar o teste. Veja também os <Link to="/termos" target="_blank">Termos de Uso</Link>.</p>
          </div>}

          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="question-footer">
            <button type="button" className="question-back" onClick={goBack} disabled={index === 0}><ChevronLeft size={17} /> Voltar</button>
            {selectionPhase && <span className="auto-advance-note"><span /> Selecione para avançar</span>}
            {!selectionPhase && <button className="button button-lg" disabled={submitting}>{submitting ? 'Enviando...' : question.type === 'consent' ? 'Concluir e criar conta' : 'Continuar'} <ArrowRight size={17} /></button>}
          </div>
        </form>
      </main>
    </div>
  )
}
