import type { DrawCmd, RenderFrame } from '@/lib/render-frame'

export type ImageCache = Map<string, { url: string; img: HTMLImageElement }>

function readyImage(
  cache: ImageCache,
  textureId: string | null,
): HTMLImageElement | null {
  if (!textureId) return null
  const img = cache.get(textureId)?.img
  if (!img || !img.complete || img.naturalWidth <= 0) return null
  return img
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  cmd: Extract<DrawCmd, { kind: 'sprite' }>,
  cache: ImageCache,
) {
  ctx.save()
  ctx.translate(cmd.x, cmd.y)
  if (cmd.rotation) ctx.rotate((cmd.rotation * Math.PI) / 180)
  const img = readyImage(cache, cmd.textureId)
  if (img && cmd.w > 0 && cmd.h > 0) {
    ctx.drawImage(img, -cmd.w / 2, -cmd.h / 2, cmd.w, cmd.h)
  } else {
    ctx.fillStyle = cmd.color
    ctx.fillRect(-cmd.w / 2, -cmd.h / 2, cmd.w, cmd.h)
  }
  ctx.restore()
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  cmd: Extract<DrawCmd, { kind: 'tile' }>,
  cache: ImageCache,
) {
  const img = readyImage(cache, cmd.textureId)
  const ts = cmd.size
  if (img && ts > 0) {
    const cols = Math.max(1, Math.floor(img.naturalWidth / ts))
    const sx = (cmd.index % cols) * ts
    const sy = Math.floor(cmd.index / cols) * ts
    ctx.drawImage(img, sx, sy, ts, ts, cmd.x, cmd.y, ts, ts)
  } else {
    ctx.fillStyle = cmd.color
    ctx.fillRect(cmd.x, cmd.y, ts, ts)
  }
}

/** Execute a RenderFrame in world space. Caller sets the camera transform. */
export function executeCanvasFrame(
  ctx: CanvasRenderingContext2D,
  frame: RenderFrame,
  cache: ImageCache,
) {
  for (const cmd of frame.commands) {
    if (cmd.kind === 'sprite') drawSprite(ctx, cmd, cache)
    else drawTile(ctx, cmd, cache)
  }
}
