import { cn } from '@/lib/utils'
import type { InputHTMLAttributes } from 'react'

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-7 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-dim)]',
        className,
      )}
      {...props}
    />
  )
}
