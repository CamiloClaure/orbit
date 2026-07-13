import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Employee, EmployeeInput } from '@orbit/shared'
import { api } from './client'

export interface EmployeeFilters {
  departamento?: string
  estado?: Employee['estado']
  pais?: Employee['pais']
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface EmployeeListResponse {
  data: Employee[]
  total: number
  page: number
  pageSize: number
}

function qs(filters: EmployeeFilters): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

/** Server-side filter/sort/paginate — matches the shape TanStack Table's server-side pagination model sends. */
export function useEmployees(filters: EmployeeFilters = {}) {
  return useQuery({
    queryKey: ['employees', filters],
    queryFn: () => api.get<EmployeeListResponse>(`/employees${qs(filters)}`),
    placeholderData: keepPreviousData, // keep showing the current page while the next one loads
  })
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: ['employees', 'detail', id],
    queryFn: () => api.get<Employee>(`/employees/${id}`),
    enabled: !!id,
  })
}

export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: EmployeeInput) => api.post<Employee>('/employees', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export function useUpdateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<EmployeeInput> & { id: string }) => api.patch<Employee>(`/employees/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })
}

// ponytail: there's no /employees/departamentos (or similar) endpoint, so the
// department-filter dropdown and "activos" sample are derived from one
// reference page (max pageSize=100) instead of a purpose-built list. With ~7
// departments spread across 312 seeded employees this reliably captures the
// full set, but it's a best-effort ceiling, not a guarantee — add a real
// metadata endpoint if a tenant ever has more variety than fits one page.
export function useEmployeeReference() {
  const query = useEmployees({ estado: 'Activo', pageSize: 100 })
  const activos = query.data?.data ?? []
  const departamentos = Array.from(new Set(activos.map((e) => e.departamento))).sort()
  return { ...query, activos, departamentos }
}
