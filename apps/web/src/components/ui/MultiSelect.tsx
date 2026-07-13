import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface MultiOption {
  value: string
  label: string
  icon?: React.ReactNode
}

/**
 * Filtro multiselección reutilizable (checkboxes en popover).
 * Selección vacía = "todos". Se usa igual en Empleados, Permisos y Nómina
 * para mantener los filtros consistentes en todo el sistema.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  className,
}: {
  label: string
  options: MultiOption[]
  selected: string[]
  onChange: (v: string[]) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])

  const count = selected.length

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-panel px-3 py-2 text-[13px] transition-colors focus:outline-none',
          count > 0 ? 'border-accent/40 text-fg' : 'border-line text-muted hover:border-white/20',
        )}
      >
        <span className="whitespace-nowrap">{label}</span>
        {count > 0 && (
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent">
            {count}
          </span>
        )}
        <ChevronDown size={14} className={cn('text-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-xl surface-blur">
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-faint transition-colors hover:bg-white/[0.04] hover:text-muted"
            >
              Limpiar selección
            </button>
          )}
          {options.map((o) => {
            const on = selected.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border',
                    on ? 'border-accent bg-accent text-bg' : 'border-line',
                  )}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                {o.icon}
                <span className="flex-1 truncate">{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
