import { useEffect, useRef } from 'react'
import { findPlayCamera, cameraWorldCenter, zoomForCamera } from '@/lib/runtime-camera'
import { sortEntitiesForDraw } from '@/lib/draw-order'
import { executeCanvasFrame } from '@/lib/render-canvas'
import { buildRenderFrame } from '@/lib/render-frame'
import { createWebGlRenderer } from '@/lib/render-webgl'
import { entityMap, getWorldPosition } from '@/lib/transforms'
import { tilemapBounds, tileSizeOf, worldToCell } from '@/lib/tilemap'
import type { Entity, RenderLayer, ToolMode } from '@/types/scene'

interface ViewportProps {
  entities: Entity[]
  selectedIds: string[]
  tool: ToolMode
  playing: boolean
  snap: boolean
  gridSize?: number
  textureUrlById: Record<string, string>
  renderLayers?: RenderLayer[]
  onSelect: (id: string | null, opts?: { additive?: boolean }) => void
  onMoveEntity: (id: string, worldX: number, worldY: number) => void
  onMoveBegin?: () => void
  onMoveEnd?: () => void
  onSceneMenu?: (info: {
    x: number
    y: number
    entityId: string | null
    worldX: number
    worldY: number
  }) => void
  onPlacePrefab?: (prefabId: string, worldX: number, worldY: number) => void
  tileBrush?: number
  onPaintBegin?: () => void
  onPaintTile?: (id: string, col: number, row: number, index: number | null) => void
  onPaintEnd?: () => void
}

