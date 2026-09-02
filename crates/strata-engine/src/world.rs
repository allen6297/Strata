use crate::scene::{Mode, SceneFile};
use crate::script::ScriptHost;

#[derive(Debug, Clone)]
pub struct World {
    pub mode: Mode,
    pub name: String,
    entities: Vec<crate::scene::Entity>,
    prefabs: Vec<crate::scene::Entity>,
    loaded: bool,
}

impl World {
    pub fn new() -> Self {
        Self {
            mode: Mode::D2,
            name: "main.scene".into(),
            entities: Vec::new(),
            prefabs: Vec::new(),
            loaded: false,
        }
    }

    pub fn from_scene(scene: SceneFile) -> Self {
        let scene = scene.migrate();
        Self {
            mode: scene.mode,
            name: scene.name,
            entities: scene.entities,
            prefabs: scene.prefabs,
            loaded: false,
        }
    }

    pub fn to_scene(&self) -> SceneFile {
        SceneFile {
            version: 2,
            name: self.name.clone(),
            mode: self.mode,
            entities: self.entities.clone(),
            prefabs: self.prefabs.clone(),
        }
    }

    pub fn prefabs(&self) -> &[crate::scene::Entity] {
        &self.prefabs
    }

    pub fn entities(&self) -> &[crate::scene::Entity] {
        &self.entities
    }

    pub fn entities_mut(&mut self) -> &mut Vec<crate::scene::Entity> {
        &mut self.entities
    }

    pub fn load(&mut self, host: &mut dyn ScriptHost) {
        if !self.loaded {
            host.on_load(self);
            self.loaded = true;
        }
    }

    pub fn tick(&mut self, dt: f32, host: &mut dyn ScriptHost) {
        self.load(host);
        host.on_update(self, dt);
        for e in &mut self.entities {
            e.sync_rotation_alias();
        }
    }
}

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}
