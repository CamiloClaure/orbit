import { useQuery } from '@tanstack/react-query'
import type { SurveyCampaign, EnpsSnapshot, SurveyTemplate } from '@orbit/shared'
import { api } from './client'

export function useCampaigns() {
  return useQuery({
    queryKey: ['engagement', 'campaigns'],
    queryFn: () => api.get<SurveyCampaign[]>('/engagement/campaigns'),
  })
}

export function useEnpsSnapshots() {
  return useQuery({
    queryKey: ['engagement', 'enps'],
    queryFn: () => api.get<EnpsSnapshot[]>('/engagement/enps'),
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: ['engagement', 'templates'],
    queryFn: () => api.get<SurveyTemplate[]>('/engagement/templates'),
  })
}
