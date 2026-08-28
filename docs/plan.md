# Strata Roadmap / แผนงาน Strata

Snapshot: **Friday, Aug 28, 2026**

Related: [project-status.md](./project-status.md)

---

## Strategic direction / ทิศทางหลัก

| Decision | Choice | Planning implication |
|----------|--------|----------------------|
| **North star** | Engine credibility | Rust owns play; the editor is a client of the engine |
| **3D** | Toy only for now | No wgpu, no 3D runtime, no 3D script hooks — Three.js stays an editor viewport |
| **Browser** | Eventually match desktop | Plan for WASM RoseGold + the same engine API; browser is not second-class forever |

| การตัดสินใจ | ทางเลือก | ผลต่อการวางแผน |
|-------------|----------|----------------|
| **เป้าหมายหลัก** | ความน่าเชื่อถือของ engine | Rust เป็นผู้ควบคุม Play; editor เป็น client ของ engine |
| **3D** | ของเล่นชั่วคราว | ไม่ลงทุน wgpu / runtime 3D / script hooks 3D — Three.js ใช้แค่ viewport ใน editor |
| **Browser** | ให้เทียบเท่า desktop ในอนาคต | วางแผน WASM RoseGold + API engine เดียวกัน; browser ไม่ใช่โหมดรองถาวร |

**One-line goal / เป้าหมายหนึ่งบรรทัด**

Press Play anywhere (desktop first, browser later) and the **engine** runs RoseGold, mutates the world, and the UI reflects that — not the other way around.

กด Play ที่ไหนก็ได้ (desktop ก่อน browser ทีหลัง) แล้ว **engine** เป็นคนรัน RoseGold แก้ไข world และ UI แสดงผลตามนั้น — ไม่ใช่ UI ขับ engine

---

## Target architecture / สถาปัตยกรรมเป้าหมาย

```
┌─────────────────────────────────────┐
│  Editor (React)                     │
│  Panels · Viewport · Script editor  │
│         ↕ load / play / input       │
│         ↕ snapshot + events         │
└─────────────────────────────────────┘
                  ↕
┌─────────────────────────────────────┐
│  Engine (Rust)                      │
│  Tauri commands → WASM exports      │
│  World + RoseGoldScriptHost         │
│  rosegold interpreter               │
└─────────────────────────────────────┘
```

**Principles / หลักการ**

1. **Engine is source of truth during play** — entity positions, spawns, and destroys come from `World`, not TypeScript directive replay.
2. **Same contract everywhere** — Tauri commands today, WASM exports tomorrow; React should not care which backend runs.
3. **3D is display-only** — scene JSON may contain 3D entities for editing; play mode in the engine is **2D-only** for now.
4. **Directives are an implementation detail** — keep `print("strata:…")` internally at first; plan structured host callbacks after the credibility milestone.

1. **Engine เป็นแหล่งความจริงตอน Play** — ตำแหน่ง entity, spawn, destroy มาจาก `World` ไม่ใช่การ replay directive ใน TypeScript
2. **สัญญา API เดียวกันทุกที่** — Tauri วันนี้, WASM พรุ่งนี้; React ไม่ควรรู้ว่า backend ไหนรัน
3. **3D แสดงผลอย่างเดียว** — scene JSON มี entity 3D สำหรับแก้ใน editor; โหมด Play ใน engine เป็น **2D เท่านั้น** ในตอนนี้
4. **Directive เป็นรายละเอียดภายใน** — ใช้ `print("strata:…")` ก่อนได้; วางแผน callback แบบ structured หลัง milestone ความน่าเชื่อถือ

---

## Milestone map / แผน milestone

### M1 — Engine-owned play (desktop) / Play ที่ engine เป็นเจ้าของ (desktop)

**Priority: first / ลำดับแรก**

**Outcome / ผลลัพธ์:** Desktop Play runs entirely in Rust; the React viewport renders engine snapshots.

Desktop Play รันทั้งหมดใน Rust; React viewport แสดง snapshot จาก engine

