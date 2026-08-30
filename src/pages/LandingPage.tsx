import { ArrowRight, BarChart3, BrainCircuit, Check, ChevronRight, ClipboardCheck, PackageCheck, ScanLine, ShieldCheck, Sparkles, TrendingDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'

const benefits = [
  { icon: PackageCheck, title: 'Estoque sob controle', text: 'Saiba o que tem, o que está acabando e quanto dinheiro está parado em ingredientes.' },
  { icon: TrendingDown, title: 'Menos perdas', text: 'Registre consumo, validade e desperdício para comprar com mais segurança.' },
  { icon: BrainCircuit, title: 'Contagem por foto', text: 'Fotografe prateleiras e receba uma pré-contagem com IA para revisar em minutos.' },
]

export function LandingPage() {
  return (
    <div className="public-page">
      <header className="public-header container">
        <Brand />
        <nav>
          <a href="#como-funciona">Como funciona</a>
          <a href="#recursos">Recursos</a>
          <a href="#teste">Teste grátis</a>
        </nav>
        <div className="header-actions">
          <Link className="text-link" to="/entrar">Entrar</Link>
          <Link className="button button-sm" to="/diagnostico">Quero testar <ArrowRight size={16} /></Link>
        </div>
      </header>

      <main>
        <section className="hero-section container">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={15} /> Estoque inteligente para operações de alimentação</div>
            <h1>Menos desperdício.<br /><span>Mais margem no prato.</span></h1>
            <p>A Gestok organiza entradas, saídas e contagens do seu estoque em um só lugar — do balcão ao delivery.</p>
            <div className="hero-actions">
              <Link className="button button-lg" to="/diagnostico">Começar teste gratuito <ArrowRight size={18} /></Link>
              <a className="button button-lg button-ghost" href="#como-funciona">Ver como funciona</a>
            </div>
            <div className="hero-proof">
              <span><Check size={15} /> 7 dias grátis</span>
              <span><Check size={15} /> Sem cartão para começar</span>
              <span><Check size={15} /> Cancele quando quiser</span>
            </div>
          </div>

          <div className="hero-visual" aria-label="Prévia da visão geral da Gestok">
            <div className="floating-pill pill-top"><span><ScanLine size={17} /></span> Contagem concluída <strong>98% confiança</strong></div>
            <div className="dashboard-preview">
              <div className="preview-sidebar">
                <div className="preview-logo"><PackageCheck size={16} /></div>
                {[1, 2, 3, 4].map((item) => <i key={item} className={item === 1 ? 'active' : ''} />)}
              </div>
              <div className="preview-main">
                <div className="preview-top"><div><small>Bom dia, Ana</small><strong>Visão geral</strong></div><span>AS</span></div>
                <div className="preview-stats">
                  <div><small>Valor em estoque</small><strong>R$ 8.420</strong><em>+4,2%</em></div>
                  <div><small>Itens cadastrados</small><strong>148</strong><em>12 baixos</em></div>
                  <div><small>Economia no mês</small><strong>R$ 1.280</strong><em>+18%</em></div>
                </div>
                <div className="preview-grid">
                  <div className="preview-chart">
                    <span><strong>Consumo semanal</strong><small>Últimos 7 dias</small></span>
                    <div className="bars">{[48, 72, 55, 84, 68, 91, 62].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
                  </div>
                  <div className="preview-alerts"><strong>Atenção</strong>{['Arroz branco', 'Azeite', 'Creme de leite'].map((name, i) => <span key={name}><i className={`food-dot dot-${i}`} />{name}<small>{[8, 4, 6][i]} un.</small></span>)}</div>
                </div>
              </div>
            </div>
            <div className="floating-pill pill-bottom"><span><TrendingDown size={17} /></span> Perdas reduziram <strong>18% este mês</strong></div>
          </div>
        </section>

        <section className="trust-strip">
          <div className="container"><span>Feito para quem vende comida</span><b>RESTAURANTES</b><b>DELIVERIES</b><b>CAFETERIAS</b><b>PADARIAS</b><b>DARK KITCHENS</b></div>
        </section>

        <section className="benefits-section container" id="recursos">
          <div className="section-heading"><span className="kicker">Tudo no lugar</span><h2>Seu estoque deixa de ser um palpite.</h2><p>Uma rotina simples para sua equipe e números claros para você decidir.</p></div>
          <div className="benefit-grid">
            {benefits.map(({ icon: Icon, title, text }, index) => (
              <article key={title} className={`benefit-card benefit-${index}`}><div className="benefit-icon"><Icon /></div><h3>{title}</h3><p>{text}</p><span>Conhecer recurso <ChevronRight size={16} /></span></article>
            ))}
          </div>
        </section>

        <section className="how-section" id="como-funciona">
          <div className="container how-grid">
            <div className="how-copy"><span className="kicker">Comece leve</span><h2>Da primeira resposta ao estoque organizado.</h2><p>Entendemos sua operação antes de configurar a experiência. Em poucos minutos você já pode registrar seus produtos.</p>
              <div className="steps">
                <div><span>01</span><div><strong>Conte sobre a operação</strong><p>Canal de venda, tamanho, rotina atual e principais dificuldades.</p></div></div>
                <div><span>02</span><div><strong>Crie sua conta</strong><p>Seu período gratuito de 7 dias começa no cadastro.</p></div></div>
                <div><span>03</span><div><strong>Cadastre e movimente</strong><p>Inclua produtos e registre cada entrada ou saída em segundos.</p></div></div>
              </div>
            </div>
            <div className="phone-card"><div className="phone-top"><span>9:41</span><i /></div><div className="phone-title"><small>Contagem diária</small><strong>Câmara fria</strong></div><div className="scan-window"><ScanLine size={72} /><span>3 prateleiras identificadas</span></div><div className="scan-result"><span><i className="food-dot dot-0" />Filé de frango</span><strong>18,5 kg</strong></div><div className="scan-result"><span><i className="food-dot dot-1" />Tomate italiano</span><strong>6,2 kg</strong></div><button>Revisar contagem</button></div>
          </div>
        </section>

        <section className="cta-section container" id="teste">
          <div><span className="kicker light">Seu próximo inventário começa aqui</span><h2>Controle o estoque antes que ele controle sua margem.</h2><p>Responda ao diagnóstico e experimente a Gestok por 7 dias.</p></div>
          <Link className="button button-light button-lg" to="/diagnostico">Quero organizar meu estoque <ArrowRight size={18} /></Link>
          <ClipboardCheck className="cta-icon icon-one" /><BarChart3 className="cta-icon icon-two" />
        </section>
      </main>

      <footer className="public-footer container"><Brand compact /><p>Estoque simples para quem vive de comida.</p><div><Link to="/privacidade"><ShieldCheck size={14} /> Privacidade</Link><Link to="/termos">Termos de uso</Link></div><small>© {new Date().getFullYear()} Gestok</small></footer>
    </div>
  )
}
