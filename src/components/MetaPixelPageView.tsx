import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { trackMetaPageView } from '../lib/metaPixel'

export function MetaPixelPageView() {
  const location = useLocation()

  useEffect(() => {
    trackMetaPageView()
  }, [location.pathname, location.search])

  return null
}
