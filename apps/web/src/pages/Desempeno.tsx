import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Gauge, Users, Star, CheckCircle2, ArrowRight, TrendingUp, TrendingDown, Send, Play } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { StatCard } from '@/components/ui/StatCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { CountryTag } from '@/components/ui/CountryTag'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/toast'
import { container, fadeUp } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { type Country } from '@/lib/countries'
import { useEmployeeReference } from '@/api/employees'
import type { Employee } from '@orbit/shared'

const competencias = [
  { comp: 'Liderazgo', auto: 4.2, equipo: 3.8, jefatura: 4.1 },
  { comp: 'Comunicación', auto: 4.5, equipo: 4.1, jefatura: 4.0 },
  { comp: 'Trabajo en equipo', auto: 4.3, equipo: 4.4, jefatura: 4.2 },
  { comp: 'Orientación a resultados', auto: 3.9, equipo: 4.0, jefatura: 4.3 },
  { comp: 'Innovación', auto: 4.0, equipo: 3.6, jefatura: 3.8 },
  { comp: 'Adaptabilidad', auto: 4.4, equipo: 4.2, jefatura: 4.1 },
]

const competenciasList = competencias.map((c) => c.comp)

const porPais: { pais: Country; score: number }[] = [
  { pais: 'EC', score: 4.4 },
  { pais: 'BO', score: 4.3 },
  { pais: 'CL', score: 4.0 },
  { pais: 'AR', score: 3.9 },
  { pais: 'PY', score: 4.1 },
]

