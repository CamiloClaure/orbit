// Country display metadata (flags/labels/cities) — extracted from the old
// data/employees.ts mock so it survives that file's deletion in Phase 4.
// This is UI presentation data, not a mock API record, so it's not something
// an API endpoint replaces.
export type Country = 'BO' | 'CL' | 'EC' | 'AR' | 'PY'

export interface CountryMeta {
  code: Country
  nombre: string
  bandera: string
  ciudades: string[]
}

export const countries: Record<Country, CountryMeta> = {
  BO: { code: 'BO', nombre: 'Bolivia', bandera: '🇧🇴', ciudades: ['Santa Cruz', 'La Paz', 'Cochabamba'] },
  CL: { code: 'CL', nombre: 'Chile', bandera: '🇨🇱', ciudades: ['Santiago', 'Valparaíso', 'Concepción'] },
  EC: { code: 'EC', nombre: 'Ecuador', bandera: '🇪🇨', ciudades: ['Quito', 'Guayaquil', 'Cuenca'] },
  AR: { code: 'AR', nombre: 'Argentina', bandera: '🇦🇷', ciudades: ['Buenos Aires', 'Córdoba', 'Rosario'] },
  PY: { code: 'PY', nombre: 'Paraguay', bandera: '🇵🇾', ciudades: ['Asunción', 'Ciudad del Este', 'Encarnación'] },
}

export const countryList = Object.values(countries)
