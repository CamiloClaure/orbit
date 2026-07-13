import { useQuery } from '@tanstack/react-query'
import type { PayrollRow } from '@orbit/shared'
import { api } from './client'

// Numeric columns round-trip as strings through postgres-js — convert to numbers.
function normalize(row: PayrollRow): PayrollRow {
  return {
    ...row,
    bruto: Number(row.bruto),
    bonos: Number(row.bonos),
    descuentos: Number(row.descuentos),
    neto: Number(row.neto),
    aportes: Number(row.aportes),
    costoCompania: Number(row.costoCompania),
  }
}

export function usePayroll(periodo?: string) {
  return useQuery({
    queryKey: ['payroll', periodo ?? null],
    queryFn: async () => {
      const rows = await api.get<PayrollRow[]>(`/payroll${periodo ? `?periodo=${periodo}` : ''}`)
      return rows.map(normalize)
    },
  })
}
