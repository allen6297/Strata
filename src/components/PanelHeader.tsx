import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelHeaderProps {
  title: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PanelHeader({
  title,
  meta,
  actions,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex h-7 shrink-0 items-center gap-2 border-b border-[var(--border)] px-2.5',
        className,
      )}
    >
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {title}
      </h2>
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        {meta != null && (
          <span className="min-w-0 truncate font-mono text-[10px] text-[var(--text-muted)]">
            {meta}
          </span>
        )}
        {actions}
      </div>
    </div>
  )
}
