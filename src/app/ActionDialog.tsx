import type { ReactNode } from 'react'

import { AlertTriangle, Info, TriangleAlert } from 'lucide-react'

type ActionDialogTone = 'default' | 'danger' | 'warning'
type ActionDialogActionTone = 'default' | 'primary' | 'danger'

export type ActionDialogAction = {
  label: string
  onClick: () => void | Promise<void>
  tone?: ActionDialogActionTone
}

export interface ActionDialogProps {
  ariaLabel: string
  title: string
  description?: string
  tone?: ActionDialogTone
  children?: ReactNode
  actions: ActionDialogAction[]
}

function getDialogIcon(tone: ActionDialogTone) {
  switch (tone) {
    case 'danger':
      return AlertTriangle
    case 'warning':
      return TriangleAlert
    case 'default':
    default:
      return Info
  }
}

export function ActionDialog({
  ariaLabel,
  title,
  description,
  tone = 'default',
  children,
  actions,
}: ActionDialogProps) {
  const Icon = getDialogIcon(tone)

  return (
    <div className="app-dialog__backdrop" role="presentation">
      <div className="app-dialog" role="dialog" aria-modal="true" aria-label={ariaLabel} data-tone={tone}>
        <div className="app-dialog__header">
          <div className="app-dialog__icon" aria-hidden="true" data-tone={tone}>
            <Icon size={18} strokeWidth={2.2} />
          </div>
          <div className="app-dialog__heading-group">
            <h2 className="app-dialog__title">{title}</h2>
            {description ? <p className="app-dialog__description">{description}</p> : null}
          </div>
        </div>
        {children ? <div className="app-dialog__body">{children}</div> : null}
        <div className="app-dialog__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="app-dialog__action"
              data-tone={action.tone ?? 'default'}
              onClick={() => void action.onClick()}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
