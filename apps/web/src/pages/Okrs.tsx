import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Target, TrendingUp, CheckCircle2, AlertTriangle, Search, Users, User } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { NewObjectiveButton } from '@/components/actions'
import { Avatar } from '@/components/ui/Avatar'
import { StatCard } from '@/components/ui/StatCard'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useToast } from '@/components/ui/toast'
import { container, fadeUp, easeOut } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { useObjectives, type ApiObjective, type ApiKeyResult } from '@/api/okrs'

type Prioridad = ApiObjective['prioridad']
type Nivel = ApiObjective['nivel']

const prioVariant: Record<Prioridad, 'danger' | 'warning' | 'info' | 'neutral'> = {
  Crítico: 'danger',
  Alto: 'warning',
  Medio: 'info',
  Bajo: 'neutral',
}

const niveles: Nivel[] = ['Empresa', 'Área', 'Equipo']
const prioridades: Prioridad[] = ['Crítico', 'Alto', 'Medio', 'Bajo']

export function Okrs() {
  const { data: objetivos, isPending, isError, refetch } = useObjectives()
  const toast = useToast()
  const [open, setOpen] = useState<string | null>(null)
  // Vista global de admin (todos los owners/áreas) vs. solo los míos.
  const [scope, setScope] = useState<'global' | 'mios'>('global')
  const [query, setQuery] = useState('')
  const [fNivel, setFNivel] = useState<string[]>([])
  const [fPrio, setFPrio] = useState<string[]>([])

  // Auto-expande el primer objetivo cuando llegan los datos.
  useEffect(() => {
    if (open === null && objetivos?.length) setOpen(objetivos[0].id)
  }, [objetivos, open])

  useEffect(() => {
    if (isError) toast.error('No se pudieron cargar los OKRs', 'Reintenta en unos segundos.')
  }, [isError, toast])

  // ponytail: "Mis OKRs" compara por nombre de owner (el objetivo no liga a un
  // employeeId) — igual que el mock. Sin un employeeId en Objetivo no hay
  // forma exacta de mapear al usuario logueado; ajustar si el backend suma esa liga.
  const MI_NOMBRE = 'Alex Carter'

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (objetivos ?? []).filter((o) => {
      if (scope === 'mios' && o.owner !== MI_NOMBRE && !o.krs.some((k) => k.owner === MI_NOMBRE)) return false
      if (fNivel.length && !fNivel.includes(o.nivel)) return false
      if (fPrio.length && !fPrio.includes(o.prioridad)) return false
      if (q && !o.nombre.toLowerCase().includes(q) && !o.owner.toLowerCase().includes(q)) return false
      return true
    })
  }, [objetivos, scope, query, fNivel, fPrio])

  const avance = lista.length ? Math.round(lista.reduce((s, o) => s + o.progreso, 0) / lista.length) : 0
  const krs = lista.flatMap((o) => o.krs)
  const enMeta = krs.filter((k) => k.progreso >= 90).length
  const enRiesgo = lista.filter((o) => o.progreso < 50).length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Desempeño · OKRs"
        title="OKRs y Metas"
        description="Objetivos y resultados clave con avance medible por trimestre — T1 a T4, ponderado."
        action={<NewObjectiveButton />}
      />

      {isPending ? (
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-[104px] animate-pulse">{null}</Card>
          ))}
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Objetivos activos" value={lista.length} icon={Target} accent />
          <StatCard label="Avance global" value={avance} suffix="%" icon={TrendingUp} />
          <StatCard label="KRs en meta" value={enMeta} suffix={` / ${krs.length}`} icon={CheckCircle2} />
          <StatCard label="Objetivos en riesgo" value={enRiesgo} icon={AlertTriangle} deltaPositive={false} />
        </motion.div>
      )}

      {/* Vista global de admin: alcance + filtros */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex rounded-lg border border-line bg-panel p-1">
          <ScopeTab active={scope === 'global'} onClick={() => setScope('global')} icon={<Users size={14} />}>
            Todos
          </ScopeTab>
          <ScopeTab active={scope === 'mios'} onClick={() => setScope('mios')} icon={<User size={14} />}>
            Mis OKRs
          </ScopeTab>
        </div>
        <div className="flex min-w-[180px] flex-1 items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 focus-within:border-white/20">
          <Search size={15} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar objetivo o responsable…"
            className="w-full bg-transparent text-[13.5px] text-fg placeholder:text-faint focus:outline-none"
          />
        </div>
        <MultiSelect label="Nivel" selected={fNivel} onChange={setFNivel} options={niveles.map((n) => ({ value: n, label: n }))} />
        <MultiSelect label="Prioridad" selected={fPrio} onChange={setFPrio} options={prioridades.map((p) => ({ value: p, label: p }))} />
      </Card>

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-[76px] animate-pulse">{null}</Card>
          ))}
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-[13px] text-faint">No se pudieron cargar los OKRs.</p>
          <button onClick={() => refetch()} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted hover:text-fg">
            Reintentar
          </button>
        </Card>
      ) : lista.length === 0 ? (
        <Card className="py-16 text-center text-[13px] text-faint">Sin objetivos para estos filtros.</Card>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
          {lista.map((o) => (
            <motion.div key={o.id} variants={fadeUp}>
              <ObjectiveCard obj={o} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

function ScopeTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
        active ? 'bg-white/[0.1] text-fg' : 'text-muted hover:text-fg',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function ObjectiveCard({ obj, open, onToggle }: { obj: ApiObjective; open: boolean; onToggle: () => void }) {
  const progress = obj.progreso
  return (
    <Card className={cn('overflow-hidden transition-colors', open && 'border-white/15')}>
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left">
        <ProgressRing value={progress} size={52} stroke={4.5} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-fg">{obj.nombre}</h3>
            <Badge variant="outline">{obj.nivel}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
            <span className="flex items-center gap-1.5">
              <Avatar iniciales={obj.iniciales} gradient="linear-gradient(135deg,#a78bfa,#7c3aed)" size={18} />
              {obj.owner}
            </span>
            <span className="font-mono">{obj.krs.length} KRs</span>
            <span className="hidden sm:inline">Vence {obj.vencimiento}</span>
          </div>
        </div>
        <Badge variant={prioVariant[obj.prioridad]}>{obj.prioridad}</Badge>
        <ChevronDown size={18} className={cn('shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: easeOut }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-line bg-panel/40 p-5">
              {obj.krs.map((kr) => (
                <KrRow key={kr.id} kr={kr} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

const trimestreOrder = ['T1', 'T2', 'T3', 'T4']

function KrRow({ kr }: { kr: ApiKeyResult }) {
  const p = kr.progreso
  const trimestres = [...(kr.trimestres ?? [])].sort((a, b) => trimestreOrder.indexOf(a.trimestre) - trimestreOrder.indexOf(b.trimestre))
  return (
    <div className="rounded-[var(--radius)] border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-fg">{kr.nombre}</p>
          <p className="mt-0.5 text-[11.5px] text-faint">
            {kr.owner} · métrica: {kr.metrica}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Badge variant={prioVariant[kr.prioridad]}>{kr.prioridad}</Badge>
          <span className="font-mono text-[15px] font-semibold tabular text-accent">{p}%</span>
        </div>
      </div>

      {/* Desglose por trimestre — lo que el sistema actual NO permite */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {trimestres.map((t, i) => (
          <div key={t.trimestre} className="rounded-lg border border-line-soft bg-panel/60 p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold tracking-wide text-muted">{t.trimestre}</span>
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-faint">
                peso {t.peso}%
              </span>
            </div>
            <p className="mt-2 font-display text-lg leading-none font-semibold tabular text-fg">{t.avance}%</p>
            <div className="mt-2">
              <ProgressBar
                value={t.avance}
                height={4}
                delay={0.1 + i * 0.06}
                color={t.avance >= 80 ? 'var(--color-success)' : t.avance >= 45 ? 'var(--color-accent)' : 'var(--color-danger)'}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
