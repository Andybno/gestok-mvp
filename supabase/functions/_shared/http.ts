export function corsHeaders(request: Request) {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*'
  const requestOrigin = request.headers.get('origin') || ''
  const origin = allowedOrigin === '*' || requestOrigin === allowedOrigin ? (allowedOrigin === '*' ? '*' : requestOrigin) : allowedOrigin
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  }
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) })
}

export function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'Erro inesperado.'
}
