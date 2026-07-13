import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { motion } from 'motion/react'
import { Search, Wallet, TrendingUp, Users, ChevronLeft, ChevronRight, Building2, Landmark } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/toast'
import { ExportButton } from '@/components/actions'
import { CountryTag } from '@/components/ui/CountryTag'
import { Flag } from '@/components/ui/Flag'
import { DataTable } from '@/components/ui/DataTable'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { CostDonut, COST_COLORS } from '@/components/charts/CostDonut'
import { container, fadeUp } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { fmtMoneyUSD } from '@/lib/format'
import { countries, type Country } from '@/lib/countries'
import { parseListParam, setParam } from '@/lib/searchParams'
import { usePayroll } from '@/api/payroll'
import { useEmployeeDirectory } from '@/api/leave'
import { useEmployeeReference } from '@/api/employees'
import type { PayrollRow as ApiPayrollRow } from '@orbit/shared'

// Payroll rows only carry a raw employeeId — joined with the employee
// directory (one GET /employees call, shared with the leave page) for
// display fields the table/charts need.
interface Row extends ApiPayrollRow {
  nombre: string
  iniciales: string
  avatar: string
  puesto: string
  pais: Country
  departamento: string
  centroCosto: string
}

// The seed's current payroll snapshot (apps/api/src/db/seed.ts's PERIODO) — no
// "list periods" endpoint exists yet, so this is the one period the UI shows.
const PERIODO = '2026-06'

/** Código de centro de costo → departamento, para etiquetar la vista consolidada. */
const ccDepto: Record<string, string> = {
  'BO-DSP': 'Comercial',
  'OPS-CTR': 'Operaciones',
  'ADM-FIN': 'Administración & Finanzas',
  'TI-DEV': 'Tecnología',
  'RH-GEN': 'Recursos Humanos',
  'MKT-BR': 'Marketing',
  'CX-CALL': 'Atención al Cliente',
}

