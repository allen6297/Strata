use std::collections::{HashMap, HashSet};

use crate::scene::{Entity, EntityKind};

/// Center-based AABB, matching the 2D viewport (no rotation).
pub fn aabb_overlap_xy(ax: f32, ay: f32, aw: f32, ah: f32, bx: f32, by: f32, bw: f32, bh: f32) -> bool {
  (ax - bx).abs() * 2.0 < aw + bw && (ay - by).abs() * 2.0 < ah + bh
}

/// Local-space AABB (entity `x`/`y` as stored). Prefer [`overlap_pairs`] for play.
pub fn aabb_overlap(a: &Entity, b: &Entity) -> bool {
  aabb_overlap_xy(a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height)
}

/// Sum parent local offsets. Matches `getWorldPosition` in the editor (no rotation/scale).
pub fn world_xy(entity: &Entity, by_id: &HashMap<&str, &Entity>) -> (f32, f32) {
  let mut x = entity.x;
  let mut y = entity.y;
  let mut pid = entity.parent_id.as_deref();
  let mut guard = HashSet::new();
  guard.insert(entity.id.as_str());
  while let Some(id) = pid {
    if !guard.insert(id) {
      break;
    }
    let Some(parent) = by_id.get(id) else {
      break;
    };
    x += parent.x;
    y += parent.y;
    pid = parent.parent_id.as_deref();
  }
  (x, y)
}

pub fn collidable(e: &Entity) -> bool {
  if e.width <= 0.0 || e.height <= 0.0 {
    return false;
  }
  !matches!(
    e.kind,
    EntityKind::Camera | EntityKind::Light | EntityKind::Tilemap
  )
}

/// Godot two-way layer/mask: A occupies a layer B scans, and vice versa.
pub fn layers_interact(a: &Entity, b: &Entity) -> bool {
  bits_interact(
    a.collision_layer,
    a.collision_mask,
    b.collision_layer,
    b.collision_mask,
  )
}

fn bits_interact(a_layer: u32, a_mask: u32, b_layer: u32, b_mask: u32) -> bool {
  (a_layer & b_mask) != 0 && (b_layer & a_mask) != 0
}

fn world_xy_of(entities: &[Entity], index: usize) -> (f32, f32) {
  let by_id: HashMap<&str, &Entity> = entities.iter().map(|e| (e.id.as_str(), e)).collect();
  world_xy(&entities[index], &by_id)
}

/// Minimum translation to separate A from B. Prefers Y on a tie (land on floors).
fn mtv_a_from_b(
  ax: f32,
  ay: f32,
  aw: f32,
  ah: f32,
  bx: f32,
  by: f32,
  bw: f32,
  bh: f32,
) -> Option<(f32, f32)> {
  let ox = (aw + bw) * 0.5 - (ax - bx).abs();
  let oy = (ah + bh) * 0.5 - (ay - by).abs();
  if ox <= 0.0 || oy <= 0.0 {
    return None;
  }
  if ox < oy {
    let sx = if ax >= bx { 1.0 } else { -1.0 };
    Some((sx * ox, 0.0))
  } else {
    let sy = if ay >= by { 1.0 } else { -1.0 };
    Some((0.0, sy * oy))
  }
}

pub fn local_positions(entities: &[Entity]) -> HashMap<String, (f32, f32)> {
  entities
    .iter()
    .map(|e| (e.id.clone(), (e.x, e.y)))
    .collect()
}

pub fn moved_ids(entities: &[Entity], before: &HashMap<String, (f32, f32)>) -> HashSet<String> {
  entities
    .iter()
    .filter_map(|e| match before.get(&e.id) {
      Some(&(x, y)) if (e.x - x).abs() < 1e-6 && (e.y - y).abs() < 1e-6 => None,
      _ => Some(e.id.clone()),
    })
    .collect()
}

/// Center AABBs for solid tilemap cells. Origin is the tilemap’s world `x`/`y` (top-left of cell 0,0).
pub fn tilemap_solid_aabbs(entities: &[Entity]) -> Vec<(f32, f32, f32, f32, u32, u32)> {
  let by_id: HashMap<&str, &Entity> = entities.iter().map(|e| (e.id.as_str(), e)).collect();
  let mut out = Vec::new();
  for e in entities {
    if e.kind != EntityKind::Tilemap || !e.solid || e.tiles.is_empty() {
      continue;
    }
    let ts = e.tile_size.max(1.0);
    let (ox, oy) = world_xy(e, &by_id);
    for cell in &e.tiles {
      let cx = ox + (cell.x as f32 + 0.5) * ts;
      let cy = oy + (cell.y as f32 + 0.5) * ts;
      out.push((
        cx,
        cy,
        ts,
        ts,
        e.collision_layer,
        e.collision_mask,
      ));
    }
  }
  out
}

