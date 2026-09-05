type MetaPixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  loaded: boolean
  queue: unknown[][]
  version: string
}

declare global {
  interface Window {
    fbq?: MetaPixel
    _fbq?: MetaPixel
  }
}

const DEFAULT_PIXEL_ID = '1033788426162119'
const BOOKING_TRACKING_KEY = 'gestok_meta_schedule_booking'
const initializedPixels = new Set<string>()

function getPixelId() {
  return (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim() || DEFAULT_PIXEL_ID
}

function ensurePixel() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

  if (!window.fbq) {
    const fbq = ((...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args)
      else fbq.queue.push(args)
    }) as MetaPixel

    fbq.loaded = true
    fbq.version = '2.0'
    fbq.queue = []
    window.fbq = fbq
    window._fbq = fbq

    if (!document.getElementById('meta-pixel-script')) {
      const script = document.createElement('script')
      script.id = 'meta-pixel-script'
      script.async = true
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'
      document.head.appendChild(script)
    }
  }

  const pixelId = getPixelId()
  if (!initializedPixels.has(pixelId)) {
    window.fbq('init', pixelId)
    initializedPixels.add(pixelId)
  }

  return window.fbq
}

export function trackMetaPageView() {
  ensurePixel()?.('track', 'PageView')
}

export function trackMetaOnboardingBooked(bookingUid?: string) {
  const bookingKey = bookingUid || 'booking-confirmed'
  if (localStorage.getItem(BOOKING_TRACKING_KEY) === bookingKey) return

  const fbq = ensurePixel()
  if (!fbq) return

  fbq('track', 'Schedule', { content_name: 'Reunião de onboarding agendada' })
  localStorage.setItem(BOOKING_TRACKING_KEY, bookingKey)
}
