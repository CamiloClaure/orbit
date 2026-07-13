import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Minimal dialog a11y for Modal/Drawer: focus moves into the dialog on open,
 * Escape closes it (when dismissable), Tab/Shift+Tab cycle within it, and
 * focus returns to whatever triggered it on close. No focus-trap library —
 * just querySelectorAll + a keydown listener, sized for these two components.
 */
export function useDialogA11y(open: boolean, onClose: () => void, dismissable = true) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement as HTMLElement | null

    // Next frame: lets the portal/enter-animation mount before we focus into it.
    const raf = requestAnimationFrame(() => {
      const root = ref.current
      if (!root) return
      const first = root.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? root).focus()
    })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dismissable) onClose()
        return
      }
      if (e.key !== 'Tab') return
      const root = ref.current
      if (!root) return
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown)
      trigger?.focus?.()
    }
  }, [open, dismissable, onClose])

  return ref
}
