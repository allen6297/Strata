# Game UI Plan

Snapshot: **Thursday, Sep 3, 2026**

Related: [plan.md](./plan.md) · [rosegold.md](./rosegold.md) · [project-status.md](./project-status.md)

This is **in-game** UI during Play — HUD, pause, menus — not editor chrome (Inspector, Files, docks).

**One-line goal:** A script can put a score on screen today; later the same draw list can back Godot-shaped Control nodes (Label, Button, Panel) without a second UI stack in React.

---

## Strategic direction


| Decision         | Choice                                      | Planning implication                                                                                          |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Space**        | Screen pixels, top-left of the play view    | HUD does not move with the camera. World labels are a later, separate call                                    |
| **v1 shape**     | Immediate-mode `ui.*` host effects          | Call every `on_update`. The engine rebuilds the list each tick; nothing is stored on the entity               |
| **Who draws**    | Viewport overlay after the world            | Same path desktop + browser. Do not HTML-overlay a React HUD on the canvas                                    |
| **Who owns it**  | Engine `PlayFrame.hud`                      | Scripts queue `HostEffect`s; the editor only paints. Matches `strata.move` / `play_sound`                     |
| **End state**    | Godot Control nodes                         | Label / Button / Panel in the scene tree, anchors, mouse. They emit the **same** draw list `ui.text` already uses |
| **Input**        | UI first, then leftover to the world        | A Control can **eat** an event (`Stop`) or **propagate** it (`Pass` / leftover `input.*`). HUD that is not a menu uses `Ignore` so clicks fall through |
| **Not React**    | No DOM menus during Play                    | A pause menu is engine UI, not a Strata dialog                                                                |


**Why start immediate-mode.** Coin told the HUD (RG7 signals) needs a score on screen *now*. Control nodes need a new entity kind, layout, hit-testing, and Inspector cards. `ui.text` is the draw contract those nodes will target later.

**Why not HTML.** A web overlay would look fine in the editor webview and then fight WASM, pixel scale, and a future native surface. One overlay in the viewport keeps Play honest.

---

## Current state

**UI1 is done.** Host module `ui`, `ui.text(x, y, text)`, `PlayFrame.hud`, viewport overlay. Demo Hero tracks `coins` and draws `coins N` each frame. Coin `collected` → Player `on_coin` still owns the count.

```rg
import ui;

var coins: Int = 0;

fn on_coin(amount: Int): Int {
    coins = coins + amount;
    return 0;
}

fn on_update(name: Str, x: Float, y: Float, dt: Float): Int {
    ui.text(16.0, 16.0, f"coins {coins}");
    return 0;
}
```

| Piece            | Behavior                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| `import ui;`     | Host module (not a `.rg` file), same family as `input` / `time`          |
| `ui.text`        | 3 args: screen `x`, `y`, `Str` (other scalars stringify)                 |
| Immediate-mode   | Missing a call for one frame → that line disappears                      |
| Overlay          | Pixelated world stays in WebGL/canvas; HUD is 2D overlay on top          |
| Editor chip      | PLAY / zoom readout sits at the **bottom** during Play so HUD can use the top-left |
| Input            | One key CSV to every VM. Nothing is eaten yet — Hero still sees Space under a future pause card |

**Acceptance (UI1):** Press Play, see `coins 0`; walk into a Coin, see the number go up. Stop clears the overlay.

---

## Pipeline

```
RoseGold  ui.text(...)
    → HostEffect::UiText
    → StrataDirective::UiText  (not a world mutate)
    → PlayFrame.hud[]          (replaced every tick)
    → Viewport overlay         (screen space, after world)
```

Control nodes later: each tick, engine walks UI entities → **same** `hud` / draw-list field. Scripts can keep calling `ui.text` for one-off debug lines.

---

## Input: eat vs propagate

Today every Play tick ships the same key CSV to every VM. `input.pressed("Space")` on Hero does not know a pause card is up. That is fine for a score overlay. It is wrong the moment UI is clickable or modal.

