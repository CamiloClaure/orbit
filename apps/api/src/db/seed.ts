// Straight-line seed script — no seeding framework, just one function per
// tenant. Ports the generators from the mockup's src/data/*.ts so the seeded
// DB resembles the mock. Runs as the superuser (bypasses RLS on purpose:
// seeding both tenants in one pass is an admin op, not a tenant request).
//
// NOT seeded here (Phase 2's job, per PLAN.md): users, sessions, and
// therefore notifications (FK's to users, which don't exist yet).
import { makeDb, ADMIN_DATABASE_URL } from "./client.js";
import * as schema from "./schema/index.js";
import { sql } from "drizzle-orm";
import argon2 from "argon2";

type Country = "BO" | "CL" | "EC" | "AR" | "PY";

const countries: Record<Country, { nombre: string; ciudades: string[] }> = {
  BO: { nombre: "Bolivia", ciudades: ["Santa Cruz", "La Paz", "Cochabamba"] },
  CL: { nombre: "Chile", ciudades: ["Santiago", "Valparaíso", "Concepción"] },
  EC: { nombre: "Ecuador", ciudades: ["Quito", "Guayaquil", "Cuenca"] },
  AR: { nombre: "Argentina", ciudades: ["Buenos Aires", "Córdoba", "Rosario"] },
  PY: { nombre: "Paraguay", ciudades: ["Asunción", "Ciudad del Este", "Encarnación"] },
};

const nombres = [
  "Emily", "Michael", "Sarah", "James", "Jessica", "David", "Ashley", "Daniel",
  "Amanda", "Matthew", "Jennifer", "Andrew", "Lauren", "Joshua", "Megan", "Ryan",
  "Rachel", "Brandon", "Samantha", "Tyler", "Nicole", "Justin", "Hannah", "Kevin",
  "Olivia", "Nathan", "Victoria", "Adam", "Brittany", "Aaron", "Kayla", "Eric",
  "Christina", "Sean", "Danielle", "Jacob", "Stephanie", "Patrick", "Allison", "Steven",
  "Natalie", "Benjamin", "Rebecca", "Jonathan", "Catherine", "Charles", "Heather", "Gregory",
];

const apellidos = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Garcia",
  "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Martin", "Jackson", "Thompson",
  "White", "Harris", "Clark", "Lewis", "Walker", "Hall", "Allen", "Young",
  "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Carter",
  "Mitchell", "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans", "Edwards",
];

interface Area {
  departamento: string;
  puestos: string[];
  cc: string;
  rango: [number, number];
}

const areas: Area[] = [
  { departamento: "Comercial", cc: "BO-DSP", puestos: ["Asesor Comercial", "Ejecutivo de Ventas", "Jefe Comercial", "KAM"], rango: [820, 2400] },
  { departamento: "Operaciones", cc: "OPS-CTR", puestos: ["Analista de Operaciones", "Supervisor de Operaciones", "Coordinador Logístico", "Jefe de Operaciones"], rango: [950, 2900] },
  { departamento: "Administración & Finanzas", cc: "ADM-FIN", puestos: ["Analista Contable", "Tesorería", "Generalista Adm. & Finanzas", "Jefe de Finanzas"], rango: [1100, 3600] },
  { departamento: "Tecnología", cc: "TI-DEV", puestos: ["Desarrollador", "Analista de Sistemas", "Soporte IT", "Líder de Tecnología"], rango: [1400, 4200] },
  { departamento: "Recursos Humanos", cc: "RH-GEN", puestos: ["Analista de RR.HH.", "Generalista de Talento", "Reclutador", "Jefe de RR.HH."], rango: [1050, 3400] },
  { departamento: "Marketing", cc: "MKT-BR", puestos: ["Diseñador", "Community Manager", "Analista de Marketing", "Jefe de Marketing"], rango: [980, 3000] },
  { departamento: "Atención al Cliente", cc: "CX-CALL", puestos: ["Agente CX", "Supervisor CX", "Especialista de Soporte"], rango: [780, 1900] },
];

const avatarGradients = [
  "linear-gradient(135deg,#ffb224,#f97316)",
  "linear-gradient(135deg,#74a8ff,#5b6cff)",
  "linear-gradient(135deg,#46d88f,#10b981)",
  "linear-gradient(135deg,#f472b6,#db2777)",
  "linear-gradient(135deg,#a78bfa,#7c3aed)",
  "linear-gradient(135deg,#fbbf24,#d97706)",
  "linear-gradient(135deg,#22d3ee,#0891b2)",
  "linear-gradient(135deg,#fb7185,#e11d48)",
];

