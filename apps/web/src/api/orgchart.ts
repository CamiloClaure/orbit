import { useQuery } from '@tanstack/react-query'
import type { CountryCode } from '@orbit/shared'
import { api } from './client'

export interface OrgNode {
  id: string
  employeeCode: string
  nombre: string
  puesto: string
  departamento: string
  pais: CountryCode
  iniciales: string
  avatar: string
  children: OrgNode[]
  /** Reportes directos + indirectos. */
  total: number
}

export function useOrgchart() {
  return useQuery({
    queryKey: ['orgchart'],
    queryFn: () => api.get<{ roots: OrgNode[] }>('/orgchart'),
  })
}
