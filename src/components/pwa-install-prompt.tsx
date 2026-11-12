'use client'

import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> }
const DISMISSED_KEY = 'rg-pwa-install-dismissed-v1'

export function PwaInstallPrompt() {
  const [ios, setIos] = useState(false)
  const [standalone, setStandalone] = useState(true)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
    const isInstalled = matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
    setStandalone(isInstalled)
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !isInstalled)
    setDismissed(localStorage.getItem(DISMISSED_KEY) === '1')
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (standalone || dismissed || (!ios && !installPrompt)) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setStandalone(true)
    setInstallPrompt(null)
  }

  return (
    <aside className="pwa-install-card" aria-label="Instalar Registro de gastos">
      <span className="pwa-install-icon" aria-hidden="true">↗</span>
      <div className="pwa-install-copy">
        <strong>Usala como una app</strong>
        {ios ? (
          <p>En Safari, tocá <b>Compartir</b> y después <b>Agregar a pantalla de inicio</b>.</p>
        ) : (
          <p>Agregala a tu inicio para abrirla sin buscarla en Safari.</p>
        )}
      </div>
      {installPrompt ? <button type="button" className="pwa-install-action" onClick={() => void install()}>Instalar</button> : null}
      <button type="button" className="pwa-install-close" onClick={dismiss} aria-label="Cerrar sugerencia">×</button>
    </aside>
  )
}
