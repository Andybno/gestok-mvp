import { corsHeaders, json, safeError } from '../_shared/http.ts'
import { requireAppAccess } from '../_shared/access.ts'
import { askVision, imageDataUrl } from '../_shared/openai.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'

/** Teto de produtos enviados no prompt, para manter custo e latência previsíveis. */
const CATALOG_LIMIT = 120

const INSTRUCTIONS = `Você é especialista em contagem de estoque de restaurantes e food service. Sua tarefa é transformar uma foto de prateleira, câmara fria ou despensa em uma contagem confiável, item por item.

CONTAGEM
- Conte apenas produtos ou insumos de estoque realmente visíveis. Ignore pessoas, preços, etiquetas de prateleira, espaços vazios e prateleiras sem produto.
- Agrupe embalagens idênticas do mesmo produto em um único item do array, somando a quantidade total visível delas.
- Itens empilhados ou parcialmente encobertos: estime o total observando o padrão de empilhamento (ex.: uma fileira de frente com 6 unidades e mais 2 fileiras idênticas atrás sugerem cerca de 18), mas reduza "confidence" e explique a estimativa em "note". Nunca finja certeza sobre o que está oculto.
- Não conte a mesma unidade duas vezes por causa de reflexo em vidro, aço inox, plástico ou espelho.
- Produtos a granel ou vendidos por peso (hortifruti solto, grãos em bin): estime o peso total pelo volume ocupado no recipiente, na unidade mais adequada entre as permitidas.
- Uma caixa ou fardo fechado com quantidade de unidades impressa no rótulo conta como aquela quantidade de unidades — não como "1 caixa" — a menos que o catálogo do cliente já cadastre a caixa fechada como a própria unidade de estoque.

RECONHECIMENTO DO CATÁLOGO
- Você pode receber o catálogo de produtos deste cliente: nome, categoria, unidade e uma ficha visual (marca, tipo e tamanho da embalagem, cores dominantes, texto do rótulo, formato, marcas distintivas).
- Compare marca, cores, formato da embalagem, tamanho e texto do rótulo visível contra a ficha visual para decidir se um item da foto é aquele produto do catálogo.
- Só preencha "product_id" quando a correspondência for clara nesses atributos visuais. Diante de dúvida razoável — marca genérica parecida, variação de sabor ou tamanho não descrita na ficha, rótulo ilegível, foto de baixa qualidade — deixe "product_id" vazio mesmo que o nome pareça bater, e explique o motivo em "note".
- Nunca associe dois itens diferentes da imagem ao mesmo "product_id".
- "match_confidence" reflete apenas a certeza do casamento com o catálogo; "confidence" reflete apenas a certeza da contagem em si. São independentes: pode haver contagem certa de um item não reconhecido, ou reconhecimento certo de uma contagem incerta.

GERAL
- Não invente marca, sabor, tamanho ou qualquer informação que não esteja visível na imagem.
- Responda sempre em português do Brasil. Nomeie cada item como aparece no rótulo, ou de forma genérica e descritiva quando o rótulo não for legível.`

const FOCUS_INSTRUCTIONS = `Você está contando o estoque de UM ÚNICO produto específico. A ficha visual desse produto (marca, tipo e tamanho da embalagem, cores dominantes, texto do rótulo, formato, marcas distintivas) está descrita no texto a seguir.

CONTAGEM
- Conte apenas as unidades deste produto exato, realmente visíveis na foto.
- Ignore completamente qualquer outro produto, embalagem ou insumo que apareça na imagem, mesmo que pareça fazer parte do mesmo estoque — não os conte, não os mencione, não deixe que influenciem a contagem.
- Agrupe embalagens idênticas deste produto, somando a quantidade total visível.
- Itens empilhados ou parcialmente encobertos: estime o total observando o padrão de empilhamento, mas reduza "confidence" e explique a estimativa em "note". Nunca finja certeza sobre o que está oculto.
- Não conte a mesma unidade duas vezes por causa de reflexo em vidro, aço inox, plástico ou espelho.
- Se este produto for vendido a granel ou por peso, estime o total pelo volume ocupado no recipiente.
- Uma caixa ou fardo fechado com quantidade de unidades impressa no rótulo conta como aquela quantidade de unidades, não como "1 caixa".

RECONHECIMENTO
- Compare marca, cores, formato da embalagem, tamanho e texto do rótulo visível contra a ficha para confirmar que é este produto e não um parecido.
- Se este produto não aparecer claramente na foto, marque "visible" como falso e "estimated_quantity" como 0 — nunca adivinhe.

GERAL
- Não invente marca, sabor, tamanho ou qualquer informação que não esteja visível na imagem.
- Responda sempre em português do Brasil.`

const FOCUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['visible', 'estimated_quantity', 'unit', 'confidence', 'note'],
  properties: {
    visible: { type: 'boolean', description: 'Se este produto específico aparece claramente na foto.' },
    estimated_quantity: { type: 'number', minimum: 0, description: 'Quantidade total estimada deste produto visível na foto. Zero quando não aparecer.' },
    unit: { type: 'string', enum: ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    note: { type: 'string', description: 'Observação curta: motivo da incerteza, oclusão, granel, ou por que o produto não foi encontrado na foto.' },
  },
}

