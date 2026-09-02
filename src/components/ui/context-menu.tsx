import { cn } from '@/lib/utils'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    })
  }, [x, y, children])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    // Skip the opening right-click; WKWebView otherwise dismisses immediately.
    const arm = window.setTimeout(() => {
      window.addEventListener('mousedown', onDown)
    }, 0)
    return () => {
      window.clearTimeout(arm)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-testid="context-menu"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[80] min-w-[12.5rem] rounded-md border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-xl"
    >
      {children}
    </div>,
    document.body,
  )
}

export function MenuItem({
  label,
  icon,
  shortcut,
  danger,
  disabled,
  onSelect,
}: {
  label: string
  icon?: ReactNode
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        'flex h-7 w-full items-center gap-2 px-2.5 text-[11px] disabled:pointer-events-none disabled:opacity-40',
        danger
          ? 'text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]'
          : 'text-[var(--text)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
      )}
      onClick={onSelect}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon ? (
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--text-muted)]">
          {icon}
        </span>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {shortcut ? (
        <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
          {shortcut}
        </span>
      ) : null}
    </button>
  )
}

export function MenuSep() {
  return <div className="my-1 h-px bg-[var(--border)]" role="separator" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
      {children}
    </div>
  )
}
