import { useRef } from 'react'
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useCountUp } from '@/lib/useCountUp'
import { fadeUp } from '@/lib/motion'
import { cn } from '@/lib/cn'

export function StatCard({
  label,
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  delta,
  deltaPositive = true,
  icon: Icon,
  accent,
  plain,
}: {
  label: string
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  delta?: string
  deltaPositive?: boolean
  icon: LucideIcon
  accent?: boolean
  plain?: boolean
}) {
  const n = useCountUp(value, { decimals })
  const display = plain
    ? String(value)
    : n.toLocaleString('es-419', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  const ref = useRef<HTMLDivElement>(null)
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      onMouseMove={handleMove}
      style={{ '--mx': '50%', '--my': '0%' } as React.CSSProperties}
      className={cn(
        'group relative overflow-hidden rounded-[var(--radius)] border border-line bg-card p-5',
        'transition-[border-color,box-shadow] duration-500 ease-out',
        'hover:border-accent/15',
        'hover:shadow-[0_6px_24px_-16px_rgba(255,178,36,0.25)]',
      )}
    >
      {/* Warm corner wash — fades + drifts in on hover */}
      <div
        className="pointer-events-none absolute inset-0 origin-top-right scale-95 opacity-0 transition-[opacity,transform] duration-700 ease-out group-hover:scale-100 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(135% 120% at 100% 0%, rgba(255,178,36,0.07) 0%, rgba(245,158,11,0.025) 38%, transparent 66%)',
        }}
      />
      {/* Cursor-tracking spotlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(240px circle at var(--mx) var(--my), rgba(255,178,36,0.06), transparent 60%)',
        }}
      />
      {/* Amber glow blob in the corner */}
      <div className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-accent/15 opacity-0 blur-3xl transition-opacity duration-700 ease-out group-hover:opacity-60" />
      {/* Top hairline that lights up */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent opacity-0 transition-opacity duration-700 ease-out group-hover:opacity-100" />

      <div className="relative flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted transition-colors duration-300 group-hover:text-fg/80">
          {label}
        </span>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-lg transition-colors duration-300',
            accent
              ? 'bg-accent-soft text-accent'
              : 'bg-white/[0.06] text-muted group-hover:bg-accent-soft group-hover:text-accent',
          )}
        >
          <Icon size={16} strokeWidth={2} />
        </span>
      </div>
      <div className="relative mt-3 flex flex-wrap items-end gap-x-2 gap-y-0.5">
        <span className="font-display text-[26px] leading-none font-semibold tracking-tight tabular text-fg sm:text-[30px]">
          {prefix}
          {display}
          {suffix}
        </span>
        {delta && (
          <span
            className={cn(
              'mb-0.5 inline-flex items-center gap-0.5 text-xs font-medium',
              deltaPositive ? 'text-success' : 'text-danger',
            )}
          >
            {deltaPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {delta}
          </span>
        )}
      </div>
    </motion.div>
  )
}
