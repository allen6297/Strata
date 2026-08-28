import { PanelHeader } from '@/components/PanelHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { playSoundUrl } from '@/lib/audio'
import { cn } from '@/lib/utils'
import type { AssetItem, Entity, SceneMode } from '@/types/scene'
import { Volume2 } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

interface InspectorProps {
  entity: Entity | null
  selectedCount: number
  entities: Entity[]
  scripts: AssetItem[]
  textures: AssetItem[]
  audioClips: AssetItem[]
  audioUrlById: Record<string, string>
  mode: SceneMode
  onChange: (id: string, patch: Partial<Entity>) => void
  style?: CSSProperties
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-0.5', className)}>
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
      className="h-6 font-mono text-[11px]"
    />
  )
}

function FlagRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex h-6 cursor-pointer items-center justify-between gap-2 rounded px-1.5 hover:bg-[var(--bg-panel-raised)]">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--accent)]"
      />
    </label>
  )
}

export function Inspector({
  entity,
  selectedCount,
  entities,
  scripts,
  textures,
  audioClips,
  audioUrlById,
  mode,
  onChange,
  style,
}: InspectorProps) {
  if (!entity) {
    return (
      <aside
        className="panel-animate flex h-full shrink-0 flex-col bg-[var(--bg-panel)]"
        style={style}
      >
        <PanelHeader title="Inspector" />
        <p className="px-3 py-8 text-center text-[11px] text-[var(--text-muted)]">
          Select an entity in the hierarchy or viewport to edit its properties.
        </p>
      </aside>
    )
  }

  const patch = (p: Partial<Entity>) => onChange(entity.id, p)
  const disabled = entity.locked
  const parentOptions = entities.filter((e) => e.id !== entity.id)

  return (
    <aside
      className="panel-animate flex h-full min-h-0 shrink-0 flex-col bg-[var(--bg-panel)]"
      style={style}
    >
      <PanelHeader
        title="Inspector"
        meta={
          <span className="rounded bg-[var(--bg-panel-raised)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
            {selectedCount > 1 ? `${selectedCount} sel` : entity.kind}
          </span>
        }
      />

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-2.5">
        {selectedCount > 1 && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--bg-panel-raised)] px-2 py-1.5 text-[10px] text-[var(--text-muted)]">
            Editing primary selection. Delete/Duplicate apply to all selected.
          </p>
        )}

        <Field label="Name">
          <Input
            value={entity.name}
            disabled={disabled}
            onChange={(e) => patch({ name: e.target.value })}
            className="h-6 text-[11px]"
          />
        </Field>

        <Field label="Parent">
          <select
            className="h-6 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
            value={entity.parentId ?? ''}
            disabled={disabled}
            data-testid="inspector-parent"
            onChange={(e) =>
              patch({ parentId: e.target.value ? e.target.value : null })
            }
          >
            <option value="">None (root)</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Texture">
          <select
            className="h-6 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
            value={entity.textureId ?? ''}
            data-testid="inspector-texture"
            onChange={(e) =>
              patch({ textureId: e.target.value ? e.target.value : null })
            }
          >
            <option value="">None (solid color)</option>
            {textures.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Audio">
          <div className="flex gap-1">
            <select
              className="h-6 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
              value={entity.audioId ?? ''}
              data-testid="inspector-audio"
              onChange={(e) =>
                patch({ audioId: e.target.value ? e.target.value : null })
              }
            >
              <option value="">None</option>
              {audioClips.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Button
              variant="toolbar"
              size="icon"
              title="Preview sound"
              disabled={!entity.audioId || !audioUrlById[entity.audioId]}
              data-testid="inspector-audio-preview"
              onClick={() => {
                const id = entity.audioId
                if (id && audioUrlById[id]) playSoundUrl(audioUrlById[id])
              }}
            >
              <Volume2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Field>

        <Field label="RoseGold script">
          <select
            className="h-6 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
            value={entity.scriptId ?? ''}
            data-testid="inspector-script"
            onChange={(e) =>
              patch({ scriptId: e.target.value ? e.target.value : null })
            }
          >
            <option value="">None</option>
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Section title={`Transform ${entity.parentId ? '(local)' : '(world)'}`}>
          <div className="grid grid-cols-2 gap-1.5">
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
            {mode === '3d' && (
              <Field label="Z">
                <NumInput
                  value={entity.z}
                  disabled={disabled}
                  onChange={(z) => patch({ z })}
                />
              </Field>
            )}
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
            {mode === '3d' && (
              <Field label="D">
                <NumInput
                  value={entity.depth}
                  disabled={disabled}
                  onChange={(depth) => patch({ depth: Math.max(1, depth) })}
                />
              </Field>
            )}
            {mode === '3d' ? (
              <>
                <Field label="RX">
                  <NumInput
                    value={entity.rotationX}
                    disabled={disabled}
                    onChange={(rotationX) => patch({ rotationX })}
                  />
                </Field>
                <Field label="RY">
                  <NumInput
                    value={entity.rotationY}
                    disabled={disabled}
                    onChange={(rotationY) => patch({ rotationY })}
                  />
                </Field>
                <Field label="RZ">
                  <NumInput
                    value={entity.rotationZ}
                    disabled={disabled}
                    onChange={(rotationZ) =>
                      patch({ rotationZ, rotation: rotationZ })
                    }
                  />
                </Field>
              </>
            ) : (
              <Field label="Rotation" className="col-span-2">
                <NumInput
                  value={entity.rotationZ || entity.rotation}
                  step={1}
                  disabled={disabled}
                  onChange={(rotation) =>
                    patch({ rotation, rotationZ: rotation })
                  }
                />
              </Field>
            )}
            {mode === '3d' && (
              <>
                <Field label="SX">
                  <NumInput
                    value={entity.scaleX}
                    step={0.1}
                    disabled={disabled}
                    onChange={(scaleX) => patch({ scaleX: Math.max(0.05, scaleX) })}
                  />
                </Field>
                <Field label="SY">
                  <NumInput
                    value={entity.scaleY}
                    step={0.1}
                    disabled={disabled}
                    onChange={(scaleY) => patch({ scaleY: Math.max(0.05, scaleY) })}
                  />
                </Field>
                <Field label="SZ">
                  <NumInput
                    value={entity.scaleZ}
                    step={0.1}
                    disabled={disabled}
                    onChange={(scaleZ) => patch({ scaleZ: Math.max(0.05, scaleZ) })}
                  />
                </Field>
              </>
            )}
          </div>
        </Section>

        {(entity.kind === 'sprite' || entity.kind === 'mesh') && (
          <Section title="Appearance">
            <Field label="Color">
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={entity.color}
                  disabled={disabled}
                  onChange={(e) => patch({ color: e.target.value })}
                  className="h-6 w-8 cursor-pointer rounded border border-[var(--border)] bg-transparent"
                />
                <Input
                  value={entity.color}
                  disabled={disabled}
                  onChange={(e) => patch({ color: e.target.value })}
                  className="h-6 font-mono text-[11px] uppercase"
                />
              </div>
            </Field>
          </Section>
        )}

        {entity.kind === 'script' && (
          <Section title="Script path">
            <Field label="Path">
              <Input
                value={entity.scriptPath}
                disabled={disabled}
                onChange={(e) => patch({ scriptPath: e.target.value })}
                className="h-6 font-mono text-[11px]"
                placeholder="scripts/main.rg"
              />
            </Field>
          </Section>
        )}

        <Section title="Flags">
          <div className="rounded border border-[var(--border)] bg-[var(--bg-input)] py-0.5">
            <FlagRow
              label="Visible"
              checked={entity.visible}
              onChange={(visible) => patch({ visible })}
            />
            <FlagRow
              label="Locked"
              checked={entity.locked}
              onChange={(locked) => patch({ locked })}
            />
          </div>
        </Section>

        {disabled && (
          <p className="text-[10px] text-[var(--warn)]">
            Entity is locked. Unlock to edit transform and color.
          </p>
        )}
      </div>
    </aside>
  )
}
