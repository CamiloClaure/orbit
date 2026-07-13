import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Check, X, Clock, Search, History, Paperclip, Pencil, Save, ChevronRight, CalendarCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/toast'
import { NewLeaveButton, AssignLeaveButton } from '@/components/actions'
import { Avatar } from '@/components/ui/Avatar'
import { CountryTag } from '@/components/ui/CountryTag'
import { Flag } from '@/components/ui/Flag'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { container, fadeUp, easeOut } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { fmtDate, fmtDateShort } from '@/lib/format'
import { countries, countryList, type Country } from '@/lib/countries'
import { setParam } from '@/lib/searchParams'
import { ApiError } from '@/api/client'
import type { Employee, LeaveRequest, LeaveType } from '@orbit/shared'
import {
  useLeaveTypes,
  useLeaveBalances,
  useLeaveRequests,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  useEmployeeDirectory,
} from '@/api/leave'

const selectCls =
  'w-full rounded-lg border border-line bg-panel px-3 py-2 text-[13px] text-muted transition-colors focus:border-white/20 focus:outline-none'

/** Meses del año — datos de calendario, no vienen del backend. */
const MESES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
]

const FALLBACK_AVATAR = 'linear-gradient(135deg,#6b7280,#4b5563)'

/** Solicitud de permiso enriquecida con los datos del empleado (join client-side
 *  contra el directorio, ya que /leave/requests solo trae employeeId). */
interface RequestRow extends LeaveRequest {
  empleado: string
  iniciales: string
  avatar: string
  departamento: string
  pais: Country
}

function joinEmployee(r: LeaveRequest, directory: Map<string, Employee> | undefined): RequestRow {
  const emp = directory?.get(r.employeeId)
  return {
    ...r,
    empleado: emp?.nombre ?? `Empleado ${r.employeeId.slice(0, 8)}`,
    iniciales: emp?.iniciales ?? '—',
    avatar: emp?.avatar ?? FALLBACK_AVATAR,
    departamento: emp?.departamento ?? '—',
    pais: (emp?.pais as Country | undefined) ?? 'BO',
  }
}

/** "0.5 días" se muestra como "½ día"; el resto, en días enteros. */
function fmtDias(d: number): string {
  if (d === 0.5) return '½ día'
  return `${d % 1 === 0 ? d : d.toFixed(1)} día${d === 1 ? '' : 's'}`
}

