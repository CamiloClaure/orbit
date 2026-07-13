import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Users, Network, GitBranch, Maximize2, Minimize2, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Flag } from '@/components/ui/Flag'
import { useToast } from '@/components/ui/toast'
import { container, fadeUp, easeOut } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { countries, type Country } from '@/lib/countries'
import { useOrgchart, type OrgNode } from '@/api/orgchart'

/** The API returns a flat forest (no country/company wrapper) — group roots by país client-side to keep the existing collapsible-by-country UI. */
interface CountryGroup {
  id: string
  pais: Country
  nombre: string
  children: OrgNode[]
  total: number
}

function groupByCountry(roots: OrgNode[]): CountryGroup[] {
  const order: Country[] = ['BO', 'AR', 'CL', 'EC', 'PY']
  const byCountry = new Map<Country, OrgNode[]>()
  for (const r of roots) {
    const pais = r.pais as Country
    if (!byCountry.has(pais)) byCountry.set(pais, [])
    byCountry.get(pais)!.push(r)
  }
  return order
    .filter((c) => byCountry.has(c))
    .map((c) => {
      const jefes = byCountry.get(c)!.sort((a, b) => a.nombre.localeCompare(b.nombre))
      const total = jefes.reduce((s, j) => s + j.total, 0) + jefes.length
      return { id: `country-${c}`, pais: c, nombre: countries[c].nombre, children: jefes, total }
    })
}

function collectExpandable(node: OrgNode, acc: string[] = []): string[] {
  if (node.children.length) acc.push(node.id)
  node.children.forEach((c) => collectExpandable(c, acc))
  return acc
}