| Work item | Notes |
|-----------|--------|
| `RoseGoldScriptHost` | Implements `ScriptHost`; loads `.rg` per entity `scriptPath` |
| Hook lifecycle | `on_ready` once per entity on load; `on_update(dt, keys)` each tick |
| Directive application | Parse stdout → mutate `World` (move, set, spawn, destroy, …) |
| Input forwarding | Keys held during play passed into `on_update` (same CSV model as today) |
| Snapshot API | `engine_tick(dt, keys)` returns `{ entities, log, playing }` |
| Frontend play loop | Stop applying directives in TS on desktop; consume engine snapshot |
| **Acceptance** | `examples/demo-project`: Hero moves via engine; Stop restores edit camera/state |

| งาน | หมายเหตุ |
|-----|----------|
| `RoseGoldScriptHost` | implement `ScriptHost`; โหลด `.rg` ตาม `scriptPath` ของ entity |
| วงจร hook | `on_ready` ครั้งเดียวต่อ entity; `on_update(dt, keys)` ทุก tick |
| ใช้ directive | parse stdout → แก้ `World` |
| ส่ง input | ส่ง keys ที่กดค้างเข้า `on_update` |
| Snapshot API | `engine_tick` คืน entities, log, playing |
| Play loop ฝั่ง frontend | desktop หยุด apply directive ใน TS; ใช้ snapshot จาก engine |
| **เกณฑ์ผ่าน** | demo project: Hero เคลื่อนผ่าน engine; Stop คืนสภาพแก้ไข |

**Out of scope for M1 / นอกขอบเขต M1:** module imports, collisions, new editor panels, browser, 3D runtime.

**Open design questions / คำถามออกแบบที่ยังเปิดอยู่**

- **Edit vs play state:** Snapshot-and-restore on stop, or two worlds (edit + runtime)?
- **Script errors during play:** Pause + log, or skip entity and continue?
- **Spawned entities:** Do snapshot IDs match what the viewport expects?

- **สถานะแก้ไข vs เล่น:** restore snapshot ตอน Stop หรือแยก world สองชุด?
- **Error ระหว่าง Play:** หยุดชั่วคราว + log หรือข้าม entity?
- **Entity ที่ spawn:** ID ใน snapshot ตรงกับที่ viewport ใช้หรือไม่?

---

### M2 — Engine API stability (desktop) / ความเสถียรของ API engine

**Outcome / ผลลัพธ์:** The React ↔ Rust boundary is stable enough to WASM-wrap later.

ขอบเขต React ↔ Rust เสถียรพอที่จะห่อ WASM ได้ภายหลัง

| Work item | Notes |
|-----------|--------|
| Versioned play protocol | Document snapshot JSON shape |
| Structured effects (optional) | `HostEffect` enum instead of print-parsing only |
| Project root in engine | Engine knows project path for script resolution |
| Play log channel | stdout/stderr as first-class snapshot fields |
| **Acceptance** | Same play behavior with a mock backend in tests |

| งาน | หมายเหตุ |
|-----|----------|
| โปรโตคอล Play มีเวอร์ชัน | เอกสารรูปแบบ JSON ของ snapshot |
| เอฟเฟกต์แบบ structured (ทางเลือก) | enum แทน parse print อย่างเดียว |
| project root ใน engine | รู้ path โปรเจกต์สำหรับ resolve script |
| ช่อง play log | stdout/stderr เป็นฟิลด์ใน snapshot |
| **เกณฑ์ผ่าน** | พฤติกรรม Play เหมือนเดิมเมื่อ mock backend ในเทส |

---

### M3 — Script ecosystem / ระบบนิเวศสคริปต์

**Outcome / ผลลัพธ์:** Scripts can share code and fail clearly — still engine-first.

สคริปต์แชร์โค้ดได้และ error ชัดเจน — ยังเน้น engine เป็นหลัก

| Work item | Notes |
|-----------|--------|
| File-based imports | `import utils;` resolves `.rg` from project / script directory |
| Stdlib as `.rg` files | Move hard-coded `Option` / `Result` out of interpreter |
| Script diagnostics | RoseGold `line:col` → squiggles in Script panel (desktop) |
| **Acceptance** | Demo uses at least one imported module; errors at correct line |

