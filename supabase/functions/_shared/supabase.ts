import { createClient } from 'npm:@supabase/supabase-js@2'

export function userClient(request: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: request.headers.get('Authorization') || '' } } },
  )
}

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function requireUser(request: Request) {
  const client = userClient(request)
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error('Sessão inválida. Entre novamente.')
  return data.user
}
