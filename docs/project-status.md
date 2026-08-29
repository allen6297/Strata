# Project Status — Strata

Snapshot: **Saturday, Aug 29, 2026**

## Done recently

- RoseGold-PY examples ported into `cargo test -p rosegold`
- Engine `spawn` / `destroy`, unique spawn IDs, script library for `script=Name`
- Play restores edit state on Stop; clears host scripts/keys
- Host errors surface in play log (`hadError`)
- Demo Player/Coin scripts (move, jump sound, spawn Orb on ready, Q destroys Coin)
- Browser WASM RoseGold (`npm run build:wasm` → `src/wasm/rosegold`)
- `@test` runner via `rosegold::run_tests`

## Next (optional)

- Full engine WASM (world + tick) for browser parity with desktop
- Key edge-trigger (avoid held-key repeat for sound/destroy)
- More upstream example chase as needed

## Commands

```bash
cargo test -p rosegold -p strata-engine
npm run build:wasm
npx tsc -b
npm run tauri:dev   # desktop Play
npm run dev         # browser + WASM when built
```
