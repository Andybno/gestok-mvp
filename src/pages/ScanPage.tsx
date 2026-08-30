import { useRef, useState } from 'react'
import { AlertCircle, BrainCircuit, Camera, Check, Edit3, ImagePlus, LoaderCircle, LockKeyhole, RotateCcw, ScanLine, Sparkles, Trash2, UploadCloud } from 'lucide-react'
import { analyzeInventoryImage } from '../lib/api'
import type { InventoryScanItem } from '../types'

export function ScanPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [items, setItems] = useState<InventoryScanItem[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const choose = (selected?: File) => {
    if (!selected) return
    if (!selected.type.startsWith('image/')) return setError('Envie uma imagem JPG, PNG ou WEBP.')
    if (selected.size > 10 * 1024 * 1024) return setError('A imagem deve ter no máximo 10 MB.')
    if (preview) URL.revokeObjectURL(preview)
    setFile(selected); setPreview(URL.createObjectURL(selected)); setItems([]); setSaved(false); setError('')
  }

  const analyze = async () => {
    if (!file) return
    setAnalyzing(true); setProgress(18); setError('')
    const timer = window.setInterval(() => setProgress((current) => Math.min(91, current + Math.random() * 12)), 280)
    try { const result = await analyzeInventoryImage(file); setItems(result); setProgress(100) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'A análise falhou. Tente com outra foto.') }
    finally { window.clearInterval(timer); setAnalyzing(false) }
  }

  const reset = () => { if (preview) URL.revokeObjectURL(preview); setFile(null); setPreview(''); setItems([]); setError(''); setSaved(false); setProgress(0) }
  const updateItem = (index: number, patch: Partial<InventoryScanItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))

  return (
    <div className="scan-page">
      <div className="page-title-row"><div><div className="beta-kicker"><BrainCircuit size={15} /> Recurso em versão beta</div><h1>Contagem por foto</h1><p>Transforme uma foto da prateleira em uma contagem pronta para revisão.</p></div></div>
      <div className="scan-layout">
        <section className="panel scan-workspace">
          {!file ? <button className="upload-zone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0]) }}><span className="upload-icon"><UploadCloud size={30} /></span><h2>Envie uma foto do estoque</h2><p>Arraste a imagem para cá ou clique para escolher</p><small>JPG, PNG ou WEBP · até 10 MB</small><em><ImagePlus size={16} /> Escolher imagem</em></button> : <div className="image-workspace"><div className="image-frame"><img src={preview} alt="Foto do estoque selecionada" />{analyzing && <div className="scan-overlay"><i /><span><ScanLine size={24} /> Analisando itens visíveis...</span></div>}</div><div className="image-actions"><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></div><button className="icon-button" onClick={() => inputRef.current?.click()} aria-label="Trocar imagem"><Edit3 size={18} /></button><button className="icon-button danger" onClick={reset} aria-label="Remover imagem"><Trash2 size={18} /></button></div></div>}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => choose(e.target.files?.[0])} />
          {analyzing && <div className="analysis-progress"><div><span><LoaderCircle className="spin" size={17} /> A IA está identificando os produtos</span><strong>{Math.round(progress)}%</strong></div><i><span style={{ width: `${progress}%` }} /></i><small>Isso costuma levar alguns segundos.</small></div>}
          {error && <div className="form-error"><AlertCircle size={16} /> {error}</div>}
          {file && !items.length && !analyzing && <button className="button button-lg scan-submit" onClick={analyze}><Sparkles size={18} /> Analisar foto com IA</button>}
        </section>

        <aside className="scan-tips">
          <div className="tip-heading"><Camera size={21} /><div><h2>Para uma contagem melhor</h2><p>Pequenos cuidados aumentam a precisão.</p></div></div>
          <ol><li><span>1</span><div><strong>Boa iluminação</strong><p>Evite sombras fortes e reflexos.</p></div></li><li><span>2</span><div><strong>Itens de frente</strong><p>Deixe embalagens e rótulos visíveis.</p></div></li><li><span>3</span><div><strong>Uma área por vez</strong><p>Fotografe cada prateleira separadamente.</p></div></li></ol>
          <div className="privacy-tip"><LockKeyhole size={17} /><p><strong>Privacidade da imagem</strong>Evite incluir pessoas. A foto é usada somente para a contagem e removida após o processamento.</p></div>
          <div className="beta-note"><AlertCircle size={17} /><p>A IA pode errar itens parcialmente escondidos. Revise sempre o resultado antes de atualizar o estoque.</p></div>
        </aside>
      </div>

      {items.length > 0 && <section className="panel scan-results"><div className="panel-heading"><div><span className="result-check"><Check size={18} /></span><div><h2>Contagem pronta para revisão</h2><p>{items.length} itens identificados · ajuste o que for necessário</p></div></div><button className="button button-ghost" onClick={reset}><RotateCcw size={16} /> Nova foto</button></div><div className="result-table"><div className="result-head"><span>Item identificado</span><span>Quantidade</span><span>Unidade</span><span>Confiança</span><span /></div>{items.map((item, index) => <div className="result-row" key={`${item.name}-${index}`}><input value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} aria-label={`Nome do item ${index + 1}`} /><input type="number" min="0" step="0.1" value={item.estimated_quantity} onChange={(e) => updateItem(index, { estimated_quantity: Number(e.target.value) })} aria-label={`Quantidade de ${item.name}`} /><select value={item.unit} onChange={(e) => updateItem(index, { unit: e.target.value })}><option>un</option><option>kg</option><option>g</option><option>l</option><option>ml</option><option>cx</option><option>pct</option></select><span className={`confidence ${item.confidence >= .9 ? 'high' : item.confidence >= .75 ? 'medium' : 'low'}`}>{Math.round(item.confidence * 100)}%</span><button onClick={() => setItems(items.filter((_, i) => i !== index))} aria-label={`Remover ${item.name}`}><Trash2 size={16} /></button>{item.note && <small>{item.note}</small>}</div>)}</div><div className="results-footer"><div><AlertCircle size={16} /><span>Revise as quantidades. Nesta fase beta, a contagem não altera produtos automaticamente.</span></div><button className="button" onClick={() => setSaved(true)} disabled={saved}>{saved ? <><Check size={17} /> Contagem revisada</> : 'Confirmar revisão'}</button></div></section>}
    </div>
  )
}
