import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BrainCircuit, ChevronRight, CircleUserRound, CreditCard, LayoutDashboard, LogOut, Menu, PackageSearch, Repeat2, X } from 'lucide-react'
import { Brand } from './Brand'
import { useAuth } from '../context/AuthContext'

const navigation = [
  { to: '/app', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/app/produtos', label: 'Produtos', icon: PackageSearch },
  { to: '/app/movimentacoes', label: 'Entradas e saídas', icon: Repeat2 },
  { to: '/app/contagem-ia', label: 'Contagem por IA', icon: BrainCircuit, badge: 'Beta' },
]

const pageNames: Record<string, string> = {
  '/app': 'Visão geral',
  '/app/produtos': 'Produtos',
  '/app/movimentacoes': 'Entradas e saídas',
  '/app/contagem-ia': 'Contagem por foto',
  '/app/assinatura': 'Assinatura',
}

export function DashboardLayout() {
  const { profile, user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const trialDays = profile ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 86400000)) : 7

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="dashboard-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <Brand compact />
          <button className="icon-button mobile-only" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Menu principal">
          {navigation.map(({ to, label, icon: Icon, badge, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)}>
              <Icon size={19} /><span>{label}</span>{badge && <small>{badge}</small>}
            </NavLink>
          ))}
        </nav>
        <div className="trial-card">
          <div className="trial-card-top"><CreditCard size={17} /><span>Período gratuito</span></div>
          <strong>{trialDays} {trialDays === 1 ? 'dia restante' : 'dias restantes'}</strong>
          <div className="trial-progress"><span style={{ width: `${Math.min(100, (trialDays / 7) * 100)}%` }} /></div>
          <NavLink to="/app/assinatura">Ver assinatura <ChevronRight size={15} /></NavLink>
        </div>
        <div className="sidebar-user">
          <span className="avatar">{(profile?.full_name || user?.email || 'U').slice(0, 1).toUpperCase()}</span>
          <div><strong>{profile?.full_name || 'Minha conta'}</strong><small>{profile?.business_name || user?.email}</small></div>
          <button onClick={handleSignOut} aria-label="Sair"><LogOut size={18} /></button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <button className="icon-button mobile-only" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <div><span>Operação</span><strong>{pageNames[location.pathname] || 'Gestok'}</strong></div>
          <div className="header-status"><span /><span>Estoque sincronizado</span><CircleUserRound size={21} /></div>
        </header>
        <div className="dashboard-content"><Outlet /></div>
      </main>
      {menuOpen && <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}
    </div>
  )
}
