//! Strata engine — 2D/3D world, components, and a script-host seam.
//!
//! The React editor talks to this crate through Tauri IPC or the WASM play host.
//! Three.js in the frontend is an **editor view adapter only**, not the game runtime.
//!
//! Scripting: [`RoseGoldScriptHost`] / [`PlaySession`] run native RoseGold hooks and apply
//! `strata.*` host effects (plus stdout `strata:` directives) to the world.
//! [`NullScriptHost`] remains available as a no-op.

mod scene;
mod script;
mod world;
mod collisions;
mod draw;
mod prefab;

pub use scene::{
  Entity, EntityKind, LightKind, MeshPrimitive, Mode, RenderLayer, SceneFile, TileCell,
  COLLISION_BIT_COUNT, DEFAULT_LAYER_ID, ENGINE_VERSION,
};
pub use script::{
  NullScriptHost, PlayFrame, PlaySession, PlaySideEffect, RoseGoldScriptHost, ScriptHost,
  StrataDirective, parse_strata_directives,
};
pub use world::World;
pub use collisions::{
  aabb_overlap, collidable, layers_interact, overlap_pairs, resolve_solid_movers, world_xy,
};
pub use draw::sort_entities_for_draw;
pub use prefab::{collect_subtree, find_prefab_root, instantiate_prefab};
