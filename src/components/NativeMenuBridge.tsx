import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useDock } from '@/components/DockProvider'
import { listenMenuActions, type MenuAction } from '@/lib/menu'
import { isPanelVisible } from '@/lib/dock-layout'
import type { EntityKind, SceneMode, ToolMode } from '@/types/scene'
import { isTauri } from '@/lib/tauri'

// MARK: - App menu actions (non-dock)

export interface AppMenuActions {
  openProject: () => void
  saveProject: () => void
  openScenePicker: () => void
  saveScene: () => void
  handleUndo: () => void
  handleRedo: () => void
  duplicateSelected: () => void
  deleteSelected: () => void
  togglePlay: () => void
  handleModeChange: (mode: SceneMode) => void
  addEntity: (kind: EntityKind) => void
  openAddNode: () => void
  createScript: () => void
  setTool: (tool: ToolMode) => void
  setSnap: (fn: (s: boolean) => boolean) => void
  handleThemeToggle: () => void
  openProjectSettings: () => void
  openEditorSettings: () => void
  flashStatus: (message: string) => void
}

/** Native menu events — must live inside DockProvider for panel toggles. */
export function NativeMenuBridge({
  getActions,
}: {
  getActions: () => AppMenuActions
}) {
  const { resetLayout, togglePanel, layout } = useDock()
  const getActionsRef = useRef(getActions)
  getActionsRef.current = getActions
  const resetLayoutRef = useRef(resetLayout)
  resetLayoutRef.current = resetLayout
  const togglePanelRef = useRef(togglePanel)
  togglePanelRef.current = togglePanel

  const hierarchyOn = isPanelVisible(layout, 'hierarchy')
  const inspectorOn = isPanelVisible(layout, 'inspector')
  const assetsOn = isPanelVisible(layout, 'assets')
  const logOn = isPanelVisible(layout, 'log')

  useEffect(() => {
    if (!isTauri()) return
    void invoke('sync_view_menu', {
      hierarchy: hierarchyOn,
      inspector: inspectorOn,
      assets: assetsOn,
      log: logOn,
    }).catch(() => {
      /* menu not ready yet */
    })
  }, [hierarchyOn, inspectorOn, assetsOn, logOn])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listenMenuActions((action: MenuAction) => {
      const a = getActionsRef.current()
      switch (action) {
        // MARK: - File
        case 'open_project':
          void a.openProject()
          break
        case 'save_project':
          void a.saveProject()
          break
        case 'open_scene':
          a.openScenePicker()
          break
        case 'save_scene':
          void a.saveScene()
          break
        // MARK: - Edit
        case 'undo':
          a.handleUndo()
          break
        case 'redo':
          a.handleRedo()
          break
        case 'duplicate':
          a.duplicateSelected()
          break
        case 'delete':
          a.deleteSelected()
          break
        // MARK: - Scene
        case 'play_stop':
          void a.togglePlay()
          break
        case 'mode_2d':
          a.handleModeChange('2d')
          break
        case 'mode_3d':
          a.handleModeChange('3d')
          break
        case 'mode_script':
          a.handleModeChange('script')
          break
        // MARK: - Insert
        case 'add_node':
          a.openAddNode()
          break
        case 'add_sprite':
          a.addEntity('sprite')
          break
        case 'add_tilemap':
          a.addEntity('tilemap')
          break
        case 'add_empty':
          a.addEntity('empty')
          break
        case 'add_camera':
          a.addEntity('camera')
          break
        case 'add_mesh':
          a.addEntity('mesh')
          break
        case 'add_light':
          a.addEntity('light')
          break
        case 'add_script':
          a.addEntity('script')
          break
        case 'create_script':
          a.createScript()
          break
        // MARK: - View
        case 'tool_select':
          a.setTool('select')
          break
        case 'tool_move':
          a.setTool('move')
          break
        case 'toggle_snap':
          a.setSnap((s) => !s)
          break
        case 'toggle_theme':
          a.handleThemeToggle()
          break
        case 'project_settings':
          a.openProjectSettings()
          break
        case 'editor_settings':
          a.openEditorSettings()
          break
        case 'toggle_hierarchy':
          togglePanelRef.current('hierarchy')
          break
        case 'toggle_inspector':
          togglePanelRef.current('inspector')
          break
        case 'toggle_assets':
          togglePanelRef.current('assets')
          break
        case 'toggle_log':
          togglePanelRef.current('log')
          break
        case 'reset_layout':
          resetLayoutRef.current()
          a.flashStatus('Layout reset')
          break
        // MARK: - Help
        case 'help_docs':
          a.flashStatus('Documentation: see README.md in the project root')
          break
      }
    }).then((fn) => {
      if (cancelled) {
        fn()
        return
      }
      unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return null
}