function countSchema(productIds: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'product_id', 'match_confidence', 'estimated_quantity', 'unit', 'confidence', 'note'],
          properties: {
            name: { type: 'string', description: 'Nome do item como aparece no rótulo, ou descritivo genérico se ilegível. Um item por tipo de embalagem, já somando as unidades agrupadas.' },
            // O enum restringe a resposta aos produtos reais do cliente: o modo
            // strict impede que o modelo invente um id inexistente.
            product_id: { type: 'string', enum: [...productIds, ''], description: 'Id do produto do catálogo que corresponde a este item, só quando marca, embalagem e rótulo baterem claramente com a ficha visual. String vazia quando não houver correspondência clara — nunca chute.' },
            match_confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Certeza de que product_id é o produto correto do catálogo (não a certeza da contagem).' },
            estimated_quantity: { type: 'number', minimum: 0, description: 'Quantidade total estimada deste item já visível na foto, somando itens agrupados e estimativas de itens parcialmente encobertos.' },
            unit: { type: 'string', enum: ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct'], description: 'Unidade de medida da quantidade estimada.' },
            confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Certeza da contagem em si (não da correspondência com o catálogo). Reduza para itens empilhados, encobertos ou a granel.' },
            note: { type: 'string', description: 'Observação curta em português: motivo da incerteza, oclusão, granel, ou por que não houve correspondência no catálogo. Vazio quando não houver nada a destacar.' },
          },
        },
      },
    },
  }
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

    await requireAppAccess(admin, user.id, 'Seu teste terminou. Ative a assinatura para usar a contagem por foto.')

    const { data: blob, error: downloadError } = await admin.storage.from('inventory-scans').download(path)
    if (downloadError || !blob) throw new Error('Não foi possível ler a imagem enviada.')

    // Contagem de um único produto (botão "Contar" na tela de Produtos):
    // ignora o catálogo inteiro e instrui a IA a considerar só este item.
    const focusProductId = body.focus_product_id ? String(body.focus_product_id) : null
    if (focusProductId) {
      const { data: product } = await admin
        .from('products')
        .select('id,name,category,unit,visual_signature')
        .eq('user_id', user.id)
        .eq('id', focusProductId)
        .single()
      if (!product) throw new Error('Produto não encontrado.')
      if (!product.visual_signature) throw new Error('Cadastre uma foto deste produto antes de contar por IA.')

      const { parsed, model } = await askVision({
        userId: user.id,
        instructions: FOCUS_INSTRUCTIONS,
        content: [
          { type: 'input_text', text: `Ficha visual do produto a contar (JSON): ${JSON.stringify({ name: product.name, category: product.category, unit: product.unit, visual_signature: product.visual_signature })}` },
          { type: 'input_image', image_url: await imageDataUrl(blob), detail: 'high' },
        ],
        schemaName: 'single_product_count',
        schema: FOCUS_SCHEMA,
      })

      const visible = Boolean(parsed.visible)
      const estimatedQuantity = visible ? Number(parsed.estimated_quantity) || 0 : 0
      const unit = (parsed.unit as string) || product.unit
      const confidence = Number(parsed.confidence) || 0
      const note = (parsed.note as string) || undefined

      const items = [{ name: product.name, product_id: product.id, match_confidence: 1, estimated_quantity: estimatedQuantity, unit, confidence, note }]
      const { data: scan } = await admin
        .from('inventory_scans')
        .insert({ user_id: user.id, original_filename: path.split('/').pop(), items, model, status: 'completed' })
        .select('id')
        .single()
      return json(request, { visible, estimated_quantity: estimatedQuantity, unit, confidence, note, scan_id: scan?.id || null })
    }

    // Catálogo de referência: só produtos com ficha visual entram no prompt.
    // Sem nenhum cadastrado, a contagem continua funcionando em modo genérico.
    const { data: catalog } = await admin
      .from('products')
      .select('id,name,category,unit,visual_signature')
      .eq('user_id', user.id)
      .not('visual_signature', 'is', null)
      .order('created_at', { ascending: false })
      .limit(CATALOG_LIMIT)
    const products = catalog || []

    const content: unknown[] = [
      { type: 'input_text', text: 'Conte os itens de estoque visíveis nesta imagem, seguindo as regras de contagem e reconhecimento das instruções.' },
    ]
    if (products.length) {
      content.push({ type: 'input_text', text: `Catálogo de produtos deste cliente (JSON, use para o campo product_id): ${JSON.stringify(products)}` })
    }
    content.push({ type: 'input_image', image_url: await imageDataUrl(blob), detail: 'high' })

    const { parsed, model } = await askVision({
      userId: user.id,
      instructions: INSTRUCTIONS,
      content,
      schemaName: 'inventory_count',
      schema: countSchema(products.map((product) => product.id as string)),
    })

    const items = (parsed.items as Record<string, unknown>[]).map((item) => ({
      ...item,
      product_id: item.product_id || null,
      note: item.note || undefined,
    }))
    const { data: scan } = await admin
      .from('inventory_scans')
      .insert({ user_id: user.id, original_filename: path.split('/').pop(), items, model, status: 'completed' })
      .select('id')
      .single()
    return json(request, { items, scan_id: scan?.id || null })
  } catch (error) {
    console.error('analyze-inventory-image:', safeError(error))
    return json(request, { error: safeError(error) }, 400)
  } finally {
    if (path) await admin.storage.from('inventory-scans').remove([path])
  }
})
