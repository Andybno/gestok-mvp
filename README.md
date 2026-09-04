# Gestok

MVP de uma plataforma de estoque para restaurantes, deliveries, cafeterias, padarias e outras operações de alimentação. Inclui aquisição de leads, trilha de consentimento LGPD, teste de 7 dias, autenticação, gestão de estoque, movimentações, assinatura recorrente e contagem por foto com IA.

## O que já está implementado

- Landing page responsiva e diagnóstico conversacional em até dez perguntas.
- Consentimento necessário separado do consentimento opcional de marketing, com versão e data da política.
- Cadastro e login imediato com Supabase Auth, sem confirmação por e-mail; modo demonstração quando não há ambiente configurado.
- Agendamento de onboarding obrigatório pelo Cal.com incorporado à Gestok, com Google Meet, evento no calendário compartilhado `Gestok | Onboarding` e liberação posterior pelo administrador.
- Teste gratuito de 7 dias iniciado somente quando o administrador conclui o onboarding.
- Produtos, estoque mínimo, custo e validade.
- Entradas, saídas e ajustes atômicos no banco, com proteção contra saldo negativo.
- Contagem beta por foto em Edge Function com OpenAI Responses API e Structured Outputs.
- Remoção da foto após o processamento; só o resultado estruturado é mantido.
- Checkout de assinatura, portal do cliente e webhook do Stripe.
- Row Level Security (RLS) por usuário e bloqueio de escrita quando o teste termina.
- Painel administrativo protegido com funil das 10 perguntas, conversão em conta, primeiro produto, último acesso e consulta dos dados de cada usuário.
- `.htaccess` para rotas React na Hostinger e CI de build no GitHub Actions.

## Stack

React 19, TypeScript, Vite, Supabase (Auth, Postgres, Storage e Edge Functions), Stripe Checkout/Billing Portal e OpenAI Responses API.

## Desenvolvimento local

Requisitos: Node.js 22 e pnpm 11.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Sem as variáveis do Supabase, o botão **Explorar demonstração** habilita dados locais para navegar pela ferramenta.

## Configurar Supabase

1. Crie um projeto e execute as migrations em `supabase/migrations` na ordem, ou use `supabase db push` com o projeto vinculado.
2. Em Authentication, configure o URL do site, os URLs de redirecionamento do domínio final e desative **Confirm email** para liberar a sessão imediatamente após o cadastro.
3. Publique as quatro funções:

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-customer-portal
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy analyze-inventory-image
```

4. Configure os segredos das funções — nunca use o prefixo `VITE_` para segredos:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set STRIPE_PRICE_ID=price_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set OPENAI_API_KEY=sk-proj_...
supabase secrets set OPENAI_VISION_MODEL=gpt-5.4
supabase secrets set APP_URL=https://seu-dominio.com.br
supabase secrets set ALLOWED_ORIGIN=https://seu-dominio.com.br
```

No frontend, copie o Project URL e a chave publishable/anon para `.env.local`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_publica
VITE_APP_URL=https://seu-dominio.com.br
```

### Criar a conta administradora

Crie primeiro uma conta normal pelo aplicativo. Depois, no SQL Editor do Supabase, promova somente o e-mail autorizado:

```sql
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'SEU-EMAIL-ADMIN');
```

O acesso administrativo fica em `/admin/entrar`. Não coloque senhas ou listas de administradores no código frontend.

## Configurar Stripe

1. Crie o produto **Gestok Essencial** e um preço mensal recorrente.
2. Use o `price_...` em `STRIPE_PRICE_ID`.
3. Crie um webhook apontando para:

```text
https://SEU-PROJETO.supabase.co/functions/v1/stripe-webhook
```

Eventos necessários:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Use o signing secret do endpoint em `STRIPE_WEBHOOK_SECRET`. Ative também o Customer Portal no painel do Stripe.

O teste começa sem cartão. Se o usuário cadastrar o cartão antes de terminar, o Checkout transfere os dias restantes para o trial da assinatura e o Stripe cobra ao final. Sem cartão, as políticas do banco bloqueiam novas alterações após o 7º dia.

## Publicar na Hostinger

Para hospedagem estática:

```bash
pnpm build
```

Publique o conteúdo de `dist/` na pasta `public_html`. O arquivo `public/.htaccess` é copiado para o build e faz o fallback das rotas para `index.html`.

Se o plano da Hostinger permitir deploy por Git, use:

- Comando de instalação: `pnpm install --frozen-lockfile`
- Comando de build: `pnpm build`
- Diretório público: `dist`

Cadastre no ambiente de build somente as três variáveis `VITE_*` públicas. Chaves secretas pertencem exclusivamente ao Supabase.

## Checklist antes do lançamento

- Trocar o nome provisório Gestok, preço e domínio se o grupo decidir outra marca.
- Revisar Política de Privacidade e Termos com orientação jurídica e incluir razão social, CNPJ, endereço e contato real do controlador.
- Confirmar domínio e e-mail de privacidade.
- Configurar proteção contra abuso no formulário público (Turnstile ou rate limit em Edge Function).
- Testar o Stripe em modo teste antes de ativar chaves de produção.
- Definir retenção dos resultados de contagem e rotina de exclusão conforme a política final.

## Qualidade

```bash
pnpm check
```

O comando executa lint e build de produção.
