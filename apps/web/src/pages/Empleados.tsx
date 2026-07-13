import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Search, Mail, Phone, Building2, MapPin, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/toast'
import { ExportButton, NewEmployeeButton } from '@/components/actions'
import { Avatar } from '@/components/ui/Avatar'
import { Drawer } from '@/components/ui/Drawer'
import { CountryTag } from '@/components/ui/CountryTag'
import { Flag } from '@/components/ui/Flag'
import { DataTable } from '@/components/ui/DataTable'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { fmtDate, fmtMoneyUSD } from '@/lib/format'
import { countryList } from '@/lib/countries'
import { useEmployeeReference, useEmployees } from '@/api/employees'
import { useLeaveBalances } from '@/api/leave'
import { parseListParam, setParam } from '@/lib/searchParams'
import type { Employee } from '@orbit/shared'

const estadoOpciones = ['Activo', 'Inactivo', 'Ausente']
const PAGE_SIZE = 12

/** Server only supports one value per filter dimension — pass it through when exactly one is picked. */
const single = <T,>(arr: T[]): T | undefined => (arr.length === 1 ? arr[0] : undefined)

export function Empleados() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selected, setSelected] = useState<Employee | null>(null)

  const search = searchParams.get('q') ?? ''
  const paises = parseListParam(searchParams.get('pais'))
  const deptos = parseListParam(searchParams.get('depto'))
  const estados = parseListParam(searchParams.get('estado'))
  const pageIndex = Math.max(0, Number(searchParams.get('page') ?? '1') - 1)

  /** Updates one filter param and resets pagination back to page 1 — mirrors
   *  the old `useEffect(() => setPageIndex(0), [search, paises, ...])`. */
  const setFilter = (key: string, value: string | string[]) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        setParam(next, key, value)
        next.delete('page')
        return next
      },
      { replace: true },
    )

  const setPageIndex = (i: number) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        setParam(next, 'page', i > 0 ? String(i + 1) : null)
        return next
      },
      { replace: true },
    )

  const { departamentos } = useEmployeeReference()

  const { data, isPending, isError, refetch } = useEmployees({
    pais: single(paises) as Employee['pais'] | undefined,
    departamento: single(deptos),
    estado: single(estados) as Employee['estado'] | undefined,
    search: search || undefined,
    page: pageIndex + 1,
    pageSize: PAGE_SIZE,
  })

  useEffect(() => {
    if (isError) toast.error('No se pudieron cargar los empleados', 'Verifica tu conexión e inténtalo de nuevo.')
  }, [isError, toast])

  // ponytail: the API only filters by a single pais/departamento/estado value.
  // When 2+ are selected in one dimension, the extra values are applied
  // client-side on top of whatever page came back — the visible rows are
  // correct, but `total`/page count won't be for that edge case. Upgrade
  // path: backend `inArray()` support for these columns.
  const rows = useMemo(() => {
    let rows = data?.data ?? []
    if (paises.length > 1) rows = rows.filter((e) => paises.includes(e.pais))
    if (deptos.length > 1) rows = rows.filter((e) => deptos.includes(e.departamento))
    if (estados.length > 1) rows = rows.filter((e) => estados.includes(e.estado))
    return rows
  }, [data, paises, deptos, estados])

  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1
  const to = Math.min(from + rows.length - 1, total)

  const columns = useMemo<ColumnDef<Employee, any>[]>(
    () => [
      {
        id: 'empleado',
        header: 'Empleado',
        accessorFn: (r) => `${r.nombre} ${r.employeeCode}`,
        cell: ({ row }) => {
          const e = row.original
          return (
            <div className="flex items-center gap-3">
              <Avatar iniciales={e.iniciales} gradient={e.avatar} size={36} />
              <div>
                <p className="font-medium text-fg">{e.nombre}</p>
                <p className="font-mono text-[11px] text-faint">{e.employeeCode}</p>
              </div>
            </div>
          )
        },
      },
      { accessorKey: 'puesto', header: 'Puesto', cell: (c) => <span className="text-muted">{c.getValue()}</span> },
      { accessorKey: 'departamento', header: 'Área', cell: (c) => <span className="text-muted">{c.getValue()}</span> },
      {
        id: 'pais',
        header: 'País / Sede',
        accessorFn: (r) => r.ciudad,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <CountryTag pais={row.original.pais} />
            <span className="text-[13px] text-muted">{row.original.ciudad}</span>
          </div>
        ),
      },
      { accessorKey: 'ingreso', header: 'Ingreso', cell: (c) => <span className="font-mono text-[12.5px] text-muted">{fmtDate(c.getValue())}</span> },
      {
        accessorKey: 'estado',
        header: 'Estado',
        cell: (c) => {
          const v = c.getValue() as string
          return (
            <Badge variant={v === 'Activo' ? 'success' : v === 'Ausente' ? 'warning' : 'neutral'} dot>
              {v}
            </Badge>
          )
        },
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestor de información"
        title="Empleados"
        description={`${total} colaboradores · alta, baja, roles y movimientos en un solo lugar.`}
        action={
          <>
            <ExportButton filename="empleados_nortania.xlsx" />
            <NewEmployeeButton />
          </>
        }
      />

      <Card>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 focus-within:border-white/20">
            <Search size={16} className="text-faint" />
            <input
              value={search}
              onChange={(e) => setFilter('q', e.target.value)}
              placeholder="Buscar por nombre, ID o correo…"
              className="w-full bg-transparent text-[13.5px] text-fg placeholder:text-faint focus:outline-none"
            />
          </div>

          <MultiSelect
            label="País"
            selected={paises}
            onChange={(v) => setFilter('pais', v)}
            options={countryList.map((c) => ({
              value: c.code,
              label: c.nombre,
              icon: <Flag pais={c.code} size={15} />,
            }))}
          />
          <MultiSelect
            label="Área"
            selected={deptos}
            onChange={(v) => setFilter('depto', v)}
            options={departamentos.map((d) => ({ value: d, label: d }))}
          />
          <MultiSelect
            label="Estado"
            selected={estados}
            onChange={(v) => setFilter('estado', v)}
            options={estadoOpciones.map((s) => ({ value: s, label: s }))}
          />
        </div>

        <DataTable columns={columns} data={rows} globalFilter={search} onRowClick={setSelected} minWidth={880} paginated pageSize={12} />
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)}>
        {selected && <EmployeeProfile e={selected} />}
      </Drawer>
    </div>
  )
}

