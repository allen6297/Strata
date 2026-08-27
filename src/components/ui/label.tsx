import { cn } from '@/lib/utils'
import type { LabelHTMLAttributes } from 'react'

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]',
        className,
      )}
      {...props}
    />
  )
}
