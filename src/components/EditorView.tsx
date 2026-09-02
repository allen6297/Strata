import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ThemeMode } from '@/lib/theme'
import type { CameraReadout, Entity, SceneMode, ToolMode } from '@/types/scene'

interface EditorViewProps {
  entities: Entity[]
  selectedId: string | null
  tool: ToolMode
  playing: boolean
  theme: ThemeMode
  mode: SceneMode
  onSelect: (id: string | null) => void
  onMoveEntity: (id: string, x: number, y: number, z: number) => void
  onMoveBegin?: () => void
  onMoveEnd?: () => void
  onCameraChange?: (camera: CameraReadout) => void
}

function cssColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

function hexColor(hex: string) {
  try {
    return new THREE.Color(hex)
  } catch {
    return new THREE.Color('#d4848e')
  }
}

export function EditorView({
  entities,
  selectedId,
  tool,
  playing,
  theme,
  mode,
  onSelect,
  onMoveEntity,
  onMoveBegin,
  onMoveEnd,
  onCameraChange,
}: EditorViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const entitiesRef = useRef(entities)
  const selectedRef = useRef(selectedId)
  const toolRef = useRef(tool)
  const playingRef = useRef(playing)
  const modeRef = useRef(mode)
  const onSelectRef = useRef(onSelect)
  const onMoveRef = useRef(onMoveEntity)
  const onBeginRef = useRef(onMoveBegin)
  const onEndRef = useRef(onMoveEnd)
  const onCamRef = useRef(onCameraChange)
  const [hud, setHud] = useState<CameraReadout>({ x: 0, y: 0, z: 0, zoom: 1 })

  entitiesRef.current = entities
  selectedRef.current = selectedId
  toolRef.current = tool
  playingRef.current = playing
  modeRef.current = mode
  onSelectRef.current = onSelect
  onMoveRef.current = onMoveEntity
  onBeginRef.current = onMoveBegin
  onEndRef.current = onMoveEnd
  onCamRef.current = onCameraChange

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    wrap.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const group = new THREE.Group()
    scene.add(group)

    const ambient = new THREE.AmbientLight(0xffffff, 0.55)
    scene.add(ambient)
    const hemi = new THREE.HemisphereLight(0xf2c8b4, 0x241016, 0.4)
    scene.add(hemi)

    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000)
    const persp = new THREE.PerspectiveCamera(50, 1, 0.1, 4000)
    persp.position.set(160, 140, 220)

    const controls = new OrbitControls(persp, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 0, 0)

    const grid2d = new THREE.GridHelper(640, 20)
    grid2d.rotation.x = Math.PI / 2
    const grid3d = new THREE.GridHelper(640, 20)
    scene.add(grid2d)
    scene.add(grid3d)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const dragPlane = new THREE.Plane()
    const hit = new THREE.Vector3()

    let dragId: string | null = null
    let dragOffset = new THREE.Vector3()
    let lastHud = ''
    let pan2d = { x: 0, y: 0, zoom: 1 }
    let panning = false
    let panStart = { x: 0, y: 0, cx: 0, cy: 0 }

    const objects = new Map<string, THREE.Object3D>()

    const applyTheme = () => {
      const bg = cssColor('--viewport', '#10080b')
      const gridC = cssColor('--grid', '#2a151c')
      const axis = cssColor('--axis', '#5a3844')
      scene.background = new THREE.Color(bg)
      for (const grid of [grid2d, grid3d]) {
        const mats = Array.isArray(grid.material) ? grid.material : [grid.material]
        if (mats[0]) (mats[0] as THREE.LineBasicMaterial).color = new THREE.Color(gridC)
        if (mats[1]) (mats[1] as THREE.LineBasicMaterial).color = new THREE.Color(axis)
      }
    }

    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect()
      const w = Math.max(1, width)
      const h = Math.max(1, height)
      renderer.setSize(w, h, false)
      persp.aspect = w / h
      persp.updateProjectionMatrix()
      const z = pan2d.zoom
      ortho.left = -w / 2 / z
      ortho.right = w / 2 / z
      ortho.top = h / 2 / z
      ortho.bottom = -h / 2 / z
      ortho.position.set(pan2d.x, pan2d.y, 800)
      ortho.lookAt(pan2d.x, pan2d.y, 0)
      ortho.updateProjectionMatrix()
    }

    const makeObject = (e: Entity) => {
      let visual: THREE.Object3D
      if (e.kind === 'mesh' && e.meshPrimitive === 'plane') {
        visual = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshStandardMaterial({
            color: hexColor(e.color),
            side: THREE.DoubleSide,
          }),
        )
      } else if (e.kind === 'mesh' || e.kind === 'sprite' || e.kind === 'empty') {
        const geo =
          e.kind === 'empty'
            ? new THREE.SphereGeometry(0.5, 12, 8)
            : new THREE.BoxGeometry(1, 1, 1)
        const mat =
          e.kind === 'empty'
            ? new THREE.MeshBasicMaterial({
                color: hexColor(e.color),
                wireframe: true,
              })
            : new THREE.MeshStandardMaterial({ color: hexColor(e.color) })
        visual = new THREE.Mesh(geo, mat)
      } else if (e.kind === 'camera') {
        visual = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshBasicMaterial({
            color: hexColor(e.color),
            wireframe: true,
          }),
        )
      } else if (e.kind === 'light') {
        visual = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 12, 8),
          new THREE.MeshBasicMaterial({ color: hexColor(e.color) }),
        )
      } else {
        visual = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.5),
          new THREE.MeshBasicMaterial({
            color: hexColor(e.color),
            wireframe: true,
          }),
        )
      }

      const pivot = new THREE.Group()
      pivot.userData.entityId = e.id
      visual.userData.entityId = e.id
      visual.traverse((c) => {
        c.userData.entityId = e.id
      })
      pivot.add(visual)
      pivot.userData.visual = visual
      return pivot
    }

    const syncEntities = () => {
      const list = entitiesRef.current
      const ids = new Set(list.map((e) => e.id))
      for (const [id, obj] of objects) {
        if (!ids.has(id)) {
          obj.parent?.remove(obj)
          objects.delete(id)
        }
      }
      // Parents first so children attach to existing pivots
      const ordered = [...list].sort((a, b) => {
        const depth = (e: Entity) => {
          let d = 0
          let p = e.parentId
          while (p) {
            d++
            p = list.find((x) => x.id === p)?.parentId ?? null
          }
          return d
        }
        return depth(a) - depth(b)
      })
      for (const e of ordered) {
        let obj = objects.get(e.id)
        if (!obj) {
          obj = makeObject(e)
          objects.set(e.id, obj)
        }
        const parentObj =
          e.parentId && objects.has(e.parentId)
            ? objects.get(e.parentId)!
            : group
        if (obj.parent !== parentObj) {
          parentObj.add(obj)
        }
        obj.visible = e.visible
        obj.position.set(e.x, e.y, modeRef.current === '3d' ? e.z : 0)
        obj.rotation.set(
          THREE.MathUtils.degToRad(e.rotationX),
          THREE.MathUtils.degToRad(e.rotationY),
          THREE.MathUtils.degToRad(e.rotationZ || e.rotation),
        )
        const visual = obj.userData.visual as THREE.Object3D
        const sx = Math.max(1, e.width) * e.scaleX
        const sy = Math.max(1, e.height) * e.scaleY
        const sz = Math.max(1, e.depth) * e.scaleZ
        if (e.kind === 'mesh' && e.meshPrimitive === 'plane') {
          visual.scale.set(sx, sy, 1)
        } else if (e.kind === 'sprite') {
          visual.scale.set(sx, sy, Math.max(4, sz * 0.15))
        } else {
          visual.scale.set(sx, sy, sz)
        }
        visual.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.MeshStandardMaterial
            if ('color' in mat && e.kind !== 'empty') {
              mat.color = hexColor(e.color)
            }
            if ('emissive' in mat) {
              mat.emissive = hexColor(
                selectedRef.current === e.id
                  ? cssColor('--accent', '#f2c8b4')
                  : '#000000',
              )
              mat.emissiveIntensity = selectedRef.current === e.id ? 0.18 : 0
            }
          }
        })
      }
    }

    const activeCamera = () =>
      modeRef.current === '3d' ? persp : ortho

    const publishCam = () => {
      let next: CameraReadout
      if (modeRef.current === '3d') {
        next = {
          x: persp.position.x,
          y: persp.position.y,
          z: persp.position.z,
          zoom: 120 / Math.max(1, persp.position.distanceTo(controls.target)),
        }
      } else {
        next = { x: pan2d.x, y: pan2d.y, z: 0, zoom: pan2d.zoom }
      }
      const key = `${next.x.toFixed(1)}:${next.y.toFixed(1)}:${next.z.toFixed(1)}:${next.zoom.toFixed(3)}`
      if (key === lastHud) return
      lastHud = key
      setHud(next)
      onCamRef.current?.(next)
    }

    const ndc = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
    }

    const pick = (ev: PointerEvent) => {
      ndc(ev)
      raycaster.setFromCamera(pointer, activeCamera())
      const hits = raycaster.intersectObjects(group.children, true)
      const found = hits.find((h) => h.object.userData.entityId)
      return found?.object.userData.entityId as string | undefined
    }

    const setDragPlane = (origin: THREE.Vector3) => {
      if (modeRef.current === '3d') {
        dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin)
      } else {
        dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), origin)
      }
    }

    const onPointerDown = (ev: PointerEvent) => {
      const wantsPan =
        toolRef.current === 'move' || ev.button === 1 || ev.altKey
      if (modeRef.current === '2d' && wantsPan) {
        panning = true
        panStart = { x: ev.clientX, y: ev.clientY, cx: pan2d.x, cy: pan2d.y }
        renderer.domElement.setPointerCapture(ev.pointerId)
        return
      }
      if (ev.button !== 0) return
      if (toolRef.current !== 'select' || ev.altKey) return
      const id = pick(ev)
      if (!id) {
        onSelectRef.current(null)
        return
      }
      onSelectRef.current(id)
      const ent = entitiesRef.current.find((e) => e.id === id)
      if (!ent || ent.locked) return
      ndc(ev)
      raycaster.setFromCamera(pointer, activeCamera())
      const origin = new THREE.Vector3(ent.x, ent.y, modeRef.current === '3d' ? ent.z : 0)
      setDragPlane(origin)
      raycaster.ray.intersectPlane(dragPlane, hit)
      dragOffset.copy(origin).sub(hit)
      dragId = id
      onBeginRef.current?.()
      renderer.domElement.setPointerCapture(ev.pointerId)
    }

    const onPointerMove = (ev: PointerEvent) => {
      if (panning && modeRef.current === '2d') {
        const z = pan2d.zoom
        pan2d.x = panStart.cx - (ev.clientX - panStart.x) / z
        pan2d.y = panStart.cy + (ev.clientY - panStart.y) / z
        resize()
        return
      }
      if (!dragId) return
      ndc(ev)
      raycaster.setFromCamera(pointer, activeCamera())
      if (!raycaster.ray.intersectPlane(dragPlane, hit)) return
      const pos = hit.add(dragOffset)
      if (modeRef.current === '3d') {
        const y = entitiesRef.current.find((e) => e.id === dragId)?.y ?? 0
        onMoveRef.current(dragId, Math.round(pos.x), y, Math.round(pos.z))
      } else {
        onMoveRef.current(dragId, Math.round(pos.x), Math.round(pos.y), 0)
      }
    }

    const onPointerUp = () => {
      if (dragId) onEndRef.current?.()
      dragId = null
      panning = false
    }

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      if (modeRef.current === '2d') {
        const factor = ev.deltaY > 0 ? 0.9 : 1.1
        pan2d.zoom = Math.min(4, Math.max(0.25, pan2d.zoom * factor))
        resize()
      }
    }

    const draw = () => {
      applyTheme()
      const is3d = modeRef.current === '3d'
      grid2d.visible = !is3d
      grid3d.visible = is3d
      controls.enabled = is3d && toolRef.current === 'move' && dragId === null
      if (is3d && controls.enabled) controls.update()
      syncEntities()
      resize()
      renderer.render(scene, activeCamera())
      publishCam()
      raf = requestAnimationFrame(draw)
    }

    let raf = 0
    applyTheme()
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [theme, mode])

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-0 w-full bg-[var(--viewport)]"
    >
      <div
        className="pointer-events-none absolute left-2.5 top-2.5 rounded border border-[var(--border)] bg-[rgba(20,12,14,0.78)] px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-[var(--text-muted)]"
        data-testid="viewport-hud"
      >
        <div>
          {mode.toUpperCase()} · zoom {(hud.zoom * 100).toFixed(0)}% ·{' '}
          <span className={playing ? 'text-[var(--accent)]' : undefined}>
            {playing ? 'PLAY' : 'EDIT'}
          </span>
        </div>
        <div>
          cam {hud.x.toFixed(0)}, {hud.y.toFixed(0)}
          {mode === '3d' ? `, ${hud.z.toFixed(0)}` : ''}
        </div>
      </div>
    </div>
  )
}
