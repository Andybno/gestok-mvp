import { corsHeaders, json, safeError } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'
import { stripeRequest } from '../_shared/stripe.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405)
  try {
    const user = await requireUser(request)
    const admin = adminClient()
    const { data: profile, error } = await admin.from('profiles').select('*').eq('id', user.id).single()
    if (error || !profile) throw new Error('Perfil não encontrado.')

    let customerId = profile.stripe_customer_id as string | null
    if (!customerId) {
      const customer = await stripeRequest('customers', new URLSearchParams({
        email: user.email || '',
        name: profile.full_name || '',
        'metadata[supabase_user_id]': user.id,
      }))
      customerId = customer.id
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    const appUrl = Deno.env.get('APP_URL') || Deno.env.get('ALLOWED_ORIGIN')
    const priceId = Deno.env.get('STRIPE_PRICE_ID')
    if (!appUrl || !priceId) throw new Error('APP_URL ou STRIPE_PRICE_ID não configurado.')
    const params = new URLSearchParams({
      mode: 'subscription', customer: customerId!, client_reference_id: user.id,
      success_url: `${appUrl}/app/assinatura?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/app/assinatura?checkout=canceled`,
      'line_items[0][price]': priceId, 'line_items[0][quantity]': '1',
      allow_promotion_codes: 'true', billing_address_collection: 'auto',
      'metadata[user_id]': user.id, 'subscription_data[metadata][user_id]': user.id,
    })
    const daysRemaining = Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 86400000))
    if (daysRemaining > 0) params.set('subscription_data[trial_period_days]', String(daysRemaining))
    const session = await stripeRequest('checkout/sessions', params)
    return json(request, { url: session.url })
  } catch (error) {
    console.error('create-checkout-session:', safeError(error))
    return json(request, { error: safeError(error) }, 400)
  }
})