// Ported verbatim from employees.ts — deterministic PRNG so the dataset is
// stable across seed runs.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

interface GenEmployee {
  employeeCode: string;
  nombre: string;
  puesto: string;
  departamento: string;
  centroCosto: string;
  sede: string;
  pais: Country;
  ciudad: string;
  estado: "Activo" | "Inactivo" | "Ausente";
  email: string;
  telefono: string;
  ingreso: string;
  cumple: string;
  salario: number;
  iniciales: string;
  avatar: string;
  supervisorIdx: number | null;
}

// Ported from `generate()` in employees.ts, index-based supervisor
// assignment instead of name-based (real FK, no name-collision risk).
function generateEmployees(seed: number, count: number): GenEmployee[] {
  const rand = mulberry32(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const list: GenEmployee[] = [];
  const seenEmailLocals = new Set<string>();
  const countryCodes: Country[] = ["BO", "BO", "BO", "CL", "CL", "EC", "AR", "PY"];
  const counters: Record<Country, number> = { BO: 1000, CL: 1200, EC: 1300, AR: 1400, PY: 1500 };

  for (let i = 0; i < count; i++) {
    const pais = pick(countryCodes);
    const area = pick(areas);
    const puesto = pick(area.puestos);
    const nombre = `${pick(nombres)} ${pick(apellidos)}`;
    const employeeCode = `${pais}${++counters[pais]}`;
    const [min, max] = area.rango;
    const seniority = /Jefe|Líder|KAM|Coordinador/.test(puesto) ? 0.65 : rand();
    const salario = Math.round((min + (max - min) * (0.3 + seniority * 0.7)) / 10) * 10;
    const ciudad = pick(countries[pais].ciudades);
    const r = rand();
    const estado: GenEmployee["estado"] = r > 0.94 ? "Inactivo" : r > 0.88 ? "Ausente" : "Activo";
    const year = 2016 + Math.floor(rand() * 10);
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 27);
    const cumpleMonth = 1 + Math.floor(rand() * 12);
    const cumpleDay = 1 + Math.floor(rand() * 27);
    const nameKey = nombre.toLowerCase().replace(/\s+/g, ".").normalize("NFD").replace(/[̀-ͯ]/g, "");

    list.push({
      employeeCode,
      nombre,
      puesto,
      departamento: area.departamento,
      centroCosto: `${pais}-${area.cc}`,
      sede: `${countries[pais].nombre} · ${ciudad}`,
      pais,
      ciudad,
      estado,
      // ponytail: mock doesn't dedupe (never hits a DB constraint); with 312
      // draws from a 48x40 name pool, birthday-paradox collisions are
      // frequent, so append the employee code when the local-part repeats.
      email: (() => {
        const base = nameKey.split(".").slice(0, 2).join(".");
        const local = seenEmailLocals.has(base) ? `${base}.${employeeCode.toLowerCase()}` : base;
        seenEmailLocals.add(local);
        return `${local}@nortania.com`;
      })(),
      telefono: `+${pais === "BO" ? "591" : pais === "CL" ? "56" : pais === "EC" ? "593" : pais === "AR" ? "54" : "595"} ${Math.floor(60000000 + rand() * 39999999)}`,
      ingreso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      cumple: `${String(cumpleMonth).padStart(2, "0")}-${String(cumpleDay).padStart(2, "0")}`,
      salario,
      iniciales: initials(nombre),
      avatar: avatarGradients[i % avatarGradients.length],
      supervisorIdx: null,
    });
  }

  // Assign supervisors: a jefe from the same department & country when possible.
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (/Jefe|Líder/.test(e.puesto)) continue;
    let supIdx = list.findIndex(
      (j, ji) => ji !== i && j.pais === e.pais && j.departamento === e.departamento && /Jefe|Líder/.test(j.puesto),
    );
    if (supIdx === -1) supIdx = list.findIndex((j) => /Jefe|Líder/.test(j.puesto));
    e.supervisorIdx = supIdx === -1 ? null : supIdx;
  }

  return list;
}

