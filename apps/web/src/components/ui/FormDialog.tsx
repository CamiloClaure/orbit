import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Loader2, Paperclip, X } from 'lucide-react'
import { Modal } from './Modal'
import { AnimatedCheck } from './AnimatedCheck'
import { Button } from './Button'
import { useToast } from './toast'
import { cn } from '@/lib/cn'

export interface FormField {
  name: string
  label: string
  type?: 'text' | 'email' | 'number' | 'date' | 'textarea' | 'select' | 'file'
  placeholder?: string
  options?: { value: string; label: string }[]
  defaultValue?: string
  full?: boolean
  hint?: string
}

/** Campo de adjunto (mock: muestra el nombre del archivo, sin subida real). */
function FileInput({ placeholder }: { placeholder?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [name, setName] = useState<string | null>(null)
  return (
    <div>
      <input
        ref={ref}
        type="file"
        className="hidden"
        onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
      />
      {name ? (
        <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5">
          <Paperclip size={15} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{name}</span>
          <button
            type="button"
            onClick={() => {
              setName(null)
              if (ref.current) ref.current.value = ''
            }}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/[0.08] hover:text-fg"
            aria-label="Quitar archivo"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line bg-card px-3 py-2.5 text-[13px] text-faint transition-colors hover:border-accent/50 hover:text-muted"
        >
          <Paperclip size={15} />
          {placeholder ?? 'Adjuntar archivo'}
        </button>
      )}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-line bg-card px-3 py-2.5 text-[13.5px] text-fg placeholder:text-faint transition-colors focus:border-accent/60 focus:outline-none'

export function FormDialog({
  open,
  onClose,
  title,
  description,
  icon,
  fields,
  submitLabel = 'Guardar',
  successTitle = 'Listo',
  successDescription,
  width = 560,
  onSubmit,
  validate,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  icon?: ReactNode
  fields: FormField[]
  submitLabel?: string
  successTitle?: string
  successDescription?: string
  width?: number
  /** Called with the collected field values. Rejecting shows an error toast and keeps the form open. Omit to keep the old toast-only demo behavior. */
  onSubmit?: (values: Record<string, string>) => Promise<void>
  /** Runs before onSubmit. Return field-level errors to block submission and show them inline instead of hitting the network. */
  validate?: (values: Record<string, string>) => { success: true } | { success: false; fieldErrors: Record<string, string> }
}) {
  const toast = useToast()
  const [phase, setPhase] = useState<'form' | 'saving' | 'done'>('form')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setPhase('form')
      setFieldErrors({})
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!onSubmit) {
      setPhase('saving')
      setTimeout(() => {
        setPhase('done')
        setTimeout(() => {
          onClose()
          toast.success(successTitle, successDescription)
        }, 1150)
      }, 750)
      return
    }

    const values = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>

    if (validate) {
      const result = validate(values)
      if (!result.success) {
        setFieldErrors(result.fieldErrors)
        return
      }
    }
    setFieldErrors({})

    setPhase('saving')
    try {
      await onSubmit(values)
      setPhase('done')
      setTimeout(() => {
        onClose()
        toast.success(successTitle, successDescription)
      }, 1150)
    } catch (err) {
      setPhase('form')
      toast.error('No se pudo guardar', err instanceof Error ? err.message : 'Inténtalo de nuevo.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={phase === 'done' ? undefined : title}
      description={phase === 'done' ? undefined : description}
      icon={phase === 'done' ? undefined : icon}
      width={width}
      dismissable={phase === 'form'}
    >
      {phase === 'done' ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <AnimatedCheck />
          <motion.h3
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="mt-5 text-lg font-semibold text-fg"
          >
            {successTitle}
          </motion.h3>
          {successDescription && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="mt-1 max-w-xs text-sm text-muted"
            >
              {successDescription}
            </motion.p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-6 py-5">
            {fields.map((f) => {
              const error = fieldErrors[f.name]
              return (
                <div key={f.name} className={cn(f.full !== false ? '' : '', f.full ? 'col-span-2' : 'col-span-2 sm:col-span-1')}>
                  <label className="mb-1.5 block text-[12.5px] font-medium text-muted">{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea
                      name={f.name}
                      rows={3}
                      placeholder={f.placeholder}
                      defaultValue={f.defaultValue}
                      className={cn(inputCls, 'resize-none', error && 'border-danger/60')}
                    />
                  ) : f.type === 'file' ? (
                    <FileInput placeholder={f.placeholder} />
                  ) : f.type === 'select' ? (
                    <select name={f.name} defaultValue={f.defaultValue} className={cn(inputCls, error && 'border-danger/60')}>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value} className="bg-panel">
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={f.name}
                      type={f.type ?? 'text'}
                      placeholder={f.placeholder}
                      defaultValue={f.defaultValue}
                      className={cn(inputCls, error && 'border-danger/60')}
                    />
                  )}
                  {error ? (
                    <p className="mt-1 text-[11.5px] text-danger">{error}</p>
                  ) : (
                    f.hint && <p className="mt-1 text-[11.5px] text-faint">{f.hint}</p>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={phase === 'saving'}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={phase === 'saving'}>
              {phase === 'saving' ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Guardando…
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
