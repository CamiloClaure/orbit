import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Recognition, RecognitionInput, Denuncia, DenunciaInput, Employee } from '@orbit/shared'
import { api } from './client'

export function useRecognitions() {
  return useQuery({
    queryKey: ['voz', 'recognitions'],
    queryFn: () => api.get<Recognition[]>('/voz/recognitions'),
  })
}

export function useCreateRecognition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RecognitionInput) => api.post<Recognition>('/voz/recognitions', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voz', 'recognitions'] }),
  })
}

// Restricted read — a 403 here for most roles is expected (see routes.ts),
// callers should treat ApiError(403) as "not visible to me", not a failure.
export function useDenuncias() {
  return useQuery({
    queryKey: ['voz', 'denuncias'],
    queryFn: () => api.get<Denuncia[]>('/voz/denuncias'),
    retry: false,
  })
}

// Anonymous by design — DenunciaInput carries no author field, ever.
export function useCreateDenuncia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: DenunciaInput) => api.post<Denuncia>('/voz/denuncias', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voz', 'denuncias'] }),
  })
}

// ponytail: /employees is owned by another in-flight agent but is stable and
// listed as safe to call once for a picker; reused here to resolve
// deEmployeeId/paraEmployeeId -> display name/iniciales/avatar for the
// recognitions feed and top-reconocidos ranking (both only carry ids).
// pageSize 100 covers this seed's headcount; paginate if that stops holding.
export function useEmployeesLookup() {
  const query = useQuery({
    queryKey: ['employees', 'lookup'],
    queryFn: () => api.get<{ data: Employee[] }>('/employees?pageSize=100'),
  })
  const byId = useMemo(() => {
    const map = new Map<string, Employee>()
    for (const e of query.data?.data ?? []) map.set(e.id, e)
    return map
  }, [query.data])
  return { ...query, byId }
}

export interface TopReconocido {
  employeeId: string
  nombre: string
  total: number
}

// /dashboard (different in-flight agent, stable/read-only) already computes
// a top-5 reconocidos ranking server-side — reuse it instead of grouping
// recognitions client-side.
export function useTopReconocidos() {
  return useQuery({
    queryKey: ['dashboard', 'top-reconocidos'],
    queryFn: async () => (await api.get<{ topReconocidos: TopReconocido[] }>('/dashboard')).topReconocidos,
  })
}
