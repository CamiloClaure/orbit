import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

/**
 * Confirmation dialog for one-way actions (reject, revoke, etc.) — a thin
 * wrapper around Modal, not a new primitive. Reuse this instead of adding a
 * new confirm() call or another dialog component.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} icon={<AlertTriangle size={18} />} width={420}>
      <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="outline"
          className="!border-danger/40 !text-danger hover:!bg-danger-soft"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
