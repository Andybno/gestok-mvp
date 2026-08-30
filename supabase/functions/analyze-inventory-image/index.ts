import { corsHeaders, json, safeError } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)))
  }
  return btoa(binary)
}

async function hashIdentifier(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 64)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405)
  let path = ''
  const admin = adminClient()
  try {
    const user = await requireUser(request)
    const body = await request.json()
    path = String(body.path || '')
    if (!path.startsWith(`${user.id}/`)) throw new Error('Imagem inválida para esta conta.')

    const { data: profile } = await admin.from('profiles').select('subscription_status,trial_ends_at').eq('id', user.id).single()
    const hasAccess = profile?.subscription_status === 'active' || (profile?.subscription_status === 'trialing' && new Date(profile.trial_ends_at).getTime() > Date.now())
    if (!hasAccess) throw new Error('Seu teste terminou. Ative a assinatura para usar a contagem por foto.')

    const { data: blob, error: downloadError } = await admin.storage.from('inventory-scans').download(path)
    if (downloadError || !blob) throw new Error('Não foi possível ler a imagem enviada.')
    const mimeType = blob.type || 'image/jpeg'
    const image = `data:${mimeType};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    const model = Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-5.4'
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.')

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        safety_identifier: await hashIdentifier(user.id),
        instructions: 'Você auxilia inventários de restaurantes. Identifique somente produtos ou insumos de estoque realmente visíveis. Não invente itens encobertos. Quantidades são estimativas e devem refletir unidades visíveis ou peso claramente indicado na embalagem. Responda em português do Brasil.',
        input: [{ role: 'user', content: [
          { type: 'input_text', text: 'Conte os itens de estoque visíveis nesta imagem. Agrupe embalagens idênticas. Informe uma observação curta quando houver oclusão, baixa nitidez ou incerteza.' },
          { type: 'input_image', image_url: image, detail: 'high' },
        ] }],
        text: { format: { type: 'json_schema', name: 'inventory_count', strict: true, schema: {
          type: 'object', additionalProperties: false, required: ['items'], properties: {
            items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name','estimated_quantity','unit','confidence','note'], properties: {
              name: { type: 'string' }, estimated_quantity: { type: 'number', minimum: 0 }, unit: { type: 'string', enum: ['un','kg','g','l','ml','cx','pct'] }, confidence: { type: 'number', minimum: 0, maximum: 1 }, note: { type: 'string' },
            } } },
          },
        } } },
      }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result?.error?.message || 'A análise da imagem falhou.')
    const parsed = JSON.parse(result.output_text)
    const items = parsed.items.map((item: Record<string, unknown>) => ({ ...item, note: item.note || undefined }))
    await admin.from('inventory_scans').insert({ user_id: user.id, original_filename: path.split('/').pop(), items, model, status: 'completed' })
    return json(request, { items })
  } catch (error) {
    console.error('analyze-inventory-image:', safeError(error))
    return json(request, { error: safeError(error) }, 400)
  } finally {
    if (path) await admin.storage.from('inventory-scans').remove([path])
  }
})
