import { corsHeaders, json, safeError } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'
import { stripeRequest } from '../_shared/stripe.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405)
  try {
    const user = await requireUser(request)
    const admin = adminClient()
    const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single()
    if (!profile?.stripe_customer_id) throw new Error('Nenhuma conta de cobrança foi encontrada.')
    const returnUrl = `${Deno.env.get('APP_URL') || Deno.env.get('ALLOWED_ORIGIN')}/app/assinatura`
    const session = await stripeRequest('billing_portal/sessions', new URLSearchParams({ customer: profile.stripe_customer_id, return_url: returnUrl }))
    return json(request, { url: session.url })
  } catch (error) {
    console.error('create-customer-portal:', safeError(error))
    return json(request, { error: safeError(error) }, 400)
  }
})