// Ported from leave.ts `leaveRulesByCountry`.
const leaveRulesByCountry: Record<Country, { nombre: string; dias: number; color: string }[]> = {
  BO: [
    { nombre: "Vacaciones", dias: 15, color: "var(--color-accent)" },
    { nombre: "Permiso personal", dias: 3, color: "var(--color-info)" },
    { nombre: "Licencia por cumpleaños", dias: 0.5, color: "var(--color-success)" },
    { nombre: "Enfermedad", dias: 5, color: "var(--color-danger)" },
    { nombre: "Matrimonio", dias: 3, color: "var(--color-warning)" },
  ],
  CL: [
    { nombre: "Vacaciones", dias: 15, color: "var(--color-accent)" },
    { nombre: "Licencia médica", dias: 6, color: "var(--color-danger)" },
    { nombre: "Día administrativo", dias: 2, color: "var(--color-info)" },
  ],
  EC: [
    { nombre: "Vacaciones", dias: 15, color: "var(--color-accent)" },
    { nombre: "Enfermedad", dias: 5, color: "var(--color-danger)" },
    { nombre: "Calamidad doméstica", dias: 3, color: "var(--color-warning)" },
  ],
  AR: [
    { nombre: "Vacaciones", dias: 14, color: "var(--color-accent)" },
    { nombre: "Licencia por enfermedad", dias: 6, color: "var(--color-danger)" },
    { nombre: "Día de cumpleaños", dias: 0.5, color: "var(--color-success)" },
  ],
  PY: [
    { nombre: "Vacaciones", dias: 12, color: "var(--color-info)" },
    { nombre: "Permiso personal", dias: 2, color: "var(--color-info)" },
    { nombre: "Reposo médico", dias: 5, color: "var(--color-danger)" },
    { nombre: "Matrimonio", dias: 3, color: "var(--color-warning)" },
  ],
};

// Ported from roles.ts.
const rolesSeed = [
  { key: "empleado", nombre: "Empleado", descripcion: "Acceso a su propia información y autoservicio.", color: "#6f6c78" },
  { key: "supervisor", nombre: "Supervisor", descripcion: "Gestiona y aprueba a su equipo directo.", color: "#74a8ff" },
  { key: "analista", nombre: "Analista de RR.HH.", descripcion: "Operación de RR.HH. por país, sin sueldos.", color: "#46d88f" },
  { key: "jefe", nombre: "Jefe de Área", descripcion: "Visibilidad de su área incluyendo costos.", color: "#fbbf24" },
  { key: "nomina", nombre: "Admin de Nómina", descripcion: "Único rol con acceso a salarios y planilla.", color: "#ffb224" },
  { key: "global", nombre: "Administrador Global", descripcion: "Control total del sistema. Acceso restringido.", color: "#ff6f6f" },
] as const;

type Modulo = typeof schema.moduloEnum.enumValues[number];
type Accion = typeof schema.accionEnum.enumValues[number];

const matrix: Record<string, Partial<Record<Modulo, Accion[]>>> = {
  empleado: {
    Empleados: ["Ver"],
    Permisos: ["Ver", "Crear"],
    OKRs: ["Ver", "Crear", "Editar"],
    Desempeño: ["Ver"],
    Encuestas: ["Ver"],
  },
  supervisor: {
    Empleados: ["Ver"],
    Permisos: ["Ver", "Crear", "Aprobar"],
    OKRs: ["Ver", "Crear", "Editar", "Aprobar"],
    Desempeño: ["Ver", "Editar"],
    Reportes: ["Ver"],
    Encuestas: ["Ver"],
  },
  analista: {
    Empleados: ["Ver", "Crear", "Editar"],
    Permisos: ["Ver", "Crear", "Editar", "Aprobar"],
    OKRs: ["Ver"],
    Desempeño: ["Ver", "Crear", "Editar"],
    Reportes: ["Ver", "Crear"],
    Encuestas: ["Ver", "Crear", "Editar"],
  },
  jefe: {
    Empleados: ["Ver", "Editar"],
    Permisos: ["Ver", "Aprobar"],
    Nómina: ["Ver"],
    OKRs: ["Ver", "Crear", "Editar", "Aprobar"],
    Desempeño: ["Ver", "Crear", "Editar", "Aprobar"],
    Reportes: ["Ver", "Crear"],
  },
  nomina: {
    Empleados: ["Ver"],
    Nómina: ["Ver", "Crear", "Editar", "Aprobar"],
    Reportes: ["Ver", "Crear"],
  },
  global: {
    Empleados: ["Ver", "Crear", "Editar", "Aprobar", "Eliminar"],
    Permisos: ["Ver", "Crear", "Editar", "Aprobar", "Eliminar"],
    Nómina: ["Ver", "Crear", "Editar", "Aprobar", "Eliminar"],
    OKRs: ["Ver", "Crear", "Editar", "Aprobar", "Eliminar"],
    Desempeño: ["Ver", "Crear", "Editar", "Aprobar", "Eliminar"],
    Reportes: ["Ver", "Crear", "Editar", "Aprobar", "Eliminar"],
    Encuestas: ["Ver", "Crear", "Editar", "Aprobar", "Eliminar"],
    "Roles y permisos": ["Ver", "Crear", "Editar", "Aprobar", "Eliminar"],
  },
};

