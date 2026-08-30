import { adminClient } from '../_shared/supabase.ts'
import { verifyStripeSignature } from '../_shared/stripe.ts'

type StripeObject = Record<string, unknown>

function mapStatus(status?: string) {
  if (status === 'active') return 'active'
  if (status === 'trialing') return 'trialing'
  if (['past_due', 'unpaid', 'incomplete'].includes(status || '')) return 'past_due'
  return 'canceled'
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const payload = await request.text()
  const signature = request.headers.get('stripe-signature') || ''
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
  if (!secret || !(await verifyStripeSignature(payload, signature, secret))) {
    return new Response('Invalid signature', { status: 400 })
  }

  const event = JSON.parse(payload)
  const admin = adminClient()
  const { error: eventError } = await admin.from('stripe_events').insert({ id: event.id, event_type: event.type })
  if (eventError?.code === '23505') return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { 'Content-Type': 'application/json' } })
  if (eventError) return new Response('Event log failed', { status: 500 })

  try {
    const object = event.data.object as StripeObject
    if (event.type === 'checkout.session.completed') {
      const userId = (object.client_reference_id || (object.metadata as StripeObject)?.user_id) as string
      if (userId) await admin.from('profiles').update({
        stripe_customer_id: object.customer as string,
        stripe_subscription_id: object.subscription as string,
      }).eq('id', userId)
    }

    if (event.type.startsWith('customer.subscription.')) {
      const subscription = object
      const customerId = subscription.customer as string
      const item = ((subscription.items as StripeObject)?.data as StripeObject[])?.[0]
      const priceId = ((item?.price as StripeObject)?.id || null) as string | null
      const periodEnd = subscription.current_period_end ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null
      const trialEnd = subscription.trial_end ? new Date(Number(subscription.trial_end) * 1000).toISOString() : null
      const update: Record<string, unknown> = {
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        subscription_status: event.type === 'customer.subscription.deleted' ? 'canceled' : mapStatus(subscription.status as string),
        subscription_current_period_end: periodEnd,
      }
      if (trialEnd) update.trial_ends_at = trialEnd
      await admin.from('profiles').update(update).eq('stripe_customer_id', customerId)
    }

    if (event.type === 'invoice.payment_failed') {
      await admin.from('profiles').update({ subscription_status: 'past_due' }).eq('stripe_customer_id', object.customer as string)
    }
    if (event.type === 'invoice.payment_succeeded' && object.subscription) {
      await admin.from('profiles').update({ subscription_status: 'active' }).eq('stripe_customer_id', object.customer as string)
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('stripe-webhook:', error instanceof Error ? error.message : 'unknown')
    await admin.from('stripe_events').delete().eq('id', event.id)
    return new Response('Webhook processing failed', { status: 500 })
  }
})
