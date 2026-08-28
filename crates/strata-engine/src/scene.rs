use serde::{Deserialize, Serialize};

pub const ENGINE_VERSION: &str = "0.1.0";

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
    pub mesh_primitive: MeshPrimitive,
    #[serde(default)]
    pub light_kind: LightKind,
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
        self
    }
}
