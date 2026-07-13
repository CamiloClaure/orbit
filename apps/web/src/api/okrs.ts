import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Objective, KeyResult } from '@orbit/shared'
import { api } from './client'

// Server nests krs under each objective and computes `progreso` (weighted
// quarter average for KRs, plain average for objectives) — render it as-is,
// never recompute client-side.
export type ApiKeyResult = KeyResult & { progreso: number }
export type ApiObjective = Omit<Objective, 'krs'> & { krs: ApiKeyResult[]; progreso: number }

export function useObjectives() {
  return useQuery({
    queryKey: ['okrs', 'objectives'],
    queryFn: () => api.get<ApiObjective[]>('/okrs/objectives'),
  })
}

export interface CreateObjectiveInput {
  nombre: string
  owner: string
  iniciales: string
  nivel: Objective['nivel']
  vencimiento: string
  prioridad: Objective['prioridad']
}

export function useCreateObjective() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateObjectiveInput) => api.post<ApiObjective>('/okrs/objectives', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['okrs', 'objectives'] }),
  })
}