function EmployeeProfile({ e }: { e: Employee }) {
  const toast = useToast()
  const { data: balances } = useLeaveBalances(e.id)
  return (
    <div>
      {/* Header */}
      <div className="relative h-28 bg-gradient-to-br from-accent/20 via-panel to-panel">
        <div className="bg-grid absolute inset-0 opacity-40" />
      </div>
      <div className="px-6 pb-6">
        <div className="-mt-9 flex items-end gap-4">
          <Avatar iniciales={e.iniciales} gradient={e.avatar} size={74} ring />
          <div className="mb-1">
            <Badge variant={e.estado === 'Activo' ? 'success' : e.estado === 'Ausente' ? 'warning' : 'neutral'} dot>
              {e.estado}
            </Badge>
          </div>
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-fg">{e.nombre}</h2>
        <p className="text-sm text-muted">{e.puesto}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-[12px] text-faint">{e.id}</span>
          <CountryTag pais={e.pais} withName />
        </div>

        {/* Empleo */}
        <Section title="Empleo">
          <Row icon={<Building2 size={15} />} label="Departamento" value={e.departamento} />
          <Row icon={<MapPin size={15} />} label="Centro de costo" value={e.centroCosto} mono />
          <Row icon={<MapPin size={15} />} label="Sede" value={e.sede} />
          <Row icon={<CalendarDays size={15} />} label="Fecha de ingreso" value={fmtDate(e.ingreso)} />
        </Section>

        {/* Contacto */}
        <Section title="Contacto">
          <Row icon={<Mail size={15} />} label="Correo" value={e.email} mono />
          <Row icon={<Phone size={15} />} label="Teléfono" value={e.telefono} mono />
        </Section>

        {/* Permisos */}
        <Section title="Disponibilidad de permisos">
          <div className="space-y-3">
            {(balances ?? []).map((b) => (
              <div key={b.tipo}>
                <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                  <span className="text-muted">{b.tipo}</span>
                  <span className="font-mono text-fg">
                    {b.total - b.usado} / {b.total} días
                  </span>
                </div>
                <ProgressBar value={((b.total - b.usado) / b.total) * 100} color={b.color} height={5} />
              </div>
            ))}
          </div>
        </Section>

        {/* Salario */}
        <div className="mt-5 flex items-center justify-between rounded-lg border border-line bg-panel/50 px-4 py-3">
          <span className="text-[12.5px] font-medium text-muted">Salario base · mensual</span>
          <span className="font-mono text-[14px] font-semibold text-fg">{fmtMoneyUSD(e.salario)}</span>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => toast.info('Editar empleado', `Abriendo el formulario de ${e.nombre.split(' ')[0]}…`)}>
            Editar datos
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => toast.success('Movimiento registrado', 'Quedó en la bitácora del empleado.')}>
            Registrar movimiento
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-3 font-mono text-[10.5px] font-medium tracking-[0.16em] text-faint uppercase">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-faint">{icon}</span>
      <span className="w-32 shrink-0 text-[12.5px] text-faint">{label}</span>
      <span className={cn('truncate text-[13px] text-fg', mono && 'font-mono text-[12.5px]')}>{value}</span>
    </div>
  )
}