**Godot-shaped filters** (name them the same in Inspector):


| Filter     | This Control                         | Rest of UI tree              | World (`input.*` / clicks on sprites) |
| ---------- | ------------------------------------ | ---------------------------- | ------------------------------------- |
| **Stop**   | Gets the event; **eats** it          | Not offered                  | Not offered                           |
| **Pass**   | Gets the event; does not eat by default | Parents still see it      | Only if nobody later eats             |
| **Ignore** | Skips this Control                   | Continues                    | As if this Control were not there     |


A script on a Control may still **eat** after seeing the event (`ui.eat()` / `accept_event()` — pick one name and keep it). Pass + eat is “I handled Space, Hero must not jump.” Pass without eat is “I highlighted on hover, click still hits the world.”

**Order.** Hit-test UI **front to back** (top of draw list first), same as Godot’s reverse-tree mouse pick. Keyboard focus (UI6) goes to the focused Control first; if it does not eat, leftover keys become the `input.pressed` / `input.held` CSV world scripts already use.

**What the world sees.** After the UI pass, the engine **rebuilds** the key/mouse CSV from events that were not eaten. Hero never has to check “is a menu open.” If Space was eaten, `input.pressed("Space")` is false that tick.

**Immediate-mode (until Controls exist).** No node to hang a filter on, so the script that draws the modal is the eater:

```rg
ui.rect(0.0, 0.0, view_w, view_h, "#12090c");
ui.text(16.0, 16.0, "paused");
ui.eat();          # this frame: no leftover keys/clicks for the world
```

`ui.eat()` with no args eats **all** leftover input this tick (pause card). `ui.eat("Escape")` / `ui.eat_click()` can wait until a demo needs a finer cut. Score-only HUD must **not** call `eat`.

**Clicks.** Edit-mode viewport picking stays editor-only. During Play, a click hits Controls first (UI6). If the Control is Ignore, or nothing eats, the click may later mean “gameplay” (not select-in-Hierarchy). Do not select editor nodes from a Play click.

---

## Milestones


### UI1 — Score overlay (done)

Screen-space text from scripts. Demo coin counter.

| Work item     | Notes                                              |
| ------------- | -------------------------------------------------- |
| Host `ui`     | `ui.text(x, y, text)` only                         |
| PlayFrame     | `hud: [{ x, y, text }]`                            |
| Viewport      | Stroke + fill so it reads on light and dark tiles  |
| **Acceptance** | Play shows `coins N`; Stop clears it              |


### UI2 — Draw list, not just a string

Enough to make a readable HUD without nodes: color, size, a filled rect (panel behind the score).

| Work item        | Notes                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `ui.text` extras | Optional color / size (keep 3-arg form; add `ui.text_ex` or extra args later — pick one and stick) |
| `ui.rect`        | `x, y, w, h, color` — screen-space fill                               |
| Draw order       | Rects first, then text, in call order                                 |
| **Acceptance**   | Score sits on a dark bar; health can be a second line                 |

**Out of scope for UI2:** fonts as assets, nine-slice, world-space billboards.


### UI3 — Pause / “you died” from scripts

Gameplay can freeze the world and still draw UI. Mouse is not required yet — keyboard is enough.

| Work item     | Notes                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| `strata.pause` / unpause **or** a play flag scripts already respect | Prefer one host flag the engine applies (stop `on_update` movement, keep UI scripts) |
| Full-screen `ui.rect` + `ui.text` | Centered “paused” / “you died” copy                                                   |
| Input           | `input.pressed("Escape")` already exists. While paused, **eat** leftover keys/clicks so Hero does not walk under the card |
| `ui.eat()`      | Immediate-mode stand-in until Control filters (UI4). Pause script calls it every frame the card is up |
| **Acceptance**  | Escape toggles a pause card; world stops; arrows/Space do nothing until unpause; Escape again resumes |

