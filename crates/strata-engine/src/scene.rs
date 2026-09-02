use std::collections::HashMap;

use serde::{Deserialize, Serialize};

pub const ENGINE_VERSION: &str = "0.1.0";

/// Stable id for the default render layer (project settings may rename the display name).
pub const DEFAULT_LAYER_ID: &str = "layer_default";

fn default_layer_id() -> String {
    DEFAULT_LAYER_ID.into()
}

/// Bit 0 = layer 1. Inspector exposes 8 bits; mask default is all of them.
pub const COLLISION_BIT_COUNT: u32 = 8;

fn default_collision_layer() -> u32 {
    1
}

fn default_collision_mask() -> u32 {
    (1 << COLLISION_BIT_COUNT) - 1
}

fn default_tile_size() -> f32 {
    16.0
}

fn one() -> f32 {
    1.0
}

fn depth_default() -> f32 {
    8.0
}

fn color_default() -> String {
    "#d4848e".into()
}

fn vis_default() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    #[serde(rename = "2d")]
    D2,
    #[serde(rename = "3d")]
    D3,
}

impl Default for Mode {
    fn default() -> Self {
        Self::D2
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntityKind {
    Sprite,
    Empty,
    Camera,
    Light,
    Mesh,
    Script,
    Tilemap,
}

impl Default for EntityKind {
    fn default() -> Self {
        Self::Empty
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum MeshPrimitive {
    #[default]
    Box,
    Plane,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum LightKind {
    #[default]
    Point,
    Directional,
}

/// One painted cell. `(x, y)` is the grid coordinate; `i` is the tileset index (row-major).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileCell {
    pub x: i32,
    pub y: i32,
    pub i: u32,
}

/// Inspector connection: this node's `signal` runs `to`'s `method`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptConnection {
    pub signal: String,
    pub to: String,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub kind: EntityKind,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default)]
    pub z: f32,
    #[serde(default)]
    pub width: f32,
    #[serde(default)]
    pub height: f32,
    #[serde(default = "depth_default")]
    pub depth: f32,
    #[serde(default)]
    pub rotation: f32,
    #[serde(default)]
    pub rotation_x: f32,
    #[serde(default)]
    pub rotation_y: f32,
    #[serde(default)]
    pub rotation_z: f32,
    #[serde(default = "one")]
    pub scale_x: f32,
    #[serde(default = "one")]
    pub scale_y: f32,
    #[serde(default = "one")]
    pub scale_z: f32,
    #[serde(default = "color_default")]
    pub color: String,
    #[serde(default = "vis_default")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub script_path: String,
    #[serde(default)]
    pub script_id: Option<String>,
    #[serde(default)]
    pub texture_id: Option<String>,
    #[serde(default)]
    pub audio_id: Option<String>,
    #[serde(default = "default_layer_id")]
    pub layer_id: String,
    #[serde(default)]
    pub sort_order: Option<i32>,
    /// Solid bodies resolve AABB penetration; areas only fire overlap hooks.
    #[serde(default)]
    pub solid: bool,
    /// Bits this body occupies (Godot-style). Default: layer 1.
    #[serde(default = "default_collision_layer")]
    pub collision_layer: u32,
    /// Bits this body scans. Default: all 8 Inspector layers (everything meets everything).
    #[serde(default = "default_collision_mask")]
    pub collision_mask: u32,
    /// Inspector overrides for `@export var`s. Missing key → script default.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub script_props: HashMap<String, serde_json::Value>,
    /// Inspector signal wiring: this entity's `signal` → other entity `method`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub connections: Vec<ScriptConnection>,
    #[serde(default = "default_tile_size")]
    pub tile_size: f32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tiles: Vec<TileCell>,
    /// Catalog root id when this node is a live prefab instance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefab_id: Option<String>,
    /// Catalog node this clone was stamped from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefab_source_id: Option<String>,
    /// Inspector/move keys to keep when the catalog template syncs.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub prefab_overrides: Vec<String>,
    #[serde(default)]
    pub mesh_primitive: MeshPrimitive,
    #[serde(default)]
    pub light_kind: LightKind,
}

impl Default for Entity {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            kind: EntityKind::Empty,
            parent_id: None,
            x: 0.0,
            y: 0.0,
            z: 0.0,
            width: 32.0,
            height: 32.0,
            depth: 8.0,
            rotation: 0.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            scale_z: 1.0,
            color: color_default(),
            visible: true,
            locked: false,
            script_path: String::new(),
            script_id: None,
            texture_id: None,
            audio_id: None,
            layer_id: default_layer_id(),
            sort_order: None,
            solid: false,
            collision_layer: default_collision_layer(),
            collision_mask: default_collision_mask(),
            script_props: HashMap::new(),
            connections: Vec::new(),
            tile_size: default_tile_size(),
            tiles: Vec::new(),
            prefab_id: None,
            prefab_source_id: None,
            prefab_overrides: Vec::new(),
            mesh_primitive: MeshPrimitive::default(),
            light_kind: LightKind::default(),
        }
    }
}

/// Project-scoped draw layer. Entities store `layer_id`, not the display name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderLayer {
    pub id: String,
    pub name: String,
    pub order: i32,
}

impl Entity {
    pub fn sync_rotation_alias(&mut self) {
        self.rotation = self.rotation_z;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneFile {
    pub version: u32,
    pub name: String,
    #[serde(default)]
    pub mode: Mode,
    pub entities: Vec<Entity>,
    /// Templates for `strata.spawn("Name")`. Not placed in the play world.
    #[serde(default)]
    pub prefabs: Vec<Entity>,
}

impl SceneFile {
    pub fn migrate(mut self) -> Self {
        if self.version < 2 {
            self.version = 2;
            self.mode = Mode::D2;
            for e in &mut self.entities {
                e.rotation_z = e.rotation;
                if e.scale_x == 0.0 {
                    e.scale_x = 1.0;
                }
                if e.scale_y == 0.0 {
                    e.scale_y = 1.0;
                }
                if e.scale_z == 0.0 {
                    e.scale_z = 1.0;
                }
                if e.depth <= 0.0 {
                    e.depth = 8.0;
                }
                if e.width <= 0.0 {
                    e.width = 32.0;
                }
                if e.height <= 0.0 {
                    e.height = 32.0;
                }
            }
        } else {
            for e in &mut self.entities {
                if e.rotation_z == 0.0 && e.rotation != 0.0 {
                    e.rotation_z = e.rotation;
                }
                e.sync_rotation_alias();
            }
        }
        for e in self.entities.iter_mut().chain(self.prefabs.iter_mut()) {
            if e.layer_id.is_empty() {
                e.layer_id = default_layer_id();
            }
        }
        self
    }
}
