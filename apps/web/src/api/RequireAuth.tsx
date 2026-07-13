import { Navigate, Outlet } from 'react-router-dom'
import { useMe } from './auth'

export function RequireAuth() {
  const { data, isPending, isError } = useMe()
  if (isPending) return null
  if (isError || !data) return <Navigate to="/login" replace />
  return <Outlet />
}