**Do not** open an editor dialog. This is in-viewport. Eating is required even if `on_update` is frozen — clicks and a late-unpause edge must not leak.


### UI4 — Control nodes (scene tree)

Godot-shaped: UI is nodes, not only `on_update` calls. First kinds: **Control** (empty) and **Label**.

| Work item        | Notes                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Entity kind      | `control` / `label` (names TBD). Live in Hierarchy like Sprite. Ignore world camera            |
| Screen transform | `x, y, width, height` mean viewport pixels. Parent Control offsets children                    |
| Label            | `text` property + script `@export`. Engine emits draw-list entries; `ui.text` still works      |
| Play             | Camera follow does not move Controls                                                           |
| Inspector        | Text / color on the Label card. **Mouse filter:** Stop / Pass / Ignore (default Label = Ignore) |
| Input            | Engine runs the UI filter pass before filling world `input.*`. Labels Ignore so the HUD does not steal clicks |
| **Acceptance**   | A Label in the scene shows “coins 0” without `ui.text` in Hero; a script can still set `text`; clicking the score does not eat gameplay |

Layout can be “absolute pixels” only. Anchors wait for UI5.

Signals already exist (RG7). A later Button uses `pressed.emit()` the same way Coin uses `collected`.


### UI5 — Anchors + full-rect

So a pause panel stays on screen when the viewport is resized.

| Work item   | Notes                                                          |
| ----------- | -------------------------------------------------------------- |
| Anchors     | Left/top/right/bottom 0–1, Godot-style, plus pixel offsets     |
| Full rect   | Control fills parent (or the view)                             |
| **Acceptance** | Resize the editor window; HUD stays in the corner; pause panel stays centered |


### UI6 — Button + simple menu

Clickable Controls. Mouse in **screen space** during Play (viewport already has pointer events in edit).

| Work item    | Notes                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Button       | Label + `ui.rect` chrome; hover/pressed draw states. Default filter **Stop**                  |
| Hit test     | Play mouse vs Control AABB, front to back, not world sprites                                  |
| Eat          | Stop eats the click. Focused Control sees keys first; uneaten keys become world `input.*`     |
| Signal       | `pressed` → Inspector connection or `fn on_pressed`                                           |
| Demo         | Pause menu: Resume. While the menu is up, arrows/Space are eaten (panel Stop or `ui.eat`)     |
| **Acceptance** | Click Resume; world runs again. Clicking Resume does not also “click” a sprite under it. Holding Right on the menu does not move Hero |

**Out of scope for UI6:** scroll views, text input, theming files, rich text. LineEdit would eat keys while focused — later.

---

## Explicit “not now”

- React/DOM HUD or pause screens
- World-space nametags (`ui.world_text`) until a game needs them
- TrueType font assets / MSDF (system/IBM Plex on the overlay is enough)
- Animation of Controls
- Mobile touch beyond “click = mouse”
- Editor-theme widgets reused as game UI
- Action maps / remapping UI (keys stay KeyboardEvent codes). Eating is about **who gets this tick’s event**, not renaming Space
- Letting world scripts opt into “raw input including eaten events” until a demo is blocked without it

---

## Success metrics


| Checkpoint | You know you’re there when…                                      |
| ---------- | ---------------------------------------------------------------- |
| **UI1**    | Play shows a live coin count from RoseGold                       |
| **UI2**    | That count sits on a bar, not floating over the tileset          |
| **UI3**    | Escape pauses the demo without an editor modal; Hero does not walk while paused |
| **UI4**    | A Label node in Hierarchy is the score, not only `ui.text`; score does not eat clicks |
| **UI5**    | Resizing the viewport does not lose the HUD                      |
| **UI6**    | A pause menu button resumes Play; that click never hits the world |


---

## Demo (while UI1 is the floor)

Keep the counter on Hero (`coins` + `on_coin`). Do not invent a HUD entity until UI4. When Label exists, move the score string onto a Label child (or a small HUD subtree) and leave Hero as movement + collect.
