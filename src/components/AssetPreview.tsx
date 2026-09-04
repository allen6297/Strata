import { playSoundUrl } from '@/lib/audio'
import type { AssetItem } from '@/types/scene'
import { FileAudio, FileCode2, Image, LayoutTemplate, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'

const icons = {
  texture: Image,
  script: FileCode2,
  audio: FileAudio,
  scene: LayoutTemplate,
} as const

export function AssetPreview({
  asset,
  canAssign = false,
  onActivate,
}: {
  asset: AssetItem
  canAssign?: boolean
  onActivate?: (asset: AssetItem) => void
}) {
  const Icon = icons[asset.type]
  const [imgError, setImgError] = useState(false)
  const path = asset.relativePath ?? asset.name

  useEffect(() => {
    setImgError(false)
  }, [asset.id, asset.url])

  return (
    <section
      className="space-y-2 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-panel-raised)_45%,transparent)] px-2 py-2"
      data-testid="asset-preview"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-input)] text-[var(--accent)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[var(--text)]">
            {asset.name}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate font-mono text-[10px] text-[var(--text-muted)]">
            <span className="shrink-0 rounded bg-[var(--bg-input)] px-1.5 py-px uppercase tracking-wide">
              {asset.type}
            </span>
            <span className="min-w-0 truncate">{path}</span>
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
          {asset.size}
        </span>
      </div>

      {asset.type === 'texture' && asset.url && !imgError ? (
        <div className="flex flex-col gap-2">
          <div
            className="flex h-56 w-full items-center justify-center overflow-hidden rounded-md border border-[var(--border)]"
            style={{
              backgroundColor: 'var(--bg-input)',
              backgroundImage:
                'linear-gradient(45deg, color-mix(in srgb, var(--text-muted) 18%, transparent) 25%, transparent 25%), linear-gradient(-45deg, color-mix(in srgb, var(--text-muted) 18%, transparent) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--text-muted) 18%, transparent) 75%), linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--text-muted) 18%, transparent) 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
            }}
          >
            <img
              src={asset.url}
              alt=""
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
              onError={() => setImgError(true)}
            />
          </div>
          {canAssign && onActivate && (
            <button
              type="button"
              onClick={() => onActivate(asset)}
              className="text-left text-[10px] text-[var(--accent)] hover:underline"
            >
              Assign to selected entity
            </button>
          )}
        </div>
      ) : asset.type === 'script' ? (
        <div className="text-[10px] text-[var(--text-muted)]">
          {onActivate && (
            <button
              type="button"
              onClick={() => onActivate(asset)}
              className="block text-left text-[var(--accent)] hover:underline"
            >
              Open in script editor
            </button>
          )}
          <p className="mt-1 opacity-60">
            Attach by dragging onto an entity, or right-click in Files.
          </p>
        </div>
      ) : asset.type === 'audio' ? (
        <div className="text-[10px] text-[var(--text-muted)]">
          {asset.url ? (
            <button
              type="button"
              data-testid="asset-preview-play"
              className="flex items-center gap-1 text-left text-[var(--accent)] hover:underline"
              onClick={() => playSoundUrl(asset.url!)}
            >
              <Volume2 className="h-3 w-3" />
              Play
            </button>
          ) : (
            <p className="opacity-60">No playable URL for this clip.</p>
          )}
          {canAssign && onActivate && (
            <button
              type="button"
              onClick={() => onActivate(asset)}
              className="mt-1 block text-left text-[var(--accent)] hover:underline"
            >
              Assign to selected entity
            </button>
          )}
        </div>
      ) : asset.type === 'scene' ? (
        <div className="text-[10px] text-[var(--text-muted)]">
          {onActivate && (
            <button
              type="button"
              onClick={() => onActivate(asset)}
              className="block text-left text-[var(--accent)] hover:underline"
            >
              Open this scene
            </button>
          )}
        </div>
      ) : null}
    </section>
  )
}
