import { useState, type ReactNode } from 'react'
import {
  Download,
  UserPlus,
  CalendarPlus,
  CalendarCog,
  Target,
  ClipboardList,
  ShieldCheck,
  Heart,
  ShieldQuestion,
} from 'lucide-react'
import { employeeInputSchema, leaveRequestInputSchema, objectiveSchema, recognitionInputSchema, denunciaInputSchema } from '@orbit/shared'
import { Button } from './ui/Button'
import { FormDialog, type FormField } from './ui/FormDialog'
import { useToast } from './ui/toast'
import { useEmployeeReference, useCreateEmployee } from '@/api/employees'
import { useCreateLeaveRequest } from '@/api/leave'
import { useCreateObjective } from '@/api/okrs'
import { useCreateRecognition, useCreateDenuncia, useEmployeesLookup } from '@/api/voz'
import { useMe } from '@/api/auth'
import { useRoles } from '@/api/roles'
import { countryList, type Country } from '@/lib/countries'
import { initials } from '@/lib/format'

/** Shape of a form's validate prop, matching FormDialog's `validate?`. */
type ValidateResult = { success: true } | { success: false; fieldErrors: Record<string, string> }

/** First error message per top-level field, from a failed schema.safeParse(). */
function fieldErrorsFromIssues(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/** leaveRequestInputSchema minus employeeId/dias/adjunto — those aren't form
 *  fields (employeeId comes from context/lookup, dias/adjunto are server- or
 *  not user-entered here). Shared by NewLeaveButton and AssignLeaveButton. */
const leaveFormSchema = leaveRequestInputSchema.pick({ tipo: true, desde: true, hasta: true, comentario: true })
function buildLeavePayload(v: Record<string, string>) {
  return { tipo: v.tipo, desde: v.desde, hasta: v.hasta, comentario: v.comentario || null }
}
function validateLeave(v: Record<string, string>): ValidateResult {
  const r = leaveFormSchema.safeParse(buildLeavePayload(v))
  return r.success ? { success: true } : { success: false, fieldErrors: fieldErrorsFromIssues(r.error.issues) }
}

/** objectiveSchema has no dedicated "input" variant (server assigns id/tenantId/krs) —
 *  pick() the fields this form actually collects, same idea as leaveFormSchema above. */
const objectiveFormSchema = objectiveSchema.pick({ nombre: true, owner: true, nivel: true, prioridad: true, vencimiento: true })

const recognitionFormSchema = recognitionInputSchema.pick({ mensaje: true, estrellas: true })
const denunciaFormSchema = denunciaInputSchema.pick({ tipo: true, titulo: true, pais: true })

type Variant = 'primary' | 'outline' | 'subtle' | 'ghost'

const opt = (v: string) => ({ value: v, label: v })
const countryOptions = countryList.map((c) => ({ value: c.code, label: c.nombre }))
const avatarGradients = [
  'linear-gradient(135deg,#ffb224,#f97316)',
  'linear-gradient(135deg,#74a8ff,#5b6cff)',
  'linear-gradient(135deg,#46d88f,#10b981)',
  'linear-gradient(135deg,#f472b6,#db2777)',
  'linear-gradient(135deg,#a78bfa,#7c3aed)',
]

/* ── Exportar (descarga real: hoy solo existe el CSV de empleados) ── */
export function ExportButton({
  label = 'Exportar',
  filename = 'empleados.csv',
  variant = 'outline',
}: {
  label?: string
  filename?: string
  variant?: Variant
}) {
  const toast = useToast()
  const run = () => {
    toast.info('Descargando…', filename)
    const a = document.createElement('a')
    a.href = '/api/reports/employees.csv'
    a.click()
  }
  return (
    <Button variant={variant} onClick={run}>
      <Download size={16} /> {label}
    </Button>
  )
}

/* ── Wrapper genérico: botón + FormDialog ── */
function FormAction({
  trigger,
  ...dialog
}: {
  trigger: (open: () => void) => ReactNode
} & Omit<Parameters<typeof FormDialog>[0], 'open' | 'onClose'>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {trigger(() => setOpen(true))}
      <FormDialog open={open} onClose={() => setOpen(false)} {...dialog} />
    </>
  )
}

const PrimaryTrigger = (label: string, icon: ReactNode, variant: Variant = 'primary') =>
  (open: () => void) =>
    (
      <Button variant={variant} onClick={open}>
        {icon}
        {label}
      </Button>
    )

