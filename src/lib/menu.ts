import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type MenuAction =
  // MARK: - File
  | 'open_project'
  | 'save_project'
  | 'open_scene'
  | 'save_scene'
  // MARK: - Edit
  | 'undo'
  | 'redo'
  | 'duplicate'
  | 'delete'
  // MARK: - Scene
  | 'play_stop'
  | 'mode_2d'
  | 'mode_3d'
  | 'mode_script'
  // MARK: - Insert
  | 'add_node'
  | 'add_sprite'
  | 'add_tilemap'
  | 'add_empty'
  | 'add_camera'
  | 'add_mesh'
  | 'add_light'
  | 'add_script'
  | 'create_script'
  // MARK: - View
  | 'tool_select'
  | 'tool_move'
  | 'toggle_snap'
  | 'toggle_theme'
  | 'toggle_hierarchy'
  | 'toggle_inspector'
  | 'toggle_assets'
  | 'toggle_log'
  | 'reset_layout'
  | 'project_settings'
  | 'editor_settings'
  // MARK: - Help
  | 'help_docs'

const MENU_ACTIONS = new Set<string>([
  // MARK: - File
  'open_project',
  'save_project',
  'open_scene',
  'save_scene',
  // MARK: - Edit
  'undo',
  'redo',
  'duplicate',
  'delete',
  // MARK: - Scene
  'play_stop',
  'mode_2d',
  'mode_3d',
  'mode_script',
  // MARK: - Insert
  'add_node',
  'add_sprite',
  'add_tilemap',
  'add_empty',
  'add_camera',
  'add_mesh',
  'add_light',
  'add_script',
  'create_script',
  // MARK: - View
  'tool_select',
  'tool_move',
  'toggle_snap',
  'toggle_theme',
  'toggle_hierarchy',
  'toggle_inspector',
  'toggle_assets',
  'toggle_log',
  'reset_layout',
  'project_settings',
  'editor_settings',
  // MARK: - Help
  'help_docs',
])

export function isMenuAction(id: string): id is MenuAction {
  return MENU_ACTIONS.has(id)
}

export async function listenMenuActions(
  handler: (action: MenuAction) => void,
): Promise<UnlistenFn> {
  return listen<string>('strata-menu', (event) => {
    const id = event.payload
    if (isMenuAction(id)) handler(id)
  })
}