/// Push movers out of other solids. Areas are ignored. Statics (not in `moved`) stay put.
pub fn resolve_solid_movers(entities: &mut [Entity], moved: &HashSet<String>) {
  if moved.is_empty() {
    return;
  }
  let tiles = tilemap_solid_aabbs(entities);
  for _ in 0..4 {
    let n = entities.len();
    for i in 0..n {
      if !moved.contains(&entities[i].id) {
        continue;
      }
      if !entities[i].solid || !collidable(&entities[i]) {
        continue;
      }
      for j in 0..n {
        if i == j {
          continue;
        }
        if !entities[j].solid || !collidable(&entities[j]) {
          continue;
        }
        if !layers_interact(&entities[i], &entities[j]) {
          continue;
        }
        let (ax, ay) = world_xy_of(entities, i);
        let (bx, by) = world_xy_of(entities, j);
        let aw = entities[i].width;
        let ah = entities[i].height;
        let bw = entities[j].width;
        let bh = entities[j].height;
        let Some((dx, dy)) = mtv_a_from_b(ax, ay, aw, ah, bx, by, bw, bh) else {
          continue;
        };
        entities[i].x += dx;
        entities[i].y += dy;
      }
      for &(bx, by, bw, bh, layer, mask) in &tiles {
        if !bits_interact(
          entities[i].collision_layer,
          entities[i].collision_mask,
          layer,
          mask,
        ) {
          continue;
        }
        let (ax, ay) = world_xy_of(entities, i);
        let Some((dx, dy)) = mtv_a_from_b(
          ax,
          ay,
          entities[i].width,
          entities[i].height,
          bx,
          by,
          bw,
          bh,
        ) else {
          continue;
        };
        entities[i].x += dx;
        entities[i].y += dy;
      }
    }
  }
}

/// Canonical `(lo_id, hi_id)` pairs currently overlapping in **world** space.
pub fn overlap_pairs(entities: &[Entity]) -> HashSet<(String, String)> {
  let by_id: HashMap<&str, &Entity> = entities.iter().map(|e| (e.id.as_str(), e)).collect();
  let mut pairs = HashSet::new();
  let bodies: Vec<&Entity> = entities.iter().filter(|e| collidable(e)).collect();
  for i in 0..bodies.len() {
    for j in (i + 1)..bodies.len() {
      let a = bodies[i];
      let b = bodies[j];
      if !layers_interact(a, b) {
        continue;
      }
      let (ax, ay) = world_xy(a, &by_id);
      let (bx, by) = world_xy(b, &by_id);
      if !aabb_overlap_xy(ax, ay, a.width, a.height, bx, by, b.width, b.height) {
        continue;
      }
      let (lo, hi) = if a.id <= b.id {
        (a.id.clone(), b.id.clone())
      } else {
        (b.id.clone(), a.id.clone())
      };
      pairs.insert((lo, hi));
    }
  }
  pairs
}

#[cfg(test)]
mod tests {
  use super::*;

  fn sprite(id: &str, x: f32, y: f32, w: f32, h: f32) -> Entity {
    Entity {
      id: id.into(),
      name: id.into(),
      kind: EntityKind::Sprite,
      x,
      y,
      width: w,
      height: h,
      ..Default::default()
    }
  }

  fn solid(id: &str, x: f32, y: f32, w: f32, h: f32) -> Entity {
    let mut e = sprite(id, x, y, w, h);
    e.solid = true;
    e
  }

  #[test]
  fn overlap_when_centers_close() {
    let a = sprite("a", 0.0, 0.0, 64.0, 64.0);
    let b = sprite("b", 40.0, 0.0, 24.0, 24.0);
    assert!(aabb_overlap(&a, &b));
  }

  #[test]
  fn no_overlap_when_far() {
    let a = sprite("a", 0.0, 0.0, 64.0, 64.0);
    let b = sprite("b", 90.0, 0.0, 24.0, 24.0);
    assert!(!aabb_overlap(&a, &b));
  }

  #[test]
  fn parented_child_collides_in_world_space() {
    let parent = sprite("p", 100.0, 0.0, 32.0, 32.0);
    let mut child = sprite("c", 0.0, 0.0, 32.0, 32.0);
    child.parent_id = Some("p".into());
    let other = sprite("s", 100.0, 0.0, 32.0, 32.0);
    let ents = vec![parent, child, other];
    let pairs = overlap_pairs(&ents);
    assert!(
      pairs.contains(&("c".into(), "s".into())),
      "child at local (0,0) under parent at x=100 should overlap sprite at x=100; {pairs:?}"
    );
  }

  #[test]
  fn parented_child_local_zero_does_not_hit_origin() {
    let parent = sprite("p", 100.0, 0.0, 32.0, 32.0);
    let mut child = sprite("c", 0.0, 0.0, 32.0, 32.0);
    child.parent_id = Some("p".into());
    let origin = sprite("o", 0.0, 0.0, 32.0, 32.0);
    let ents = vec![parent, child, origin];
    let pairs = overlap_pairs(&ents);
    assert!(
      !pairs.contains(&("c".into(), "o".into())),
      "must not use child's local (0,0) against the origin sprite; {pairs:?}"
    );
  }

  #[test]
  fn mask_mismatch_skips_overlap() {
    let mut a = sprite("a", 0.0, 0.0, 32.0, 32.0);
    let mut b = sprite("b", 0.0, 0.0, 32.0, 32.0);
    a.collision_layer = 1;
    a.collision_mask = 1;
    b.collision_layer = 2;
    b.collision_mask = 2;
    let pairs = overlap_pairs(&[a, b]);
    assert!(pairs.is_empty(), "{pairs:?}");
  }

