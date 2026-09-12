import { corsHeaders, json, safeError } from '../_shared/http.ts'
import { requireAppAccess } from '../_shared/access.ts'
import { askVision, imageDataUrl } from '../_shared/openai.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'

const SIGNATURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand', 'product_kind', 'package_type', 'package_size', 'dominant_colors', 'label_text', 'shape', 'distinctive_marks', 'photo_quality', 'usable_for_matching'],
  properties: {
    brand: { type: 'string' },
    product_kind: { type: 'string' },
    package_type: { type: 'string', enum: ['garrafa', 'lata', 'saco', 'caixa', 'pote', 'pacote', 'bandeja', 'galao', 'outro'] },
    package_size: { type: 'string' },
    dominant_colors: { type: 'array', items: { type: 'string' } },
    label_text: { type: 'array', items: { type: 'string' } },
    shape: { type: 'string' },
    distinctive_marks: { type: 'string' },
    photo_quality: { type: 'string', enum: ['boa', 'media', 'ruim'] },
    usable_for_matching: { type: 'boolean' },
  },
}

const INSTRUCTIONS = 'Você cataloga produtos de estoque de restaurantes. Descreva apenas o que está visível na foto, com foco no que permite reconhecer esta embalagem depois, no meio de outras parecidas em uma prateleira. Não invente marca, sabor ou tamanho que não estejam legíveis. Deixe o campo vazio quando a informação não aparecer. Marque usable_for_matching como falso se a foto estiver escura, tremida, muito distante ou sem a embalagem visível. Responda em português do Brasil.'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405)
  try {
    const user = await requireUser(request)
    const body = await request.json()
    const path = String(body.path || '')
    if (!path.startsWith(`${user.id}/`)) throw new Error('Imagem inválida para esta conta.')

    const admin = adminClient()
    await requireAppAccess(admin, user.id, 'Seu teste terminou. Ative a assinatura para cadastrar produtos com foto.')

    const { data: blob, error: downloadError } = await admin.storage.from('product-photos').download(path)
    if (downloadError || !blob) throw new Error('Não foi possível ler a foto enviada.')

    const { parsed, model } = await askVision({
      userId: user.id,
      instructions: INSTRUCTIONS,
      content: [
        { type: 'input_text', text: 'Gere a ficha visual desta embalagem para que ela possa ser reconhecida em fotos de prateleira.' },
        { type: 'input_image', image_url: await imageDataUrl(blob), detail: 'high' },
      ],
      schemaName: 'product_signature',
      schema: SIGNATURE_SCHEMA,
    })

    // A foto do produto permanece no bucket: ela é exibida na lista e permite
    // regerar a ficha caso o prompt evolua.
    return json(request, { signature: parsed, model })
  } catch (error) {
    console.error('describe-product-photo:', safeError(error))
    return json(request, { error: safeError(error) }, 400)
  }
})
