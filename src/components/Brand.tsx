import { Boxes } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="Gestok, página inicial">
      <span className="brand-mark"><Boxes size={21} strokeWidth={2.2} /></span>
      <span>gestok</span>
    </Link>
  )
}
