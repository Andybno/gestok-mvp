import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { DashboardLayout } from './components/DashboardLayout'
import { LandingPage } from './pages/LandingPage'
import { LeadFormPage } from './pages/LeadFormPage'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProductsPage } from './pages/ProductsPage'
import { MovementsPage } from './pages/MovementsPage'
import { ScanPage } from './pages/ScanPage'
import { BillingPage } from './pages/BillingPage'
import { AdminPage } from './pages/AdminPage'
import { PrivacyPage, TermsPage } from './pages/LegalPages'
import './App.css'

function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loader"><span /><p>Preparando sua operação...</p></div>
  return user ? <DashboardLayout /> : <Navigate to="/entrar" replace />
}

function ProtectedAdminRoute() {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="app-loader"><span /><p>Validando acesso administrativo...</p></div>
  if (!user) return <Navigate to="/admin/entrar" replace />
  return profile?.is_admin ? <AdminPage /> : <Navigate to="/app" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/diagnostico" element={<LeadFormPage />} />
      <Route path="/cadastro" element={<AuthPage mode="signup" />} />
      <Route path="/entrar" element={<AuthPage mode="signin" />} />
      <Route path="/admin/entrar" element={<AuthPage mode="signin" adminMode />} />
      <Route path="/admin" element={<ProtectedAdminRoute />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/app" element={<ProtectedRoute />}>
        <Route index element={<DashboardPage />} />
        <Route path="produtos" element={<ProductsPage />} />
        <Route path="movimentacoes" element={<MovementsPage />} />
        <Route path="contagem-ia" element={<ScanPage />} />
        <Route path="assinatura" element={<BillingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
