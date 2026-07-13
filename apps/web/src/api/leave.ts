import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Employee, LeaveBalance, LeaveRequest, LeaveType } from '@orbit/shared'
import type { Country } from '@/lib/countries'
import { api } from './client'

export function useLeaveTypes(pais: Country) {
  return useQuery({
    queryKey: ['leave', 'types', pais],
    queryFn: () => api.get<LeaveType[]>(`/leave/types?pais=${pais}`),
  })
}

export function useLeaveBalances(employeeId?: string) {
  return useQuery({
    queryKey: ['leave', 'balances', employeeId ?? 'me'],
    queryFn: () => api.get<LeaveBalance[]>(`/leave/balances${employeeId ? `?employeeId=${employeeId}` : ''}`),
  })
}

export function useLeaveRequests(filters?: { employeeId?: string; estado?: string }) {
  const params = new URLSearchParams()
  if (filters?.employeeId) params.set('employeeId', filters.employeeId)
  if (filters?.estado) params.set('estado', filters.estado)
  const qs = params.toString()
  return useQuery({
    queryKey: ['leave', 'requests', filters?.employeeId ?? null, filters?.estado ?? null],
    queryFn: () => api.get<LeaveRequest[]>(`/leave/requests${qs ? `?${qs}` : ''}`),
  })
}

// Backend never accepts a client-supplied `dias` (computed server-side from
// desde/hasta) — @orbit/shared's leaveRequestInputSchema still has it in the
// type, so a local, narrower input type is more honest than importing that one.
export interface CreateLeaveRequestInput {
  employeeId: string
  tipo: string
  desde: string
  hasta: string
  comentario?: string | null
  adjunto?: string | null
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateLeaveRequestInput) => api.post<LeaveRequest>('/leave/requests', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave', 'requests'] })
      qc.invalidateQueries({ queryKey: ['leave', 'balances'] })
    },
  })
}

export function useApproveLeaveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<LeaveRequest>(`/leave/requests/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave', 'requests'] })
      qc.invalidateQueries({ queryKey: ['leave', 'balances'] })
    },
  })
}

export function useRejectLeaveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<LeaveRequest>(`/leave/requests/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'requests'] }),
  })
}

interface EmployeeListResponse {
  data: Employee[]
  total: number
  page: number
  pageSize: number
}

/**
 * Employee display lookup (id -> {nombre, avatar, iniciales, departamento, pais, ...}).
 * Leave endpoints only return raw employeeIds, so every row needing a name/
 * avatar/country joins against this. One GET /employees call, paginated at
 * the API's max pageSize (100) until exhausted, folded into a plain Map —
 * not a caching library, this list is small and reused for the page's lifetime.
 */
export function useEmployeeDirectory() {
  return useQuery({
    queryKey: ['employees', 'directory'],
    queryFn: async () => {
      const pageSize = 100
      let page = 1
      const all: Employee[] = []
      for (;;) {
        const res = await api.get<EmployeeListResponse>(`/employees?page=${page}&pageSize=${pageSize}`)
        all.push(...res.data)
        if (all.length >= res.total || res.data.length < pageSize) break
        page++
      }
      return new Map(all.map((e) => [e.id, e]))
    },
    staleTime: 5 * 60 * 1000,
  })
}
