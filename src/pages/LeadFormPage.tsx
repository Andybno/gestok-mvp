import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronLeft, LockKeyhole, Store } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { saveLead } from '../lib/api'
import type { LeadFormData } from '../types'

const initialData: LeadFormData = {
  full_name: '', email: '', whatsapp: '', business_name: '', city: '', state: '', role: '', operation_type: '',
  sales_channels: [], units_count: '', employees_count: '', monthly_orders: '', sku_count: '', inventory_method: '',
  inventory_frequency: '', uses_erp: '', estimated_loss: '', main_challenge: '', contact_consent: false,
  marketing_consent: false, privacy_policy_version: '2026-08-30',
}

const steps = [
  { title: 'Sobre você', subtitle: 'Primeiro, queremos conhecer quem está à frente da operação.' },
  { title: 'Sua operação', subtitle: 'Esses dados ajudam a adaptar a ferramenta ao seu dia a dia.' },
  { title: 'Rotina de estoque', subtitle: 'Conte como vocês controlam insumos hoje.' },
  { title: 'Consentimento', subtitle: 'Transparência sobre como vamos usar seus dados.' },
]

const Choice = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
  <button type="button" className={`choice ${selected ? 'selected' : ''}`} onClick={onClick}><span>{selected && <Check size={14} />}</span>{label}</button>
)

