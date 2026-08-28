use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

pub fn install(app: &tauri::App) -> tauri::Result<()> {
  let handle = app.handle();

  // MARK: - Strata (app menu)
  let app_menu = SubmenuBuilder::new(handle, "Strata")
    .about(Some(AboutMetadata {
      name: Some("Strata".into()),
      ..Default::default()
    }))
    .separator()
    .services()
    .separator()
    .hide()
    .hide_others()
    .show_all()
    .separator()
    .quit()
    .build()?;

  // MARK: - File
  let open_project = MenuItemBuilder::new("Open Project")
    .id("open_project")
    .accelerator("CmdOrCtrl+Shift+O")
    .build(handle)?;
  let save_project = MenuItemBuilder::new("Save Project")
    .id("save_project")
    .accelerator("CmdOrCtrl+Shift+S")
    .build(handle)?;
  let open_scene = MenuItemBuilder::new("Open Scene")
    .id("open_scene")
    .accelerator("CmdOrCtrl+O")
    .build(handle)?;
  let save_scene = MenuItemBuilder::new("Save Scene")
    .id("save_scene")
    .accelerator("CmdOrCtrl+S")
    .build(handle)?;

  let file = SubmenuBuilder::new(handle, "File")
    .item(&open_project)
    .item(&save_project)
    .separator()
    .item(&open_scene)
    .item(&save_scene)
    .build()?;

  // MARK: - Edit
  let undo = MenuItemBuilder::new("Undo")
    .id("undo")
    .accelerator("CmdOrCtrl+Z")
    .build(handle)?;
  let redo = MenuItemBuilder::new("Redo")
    .id("redo")
    .accelerator("CmdOrCtrl+Shift+Z")
    .build(handle)?;
  let duplicate = MenuItemBuilder::new("Duplicate")
    .id("duplicate")
    .accelerator("CmdOrCtrl+D")
    .build(handle)?;
  let delete = MenuItemBuilder::new("Delete")
    .id("delete")
    .build(handle)?;

  let edit = SubmenuBuilder::new(handle, "Edit")
    .item(&undo)
    .item(&redo)
    .separator()
    .item(&duplicate)
    .item(&delete)
    .build()?;

  // MARK: - Scene
  let play_stop = MenuItemBuilder::new("Play / Stop")
    .id("play_stop")
    .accelerator("Space")
    .build(handle)?;
  let mode_2d = MenuItemBuilder::new("2D Mode")
    .id("mode_2d")
    .accelerator("1")
    .build(handle)?;
  let mode_3d = MenuItemBuilder::new("3D Mode")
    .id("mode_3d")
    .accelerator("2")
    .build(handle)?;
  let mode_script = MenuItemBuilder::new("Script Mode")
    .id("mode_script")
    .accelerator("3")
    .build(handle)?;

  let scene = SubmenuBuilder::new(handle, "Scene")
    .item(&play_stop)
    .separator()
    .item(&mode_2d)
    .item(&mode_3d)
    .item(&mode_script)
    .build()?;

  // MARK: - Insert
  let insert = SubmenuBuilder::new(handle, "Insert")
    .text("add_sprite", "Sprite")
    .text("add_empty", "Empty")
    .text("add_camera", "Camera")
    .text("add_mesh", "Mesh")
    .text("add_light", "Light")
    .text("add_script", "Script Entity")
    .separator()
    .text("create_script", "New Script Asset")
    .build()?;

  // MARK: - View
  let tool_select = MenuItemBuilder::new("Select Tool")
    .id("tool_select")
    .accelerator("V")
    .build(handle)?;
  let tool_move = MenuItemBuilder::new("Pan Tool")
    .id("tool_move")
    .accelerator("H")
    .build(handle)?;
  let toggle_snap = MenuItemBuilder::new("Toggle Snap")
    .id("toggle_snap")
    .accelerator("G")
    .build(handle)?;
  let toggle_theme = MenuItemBuilder::new("Toggle Theme")
    .id("toggle_theme")
    .build(handle)?;
  let reset_layout = MenuItemBuilder::new("Reset Layout")
    .id("reset_layout")
    .build(handle)?;
  let toggle_hierarchy = MenuItemBuilder::new("Hierarchy")
    .id("toggle_hierarchy")
    .build(handle)?;
  let toggle_inspector = MenuItemBuilder::new("Inspector")
    .id("toggle_inspector")
    .build(handle)?;
  let toggle_assets = MenuItemBuilder::new("Assets")
    .id("toggle_assets")
    .build(handle)?;

  let view = SubmenuBuilder::new(handle, "View")
    .item(&tool_select)
    .item(&tool_move)
    .separator()
    .item(&toggle_snap)
    .separator()
    .item(&toggle_theme)
    .separator()
    .item(&toggle_hierarchy)
    .item(&toggle_inspector)
    .item(&toggle_assets)
    .separator()
    .item(&reset_layout)
    .build()?;

  // MARK: - Window
  let window = SubmenuBuilder::new(handle, "Window")
    .minimize()
    .maximize()
    .fullscreen()
    .separator()
    .close_window()
    .build()?;

  #[cfg(target_os = "macos")]
  window.set_as_windows_menu_for_nsapp()?;

  // MARK: - Help
  let help = SubmenuBuilder::new(handle, "Help")
    .text("help_docs", "Strata Documentation")
    .build()?;

  #[cfg(target_os = "macos")]
  help.set_as_help_menu_for_nsapp()?;

  // MARK: - Assembly & events
  let menu = MenuBuilder::new(handle)
    .items(&[
      &app_menu,
      &file,
      &edit,
      &scene,
      &insert,
      &view,
      &window,
      &help,
    ])
    .build()?;

  app.set_menu(menu)?;

  app.on_menu_event(|app, event| {
    let id = event.id().0.as_str();
    if id.starts_with("predefined:") {
      return;
    }
    let _ = app.emit("strata-menu", id);
  });

  Ok(())
}