  #[test]
  fn mover_stops_on_solid_wall() {
    // Half-extents 16. Wall at 40: flush when hero.x = 8.
    let hero = solid("h", 0.0, 0.0, 32.0, 32.0);
    let wall = solid("w", 40.0, 0.0, 32.0, 32.0);
    let mut ents = vec![hero, wall];
    ents[0].x = 16.0;
    let moved = HashSet::from(["h".into()]);
    resolve_solid_movers(&mut ents, &moved);
    assert!(
      (ents[0].x - 8.0).abs() < 0.001,
      "hero should sit flush left of wall; x={}",
      ents[0].x
    );
    assert!((ents[1].x - 40.0).abs() < 0.001, "wall must not move");
    assert!(!aabb_overlap(&ents[0], &ents[1]));
  }

  #[test]
  fn area_does_not_block_or_move() {
    let mut hero = solid("h", 0.0, 0.0, 32.0, 32.0);
    let coin = sprite("c", 8.0, 0.0, 24.0, 24.0);
    hero.x = 8.0;
    let mut ents = vec![hero, coin];
    let moved = HashSet::from(["h".into()]);
    resolve_solid_movers(&mut ents, &moved);
    assert!((ents[0].x - 8.0).abs() < 0.001, "area must not shove the hero");
    assert!((ents[1].x - 8.0).abs() < 0.001, "coin must not move");
    assert!(aabb_overlap(&ents[0], &ents[1]));
  }

  #[test]
  fn standing_on_floor_resolves_y() {
    let hero = solid("h", 0.0, 0.0, 32.0, 32.0);
    let floor = solid("f", 0.0, 20.0, 64.0, 16.0);
    let mut ents = vec![hero, floor];
    ents[0].y = 4.0;
    let moved = HashSet::from(["h".into()]);
    resolve_solid_movers(&mut ents, &moved);
    assert!(
      (ents[0].y - (-4.0)).abs() < 0.001,
      "hero should sit on the floor; y={}",
      ents[0].y
    );
    assert!((ents[1].y - 20.0).abs() < 0.001);
    assert!(!aabb_overlap(&ents[0], &ents[1]));
  }

  #[test]
  fn parented_mover_writes_local() {
    let parent = sprite("p", 100.0, 0.0, 8.0, 8.0);
    let mut child = solid("c", 0.0, 0.0, 32.0, 32.0);
    child.parent_id = Some("p".into());
    child.x = 16.0;
    let wall = solid("w", 140.0, 0.0, 32.0, 32.0);
    let mut ents = vec![parent, child, wall];
    let moved = HashSet::from(["c".into()]);
    resolve_solid_movers(&mut ents, &moved);
    // world x of child was 116; wall 140; flush world x = 108; local = 8
    assert!(
      (ents[1].x - 8.0).abs() < 0.001,
      "local x should absorb the world MTV; x={}",
      ents[1].x
    );
    assert!((ents[0].x - 100.0).abs() < 0.001);
    assert!((ents[2].x - 140.0).abs() < 0.001);
  }

  #[test]
  fn solid_tiles_stop_hero_visual_tiles_do_not() {
    use crate::scene::TileCell;
    let hero = solid("h", 8.0, 8.0, 16.0, 16.0);
    let mut ground = Entity {
      id: "g".into(),
      name: "Ground".into(),
      kind: EntityKind::Tilemap,
      x: 0.0,
      y: 8.0,
      tile_size: 16.0,
      solid: true,
      tiles: vec![TileCell { x: 0, y: 0, i: 0 }],
      ..Default::default()
    };
    // Cell center (8, 16). Hero 16×16 at (8, 8) overlaps the tile.
    let mut ents = vec![hero.clone(), ground.clone()];
    let moved = HashSet::from(["h".into()]);
    resolve_solid_movers(&mut ents, &moved);
    assert!(
      ents[0].y.abs() < 0.001,
      "hero should sit on the tile; y={}",
      ents[0].y
    );

    ground.solid = false;
    let mut visual = vec![hero, ground];
    resolve_solid_movers(&mut visual, &moved);
    assert!(
      (visual[0].y - 8.0).abs() < 0.001,
      "visual tiles must not shove; y={}",
      visual[0].y
    );
  }

  #[test]
  fn tilemap_is_not_one_overlap_body() {
    use crate::scene::TileCell;
    let hero = sprite("h", 8.0, 16.0, 16.0, 16.0);
    let ground = Entity {
      id: "g".into(),
      name: "Ground".into(),
      kind: EntityKind::Tilemap,
      x: 0.0,
      y: 8.0,
      width: 256.0,
      height: 128.0,
      tile_size: 16.0,
      tiles: vec![TileCell { x: 0, y: 0, i: 0 }],
      ..Default::default()
    };
    let pairs = overlap_pairs(&[hero, ground]);
    assert!(pairs.is_empty(), "tilemap must not be a fat AABB pair; {pairs:?}");
  }
}