| งาน | หมายเหตุ |
|-----|----------|
| import จากไฟล์ | resolve `.rg` จากโฟลเดอร์โปรเจกต์ / สคริปต์ |
| stdlib เป็นไฟล์ `.rg` | ย้าย `Option` / `Result` ออกจาก interpreter |
| diagnostics ใน editor | แสดง error ที่บรรทัด/คอลัมน์ใน Script panel |
| **เกณฑ์ผ่าน** | demo ใช้ module ที่ import; error ตรงบรรทัด |

Language features (structs, type checker, full `io`) stay **backlog** until M1–M3 are solid unless a demo script blocks progress.

ฟีเจอร์ภาษา (struct, type checker, `io` เต็ม) **คิวหลัง** จนกว่า M1–M3 จะมั่นคง — เว้นแต่สคริปต์ demo ติด

---

### M4 — Browser parity with desktop / Browser เทียบเท่า desktop

**Outcome / ผลลัพธ์:** `npm run dev` Play behaves like `npm run tauri:dev` for 2D scenes.

`npm run dev` เล่นได้เหมือน desktop สำหรับ scene 2D

| Work item | Notes |
|-----------|--------|
| WASM build | `rosegold` + minimal `strata-engine` → WASM |
| Shared TS adapter | `lib/engine.ts` calls Tauri *or* WASM with same types |
| Performance | Snapshot diff or throttle if full entity list each frame is heavy |
| **Acceptance** | Same demo: play, move, spawn, destroy in browser without directive preview hack |

| งาน | หมายเหตุ |
|-----|----------|
| build WASM | compile interpreter + engine ขั้นต่ำ |
| adapter TypeScript ร่วม | engine.ts เรียก Tauri หรือ WASM แบบ type เดียวกัน |
| ประสิทธิภาพ | diff snapshot หรือ throttle ถ้าส่ง entity ทั้งก้อนทุกเฟรม |
| **เกณฑ์ผ่าน** | demo เดียวกันเล่นใน browser ได้โดยไม่ใช้ preview hack |

**Still out of scope / ยังนอกขอบเขต:** 3D play in browser, native file I/O in scripts (`io` stdlib).

**Risks to plan for / ความเสี่ยง:** WASM bundle size, `wasm32` toolchain, single-threaded interpreter is OK.

---

### M5 — Gameplay systems / ระบบ gameplay

**After engine is trusted / หลัง engine น่าเชื่อถือแล้ว**

| Feature | Why later |
|---------|-----------|
| Collisions / triggers | Needs stable entity lifecycle from engine |
| Prefabs | Needs spawn API in engine |
| Tilemaps | Large editor + runtime surface |
| Audio from engine | Consistent ownership: engine or delegated adapter |

| ฟีเจอร์ | ทำทีหลังเพราะ |
|---------|----------------|
| ชน / trigger | ต้องมี lifecycle entity ที่เสถียร |
| Prefab | ต้องมี spawn API ใน engine |
| Tilemap | งาน editor + runtime ใหญ่ |
| เสียงจาก engine | ต้องกำหนดว่า engine เป็นเจ้าของหรือ delegate |

3D remains **editor toy only**: orbit camera, mesh placement, scene JSON — no 3D tick in `World`.

3D ยังเป็น **ของเล่นใน editor**: กล้อง orbit, วาง mesh, บันทึก JSON — ไม่มี tick 3D ใน `World`

---

## Phase order / ลำดับเฟส

```
M1 Engine play (desktop)
  → M2 Stable engine API
    → M3 Imports + diagnostics
      → M4 WASM / browser parity
        → M5 Gameplay (collision, prefabs, …)
```

```
M1 Play ที่ engine (desktop)
  → M2 API engine เสถียร
    → M3 Import + diagnostics
      → M4 WASM / browser เท่ากัน
        → M5 Gameplay (ชน, prefab, …)
```

3D: parallel **editor-only** track — small UX fixes OK, no engine investment.

3D: แ track แยก **เฉพาะ editor** — แก้ UX เล็กน้อยได้ ไม่ลงทุน engine

---

## Explicit “not now” / รายการ “ยังไม่ทำ”

