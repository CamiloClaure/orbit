import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LoginRequest, MeResponse } from '@orbit/shared'
import { api, ApiError } from './client'

export function useMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<MeResponse>('/auth/me'),
    retry: false,
    // 401 just means "not logged in" — not an error state the UI should retry/alert on.
    throwOnError: (err) => !(err instanceof ApiError && err.status === 401),
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LoginRequest) => api.post('/auth/login', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })
}
