import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clampDockLayout,
  hidePanel,
  movePanel,
  resetDockLayout,
  saveDockLayout,
  setActivePanel,
  showPanel,
  togglePanelVisibility,
  type DockLayout,
  type DockZoneId,
  type PanelId,
} from '@/lib/dock-layout'

// MARK: - Types

export interface DockDragState {
  panelId: PanelId
  fromZone: DockZoneId
}

interface DockContextValue {
  layout: DockLayout
  drag: DockDragState | null
  dropTarget: DockZoneId | null
  dropInsertIndex: number | undefined
  startDrag: (panelId: PanelId, fromZone: DockZoneId) => void
  endDrag: () => void
  setDropTarget: (zone: DockZoneId | null) => void
  setDropInsertIndex: (index: number | undefined) => void
  dropOnZone: (zone: DockZoneId, index?: number) => void
  setActive: (zone: DockZoneId, panelId: PanelId) => void
  hidePanelById: (panelId: PanelId) => void
  showPanelById: (panelId: PanelId) => void
  togglePanel: (panelId: PanelId) => void
  updateLayout: (
    patch: Partial<DockLayout> | ((prev: DockLayout) => Partial<DockLayout>),
  ) => void
  resetLayout: () => void
}

// MARK: - Context

const DockContext = createContext<DockContextValue | null>(null)

function setDragBodyActive(active: boolean) {
  document.body.classList.toggle('dock-dragging', active)
  document.body.classList.toggle('select-none', active)
}

// MARK: - Provider

export function DockProvider({
  initialLayout,
  children,
}: {
  initialLayout: DockLayout
  children: ReactNode
}) {
  const [layout, setLayout] = useState<DockLayout>(() =>
    clampDockLayout(initialLayout),
  )
  const [drag, setDrag] = useState<DockDragState | null>(null)
  const [dropTarget, setDropTarget] = useState<DockZoneId | null>(null)
  const [dropInsertIndex, setDropInsertIndex] = useState<number | undefined>(
    undefined,
  )

  const updateLayout = useCallback(
    (
      patch: Partial<DockLayout> | ((prev: DockLayout) => Partial<DockLayout>),
    ) => {
      setLayout((prev) => {
        const resolved = typeof patch === 'function' ? patch(prev) : patch
        const next = clampDockLayout({ ...prev, ...resolved })
        saveDockLayout(next)
        return next
      })
    },
    [],
  )

  const startDrag = useCallback((panelId: PanelId, fromZone: DockZoneId) => {
    setDragBodyActive(true)
    setDrag({ panelId, fromZone })
  }, [])

  const endDrag = useCallback(() => {
    setDragBodyActive(false)
    setDrag(null)
    setDropTarget(null)
    setDropInsertIndex(undefined)
  }, [])

  const dropOnZone = useCallback(
    (zone: DockZoneId, index?: number) => {
      if (!drag) return
      setLayout((prev) => {
        const next = movePanel(prev, drag.panelId, zone, index)
        saveDockLayout(next)
        return next
      })
      setDragBodyActive(false)
      setDrag(null)
      setDropTarget(null)
      setDropInsertIndex(undefined)
    },
    [drag],
  )

  const setActive = useCallback((zone: DockZoneId, panelId: PanelId) => {
    setLayout((prev) => {
      const next = setActivePanel(prev, zone, panelId)
      saveDockLayout(next)
      return next
    })
  }, [])

  const hidePanelById = useCallback((panelId: PanelId) => {
    setLayout((prev) => {
      const next = hidePanel(prev, panelId)
      saveDockLayout(next)
      return next
    })
  }, [])

  const showPanelById = useCallback((panelId: PanelId) => {
    setLayout((prev) => {
      const next = showPanel(prev, panelId)
      saveDockLayout(next)
      return next
    })
  }, [])

  const togglePanel = useCallback((panelId: PanelId) => {
    setLayout((prev) => {
      const next = togglePanelVisibility(prev, panelId)
      saveDockLayout(next)
      return next
    })
  }, [])

  const resetLayout = useCallback(() => {
    const next = resetDockLayout()
    saveDockLayout(next)
    setLayout(next)
  }, [])

  const value = useMemo(
    () => ({
      layout,
      drag,
      dropTarget,
      dropInsertIndex,
      startDrag,
      endDrag,
      setDropTarget,
      setDropInsertIndex,
      dropOnZone,
      setActive,
      hidePanelById,
      showPanelById,
      togglePanel,
      updateLayout,
      resetLayout,
    }),
    [
      layout,
      drag,
      dropTarget,
      dropInsertIndex,
      startDrag,
      endDrag,
      dropOnZone,
      setActive,
      hidePanelById,
      showPanelById,
      togglePanel,
      updateLayout,
      resetLayout,
    ],
  )

  return <DockContext.Provider value={value}>{children}</DockContext.Provider>
}

// MARK: - Hook

export function useDock() {
  const ctx = useContext(DockContext)
  if (!ctx) throw new Error('useDock must be used within DockProvider')
  return ctx
}
