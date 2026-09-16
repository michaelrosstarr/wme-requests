import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
let scriptPromise: Promise<void> | null = null

function loadTurnstileScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Turnstile'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export interface TurnstileHandle {
  reset: () => void
}

interface TurnstileProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
}

// Renders the Cloudflare Turnstile widget used to gate /sign-in/email and
// /request-password-reset (see the `captcha` plugin in src/lib/auth.ts). A token is
// single-use — callers must call reset() via the ref after every submit attempt (success
// or failure) before the widget can produce another one.
const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { siteKey, onVerify, onExpire },
  ref,
) {
  const containerId = `turnstile-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const widgetIdRef = useRef<string | null>(null)

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current)
    },
  }))

  useEffect(() => {
    let cancelled = false
    loadTurnstileScript().then(() => {
      if (cancelled || !window.turnstile) return
      widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
        sitekey: siteKey,
        callback: onVerify,
        'expired-callback': onExpire,
      })
    })
    return () => {
      cancelled = true
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current)
    }
    // Rendered once per mount — onVerify/onExpire are re-registered by re-rendering the
    // widget itself (via `reset`), not by re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, siteKey])

  return <div id={containerId} />
})

export default Turnstile