export function Desempeno() {
  const toast = useToast()
  const { activos, departamentos } = useEmployeeReference()
  const pendientes = activos.slice(20, 26)
  const [cicloOpen, setCicloOpen] = useState(false)
  const [evalTarget, setEvalTarget] = useState<Employee | null>(null)

  const ranked = competencias
    .map((c) => ({ comp: c.comp, avg: (c.auto + c.equipo + c.jefatura) / 3 }))
    .sort((a, b) => b.avg - a.avg)
  const fortalezas = ranked.slice(0, 2)
  const mejorar = ranked.slice(-2).reverse()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Desempeño · Evaluación 360°"
        title="Desempeño"
        description="Evaluaciones de desempeño centralizadas, con seguimiento por área y país."
        action={
          <Button variant="primary" onClick={() => setCicloOpen(true)}>
            <Play size={16} /> Iniciar ciclo
          </Button>
        }
      />

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Ciclo actual" value={2026} plain icon={Gauge} accent suffix=" · S1" />
        <StatCard label="Avance de evaluaciones" value={78} suffix="%" icon={CheckCircle2} accent delta="+12%" />
        <StatCard label="Promedio organizacional" value={4.2} decimals={1} suffix=" / 5" icon={Star} accent delta="+0.3" />
        <StatCard label="Participación" value={91} suffix="%" icon={Users} accent delta="+5%" />
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Radar 360 */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader
              title="Evaluación 360° por competencia"
              subtitle="Autoevaluación vs equipo vs jefatura"
              action={<Badge variant="success" dot>4.2 / 5 prom.</Badge>}
            />
            <div className="grid grid-cols-1 items-center gap-2 p-3 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <ResponsiveContainer width="100%" height={336}>
                  <RadarChart data={competencias} outerRadius="80%">
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="comp" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 5]} tick={{ fill: 'var(--color-faint)', fontSize: 9 }} axisLine={false} />
                    <Radar name="Autoevaluación" dataKey="auto" stroke="#ffb224" fill="#ffb224" fillOpacity={0.22} strokeWidth={2} animationDuration={900} />
                    <Radar name="Equipo" dataKey="equipo" stroke="#74a8ff" fill="#74a8ff" fillOpacity={0.14} strokeWidth={2} animationDuration={1000} />
                    <Radar name="Jefatura" dataKey="jefatura" stroke="#46d88f" fill="#46d88f" fillOpacity={0.12} strokeWidth={2} animationDuration={1100} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-col justify-center gap-3.5 px-2 pb-2 lg:col-span-2">
                <p className="font-mono text-[10.5px] font-medium tracking-[0.16em] text-faint uppercase">
                  Promedio por competencia
                </p>
                {competencias.map((c, i) => {
                  const avg = (c.auto + c.equipo + c.jefatura) / 3
                  return (
                    <div key={c.comp}>
                      <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                        <span className="text-muted">{c.comp}</span>
                        <span className="font-mono font-medium text-fg">{avg.toFixed(1)}</span>
                      </div>
                      <ProgressBar
                        value={(avg / 5) * 100}
                        delay={i * 0.05}
                        height={5}
                        color={avg >= 4.2 ? 'var(--color-success)' : avg >= 3.9 ? 'var(--color-accent)' : 'var(--color-warning)'}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-line p-5 sm:grid-cols-2">
              <div>
                <p className="mb-2.5 flex items-center gap-1.5 text-[12px] font-medium text-success">
                  <TrendingUp size={14} /> Fortalezas
                </p>
                <div className="flex flex-wrap gap-2">
                  {fortalezas.map((f) => (
                    <Badge key={f.comp} variant="success">
                      {f.comp} · {f.avg.toFixed(1)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2.5 flex items-center gap-1.5 text-[12px] font-medium text-warning">
                  <TrendingDown size={14} /> A desarrollar
                </p>
                <div className="flex flex-wrap gap-2">
                  {mejorar.map((m) => (
                    <Badge key={m.comp} variant="warning">
                      {m.comp} · {m.avg.toFixed(1)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Por país + pendientes */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Desempeño medio por país" subtitle="Escala 1 a 5" />
            <div className="space-y-4 p-5 pt-4">
              {porPais.map((p, i) => (
                <div key={p.pais}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <CountryTag pais={p.pais} withName />
                    <span className="font-mono text-[13px] font-semibold text-fg">{p.score.toFixed(1)}</span>
                  </div>
                  <ProgressBar
                    value={(p.score / 5) * 100}
                    delay={i * 0.07}
                    color={p.score >= 4.2 ? 'var(--color-success)' : p.score >= 4 ? 'var(--color-accent)' : 'var(--color-warning)'}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Tus evaluaciones pendientes" subtitle={`${pendientes.length} por completar`} />
            <div className="p-3">
              {pendientes.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEvalTarget(e)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <Avatar iniciales={e.iniciales} gradient={e.avatar} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg">{e.nombre}</p>
                    <p className="text-[11px] text-faint">{e.puesto}</p>
                  </div>
                  <Badge variant="warning">Pendiente</Badge>
                  <ArrowRight size={15} className="text-faint" />
                </button>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      <IniciarCicloModal open={cicloOpen} onClose={() => setCicloOpen(false)} activos={activos} departamentos={departamentos} />
      <EvalSurveyModal persona={evalTarget} onClose={() => setEvalTarget(null)} />
    </div>
  )
}

/* ── Iniciar ciclo: elige alcance y notifica según la jerarquía del organigrama ── */
function IniciarCicloModal({
  open,
  onClose,
  activos,
  departamentos,
}: {
  open: boolean
  onClose: () => void
  activos: Employee[]
  departamentos: string[]
}) {
  const toast = useToast()
  const [depto, setDepto] = useState('Todos')
  const [periodo, setPeriodo] = useState('2026 · S2')

  const evaluados = useMemo(
    () => (depto === 'Todos' ? activos : activos.filter((e) => e.departamento === depto)),
    [depto, activos],
  )
  // En una 360 cada persona evalúa a su jefe y a sus reportes → pares de evaluación
  // derivados de la jerarquía (aprox. 2 evaluaciones por persona).
  const evaluaciones = evaluados.length * 2

  const selectCls =
    'w-full rounded-lg border border-line bg-card px-3 py-2.5 text-[13.5px] text-fg transition-colors focus:border-accent/60 focus:outline-none'

  return (
    <Modal open={open} onClose={onClose} title="Iniciar ciclo 360°" description="Se notifica a evaluadores y evaluados según el organigrama." icon={<Play size={18} />} width={520}>
      <div className="px-6 py-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1.5 block text-[12.5px] font-medium text-muted">Alcance</label>
            <select value={depto} onChange={(e) => setDepto(e.target.value)} className={selectCls}>
              <option value="Todos">Toda la organización</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1.5 block text-[12.5px] font-medium text-muted">Período</label>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={selectCls}>
              <option>2026 · S2</option>
              <option>2026 · S1</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line-soft bg-panel/40 px-3.5 py-3">
            <p className="font-display text-[24px] leading-none font-semibold tabular text-fg">{evaluados.length}</p>
            <p className="mt-1 text-[11px] text-faint">colaboradores incluidos</p>
          </div>
          <div className="rounded-lg border border-line-soft bg-panel/40 px-3.5 py-3">
            <p className="font-display text-[24px] leading-none font-semibold tabular text-accent">{evaluaciones}</p>
            <p className="mt-1 text-[11px] text-faint">evaluaciones a generar</p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-accent-soft/50 px-3.5 py-3">
          <Users size={15} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[12px] leading-relaxed text-muted">
            Cada persona evaluará a su jefatura y a sus reportes directos según el organigrama. Se enviará la
            notificación por correo y dentro del sistema.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            const id = toast.loading(`Iniciando ciclo ${periodo}…`)
            setTimeout(
              () => toast.update(id, 'success', 'Ciclo 360° iniciado', `Se notificó a ${evaluados.length} colaboradores (${depto === 'Todos' ? 'toda la organización' : depto}).`),
              1200,
            )
            onClose()
          }}
        >
          <Play size={16} /> Iniciar ciclo
        </Button>
      </div>
    </Modal>
  )
}

/* ── Autoevaluación / encuesta 360 de un colaborador ── */
function EvalSurveyModal({ persona, onClose }: { persona: Employee | null; onClose: () => void }) {
  const toast = useToast()
  const [ratings, setRatings] = useState<Record<string, number>>({})

  const completas = Object.keys(ratings).length
  const total = competenciasList.length

  const enviar = () => {
    toast.success('Evaluación enviada', `Tu evaluación de ${persona?.nombre.split(' ')[0]} quedó registrada.`)
    setRatings({})
    onClose()
  }

  return (
    <Modal
      open={!!persona}
      onClose={() => {
        setRatings({})
        onClose()
      }}
      title="Evaluación 360°"
      description="Califica cada competencia del 1 al 5."
      icon={<Star size={18} />}
      width={560}
    >
      {persona && (
        <>
          <div className="px-6 py-5">
            <div className="flex items-center gap-3">
              <Avatar iniciales={persona.iniciales} gradient={persona.avatar} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-fg">{persona.nombre}</p>
                <p className="text-[12px] text-faint">{persona.puesto}</p>
              </div>
              <Badge variant="info" dot>
                {completas}/{total}
              </Badge>
            </div>

            <div className="mt-5 space-y-3">
              {competenciasList.map((comp) => (
                <div key={comp} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-soft bg-panel/40 px-3.5 py-2.5">
                  <span className="text-[13px] text-muted">{comp}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setRatings((r) => ({ ...r, [comp]: n }))}
                        className={cn(
                          'flex size-7 items-center justify-center rounded-md border text-[12px] font-semibold transition-colors',
                          (ratings[comp] ?? 0) >= n
                            ? 'border-accent/50 bg-accent-soft text-accent'
                            : 'border-line text-faint hover:border-white/20 hover:text-muted',
                        )}
                        aria-label={`${comp}: ${n}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-6 py-4">
            <span className="text-[12px] text-faint">{completas === total ? 'Listo para enviar' : `Faltan ${total - completas} competencias`}</span>
            <Button variant="primary" disabled={completas < total} onClick={enviar}>
              <Send size={16} /> Enviar evaluación
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
