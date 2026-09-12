// Helpers compartilhados pelas funções de visão (contagem por foto e ficha
// visual do produto). Mantém a chave da OpenAI restrita ao servidor.

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)))
  }
  return btoa(binary)
}

/** Identificador estável e anônimo do usuário para a política de abuso da OpenAI. */
async function hashIdentifier(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 64)
}

// Fixo no código em vez de secret: para trocar de modelo, edite esta linha e
// republique as duas funções (describe-product-photo e analyze-inventory-image).
const VISION_MODEL = 'gpt-5.6-luna'

function visionModel() {
  return VISION_MODEL
}

export async function imageDataUrl(blob: Blob) {
  const mimeType = blob.type || 'image/jpeg'
  return `data:${mimeType};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`
}

type ResponseOutputPart = { type: string; text?: string }
type ResponseOutputItem = { type: string; content?: ResponseOutputPart[] }

/**
 * O campo `output_text` só existe quando a chamada passa pelo SDK oficial da
 * OpenAI (é calculado por ele). Chamando a Responses API crua via fetch, o
 * texto vem dentro de output[].content[] — precisa ser extraído manualmente.
 */
function extractOutputText(result: { output?: ResponseOutputItem[] }): string {
  for (const item of result.output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text
    }
  }
  throw new Error('A IA não retornou um resultado utilizável.')
}

type VisionInput = {
  userId: string
  instructions: string
  content: unknown[]
  schemaName: string
  schema: Record<string, unknown>
}

/** Chama a Responses API com Structured Outputs e devolve o JSON já validado pelo schema. */
export async function askVision({ userId, instructions, content, schemaName, schema }: VisionInput) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.')
  const model = visionModel()

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      safety_identifier: await hashIdentifier(userId),
      instructions,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
    }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error?.message || 'A análise da imagem falhou.')
  return { parsed: JSON.parse(extractOutputText(result)) as Record<string, unknown>, model }
}
