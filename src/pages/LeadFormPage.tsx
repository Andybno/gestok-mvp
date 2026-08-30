import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Clock3, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { saveLead } from '../lib/api'
import type { LeadFormData } from '../types'

type QuestionId = keyof LeadFormData
type Option = { value: string; label: string; detail?: string }
type Question = {
  id: QuestionId
  eyebrow: string
  title: string
  subtitle: string
  type: 'choice' | 'text' | 'email' | 'textarea' | 'consent'
  placeholder?: string
  options?: Option[]
}

const questions: Question[] = [
  { id: 'operation_type', eyebrow: 'Sobre o negócio', title: 'Qual opção descreve melhor sua operação?', subtitle: 'Escolha a alternativa mais próxima da sua realidade.', type: 'choice', options: [
    { value: 'Restaurante', label: 'Restaurante', detail: 'Atendimento com salão e cozinha' },
    { value: 'Delivery / dark kitchen', label: 'Delivery ou dark kitchen', detail: 'Produção focada em entregas' },
    { value: 'Cafeteria', label: 'Cafeteria', detail: 'Cafés, bebidas e refeições rápidas' },
    { value: 'Padaria / confeitaria', label: 'Padaria ou confeitaria', detail: 'Produção própria e balcão' },
    { value: 'Bar', label: 'Bar', detail: 'Bebidas, porções e cozinha' },
    { value: 'Marmitaria', label: 'Marmitaria', detail: 'Refeições prontas e recorrentes' },
    { value: 'Outro', label: 'Outro tipo', detail: 'Uma operação diferente das opções' },
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
  { id: 'main_challenge', eyebrow: 'O que mais importa', title: 'Qual é o maior desafio do estoque hoje?', subtitle: 'Conte com suas palavras. Uma frase já ajuda bastante.', type: 'textarea', placeholder: 'Ex.: compras em excesso, falta de ingrediente, validade, contagem demorada...' },
  { id: 'full_name', eyebrow: 'Quase lá', title: 'Como podemos chamar você?', subtitle: 'Use seu nome para personalizar sua conta.', type: 'text', placeholder: 'Digite seu nome completo' },
  { id: 'business_name', eyebrow: 'Seu estabelecimento', title: 'Qual é o nome do negócio?', subtitle: 'É assim que ele aparecerá dentro da Gestok.', type: 'text', placeholder: 'Ex.: Restaurante Sabor da Casa' },
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
    if (index < questions.length - 1) return advance()
    setSubmitting(true); setError('')
    try {
      await saveLead(data)
      localStorage.setItem('gestok_signup_prefill', JSON.stringify({ email: data.email, fullName: data.full_name, businessName: data.business_name }))
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

          {['text','email'].includes(question.type) && <div className="single-answer-field"><input autoFocus type={question.type} value={String(data[question.id])} onChange={(event) => update(question.id, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (isValid()) advance(); else setError('Preencha esta resposta para continuar.') } }} enterKeyHint="next" placeholder={question.placeholder} autoComplete={question.id === 'full_name' ? 'name' : question.id === 'business_name' ? 'organization' : question.id === 'email' ? 'email' : 'off'} /><small>Pressione Enter ou use o botão para continuar</small></div>}

          {question.type === 'textarea' && <div className="single-answer-field"><textarea autoFocus rows={5} maxLength={500} value={data.main_challenge} onChange={(event) => update('main_challenge', event.target.value)} placeholder={question.placeholder} /><small>{data.main_challenge.length}/500 caracteres</small></div>}

          {question.type === 'consent' && <div className="consent-block conversation-consent">
            <div className="privacy-summary"><LockKeyhole size={21} /><div><strong>Você mantém o controle</strong><p>As respostas serão usadas para criar sua experiência, atender ao teste e entender o perfil das operações interessadas.</p></div></div>
            <label className="check-field"><input type="checkbox" checked={data.contact_consent} onChange={(event) => update('contact_consent', event.target.checked)} /><span><strong>Concordo com o tratamento para atender este pedido *</strong>Autorizo o armazenamento das respostas e o contato por e-mail sobre diagnóstico, teste e contratação. Li a <Link to="/privacidade" target="_blank">Política de Privacidade</Link>.</span></label>
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
