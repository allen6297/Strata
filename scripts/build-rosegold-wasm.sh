#!/usr/bin/env bash
# Build RoseGold WASM package for browser Play.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src/wasm/rosegold"
mkdir -p "$OUT"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack not found; installing via cargo…"
  cargo install wasm-pack --locked
fi

# Ensure wasm32 target
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true

cd "$ROOT"
wasm-pack build crates/rosegold-wasm \
  --target web \
  --out-dir "$OUT" \
  --out-name rosegold_wasm \
  --release

# Drop README/package.json noise from wasm-pack that confuses Vite sometimes
rm -f "$OUT/.gitignore" "$OUT/package.json" "$OUT/README.md" 2>/dev/null || true

echo "RoseGold WASM written to $OUT"
