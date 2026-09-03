import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import {
  completionType,
  docsBuiltins,
  docsHooks,
  docsMembers,
  lookupDocs,
  ROSEGOLD_DOCS,
  type DocsEntry,
} from '@/lib/rosegold-docs'
import {
  allClasses,
  allTraits,
  classAt,
  membersFor,
  NODE_BASES,
  scanSource,
  type MemberItem,
  type ScanFile,
} from '@/lib/rosegold-scan'
import { docsCardInfo, docCardDom } from '@/lib/rosegold-tooltip'

const KEYWORDS: Completion[] = [
  'elif',
  'else',
  'return',
  'break',
  'continue',
  'pass',
  'pub',
  'impl',
  'class',
  'trait',
  'extends',
  'from',
  'as',
  'const',
  'in',
  'self',
  'super',
  'true',
  'false',
  'none',
].map((label) => ({ label, type: 'keyword' }))

const TYPES: Completion[] = [
  'Int',
  'Float',
  'String',
  'Str',
  'Bool',
  'Void',
  'Array',
  'Map',
  'Option',
  'Result',
  'Vec2',
  'Vec3',
  'Node',
  'Empty',
  'Sprite',
  'Tilemap',
  'Camera',
  'Mesh',
  'Light',
].map((label) => {
  const entry = lookupDocs(label)
  return {
    label,
    type: 'type' as const,
    detail: entry?.detail ?? 'type',
    info: entry ? docsCardInfo(entry) : undefined,
  }
})

function fromDocs(
  key: string,
  template: string,
  extra?: Partial<Completion>,
): Completion {
  const entry = lookupDocs(key)
  return snippetCompletion(template, {
    label: extra?.label ?? entry?.label ?? key,
    type: extra?.type ?? (entry ? completionType(entry.kind) : 'function'),
    detail: extra?.detail ?? entry?.detail,
    info: extra?.info ?? (entry ? docsCardInfo(entry) : undefined),
    boost: extra?.boost ?? entry?.boost,
  })
}

function fromEntry(e: DocsEntry, template: string, extra?: Partial<Completion>): Completion {
  return snippetCompletion(template, {
    label: extra?.label ?? e.label,
    type: extra?.type ?? completionType(e.kind),
    detail: extra?.detail ?? e.detail,
    info: extra?.info ?? docsCardInfo(e),
    boost: extra?.boost ?? e.boost,
  })
}

