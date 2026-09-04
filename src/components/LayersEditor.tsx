import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RenderLayer } from '@/types/scene'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

export function LayersEditor({
  layers,
  disabled,
  onChange,
  onDelete,
}: {
  layers: RenderLayer[]
  disabled?: boolean
  onChange: (layers: RenderLayer[]) => void
  onDelete: (id: string) => void
}) {
  const sorted = [...layers].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  )
  const addLayer = () => {
    const order = sorted.length ? Math.max(...sorted.map((l) => l.order)) + 1 : 0
    onChange([
      ...layers,
      {
        id: `layer_${Math.random().toString(36).slice(2, 9)}`,
        name: `Layer ${sorted.length + 1}`,
        order,
      },
    ])
  }
  const move = (id: string, dir: -1 | 1) => {
    const i = sorted.findIndex((l) => l.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= sorted.length) return
    const a = sorted[i]
    const b = sorted[j]
    onChange(
      layers.map((l) =>
        l.id === a.id
          ? { ...l, order: b.order }
          : l.id === b.id
            ? { ...l, order: a.order }
            : l,
      ),
    )
  }
  return (
    <div className="space-y-1.5">
      {sorted.map((l, i) => (
        <div key={l.id} className="flex min-w-0 items-center gap-1">
          <Input
            value={l.name}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                layers.map((x) =>
                  x.id === l.id ? { ...x, name: e.target.value } : x,
                ),
              )
            }
            className="h-7 min-w-0 flex-1 text-[11px]"
          />
          <button
            type="button"
            title="Move back"
            disabled={disabled || i === 0}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
            onClick={() => move(l.id, -1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Move front"
            disabled={disabled || i === sorted.length - 1}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
            onClick={() => move(l.id, 1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete layer"
            disabled={disabled || layers.length <= 1}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)] disabled:opacity-30"
            onClick={() => onDelete(l.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" disabled={disabled} onClick={addLayer}>
        <Plus className="h-3.5 w-3.5" />
        Add layer
      </Button>
    </div>
  )
}