/* ── Nuevo empleado ── */
export function NewEmployeeButton({ variant = 'primary', label = 'Nuevo empleado' }: { variant?: Variant; label?: string }) {
  const toast = useToast()
  const { departamentos } = useEmployeeReference()
  const createEmployee = useCreateEmployee()
  const deptOptions = departamentos.map(opt)

  return (
    <FormAction
      trigger={PrimaryTrigger(label, <UserPlus size={16} />, variant)}
      title="Dar de alta un empleado"
      description="Registra un nuevo colaborador en el sistema."
      icon={<UserPlus size={18} />}
      fields={[
        { name: 'nombre', label: 'Nombre completo', placeholder: 'Ej. Emily Smith', full: true },
        { name: 'email', label: 'Correo corporativo', type: 'email', placeholder: 'nombre.apellido@nortania.com' },
        { name: 'telefono', label: 'Teléfono', placeholder: '+591 70000000' },
        { name: 'puesto', label: 'Puesto', placeholder: 'Ej. Asesor Comercial' },
        { name: 'departamento', label: 'Departamento', type: 'select', options: deptOptions },
        { name: 'pais', label: 'País', type: 'select', options: countryOptions },
        { name: 'centroCosto', label: 'Centro de costo', placeholder: 'BO-DSP' },
        { name: 'salario', label: 'Salario base (mensual, USD)', type: 'number', placeholder: '2500' },
        { name: 'ingreso', label: 'Fecha de ingreso', type: 'date' },
      ]}
      submitLabel="Crear empleado"
      successTitle="Empleado creado"
      successDescription="El alta quedó registrada."
      width={620}
      validate={(v) => {
        const r = employeeInputSchema.safeParse(buildEmployeePayload(v))
        return r.success ? { success: true } : { success: false, fieldErrors: fieldErrorsFromIssues(r.error.issues) }
      }}
      onSubmit={async (v) => {
        await createEmployee.mutateAsync(buildEmployeePayload(v))
        toast.success('Empleado creado', `${v.nombre} fue registrado.`)
      }}
    />
  )
}

// ponytail: no employeeCode/cumple/estado/ciudad/sede fields in the form —
// derived here with sensible defaults instead of adding 5 more inputs. Add
// real fields if this becomes more than a demo flow. Shared by onSubmit and
// validate so both see the exact payload that would hit the network.
function buildEmployeePayload(v: Record<string, string>) {
  const pais = (v.pais || 'BO') as Country
  const cityMeta = countryList.find((c) => c.code === pais)
  const ciudad = cityMeta?.ciudades[0] ?? cityMeta?.nombre ?? ''
  return {
    employeeCode: `${pais}${Date.now().toString().slice(-6)}`,
    nombre: v.nombre,
    email: v.email,
    telefono: v.telefono,
    puesto: v.puesto,
    departamento: v.departamento,
    pais,
    ciudad,
    sede: `${cityMeta?.nombre ?? pais} · ${ciudad}`,
    centroCosto: v.centroCosto,
    estado: 'Activo' as const,
    ingreso: v.ingreso,
    cumple: '01-01',
    salario: Number(v.salario) || 0,
    iniciales: initials(v.nombre),
    avatar: avatarGradients[Math.floor(Math.random() * avatarGradients.length)],
    supervisorId: null,
    userId: null,
  }
}

/* ── Solicitar permiso (propio) ── */
export function NewLeaveButton({ label = 'Solicitar permiso' }: { label?: string }) {
  const { data: me } = useMe()
  const createLeave = useCreateLeaveRequest()

  return (
    <FormAction
      trigger={PrimaryTrigger(label, <CalendarPlus size={16} />)}
      title="Solicitar permiso"
      description="Tu saldo se calcula automáticamente según el país."
      icon={<CalendarPlus size={18} />}
      fields={[
        {
          name: 'tipo',
          label: 'Tipo de permiso',
          type: 'select',
          full: true,
          options: ['Vacaciones', 'Enfermedad', 'Permiso personal', 'Matrimonio', 'Cumpleaños', 'Home Office'].map(opt),
        },
        { name: 'desde', label: 'Desde', type: 'date' },
        { name: 'hasta', label: 'Hasta', type: 'date' },
        { name: 'comentario', label: 'Comentario', type: 'textarea', full: true, placeholder: 'Escribe un comentario opcional…' },
      ]}
      submitLabel="Enviar solicitud"
      successTitle="Solicitud enviada"
      successDescription="Tu permiso quedó pendiente de aprobación."
      validate={validateLeave}
      onSubmit={async (v) => {
        if (!me?.user.employeeId) throw new Error('Tu usuario no está vinculado a un registro de empleado.')
        await createLeave.mutateAsync({ employeeId: me.user.employeeId, ...buildLeavePayload(v) })
      }}
    />
  )
}