const SNIPPETS: Completion[] = [
  snippetCompletion(
    'fn ${name}(${args}): ${type:Int} {\n  ${}\n}',
    { label: 'fn', type: 'keyword', detail: 'function', boost: 8 },
  ),
  snippetCompletion('struct ${Name} {\n  ${}\n}', {
    label: 'struct',
    type: 'keyword',
    detail: 'struct',
    boost: 6,
  }),
  snippetCompletion(
    'class ${Name} {\n  var ${x}: ${type:Float} = ${0};\n  fn ${method}(self): ${ret:Float} {\n    ${}\n  }\n}',
    {
      label: 'class',
      type: 'keyword',
      detail: 'class',
      boost: 6,
    },
  ),
  snippetCompletion(
    'class ${Name} impl ${Trait} {\n  var ${x}: ${type:Float} = ${0};\n  fn ${method}(self): ${ret:Float} {\n    ${}\n  }\n}',
    {
      label: 'class impl',
      type: 'keyword',
      detail: 'class with traits',
      boost: 6,
    },
  ),
  snippetCompletion(
    'class ${Name} extends ${Parent} impl ${Trait} {\n  var ${x}: ${type:Float} = ${0};\n  fn ${method}(self): ${ret:Float} {\n    return super.${method}();\n  }\n}',
    {
      label: 'class extends',
      type: 'keyword',
      detail: 'class extends',
      boost: 6,
    },
  ),
    snippetCompletion(
      'import strata.${Parent:Sprite};\n@node\nclass ${Name} extends ${Parent:Sprite} {\n  fn on_create() {\n    ${}\n  }\n  fn on_update(dt: Float) {\n    pass;\n  }\n  fn on_destroy() {\n    pass;\n  }\n}',
    {
      label: 'node class',
      type: 'keyword',
      detail: '@node class',
      boost: 7,
    },
  ),
  snippetCompletion('trait ${Name} {\n  signal ${event}();\n  fn ${method}(self): ${ret:Float};\n}', {
    label: 'trait',
    type: 'keyword',
    detail: 'trait',
    boost: 5,
  }),
  snippetCompletion(
    'impl ${Trait} {\n  fn ${method}(self): ${ret:String} {\n    ${}\n  }\n}',
    {
      label: 'impl trait',
      type: 'keyword',
      detail: 'nested trait impl',
      boost: 6,
    },
  ),
  snippetCompletion(
    'match ${value} {\n  ${pattern} {\n    ${}\n  }\n  _ {\n    pass;\n  }\n}',
    { label: 'match', type: 'keyword', detail: 'match', boost: 6 },
  ),
  snippetCompletion('enum ${Name} {\n  ${Variant},\n  ${}\n}', {
    label: 'enum',
    type: 'keyword',
    detail: 'enum',
    boost: 4,
  }),
  snippetCompletion('var ${name}: ${type:Int} = ${0};', {
    label: 'var',
    type: 'keyword',
    detail: 'variable',
    boost: 4,
  }),
  snippetCompletion('@export var ${name}: ${type:Float} = ${0};', {
    label: '@export',
    type: 'keyword',
    detail: 'inspector property',
    boost: 7,
  }),
  snippetCompletion('@export_group("${Name}")', {
    label: '@export_group',
    type: 'keyword',
    detail: 'inspector group',
    boost: 6,
  }),
  snippetCompletion('@ufcs\nfn ${name}(${n}: ${type:Float}): ${ret:Float} {\n  ${}\n}', {
    label: '@ufcs',
    type: 'keyword',
    detail: 'call as a method',
    boost: 5,
  }),
  snippetCompletion('signal ${name}(${args});', {
    label: 'signal',
    type: 'keyword',
    detail: 'declare signal',
    boost: 7,
  }),
  snippetCompletion('${name}.emit(${0});', {
    label: '.emit',
    type: 'function',
    detail: 'fire signal',
    boost: 6,
  }),
  snippetCompletion('mod ${name} {\n  ${}\n}', {
    label: 'mod',
    type: 'keyword',
    detail: 'named module',
    boost: 4,
  }),
  snippetCompletion('import ${module};', {
    label: 'import',
    type: 'keyword',
    detail: 'import module',
    boost: 4,
  }),
  snippetCompletion('if ${cond} {\n  ${}\n}', {
    label: 'if',
    type: 'keyword',
    detail: 'if',
    boost: 3,
  }),
  snippetCompletion('while ${cond} {\n  ${}\n}', {
    label: 'while',
    type: 'keyword',
    detail: 'while',
    boost: 3,
  }),
  snippetCompletion('for ${x} in ${range} {\n  ${}\n}', {
    label: 'for',
    type: 'keyword',
    detail: 'for-in',
    boost: 3,
  }),
  fromDocs('strata.move', 'strata.move(${dx}, ${dy});', {
    label: 'strata.move',
    boost: 10,
  }),
  fromDocs('strata.after', 'strata.after(${delay}, "${method}");', {
    label: 'strata.after',
    boost: 8,
  }),
  fromDocs('input.pressed', 'input.pressed("${code}")', {
    label: 'input.pressed',
    boost: 9,
  }),
  fromDocs('input.held', 'input.held("${code}")', {
    label: 'input.held',
    boost: 8,
  }),
  fromDocs('strata.find', 'strata.find("${name}")', {
    label: 'strata.find',
    boost: 7,
  }),
  ...docsBuiltins()
    .filter((e) => e.template)
    .map((e) => fromEntry(e, `${e.template};`)),
]

