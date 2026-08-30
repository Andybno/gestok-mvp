import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Profile } from '../types'

type AuthContextValue = {
  user: User | null
  profile: Profile | null
  loading: boolean
  isDemo: boolean
  signUp: (data: { email: string; password: string; fullName: string; businessName: string }) => Promise<{ needsEmailConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<void>
  enterDemo: () => void
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const DEMO_AUTH_KEY = 'gestok_demo_auth'

function demoProfile(): Profile {
  const saved = localStorage.getItem('gestok_demo_profile')
  if (saved) return JSON.parse(saved)
  return {
    id: 'demo-user',
    full_name: 'Ana Souza',
    business_name: 'Bistrô da Ana',
    trial_ends_at: new Date(Date.now() + 6 * 86400000).toISOString(),
    subscription_status: 'trialing',
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
    setProfile(data as Profile)
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const active = localStorage.getItem(DEMO_AUTH_KEY) === 'true'
      setIsDemo(active)
      if (active) {
        setUser({ id: 'demo-user', email: 'demo@gestok.app' } as User)
        setProfile(demoProfile())
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
        }
        localStorage.setItem(DEMO_AUTH_KEY, 'true')
        localStorage.setItem('gestok_demo_profile', JSON.stringify(nextProfile))
        setIsDemo(true)
        setUser({ id: 'demo-user', email } as User)
        setProfile(nextProfile)
        return { needsEmailConfirmation: false }
      }
      const leadId = localStorage.getItem('gestok_lead_id')
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, business_name: businessName, lead_id: leadId } },
      })
      if (error) throw error
      return { needsEmailConfirmation: !data.session }
    },
    async signIn(email, password) {
      if (!supabase) {
        localStorage.setItem(DEMO_AUTH_KEY, 'true')
        setIsDemo(true)
        setUser({ id: 'demo-user', email } as User)
        setProfile(demoProfile())
        return
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    enterDemo() {
      localStorage.setItem(DEMO_AUTH_KEY, 'true')
      setIsDemo(true)
      setUser({ id: 'demo-user', email: 'demo@gestok.app' } as User)
      setProfile(demoProfile())
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut()
      localStorage.removeItem(DEMO_AUTH_KEY)
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