export function Nomina() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('q') ?? ''
  const ccParam = searchParams.get('cc_pais')
  const ccCountry: 'Todos' | Country = ccParam && ccParam in countries ? (ccParam as Country) : 'Todos'
  const areas = parseListParam(searchParams.get('area'))

  const setFilter = (key: string, value: string | string[]) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        setParam(next, key, value)
        return next
      },
      { replace: true },
    )
  const setSearch = (v: string) => setFilter('q', v)
  const setCcCountry = (c: 'Todos' | Country) => setFilter('cc_pais', c === 'Todos' ? '' : c)
  const setAreas = (v: string[]) => setFilter('area', v)

  const { data: rawRows, isPending: rowsPending, isError: rowsError, refetch } = usePayroll(PERIODO)
  const { data: directory, isPending: dirPending } = useEmployeeDirectory()
  const { departamentos } = useEmployeeReference()

  const isPending = rowsPending || dirPending
  const isError = rowsError

  const payroll = useMemo<Row[]>(() => {
    if (!rawRows || !directory) return []
    const rows: Row[] = []
    for (const r of rawRows) {
      const e = directory.get(r.employeeId)
      if (!e) continue
      rows.push({ ...r, nombre: e.nombre, iniciales: e.iniciales, avatar: e.avatar, puesto: e.puesto, pais: e.pais, departamento: e.departamento, centroCosto: e.centroCosto })
    }
    return rows
  }, [rawRows, directory])

  const payrollTotal = payroll.reduce((s, r) => s + r.neto, 0)
  const payrollBrutoTotal = payroll.reduce((s, r) => s + r.bruto, 0)
  const payrollCostoCompaniaTotal = payroll.reduce((s, r) => s + r.costoCompania, 0)

  const payrollByCountry = useMemo(() => {
    const order: Country[] = ['BO', 'CL', 'EC', 'AR', 'PY']
    const map = new Map<Country, { pais: Country; nombre: string; total: number; headcount: number }>()
    for (const r of payroll) {
      const cur = map.get(r.pais) ?? { pais: r.pais, nombre: countries[r.pais].nombre, total: 0, headcount: 0 }
      cur.total += r.neto
      cur.headcount += 1
      map.set(r.pais, cur)
    }
    return order.filter((c) => map.has(c)).map((c) => map.get(c)!)
  }, [payroll])

  const tableData = useMemo(
    () => (areas.length === 0 ? payroll : payroll.filter((r) => areas.includes(r.departamento))),
    [areas, payroll],
  )

  const maxCountry = Math.max(1, ...payrollByCountry.map((c) => c.total))

  // Agregado por centro de costo (consolidando el prefijo de país), filtrable por país.
  const costByCenter = useMemo(() => {
    const rows = ccCountry === 'Todos' ? payroll : payroll.filter((r) => r.pais === ccCountry)
    const map = new Map<string, { cc: string; total: number; headcount: number; depto: string }>()
    for (const r of rows) {
      const cc = r.centroCosto.replace(/^(BO|CL|EC|AR|PY)-/, '')
      const cur = map.get(cc) ?? { cc, total: 0, headcount: 0, depto: ccDepto[cc] ?? cc }
      cur.total += r.neto
      cur.headcount += 1
      map.set(cc, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [ccCountry, payroll])
  const grandCC = costByCenter.reduce((s, c) => s + c.total, 0) || 1

  const columns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        id: 'empleado',
        header: 'Empleado',
        accessorFn: (r) => `${r.nombre} ${r.employeeId}`,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar iniciales={row.original.iniciales} gradient={row.original.avatar} size={34} />
            <div>
              <p className="font-medium text-fg">{row.original.nombre}</p>
              <p className="text-[11.5px] text-faint">{row.original.puesto}</p>
            </div>
          </div>
        ),
      },
      { id: 'pais', header: 'País', accessorFn: (r) => r.pais, cell: ({ row }) => <CountryTag pais={row.original.pais} /> },
      { accessorKey: 'bruto', header: 'Bruto', cell: (c) => <Money amount={c.getValue()} /> },
      { accessorKey: 'bonos', header: 'Bonos', cell: (c) => <Money amount={c.getValue()} muted /> },
      { accessorKey: 'descuentos', header: 'Descuentos', cell: (c) => <Money amount={-c.getValue()} muted /> },
      {
        accessorKey: 'neto',
        header: 'Neto',
        cell: (c) => (
          <span className="font-mono text-[13px] font-semibold text-fg">
            <Money amount={c.getValue()} strong />
          </span>
        ),
      },
      {
        accessorKey: 'costoCompania',
        header: 'Costo cía.',
        cell: (c) => (
          <span className="font-mono text-[13px] font-semibold text-accent">{fmtMoneyUSD(c.getValue())}</span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Nómina · Período ${PERIODO}`}
        title="Nómina"
        description="Planilla consolidada de los 5 países, en USD para comparar."
        action={<ExportButton label="Exportar planilla" filename="planilla.xlsx" variant="primary" />}
      />

      {isError ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-[13px] text-faint">No se pudo cargar la nómina.</p>
          <button onClick={() => refetch()} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted hover:text-fg">
            Reintentar
          </button>
        </Card>
      ) : isPending ? (
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-[104px] animate-pulse">{null}</Card>
          ))}
        </div>
      ) : (
        <>
          {/* Summary */}
          <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard
              label="Costo compañía"
              amount={payrollCostoCompaniaTotal}
              icon={Landmark}
              accent
              footer="incl. aportes patronales"
            />
            <SummaryCard label="Nómina neta total" amount={payrollTotal} icon={Wallet} accent />
            <SummaryCard label="Masa salarial bruta" amount={payrollBrutoTotal} icon={TrendingUp} accent />
            <motion.div variants={fadeUp}>
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-muted">Colaboradores en planilla</span>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Users size={16} />
                  </span>
                </div>
                <p className="mt-3 font-display text-[22px] leading-none font-semibold tabular text-fg sm:text-[26px]">{payroll.length}</p>
                <p className="mt-1 text-[11px] text-faint">activos · 5 países</p>
              </Card>
            </motion.div>
          </motion.div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* By country */}
            <div>
              <Card className="h-full">
                <CardHeader title="Nómina por país" subtitle="Neto del período (USD)" />
                <div className="space-y-4 p-5 pt-4">
                  {payrollByCountry.map((c, i) => (
                    <div key={c.pais}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[13px] text-muted">
                          <Flag pais={c.pais} size={16} /> {c.nombre} <span className="text-faint">· {c.headcount}</span>
                        </span>
                        <span className="font-mono text-[12.5px] font-medium text-fg">
                          {fmtMoneyUSD(c.total)}
                        </span>
                      </div>
                      <ProgressBar value={(c.total / maxCountry) * 100} delay={i * 0.06} />
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Por centro de costo */}
            <div className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader
                  title="Costo por centro de costo"
                  subtitle="Participación de cada centro de costo en la nómina (neto · USD)"
                  action={
                    <span className="hidden items-center gap-1.5 text-[11px] text-faint sm:flex">
                      <Building2 size={14} /> {ccCountry === 'Todos' ? '5 países' : ccCountry}
                    </span>
                  }
                />
                <div className="space-y-5 p-5 pt-4">
                  {/* Filtro por país */}
                  <div className="flex flex-wrap gap-1.5">
                    <CcChip activo={ccCountry === 'Todos'} onClick={() => setCcCountry('Todos')}>
                      Todos los países
                    </CcChip>
                    {payrollByCountry.map((c) => (
                      <CcChip key={c.pais} activo={ccCountry === c.pais} onClick={() => setCcCountry(c.pais)}>
                        <Flag pais={c.pais} size={14} /> {c.pais}
                      </CcChip>
                    ))}
                  </div>

                  {/* Donut + leyenda */}
                  <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[244px_1fr]">
                    <CostDonut data={costByCenter} height={236} />

                    <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
                      {costByCenter.map((c, i) => (
                        <div key={c.cc} className="flex items-center gap-2.5">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: COST_COLORS[i % COST_COLORS.length] }} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-medium text-fg">{c.depto}</p>
                            <p className="font-mono text-[10px] text-faint">
                              {c.cc} · {c.headcount} pers.
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono text-[12.5px] font-medium text-fg">{fmtMoneyUSD(c.total)}</p>
                            <p className="font-mono text-[10px] text-faint">{Math.round((c.total / grandCC) * 100)}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Planilla detallada */}
          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
              <div className="flex min-w-[200px] flex-1 items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 focus-within:border-white/20">
                <Search size={16} className="text-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar en la planilla…"
                  className="w-full bg-transparent text-[13.5px] text-fg placeholder:text-faint focus:outline-none"
                />
              </div>
              <MultiSelect
                label="Área"
                selected={areas}
                onChange={setAreas}
                options={departamentos.map((d) => ({ value: d, label: d }))}
              />
              <div className="flex items-center gap-1 text-[13px] text-muted">
                <button
                  onClick={() => toast.info('Período anterior', 'Cargando planilla del período anterior…')}
                  className="flex size-8 items-center justify-center rounded-lg border border-line hover:bg-white/[0.04]"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="px-1 font-mono">{PERIODO}</span>
                <button
                  onClick={() => toast.warning('Período no disponible', 'El siguiente período aún no está cerrado.')}
                  className="flex size-8 items-center justify-center rounded-lg border border-line hover:bg-white/[0.04]"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              <DataTable columns={columns} data={tableData} globalFilter={search} minWidth={860} />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function CcChip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
        activo ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line text-muted hover:border-white/20 hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function SummaryCard({
  label,
  amount,
  icon: Icon,
  accent,
  footer = 'mensual · USD',
}: {
  label: string
  amount: number
  icon: React.ComponentType<{ size?: number }>
  accent?: boolean
  footer?: string
}) {
  return (
    <motion.div variants={fadeUp}>
      <Card className="group relative overflow-hidden p-5">
        {accent && <div className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-accent/15 blur-3xl" />}
        <div className="relative flex items-center justify-between">
          <span className="text-[13px] font-medium text-muted">{label}</span>
          <span className={cn('flex size-8 items-center justify-center rounded-lg', accent ? 'bg-accent-soft text-accent' : 'bg-white/[0.06] text-muted')}>
            <Icon size={16} />
          </span>
        </div>
        <div className="relative mt-3 font-display text-[22px] leading-none font-semibold tabular text-fg sm:text-[26px]">
          <Money amount={amount} strong big />
        </div>
        <p className="relative mt-1.5 text-[11px] text-faint">{footer}</p>
      </Card>
    </motion.div>
  )
}

function Money({
  amount,
  muted,
  strong,
  big,
}: {
  amount: number
  muted?: boolean
  strong?: boolean
  big?: boolean
}) {
  return (
    <span className={cn(big ? '' : 'font-mono text-[13px]', strong ? 'text-fg' : muted ? 'text-faint' : 'text-muted')}>
      {amount < 0 ? '−' : ''}
      {fmtMoneyUSD(Math.abs(amount))}
    </span>
  )
}