const MODULES: Completion[] = ROSEGOLD_DOCS.filter((e) => e.kind === 'module').map(
  (e) => ({
    label: e.label,
    type: 'namespace',
    detail: e.detail,
    info: docsCardInfo(e),
  }),
)

function inStringOrComment(context: CompletionContext): boolean {
  const node = syntaxTree(context.state).resolveInner(context.pos, -1)
  const name = node.name.toLowerCase()
  return name.includes('comment') || name.includes('string')
}

function completionKind(kind: string): Completion['type'] {
  if (kind === 'fn') return 'function'
  if (kind === 'struct' || kind === 'enum' || kind === 'class' || kind === 'trait') {
    return 'type'
  }
  if (kind === 'mod') return 'namespace'
  if (kind === 'signal') return 'function'
  return 'variable'
}

function scanLocals(file: ScanFile): Completion[] {
  const out: Completion[] = []
  const seen = new Set<string>()
  for (const s of file.symbols) {
    if (seen.has(s.name)) continue
    seen.add(s.name)
    out.push({
      label: s.name,
      type: completionKind(s.kind),
      detail: s.kind === 'fn' ? 'in file' : s.kind,
      boost: 12,
    })
  }
  return out
}

function emitCompletion(): Completion {
  return snippetCompletion('emit(${})', {
    label: 'emit',
    type: 'function',
    detail: 'signal',
    info: () =>
      docCardDom(
        {
          kind: 'function',
          detail: 'signal',
          signature: 'signal.emit(...)',
          doc: 'Fire this signal. Inspector connections run the target method.',
        },
        'rg-complete-info',
      ),
  })
}

function memberItem(name: string, type: Completion['type'], detail: string, boost = 30): Completion {
  return { label: name, type, detail, boost }
}

function memberFromScan(item: MemberItem): Completion {
  if (item.role === 'emit') return emitCompletion()
  const type = item.role === 'field' ? 'variable' : 'function'
  const detail =
    item.role === 'super' ? 'super' : item.role === 'signal' ? 'signal' : item.role
  return memberItem(item.name, type, detail, item.role === 'field' ? 32 : 31)
}

function filesAround(source: string, modules?: Record<string, string>): ScanFile[] {
  const current = scanSource(source)
  const rest = modules
    ? Object.values(modules).map((src) => scanSource(src))
    : []
  return [current, ...rest]
}

function catalogMembers(mod: string): Completion[] {
  return docsMembers(mod)
    .filter((item) => item.template)
    .map((item) => fromEntry(item, item.template!))
}

function nodeHookSnippets(): Completion[] {
  return [
    snippetCompletion('fn on_create() {\n  ${}\n}', {
      label: 'on_create',
      type: 'function',
      detail: '@node hook',
      boost: 21,
    }),
    snippetCompletion('fn on_update(dt: Float) {\n  ${}\n}', {
      label: 'on_update',
      type: 'function',
      detail: '@node hook',
      boost: 22,
    }),
    snippetCompletion('fn on_destroy() {\n  ${}\n}', {
      label: 'on_destroy',
      type: 'function',
      detail: '@node hook',
      boost: 16,
    }),
    snippetCompletion('fn on_enter(other: Str) {\n  ${}\n}', {
      label: 'on_enter',
      type: 'function',
      detail: '@node hook',
      boost: 18,
    }),
    snippetCompletion('fn on_exit(other: Str) {\n  ${}\n}', {
      label: 'on_exit',
      type: 'function',
      detail: '@node hook',
      boost: 18,
    }),
  ]
}

function keywordTypeContext(
  context: CompletionContext,
  kw: 'extends' | 'impl',
): { from: number } | null {
  const re = kw === 'extends' ? /\bextends\s+[A-Za-z_]*$/ : /\bimpl\s+[A-Za-z_]*$/
  const m = context.matchBefore(re)
  if (!m) return null
  const name = m.text.match(/[A-Za-z_]\w*$/)
  return { from: name ? m.to - name[0].length : m.to }
}

