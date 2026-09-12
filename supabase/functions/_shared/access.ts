import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/**
 * Espelha public.has_app_access: só assinatura ativa ou teste em dia consome IA.
 * Checado antes de gastar token, e reforçado pelas policies do banco.
 */
export async function requireAppAccess(admin: SupabaseClient, userId: string, message: string) {
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_status,trial_ends_at')
    .eq('id', userId)
    .single()

  const hasAccess = profile?.subscription_status === 'active'
    || (profile?.subscription_status === 'trialing' && new Date(profile.trial_ends_at).getTime() > Date.now())
  if (!hasAccess) throw new Error(message)
}