const fieldPermissionsSeed: { campo: string; modulo: Modulo; roles: string[] }[] = [
  { campo: "Salario y haberes", modulo: "Nómina", roles: ["nomina", "global"] },
  { campo: "Costo por centro de costo", modulo: "Nómina", roles: ["jefe", "nomina", "global"] },
  { campo: "Datos de contacto", modulo: "Empleados", roles: ["analista", "jefe", "nomina", "global"] },
  { campo: "Documentos de identidad", modulo: "Empleados", roles: ["analista", "global"] },
  { campo: "Denuncias anónimas", modulo: "Encuestas", roles: ["analista", "global"] },
];

const aportePatronalByCountry: Record<Country, number> = { BO: 0.41, AR: 0.37, CL: 0.27, EC: 0.302, PY: 0.285 };
const PERIODO = "2026-06";

// Ported from okrs.ts — same OKR set seeded for both tenants (generic templates).
const Q = (t1: number, t2: number, t3: number, t4: number, pesos = [25, 25, 25, 25]) =>
  (["T1", "T2", "T3", "T4"] as const).map((t, i) => ({ t, peso: pesos[i], avance: [t1, t2, t3, t4][i] }));

const objetivosSeed = [
  {
    nombre: "Plan de negocio cumplido", owner: "Sarah Mitchell", iniciales: "SM", nivel: "Empresa" as const,
    vencimiento: "2026-12-31", prioridad: "Alto" as const,
    krs: [
      { nombre: "Programa de embajadores activos", owner: "Mark Reynolds", metrica: "# embajadores", prioridad: "Medio" as const, trimestres: Q(40, 60, 70, 30, [20, 30, 30, 20]) },
      { nombre: "Tools y plataformas actualizadas y en uso", owner: "Mark Reynolds", metrica: "Porcentaje", prioridad: "Alto" as const, trimestres: Q(100, 100, 100, 100) },
      { nombre: "Equipo acompasado y productivo", owner: "Mark Reynolds", metrica: "Porcentaje", prioridad: "Alto" as const, trimestres: Q(85, 92, 95, 88, [20, 20, 30, 30]) },
      { nombre: "Competencias y R&R actualizadas", owner: "Mark Reynolds", metrica: "Porcentaje", prioridad: "Medio" as const, trimestres: Q(60, 80, 75, 50, [30, 30, 20, 20]) },
    ],
  },
  {
    nombre: "Camino para la innovación creado", owner: "Sarah Mitchell", iniciales: "SM", nivel: "Empresa" as const,
    vencimiento: "2026-11-30", prioridad: "Medio" as const,
    krs: [
      { nombre: "Roadmap de innovación publicado", owner: "Robert Hayes", metrica: "Hitos", prioridad: "Medio" as const, trimestres: Q(70, 90, 100, 95) },
      { nombre: "Pilotos validados con clientes", owner: "Robert Hayes", metrica: "# pilotos", prioridad: "Alto" as const, trimestres: Q(50, 75, 80, 60, [10, 30, 40, 20]) },
    ],
  },
  {
    nombre: "Proyectos activos", owner: "Mark Reynolds", iniciales: "MR", nivel: "Área" as const,
    vencimiento: "2026-12-31", prioridad: "Alto" as const,
    krs: [
      { nombre: "Migración del HRM en marcha", owner: "Alex Carter", metrica: "Porcentaje", prioridad: "Crítico" as const, trimestres: Q(20, 55, 85, 100, [10, 30, 30, 30]) },
      { nombre: "Gobernanza intercompany planeada", owner: "Mark Reynolds", metrica: "Porcentaje", prioridad: "Alto" as const, trimestres: Q(100, 100, 100, 100) },
    ],
  },
  {
    nombre: "Organización mejorada", owner: "Mark Reynolds", iniciales: "MR", nivel: "Área" as const,
    vencimiento: "2026-12-31", prioridad: "Alto" as const,
    krs: [
      { nombre: "Estructura revisada y difundida", owner: "Emily Parker", metrica: "Porcentaje", prioridad: "Alto" as const, trimestres: Q(90, 95, 100, 100) },
      { nombre: "Clima laboral ≥ 4.5 / 5", owner: "Emily Parker", metrica: "eNPS", prioridad: "Medio" as const, trimestres: Q(82, 86, 90, 88, [20, 20, 30, 30]) },
    ],
  },
  {
    nombre: "Crecimiento rentable — BAU", owner: "Robert Hayes", iniciales: "RH", nivel: "Empresa" as const,
    vencimiento: "2026-12-31", prioridad: "Alto" as const,
    krs: [
      { nombre: "Margen operativo objetivo", owner: "Robert Hayes", metrica: "Porcentaje", prioridad: "Crítico" as const, trimestres: Q(30, 45, 40, 20) },
      { nombre: "Expansión de cartera", owner: "Olivia Grant", metrica: "# cuentas", prioridad: "Alto" as const, trimestres: Q(60, 70, 75, 65, [20, 30, 30, 20]) },
    ],
  },
];

