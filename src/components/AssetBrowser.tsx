import { cn } from '@/lib/utils'
import type { AssetItem } from '@/types/scene'
import { FileAudio, FileCode2, Image, LayoutTemplate } from 'lucide-react'

interface AssetBrowserProps {
  assets: AssetItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onActivate?: (asset: AssetItem) => void
}

const icons = {
  texture: Image,
  script: FileCode2,
  audio: FileAudio,
  scene: LayoutTemplate,
} as const

export function AssetBrowser({
  assets,
  selectedId,
  onSelect,
  onActivate,
}: AssetBrowserProps) {
  return (
    <section className="panel-animate flex h-28 shrink-0 flex-col border-t border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="flex h-8 items-center border-b border-[var(--border)] px-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Assets
        </h2>
        <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
          dbl-click texture → assign
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-2">
        {assets.map((asset) => {
          const Icon = icons[asset.type]
          const selected = asset.id === selectedId
          return (
            <button
              key={asset.id}
              type="button"
              data-testid={`asset-${asset.id}`}
              onClick={() => onSelect(asset.id)}
              onDoubleClick={() => onActivate?.(asset)}
              title={
                asset.type === 'texture'
                  ? 'Double-click to assign to selection'
                  : asset.name
              }
              className={cn(
                'flex w-28 shrink-0 flex-col rounded-md border px-2 py-2 text-left transition-colors',
                selected
                  ? 'border-[var(--accent-dim)] bg-[var(--select)]'
                  : 'border-[var(--border)] bg-[var(--bg-panel-raised)] hover:border-[var(--border-strong)]',
              )}
            >
              <div className="mb-2 flex h-12 items-center justify-center overflow-hidden rounded bg-[var(--bg-input)]">
                {asset.type === 'texture' && asset.url ? (
                  <img
                    src={asset.url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Icon className="h-5 w-5 text-[var(--accent)]" />
                )}
              </div>
              <div className="truncate text-xs text-[var(--text)]">
                {asset.name}
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase text-[var(--text-muted)]">
                {asset.type} · {asset.size}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
