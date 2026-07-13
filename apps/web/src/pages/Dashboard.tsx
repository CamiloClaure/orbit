import { useMemo } from 'react'
import { motion } from 'motion/react'
import { Users, UserPlus, CalendarClock, Smile, Target, Wallet, ShieldCheck, CalendarCheck, Star } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/toast'
import { QuickAccess, type QuickLink } from '@/components/ui/QuickAccess'
import { ExportButton } from '@/components/actions'
import { Avatar } from '@/components/ui/Avatar'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { AreaTrend } from '@/components/charts/AreaTrend'
import { container, fadeUp } from '@/lib/motion'
import { useDashboard } from '@/api/dashboard'
import { useLeaveRequests } from '@/api/leave'
import { useEnpsSnapshots } from '@/api/engagement'
import { useEmployeeDirectory } from '@/api/leave'

const quickLinks: QuickLink[] = [
  { to: '/empleados', label: 'Empleados', icon: Users },
  { to: '/permisos', label: 'Permisos', icon: CalendarCheck },
  { to: '/nomina', label: 'Nómina', icon: Wallet },
  { to: '/okrs', label: 'OKRs', icon: Target },
  { to: '/roles', label: 'Accesos', icon: ShieldCheck },
]

const todayISO = new Date().toISOString().slice(0, 10)

export function Dashboard() {
  const toast = useToast()
  const { data: dash, isPending: dashPending, isError: dashError, refetch } = useDashboard()
  const { data: pendientes } = useLeaveRequests({ estado: 'Pendiente' })
  const { data: aprobados } = useLeaveRequests({ estado: 'Aprobado' })
  const { data: enpsSnapshots } = useEnpsSnapshots()
  const { data: directory } = useEmployeeDirectory()

  const maxDept = Math.max(1, ...(dash?.deptDistribution.map((d) => d.total) ?? [0]))
  const latestEnps = enpsSnapshots?.at(-1)

  // "Ausentes hoy" — approved leave requests whose date range covers today.
  // No dedicated backend endpoint for this; it's a real client-side filter
  // over already-fetched approved requests, same pattern as other
  // small-dataset aggregations in this codebase, not fabricated data.
  const ausentesHoy = useMemo(() => {
    if (!aprobados || !directory) return []
    return aprobados
      .filter((r) => r.desde <= todayISO && todayISO <= r.hasta)
      .map((r) => ({ request: r, employee: directory.get(r.employeeId) }))
      .filter((x): x is { request: (typeof aprobados)[number]; employee: NonNullable<ReturnType<typeof directory.get>> } => !!x.employee)
  }, [aprobados, directory])

  if (dashError) {
    return (
      <Card className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-[13px] text-faint">No se pudo cargar el dashboard.</p>
        <button onClick={() => refetch()} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted hover:text-fg">
          Reintentar
        </button>
      </Card>
    )
  }

  const altasMes = dash?.headcountTrend.at(-1)?.altas ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Panorama general"
        title="Buen día"
        description="Este es el pulso de tu organización en los 5 países hoy."
        action={
          <>
            <QuickAccess links={quickLinks} />
            <ExportButton filename="dashboard_nortania.xlsx" variant="primary" />
          </>
        }
      />

      {/* KPIs */}
      {dashPending ? (
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-[104px] animate-pulse">{null}</Card>
          ))}
        </div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 lg:grid-cols-4"
        >
          <StatCard label="Colaboradores activos" value={dash?.headcount ?? 0} icon={Users} accent />
          <StatCard label="Altas del mes" value={altasMes} icon={UserPlus} />
          <StatCard label="Permisos pendientes" value={pendientes?.length ?? 0} icon={CalendarClock} />
          <StatCard label="Clima (eNPS)" value={latestEnps?.score ?? 0} suffix=" / 100" icon={Smile} />
        </motion.div>
      )}

      {/* Trend + ausentes */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <motion.div variants={fadeUp} className="lg:col-span-2">
          <Card>
            <CardHeader title="Tendencia de la plantilla" subtitle="Headcount neto · altas por mes" />
            <div className="px-2 pt-4 pb-2">
              <AreaTrend data={dash?.headcountTrend ?? []} dataKey="headcount" />
            </div>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card className="h-full">
            <CardHeader title="Ausentes hoy" subtitle={`${ausentesHoy.length} colaboradores`} />
            <div className="mt-2 max-h-[268px] space-y-1 overflow-y-auto px-3 pb-3">
              {ausentesHoy.length === 0 && <p className="px-2 py-6 text-center text-[12.5px] text-faint">Nadie de permiso hoy.</p>}
              {ausentesHoy.map(({ request, employee }) => (
                <div key={request.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]">
                  <Avatar iniciales={employee.iniciales} gradient={employee.avatar} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-fg">{employee.nombre}</p>
                    <p className="font-mono text-[11px] text-faint">{employee.employeeCode}</p>
                  </div>
                  <Badge variant="accent">{request.tipo}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </motion.div>

      {/* Distribución + reconocimientos */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <motion.div variants={fadeUp} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader title="Distribución por área" subtitle="Colaboradores por departamento" />
            <div className="space-y-3.5 p-5 pt-4">
              {(dash?.deptDistribution ?? []).map((d, i) => (
                <div key={d.departamento}>
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span className="text-muted">{d.departamento}</span>
                    <span className="font-mono font-medium text-fg">{d.total}</span>
                  </div>
                  <ProgressBar value={(d.total / maxDept) * 100} delay={i * 0.05} />
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card className="h-full">
            <CardHeader
              title="Reconocimientos destacados"
              action={
                <button
                  onClick={() => toast.info('Voz del colaborador', 'Ver el detalle en Voz del colaborador.')}
                  className="text-[12px] text-accent hover:underline"
                >
                  Ver todo
                </button>
              }
            />
            <div className="space-y-1 p-3">
              {(dash?.topReconocidos.length ?? 0) === 0 && (
                <p className="px-2 py-6 text-center text-[12.5px] text-faint">Todavía no hay reconocimientos.</p>
              )}
              {dash?.topReconocidos.map((r) => (
                <div key={r.employeeId} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/[0.03]">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-warning)' }}>
                    <Star size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg">{r.nombre}</p>
                    <p className="mt-0.5 text-[11px] text-faint">{r.total} reconocimiento{r.total === 1 ? '' : 's'}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}