// Ported from engagement.ts.
const campañasSeed = [
  { nombre: "Clima Organizacional 2026 · S1", plantilla: "eNPS", vence: "2026-07-15", anonimo: true, estado: "Iniciada" as const, participacion: 0.72 },
  { nombre: "Pulso trimestral Q2", plantilla: "Bienestar", vence: "2026-06-05", anonimo: true, estado: "Iniciada" as const, participacion: 0.41 },
  { nombre: "Encuesta de Cultura 2026", plantilla: "Encuesta de Cultura", vence: "2026-07-30", anonimo: false, estado: "Borrador" as const, participacion: 0 },
  { nombre: "Feedback de onboarding", plantilla: "Pulso", vence: "2026-04-15", anonimo: false, estado: "Cerrada" as const, participacion: 0.88 },
  { nombre: "eNPS anual 2025", plantilla: "eNPS", vence: "2025-12-20", anonimo: true, estado: "Cerrada" as const, participacion: 0.79 },
];

const enpsTrendSeed = [
  { mes: "Dic", score: 28 }, { mes: "Ene", score: 31 }, { mes: "Feb", score: 34 },
  { mes: "Mar", score: 33 }, { mes: "Abr", score: 39 }, { mes: "May", score: 42 },
];
const enpsOverall = { promotores: 58, pasivos: 26, detractores: 16 };

const plantillasSeed = [
  { nombre: "eNPS", preguntas: 3, tipo: "Recomendación + abiertas", editable: true },
  { nombre: "Encuesta de Cultura", preguntas: 18, tipo: "Escala + abiertas", editable: true },
  { nombre: "Bienestar", preguntas: 12, tipo: "Escala 1–5", editable: true },
  { nombre: "Pulso", preguntas: 5, tipo: "Mixta", editable: true },
  { nombre: "Personalizada", preguntas: 0, tipo: "Desde cero", editable: true },
];

const mensajesReconocimiento = [
  "Salvó la entrega del cliente quedándose hasta tarde. ¡Crack!",
  "Siempre dispuesta a ayudar al equipo nuevo. Pura buena onda.",
  "Lideró el cierre de mes sin un solo error. Impecable.",
  "Resolvió el incidente de soporte en tiempo récord.",
  "Excelente acompañamiento al equipo de soporte.",
  "Propuso una mejora que nos ahorró horas de trabajo manual.",
];

const denunciasSeed = [
  { tipo: "Conflicto laboral" as const, titulo: "Diferencias de turnos en punto de venta", estado: "En revisión" as const, fecha: "2026-05-18", anonimo: true, pais: "BO" as const },
  { tipo: "Sugerencia" as const, titulo: "Propuesta de horario flexible los viernes", estado: "Nueva" as const, fecha: "2026-05-16", anonimo: false, pais: "CL" as const },
  { tipo: "Acoso o intimidación" as const, titulo: "Reporte confidencial", estado: "En revisión" as const, fecha: "2026-05-11", anonimo: true, pais: "AR" as const },
  { tipo: "Reconocimiento" as const, titulo: "Agradecimiento al equipo de soporte", estado: "Resuelta" as const, fecha: "2026-05-04", anonimo: false, pais: "EC" as const },
  { tipo: "Conflicto laboral" as const, titulo: "Carga de trabajo en cierre de mes", estado: "Resuelta" as const, fecha: "2026-04-28", anonimo: true, pais: "BO" as const },
];