type DragMode = 'pan' | 'entity' | 'gizmo-x' | 'gizmo-y' | 'paint' | null

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
  renderLayers = [],
  onSelect,
  onMoveEntity,
  onMoveBegin,
  onMoveEnd,
  onSceneMenu,
  onPlacePrefab,
  tileBrush = 0,
  onPaintBegin,
  onPaintTile,
  onPaintEnd,
}: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glCanvasRef = useRef<HTMLCanvasElement>(null)
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
    erase?: boolean
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    originCamX: 0,
    originCamY: 0,
    entityId: null,
    entityOriginWorldX: 0,
    entityOriginWorldY: 0,
    erase: false,
  })
  const savedEditorCamRef = useRef<{ x: number; y: number; zoom: number } | null>(
    null,
  )
  const entitiesRef = useRef(entities)
  const selectedRef = useRef(selectedIds)
  const playingRef = useRef(playing)
  const snapRef = useRef(snap)
  const gridRef = useRef(gridSize)
  const textureUrlRef = useRef(textureUrlById)
  const layersRef = useRef(renderLayers)
  const toolRef = useRef(tool)
  const onSelectRef = useRef(onSelect)
  const onMoveEntityRef = useRef(onMoveEntity)
  const onMoveBeginRef = useRef(onMoveBegin)
  const onMoveEndRef = useRef(onMoveEnd)
  const imageCacheRef = useRef(
    new Map<string, { url: string; img: HTMLImageElement }>(),
  )
  const sceneMenuRef = useRef(onSceneMenu)
  const placePrefabRef = useRef(onPlacePrefab)
  const tileBrushRef = useRef(tileBrush)
  const paintBeginRef = useRef(onPaintBegin)
  const paintTileRef = useRef(onPaintTile)
  const paintEndRef = useRef(onPaintEnd)

  entitiesRef.current = entities
  selectedRef.current = selectedIds
  playingRef.current = playing
  snapRef.current = snap
  gridRef.current = gridSize
  textureUrlRef.current = textureUrlById
  layersRef.current = renderLayers
  toolRef.current = tool
  onSelectRef.current = onSelect
  onMoveEntityRef.current = onMoveEntity
  onMoveBeginRef.current = onMoveBegin
  onMoveEndRef.current = onMoveEnd
  sceneMenuRef.current = onSceneMenu
  placePrefabRef.current = onPlacePrefab
  tileBrushRef.current = tileBrush
  paintBeginRef.current = onPaintBegin
  paintTileRef.current = onPaintTile
  paintEndRef.current = onPaintEnd

  // Warm image cache when texture URLs change; drop stale ids
  useEffect(() => {
    const cache = imageCacheRef.current
    const keep = new Set<string>()
    for (const [id, url] of Object.entries(textureUrlById)) {
      if (!url) continue
      keep.add(id)
      const hit = cache.get(id)
      if (hit?.url === url) continue
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      cache.set(id, { url, img })
    }
    for (const id of [...cache.keys()]) {
      if (!keep.has(id)) cache.delete(id)
    }
  }, [textureUrlById])

  useEffect(() => {
    if (playing) {
      savedEditorCamRef.current = { ...cameraRef.current }
    } else if (savedEditorCamRef.current) {
      cameraRef.current = { ...savedEditorCamRef.current }
      savedEditorCamRef.current = null
    }
  }, [playing])

  // Mount the rAF loop once. Play ticks rewrite `entities`, which used to
  // recreate onSelect and tear this effect down — assigning canvas.width
  // clears the bitmap, so you only ever saw a stray frame.
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    const gl = glCanvasRef.current
      ? createWebGlRenderer(glCanvasRef.current)
      : null

    let raf = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { width, height } = wrap.getBoundingClientRect()
      const nextW = Math.max(1, Math.floor(width * dpr))
      const nextH = Math.max(1, Math.floor(height * dpr))
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW
        canvas.height = nextH
      }
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      gl?.resize(width, height, dpr)
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
      const arm =
        e.kind === 'tilemap'
          ? Math.max(28, tileSizeOf(e) * 2)
          : Math.max(28, Math.min(e.width, e.height) * 0.75)
      if (Math.hypot(wx - (world.x + arm), wy - world.y) <= handle) return 'x'
      if (Math.hypot(wx - world.x, wy - (world.y - arm)) <= handle) return 'y'
      return null
    }

    const hitTest = (wx: number, wy: number) => {
      const byId = entityMap(entitiesRef.current)
      const list = [...sortEntitiesForDraw(entitiesRef.current, layersRef.current)].reverse()
      for (const e of list) {
        if (!e.visible) continue
        const world = getWorldPosition(e, byId)
        if (e.kind === 'tilemap') {
          const b = tilemapBounds(e, world)
          if (
            wx >= b.x &&
            wx < b.x + b.w &&
            wy >= b.y &&
            wy < b.y + b.h
          ) {
            return e
          }
          continue
        }
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

    const paintFrame = () => {
      const rect = wrap.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const cam = cameraRef.current
      const byId = entityMap(entitiesRef.current)
      const grid = gridRef.current
      const inPlay = playingRef.current
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (!Number.isFinite(cam.x)) cam.x = 0
      if (!Number.isFinite(cam.y)) cam.y = 0
      if (!Number.isFinite(cam.zoom) || cam.zoom <= 0) cam.zoom = 1

      if (inPlay) {
        const playCam = findPlayCamera(entitiesRef.current)
        if (playCam) {
          const center = cameraWorldCenter(entitiesRef.current, playCam)
          if (Number.isFinite(center.x)) cam.x = center.x
          if (Number.isFinite(center.y)) cam.y = center.y
          const z = zoomForCamera(playCam, w, h)
          if (Number.isFinite(z) && z > 0) cam.zoom = z
        }
      }

      const left = cam.x - w / 2 / cam.zoom
      const right = cam.x + w / 2 / cam.zoom
      const top = cam.y - h / 2 / cam.zoom
      const bottom = cam.y + h / 2 / cam.zoom
      const frame = buildRenderFrame(entitiesRef.current, layersRef.current, {
        left,
        right,
        top,
        bottom,
      })

      if (gl) {
        gl.resize(w, h, dpr)
        const gcol = inPlay
          ? ([26 / 255, 31 / 255, 42 / 255, 1] as const)
          : snapRef.current
            ? ([42 / 255, 51 / 255, 68 / 255, 1] as const)
            : ([31 / 255, 36 / 255, 48 / 255, 1] as const)
        gl.draw(frame, imageCacheRef.current, cam, w, h, {
          size: grid,
          color: [gcol[0], gcol[1], gcol[2], gcol[3]],
          axis: [58 / 255, 65 / 255, 80 / 255, 1],
        })
        ctx.clearRect(0, 0, w, h)
      } else {
        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = '#0e1014'
        ctx.fillRect(0, 0, w, h)
      }

      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.scale(cam.zoom, cam.zoom)
      ctx.translate(-cam.x, -cam.y)

      if (!gl) {
        if (Number.isFinite(grid) && grid > 0) {
          const startX = Math.floor(left / grid) * grid
          const startY = Math.floor(top / grid) * grid
          ctx.strokeStyle = inPlay
            ? '#1a1f2a'
            : snapRef.current
              ? '#2a3344'
              : '#1f2430'
          ctx.lineWidth = 1 / cam.zoom
          ctx.beginPath()
          let lines = 0
          for (let x = startX; x <= right && lines < 512; x += grid, lines++) {
            ctx.moveTo(x, top)
            ctx.lineTo(x, bottom)
          }
          lines = 0
          for (let y = startY; y <= bottom && lines < 512; y += grid, lines++) {
            ctx.moveTo(left, y)
            ctx.lineTo(right, y)
          }
          ctx.stroke()
        }
        ctx.strokeStyle = '#3a4150'
        ctx.beginPath()
        ctx.moveTo(left, 0)
        ctx.lineTo(right, 0)
        ctx.moveTo(0, top)
        ctx.lineTo(0, bottom)
        ctx.stroke()
        executeCanvasFrame(ctx, frame, imageCacheRef.current)
      }

      for (const e of sortEntitiesForDraw(entitiesRef.current, layersRef.current)) {
        if (!e.visible) continue
        if (inPlay && e.kind === 'camera') continue
        const world = getWorldPosition(e, byId)
        ctx.save()
        ctx.translate(world.x, world.y)
        if (e.kind !== 'tilemap') {
          ctx.rotate((e.rotation * Math.PI) / 180)
        }

        if (e.kind === 'tilemap') {
          if (!inPlay && selectedRef.current.includes(e.id)) {
            const ts = tileSizeOf(e)
            const b = tilemapBounds(e, { x: 0, y: 0 })
            ctx.strokeStyle = 'rgba(61, 184, 168, 0.45)'
            ctx.lineWidth = 1 / cam.zoom
            ctx.setLineDash([4 / cam.zoom, 3 / cam.zoom])
            ctx.strokeRect(b.x, b.y, b.w, b.h)
            ctx.setLineDash([])
            const gw = Math.max(b.w, ts)
            const gh = Math.max(b.h, ts)
            ctx.strokeStyle = 'rgba(61, 184, 168, 0.18)'
            ctx.beginPath()
            for (let x = b.x; x <= b.x + gw + 0.01; x += ts) {
              ctx.moveTo(x, b.y)
              ctx.lineTo(x, b.y + gh)
            }
            for (let y = b.y; y <= b.y + gh + 0.01; y += ts) {
              ctx.moveTo(b.x, y)
              ctx.lineTo(b.x + gw, y)
            }
            ctx.stroke()
          }
        } else if (e.kind === 'sprite') {
          if (selectedRef.current.includes(e.id) && !inPlay) {
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

        if (selectedRef.current.includes(e.id) && !inPlay && e.kind !== 'tilemap' && e.kind !== 'sprite') {
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

        if (!inPlay) {
          ctx.save()
          if (e.kind === 'tilemap') {
            const b = tilemapBounds(e, world)
            ctx.translate(b.x + b.w / 2, b.y - 10 / cam.zoom)
          } else {
            ctx.translate(world.x, world.y - e.height / 2 - 10 / cam.zoom)
          }
          ctx.scale(1 / cam.zoom, 1 / cam.zoom)
          ctx.fillStyle = selectedRef.current.includes(e.id)
            ? '#e8eaef'
            : '#8b93a7'
          ctx.font = '500 11px "IBM Plex Sans", sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(e.name, 0, 0)
          ctx.restore()
        }
      }

      const primary = primarySelected()
      if (primary && primary.visible && toolRef.current === 'select' && !inPlay) {
        const world = getWorldPosition(primary, byId)
        const arm =
          primary.kind === 'tilemap'
            ? Math.max(28, tileSizeOf(primary) * 2)
            : Math.max(28, Math.min(primary.width, primary.height) * 0.75)
        const handle = 5 / cam.zoom

        ctx.save()
        ctx.translate(world.x, world.y)
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
      ctx.fillRect(10, 10, inPlay ? 250 : 210, inPlay ? 58 : 44)
      ctx.strokeStyle = '#2c313c'
      ctx.strokeRect(10, 10, inPlay ? 250 : 210, inPlay ? 58 : 44)
      ctx.fillStyle = '#8b93a7'
      ctx.font = '500 11px "IBM Plex Mono", monospace'
      ctx.fillText(
        `zoom ${(cam.zoom * 100).toFixed(0)}% · ${inPlay ? 'PLAY' : 'EDIT'}${snapRef.current && !inPlay ? ' · SNAP' : ''}`,
        18,
        28,
      )
      if (inPlay) {
        ctx.fillText('← → move · Space = jump sound', 18, 44)
        ctx.fillText(`cam ${cam.x.toFixed(0)}, ${cam.y.toFixed(0)}`, 18, 58)
      } else {
        ctx.fillText(`cam ${cam.x.toFixed(0)}, ${cam.y.toFixed(0)} · grid ${grid}`, 18, 44)
      }
    }

    const draw = () => {
      try {
        paintFrame()
      } catch (err) {
        console.error('viewport draw', err)
      }
      raf = requestAnimationFrame(draw)
    }

    const onWheel = (e: WheelEvent) => {
      if (playingRef.current) return
      e.preventDefault()
      const cam = cameraRef.current
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      cam.zoom = Math.min(4, Math.max(0.25, cam.zoom * factor))
    }

    const paintAt = (wx: number, wy: number, erase: boolean) => {
      const map = primarySelected()
      if (!map || map.kind !== 'tilemap' || map.locked) return
      const byId = entityMap(entitiesRef.current)
      const origin = getWorldPosition(map, byId)
      const cell = worldToCell(origin, tileSizeOf(map), wx, wy)
      paintTileRef.current?.(
        map.id,
        cell.x,
        cell.y,
        erase ? null : tileBrushRef.current,
      )
    }

    const onPointerDown = (e: PointerEvent) => {
      if (playingRef.current) return
      const world = worldFromScreen(e.clientX, e.clientY)
      const wantsPan = toolRef.current === 'move' || e.button === 1 || e.altKey
      const byId = entityMap(entitiesRef.current)

      if (e.button === 0 && toolRef.current === 'select') {
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
          onMoveBeginRef.current?.()
          canvas.setPointerCapture(e.pointerId)
          return
        }
      }

      const primary = primarySelected()
      const wantsErase = e.button === 2 || e.shiftKey
      if (
        !playingRef.current &&
        toolRef.current === 'select' &&
        primary?.kind === 'tilemap' &&
        !primary.locked &&
        paintTileRef.current &&
        (e.button === 0 || e.button === 2)
      ) {
        const hit = hitTest(world.x, world.y)
        if (!hit || hit.id === primary.id) {
          if (e.button === 2) e.preventDefault()
          paintBeginRef.current?.()
          dragRef.current = {
            mode: 'paint',
            startX: e.clientX,
            startY: e.clientY,
            originCamX: cameraRef.current.x,
            originCamY: cameraRef.current.y,
            entityId: primary.id,
            entityOriginWorldX: 0,
            entityOriginWorldY: 0,
            erase: wantsErase,
          }
          paintAt(world.x, world.y, wantsErase)
          canvas.setPointerCapture(e.pointerId)
          return
        }
      }

      const hit = hitTest(world.x, world.y)

      if (e.button === 0 && hit && toolRef.current === 'select') {
        onSelectRef.current(hit.id, { additive: e.metaKey || e.ctrlKey })
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
          onMoveBeginRef.current?.()
        }
        canvas.setPointerCapture(e.pointerId)
        return
      }

      if (e.button === 0 && !hit && toolRef.current === 'select' && !e.altKey) {
        onSelectRef.current(null)
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
        onMoveEntityRef.current(
          drag.entityId,
          snapValue(drag.entityOriginWorldX + dx, grid, doSnap),
          snapValue(drag.entityOriginWorldY + dy, grid, doSnap),
        )
      } else if (drag.mode === 'gizmo-x' && drag.entityId) {
        onMoveEntityRef.current(
          drag.entityId,
          snapValue(drag.entityOriginWorldX + dx, grid, doSnap),
          drag.entityOriginWorldY,
        )
      } else if (drag.mode === 'gizmo-y' && drag.entityId) {
        onMoveEntityRef.current(
          drag.entityId,
          drag.entityOriginWorldX,
          snapValue(drag.entityOriginWorldY + dy, grid, doSnap),
        )
      } else if (drag.mode === 'paint') {
        const world = worldFromScreen(e.clientX, e.clientY)
        paintAt(world.x, world.y, Boolean(drag.erase))
      }
    }

    const onPointerUp = () => {
      if (
        dragRef.current.mode === 'entity' ||
        dragRef.current.mode === 'gizmo-x' ||
        dragRef.current.mode === 'gizmo-y'
      ) {
        onMoveEndRef.current?.()
      }
      if (dragRef.current.mode === 'paint') {
        paintEndRef.current?.()
      }
      dragRef.current.mode = null
      dragRef.current.entityId = null
    }

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      if (playingRef.current) return
      if (dragRef.current.mode === 'paint') return
      const world = worldFromScreen(e.clientX, e.clientY)
      const hit = hitTest(world.x, world.y)
      const grid = gridRef.current
      const doSnap = snapRef.current
      sceneMenuRef.current?.({
        x: e.clientX,
        y: e.clientY,
        entityId: hit?.id ?? null,
        worldX: snapValue(world.x, grid, doSnap),
        worldY: snapValue(world.y, grid, doSnap),
      })
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('contextmenu', onContextMenu)

    const onDragOver = (e: DragEvent) => {
      if (!placePrefabRef.current) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      const id = e.dataTransfer?.getData('text/strata-prefab')
      if (!id) return
      e.preventDefault()
      const world = worldFromScreen(e.clientX, e.clientY)
      const grid = gridRef.current
      placePrefabRef.current?.(
        id,
        snapValue(world.x, grid, snapRef.current),
        snapValue(world.y, grid, snapRef.current),
      )
    }
    wrap.addEventListener('dragover', onDragOver)
    wrap.addEventListener('drop', onDrop)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      gl?.destroy()
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('contextmenu', onContextMenu)
      wrap.removeEventListener('dragover', onDragOver)
      wrap.removeEventListener('drop', onDrop)
    }
    // Intentionally empty: all inputs are refs so Play ticks do not remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-0 w-full bg-[var(--viewport)]"
    >
      <canvas
        ref={glCanvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        aria-hidden
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none"
        style={{ cursor: tool === 'move' ? 'grab' : 'default' }}
      />
    </div>
  )
}