/* ── Asignar permiso (a nombre de otro colaborador) ── */
export function AssignLeaveButton({ label = 'Asignar permiso', variant = 'outline' }: { label?: string; variant?: Variant }) {
  const { data: directory } = useEmployeesLookup()
  const createLeave = useCreateLeaveRequest()

  return (
    <FormAction
      trigger={PrimaryTrigger(label, <CalendarCog size={16} />, variant)}
      title="Asignar permiso"
      description="Como administrador, registra un permiso a nombre de un colaborador."
      icon={<CalendarCog size={18} />}
      fields={[
        { name: 'employeeCode', label: 'Código de empleado', full: true, placeholder: 'Ej. BO1001' },
        {
          name: 'tipo',
          label: 'Tipo de permiso',
          type: 'select',
          full: true,
          options: ['Vacaciones', 'Enfermedad', 'Permiso personal', 'Matrimonio', 'Cumpleaños', 'Home Office'].map(opt),
        },
        { name: 'desde', label: 'Desde', type: 'date' },
        { name: 'hasta', label: 'Hasta', type: 'date' },
        { name: 'comentario', label: 'Motivo / nota interna', type: 'textarea', full: true, placeholder: 'Contexto de la asignación…' },
      ]}
      submitLabel="Asignar permiso"
      successTitle="Permiso asignado"
      successDescription="Se registró el permiso."
      validate={validateLeave}
      onSubmit={async (v) => {
        // ponytail: no employee-picker component exists yet — resolving by
        // employeeCode against the already-fetched directory (up to 100
        // employees) instead of adding an autocomplete widget.
        const employee = [...(directory?.data ?? [])].find((e) => e.employeeCode === v.employeeCode)
        if (!employee) throw new Error(`No se encontró un empleado con código "${v.employeeCode}".`)
        await createLeave.mutateAsync({ employeeId: employee.id, ...buildLeavePayload(v) })
      }}
    />
  )
}

/* ── Nuevo objetivo (OKR) ── */
export function NewObjectiveButton({ label = 'Crear objetivo' }: { label?: string }) {
  const createObjective = useCreateObjective()

  return (
    <FormAction
      trigger={PrimaryTrigger(label, <Target size={16} />)}
      title="Crear objetivo (OKR)"
      description="Define un objetivo. Los resultados clave se agregan después."
      icon={<Target size={18} />}
      fields={[
        { name: 'nombre', label: 'Nombre del objetivo', full: true, placeholder: 'Ej. Plan de negocio cumplido' },
        { name: 'nivel', label: 'Nivel', type: 'select', options: ['Empresa', 'Área', 'Equipo'].map(opt) },
        { name: 'prioridad', label: 'Prioridad', type: 'select', options: ['Crítico', 'Alto', 'Medio', 'Bajo'].map(opt) },
        { name: 'owner', label: 'Responsable', placeholder: 'Ej. John Smith' },
        { name: 'vencimiento', label: 'Vencimiento', type: 'date' },
      ]}
      submitLabel="Crear objetivo"
      successTitle="Objetivo creado"
      successDescription="Ya puedes añadirle resultados clave con desglose T1–T4."
      validate={(v) => {
        const r = objectiveFormSchema.safeParse({
          nombre: v.nombre,
          owner: v.owner,
          nivel: v.nivel,
          prioridad: v.prioridad,
          vencimiento: v.vencimiento,
        })
        return r.success ? { success: true } : { success: false, fieldErrors: fieldErrorsFromIssues(r.error.issues) }
      }}
      onSubmit={async (v) => {
        await createObjective.mutateAsync({
          nombre: v.nombre,
          owner: v.owner,
          iniciales: initials(v.owner),
          nivel: v.nivel as 'Empresa' | 'Área' | 'Equipo',
          prioridad: v.prioridad as 'Crítico' | 'Alto' | 'Medio' | 'Bajo',
          vencimiento: v.vencimiento,
        })
      }}
    />
  )
}

/* ── Nueva campaña — fuera de alcance esta fase (PLAN.md: encuestas es solo lectura) ── */
export function NewCampaignButton({ label = 'Nueva campaña' }: { label?: string }) {
  const toast = useToast()
  return (
    <Button
      variant="primary"
      onClick={() =>
        toast.info('Próximamente', 'La creación de campañas de encuestas aún no está disponible — por ahora, Encuestas es de solo lectura.')
      }
    >
      <ClipboardList size={16} /> {label}
    </Button>
  )
}

