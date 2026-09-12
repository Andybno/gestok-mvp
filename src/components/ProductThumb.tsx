import { useEffect, useState } from 'react'
import { productPhotoUrl } from '../lib/api'

type Props = {
  name: string
  photoPath?: string | null
  size?: 'sm' | 'md'
}

/** Miniatura do produto por URL assinada, com as iniciais como fallback. */
export function ProductThumb({ name, photoPath, size = 'md' }: Props) {
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null)

  useEffect(() => {
    if (!photoPath) return
    let active = true
    productPhotoUrl(photoPath)
      .then((signed) => { if (active) setResolved({ path: photoPath, url: signed }) })
      .catch(() => undefined)
    return () => { active = false }
  }, [photoPath])

  // Derivado na renderização: evita mostrar a foto anterior ao trocar de produto.
  const url = resolved && resolved.path === photoPath ? resolved.url : ''

  return (
    <span className={`product-thumb product-thumb-${size}`}>
      {url ? <img src={url} alt={`Foto de ${name}`} loading="lazy" /> : name.slice(0, 2).toUpperCase()}
    </span>
  )
}