export function LeadFormPage() {
  const [step, setStep] = useState(0)
  const [data, setData] = useState(initialData)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const progress = ((step + 1) / steps.length) * 100

  const update = (key: keyof LeadFormData, value: string | boolean | string[]) => setData((current) => ({ ...current, [key]: value }))
  const toggleChannel = (channel: string) => update('sales_channels', data.sales_channels.includes(channel) ? data.sales_channels.filter((item) => item !== channel) : [...data.sales_channels, channel])

  const stepValid = useMemo(() => {
    if (step === 0) return Boolean(data.full_name && /\S+@\S+\.\S+/.test(data.email) && data.whatsapp && data.business_name && data.role)
    if (step === 1) return Boolean(data.operation_type && data.sales_channels.length && data.city && data.state && data.units_count && data.employees_count && data.monthly_orders)
    if (step === 2) return Boolean(data.sku_count && data.inventory_method && data.inventory_frequency && data.uses_erp && data.estimated_loss && data.main_challenge)
    return data.contact_consent
  }, [data, step])

  const next = () => {
    if (!stepValid) return setError('Preencha os campos obrigatórios para continuar.')
    setError('')
    setStep((current) => Math.min(steps.length - 1, current + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!stepValid) return setError('Confirme o consentimento necessário para continuar.')
    setSubmitting(true)
    setError('')
    try {
      await saveLead(data)
      localStorage.setItem('gestok_signup_prefill', JSON.stringify({ email: data.email, fullName: data.full_name, businessName: data.business_name }))
      navigate('/cadastro', { state: { fromLead: true } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="form-page">
      <header className="form-header container"><Brand /><Link to="/"><ArrowLeft size={16} /> Voltar ao site</Link></header>
      <div className="form-progress"><span style={{ width: `${progress}%` }} /></div>
      <main className="form-layout container">
        <aside className="form-aside">
          <div className="aside-icon"><Store size={25} /></div>
          <span className="kicker">Diagnóstico gratuito</span>
          <h1>Vamos entender seu estoque?</h1>
          <p>Leva cerca de 3 minutos. Suas respostas ajudam a Gestok a preparar uma experiência mais útil para sua operação.</p>
          <div className="aside-list"><span><CheckCircle2 size={17} /> Sem compromisso</span><span><CheckCircle2 size={17} /> 7 dias para experimentar</span><span><LockKeyhole size={17} /> Dados protegidos pela LGPD</span></div>
          <div className="step-dots">{steps.map((item, index) => <span key={item.title} className={index <= step ? 'active' : ''}>{index < step ? <Check size={13} /> : index + 1}</span>)}</div>
        </aside>

        <form className="lead-form" onSubmit={submit}>
          <div className="form-step-label">Etapa {step + 1} de {steps.length}</div>
          <h2>{steps[step].title}</h2><p className="form-subtitle">{steps[step].subtitle}</p>

          {step === 0 && <div className="field-grid">
            <label className="field full"><span>Seu nome *</span><input value={data.full_name} onChange={(e) => update('full_name', e.target.value)} placeholder="Como podemos chamar você?" autoComplete="name" /></label>
            <label className="field"><span>E-mail profissional *</span><input type="email" value={data.email} onChange={(e) => update('email', e.target.value)} placeholder="voce@empresa.com" autoComplete="email" /></label>
            <label className="field"><span>WhatsApp *</span><input value={data.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} placeholder="(11) 99999-9999" autoComplete="tel" /></label>
            <label className="field full"><span>Nome do estabelecimento *</span><input value={data.business_name} onChange={(e) => update('business_name', e.target.value)} placeholder="Ex.: Restaurante Sabor da Casa" autoComplete="organization" /></label>
            <label className="field full"><span>Qual é o seu papel na operação? *</span><select value={data.role} onChange={(e) => update('role', e.target.value)}><option value="">Selecione</option><option>Proprietário(a) / sócio(a)</option><option>Gerente</option><option>Chef / responsável pela cozinha</option><option>Responsável pelo estoque/compras</option><option>Outro</option></select></label>
          </div>}

          {step === 1 && <div className="field-grid">
            <div className="field full"><span>Qual tipo descreve melhor o negócio? *</span><div className="choice-grid">{['Restaurante', 'Delivery / dark kitchen', 'Cafeteria', 'Padaria / confeitaria', 'Bar', 'Marmitaria', 'Outro'].map((item) => <Choice key={item} label={item} selected={data.operation_type === item} onClick={() => update('operation_type', item)} />)}</div></div>
            <div className="field full"><span>Por onde vocês vendem? * <small>Marque todos que se aplicam</small></span><div className="choice-grid three">{['Atendimento presencial', 'iFood / marketplaces', 'Delivery próprio'].map((item) => <Choice key={item} label={item} selected={data.sales_channels.includes(item)} onClick={() => toggleChannel(item)} />)}</div></div>
            <label className="field"><span>Cidade *</span><input value={data.city} onChange={(e) => update('city', e.target.value)} placeholder="Sua cidade" /></label>
            <label className="field"><span>Estado *</span><select value={data.state} onChange={(e) => update('state', e.target.value)}><option value="">UF</option>{['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((uf) => <option key={uf}>{uf}</option>)}</select></label>
            <label className="field"><span>Quantas unidades? *</span><select value={data.units_count} onChange={(e) => update('units_count', e.target.value)}><option value="">Selecione</option><option>1 unidade</option><option>2 a 3 unidades</option><option>4 a 10 unidades</option><option>Mais de 10</option></select></label>
            <label className="field"><span>Tamanho da equipe? *</span><select value={data.employees_count} onChange={(e) => update('employees_count', e.target.value)}><option value="">Selecione</option><option>1 a 5 pessoas</option><option>6 a 15 pessoas</option><option>16 a 40 pessoas</option><option>Mais de 40</option></select></label>
            <label className="field full"><span>Quantos pedidos por mês, aproximadamente? *</span><select value={data.monthly_orders} onChange={(e) => update('monthly_orders', e.target.value)}><option value="">Selecione uma faixa</option><option>Até 500</option><option>501 a 2.000</option><option>2.001 a 5.000</option><option>5.001 a 15.000</option><option>Mais de 15.000</option></select></label>
          </div>}

          {step === 2 && <div className="field-grid">
            <label className="field"><span>Quantos itens diferentes no estoque? *</span><select value={data.sku_count} onChange={(e) => update('sku_count', e.target.value)}><option value="">Selecione</option><option>Até 30</option><option>31 a 100</option><option>101 a 300</option><option>Mais de 300</option></select></label>
            <label className="field"><span>Com que frequência fazem inventário? *</span><select value={data.inventory_frequency} onChange={(e) => update('inventory_frequency', e.target.value)}><option value="">Selecione</option><option>Diariamente</option><option>Semanalmente</option><option>Quinzenalmente</option><option>Mensalmente</option><option>Não fazemos</option></select></label>
            <label className="field full"><span>Como controlam o estoque hoje? *</span><select value={data.inventory_method} onChange={(e) => update('inventory_method', e.target.value)}><option value="">Selecione</option><option>Papel / caderno</option><option>Planilha</option><option>Sistema de PDV</option><option>Software de estoque / ERP</option><option>Não controlamos formalmente</option></select></label>
            <label className="field"><span>Usam algum ERP ou PDV? *</span><select value={data.uses_erp} onChange={(e) => update('uses_erp', e.target.value)}><option value="">Selecione</option><option>Não</option><option>Sim, mas sem estoque</option><option>Sim, integrado ao estoque</option></select></label>
            <label className="field"><span>Perda mensal estimada? *</span><select value={data.estimated_loss} onChange={(e) => update('estimated_loss', e.target.value)}><option value="">Selecione</option><option>Até 2%</option><option>Entre 3% e 5%</option><option>Entre 6% e 10%</option><option>Acima de 10%</option><option>Não sabemos medir</option></select></label>
            <label className="field full"><span>Qual é o maior desafio com estoque hoje? *</span><textarea value={data.main_challenge} onChange={(e) => update('main_challenge', e.target.value)} placeholder="Ex.: compras em excesso, falta de ingrediente, validade, contagem demorada..." rows={4} maxLength={500} /><small>{data.main_challenge.length}/500</small></label>
          </div>}

          {step === 3 && <div className="consent-block">
            <div className="privacy-summary"><LockKeyhole size={22} /><div><strong>Seus dados, suas escolhas</strong><p>Usaremos suas respostas para entrar em contato sobre o teste, criar sua experiência e entender o perfil das operações interessadas. Você pode revogar consentimentos a qualquer momento.</p></div></div>
            <label className="check-field"><input type="checkbox" checked={data.contact_consent} onChange={(e) => update('contact_consent', e.target.checked)} /><span><strong>Concordo com o tratamento dos meus dados para atender este pedido *</strong>Autorizo a Gestok a armazenar as respostas e entrar em contato por e-mail ou WhatsApp sobre o diagnóstico, teste e contratação. Li a <Link to="/privacidade" target="_blank">Política de Privacidade</Link>.</span></label>
            <label className="check-field"><input type="checkbox" checked={data.marketing_consent} onChange={(e) => update('marketing_consent', e.target.checked)} /><span><strong>Quero receber novidades e conteúdos de marketing (opcional)</strong>Autorizo comunicações sobre estoque, alimentação e produtos da Gestok. Posso cancelar a qualquer momento.</span></label>
            <p className="legal-note">Ao continuar, você também declara ciência dos nossos <Link to="/termos" target="_blank">Termos de Uso</Link>. O aceite de marketing não é necessário para usar o teste.</p>
          </div>}

          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-navigation">
            {step > 0 ? <button type="button" className="button button-ghost" onClick={() => { setStep(step - 1); setError('') }}><ChevronLeft size={17} /> Voltar</button> : <span />}
            {step < steps.length - 1 ? <button type="button" className="button" onClick={next}>Continuar <ArrowRight size={17} /></button> : <button className="button" disabled={submitting}>{submitting ? 'Enviando...' : 'Criar minha conta'} <ArrowRight size={17} /></button>}
          </div>
        </form>
      </main>
    </div>
  )
}
