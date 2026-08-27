import { useEffect, useRef } from 'react'
import { entityMap, getWorldPosition } from '@/lib/transforms'
import type { Entity, ToolMode } from '@/types/scene'

interface ViewportProps {
  entities: Entity[]
  selectedIds: string[]
  tool: ToolMode
  playing: boolean
  snap: boolean
  gridSize?: number
  textureUrlById: Record<string, string>
  onSelect: (id: string | null, opts?: { additive?: boolean }) => void
  onMoveEntity: (id: string, worldX: number, worldY: number) => void
  onMoveBegin?: () => void
  onMoveEnd?: () => void
}

type DragMode = 'pan' | 'entity' | 'gizmo-x' | 'gizmo-y' | null

function snapValue(n: number, grid: number, enabled: boolean) {
  if (!enabled || grid <= 0) return Math.round(n)
  return Math.round(n / grid) * grid
}

export function Viewport({
  entities,
  selectedIds,
  tool,
  playing,
  snap,
  gridSize = 16,
  textureUrlById,
  onSelect,
  onMoveEntity,
  onMoveBegin,
  onMoveEnd,
}: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    originCamX: number
    originCamY: number
    entityId: string | null
    entityOriginWorldX: number
    entityOriginWorldY: number
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    originCamX: 0,
    originCamY: 0,
    entityId: null,
    entityOriginWorldX: 0,
    entityOriginWorldY: 0,
  })
  const playTimeRef = useRef(0)
  const entitiesRef = useRef(entities)
  const selectedRef = useRef(selectedIds)
  const playingRef = useRef(playing)
  const snapRef = useRef(snap)
  const gridRef = useRef(gridSize)
  const textureUrlRef = useRef(textureUrlById)
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>())

  entitiesRef.current = entities
  selectedRef.current = selectedIds
  playingRef.current = playing
  snapRef.current = snap
  gridRef.current = gridSize
  textureUrlRef.current = textureUrlById

  // Warm image cache when texture URLs change
  useEffect(() => {
    for (const [id, url] of Object.entries(textureUrlById)) {
      if (!url || imageCacheRef.current.has(id)) continue
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      imageCacheRef.current.set(id, img)
    }
  }, [textureUrlById])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = performance.now()

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { width, height } = wrap.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const worldFromScreen = (sx: number, sy: number) => {
      const cam = cameraRef.current
      const rect = canvas.getBoundingClientRect()
      const x = (sx - rect.left - rect.width / 2) / cam.zoom + cam.x
      const y = (sy - rect.top - rect.height / 2) / cam.zoom + cam.y
      return { x, y }
    }

    const primarySelected = () => {
      const ids = selectedRef.current
      if (!ids.length) return null
      return entitiesRef.current.find((e) => e.id === ids[ids.length - 1]) ?? null
    }

    const gizmoHit = (wx: number, wy: number) => {
      const e = primarySelected()
      if (!e || !e.visible) return null
      const byId = entityMap(entitiesRef.current)
      const world = getWorldPosition(e, byId)
      const handle = 10 / cameraRef.current.zoom
      const arm = Math.max(28, Math.min(e.width, e.height) * 0.75)
      // X handle at +arm
      if (Math.hypot(wx - (world.x + arm), wy - world.y) <= handle) return 'x'
      // Y handle at -arm (up in screen space is -y in our world if y increases down... our y increases down like canvas)
      if (Math.hypot(wx - world.x, wy - (world.y - arm)) <= handle) return 'y'
      return null
    }

    const hitTest = (wx: number, wy: number) => {
      const byId = entityMap(entitiesRef.current)
      const list = [...entitiesRef.current].reverse()
      for (const e of list) {
        if (!e.visible) continue
        const world = getWorldPosition(e, byId)
        const cos = Math.cos((-e.rotation * Math.PI) / 180)
        const sin = Math.sin((-e.rotation * Math.PI) / 180)
        const dx = wx - world.x
        const dy = wy - world.y
        const lx = dx * cos - dy * sin
        const ly = dx * sin + dy * cos
        if (Math.abs(lx) <= e.width / 2 && Math.abs(ly) <= e.height / 2) {
          return e
        }
      }
      return null
    }

    const draw = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (playingRef.current) playTimeRef.current += dt

      const rect = wrap.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const cam = cameraRef.current
      const t = playTimeRef.current
      const byId = entityMap(entitiesRef.current)
      const grid = gridRef.current

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#0e1014'
      ctx.fillRect(0, 0, w, h)

      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.scale(cam.zoom, cam.zoom)
      ctx.translate(-cam.x, -cam.y)

      const left = cam.x - w / 2 / cam.zoom
      const right = cam.x + w / 2 / cam.zoom
      const top = cam.y - h / 2 / cam.zoom
      const bottom = cam.y + h / 2 / cam.zoom
      const startX = Math.floor(left / grid) * grid
      const startY = Math.floor(top / grid) * grid

      ctx.strokeStyle = snapRef.current ? '#2a3344' : '#1f2430'
      ctx.lineWidth = 1 / cam.zoom
      ctx.beginPath()
      for (let x = startX; x <= right; x += grid) {
        ctx.moveTo(x, top)
        ctx.lineTo(x, bottom)
      }
      for (let y = startY; y <= bottom; y += grid) {
        ctx.moveTo(left, y)
        ctx.lineTo(right, y)
      }
      ctx.stroke()

      ctx.strokeStyle = '#3a4150'
      ctx.beginPath()
      ctx.moveTo(left, 0)
      ctx.lineTo(right, 0)
      ctx.moveTo(0, top)
      ctx.lineTo(0, bottom)
      ctx.stroke()

      for (const e of entitiesRef.current) {
        if (!e.visible) continue
        const world = getWorldPosition(e, byId)
        ctx.save()
        const bob =
          playingRef.current && e.kind === 'sprite'
            ? Math.sin(t * 3 + world.x * 0.01) * 4
            : 0
        ctx.translate(world.x, world.y + bob)
        ctx.rotate((e.rotation * Math.PI) / 180)

        if (e.kind === 'sprite') {
          const texId = e.textureId
          const img = texId ? imageCacheRef.current.get(texId) : undefined
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, -e.width / 2, -e.height / 2, e.width, e.height)
          } else {
            ctx.fillStyle = e.color
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height)
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.12)'
          ctx.lineWidth = 1 / cam.zoom
          ctx.strokeRect(-e.width / 2, -e.height / 2, e.width, e.height)
        } else if (e.kind === 'camera') {
          ctx.strokeStyle = '#3db8a8'
          ctx.lineWidth = 2 / cam.zoom
          ctx.strokeRect(-e.width / 2, -e.height / 2, e.width, e.height)
          ctx.beginPath()
          ctx.moveTo(-e.width / 2, -e.height / 2)
          ctx.lineTo(0, 0)
          ctx.lineTo(e.width / 2, -e.height / 2)
          ctx.stroke()
        } else {
          ctx.strokeStyle = '#8b93a7'
          ctx.lineWidth = 1.5 / cam.zoom
          ctx.beginPath()
          ctx.arc(0, 0, Math.min(e.width, e.height) / 2, 0, Math.PI * 2)
          ctx.stroke()
        }

        if (selectedRef.current.includes(e.id)) {
          ctx.strokeStyle = '#3db8a8'
          ctx.lineWidth = 2 / cam.zoom
          ctx.setLineDash([4 / cam.zoom, 3 / cam.zoom])
          ctx.strokeRect(
            -e.width / 2 - 4,
            -e.height / 2 - 4,
            e.width + 8,
            e.height + 8,
          )
          ctx.setLineDash([])
        }

        ctx.restore()

        ctx.save()
        ctx.translate(world.x, world.y + bob - e.height / 2 - 10 / cam.zoom)
        ctx.scale(1 / cam.zoom, 1 / cam.zoom)
        ctx.fillStyle = selectedRef.current.includes(e.id)
          ? '#e8eaef'
          : '#8b93a7'
        ctx.font = '500 11px "IBM Plex Sans", sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(e.name, 0, 0)
        ctx.restore()
      }

      // Transform gizmo on primary selection
      const primary = primarySelected()
      if (primary && primary.visible && tool === 'select') {
        const world = getWorldPosition(primary, byId)
        const arm = Math.max(28, Math.min(primary.width, primary.height) * 0.75)
        const handle = 5 / cam.zoom

        ctx.save()
        ctx.translate(world.x, world.y)
        // X axis
        ctx.strokeStyle = '#e06c75'
        ctx.fillStyle = '#e06c75'
        ctx.lineWidth = 2 / cam.zoom
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(arm, 0)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(arm, 0)
        ctx.lineTo(arm - 8 / cam.zoom, -4 / cam.zoom)
        ctx.lineTo(arm - 8 / cam.zoom, 4 / cam.zoom)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.arc(arm, 0, handle, 0, Math.PI * 2)
        ctx.fill()

        // Y axis (up = negative y)
        ctx.strokeStyle = '#98c379'
        ctx.fillStyle = '#98c379'
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(0, -arm)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, -arm)
        ctx.lineTo(-4 / cam.zoom, -arm + 8 / cam.zoom)
        ctx.lineTo(4 / cam.zoom, -arm + 8 / cam.zoom)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.arc(0, -arm, handle, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#e8eaef'
        ctx.beginPath()
        ctx.arc(0, 0, 3.5 / cam.zoom, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      ctx.restore()

      ctx.fillStyle = 'rgba(20,22,26,0.72)'
      ctx.fillRect(10, 10, 210, 44)
      ctx.strokeStyle = '#2c313c'
      ctx.strokeRect(10, 10, 210, 44)
      ctx.fillStyle = '#8b93a7'
      ctx.font = '500 11px "IBM Plex Mono", monospace'
      ctx.fillText(
        `zoom ${(cam.zoom * 100).toFixed(0)}% · ${playingRef.current ? 'PLAY' : 'EDIT'}${snapRef.current ? ' · SNAP' : ''}`,
        18,
        28,
      )
      ctx.fillText(`cam ${cam.x.toFixed(0)}, ${cam.y.toFixed(0)} · grid ${grid}`, 18, 44)

      raf = requestAnimationFrame(draw)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = cameraRef.current
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      cam.zoom = Math.min(4, Math.max(0.25, cam.zoom * factor))
    }

    const onPointerDown = (e: PointerEvent) => {
      const world = worldFromScreen(e.clientX, e.clientY)
      const wantsPan = tool === 'move' || e.button === 1 || e.altKey
      const byId = entityMap(entitiesRef.current)

      if (e.button === 0 && tool === 'select') {
        const axis = gizmoHit(world.x, world.y)
        const primary = primarySelected()
        if (axis && primary && !primary.locked) {
          const wpos = getWorldPosition(primary, byId)
          dragRef.current = {
            mode: axis === 'x' ? 'gizmo-x' : 'gizmo-y',
            startX: e.clientX,
            startY: e.clientY,
            originCamX: cameraRef.current.x,
            originCamY: cameraRef.current.y,
            entityId: primary.id,
            entityOriginWorldX: wpos.x,
            entityOriginWorldY: wpos.y,
          }
          onMoveBegin?.()
          canvas.setPointerCapture(e.pointerId)
          return
        }
      }

      const hit = hitTest(world.x, world.y)

      if (e.button === 0 && hit && tool === 'select') {
        onSelect(hit.id, { additive: e.metaKey || e.ctrlKey })
        if (!hit.locked) {
          const wpos = getWorldPosition(hit, byId)
          dragRef.current = {
            mode: 'entity',
            startX: e.clientX,
            startY: e.clientY,
            originCamX: cameraRef.current.x,
            originCamY: cameraRef.current.y,
            entityId: hit.id,
            entityOriginWorldX: wpos.x,
            entityOriginWorldY: wpos.y,
          }
          onMoveBegin?.()
        }
        canvas.setPointerCapture(e.pointerId)
        return
      }

      if (e.button === 0 && !hit && tool === 'select' && !e.altKey) {
        onSelect(null)
        return
      }

      if (wantsPan) {
        dragRef.current = {
          mode: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          originCamX: cameraRef.current.x,
          originCamY: cameraRef.current.y,
          entityId: null,
          entityOriginWorldX: 0,
          entityOriginWorldY: 0,
        }
        canvas.setPointerCapture(e.pointerId)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag.mode) return
      const cam = cameraRef.current
      const dx = (e.clientX - drag.startX) / cam.zoom
      const dy = (e.clientY - drag.startY) / cam.zoom
      const grid = gridRef.current
      const doSnap = snapRef.current && !e.shiftKey

      if (drag.mode === 'pan') {
        cam.x = drag.originCamX - dx
        cam.y = drag.originCamY - dy
      } else if (drag.mode === 'entity' && drag.entityId) {
        onMoveEntity(
          drag.entityId,
          snapValue(drag.entityOriginWorldX + dx, grid, doSnap),
          snapValue(drag.entityOriginWorldY + dy, grid, doSnap),
        )
      } else if (drag.mode === 'gizmo-x' && drag.entityId) {
        onMoveEntity(
          drag.entityId,
          snapValue(drag.entityOriginWorldX + dx, grid, doSnap),
          drag.entityOriginWorldY,
        )
      } else if (drag.mode === 'gizmo-y' && drag.entityId) {
        onMoveEntity(
          drag.entityId,
          drag.entityOriginWorldX,
          snapValue(drag.entityOriginWorldY + dy, grid, doSnap),
        )
      }
    }

    const onPointerUp = () => {
      if (
        dragRef.current.mode === 'entity' ||
        dragRef.current.mode === 'gizmo-x' ||
        dragRef.current.mode === 'gizmo-y'
      ) {
        onMoveEnd?.()
      }
      dragRef.current.mode = null
      dragRef.current.entityId = null
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [tool, onSelect, onMoveEntity, onMoveBegin, onMoveEnd])

  return (
    <div
      ref={wrapRef}
      className="relative min-h-0 min-w-0 flex-1 bg-[var(--viewport)]"
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ cursor: tool === 'move' ? 'grab' : 'default' }}
      />
    </div>
  )
}