export function Organigrama() {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const { data, isPending, isError, refetch } = useOrgchart()
  const roots = data?.roots ?? []

  const groups = useMemo(() => groupByCountry(roots), [roots])
  const countryIds = useMemo(() => groups.map((g) => g.id), [groups])
  const allExpandable = useMemo(() => [...countryIds, ...groups.flatMap((g) => g.children.flatMap((j) => collectExpandable(j)))], [groups, countryIds])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Countries default-open once loaded (can't know ids before the fetch resolves).
  useMemo(() => {
    if (countryIds.length && expanded.size === 0) setExpanded(new Set(countryIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryIds.join(',')])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const allOpen = expanded.size >= allExpandable.length && allExpandable.length > 0
  const toggleAll = () => setExpanded(allOpen ? new Set(countryIds) : new Set(allExpandable))

  const q = query.trim().toLowerCase()
  const { groups: filteredGroups, forced } = useMemo(() => filterGroups(groups, q), [groups, q])
  const effectiveExpanded = q ? forced : expanded

  const totalPersonas = roots.reduce((s, r) => s + r.total + 1, 0)
  const totalJefaturas = useMemo(() => {
    let n = 0
    const walk = (node: OrgNode) => {
      if (node.children.length > 0) n++
      node.children.forEach(walk)
    }
    roots.forEach(walk)
    return n
  }, [roots])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Estructura organizacional"
        title="Organigrama"
        description="La estructura jerárquica y las líneas de reporte de la organización."
        action={
          <button
            onClick={toggleAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:border-white/20 hover:text-fg"
          >
            {allOpen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            {allOpen ? 'Colapsar todo' : 'Expandir todo'}
          </button>
        }
      />

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 min-[380px]:grid-cols-3 gap-4">
        <StatCard label="Personas" value={totalPersonas} icon={Users} accent />
        <StatCard label="Jefaturas" value={totalJefaturas} icon={Network} accent />
        <StatCard label="Países" value={groups.length} icon={GitBranch} accent />
      </motion.div>

      <Card className="p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 focus-within:border-white/20 sm:max-w-sm">
          <Search size={15} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar persona o puesto…"
            className="w-full bg-transparent text-[13.5px] text-fg placeholder:text-faint focus:outline-none"
          />
        </div>

        {isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-[13px] text-faint">No se pudo cargar el organigrama.</p>
            <button
              onClick={() => refetch().catch(() => toast.error('Error', 'Reintento fallido'))}
              className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted hover:text-fg"
            >
              Reintentar
            </button>
          </div>
        ) : isPending ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl border border-line-soft bg-panel/50" />
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-faint">Sin coincidencias en el organigrama.</p>
        ) : (
          <div className="space-y-2.5">
            {filteredGroups.map((g) => (
              <CountrySection key={g.id} group={g} expanded={effectiveExpanded} toggle={toggle} locked={!!q} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function CountrySection({
  group,
  expanded,
  toggle,
  locked,
}: {
  group: CountryGroup
  expanded: Set<string>
  toggle: (id: string) => void
  locked: boolean
}) {
  const open = expanded.has(group.id)
  return (
    <div className="overflow-hidden rounded-xl border border-line-soft">
      <button
        onClick={() => !locked && toggle(group.id)}
        className="flex w-full items-center gap-3 bg-panel/50 px-4 py-3 text-left transition-colors hover:bg-panel"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft">
          <Flag pais={group.pais} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-fg">{group.nombre}</p>
          <p className="text-[11.5px] text-faint">
            {group.children.length} jefatura{group.children.length === 1 ? '' : 's'} · {group.total} personas
          </p>
        </div>
        <ChevronDown size={18} className={cn('shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: easeOut }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 p-3">
              {group.children.map((j) => (
                <PersonNode key={j.id} node={j} expanded={expanded} toggle={toggle} locked={locked} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PersonNode({
  node,
  expanded,
  toggle,
  locked,
}: {
  node: OrgNode
  expanded: Set<string>
  toggle: (id: string) => void
  locked: boolean
}) {
  const hasReports = node.children.length > 0
  const open = expanded.has(node.id)

  return (
    <div>
      <div
        onClick={() => hasReports && !locked && toggle(node.id)}
        className={cn(
          'group flex items-center gap-3 rounded-lg border border-line-soft bg-card px-3 py-2.5 transition-colors',
          hasReports ? 'cursor-pointer hover:border-white/15' : 'border-dashed',
        )}
      >
        <Avatar iniciales={node.iniciales} gradient={node.avatar} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-fg">{node.nombre}</p>
          <p className="truncate text-[11.5px] text-faint">{node.puesto}</p>
        </div>

        {hasReports ? (
          <>
            <Badge variant="accent">
              {node.total} {node.total === 1 ? 'reporte' : 'reportes'}
            </Badge>
            <ChevronDown size={16} className={cn('shrink-0 text-faint transition-transform', open && 'rotate-180')} />
          </>
        ) : (
          <span className="shrink-0 text-[11px] text-faint">{node.departamento}</span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {hasReports && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: easeOut }}
            className="overflow-hidden"
          >
            <div className="relative mt-1.5 ml-5 space-y-1.5 border-l border-line-soft pl-5">
              {node.children.map((child) => (
                <div key={child.id} className="relative">
                  <span className="absolute top-[24px] -left-5 h-px w-5 bg-line-soft" />
                  <PersonNode node={child} expanded={expanded} toggle={toggle} locked={locked} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function filterGroups(groups: CountryGroup[], q: string): { groups: CountryGroup[]; forced: Set<string> } {
  if (!q) return { groups, forced: new Set() }
  const forced = new Set<string>()

  const prune = (node: OrgNode): OrgNode | null => {
    const selfMatch = node.nombre.toLowerCase().includes(q) || node.puesto.toLowerCase().includes(q)
    const kids = node.children.map(prune).filter((n): n is OrgNode => n !== null)
    if (kids.length || selfMatch) {
      if (kids.length) forced.add(node.id)
      return { ...node, children: kids }
    }
    return null
  }

  const filtered = groups
    .map((g) => {
      const kids = g.children.map(prune).filter((n): n is OrgNode => n !== null)
      if (kids.length) forced.add(g.id)
      return { ...g, children: kids }
    })
    .filter((g) => g.children.length > 0)

  return { groups: filtered, forced }
}
