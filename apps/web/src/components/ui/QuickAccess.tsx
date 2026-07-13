import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface QuickLink {
  to: string
  label: string
  icon: LucideIcon
}

/**
 * Fila de chips de redirección reutilizable.
 * Pensado para el slot de acciones del PageHeader.
 */
export function QuickAccess({ links, className }: { links: QuickLink[]; className?: string }) {
  return (
    <nav className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label="Accesos directos">
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={cn(
            'group/qa relative inline-flex h-9.5 items-center gap-2 overflow-hidden rounded-lg px-3.5',
            'text-[13px] font-medium text-muted ring-1 ring-line ring-inset',
            'transition-colors duration-300 ease-out hover:text-fg hover:ring-accent/20',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          )}
        >
          {/* Wash ámbar que entra desde la esquina al pasar el cursor */}
          <span
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out group-hover/qa:opacity-100"
            style={{
              background:
                'radial-gradient(130% 130% at 0% 0%, rgba(255,178,36,0.10), rgba(245,158,11,0.03) 40%, transparent 65%)',
            }}
          />
          <l.icon
            size={15}
            strokeWidth={2}
            className="relative shrink-0 text-faint transition-colors duration-300 ease-out group-hover/qa:text-accent"
          />
          <span className="relative whitespace-nowrap">{l.label}</span>
        </Link>
      ))}
    </nav>
  )
}
