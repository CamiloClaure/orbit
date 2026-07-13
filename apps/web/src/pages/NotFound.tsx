import { useNavigate } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/** Catch-all for unmatched routes inside the authenticated app shell. */
export function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Error 404" title="Página no encontrada" description="La URL no corresponde a ninguna sección de Orbit." />
      <Card className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Compass size={22} />
        </span>
        <p className="max-w-sm text-[13.5px] text-muted">Revisa la dirección o vuelve al panel principal.</p>
        <Button variant="primary" onClick={() => navigate('/')}>
          Ir al inicio
        </Button>
      </Card>
    </div>
  )
}
