# RoseGold for VS Code / Cursor

Syntax highlighting, diagnostics, navigation, testing, and formatting for `.rg` sources.

## Install (local, in this repo)

1. Install the language package so the CLI exists:

   ```bash
   uv pip install -e .
   # or: pip install -e .
   ```

2. Command Palette → **Developer: Install Extension from Location…**
3. Choose `editors/vscode`
4. Reload the window if prompted
5. Open a `.rg` file

### Package a `.vsix`

```bash
cd editors/vscode
npm run package
# installs as: cursor --install-extension rosegold-0.3.2.vsix
```

If `rosegold` is not on `PATH`, set **RoseGold › Cli Path** to `python -m rosegold` (or `.venv/bin/python -m rosegold`).

## Features

| Feature | How |
|---|---|
| Highlighting | TextMate grammar (decorators `@test` / `@ufcs`, f-strings, builtins, …) |
| Diagnostics | live while typing; status bar shows error/warning counts |
| Go to Definition | F12 / Cmd-click |
| Find References | Shift-F12 |
| Rename Symbol | F2 (project-wide; skips strings/comments) |
| Workspace Symbols | Cmd-T / Ctrl-T |
| Hover docs | signature + `///` / `/* */` docs |
| Signature help | parameter hints inside `(` … `)` |
| Completions | keywords, symbols, `obj.` members |
| Outline / symbols | document symbols in the Outline view |
| Inlay hints | `: Type` after unannotated `const` |
| Code actions | quick fixes (e.g. add `init`, import `Result`) |
| Format Document | `rosegold ide format` |
| Snippets | `fn`, `main`, `@test`, `@ufcs`, `f"`, … |
| Run File | play button / **RoseGold: Run File** |
| Run Tests | beaker / **RoseGold: Run Tests** |
| Eval Selection | Cmd-Shift-E / editor context menu |
| Run Tests in Folder | explorer context menu on a folder |
| Test Explorer | Testing sidebar lists `@test` functions |
| Tasks | Run / Test current file, Test workspace, language test suite |

```bash
rosegold test examples/    # directory discovery also works in the terminal
```

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `rosegold.cliPath` | *(empty)* | CLI override; empty = auto-detect workspace `.venv` |
| `rosegold.diagnosticsDelayMs` | `400` | Debounce for live diagnostics |

## Develop

Edit files here, then **Developer: Reload Window**. There is no hot reload.
