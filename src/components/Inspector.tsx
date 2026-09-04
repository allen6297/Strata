import { LayersEditor } from '@/components/LayersEditor'
import { AssetPreview } from '@/components/AssetPreview'
import { PanelHeader } from '@/components/PanelHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { playSoundUrl } from '@/lib/audio'
import {
  endAssetDrag,
  isFileDrag,
  nativeFiles,
  peekAssetDrag,
  readAssetDrag,
  type AssetDragPayload,
} from '@/lib/asset-drag'
import { classifyFileName } from '@/lib/project'
import { prefabRootCount } from '@/lib/prefab'
import { COLLISION_BIT_COUNT } from '@/lib/scene'
import {
  groupExportFields,
  listRoseGoldExports,
  type RgExportField,
} from '@/lib/rosegold-exports'
import { siblingRoseGoldModules } from '@/lib/rosegold-check'
import {
  listRoseGoldFns,
  listRoseGoldSignals,
  signalSignature,
  type RgFnMeta,
  type RgSignalField,
} from '@/lib/rosegold-signals'
import { nodeKindIcon } from '@/lib/node-kind-icon'
import type { DockZoneId } from '@/lib/dock-layout'
import { cn } from '@/lib/utils'
import type { AssetItem, Entity, EntityKind, RenderLayer, SceneMode } from '@/types/scene'
import {
  ChevronRight,
  Eye,
  EyeOff,
  FileCode2,
  Lock,
  Boxes,
  Plus,
  RotateCcw,
  Trash2,
  Unlock,
  Volume2,
} from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from 'react'

interface InspectorProps {
  entity: Entity | null
  selectedCount: number
  entities: Entity[]
  scripts: AssetItem[]
  textures: AssetItem[]
  audioClips: AssetItem[]
  audioUrlById: Record<string, string>
  mode: SceneMode
  prefabs?: Entity[]
  onSavePrefab?: (entity: Entity) => void
  inspectingPrefab?: boolean
  onPlacePrefab?: (id: string) => void
  onDeletePrefab?: (id: string) => void
  onResetPrefab?: (id: string) => void
  renderLayers?: RenderLayer[]
  onChangeRenderLayers?: (layers: RenderLayer[]) => void
  onDeleteLayer?: (id: string) => void
  previewAsset?: AssetItem | null
  onPreviewActivate?: (asset: AssetItem) => void
  canAssignPreview?: boolean
  tileBrush?: number
  onTileBrushChange?: (index: number) => void
  onChange: (id: string, patch: Partial<Entity>) => void
  onStatus?: (message: string) => void
  onImportFiles?: (
    files: File[],
    prefer?: AssetItem['type'],
  ) => void | Promise<void>
  style?: CSSProperties
  chromeless?: boolean
  dockZone?: DockZoneId
}

type AxisTone = 'x' | 'y' | 'z'

const AXIS_TONE: Record<AxisTone, string> = {
  x: 'text-[var(--danger)]',
  y: 'text-[var(--warn)]',
  z: 'text-[var(--accent)]',
}

const selectClass =
  'h-7 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 text-[11px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent-dim)] disabled:opacity-50'

function kindIcon(kind: EntityKind) {
  return nodeKindIcon(kind)
}

function Section({
  id,
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  hint?: string
  open: boolean
  onToggle: (id: string) => void
  children: ReactNode
}) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-panel-raised)_45%,transparent)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(id)}
        className="flex h-7 w-full items-center gap-1.5 px-2 text-left hover:bg-[var(--bg-hover)]"
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform',
            open && 'rotate-90',
          )}
        />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {title}
        </h3>
        {hint ? (
          <span className="ml-auto font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
            {hint}
          </span>
        ) : null}
      </button>
      {open ? <div className="space-y-2 px-2 pb-2">{children}</div> : null}
    </section>
  )
}