/* ── Nuevo rol — matriz de roles va en la fase de hardening (Roles.tsx) ── */
export function NewRoleButton({ label = 'Crear rol' }: { label?: string }) {
  const { data: roles } = useRoles()
  const roleOptions = (roles ?? []).map((r) => ({ value: r.id, label: r.nombre }))
  return (
    <FormAction
      trigger={PrimaryTrigger(label, <ShieldCheck size={16} />)}
      title="Crear rol"
      description="Parte de un rol existente y ajusta permisos por módulo y campo."
      icon={<ShieldCheck size={18} />}
      fields={[
        { name: 'nombre', label: 'Nombre del rol', full: true, placeholder: 'Ej. Analista de Nómina Jr.' },
        { name: 'descripcion', label: 'Descripción', type: 'textarea', full: true, placeholder: 'Qué puede hacer este rol…' },
        { name: 'base', label: 'Basado en', type: 'select', full: true, options: roleOptions },
      ]}
      submitLabel="Crear rol"
      successTitle="Rol creado"
      successDescription="Configura sus permisos en la matriz."
    />
  )
}

/* ── Dar reconocimiento ── */
export function RecognitionButton({ label = 'Dar reconocimiento', variant = 'primary' }: { label?: string; variant?: Variant }) {
  const { data: directory } = useEmployeesLookup()
  const createRecognition = useCreateRecognition()

  return (
    <FormAction
      trigger={PrimaryTrigger(label, <Heart size={16} />, variant)}
      title="Dar un reconocimiento"
      description="Reconoce a un colega con un mensaje."
      icon={<Heart size={18} />}
      fields={[
        { name: 'employeeCode', label: 'Código de empleado', full: true, placeholder: 'Ej. BO1001' },
        { name: 'estrellas', label: 'Estrellas', type: 'select', options: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'].map((v, i) => ({ value: String(i + 1), label: v })) },
        { name: 'mensaje', label: 'Mensaje', type: 'textarea', full: true, placeholder: 'Cuéntale por qué lo reconoces…' },
      ]}
      submitLabel="Enviar reconocimiento"
      successTitle="¡Reconocimiento enviado!"
      successDescription="Tu colega recibirá una notificación con tu mensaje."
      validate={(v) => {
        const r = recognitionFormSchema.safeParse({ mensaje: v.mensaje, estrellas: Number(v.estrellas) || 5 })
        return r.success ? { success: true } : { success: false, fieldErrors: fieldErrorsFromIssues(r.error.issues) }
      }}
      onSubmit={async (v) => {
        const employee = [...(directory?.data ?? [])].find((e) => e.employeeCode === v.employeeCode)
        if (!employee) throw new Error(`No se encontró un empleado con código "${v.employeeCode}".`)
        await createRecognition.mutateAsync({
          paraEmployeeId: employee.id,
          mensaje: v.mensaje,
          estrellas: Number(v.estrellas) || 5,
        })
      }}
    />
  )
}

/* ── Reportar al canal seguro (denuncia) ──
 * Anónimo por diseño: el formulario NUNCA pide ni envía un campo que
 * identifique al reportante — ni siquiera hay una opción "con mi nombre",
 * porque el backend no acepta uno (denunciaInputSchema no tiene ese campo).
 */
export function ReportIssueButton({ label = 'Reportar', variant = 'outline' }: { label?: string; variant?: Variant }) {
  const createDenuncia = useCreateDenuncia()

  return (
    <FormAction
      trigger={PrimaryTrigger(label, <ShieldQuestion size={16} />, variant)}
      title="Reportar al canal seguro"
      description="Tu reporte es 100% anónimo — no se registra quién lo envía."
      icon={<ShieldQuestion size={18} />}
      fields={[
        {
          name: 'tipo',
          label: 'Tipo',
          type: 'select',
          full: true,
          options: ['Conflicto laboral', 'Acoso o intimidación', 'Sugerencia', 'Reconocimiento'].map(opt),
        },
        { name: 'titulo', label: 'Título', full: true, placeholder: 'Resume tu reporte' },
        { name: 'pais', label: 'País', type: 'select', options: countryOptions },
      ]}
      submitLabel="Enviar reporte"
      successTitle="Reporte enviado"
      successDescription="Gracias por tu confianza. Lo revisará el equipo de RR.HH."
      validate={(v) => {
        const r = denunciaFormSchema.safeParse({ tipo: v.tipo, titulo: v.titulo, pais: v.pais })
        return r.success ? { success: true } : { success: false, fieldErrors: fieldErrorsFromIssues(r.error.issues) }
      }}
      onSubmit={async (v) => {
        await createDenuncia.mutateAsync({
          tipo: v.tipo as 'Conflicto laboral' | 'Acoso o intimidación' | 'Sugerencia' | 'Reconocimiento',
          titulo: v.titulo,
          pais: v.pais as Country,
          anonimo: true,
        })
      }}
    />
  )
}