- wgpu / native 3D renderer
- 3D script hooks or 3D physics
- Full RoseGold-PY parity sprint before M1 (structs, type checker, `io`)
- VS Code extension rewrite (after Rust CLI is stable)
- Tilemaps, prefabs, collision — until engine play is boringly reliable

- wgpu / renderer 3D  native
- script hooks 3D หรือฟิสิกส์ 3D
- ไล่ parity RoseGold-PY ทั้งก้อนก่อน M1
- rewrite VS Code extension (หลัง CLI Rust พร้อม)
- tilemap, prefab, collision — จนกว่า Play จะน่าเชื่อถือแบบไม่ต้องคิด

---

## Success metrics / เกณฑ์ความสำเร็จ

| Checkpoint | You know you’re there when… | รู้ว่าถึงแล้วเมื่อ… |
|------------|------------------------------|---------------------|
| **M1** | Play is “engine ticks, UI draws” with no asterisk | Play = engine tick, UI วาด — ไม่มีดอกจัน |
| **M2** | Someone could build a second client from the snapshot schema | คนอื่นสร้าง client ที่สองจาก schema snapshot ได้ |
| **M3** | Demo uses `import` and a shared util module | demo ใช้ `import` และ module ร่วม |
| **M4** | Same scene demos in browser and desktop without “preview mode” | scene เดียว demo ได้ทั้ง browser และ desktop โดยไม่พูด preview |
| **M5** | Designing game mechanics, not fighting the play loop | ออกแบบเกม ไม่ใช่แก้ loop Play |

---

## M1 decisions to make before implementation / ตัดสินใจ M1 ก่อนลงมือ

| # | Question (EN) | คำถาม (TH) |
|---|---------------|------------|
| 1 | On **Stop**: restore pre-play snapshot, or merge runtime changes into the edit scene? | ตอน **Stop**: คืน snapshot ก่อนเล่น หรือ merge การเปลี่ยนแปลงเข้า scene แก้ไข? |
| 2 | **Multi-entity scripts**: one interpreter per entity, or one program with multiple hooks? | **หลาย entity**: interpreter ต่อ entity หรือโปรแกรมเดียวหลาย hook? |
| 3 | **Browser timeline**: WASM right after M2, or ship desktop M1–M3 first and accept temporary divergence? | **Browser**: WASM หลัง M2 ทันที หรือส่ง desktop M1–M3 ก่อน ยอม diverge ชั่วคราว? |

---

## Current state (summary) / สถานะปัจจุบัน (สรุป)

| Layer | Status |
|-------|--------|
| Editor UI | Dockable panels, hierarchy, inspector, assets, 2D/3D/script modes, play, undo |
| 2D runtime (UI) | Canvas, textures, gizmos, Strata directives |
| 3D editor | Three.js view only |
| RoseGold (Rust) | Phases 1–4.1 done (see [project-status.md](./project-status.md)) |
| Desktop | Real interpreter via Tauri; engine still uses `NullScriptHost` |
| Browser | Directive preview only — target is M4 parity |

| ชั้น | สถานะ |
|------|--------|
| UI Editor | พanel ลากได้, hierarchy, inspector, assets, โหมด 2D/3D/script, play, undo |
| Runtime 2D (UI) | Canvas, texture, gizmo, directive |
| Editor 3D | Three.js แสดงผลอย่างเดียว |
| RoseGold (Rust) | เฟส 1–4.1 เสร็จ (ดู project-status) |
| Desktop | interpreter จริงผ่าน Tauri; engine ยังเป็น `NullScriptHost` |
| Browser | preview directive — เป้าหมายคือเท่า desktop ที่ M4 |

---

## How to use this doc / วิธีใช้เอกสารนี้

1. Resolve the three **M1 decisions** above when ready to implement.
2. Track detailed interpreter progress in [project-status.md](./project-status.md).
3. Pick the next failing [RoseGold-PY](https://github.com/allen6297/RoseGold-PY) example only when M3 module work begins — not before M1.

1. ตอบ **คำถาม M1 สามข้อ** เมื่อพร้อม implement
2. ติดตามความคืบหน้า interpreter ใน project-status.md
3. ใช้ตัวอย่าง RoseGold-PY ที่ fail เป็นไกด์เมื่อเริ่ม M3 — ไม่ใช่ก่อน M1
