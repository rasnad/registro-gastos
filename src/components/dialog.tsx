'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Icon, type IconName } from '@/components/icons'

const DialogCloseContext = createContext<(() => void) | null>(null)

export function useDialogClose() {
  return useContext(DialogCloseContext)
}

export function Dialog({
  label,
  icon,
  buttonClassName = 'primary-button',
  title,
  description,
  children,
  wide = false,
  defaultOpen = false,
  closeHref,
  trigger = true,
  titleId,
}: {
  label: string
  icon?: IconName
  buttonClassName?: string
  title: string
  description?: string
  children: ReactNode
  wide?: boolean
  defaultOpen?: boolean
  closeHref?: string
  trigger?: boolean
  titleId?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const router = useRouter()

  const close = () => {
    setOpen(false)
    if (closeHref) router.replace(closeHref)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <>
      {trigger ? (
        <button type="button" className={buttonClassName} onClick={() => setOpen(true)}>
          {icon ? <Icon name={icon} size={17} /> : null}
          {label}
        </button>
      ) : null}
      {open ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="modal-head">
              <div>
                <h2 id={titleId}>{title}</h2>
                {description ? <p>{description}</p> : null}
              </div>
              <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">
                <Icon name="close" size={16} />
              </button>
            </div>
            <DialogCloseContext.Provider value={close}>{children}</DialogCloseContext.Provider>
          </div>
        </div>
      ) : null}
    </>
  )
}
