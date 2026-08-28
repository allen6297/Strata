const vscode = require("vscode");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/** @type {vscode.DiagnosticCollection} */
let diagnostics;
/** @type {NodeJS.Timeout | undefined} */
let diagTimer;
/** @type {vscode.StatusBarItem} */
let statusBar;
/** @type {vscode.TestController} */
let testController;

/**
 * @param {string | undefined} startDir
 * @returns {{cmd: string, prefix: string[]} | null}
 */
function findVenvCli(startDir) {
  if (!startDir) {
    return null;
  }
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    const candidates = [
      path.join(dir, ".venv", "bin", "rosegold"),
      path.join(dir, ".venv", "Scripts", "rosegold.exe"),
      path.join(dir, "venv", "bin", "rosegold"),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return { cmd: cand, prefix: [] };
      }
    }
    const pyCandidates = [
      path.join(dir, ".venv", "bin", "python"),
      path.join(dir, ".venv", "Scripts", "python.exe"),
    ];
    for (const py of pyCandidates) {
      if (fs.existsSync(py)) {
        return { cmd: py, prefix: ["-m", "rosegold"] };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * @param {string} [hintPath]
 * @returns {{cmd: string, prefix: string[]}}
 */
function cliInvocation(hintPath) {
  const cfg = vscode.workspace.getConfiguration("rosegold");
  const raw = (cfg.get("cliPath", "") || "").trim();
  if (raw && raw !== "rosegold") {
    const parts = raw.split(/\s+/).filter(Boolean);
    return { cmd: parts[0], prefix: parts.slice(1) };
  }
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const fromHint =
    hintPath && path.isAbsolute(hintPath) ? path.dirname(hintPath) : undefined;
  const found = findVenvCli(folder) || findVenvCli(fromHint);
  if (found) {
    return found;
  }
  return { cmd: "rosegold", prefix: [] };
}

/**
 * @param {string[]} args
 * @param {string} [stdin]
 * @param {string} [hintPath]
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function runIde(args, stdin, hintPath) {
  const { cmd, prefix } = cliInvocation(hintPath);
  return new Promise((resolve) => {
    const child = spawn(cmd, [...prefix, "ide", ...args], {
      cwd:
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
        (hintPath ? path.dirname(hintPath) : undefined),
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({
        code: 1,
        stdout: "",
        stderr: `${err.message} (cmd=${cmd}). Install with: uv pip install -e .`,
      });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (stdin != null) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

/**
 * @param {string[]} args
 * @param {string} [hintPath]
 */
function runCli(args, hintPath) {
  const { cmd, prefix } = cliInvocation(hintPath);
  return new Promise((resolve) => {
    const child = spawn(cmd, [...prefix, ...args], {
      cwd:
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
        (hintPath ? path.dirname(hintPath) : undefined),
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({ code: 1, stdout: "", stderr: err.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/** @param {vscode.TextDocument} doc */
function filePathOf(doc) {
  return doc.uri.scheme === "file" ? doc.uri.fsPath : doc.uri.toString();
}

/** @param {any} loc @param {vscode.Uri} fallback */
function locationFrom(loc, fallback) {
  if (!loc || !loc.range) {
    return null;
  }
  const uri =
    loc.path && path.isAbsolute(loc.path)
      ? vscode.Uri.file(loc.path)
      : fallback;
  const r = loc.range;
  return new vscode.Location(
    uri,
    new vscode.Range(
      r.start.line,
      r.start.character,
      r.end.line,
      r.end.character
    )
  );
}

/** @param {any} r */
function rangeFrom(r) {
  return new vscode.Range(
    r.start.line,
    r.start.character,
    r.end.line,
    r.end.character
  );
}

async function parseIdeJson(args, stdin, hintPath) {
  const result = await runIde(args, stdin, hintPath);
  if (!result.stdout.trim()) {
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/** @param {vscode.TextDocument} doc */
async function refreshDiagnostics(doc) {
  if (doc.languageId !== "rosegold") {
    return;
  }
  const filePath = filePathOf(doc);
  const payload = await parseIdeJson(
    ["diagnostics", "-", "--path", filePath],
    doc.getText(),
    filePath
  );
  if (!payload) {
    if (statusBar) {
      statusBar.text = "$(error) RoseGold";
      statusBar.tooltip = "Diagnostics failed — is the CLI installed?";
    }
    return;
  }
  const items = (payload.diagnostics || []).map((d) => {
    const r = d.range || {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    };
    const sev =
      d.severity === 2
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error;
    const diag = new vscode.Diagnostic(rangeFrom(r), d.message, sev);
    diag.source = d.source || "rosegold";
    return diag;
  });
  diagnostics.set(doc.uri, items);
  if (statusBar) {
    const errs = items.filter(
      (i) => i.severity === vscode.DiagnosticSeverity.Error
    ).length;
    const warns = items.length - errs;
    if (errs) {
      statusBar.text = `$(error) RoseGold ${errs}`;
      statusBar.tooltip = `${errs} error(s), ${warns} warning(s)`;
    } else if (warns) {
      statusBar.text = `$(warning) RoseGold ${warns}`;
      statusBar.tooltip = `${warns} warning(s)`;
    } else {
      statusBar.text = "$(check) RoseGold";
      statusBar.tooltip = "No problems";
    }
  }
}

/** @param {vscode.TextDocument} doc */
function scheduleDiagnostics(doc) {
  if (doc.languageId !== "rosegold") {
    return;
  }
  clearTimeout(diagTimer);
  const delay = vscode.workspace
    .getConfiguration("rosegold")
    .get("diagnosticsDelayMs", 400);
  diagTimer = setTimeout(() => refreshDiagnostics(doc), delay);
}

function sendToTerminal(shellCmd) {
  const terminal =
    vscode.window.terminals.find((t) => t.name === "RoseGold") ||
    vscode.window.createTerminal("RoseGold");
  terminal.show();
  terminal.sendText(shellCmd);
}

const KIND_MAP = {
  keyword: vscode.CompletionItemKind.Keyword,
  function: vscode.CompletionItemKind.Function,
  method: vscode.CompletionItemKind.Method,
  class: vscode.CompletionItemKind.Class,
  module: vscode.CompletionItemKind.Module,
  variable: vscode.CompletionItemKind.Variable,
  constant: vscode.CompletionItemKind.Constant,
  field: vscode.CompletionItemKind.Field,
  type: vscode.CompletionItemKind.TypeParameter,
};

const SYMBOL_KIND = {
  function: vscode.SymbolKind.Function,
  method: vscode.SymbolKind.Method,
  class: vscode.SymbolKind.Class,
  struct: vscode.SymbolKind.Struct,
  enum: vscode.SymbolKind.Enum,
  enumMember: vscode.SymbolKind.EnumMember,
  interface: vscode.SymbolKind.Interface,
  module: vscode.SymbolKind.Module,
  variable: vscode.SymbolKind.Variable,
  constant: vscode.SymbolKind.Constant,
  field: vscode.SymbolKind.Field,
};

/** @param {any} s */
function symbolFrom(s) {
  const sym = new vscode.DocumentSymbol(
    s.name,
    s.detail || "",
    SYMBOL_KIND[s.kind] || vscode.SymbolKind.Object,
    rangeFrom(s.range),
    rangeFrom(s.selectionRange || s.range)
  );
  for (const child of s.children || []) {
    sym.children.push(symbolFrom(child));
  }
  return sym;
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function setupTestExplorer(context) {
  testController = vscode.tests.createTestController(
    "rosegoldTests",
    "RoseGold"
  );
  context.subscriptions.push(testController);

  const runProfile = testController.createRunProfile(
    "Run",
    vscode.TestRunProfileKind.Run,
    async (request, token) => {
      const run = testController.createTestRun(request);
      const queue = request.include
        ? [...request.include]
        : [...testController.items].map(([, item]) => item);

      for (const item of queue) {
        if (token.isCancellationRequested) {
          break;
        }
        run.started(item);
        const file = item.uri?.fsPath;
        if (!file) {
          run.skipped(item);
          continue;
        }
        const result = await runCli(["test", file], file);
        if (result.code === 0) {
          run.passed(item);
        } else {
          run.failed(
            item,
            new vscode.TestMessage(result.stdout || result.stderr || "failed")
          );
        }
      }
      run.end();
    },
    true
  );
  context.subscriptions.push(runProfile);

  async function refreshTests() {
    testController.items.replace([]);
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      return;
    }
    const payload = await parseIdeJson(["tests", folder], undefined, folder);
    if (!payload) {
      return;
    }
    /** @type {Map<string, vscode.TestItem>} */
    const byFile = new Map();
    for (const t of payload.tests || []) {
      let parent = byFile.get(t.file);
      if (!parent) {
        parent = testController.createTestItem(
          t.file,
          path.relative(folder, t.file) || path.basename(t.file),
          vscode.Uri.file(t.file)
        );
        byFile.set(t.file, parent);
        testController.items.add(parent);
      }
      const child = testController.createTestItem(
        t.id,
        t.label,
        vscode.Uri.file(t.file)
      );
      if (t.range) {
        child.range = rangeFrom(t.range);
      }
      parent.children.add(child);
    }
  }

  testController.refreshHandler = refreshTests;
  await refreshTests();
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === "rosegold") {
        refreshTests();
      }
    })
  );
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection("rosegold");
  context.subscriptions.push(diagnostics);

  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.text = "$(loading~spin) RoseGold";
  statusBar.tooltip = "RoseGold language status";
  statusBar.command = "rosegold.showStatus";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      scheduleDiagnostics(e.document);
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      refreshDiagnostics(doc);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      refreshDiagnostics(doc);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnostics.delete(doc.uri);
    })
  );

  for (const doc of vscode.workspace.textDocuments) {
    scheduleDiagnostics(doc);
  }

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider("rosegold", {
      async provideDefinition(document, position) {
        const filePath = filePathOf(document);
        const payload = await parseIdeJson(
          [
            "definition",
            "-",
            "--path",
            filePath,
            "--line",
            String(position.line),
            "--character",
            String(position.character),
          ],
          document.getText(),
          filePath
        );
        return locationFrom(payload?.definition, document.uri);
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider("rosegold", {
      async provideReferences(document, position) {
        const filePath = filePathOf(document);
        const payload = await parseIdeJson(
          [
            "references",
            "-",
            "--path",
            filePath,
            "--line",
            String(position.line),
            "--character",
            String(position.character),
          ],
          document.getText(),
          filePath
        );
        return (payload?.references || [])
          .map((loc) => locationFrom(loc, document.uri))
          .filter(Boolean);
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerRenameProvider("rosegold", {
      async provideRenameEdits(document, position, newName) {
        const filePath = filePathOf(document);
        const payload = await parseIdeJson(
          [
            "rename",
            "-",
            "--path",
            filePath,
            "--line",
            String(position.line),
            "--character",
            String(position.character),
            "--new-name",
            newName,
          ],
          document.getText(),
          filePath
        );
        if (!payload || payload.error) {
          throw new Error(payload?.error || "rename failed");
        }
        const we = new vscode.WorkspaceEdit();
        for (const ed of payload.edits || []) {
          const uri =
            ed.path && path.isAbsolute(ed.path)
              ? vscode.Uri.file(ed.path)
              : document.uri;
          we.replace(uri, rangeFrom(ed.range), ed.newText);
        }
        return we;
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider("rosegold", {
      async provideHover(document, position) {
        const filePath = filePathOf(document);
        const payload = await parseIdeJson(
          [
            "hover",
            "-",
            "--path",
            filePath,
            "--line",
            String(position.line),
            "--character",
            String(position.character),
          ],
          document.getText(),
          filePath
        );
        const info = payload?.hover;
        if (!info || !info.contents) {
          return null;
        }
        let range;
        if (info.range) {
          range = rangeFrom(info.range);
        }
        return new vscode.Hover(
          new vscode.MarkdownString(info.contents, true),
          range
        );
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerSignatureHelpProvider(
      "rosegold",
      {
        async provideSignatureHelp(document, position) {
          const filePath = filePathOf(document);
          const payload = await parseIdeJson(
            [
              "signatureHelp",
              "-",
              "--path",
              filePath,
              "--line",
              String(position.line),
              "--character",
              String(position.character),
            ],
            document.getText(),
            filePath
          );
          const info = payload?.signatureHelp;
          if (!info || !info.signatures?.length) {
            return null;
          }
          const help = new vscode.SignatureHelp();
          help.activeSignature = info.activeSignature || 0;
          help.activeParameter = info.activeParameter || 0;
          help.signatures = info.signatures.map((s) => {
            const sig = new vscode.SignatureInformation(s.label);
            sig.parameters = (s.parameters || []).map(
              (p) => new vscode.ParameterInformation(p.label)
            );
            return sig;
          });
          return help;
        },
      },
      "(",
      ","
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      "rosegold",
      {
        async provideCompletionItems(document, position) {
          const filePath = filePathOf(document);
          const payload = await parseIdeJson(
            [
              "complete",
              "-",
              "--path",
              filePath,
              "--line",
              String(position.line),
              "--character",
              String(position.character),
            ],
            document.getText(),
            filePath
          );
          const items = payload?.completions || [];
          return items.map((c) => {
            const item = new vscode.CompletionItem(
              c.label,
              KIND_MAP[c.kind] || vscode.CompletionItemKind.Text
            );
            if (c.detail) {
              item.detail = c.detail;
            }
            if (c.documentation) {
              item.documentation = new vscode.MarkdownString(c.documentation);
            }
            if (c.insertText) {
              item.insertText = c.insertText;
            }
            return item;
          });
        },
      },
      ".",
      " ",
      "@"
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider("rosegold", {
      async provideDocumentSymbols(document) {
        const filePath = filePathOf(document);
        const payload = await parseIdeJson(
          ["documentSymbols", "-", "--path", filePath],
          document.getText(),
          filePath
        );
        return (payload?.symbols || []).map(symbolFrom);
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerWorkspaceSymbolProvider({
      async provideWorkspaceSymbols(query) {
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const args = ["workspaceSymbols", "--query", query || ""];
        if (folder) {
          args.push("--root", folder);
        }
        const payload = await parseIdeJson(args, undefined, folder);
        return (payload?.symbols || [])
          .map((s) => {
            if (!s.range || !s.path) {
              return null;
            }
            const uri = vscode.Uri.file(s.path);
            const loc = new vscode.Location(uri, rangeFrom(s.range));
            const sym = new vscode.SymbolInformation(
              s.name,
              SYMBOL_KIND[s.kind] || vscode.SymbolKind.Object,
              s.containerName || "",
              loc
            );
            return sym;
          })
          .filter(Boolean);
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerInlayHintsProvider("rosegold", {
      async provideInlayHints(document) {
        const filePath = filePathOf(document);
        const payload = await parseIdeJson(
          ["inlayHints", "-", "--path", filePath],
          document.getText(),
          filePath
        );
        return (payload?.inlayHints || []).map((h) => {
          const hint = new vscode.InlayHint(
            new vscode.Position(h.position.line, h.position.character),
            h.label,
            h.kind === "type"
              ? vscode.InlayHintKind.Type
              : vscode.InlayHintKind.Parameter
          );
          hint.paddingLeft = !!h.paddingLeft;
          hint.paddingRight = !!h.paddingRight;
          return hint;
        });
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      "rosegold",
      {
        async provideCodeActions(document, range) {
          const filePath = filePathOf(document);
          const payload = await parseIdeJson(
            [
              "codeActions",
              "-",
              "--path",
              filePath,
              "--line",
              String(range.start.line),
              "--character",
              String(range.start.character),
            ],
            document.getText(),
            filePath
          );
          return (payload?.codeActions || []).map((a) => {
            const action = new vscode.CodeAction(
              a.title,
              vscode.CodeActionKind.QuickFix
            );
            if (a.edit?.range) {
              const we = new vscode.WorkspaceEdit();
              const uri =
                a.edit.path && path.isAbsolute(a.edit.path)
                  ? vscode.Uri.file(a.edit.path)
                  : document.uri;
              we.replace(uri, rangeFrom(a.edit.range), a.edit.newText || "");
              action.edit = we;
            }
            return action;
          });
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider("rosegold", {
      async provideDocumentFormattingEdits(document) {
        const filePath = filePathOf(document);
        const result = await runIde(
          ["format", "-", "--path", filePath],
          document.getText(),
          filePath
        );
        if (result.code !== 0) {
          vscode.window.showErrorMessage(
            `Format failed: ${(result.stderr || result.stdout).trim()}`
          );
          return [];
        }
        const full = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        return [vscode.TextEdit.replace(full, result.stdout)];
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rosegold.runFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "rosegold") {
        vscode.window.showWarningMessage("Open a .rg file to run.");
        return;
      }
      await editor.document.save();
      const file = editor.document.uri.fsPath;
      const { cmd, prefix } = cliInvocation(file);
      sendToTerminal([cmd, ...prefix, JSON.stringify(file)].join(" "));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rosegold.testFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "rosegold") {
        vscode.window.showWarningMessage(
          "Open a .rg file to run @test functions."
        );
        return;
      }
      await editor.document.save();
      const file = editor.document.uri.fsPath;
      const { cmd, prefix } = cliInvocation(file);
      sendToTerminal(
        [cmd, ...prefix, "test", JSON.stringify(file)].join(" ")
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rosegold.testFolder", async (uri) => {
      let target = uri?.fsPath;
      if (!target) {
        target = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      }
      if (!target) {
        vscode.window.showWarningMessage("No folder to test.");
        return;
      }
      const { cmd, prefix } = cliInvocation(target);
      sendToTerminal(
        [cmd, ...prefix, "test", JSON.stringify(target)].join(" ")
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rosegold.showStatus", async () => {
      const { cmd, prefix } = cliInvocation(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      );
      const inv = [cmd, ...prefix].join(" ");
      vscode.window.showInformationMessage(`RoseGold CLI: ${inv}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rosegold.evalSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "rosegold") {
        vscode.window.showWarningMessage("Open a .rg file to eval a selection.");
        return;
      }
      const selection = editor.document.getText(editor.selection);
      if (!selection.trim()) {
        vscode.window.showWarningMessage("Select an expression or statements first.");
        return;
      }
      const filePath = filePathOf(editor.document);
      const { cmd, prefix } = cliInvocation(filePath);
      const result = await new Promise((resolve) => {
        const child = spawn(
          cmd,
          [...prefix, "eval", "-", "--json", "--context", filePath],
          {
            cwd:
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
              path.dirname(filePath),
            env: process.env,
          }
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => {
          stdout += d.toString();
        });
        child.stderr.on("data", (d) => {
          stderr += d.toString();
        });
        child.on("error", (err) => {
          resolve({ ok: false, error: err.message });
        });
        child.on("close", () => {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve({
              ok: false,
              error: (stderr || stdout || "eval failed").trim(),
            });
          }
        });
        child.stdin.write(selection);
        child.stdin.end();
      });
      if (!result.ok) {
        vscode.window.showErrorMessage(
          `RoseGold eval: ${result.error || "failed"}`
        );
        return;
      }
      const parts = [];
      if (result.stdout) {
        parts.push(result.stdout);
      }
      if (result.result !== undefined) {
        parts.push(String(result.result));
      }
      const msg = parts.join("\n") || "(ok)";
      vscode.window.showInformationMessage(`RoseGold ⇒ ${msg}`);
    })
  );

  setupTestExplorer(context).catch(() => {
    /* optional */
  });
}

function deactivate() {
  clearTimeout(diagTimer);
}

module.exports = { activate, deactivate };
