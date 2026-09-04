import { createClient } from 'npm:@supabase/supabase-js@2'

type CreateAccountPayload = {
  email?: unknown
  password?: unknown
  fullName?: unknown
  businessName?: unknown
  leadId?: unknown
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function response(request: Request, body: unknown, status = 200) {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*'
  const requestOrigin = request.headers.get('origin') || ''
  const origin = allowedOrigin === '*' || requestOrigin === allowedOrigin ? (allowedOrigin === '*' ? '*' : requestOrigin) : allowedOrigin
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
      'Vary': 'Origin',
    },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return response(request, { ok: true })
  if (request.method !== 'POST') return response(request, { error: 'Método não permitido.' }, 405)

  try {
    const payload = await request.json() as CreateAccountPayload
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const password = typeof payload.password === 'string' ? payload.password : ''
    const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : ''
    const businessName = typeof payload.businessName === 'string' ? payload.businessName.trim() : ''
    const leadId = typeof payload.leadId === 'string' && UUID_PATTERN.test(payload.leadId) ? payload.leadId : null

    if (!EMAIL_PATTERN.test(email) || email.length > 254) return response(request, { error: 'Informe um e-mail válido.' }, 400)
    if (password.length < 8 || password.length > 72) return response(request, { error: 'A senha deve ter entre 8 e 72 caracteres.' }, 400)
    if (fullName.length < 2 || fullName.length > 120) return response(request, { error: 'Informe seu nome completo.' }, 400)
    if (businessName.length < 2 || businessName.length > 160) return response(request, { error: 'Informe o nome do estabelecimento.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return response(request, { error: 'Serviço temporariamente indisponível.' }, 503)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        business_name: businessName,
        lead_id: leadId,
      },
    })

    if (error) {
      const duplicate = error.message.toLowerCase().includes('already') || error.status === 422
      return response(request, {
        error: duplicate
          ? 'Já existe uma conta com este e-mail. Entre com sua senha para continuar.'
          : 'Não foi possível criar sua conta agora. Tente novamente em instantes.',
      }, duplicate ? 409 : 400)
    }

    return response(request, { userId: data.user.id }, 201)
  } catch {
    return response(request, { error: 'Não foi possível processar o cadastro.' }, 400)
  }
})
