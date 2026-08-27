import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Entity } from '@/types/scene'
import type { ReactNode } from 'react'

interface InspectorProps {
  entity: Entity | null
  onChange: (id: string, patch: Partial<Entity>) => void
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function NumInput({
  value,
  onChange,
  step = 1,
  disabled,
  'data-testid': testId,
}: {
  value: number
  onChange: (n: number) => void
  step?: number
  disabled?: boolean
  'data-testid'?: string
}) {
  return (
    <Input
      type="number"
      step={step}
      disabled={disabled}
      data-testid={testId}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      className="font-mono"
    />
  )
}

export function Inspector({ entity, onChange }: InspectorProps) {
  if (!entity) {
    return (
      <aside className="panel-animate flex h-full w-64 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="flex h-8 items-center border-b border-[var(--border)] px-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Inspector
          </h2>
        </div>
        <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
          Select an entity in the hierarchy or viewport to edit its properties.
        </p>
      </aside>
    )
  }

  const patch = (p: Partial<Entity>) => onChange(entity.id, p)
  const disabled = entity.locked

  return (
    <aside className="panel-animate flex h-full min-h-0 w-64 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="flex h-8 items-center border-b border-[var(--border)] px-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Inspector
        </h2>
        <span className="ml-auto rounded bg-[var(--bg-panel-raised)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--text-muted)]">
          {entity.kind}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <Field label="Name">
          <Input
            value={entity.name}
            disabled={disabled}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>

        <div>
          <Label className="mb-2 block">Transform</Label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X">
              <NumInput
                value={entity.x}
                disabled={disabled}
                data-testid="inspector-x"
                onChange={(x) => patch({ x })}
              />
            </Field>
            <Field label="Y">
              <NumInput
                value={entity.y}
                disabled={disabled}
                data-testid="inspector-y"
                onChange={(y) => patch({ y })}
              />
            </Field>
            <Field label="W">
              <NumInput
                value={entity.width}
                disabled={disabled}
                onChange={(width) => patch({ width: Math.max(8, width) })}
              />
            </Field>
            <Field label="H">
              <NumInput
                value={entity.height}
                disabled={disabled}
                onChange={(height) => patch({ height: Math.max(8, height) })}
              />
            </Field>
            <Field label="Rotation">
              <NumInput
                value={entity.rotation}
                step={1}
                disabled={disabled}
                onChange={(rotation) => patch({ rotation })}
              />
            </Field>
          </div>
        </div>

        {entity.kind === 'sprite' && (
          <Field label="Color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={entity.color}
                disabled={disabled}
                onChange={(e) => patch({ color: e.target.value })}
                className="h-7 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent"
              />
              <Input
                value={entity.color}
                disabled={disabled}
                onChange={(e) => patch({ color: e.target.value })}
                className="font-mono uppercase"
              />
            </div>
          </Field>
        )}

        <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-panel-raised)] px-2.5 py-2">
          <span className="text-xs text-[var(--text-muted)]">Visible</span>
          <input
            type="checkbox"
            checked={entity.visible}
            onChange={(e) => patch({ visible: e.target.checked })}
            className="accent-[var(--accent)]"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-panel-raised)] px-2.5 py-2">
          <span className="text-xs text-[var(--text-muted)]">Locked</span>
          <input
            type="checkbox"
            checked={entity.locked}
            onChange={(e) => patch({ locked: e.target.checked })}
            className="accent-[var(--accent)]"
          />
        </div>

        {disabled && (
          <p className="text-[11px] text-[var(--warn)]">
            Entity is locked. Unlock to edit transform and color.
          </p>
        )}
      </div>
    </aside>
  )
}