/** Toast de error una sola vez por transición a estado de error (no en cada render). */
function useErrorToast(isError: boolean, title: string) {
  const toast = useToast()
  useEffect(() => {
    if (isError) toast.error(title, 'Intenta de nuevo en unos segundos.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError])
}

export function Permisos() {
  const toast = useToast()
  const [rulesCountry, setRulesCountry] = useState<Country>('BO')
  const [detail, setDetail] = useState<RequestRow | null>(null)
  const [confirmReject, setConfirmReject] = useState<RequestRow | null>(null)

  const balancesQuery = useLeaveBalances()
  const requestsQuery = useLeaveRequests()
  const directoryQuery = useEmployeeDirectory()
  const typesQuery = useLeaveTypes(rulesCountry)
  const approveMut = useApproveLeaveRequest()
  const rejectMut = useRejectLeaveRequest()

  useErrorToast(balancesQuery.isError, 'No se pudieron cargar tus saldos')
  useErrorToast(requestsQuery.isError, 'No se pudieron cargar las solicitudes')
  useErrorToast(directoryQuery.isError, 'No se pudo cargar el directorio de empleados')
  useErrorToast(typesQuery.isError, 'No se pudieron cargar las reglas del país')

  const balances = balancesQuery.data ?? []

  const requests = useMemo(
    () => (requestsQuery.data ?? []).map((r) => joinEmployee(r, directoryQuery.data)),
    [requestsQuery.data, directoryQuery.data],
  )
  const pendientes = requests.filter((r) => r.estado === 'Pendiente').length
  const listLoading = requestsQuery.isPending || directoryQuery.isPending

  const resolve = (r: RequestRow, estado: 'Aprobado' | 'Rechazado') => {
    const mut = estado === 'Aprobado' ? approveMut : rejectMut
    mut.mutate(r.id, {
      onSuccess: () => {
        if (estado === 'Aprobado') toast.success('Permiso aprobado', `${r.empleado.split(' ')[0]} · ${r.tipo} (${fmtDias(r.dias)})`)
        else toast.error('Permiso rechazado', `Se notificó a ${r.empleado.split(' ')[0]}.`)
      },
      onError: (err) => {
        toast.error('No se pudo actualizar la solicitud', err instanceof ApiError ? err.message : 'Intenta de nuevo.')
      },
    })
  }

  // Reglas por país (editables — no hay endpoint de escritura para leave_types,
  // así que la edición es solo del lado del cliente, igual que en el mock).
  const [editingRules, setEditingRules] = useState(false)
  const [ruleOverrides, setRuleOverrides] = useState<Partial<Record<Country, LeaveType[]>>>({})
  const currentTypes = ruleOverrides[rulesCountry] ?? typesQuery.data ?? []
  const setDia = (idx: number, val: number) =>
    setRuleOverrides((prev) => ({
      ...prev,
      [rulesCountry]: currentTypes.map((t, i) => (i === idx ? { ...t, dias: val } : t)),
    }))

  // Filtros del historial — persistidos en la URL para que la vista sea recargable/compartible.
  const [searchParams, setSearchParams] = useSearchParams()
  const hQuery = searchParams.get('hq') ?? ''
  const hTipo = searchParams.get('htipo') ?? 'Todos'
  const hPaisParam = searchParams.get('hpais')
  const hPais: 'Todos' | Country = hPaisParam && hPaisParam in countries ? (hPaisParam as Country) : 'Todos'
  const hMes = Number(searchParams.get('hmes') ?? '0') || 0 // 0 = todos los meses
  const hAnio = Number(searchParams.get('hanio') ?? '0') || 0 // 0 = todos los años
  const hArea = searchParams.get('harea') ?? 'Todos'

  const setHistFilter = (key: string, value: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        setParam(next, key, value === 'Todos' || value === '0' ? null : value)
        return next
      },
      { replace: true },
    )
  const setHQuery = (v: string) => setHistFilter('hq', v)
  const setHTipo = (v: string) => setHistFilter('htipo', v)
  const setHPais = (v: 'Todos' | Country) => setHistFilter('hpais', v)
  const setHMes = (v: number) => setHistFilter('hmes', String(v))
  const setHAnio = (v: number) => setHistFilter('hanio', String(v))
  const setHArea = (v: string) => setHistFilter('harea', v)

  const tipoOptions = useMemo(() => Array.from(new Set(requests.map((r) => r.tipo))).sort(), [requests])
  const anioOptions = useMemo(
    () => Array.from(new Set(requests.map((r) => Number(r.desde.slice(0, 4))))).sort((a, b) => b - a),
    [requests],
  )
  const areaOptions = useMemo(
    () => Array.from(new Set(requests.map((r) => r.departamento).filter((d) => d !== '—'))).sort(),
    [requests],
  )

  const historial = useMemo(() => {
    const q = hQuery.trim().toLowerCase()
    return requests.filter((r) => {
      if (q && !r.empleado.toLowerCase().includes(q)) return false
      if (hTipo !== 'Todos' && r.tipo !== hTipo) return false
      if (hPais !== 'Todos' && r.pais !== hPais) return false
      if (hArea !== 'Todos' && r.departamento !== hArea) return false
      if (hAnio !== 0 && Number(r.desde.slice(0, 4)) !== hAnio) return false
      if (hMes !== 0 && Number(r.desde.slice(5, 7)) !== hMes) return false
      return true
    })
  }, [requests, hQuery, hTipo, hPais, hArea, hAnio, hMes])

  const totalDias = historial.reduce((s, r) => s + r.dias, 0)
  const aprobadas = historial.filter((r) => r.estado === 'Aprobado').length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestión de permisos"
        title="Permisos y vacaciones"
        description="Gestiona saldos, solicitudes y reglas de ausencias por país."
        action={
          <>
            <AssignLeaveButton />
            <NewLeaveButton />
          </>
        }
      />

      {/* Mis saldos */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 lg:grid-cols-4">
        {balancesQuery.isPending ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="mt-3 h-8 w-16" />
              <SkeletonBlock className="mt-2 h-3 w-28" />
              <SkeletonBlock className="mt-3 h-[5px] w-full" />
            </Card>
          ))
        ) : balancesQuery.isError ? (
          <div className="min-[380px]:col-span-2 lg:col-span-4">
            <Card className="p-8">
              <SectionError message="No se pudieron cargar tus saldos." onRetry={() => balancesQuery.refetch()} />
            </Card>
          </div>
        ) : balances.length === 0 ? (
          <div className="min-[380px]:col-span-2 lg:col-span-4">
            <Card className="p-8">
              <p className="text-center text-[13px] text-faint">Aún no tienes saldos de permiso configurados.</p>
            </Card>
          </div>
        ) : (
          balances.map((b) => {
            const disp = b.total - b.usado
            return (
              <motion.div key={b.tipo} variants={fadeUp}>
                <Card className="p-5">
                  <p className="text-[13px] font-medium text-muted">{b.tipo}</p>
                  <p className="mt-2 font-display text-[30px] leading-none font-semibold tabular text-fg">
                    {disp.toFixed(2)}
                  </p>
                  <p className="mt-1 text-[11px] text-faint">de {b.total} días disponibles</p>
                  <div className="mt-3">
                    <ProgressBar value={b.total ? (disp / b.total) * 100 : 0} color={b.color} height={5} />
                  </div>
                </Card>
              </motion.div>
            )
          })
        )}
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Aprobaciones */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Solicitudes por aprobar"
              subtitle={`${pendientes} pendientes de tu aprobación`}
              action={
                <Badge variant="warning" dot>
                  {pendientes} pendientes
                </Badge>
              }
            />
            <div className="mt-2">
              {listLoading ? (
                <SkeletonRows count={5} />
              ) : requestsQuery.isError ? (
                <SectionError message="No se pudieron cargar las solicitudes." onRetry={() => requestsQuery.refetch()} />
              ) : requests.length === 0 ? (
                <p className="px-4 py-12 text-center text-[13px] text-faint">No hay solicitudes de permiso.</p>
              ) : (
                requests.slice(0, 11).map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setDetail(r)}
                    className="flex cursor-pointer items-center gap-3 border-t border-line-soft px-4 py-3 transition-colors hover:bg-white/[0.02] sm:gap-3.5 sm:px-5"
                  >
                    <Avatar iniciales={r.iniciales} gradient={r.avatar} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-fg">{r.empleado}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="truncate text-[12px] text-faint">{r.tipo}</span>
                        {r.adjunto && <Paperclip size={11} className="shrink-0 text-accent" />}
                        <span className="hidden shrink-0 sm:inline-flex">
                          <CountryTag pais={r.pais} />
                        </span>
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="font-mono text-[12px] text-muted">
                        {fmtDateShort(r.desde)} → {fmtDateShort(r.hasta)}
                      </p>
                      <p className="text-[11px] text-faint">{fmtDias(r.dias)}</p>
                    </div>

                    <div className="flex w-auto shrink-0 items-center justify-end gap-1.5 text-right sm:w-[140px]">
                      <AnimatePresence mode="wait" initial={false}>
                        {r.estado === 'Pendiente' ? (
                          <motion.div
                            key="actions"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex items-center justify-end gap-1.5"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                resolve(r, 'Aprobado')
                              }}
                              className="flex size-8 items-center justify-center rounded-lg bg-success-soft text-success transition-transform hover:scale-105"
                              aria-label="Aprobar"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setConfirmReject(r)
                              }}
                              className="flex size-8 items-center justify-center rounded-lg bg-danger-soft text-danger transition-transform hover:scale-105"
                              aria-label="Rechazar"
                            >
                              <X size={16} />
                            </button>
                          </motion.div>
                        ) : (
                          <motion.div key="status" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ease: easeOut }}>
                            <Badge variant={r.estado === 'Aprobado' ? 'success' : 'danger'} dot>
                              {r.estado}
                            </Badge>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <ChevronRight size={15} className="hidden text-faint sm:block" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Reglas por país */}
        <div>
          <Card className="h-full">
            <CardHeader
              title="Reglas por país"
              subtitle="Días por tipo de permiso"
              action={
                <button
                  onClick={() => {
                    if (editingRules) toast.success('Reglas guardadas', `Se actualizaron las reglas de ${countryList.find((c) => c.code === rulesCountry)?.nombre}.`)
                    setEditingRules((v) => !v)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:border-white/20 hover:text-fg"
                >
                  {editingRules ? <Save size={14} className="text-accent" /> : <Pencil size={13} />}
                  {editingRules ? 'Guardar' : 'Editar'}
                </button>
              }
            />
            <div className="p-5 pt-4">
              <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
                {countryList.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setRulesCountry(c.code)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors',
                      rulesCountry === c.code ? 'bg-white/[0.1] text-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    <Flag pais={c.code} size={16} /> {c.code}
                  </button>
                ))}
              </div>

              <motion.div
                key={rulesCountry}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="mt-4 space-y-2"
              >
                {typesQuery.isPending ? (
                  <SkeletonRows count={4} height={42} />
                ) : typesQuery.isError ? (
                  <SectionError message="No se pudieron cargar las reglas." onRetry={() => typesQuery.refetch()} />
                ) : currentTypes.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-faint">Sin reglas configuradas para este país.</p>
                ) : (
                  currentTypes.map((t, i) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-line-soft px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5 text-[13px] text-muted">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
                        <span className="truncate">{t.nombre}</span>
                      </span>
                      {editingRules ? (
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          value={t.dias}
                          onChange={(e) => setDia(i, Number(e.target.value))}
                          className="w-20 shrink-0 rounded-md border border-accent/40 bg-card px-2 py-1 text-right font-mono text-[13px] text-fg focus:outline-none"
                        />
                      ) : (
                        <span className="shrink-0 font-mono text-[13px] font-medium text-fg">{fmtDias(t.dias)}</span>
                      )}
                    </div>
                  ))
                )}
              </motion.div>

              <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-accent-soft/50 px-3.5 py-3">
                <Clock size={15} className="mt-0.5 shrink-0 text-accent" />
                <p className="text-[12px] leading-relaxed text-muted">
                  Cada regla es configurable por país y se aplica automáticamente al calcular saldos.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Historial de permisos */}
      <Card>
        <CardHeader
          title="Historial de permisos"
          subtitle="Consulta por empleado, tipo, país o mes — sin descargar nada"
          action={<History size={16} className="text-faint" />}
        />
        <div className="space-y-4 p-5 pt-4">
          {/* Filtros */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <div className="col-span-2 flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 transition-colors focus-within:border-white/20">
              <Search size={15} className="shrink-0 text-faint" />
              <input
                value={hQuery}
                onChange={(e) => setHQuery(e.target.value)}
                placeholder="Buscar empleado…"
                className="w-full bg-transparent text-[13.5px] text-fg placeholder:text-faint focus:outline-none"
              />
            </div>
            <select value={hAnio} onChange={(e) => setHAnio(Number(e.target.value))} className={selectCls}>
              <option value={0}>Todos los años</option>
              {anioOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select value={hMes} onChange={(e) => setHMes(Number(e.target.value))} className={selectCls}>
              <option value={0}>Todos los meses</option>
              {MESES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select value={hTipo} onChange={(e) => setHTipo(e.target.value)} className={selectCls}>
              <option value="Todos">Todos los tipos</option>
              {tipoOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={hArea} onChange={(e) => setHArea(e.target.value)} className={selectCls}>
              <option value="Todos">Todas las áreas</option>
              {areaOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por país */}
          <div className="flex flex-wrap gap-1.5">
            <FilterChip activo={hPais === 'Todos'} onClick={() => setHPais('Todos')}>
              Todos los países
            </FilterChip>
            {countryList.map((c) => (
              <FilterChip key={c.code} activo={hPais === c.code} onClick={() => setHPais(c.code)}>
                <Flag pais={c.code} size={14} /> {c.code}
              </FilterChip>
            ))}
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Solicitudes" value={historial.length} />
            <MiniStat label="Días totales" value={totalDias} />
            <MiniStat label="Aprobadas" value={aprobadas} />
          </div>

          {/* Resultados */}
          <div className="overflow-hidden rounded-lg border border-line-soft">
            {listLoading ? (
              <SkeletonRows count={6} height={48} />
            ) : requestsQuery.isError ? (
              <SectionError message="No se pudo cargar el historial." onRetry={() => requestsQuery.refetch()} />
            ) : historial.length === 0 ? (
              <p className="px-4 py-12 text-center text-[13px] text-faint">Sin permisos para estos filtros.</p>
            ) : (
              <div className="max-h-[420px] divide-y divide-line-soft overflow-y-auto overscroll-contain">
                {historial.slice(0, 50).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar iniciales={r.iniciales} gradient={r.avatar} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-fg">{r.empleado}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="truncate text-[11.5px] text-faint">{r.tipo}</span>
                        <span className="hidden shrink-0 sm:inline-flex">
                          <CountryTag pais={r.pais} />
                        </span>
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="font-mono text-[11.5px] text-muted">
                        {fmtDateShort(r.desde)} → {fmtDateShort(r.hasta)}
                      </p>
                      <p className="text-[11px] text-faint">{fmtDias(r.dias)}</p>
                    </div>
                    <Badge variant={r.estado === 'Aprobado' ? 'success' : r.estado === 'Rechazado' ? 'danger' : 'warning'} dot className="shrink-0">
                      {r.estado}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
          {historial.length > 50 && (
            <p className="text-center text-[11.5px] text-faint">Mostrando 50 de {historial.length} resultados.</p>
          )}
        </div>
      </Card>

      {/* Detalle de la solicitud (read-only) */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detalle de la solicitud"
        description={detail ? `${detail.tipo}` : undefined}
        icon={<CalendarCheckIcon />}
        width={520}
      >
        {detail && (
          <div className="px-6 py-5">
            <div className="flex items-center gap-3">
              <Avatar iniciales={detail.iniciales} gradient={detail.avatar} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-fg">{detail.empleado}</p>
                <p className="text-[12px] text-faint">{detail.departamento}</p>
              </div>
              <Badge
                variant={detail.estado === 'Aprobado' ? 'success' : detail.estado === 'Rechazado' ? 'danger' : 'warning'}
                dot
              >
                {detail.estado}
              </Badge>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <DetailField label="Tipo" value={detail.tipo} />
              <DetailField label="País" value={<CountryTag pais={detail.pais} withName />} />
              <DetailField label="Período" value={`${fmtDate(detail.desde)} → ${fmtDate(detail.hasta)}`} />
              <DetailField label="Duración" value={fmtDias(detail.dias)} />
            </div>

            <div className="mt-4">
              <p className="mb-1.5 font-mono text-[10.5px] font-medium tracking-[0.16em] text-faint uppercase">Comentario</p>
              <p className="rounded-lg border border-line-soft bg-panel/40 px-3.5 py-3 text-[13px] leading-relaxed text-muted">
                {detail.comentario ?? 'Sin comentario.'}
              </p>
            </div>

            {detail.adjunto && (
              <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-line bg-panel/60 px-3.5 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Paperclip size={15} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{detail.adjunto}</span>
                <button
                  onClick={() => toast.info('Documento de respaldo', `Abriendo ${detail.adjunto}…`)}
                  className="shrink-0 text-[12px] font-medium text-accent hover:underline"
                >
                  Ver
                </button>
              </div>
            )}

            {detail.estado === 'Pendiente' && (
              <div className="mt-5 flex gap-2">
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    resolve(detail, 'Aprobado')
                    setDetail(null)
                  }}
                >
                  <Check size={16} /> Aprobar
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setConfirmReject(detail)}>
                  <X size={16} /> Rechazar
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmReject}
        onClose={() => setConfirmReject(null)}
        onConfirm={() => {
          if (confirmReject) resolve(confirmReject, 'Rechazado')
          setDetail(null)
        }}
        title="¿Rechazar esta solicitud?"
        description={
          confirmReject
            ? `Se notificará a ${confirmReject.empleado.split(' ')[0]} que su solicitud de ${confirmReject.tipo} (${fmtDias(confirmReject.dias)}) fue rechazada. Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Rechazar"
      />
    </div>
  )
}

function CalendarCheckIcon() {
  return <CalendarCheck size={18} />
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line-soft bg-panel/40 px-3.5 py-2.5">
      <p className="mb-1 font-mono text-[10.5px] font-medium tracking-[0.16em] text-faint uppercase">{label}</p>
      <div className="text-[13px] font-medium text-fg">{value}</div>
    </div>
  )
}

function FilterChip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line-soft bg-panel/40 px-3 py-2.5">
      <p className="font-display text-[22px] leading-none font-semibold tabular text-fg">{value}</p>
      <p className="mt-1 text-[11px] text-faint">{label}</p>
    </div>
  )
}

function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('animate-pulse rounded-md bg-white/[0.06]', className)} style={style} />
}

function SkeletonRows({ count, height = 56 }: { count: number; height?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="w-full" style={{ height }} />
      ))}
    </div>
  )
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-[13px] text-faint">{message}</p>
      <button onClick={onRetry} className="text-[12.5px] font-medium text-accent hover:underline">
        Reintentar
      </button>
    </div>
  )
}
