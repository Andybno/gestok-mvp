import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { touchLastSeen } from '../lib/api'
import type { Profile } from '../types'

type AuthContextValue = {
  user: User | null
  profile: Profile | null
  loading: boolean
  isDemo: boolean
  signUp: (data: { email: string; password: string; fullName: string; businessName: string }) => Promise<void>
  signIn: (email: string, password: string) => Promise<{ isAdmin: boolean }>
  enterDemo: () => void
  enterAdminDemo: () => void
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const DEMO_AUTH_KEY = 'gestok_demo_auth'
const DEMO_ADMIN_KEY = 'gestok_demo_admin'

function demoProfile(admin = false): Profile {
  if (admin) return {
    id: 'demo-admin',
    full_name: 'Administrador Gestok',
    business_name: 'Gestok',
    trial_ends_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    subscription_status: 'active',
    is_admin: true,
    last_seen_at: new Date().toISOString(),
    onboarding_status: 'completed',
  }
  const saved = localStorage.getItem('gestok_demo_profile')
  if (saved) return JSON.parse(saved)
  return {
    id: 'demo-user',
    full_name: 'Ana Souza',
    business_name: 'Bistrô da Ana',
    trial_ends_at: new Date(Date.now() + 6 * 86400000).toISOString(),
    subscription_status: 'trialing',
    is_admin: false,
    last_seen_at: new Date().toISOString(),
    onboarding_status: 'pending_booking',
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDemo, setIsDemo] = useState(false)

  const loadProfile = async (userId: string) => {
    if (!supabase) return
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) throw error
    const nextProfile = data as Profile
    setProfile(nextProfile)
    return nextProfile
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const active = localStorage.getItem(DEMO_AUTH_KEY) === 'true'
      const admin = localStorage.getItem(DEMO_ADMIN_KEY) === 'true'
      setIsDemo(active)
      if (active) {
        setUser({ id: admin ? 'demo-admin' : 'demo-user', email: admin ? 'admin@gestok.app' : 'demo@gestok.app' } as User)
        setProfile(demoProfile(admin))
      }
      setLoading(false)
      return
    }

    supabase!.auth.getSession().then(async ({ data }) => {
      const currentUser = data.session?.user ?? null
      setUser(currentUser)
      if (currentUser) await loadProfile(currentUser.id).catch(() => setProfile(null))
      setLoading(false)
    })

    const { data: listener } = supabase!.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) setTimeout(() => loadProfile(session.user.id).catch(() => setProfile(null)), 0)
      else setProfile(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user || !supabase) return
    const touch = () => { if (document.visibilityState === 'visible') void touchLastSeen().catch(() => undefined) }
    touch()
    const interval = window.setInterval(touch, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', touch)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', touch) }
  }, [user])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,
    isDemo,
    async signUp({ email, password, fullName, businessName }) {
      if (!supabase) {
        const nextProfile: Profile = {
          id: 'demo-user',
          full_name: fullName,
          business_name: businessName,
          trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          subscription_status: 'trialing',
          is_admin: false,
          last_seen_at: new Date().toISOString(),
          onboarding_status: 'pending_booking',
        }
        localStorage.setItem(DEMO_AUTH_KEY, 'true')
        localStorage.setItem('gestok_demo_profile', JSON.stringify(nextProfile))
        setIsDemo(true)
        setUser({ id: 'demo-user', email } as User)
        setProfile(nextProfile)
        return
      }
      const leadId = localStorage.getItem('gestok_lead_id')
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, business_name: businessName, lead_id: leadId } },
      })
      if (error) throw error
      if (!data.session || !data.user) throw new Error('Não foi possível iniciar sua sessão automaticamente. Tente criar a conta novamente.')
      await loadProfile(data.user.id)
    },
    async signIn(email, password) {
      if (!supabase) {
        localStorage.setItem(DEMO_AUTH_KEY, 'true')
        localStorage.removeItem(DEMO_ADMIN_KEY)
        setIsDemo(true)
        setUser({ id: 'demo-user', email } as User)
        setProfile(demoProfile())
        return { isAdmin: false }
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const nextProfile = data.user ? await loadProfile(data.user.id) : null
      return { isAdmin: Boolean(nextProfile?.is_admin) }
    },
    enterDemo() {
      localStorage.setItem(DEMO_AUTH_KEY, 'true')
      localStorage.removeItem(DEMO_ADMIN_KEY)
      setIsDemo(true)
      setUser({ id: 'demo-user', email: 'demo@gestok.app' } as User)
      setProfile(demoProfile())
    },
    enterAdminDemo() {
      localStorage.setItem(DEMO_AUTH_KEY, 'true')
      localStorage.setItem(DEMO_ADMIN_KEY, 'true')
      setIsDemo(true)
      setUser({ id: 'demo-admin', email: 'admin@gestok.app' } as User)
      setProfile(demoProfile(true))
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut()
      localStorage.removeItem(DEMO_AUTH_KEY)
      localStorage.removeItem(DEMO_ADMIN_KEY)
      setUser(null)
      setProfile(null)
      setIsDemo(false)
    },
    async refreshProfile() {
      if (user && supabase) await loadProfile(user.id)
      else if (isDemo) setProfile(demoProfile())
    },
  }), [user, profile, loading, isDemo])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return context
}
