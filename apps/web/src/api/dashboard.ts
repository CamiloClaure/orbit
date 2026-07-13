import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export interface DashboardPayrollTotals {
  bruto: number
  bonos: number
  descuentos: number
  neto: number
  aportes: number
  costoCompania: number
}

export interface DashboardResponse {
  headcount: number
  deptDistribution: { departamento: string; total: number }[]
  headcountTrend: { mes: string; altas: number; headcount: number }[]
  payroll: DashboardPayrollTotals | null
  topReconocidos: { employeeId: string; nombre: string; total: number }[]
}

interface RawPayrollTotals {
  bruto: string
  bonos: string
  descuentos: string
  neto: string
  aportes: string
  costoCompania: string
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get<Omit<DashboardResponse, 'payroll'> & { payroll: RawPayrollTotals | null }>('/dashboard')
      const payroll = res.payroll
        ? {
            bruto: Number(res.payroll.bruto),
            bonos: Number(res.payroll.bonos),
            descuentos: Number(res.payroll.descuentos),
            neto: Number(res.payroll.neto),
            aportes: Number(res.payroll.aportes),
            costoCompania: Number(res.payroll.costoCompania),
          }
        : null
      return { ...res, payroll } as DashboardResponse
    },
  })
}
