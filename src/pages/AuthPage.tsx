import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, BarChart3, Check, Eye, EyeOff, LockKeyhole, PackageCheck, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

export function AuthPage({ mode }: { mode: 'signup' | 'signin' }) {
  const { user, signUp, signIn, enterDemo } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (mode !== 'signup') return
    const saved = localStorage.getItem('gestok_signup_prefill')
    if (saved) {
      const prefill = JSON.parse(saved)
      setEmail(prefill.email || '')
      setFullName(prefill.fullName || '')
      setBusinessName(prefill.businessName || '')
    }
  }, [mode])

  if (user) return <Navigate to="/app" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.')
        const result = await signUp({ email, password, fullName, businessName })
        if (result.needsEmailConfirmation) setMessage('Enviamos um link para confirmar seu e-mail. Depois da confirmação, entre na sua conta.')
        else navigate('/app')
      } else {
        await signIn(email, password)
        navigate('/app')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível continuar.')
    } finally { setLoading(false) }
  }

  const demo = () => { enterDemo(); navigate('/app') }

  return (
    <div className="auth-page">
      <section className="auth-brand-panel">
        <Brand />
        <div className="auth-pitch">
          <span className="kicker light"><Sparkles size={14} /> 7 dias por nossa conta</span>
          <h1>{mode === 'signup' ? 'Seu estoque começa a trabalhar a seu favor.' : 'Bom ter você de volta.'}</h1>
          <p>{mode === 'signup' ? 'Cadastre seus produtos, acompanhe movimentações e teste a contagem por foto sem informar cartão.' : 'Entre para continuar acompanhando sua operação.'}</p>
          <div className="auth-benefits"><span><Check /> Cadastro rápido de produtos</span><span><Check /> Alertas de estoque mínimo</span><span><Check /> Entradas e saídas organizadas</span></div>
        </div>
        <div className="auth-mini-dashboard"><div><PackageCheck /><span><small>Itens monitorados</small><strong>148 produtos</strong></span><em>+12</em></div><div><BarChart3 /><span><small>Economia estimada</small><strong>R$ 1.280/mês</strong></span><em>+18%</em></div></div>
        <small className="auth-legal"><ShieldCheck size={14} /> Seus dados são protegidos e nunca vendemos suas informações.</small>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-heading"><span className="auth-icon"><LockKeyhole size={20} /></span><h2>{mode === 'signup' ? 'Crie sua conta' : 'Acesse sua conta'}</h2><p>{mode === 'signup' ? 'Seu teste começa assim que a conta for criada.' : 'Use o e-mail cadastrado para entrar.'}</p></div>
          <form onSubmit={submit} className="auth-form">
            {mode === 'signup' && <>
              <label className="field"><span>Nome completo</span><input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="Seu nome" /></label>
              <label className="field"><span>Nome do estabelecimento</span><input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoComplete="organization" placeholder="Sua empresa" /></label>
            </>}
            <label className="field"><span>E-mail</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="voce@empresa.com" /></label>
            <label className="field"><span>Senha {mode === 'signup' && <small>mínimo 8 caracteres</small>}</span><div className="password-field"><input required minLength={8} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="••••••••" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            {error && <div className="form-error">{error}</div>}
            {message && <div className="form-success">{message}</div>}
            <button className="button button-lg auth-submit" disabled={loading}>{loading ? 'Aguarde...' : mode === 'signup' ? 'Começar meus 7 dias grátis' : 'Entrar na Gestok'} <ArrowRight size={18} /></button>
          </form>
          {!isSupabaseConfigured && <button className="demo-button" type="button" onClick={demo}><Sparkles size={16} /> Explorar demonstração</button>}
          <p className="auth-switch">{mode === 'signup' ? <>Já tem uma conta? <Link to="/entrar">Entrar</Link></> : <>Ainda não começou? <Link to="/diagnostico">Testar grátis</Link></>}</p>
          {mode === 'signup' && <p className="auth-terms">Ao criar sua conta, você concorda com os <Link to="/termos">Termos de Uso</Link> e a <Link to="/privacidade">Política de Privacidade</Link>.</p>}
        </div>
      </section>
    </div>
  )
}
