import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

interface ScriptEditorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  onRun?: () => void
}

export function ScriptEditor({
  value,
  onChange,
  disabled,
  placeholder,
  onRun,
}: ScriptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lineCount = value.split('\n').length || 1
  const [cursor, setCursor] = useState({ line: 1, col: 1 })

  const updateCursor = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const before = el.value.slice(0, el.selectionStart)
    const lines = before.split('\n')
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 })
  }, [])

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current
    const gutter = gutterRef.current
    if (!textarea || !gutter) return
    gutter.scrollTop = textarea.scrollTop
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        onRun?.()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const el = e.currentTarget
        const start = el.selectionStart
        const end = el.selectionEnd
        const next = value.slice(0, start) + '  ' + value.slice(end)
        onChange(next)
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + 2
          updateCursor()
        })
      }
    },
    [onRun, value, onChange, updateCursor],
  )

  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={gutterRef}
          className="flex min-h-0 w-10 shrink-0 select-none flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg-panel)] py-3 text-right font-mono text-xs leading-relaxed text-[var(--text-muted)]"
          aria-hidden="true"
        >
          {lineNumbers.map((n) => (
            <div key={n} className="px-2">
              {n}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          onClick={updateCursor}
          onKeyUp={updateCursor}
          onSelect={updateCursor}
          placeholder={placeholder}
          className={cn(
            'min-h-0 flex-1 resize-none border-0 bg-[var(--bg-input)] p-3 font-mono text-xs leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        />
      </div>
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-panel)] px-3 text-[10px] text-[var(--text-muted)]">
        <span className="font-mono">
          Ln {cursor.line}, Col {cursor.col}
        </span>
        <span className="font-mono">{value.length} chars</span>
        <span className="ml-auto font-mono">
          {onRun ? `${isMac ? 'Cmd' : 'Ctrl'}+Enter to run` : ''}
        </span>
      </div>
    </div>
  )
}