function nodeBaseCompletions(): Completion[] {
  return NODE_BASES.map((label) => {
    const entry = lookupDocs(label)
    return {
      label,
      type: 'type' as const,
      detail: entry?.detail ?? 'node',
      info: entry ? docsCardInfo(entry) : undefined,
      boost: 40,
    }
  })
}

function selfMembers(cls: NonNullable<ReturnType<typeof classAt>>, files: ScanFile[]): Completion[] {
  const hit = membersFor(files[0]!, files, cls.bodyFrom + 1, 'self')
  if (hit.kind !== 'list') return []
  return hit.items.filter((i) => i.role !== 'emit').map(memberFromScan)
}

export function completeRoseGold(
  context: CompletionContext,
  modules?: Record<string, string>,
): CompletionResult | null {
  if (inStringOrComment(context)) return null

  const source = context.state.doc.toString()
  const files = filesAround(source, modules)
  const file = files[0]!
  const enclosing = classAt(file, context.pos)

  const member = context.matchBefore(/[A-Za-z_]\w*\.\w*$/)
  if (member) {
    const dot = member.text.lastIndexOf('.')
    const mod = member.text.slice(0, dot)
    const hit = membersFor(file, files, context.pos, mod)
    let options: Completion[] = []
    if (hit.kind === 'list') {
      options = hit.items.map(memberFromScan)
    } else {
      const catalog = catalogMembers(mod)
      options = catalog.length ? catalog : [emitCompletion()]
    }
    if (!options.length) return null
    return {
      from: member.from + dot + 1,
      options,
      validFor: /^\w*$/,
    }
  }

  const extendsCtx = keywordTypeContext(context, 'extends')
  if (extendsCtx) {
    const local = allClasses(files).filter((n) => n !== enclosing?.name)
    return {
      from: extendsCtx.from,
      options: [
        ...nodeBaseCompletions(),
        ...local.map((n) => memberItem(n, 'type', 'class', 20)),
      ],
      validFor: /^\w*$/,
    }
  }

  const implFor = context.matchBefore(/\bimpl\s+[A-Za-z_]\w*\s+for\s+[A-Za-z_]*$/)
  if (implFor) {
    const name = implFor.text.match(/[A-Za-z_]\w*$/)
    const from = name ? implFor.to - name[0].length : implFor.to
    return {
      from,
      options: [
        ...nodeBaseCompletions(),
        ...allClasses(files).map((n) => memberItem(n, 'type', 'class', 20)),
      ],
      validFor: /^\w*$/,
    }
  }

  const implCtx = keywordTypeContext(context, 'impl')
  if (implCtx) {
    return {
      from: implCtx.from,
      options: allTraits(files).map((n) => memberItem(n, 'type', 'trait', 40)),
      validFor: /^\w*$/,
    }
  }

  const word = context.matchBefore(/[A-Za-z_]\w*/)
  if (!word || (word.from === word.to && !context.explicit)) return null

  const hooks = enclosing?.isNode
    ? nodeHookSnippets()
    : docsHooks()
        .filter((e) => e.template)
        .map((e) => fromEntry(e, e.template!))

  const classNames = enclosing ? selfMembers(enclosing, files) : []

  return {
    from: word.from,
    options: [
      ...SNIPPETS,
      ...hooks,
      ...KEYWORDS,
      ...TYPES,
      ...MODULES,
      ...scanLocals(file),
      ...classNames,
    ],
    validFor: /^[A-Za-z_]\w*$/,
  }
}

/** Starter buffer for New .rg — hooks the engine actually calls. */
export const DEFAULT_NEW_SCRIPT = `fn on_ready(name: String, x: Float, y: Float): Int {
  return 0;
}

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
  return 0;
}
`
