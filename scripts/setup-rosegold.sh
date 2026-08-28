#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$ROOT/vendor/RoseGold-PY"
VENV_DIR="$VENDOR_DIR/.venv"

if [ ! -d "$VENDOR_DIR" ]; then
  echo "Cloning RoseGold-PY submodule into vendor/RoseGold-PY..."
  git submodule update --init -- vendor/RoseGold-PY
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating Python 3.14 venv in $VENV_DIR..."
  python3.14 -m venv "$VENV_DIR"
fi

echo "Installing RoseGold-PY in editable mode..."
"$VENV_DIR/bin/pip" install -e "$VENDOR_DIR"

ROSEGOLD_BIN="$VENV_DIR/bin/rosegold"
if [ ! -x "$ROSEGOLD_BIN" ]; then
  echo "error: rosegold binary not found at $ROSEGOLD_BIN" >&2
  exit 1
fi

echo "RoseGold ready: $ROSEGOLD_BIN"