const leaveTiposCiclo = ["Vacaciones", "Enfermedad", "Permiso personal", "Matrimonio", "Día administrativo"];
const leaveEstadosCiclo = ["Pendiente", "Pendiente", "Pendiente", "Aprobado", "Rechazado"] as const;
const leaveHistTiposCiclo = ["Vacaciones", "Enfermedad", "Permiso personal", "Matrimonio", "Cumpleaños", "Home Office", "Día administrativo"];
const leaveHistEstadosCiclo = ["Aprobado", "Aprobado", "Aprobado", "Aprobado", "Rechazado"] as const;
const periodosHist: [number, number][] = [[2025, 11], [2025, 12], [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 5]];

// Phase 2: picks a plausible seeded employee to back a login user for a given
// role. Not trying to be clever — a role-appropriate department/title match
// if one exists, first not-yet-used active employee otherwise.
function pickEmployeeIdForRole(
  roleKey: string,
  gen: GenEmployee[],
  employeeIds: string[],
  used: Set<string>,
): string {
  const candidates: number[] = [];
  if (roleKey === "supervisor") {
    const supervised = new Set(gen.map((e) => e.supervisorIdx).filter((i): i is number => i !== null));
    candidates.push(...Array.from(supervised));
  } else if (roleKey === "jefe") {
    gen.forEach((e, i) => { if (/Jefe|Líder/.test(e.puesto)) candidates.push(i); });
  } else if (roleKey === "nomina") {
    gen.forEach((e, i) => { if (e.departamento === "Administración & Finanzas") candidates.push(i); });
  } else if (roleKey === "analista") {
    gen.forEach((e, i) => { if (e.departamento === "Recursos Humanos") candidates.push(i); });
  }
  gen.forEach((e, i) => { if (e.estado === "Activo") candidates.push(i); }); // fallback pool
  const idx = candidates.find((i) => !used.has(employeeIds[i])) ?? 0;
  used.add(employeeIds[idx]);
  return employeeIds[idx];
}

type Db = ReturnType<typeof makeDb>;

