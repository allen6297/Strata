import { Input } from '@/components/ui/input'
import {
  filterNodeKinds,
  nodeKindsForMode,
  type NodeKindDef,
} from '@/lib/node-kinds'
import { nodeKindIcon } from '@/lib/node-kind-icon'
import type { ScriptNodeDef } from '@/lib/rosegold-nodes'
import { cn } from '@/lib/utils'
import type { EntityKind, SceneMode } from '@/types/scene'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

export type AddNodeScriptPick = {
  scriptId: string
  scriptPath: string
  className: string
}

type PickerRow = {
  key: string
  kind: EntityKind
  label: string
  description: string
  script?: AddNodeScriptPick
}

function filterScriptNodes(nodes: ScriptNodeDef[], query: string): ScriptNodeDef[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  return nodes.filter((n) => {
    const hay = `${n.name} ${n.parent} ${n.kind} ${n.doc ?? ''} ${n.scriptPath}`.toLowerCase()
    return hay.includes(q)
  })
}

export function AddNodePicker({
  mode,
  x,
  y,
  scriptNodes = [],
  onClose,
  onPick,
}: {
  mode: SceneMode
  x: number
  y: number
  scriptNodes?: ScriptNodeDef[]
  onClose: () => void
  onPick: (kind: EntityKind, script?: AddNodeScriptPick) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const builtins = useMemo(
    () => filterNodeKinds(nodeKindsForMode(mode), query),
    [mode, query],
  )
  const scripts = useMemo(
    () => filterScriptNodes(scriptNodes, query),
    [scriptNodes, query],
  )

  const rows: PickerRow[] = useMemo(() => {
    const out: PickerRow[] = builtins.map((d) => ({
      key: `kind:${d.kind}`,
      kind: d.kind,
      label: d.label,
      description: d.description,
    }))
    for (const n of scripts) {
      out.push({
        key: `script:${n.scriptId}:${n.name}`,
        kind: n.kind,
        label: n.name,
        description: `${n.parent} · ${n.scriptPath}`,
        script: {
          scriptId: n.scriptId,
          scriptPath: n.scriptPath,
          className: n.name,
        },
      })
    }
    return out
  }, [builtins, scripts])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    })
  }, [x, y, rows.length, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!rows.length) return
        setActive((i) => Math.min(rows.length - 1, i + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (!rows.length) return
        setActive((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'Enter') {
        const pick = rows[active]
        if (pick) {
          e.preventDefault()
          onPick(pick.kind, pick.script)
        }
      }
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [active, rows, onClose, onPick])

  const builtinCount = builtins.length

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Add node"
      data-testid="add-node-picker"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[80] w-[17.5rem] rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-1.5 shadow-xl"
    >
      <Input
        ref={inputRef}
        value={query}
        data-testid="add-node-filter"
        placeholder="Filter nodes…"
        className="mb-1.5 h-7"
        onChange={(e) => setQuery(e.target.value)}
      />
      <div role="listbox" aria-label="Node types" className="max-h-[18rem] overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-[var(--text-muted)]">
            No matching nodes
          </p>
        ) : (
          <>
            {builtins.map((def, i) => (
              <NodeRow
                key={`kind:${def.kind}`}
                def={def}
                active={i === active}
                onHover={() => setActive(i)}
                onPick={() => onPick(def.kind)}
              />
            ))}
            {scripts.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Scripts
                </p>
                {scripts.map((n, i) => {
                  const idx = builtinCount + i
                  return (
                    <NodeRow
                      key={`script:${n.scriptId}:${n.name}`}
                      def={{
                        kind: n.kind,
                        label: n.name,
                        description: `${n.parent} · ${n.scriptPath}`,
                        modes: [],
                        keywords: '',
                      }}
                      active={idx === active}
                      onHover={() => setActive(idx)}
                      onPick={() =>
                        onPick(n.kind, {
                          scriptId: n.scriptId,
                          scriptPath: n.scriptPath,
                          className: n.name,
                        })
                      }
                    />
                  )
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function NodeRow({
  def,
  active,
  onHover,
  onPick,
}: {
  def: NodeKindDef
  active: boolean
  onHover: () => void
  onPick: () => void
}) {
  const Icon = nodeKindIcon(def.kind)
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-testid={`add-${def.kind}`}
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left',
        active
          ? 'bg-[var(--select)] text-[var(--text)]'
          : 'text-[var(--text)] hover:bg-[var(--bg-hover)]',
      )}
      onMouseEnter={onHover}
      onClick={onPick}
    >
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[var(--accent-dim)]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium leading-tight">
          {def.label}
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-[var(--text-muted)]">
          {def.description}
        </span>
      </span>
    </button>
  )
}
