import type { AssetItem } from '@/types/scene'

const pool = new Map<string, HTMLAudioElement>()

function clipForUrl(url: string): HTMLAudioElement {
  let clip = pool.get(url)
  if (!clip) {
    clip = new Audio(url)
    pool.set(url, clip)
  }
  return clip
}

export function playSoundUrl(url: string, volume = 0.85) {
  try {
    const clip = clipForUrl(url)
    const node = clip.cloneNode(true) as HTMLAudioElement
    node.volume = volume
    void node.play().catch(() => {
      // Autoplay policies may block until user gesture; Play button counts.
    })
  } catch {
    // ignore playback errors in editor preview
  }
}

export function resolveAudioAsset(
  assets: AssetItem[],
  opts: { id?: string; name?: string },
): AssetItem | undefined {
  if (opts.id) {
    const byId = assets.find((a) => a.type === 'audio' && a.id === opts.id)
    if (byId) return byId
  }
  if (opts.name) {
    const lower = opts.name.toLowerCase()
    return assets.find(
      (a) =>
        a.type === 'audio' &&
        (a.name.toLowerCase() === lower ||
          a.relativePath?.toLowerCase().endsWith(lower)),
    )
  }
  return undefined
}

export function playSoundAsset(assets: AssetItem[], opts: { id?: string; name?: string }) {
  const asset = resolveAudioAsset(assets, opts)
  if (!asset?.url) return false
  playSoundUrl(asset.url)
  return true
}