async function seedTenant(db: Db, opts: { slug: string; nombre: string; employeeSeed: number; employeeCount: number }) {
  const [tenant] = await db.insert(schema.tenants).values({ slug: opts.slug, nombre: opts.nombre }).returning();
  const tenantId = tenant.id;

  // Roles + matrix + field permissions.
  const roleIdByKey = new Map<string, string>();
  for (const r of rolesSeed) {
    const [row] = await db
      .insert(schema.roles)
      .values({ tenantId, roleKey: r.key, nombre: r.nombre, descripcion: r.descripcion, color: r.color })
      .returning();
    roleIdByKey.set(r.key, row.id);
  }
  const rolePermRows: (typeof schema.rolePermissions.$inferInsert)[] = [];
  for (const [roleKey, perModulo] of Object.entries(matrix)) {
    const roleId = roleIdByKey.get(roleKey)!;
    for (const [modulo, acciones] of Object.entries(perModulo)) {
      for (const accion of acciones as Accion[]) {
        rolePermRows.push({ tenantId, roleId, modulo: modulo as Modulo, accion });
      }
    }
  }
  if (rolePermRows.length) await db.insert(schema.rolePermissions).values(rolePermRows);

  const fieldPermRows: (typeof schema.fieldPermissions.$inferInsert)[] = [];
  for (const fp of fieldPermissionsSeed) {
    for (const roleKey of fp.roles) {
      fieldPermRows.push({ tenantId, campo: fp.campo, modulo: fp.modulo, roleId: roleIdByKey.get(roleKey)! });
    }
  }
  await db.insert(schema.fieldPermissions).values(fieldPermRows);

  // Leave types (per-country rules).
  const leaveTypeRows: (typeof schema.leaveTypes.$inferInsert)[] = [];
  for (const [pais, tipos] of Object.entries(leaveRulesByCountry) as [Country, typeof leaveRulesByCountry.BO][]) {
    for (const t of tipos) leaveTypeRows.push({ tenantId, pais, nombre: t.nombre, dias: String(t.dias), color: t.color });
  }
  await db.insert(schema.leaveTypes).values(leaveTypeRows);

  // Employees.
  const gen = generateEmployees(opts.employeeSeed, opts.employeeCount);
  const empValues = gen.map((e) => ({
    tenantId,
    employeeCode: e.employeeCode,
    nombre: e.nombre,
    puesto: e.puesto,
    departamento: e.departamento,
    centroCosto: e.centroCosto,
    sede: e.sede,
    pais: e.pais,
    ciudad: e.ciudad,
    estado: e.estado,
    email: e.email,
    telefono: e.telefono,
    ingreso: e.ingreso,
    cumple: e.cumple,
    salario: String(e.salario),
    iniciales: e.iniciales,
    avatar: e.avatar,
  }));
  const insertedEmployees = await db.insert(schema.employees).values(empValues).returning();
  const employeeIds = insertedEmployees.map((e) => e.id);

  // Wire up supervisor FKs (index-based, computed during generation).
  for (let i = 0; i < gen.length; i++) {
    const supIdx = gen[i].supervisorIdx;
    if (supIdx === null) continue;
    await db.update(schema.employees).set({ supervisorId: employeeIds[supIdx] }).where(sql`${schema.employees.id} = ${employeeIds[i]}`);
  }

  // Login users (Phase 2): one per role, password from SEED_USER_PASSWORD
  // (default below), linked to a real seeded employee. Same hash reused for
  // all of them since it's the same password — argon2 salts internally.
  const seedPassword = process.env.SEED_USER_PASSWORD ?? "changeme123";
  const passwordHash = await argon2.hash(seedPassword);
  const usedEmployeeIds = new Set<string>();
  const userRows: (typeof schema.users.$inferInsert)[] = rolesSeed.map((r) => ({
    tenantId,
    email: `${r.key}@${opts.slug}.test`,
    passwordHash,
    roleId: roleIdByKey.get(r.key)!,
    employeeId: pickEmployeeIdForRole(r.key, gen, employeeIds, usedEmployeeIds),
  }));
  const insertedUsers = await db.insert(schema.users).values(userRows).returning();
  for (const u of insertedUsers) {
    if (u.employeeId) {
      await db.update(schema.employees).set({ userId: u.id }).where(sql`${schema.employees.id} = ${u.employeeId}`);
    }
  }

  const activeIdx = gen.map((e, i) => (e.estado === "Activo" ? i : -1)).filter((i) => i >= 0);
  const activeIds = activeIdx.map((i) => employeeIds[i]);

  // Leave requests: a "pending/recent" slice + a resolved "history" batch —
  // both are just LeaveRequest rows (mock's `leaveRequests` + `leaveHistory`).
  const leaveReqRows: (typeof schema.leaveRequests.$inferInsert)[] = [];
  const pendingSample = activeIdx.slice(3, 25);
  pendingSample.forEach((idx, i) => {
    const e = gen[idx];
    const dias = [1, 3, 5, 6, 7, 10, 15][i % 7];
    const d1 = 4 + ((i * 3) % 22);
    const month = 5 + (i % 4);
    const tipo = leaveTiposCiclo[i % leaveTiposCiclo.length];
    leaveReqRows.push({
      tenantId,
      employeeId: employeeIds[idx],
      tipo,
      desde: `2026-${String(month).padStart(2, "0")}-${String(d1).padStart(2, "0")}`,
      hasta: `2026-${String(month).padStart(2, "0")}-${String(Math.min(d1 + dias, 28)).padStart(2, "0")}`,
      dias: String(dias),
      saldo: String([0.5, 2.81, 5, 7, 10, 14, 15][i % 7]),
      estado: leaveEstadosCiclo[i % leaveEstadosCiclo.length],
      comentario: `Solicitud de ${tipo.toLowerCase()} de ${e.nombre}.`,
    });
  });
  for (let i = 0; i < 140 && activeIds.length; i++) {
    const empId = activeIds[(i * 13 + 7) % activeIds.length];
    const tipo = leaveHistTiposCiclo[i % leaveHistTiposCiclo.length];
    const dias = [1, 1, 2, 3, 5, 7, 10, 15][i % 8];
    const [year, month] = periodosHist[i % periodosHist.length];
    const d1 = 2 + ((i * 5) % 24);
    leaveReqRows.push({
      tenantId,
      employeeId: empId,
      tipo,
      desde: `${year}-${String(month).padStart(2, "0")}-${String(d1).padStart(2, "0")}`,
      hasta: `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d1 + dias, 28)).padStart(2, "0")}`,
      dias: String(dias),
      saldo: "0",
      estado: leaveHistEstadosCiclo[i % leaveHistEstadosCiclo.length],
    });
  }
  if (leaveReqRows.length) await db.insert(schema.leaveRequests).values(leaveReqRows);

  // Leave balances: one row per employee per leave type valid in their país.
  const balanceRows: (typeof schema.leaveBalances.$inferInsert)[] = [];
  gen.forEach((e, i) => {
    const tipos = leaveRulesByCountry[e.pais];
    tipos.forEach((t, j) => {
      const usado = Math.round(t.dias * (((i * 7 + j * 3) % 10) / 10) * 100) / 100;
      balanceRows.push({ tenantId, employeeId: employeeIds[i], tipo: t.nombre, total: String(t.dias), usado: String(usado), color: t.color });
    });
  });
  if (balanceRows.length) await db.insert(schema.leaveBalances).values(balanceRows);

  // Payroll (one period, active employees only — ports buildPayroll()).
  const payrollRows: (typeof schema.payrollRows.$inferInsert)[] = activeIdx.map((idx) => {
    const e = gen[idx];
    const bonos = Math.round(e.salario * (/Comercial|Ventas|KAM/.test(e.puesto) ? 0.18 : 0.06));
    const descuentos = Math.round((e.salario + bonos) * 0.135);
    const aportes = Math.round((e.salario + bonos) * aportePatronalByCountry[e.pais]);
    return {
      tenantId,
      employeeId: employeeIds[idx],
      periodo: PERIODO,
      bruto: String(e.salario),
      bonos: String(bonos),
      descuentos: String(descuentos),
      neto: String(e.salario + bonos - descuentos),
      aportes: String(aportes),
      costoCompania: String(e.salario + bonos + aportes),
    };
  });
  if (payrollRows.length) await db.insert(schema.payrollRows).values(payrollRows);

  // OKRs.
  for (const obj of objetivosSeed) {
    const [objRow] = await db
      .insert(schema.objectives)
      .values({ tenantId, nombre: obj.nombre, owner: obj.owner, iniciales: obj.iniciales, nivel: obj.nivel, vencimiento: obj.vencimiento, prioridad: obj.prioridad })
      .returning();
    for (const kr of obj.krs) {
      const [krRow] = await db
        .insert(schema.keyResults)
        .values({ tenantId, objectiveId: objRow.id, nombre: kr.nombre, owner: kr.owner, metrica: kr.metrica, prioridad: kr.prioridad })
        .returning();
      await db.insert(schema.keyResultQuarters).values(
        kr.trimestres.map((q) => ({ tenantId, keyResultId: krRow.id, trimestre: q.t, peso: String(q.peso), avance: String(q.avance) })),
      );
    }
  }

  // Engagement: campaigns, eNPS trend, templates, recognitions, denuncias.
  await db.insert(schema.surveyCampaigns).values(campañasSeed.map((c) => ({ tenantId, ...c, participacion: String(c.participacion) })));
  await db.insert(schema.enpsSnapshots).values(
    enpsTrendSeed.map((s, i) => ({
      tenantId,
      mes: s.mes,
      score: s.score,
      ...(i === enpsTrendSeed.length - 1 ? enpsOverall : {}),
    })),
  );
  await db.insert(schema.surveyTemplates).values(plantillasSeed.map((p) => ({ tenantId, ...p })));

  if (activeIds.length) {
    const recognitionRows = activeIdx.slice(30, 38).map((idx, i) => {
      const deIdx = activeIdx[(i * 7 + 3) % activeIdx.length];
      return {
        tenantId,
        deEmployeeId: employeeIds[deIdx],
        paraEmployeeId: employeeIds[idx],
        mensaje: mensajesReconocimiento[i % mensajesReconocimiento.length],
        estrellas: 3 + (i % 3),
      };
    });
    if (recognitionRows.length) await db.insert(schema.recognitions).values(recognitionRows);
  }

  await db.insert(schema.denuncias).values(denunciasSeed.map((d) => ({ tenantId, ...d })));

  return { tenantId, employeeCount: employeeIds.length, roleCount: rolesSeed.length, userCount: insertedUsers.length };
}

async function main() {
  const db = makeDb(ADMIN_DATABASE_URL);

  // Idempotent reseed: wipe tenant-owned data (fresh dev DB assumed).
  console.log("Clearing existing tenant data...");
  await db.execute(sql`
    TRUNCATE TABLE
      notifications, denuncias, recognitions, survey_templates, enps_snapshots, survey_campaigns,
      key_result_quarters, key_results, objectives,
      payroll_rows, leave_balances, leave_requests, leave_types,
      field_permissions, role_permissions,
      sessions, users, employees, roles, tenants
    RESTART IDENTITY CASCADE
  `);

  console.log("Seeding nortania (312 employees)...");
  const nortania = await seedTenant(db, { slug: "nortania", nombre: "Nortania", employeeSeed: 73, employeeCount: 312 });
  console.log("nortania:", nortania);

  console.log("Seeding demo (12 employees)...");
  const demo = await seedTenant(db, { slug: "demo", nombre: "Demo Co.", employeeSeed: 1337, employeeCount: 12 });
  console.log("demo:", demo);

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