function Field({
  label,
  title,
  children,
}: {
  label: string
  title?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="w-[4.25rem] shrink-0 text-[11px] text-[var(--text-muted)]"
        title={title}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function exportLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function exportValue(
  props: Record<string, string | number | boolean>,
  field: RgExportField,
): string | number | boolean {
  const override = props[field.name]
  if (override !== undefined) return override
  if (field.default === null || field.default === undefined) {
    if (field.ty === 'Bool') return false
    if (field.ty === 'Str') return ''
    return 0
  }
  return field.default
}

function ExportFieldRow({
  field,
  value,
  disabled,
  onChange,
}: {
  field: RgExportField
  value: string | number | boolean
  disabled: boolean
  onChange: (value: string | number | boolean) => void
}) {
  const label = exportLabel(field.name)
  const hint = field.doc?.trim() || undefined
  let control: ReactNode
  if (field.ty === 'Bool') {
    control = (
      <Field label={label} title={hint}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          data-testid={`inspector-export-${field.name}`}
          className="h-3.5 w-3.5 accent-[var(--accent)]"
          onChange={(e) => onChange(e.target.checked)}
        />
      </Field>
    )
  } else if (field.ty === 'Str') {
    control = (
      <Field label={label} title={hint}>
        <Input
          value={String(value)}
          disabled={disabled}
          data-testid={`inspector-export-${field.name}`}
          className="h-7 text-[11px]"
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    )
  } else {
    const step = field.ty === 'Int' ? 1 : 'any'
    control = (
      <Field label={label} title={hint}>
        <Input
          type="number"
          step={step}
          value={typeof value === 'number' ? value : Number(value) || 0}
          disabled={disabled}
          data-testid={`inspector-export-${field.name}`}
          className="h-7 font-mono text-[11px]"
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            onChange(field.ty === 'Int' ? Math.trunc(n) : n)
          }}
        />
      </Field>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {control}
      {hint ? (
        <p className="text-[10px] leading-snug text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  )
}

function DropSlot({
  accept,
  testId,
  disabled,
  onDropAsset,
  onDropFiles,
  children,
}: {
  accept: AssetItem['type'][]
  testId?: string
  disabled?: boolean
  onDropAsset: (payload: AssetDragPayload) => void
  onDropFiles?: (files: File[]) => void
  children: ReactNode
}) {
  const [over, setOver] = useState(false)
  const allows = (payload: AssetDragPayload | null) =>
    Boolean(payload && accept.includes(payload.type))

  const canTakeFiles = (dt: DataTransfer) => {
    if (disabled || !onDropFiles || !isFileDrag(dt)) return false
    const items = Array.from(dt.items ?? [])
    if (!items.length) return true
    return items.some((item) => {
      if (item.kind !== 'file') return false
      if (accept.includes('texture') && item.type.startsWith('image/')) return true
      if (accept.includes('audio') && item.type.startsWith('audio/')) return true
      if (accept.includes('script') && (item.type === '' || item.type.startsWith('text/')))
        return true
      return false
    })
  }

  return (
    <div
      data-testid={testId}
      className={cn(
        '-mx-0.5 rounded-md px-0.5 transition-[box-shadow,background-color]',
        over && !disabled && 'bg-[var(--select)] ring-1 ring-[var(--accent)]',
      )}
      onDragEnter={(e) => {
        if (disabled) return
        if (allows(peekAssetDrag()) || canTakeFiles(e.dataTransfer)) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragOver={(e) => {
        if (disabled) return
        if (allows(peekAssetDrag()) || canTakeFiles(e.dataTransfer)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setOver(false)
      }}
      onDrop={(e) => {
        setOver(false)
        if (disabled) return
        const files = nativeFiles(e.dataTransfer)
        if (files.length && onDropFiles) {
          const matching = files.filter((f) => {
            const kind = classifyFileName(f.name)
            return Boolean(kind && accept.includes(kind))
          })
          if (matching.length) {
            e.preventDefault()
            e.stopPropagation()
            onDropFiles(matching)
            return
          }
          return
        }
        const payload = readAssetDrag(e.dataTransfer)
        if (payload && allows(payload)) {
          e.preventDefault()
          e.stopPropagation()
          onDropAsset(payload)
          endAssetDrag()
        }
      }}
    >
      {children}
    </div>
  )
}

function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(selectClass, className)} {...props} />
}

function AxisInput({
  letter,
  tone,
  value,
  onChange,
  step = 1,
  disabled,
  testId,
}: {
  letter: string
  tone: AxisTone
  value: number
  onChange: (n: number) => void
  step?: number
  disabled?: boolean
  testId?: string
}) {
  return (
    <div className="flex min-w-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-input)] focus-within:border-[var(--accent-dim)]">
      <span
        className={cn(
          'flex w-5 shrink-0 items-center justify-center font-mono text-[10px] font-semibold',
          AXIS_TONE[tone],
        )}
      >
        {letter}
      </span>
      <input
        type="number"
        step={step}
        disabled={disabled}
        data-testid={testId}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 min-w-0 flex-1 [appearance:textfield] bg-transparent px-1 font-mono text-[11px] text-[var(--text)] outline-none disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  )
}

function VecRow({
  label,
  cols,
  children,
}: {
  label: string
  cols: 1 | 2 | 3
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-[4.25rem] shrink-0 text-[11px] text-[var(--text-muted)]">
        {label}
      </span>
      <div
        className={cn(
          'grid min-w-0 flex-1 gap-1',
          cols === 1 && 'grid-cols-1',
          cols === 2 && 'grid-cols-2',
          cols === 3 && 'grid-cols-3',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function BitMaskRow({
  label,
  value,
  disabled,
  testIdPrefix,
  onChange,
}: {
  label: string
  value: number
  disabled?: boolean
  testIdPrefix: string
  onChange: (n: number) => void
}) {
  return (
    <Field label={label}>
      <div className="flex gap-0.5">
        {Array.from({ length: COLLISION_BIT_COUNT }, (_, i) => {
          const bit = 1 << i
          const on = (value & bit) !== 0
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              data-testid={`${testIdPrefix}-${i + 1}`}
              title={`Layer ${i + 1}`}
              onClick={() => onChange((value ^ bit) >>> 0)}
              className={cn(
                'h-6 w-6 shrink-0 rounded-md font-mono text-[10px] transition-colors',
                on
                  ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                  : 'border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-muted)]',
                disabled && 'opacity-50',
              )}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

function FlagRow({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string
  icon: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 text-left hover:bg-[var(--bg-hover)]"
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--text)]">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'inline-flex h-4 w-7 shrink-0 items-center rounded-full border p-px transition-colors',
          checked
            ? 'justify-end border-transparent bg-[var(--accent)]'
            : 'justify-start border-[var(--border-strong)] bg-[var(--bg-input)]',
        )}
      >
        <span
          className={cn(
            'size-3 rounded-full transition-colors',
            checked ? 'bg-[var(--accent-on)]' : 'bg-[var(--text-muted)]',
          )}
        />
      </span>
    </button>
  )
}

function TilePalette({
  url,
  tileSize,
  value,
  disabled,
  onChange,
}: {
  url?: string
  tileSize: number
  value: number
  disabled?: boolean
  onChange: (index: number) => void
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!url) {
      setSize(null)
      return
    }
    const img = new Image()
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => setSize(null)
    img.src = url
  }, [url])
  const ts = Math.max(1, tileSize)
  const cols = size ? Math.max(1, Math.floor(size.w / ts)) : 0
  const rows = size ? Math.max(1, Math.floor(size.h / ts)) : 0
  const count = cols * rows
  if (!url || !size || !count) {
    return (
      <p className="text-[10px] text-[var(--text-muted)]">
        Assign a tileset texture to paint.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-0.5">
      {Array.from({ length: count }, (_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const xPct = cols <= 1 ? 0 : (col / (cols - 1)) * 100
        const yPct = rows <= 1 ? 0 : (row / (rows - 1)) * 100
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            data-testid={`tile-brush-${i}`}
            title={`Tile ${i}`}
            onClick={() => onChange(i)}
            className={cn(
              'h-8 w-8 shrink-0 overflow-hidden rounded-sm border',
              value === i
                ? 'border-[var(--accent)]'
                : 'border-[var(--border)]',
            )}
            style={{
              backgroundImage: `url(${url})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${cols * 100}% ${rows * 100}%`,
              backgroundPosition: `${xPct}% ${yPct}%`,
              imageRendering: 'pixelated',
            }}
          />
        )
      })}
    </div>
  )
}

function TexturePreview({
  url,
  color,
}: {
  url?: string
  color: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className="h-7 w-7 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-input)]"
      title={url ? 'Texture' : 'Fill color'}
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="block h-full w-full" style={{ background: color }} />
      )}
    </div>
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
  prefabs = [],
  onSavePrefab,
  inspectingPrefab = false,
  onPlacePrefab,
  onDeletePrefab,
  onResetPrefab,
  renderLayers = [],
  onChangeRenderLayers,
  onDeleteLayer,
  previewAsset = null,
  onPreviewActivate,
  canAssignPreview = false,
  tileBrush = 0,
  onTileBrushChange,
  onChange,
  onStatus,
  onImportFiles,
  style,
  chromeless = false,
  dockZone,
}: InspectorProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const isOpen = (id: string) => !collapsed[id]
  const toggleSection = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  const [exportFields, setExportFields] = useState<RgExportField[]>([])
  const [signalFields, setSignalFields] = useState<RgSignalField[]>([])
  const [fnsByScript, setFnsByScript] = useState<Record<string, RgFnMeta[]>>({})
  const attachedScript = scripts.find((s) => s.id === entity?.scriptId)
  useEffect(() => {
    let cancelled = false
    const content = attachedScript?.content
    if (!content?.trim()) {
      setExportFields([])
      setSignalFields([])
      return
    }
    listRoseGoldExports(content).then((fields) => {
      if (!cancelled) setExportFields(fields)
    })
    listRoseGoldSignals(
      content,
      siblingRoseGoldModules(scripts, attachedScript?.id),
    ).then((fields) => {
      if (!cancelled) setSignalFields(fields)
    })
    return () => {
      cancelled = true
    }
  }, [attachedScript?.id, attachedScript?.content, scripts])

  useEffect(() => {
    let cancelled = false
    const needed = scripts.filter((s) => s.content?.trim())
    if (!needed.length) {
      setFnsByScript({})
      return
    }
    void Promise.all(
      needed.map(async (s) => {
        const fns = await listRoseGoldFns(s.content ?? '')
        return [s.id, fns] as const
      }),
    ).then((entries) => {
      if (!cancelled) setFnsByScript(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [scripts])

  if (!entity) {
    return (
      <aside
        className="panel-animate flex h-full min-h-0 w-full flex-col bg-[var(--bg-panel)]"
        style={style}
      >
        {!chromeless && (
          <PanelHeader
            title="Inspector"
            dockPanel="inspector"
            dockZone={dockZone}
            meta={previewAsset?.type}
          />
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 py-2">
          {previewAsset ? (
            <AssetPreview
              asset={previewAsset}
              canAssign={canAssignPreview}
              onActivate={onPreviewActivate}
            />
          ) : (
            <>
              <p className="px-1 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
                Select an entity in the hierarchy or viewport to edit its
                properties.
              </p>
              {onChangeRenderLayers && onDeleteLayer ? (
                <Section
                  id="project-layers"
                  title="Render layers"
                  hint="project"
                  open={isOpen('project-layers')}
                  onToggle={toggleSection}
                >
                  <p className="text-[10px] text-[var(--text-muted)]">
                    Low = back. Shared across scenes in this project.
                  </p>
                  <LayersEditor
                    layers={renderLayers}
                    onChange={onChangeRenderLayers}
                    onDelete={onDeleteLayer}
                  />
                </Section>
              ) : null}
            </>
          )}
        </div>
      </aside>
    )
  }

  const patch = (p: Partial<Entity>) => onChange(entity.id, p)
  const disabled = entity.locked
  const parentOptions = entities.filter((e) => e.id !== entity.id)
  const parentName = entities.find((e) => e.id === entity.parentId)?.name
  const texture = textures.find((t) => t.id === entity.textureId)
  const script = scripts.find((s) => s.id === entity.scriptId)
  const KindIcon = kindIcon(entity.kind)
  const prefabTemplate = prefabs.find((p) => p.id === entity.prefabId)
  const linkedInstance = !inspectingPrefab && Boolean(entity.prefabId)

  const applyLibraryDrop = (payload: AssetDragPayload) => {
    if (disabled) {
      onStatus?.('Unlock the entity to attach assets')
      return
    }
    if (payload.type === 'scene') {
      onStatus?.('Open scenes from Files')
      return
    }
    if (payload.type === 'texture') {
      patch({ textureId: payload.id })
      onStatus?.(`Texture → ${payload.name}`)
    } else if (payload.type === 'audio') {
      patch({ audioId: payload.id })
      onStatus?.(`Audio → ${payload.name}`)
    } else if (payload.type === 'script') {
      patch({ scriptId: payload.id })
      onStatus?.(`Script → ${payload.name}`)
    } else {
      return
    }
    setCollapsed((prev) => ({ ...prev, assets: false }))
  }

  const importFiles = (files: File[], prefer?: AssetItem['type']) => {
    if (disabled) {
      onStatus?.('Unlock the entity to attach assets')
      return
    }
    if (!onImportFiles) return
    setCollapsed((prev) => ({ ...prev, assets: false }))
    void onImportFiles(files, prefer)
  }

  return (
    <aside
      className="panel-animate flex h-full min-h-0 w-full flex-col bg-[var(--bg-panel)]"
      style={style}
    >
      {!chromeless && (
        <PanelHeader
          title="Inspector"
          dockPanel="inspector"
          dockZone={dockZone}
          meta={selectedCount > 1 ? `${selectedCount} selected` : undefined}
        />
      )}

      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pt-2 pb-3"
        onDragOver={(e) => {
          const payload = peekAssetDrag()
          const files = isFileDrag(e.dataTransfer)
          if (!payload && !files) return
          e.preventDefault()
          if (disabled || payload?.type === 'scene') {
            e.dataTransfer.dropEffect = 'none'
            return
          }
          if (
            files ||
            payload?.type === 'texture' ||
            payload?.type === 'audio' ||
            payload?.type === 'script'
          ) {
            e.dataTransfer.dropEffect = 'copy'
          } else {
            e.dataTransfer.dropEffect = 'none'
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          const files = nativeFiles(e.dataTransfer)
          if (files.length) {
            importFiles(files)
            return
          }
          const payload = readAssetDrag(e.dataTransfer)
          endAssetDrag()
          if (!payload) return
          applyLibraryDrop(payload)
        }}
      >
        {selectedCount > 1 && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--bg-panel-raised)] px-2 py-1.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Editing the primary selection. Delete and Duplicate apply to all
            selected.
          </p>
        )}

        {disabled && (
          <p className="rounded-md border border-[color-mix(in_srgb,var(--warn)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] px-2 py-1.5 text-[10px] text-[var(--warn)]">
            Locked — unlock to edit transform and color.
          </p>
        )}

        <section className="space-y-2 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-panel-raised)_45%,transparent)] px-2 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-input)] text-[var(--accent)]">
              <KindIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <Input
                value={entity.name}
                disabled={disabled}
                onChange={(e) => patch({ name: e.target.value })}
                className="h-7 text-[13px] font-medium"
              />
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate font-mono text-[10px] text-[var(--text-muted)]">
                <span className="shrink-0 rounded bg-[var(--bg-input)] px-1.5 py-px uppercase tracking-wide">
                  {inspectingPrefab ? 'prefab' : entity.kind}
                </span>
                {linkedInstance && (
                  <span
                    className="shrink-0 rounded bg-[var(--bg-input)] px-1.5 py-px uppercase tracking-wide text-[var(--accent)]"
                    data-testid="inspector-instance-badge"
                  >
                    instance
                  </span>
                )}
                <span className="min-w-0 truncate">
                  {parentName ? parentName : 'root'}
                  {script ? ` · ${script.name}` : ''}
                </span>
              </p>
            </div>
          </div>
          <Field label="Parent">
            <Select
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
            </Select>
          </Field>
          <Field label="Layer">
            <Select
              value={entity.layerId}
              disabled={disabled}
              data-testid="inspector-layer"
              onChange={(e) => patch({ layerId: e.target.value })}
            >
              {renderLayers.length === 0 ? (
                <option value={entity.layerId}>Default</option>
              ) : null}
              {renderLayers.length > 0 &&
              !renderLayers.some((l) => l.id === entity.layerId) ? (
                <option value={entity.layerId}>{entity.layerId}</option>
              ) : null}
              {[...renderLayers]
                .sort((a, b) => a.order - b.order)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Sort">
            <Input
              value={entity.sortOrder == null ? '' : String(entity.sortOrder)}
              disabled={disabled}
              data-testid="inspector-sort-order"
              placeholder="auto"
              className="h-7 font-mono text-[11px]"
              onChange={(e) => {
                const raw = e.target.value.trim()
                if (raw === '') {
                  patch({ sortOrder: null })
                  return
                }
                const n = Number(raw)
                if (Number.isFinite(n)) patch({ sortOrder: n })
              }}
            />
          </Field>
        </section>

        <Section
          id="assets"
          title="Assets"
          open={isOpen('assets')}
          onToggle={toggleSection}
        >
          <DropSlot
            accept={['texture']}
            testId="inspector-drop-texture"
            disabled={disabled}
            onDropAsset={applyLibraryDrop}
            onDropFiles={(files) => importFiles(files, 'texture')}
          >
          <Field label="Texture">
            <div className="flex min-w-0 items-center gap-1">
              <TexturePreview
                key={texture?.url ?? entity.color}
                url={texture?.url}
                color={entity.color}
              />
              <Select
                value={entity.textureId ?? ''}
                disabled={disabled}
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
              </Select>
            </div>
          </Field>
          </DropSlot>
          <DropSlot
            accept={['audio']}
            testId="inspector-drop-audio"
            disabled={disabled}
            onDropAsset={applyLibraryDrop}
            onDropFiles={(files) => importFiles(files, 'audio')}
          >
          <Field label="Audio">
            <div className="flex min-w-0 gap-1">
              <Select
                value={entity.audioId ?? ''}
                disabled={disabled}
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
              </Select>
              <Button
                variant="toolbar"
                size="icon"
                title="Preview sound"
                disabled={!entity.audioId || !audioUrlById[entity.audioId]}
                data-testid="inspector-audio-preview"
                className="h-7 w-7"
                onClick={() => {
                  const id = entity.audioId
                  if (id && audioUrlById[id]) playSoundUrl(audioUrlById[id])
                }}
              >
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Field>
          </DropSlot>
          <DropSlot
            accept={['script']}
            testId="inspector-drop-script"
            disabled={disabled}
            onDropAsset={applyLibraryDrop}
            onDropFiles={(files) => importFiles(files, 'script')}
          >
          <Field label="Script">
            <div className="flex min-w-0 items-center gap-1">
              <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent-dim)]" />
              <Select
                value={entity.scriptId ?? ''}
                disabled={disabled}
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
              </Select>
            </div>
          </Field>
          </DropSlot>
        </Section>

        {entity.kind === 'tilemap' && (
          <Section
            id="tiles"
            title="Tiles"
            hint={`${entity.tiles.length}`}
            open={isOpen('tiles')}
            onToggle={toggleSection}
          >
            <p className="text-[10px] text-[var(--text-muted)]">
              Click the viewport to paint. Right-click or Shift-click erases.
              Gizmo moves the map.
            </p>
            <Field label="Size">
              <Input
                value={String(entity.tileSize)}
                disabled={disabled}
                data-testid="inspector-tile-size"
                className="h-7 font-mono text-[11px]"
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n) && n > 0) patch({ tileSize: n })
                }}
              />
            </Field>
            <TilePalette
              url={texture?.url}
              tileSize={entity.tileSize}
              value={tileBrush}
              disabled={disabled}
              onChange={(i) => onTileBrushChange?.(i)}
            />
          </Section>
        )}

        {groupExportFields(exportFields).map((group, i) => (
          <Section
            key={group.title}
            id={`export-${i}`}
            title={group.title}
            hint="script"
            open={isOpen(`export-${i}`)}
            onToggle={toggleSection}
          >
            {group.fields.map((field) => (
              <ExportFieldRow
                key={field.name}
                field={field}
                value={exportValue(entity.scriptProps ?? {}, field)}
                disabled={disabled}
                onChange={(value) =>
                  patch({
                    scriptProps: {
                      ...(entity.scriptProps ?? {}),
                      [field.name]: value,
                    },
                  })
                }
              />
            ))}
          </Section>
        ))}

        {signalFields.length > 0 && (
          <Section
            id="signals"
            title="Signals"
            hint="script"
            open={isOpen('signals')}
            onToggle={toggleSection}
          >
            {signalFields.map((sig) => {
              const wired = (entity.connections ?? []).filter(
                (c) => c.signal === sig.name,
              )
              return (
                <div key={sig.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="font-mono text-[10px] text-[var(--text)]"
                      data-testid={`inspector-signal-${sig.name}`}
                    >
                      {signalSignature(sig)}
                    </span>
                    <Button
                      variant="toolbar"
                      size="icon"
                      title="Connect"
                      disabled={disabled}
                      className="h-6 w-6"
                      data-testid={`inspector-signal-add-${sig.name}`}
                      onClick={() => {
                        const other = entities.find((e) => e.id !== entity.id)
                        const targetFns = other?.scriptId
                          ? fnsByScript[other.scriptId]
                          : undefined
                        const method =
                          targetFns?.find((f) => f.name !== 'main')?.name ??
                          'on_coin'
                        patch({
                          connections: [
                            ...(entity.connections ?? []),
                            {
                              signal: sig.name,
                              to: other?.id ?? '',
                              method,
                            },
                          ],
                        })
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {wired.map((c, i) => {
                    const globalIndex = (entity.connections ?? []).findIndex(
                      (x) => x === c,
                    )
                    const idx =
                      globalIndex >= 0
                        ? globalIndex
                        : (entity.connections ?? []).findIndex(
                            (x, j) =>
                              x.signal === c.signal &&
                              x.to === c.to &&
                              x.method === c.method &&
                              j >= i,
                          )
                    const target = entities.find((e) => e.id === c.to)
                    const methods = target?.scriptId
                      ? fnsByScript[target.scriptId] ?? []
                      : []
                    return (
                      <div
                        key={`${c.to}-${c.method}-${i}`}
                        className="flex min-w-0 items-center gap-1"
                      >
                        <Select
                          value={c.to}
                          disabled={disabled}
                          data-testid={`inspector-signal-to-${sig.name}-${i}`}
                          onChange={(e) => {
                            const next = [...(entity.connections ?? [])]
                            if (idx >= 0) {
                              next[idx] = { ...c, to: e.target.value }
                              patch({ connections: next })
                            }
                          }}
                        >
                          <option value="">Entity</option>
                          {entities
                            .filter((e) => e.id !== entity.id)
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name}
                              </option>
                            ))}
                        </Select>
                        <Select
                          value={c.method}
                          disabled={disabled}
                          data-testid={`inspector-signal-method-${sig.name}-${i}`}
                          onChange={(e) => {
                            const next = [...(entity.connections ?? [])]
                            if (idx >= 0) {
                              next[idx] = { ...c, method: e.target.value }
                              patch({ connections: next })
                            }
                          }}
                        >
                          {c.method && !methods.some((f) => f.name === c.method) ? (
                            <option value={c.method}>{c.method}</option>
                          ) : null}
                          {methods.length === 0 ? (
                            <option value={c.method || 'on_coin'}>
                              {c.method || 'method'}
                            </option>
                          ) : (
                            methods.map((f) => (
                              <option key={f.name} value={f.name}>
                                {f.name}
                              </option>
                            ))
                          )}
                        </Select>
                        <Button
                          variant="toolbar"
                          size="icon"
                          title="Remove"
                          disabled={disabled}
                          className="h-6 w-6"
                          onClick={() => {
                            const next = (entity.connections ?? []).filter(
                              (_, j) => j !== idx,
                            )
                            patch({ connections: next })
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </Section>
        )}

        <Section
          id="transform"
          title="Transform"
          hint={entity.parentId ? 'local' : 'world'}
          open={isOpen('transform')}
          onToggle={toggleSection}
        >
          <VecRow label="Position" cols={mode === '3d' ? 3 : 2}>
            <AxisInput
              letter="X"
              tone="x"
              value={entity.x}
              disabled={disabled}
              testId="inspector-x"
              onChange={(x) => patch({ x })}
            />
            <AxisInput
              letter="Y"
              tone="y"
              value={entity.y}
              disabled={disabled}
              testId="inspector-y"
              onChange={(y) => patch({ y })}
            />
            {mode === '3d' && (
              <AxisInput
                letter="Z"
                tone="z"
                value={entity.z}
                disabled={disabled}
                onChange={(z) => patch({ z })}
              />
            )}
          </VecRow>
          <VecRow label="Size" cols={mode === '3d' ? 3 : 2}>
            <AxisInput
              letter="W"
              tone="x"
              value={entity.width}
              disabled={disabled}
              onChange={(width) => patch({ width: Math.max(8, width) })}
            />
            <AxisInput
              letter="H"
              tone="y"
              value={entity.height}
              disabled={disabled}
              onChange={(height) => patch({ height: Math.max(8, height) })}
            />
            {mode === '3d' && (
              <AxisInput
                letter="D"
                tone="z"
                value={entity.depth}
                disabled={disabled}
                onChange={(depth) => patch({ depth: Math.max(1, depth) })}
              />
            )}
          </VecRow>
          {mode === '3d' ? (
            <>
              <VecRow label="Rotate" cols={3}>
                <AxisInput
                  letter="X"
                  tone="x"
                  value={entity.rotationX}
                  disabled={disabled}
                  onChange={(rotationX) => patch({ rotationX })}
                />
                <AxisInput
                  letter="Y"
                  tone="y"
                  value={entity.rotationY}
                  disabled={disabled}
                  onChange={(rotationY) => patch({ rotationY })}
                />
                <AxisInput
                  letter="Z"
                  tone="z"
                  value={entity.rotationZ}
                  disabled={disabled}
                  onChange={(rotationZ) =>
                    patch({ rotationZ, rotation: rotationZ })
                  }
                />
              </VecRow>
              <VecRow label="Scale" cols={3}>
                <AxisInput
                  letter="X"
                  tone="x"
                  step={0.1}
                  value={entity.scaleX}
                  disabled={disabled}
                  onChange={(scaleX) =>
                    patch({ scaleX: Math.max(0.05, scaleX) })
                  }
                />
                <AxisInput
                  letter="Y"
                  tone="y"
                  step={0.1}
                  value={entity.scaleY}
                  disabled={disabled}
                  onChange={(scaleY) =>
                    patch({ scaleY: Math.max(0.05, scaleY) })
                  }
                />
                <AxisInput
                  letter="Z"
                  tone="z"
                  step={0.1}
                  value={entity.scaleZ}
                  disabled={disabled}
                  onChange={(scaleZ) =>
                    patch({ scaleZ: Math.max(0.05, scaleZ) })
                  }
                />
              </VecRow>
            </>
          ) : (
            <VecRow label="Rotate" cols={1}>
              <AxisInput
                letter="°"
                tone="z"
                value={entity.rotationZ || entity.rotation}
                disabled={disabled}
                onChange={(rotation) =>
                  patch({ rotation, rotationZ: rotation })
                }
              />
            </VecRow>
          )}
        </Section>

        {(entity.kind === 'sprite' || entity.kind === 'mesh') && (
          <Section
            id="appearance"
            title="Appearance"
            open={isOpen('appearance')}
            onToggle={toggleSection}
          >
            <Field label="Color">
              <div className="flex min-w-0 items-center gap-1.5">
                <label
                  className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-[var(--border)]"
                  title="Pick color"
                >
                  <span
                    className="block h-full w-full"
                    style={{ background: entity.color }}
                  />
                  <input
                    type="color"
                    value={entity.color}
                    disabled={disabled}
                    onChange={(e) => patch({ color: e.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  />
                </label>
                <Input
                  value={entity.color}
                  disabled={disabled}
                  data-testid="inspector-color"
                  onChange={(e) => patch({ color: e.target.value })}
                  className="h-7 font-mono text-[11px] uppercase"
                />
              </div>
            </Field>
          </Section>
        )}

        {entity.kind === 'script' && (
          <Section
            id="script-path"
            title="Script path"
            open={isOpen('script-path')}
            onToggle={toggleSection}
          >
            <Field label="Path">
              <Input
                value={entity.scriptPath}
                disabled={disabled}
                onChange={(e) => patch({ scriptPath: e.target.value })}
                className="h-7 font-mono text-[11px]"
                placeholder="scripts/main.rg"
              />
            </Field>
          </Section>
        )}

        <Section
          id="prefabs"
          title="Prefabs"
          hint={
            inspectingPrefab
              ? 'template'
              : prefabs.length
                ? `${prefabRootCount(prefabs)}`
                : undefined
          }
          open={isOpen('prefabs')}
          onToggle={toggleSection}
        >
          {inspectingPrefab ? (
            <>
              <p className="text-[10px] text-[var(--text-muted)]">
                Edits update placed copies. Root transform stays where you
                dropped it. Drag this row from Hierarchy into the viewport to
                place.
              </p>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  data-testid="place-prefab"
                  onClick={() => onPlacePrefab?.(entity.id)}
                >
                  <Boxes className="h-3.5 w-3.5" />
                  Place in scene
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  data-testid="delete-prefab"
                  onClick={() => onDeletePrefab?.(entity.id)}
                >
                  Delete template
                </Button>
              </div>
            </>
          ) : (
            <>
              {linkedInstance ? (
                <p className="text-[10px] text-[var(--text-muted)]">
                  Live instance of {prefabTemplate?.name ?? 'prefab'}. Color and
                  other template fields follow the catalog; this copy&apos;s
                  position stays put. Inspector edits stick as overrides.
                </p>
              ) : prefabs.filter((p) => !p.parentId).length ? (
                <p className="font-mono text-[10px] text-[var(--text-muted)]">
                  {prefabs
                    .filter((p) => !p.parentId)
                    .map((p) => p.name)
                    .join(', ')}
                </p>
              ) : (
                <p className="text-[10px] text-[var(--text-muted)]">
                  No prefabs yet. Saves this node and its children.
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  data-testid="save-prefab"
                  onClick={() => onSavePrefab?.(entity)}
                >
                  <Boxes className="h-3.5 w-3.5" />
                  Save as prefab
                </Button>
                {linkedInstance && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    data-testid="reset-prefab-instance"
                    onClick={() => onResetPrefab?.(entity.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset to prefab
                  </Button>
                )}
              </div>
            </>
          )}
        </Section>

        <Section
          id="collision"
          title="Collision"
          hint={entity.solid ? 'solid' : 'area'}
          open={isOpen('collision')}
          onToggle={toggleSection}
        >
          <Field label="Body">
            <Select
              value={entity.solid ? 'solid' : 'area'}
              disabled={disabled}
              data-testid="inspector-collision-body"
              onChange={(e) => patch({ solid: e.target.value === 'solid' })}
            >
              <option value="area">Area (overlap only)</option>
              <option value="solid">Solid (wall)</option>
            </Select>
          </Field>
          <BitMaskRow
            label="Layer"
            value={entity.collisionLayer}
            disabled={disabled}
            testIdPrefix="inspector-collision-layer"
            onChange={(collisionLayer) => patch({ collisionLayer })}
          />
          <BitMaskRow
            label="Mask"
            value={entity.collisionMask}
            disabled={disabled}
            testIdPrefix="inspector-collision-mask"
            onChange={(collisionMask) => patch({ collisionMask })}
          />
        </Section>

        <Section
          id="flags"
          title="Flags"
          open={isOpen('flags')}
          onToggle={toggleSection}
        >
          <FlagRow
            label="Visible"
            icon={
              entity.visible ? (
                <Eye className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              )
            }
            checked={entity.visible}
            onChange={(visible) => patch({ visible })}
          />
          <FlagRow
            label="Locked"
            icon={
              entity.locked ? (
                <Lock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              ) : (
                <Unlock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              )
            }
            checked={entity.locked}
            onChange={(locked) => patch({ locked })}
          />
        </Section>
      </div>
    </aside>
  )
}
