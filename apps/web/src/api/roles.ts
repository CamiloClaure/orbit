import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export const modulos = [
  'Empleados',
  'Permisos',
  'Nómina',
  'OKRs',
  'Desempeño',
  'Reportes',
  'Encuestas',
  'Roles y permisos',
] as const
export type Modulo = (typeof modulos)[number]

export const acciones = ['Ver', 'Crear', 'Editar', 'Aprobar', 'Eliminar'] as const
export type Accion = (typeof acciones)[number]

export interface Role {
  id: string
  nombre: string
  descripcion: string
  color: string
  usuarios: number
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Role[]>('/roles'),
  })
}

// { [roleId]: { [modulo]: accion[] } } — see apps/api/src/modules/roles/routes.ts.
export type PermissionMatrix = Record<string, Partial<Record<Modulo, Accion[]>>>

export function useRolesMatrix() {
  return useQuery({
    queryKey: ['roles', 'matrix'],
    queryFn: () => api.get<PermissionMatrix>('/roles/matrix'),
  })
}

// No optimistic cache surgery — a toggle is a single click on an admin-only
// page, a refetch-on-success is simpler and plenty fast at this data size.
export function useTogglePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roleId, modulo, accion, granted }: { roleId: string; modulo: Modulo; accion: Accion; granted: boolean }) =>
      api.put(`/roles/${roleId}/permissions`, { modulo, accion, granted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles', 'matrix'] }),
  })
}

export interface FieldPermission {
  campo: string
  modulo: Modulo
  roleIds: string[]
}

export function useFieldPermissions() {
  return useQuery({
    queryKey: ['roles', 'field-permissions'],
    queryFn: () => api.get<FieldPermission[]>('/roles/field-permissions'),
  })
}

export interface AuditEntry {
  userId: string
  employeeId: string
  nombre: string
  iniciales: string
  avatar: string
  pais: string
  departamento: string
  puesto: string
  rolActualId: string
  rolActualNombre: string
  rolSugeridoId: string
  rolSugeridoNombre: string
}

export function useRolesAudit() {
  return useQuery({
    queryKey: ['roles', 'audit'],
    queryFn: () => api.get<AuditEntry[]>('/roles/audit'),
  })
}

export function useApplyAudit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userIds?: string[]) => api.post<{ updated: string[] }>('/roles/audit/apply', userIds ? { userIds } : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', 'audit'] })
      qc.invalidateQueries({ queryKey: ['roles'] }) // usuarios counts per role changed
    },
  })
}
