import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'default' | 'ghost' | 'accent' | 'danger' | 'toolbar'
type Size = 'sm' | 'md' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  active?: boolean
}

const variants: Record<Variant, string> = {
  default:
    'bg-[var(--bg-panel-raised)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[#2a2f39]',
  ghost:
    'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-panel-raised)]',
  accent:
    'bg-[var(--accent)] text-[#0b1211] border border-transparent hover:bg-[#4ac9b8] font-semibold',
  danger:
    'bg-transparent text-[var(--danger)] hover:bg-[rgba(224,108,117,0.12)]',
  toolbar:
    'bg-transparent text-[var(--text-muted)] border border-transparent hover:text-[var(--text)] hover:bg-[var(--bg-panel-raised)]',
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  icon: 'h-7 w-7 p-0 justify-center',
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  active,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center rounded-md transition-colors disabled:opacity-40 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        active &&
          'bg-[var(--select)] text-[var(--accent)] border-[var(--accent-dim)]',
        className,
      )}
      {...props}
    />
  )
}
