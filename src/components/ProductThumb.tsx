import { useEffect, useState } from 'react'
import { inventoryScanImageUrl, productPhotoUrl } from '../lib/api'

type Props = {
  name: string
  photoPath?: string | null
  referencePhotoPath?: string | null
  size?: 'sm' | 'md'
}

/** Miniatura do produto por URL assinada, com as iniciais como fallback. */
export function ProductThumb({ name, photoPath, referencePhotoPath, size = 'md' }: Props) {
  const path = referencePhotoPath || photoPath || ''
  const source = referencePhotoPath ? 'inventory-scan' : 'product-photo'
  const cacheKey = path ? `${source}:${path}` : ''
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null)

  useEffect(() => {
    if (!path) return
    let active = true
    const resolver = referencePhotoPath ? inventoryScanImageUrl : productPhotoUrl
    resolver(path)
      .then((signed) => { if (active) setResolved({ key: cacheKey, url: signed }) })
      .catch(() => undefined)
    return () => { active = false }
  }, [cacheKey, path, referencePhotoPath])

  // Derivado na renderização: evita mostrar a foto anterior ao trocar de produto.
  const url = resolved && resolved.key === cacheKey ? resolved.url : ''

  return (
    <span className={`product-thumb product-thumb-${size}`}>
      {url ? <img src={url} alt={`Foto de ${name}`} loading="lazy" /> : name.slice(0, 2).toUpperCase()}
    </span>
  )
}
