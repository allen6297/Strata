/** Regex/brace scan of a .rg buffer. Completions, not a typechecker. */

const IDENT = '[A-Za-z_]\\w*'

export const NODE_BASES = [
  'Node',
  'Empty',
  'Sprite',
  'Tilemap',
  'Camera',
  'Mesh',
  'Light',
] as const

export const NODE_FIELDS = ['name', 'x', 'y', 'z'] as const

export const NODE_METHODS = [
  'on_create',
  'on_update',
  'on_destroy',
  'on_enter',
  'on_exit',
] as const

export type ScanKind =
  | 'fn'
  | 'var'
  | 'const'
  | 'struct'
  | 'enum'
  | 'class'
  | 'trait'
  | 'mod'
  | 'signal'

export type ScanSymbol = {
  name: string
  kind: ScanKind
  from: number
  to: number
}

export type ScanMember = { name: string; from: number }

export type ScanClass = {
  name: string
  from: number
  bodyFrom: number
  bodyTo: number
  extendsName: string | null
  impls: string[]
  isNode: boolean
  fields: ScanMember[]
  methods: ScanMember[]
  signals: ScanMember[]
}

export type ScanTrait = {
  name: string
  from: number
  bodyFrom: number
  bodyTo: number
  methods: ScanMember[]
  signals: ScanMember[]
}

export type TypedLocal = { name: string; typeName: string }

export type ScanFile = {
  symbols: ScanSymbol[]
  classes: ScanClass[]
  traits: ScanTrait[]
  signals: ScanMember[]
  typedLocals: TypedLocal[]
}

function maskNoise(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === '#') {
      while (i < src.length && src[i] !== '\n') {
        out += ' '
        i += 1
      }
      continue
    }
    if (c === '"' || c === "'") {
      const q = c
      out += ' '
      i += 1
      while (i < src.length && src[i] !== q && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < src.length) {
          out += '  '
          i += 2
          continue
        }
        out += ' '
        i += 1
      }
      if (i < src.length) {
        out += ' '
        i += 1
      }
      continue
    }
    out += c
    i += 1
  }
  return out
}

function findBody(masked: string, from: number): { start: number; end: number } | null {
  const start = masked.indexOf('{', from)
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < masked.length; i += 1) {
    const c = masked[i]
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return { start, end: i }
    }
  }
  return { start, end: masked.length }
}

function prevNonemptyLine(src: string, index: number): string {
  let i = index
  while (i > 0 && src[i - 1] !== '\n') i -= 1
  let end = i
  while (end > 0 && src[end - 1] === '\n') end -= 1
  let start = end
  while (start > 0 && src[start - 1] !== '\n') start -= 1
  return src.slice(start, end).trim()
}

function membersIn(
  masked: string,
  start: number,
  end: number,
  re: RegExp,
): ScanMember[] {
  const slice = masked.slice(start, end)
  const out: ScanMember[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(slice))) {
    const name = m[1]!
    const from = start + m.index + m[0].length - name.length
    out.push({ name, from })
  }
  return out
}

function parseImpls(header: string): string[] {
  const impl = header.match(/\bimpl\s+([A-Za-z_][\w\s,]*)/)
  if (!impl) return []
  return impl[1]!
    .split(',')
    .map((s) => s.trim())
    .filter((n) => /^[A-Za-z_]\w*$/.test(n))
}

function parseExtends(header: string): string | null {
  const m = header.match(/\bextends\s+([A-Za-z_]\w*)/)
  return m?.[1] ?? null
}

/** Nested `impl Trait { … }` inside a class (not `impl Trait for Type`). */
function parseNestedImpls(masked: string, start: number, end: number): string[] {
  const slice = masked.slice(start, end)
  const re =
    /(?:^|[^A-Za-z0-9_])impl\s+([A-Za-z_]\w*)(\s+for\s+[A-Za-z_]\w*)?\s*\{/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(slice))) {
    if (m[2]) continue
    out.push(m[1]!)
  }
  return out
}

function scanTypedLocals(masked: string): TypedLocal[] {
  const out: TypedLocal[] = []
  const seen = new Set<string>()
  const push = (name: string, typeName: string) => {
    if (seen.has(name)) return
    seen.add(name)
    out.push({ name, typeName })
  }
  const annotated =
    /(?:^|[^A-Za-z0-9_])(?:pub\s+)?(?:var|const)\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)/g
  let m: RegExpExecArray | null
  while ((m = annotated.exec(masked))) {
    push(m[1]!, m[2]!)
  }
  const inferred =
    /(?:^|[^A-Za-z0-9_])(?:pub\s+)?(?:var|const)\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*\{/g
  while ((m = inferred.exec(masked))) {
    push(m[1]!, m[2]!)
  }
  return out
}

function insideAny(
  pos: number,
  ranges: Array<{ bodyFrom: number; bodyTo: number }>,
): boolean {
  return ranges.some((r) => pos > r.bodyFrom && pos < r.bodyTo)
}

export function scanSource(src: string): ScanFile {
  const masked = maskNoise(src)
  const classes: ScanClass[] = []
  const traits: ScanTrait[] = []

  const classRe = new RegExp(`(?:^|[^A-Za-z0-9_])(?:pub\\s+)?class\\s+(${IDENT})`, 'g')
  let cm: RegExpExecArray | null
  while ((cm = classRe.exec(masked))) {
    const name = cm[1]!
    const nameFrom = cm.index + cm[0].length - name.length
    const body = findBody(masked, nameFrom)
    if (!body) continue
    const header = masked.slice(nameFrom + name.length, body.start)
    const methods = membersIn(
      masked,
      body.start,
      body.end,
      /(?:^|[^A-Za-z0-9_])(?:pub\s+)?fn\s+([A-Za-z_]\w*)/g,
    )
    const methodBodies = methods
      .map((m) => findBody(masked, m.from))
      .filter((b): b is { start: number; end: number } => b != null)
      .map((b) => ({ bodyFrom: b.start, bodyTo: b.end }))
    const fields = membersIn(
      masked,
      body.start,
      body.end,
      /(?:^|[^A-Za-z0-9_])(?:@export(?:_group\s*\([^)]*\))?\s+)?(?:pub\s+)?var\s+([A-Za-z_]\w*)/g,
    ).filter((f) => !insideAny(f.from, methodBodies))
    const signals = membersIn(
      masked,
      body.start,
      body.end,
      /(?:^|[^A-Za-z0-9_])(?:pub\s+)?signal\s+([A-Za-z_]\w*)/g,
    )
    const extendsName = parseExtends(header)
    classes.push({
      name,
      from: nameFrom,
      bodyFrom: body.start,
      bodyTo: body.end,
      extendsName,
      impls: unique([
        ...parseImpls(header),
        ...parseNestedImpls(masked, body.start, body.end),
      ]),
      isNode:
        prevNonemptyLine(masked, nameFrom) === '@node' ||
        (extendsName != null && (NODE_BASES as readonly string[]).includes(extendsName)),
      fields,
      methods,
      signals,
    })
  }

  const traitRe = new RegExp(`(?:^|[^A-Za-z0-9_])(?:pub\\s+)?trait\\s+(${IDENT})`, 'g')
  let tm: RegExpExecArray | null
  while ((tm = traitRe.exec(masked))) {
    const name = tm[1]!
    const nameFrom = tm.index + tm[0].length - name.length
    const body = findBody(masked, nameFrom)
    if (!body) continue
    traits.push({
      name,
      from: nameFrom,
      bodyFrom: body.start,
      bodyTo: body.end,
      methods: membersIn(
        masked,
        body.start,
        body.end,
        /(?:^|[^A-Za-z0-9_])(?:pub\s+)?fn\s+([A-Za-z_]\w*)/g,
      ),
      signals: membersIn(
        masked,
        body.start,
        body.end,
        /(?:^|[^A-Za-z0-9_])(?:pub\s+)?signal\s+([A-Za-z_]\w*)/g,
      ),
    })
  }

  const nested = [...classes, ...traits]
  const top = (kind: ScanKind, re: RegExp): ScanSymbol[] => {
    const out: ScanSymbol[] = []
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(masked))) {
      const name = m[1]!
      const from = m.index + m[0].length - name.length
      if (insideAny(from, nested)) continue
      out.push({ name, kind, from, to: from + name.length })
    }
    return out
  }

  const symbols: ScanSymbol[] = [
    ...top('fn', /(?:^|[^A-Za-z0-9_])(?:pub\s+)?fn\s+([A-Za-z_]\w*)/g),
    ...top(
      'var',
      /(?:^|[^A-Za-z0-9_])(?:@export(?:_group\s*\([^)]*\))?\s+)?(?:pub\s+)?var\s+([A-Za-z_]\w*)/g,
    ),
    ...top('const', /(?:^|[^A-Za-z0-9_])(?:pub\s+)?const\s+([A-Za-z_]\w*)/g),
    ...top('struct', /(?:^|[^A-Za-z0-9_])(?:pub\s+)?struct\s+([A-Za-z_]\w*)/g),
    ...top('enum', /(?:^|[^A-Za-z0-9_])(?:pub\s+)?enum\s+([A-Za-z_]\w*)/g),
    ...top('mod', /(?:^|[^A-Za-z0-9_])(?:pub\s+)?mod\s+([A-Za-z_]\w*)/g),
    ...top('signal', /(?:^|[^A-Za-z0-9_])(?:pub\s+)?signal\s+([A-Za-z_]\w*)/g),
    ...classes.map((c) => ({
      name: c.name,
      kind: 'class' as const,
      from: c.from,
      to: c.from + c.name.length,
    })),
    ...traits.map((t) => ({
      name: t.name,
      kind: 'trait' as const,
      from: t.from,
      to: t.from + t.name.length,
    })),
  ]
  symbols.sort((a, b) => a.from - b.from)

  const signals = [
    ...top('signal', /(?:^|[^A-Za-z0-9_])(?:pub\s+)?signal\s+([A-Za-z_]\w*)/g).map((s) => ({
      name: s.name,
      from: s.from,
    })),
    ...classes.flatMap((c) => c.signals),
    ...traits.flatMap((t) => t.signals),
  ]

  return {
    symbols,
    classes,
    traits,
    signals,
    typedLocals: scanTypedLocals(masked),
  }
}

export function mergeFiles(sources: Record<string, string>): ScanFile[] {
  return Object.values(sources).map((src) => scanSource(src))
}

export function classAt(file: ScanFile, pos: number): ScanClass | null {
  let hit: ScanClass | null = null
  for (const c of file.classes) {
    if (pos >= c.from && pos <= c.bodyTo) hit = c
  }
  return hit
}

export function isNodeBase(name: string): boolean {
  return (NODE_BASES as readonly string[]).includes(name)
}

export function findClass(files: ScanFile[], name: string): ScanClass | undefined {
  for (const file of files) {
    const hit = file.classes.find((c) => c.name === name)
    if (hit) return hit
  }
  return undefined
}

export function findTrait(files: ScanFile[], name: string): ScanTrait | undefined {
  for (const file of files) {
    const hit = file.traits.find((t) => t.name === name)
    if (hit) return hit
  }
  return undefined
}

export type ClassMembers = {
  fields: string[]
  methods: string[]
  signals: string[]
}

/** Own + inherited members. Node bases contribute transform + lifecycle. */
export function classMembers(
  cls: ScanClass,
  files: ScanFile[],
  seen = new Set<string>(),
): ClassMembers {
  if (seen.has(cls.name)) {
    return { fields: [], methods: [], signals: [] }
  }
  seen.add(cls.name)
  const fields = [...cls.fields.map((f) => f.name)]
  const methods = [...cls.methods.map((m) => m.name)]
  const signals = [...cls.signals.map((s) => s.name)]
  for (const traitName of cls.impls) {
    const trait = findTrait(files, traitName)
    if (!trait) continue
    for (const m of trait.methods) methods.push(m.name)
    for (const s of trait.signals) signals.push(s.name)
  }
  if (cls.extendsName) {
    if (isNodeBase(cls.extendsName)) {
      fields.push(...NODE_FIELDS)
      methods.push(...NODE_METHODS)
    } else {
      const parent = findClass(files, cls.extendsName)
      if (parent) {
        const up = classMembers(parent, files, seen)
        fields.push(...up.fields)
        methods.push(...up.methods)
        signals.push(...up.signals)
      }
    }
  } else if (cls.isNode) {
    fields.push(...NODE_FIELDS)
    methods.push(...NODE_METHODS)
  }
  return {
    fields: unique(fields),
    methods: unique(methods),
    signals: unique(signals),
  }
}

export function parentMethods(cls: ScanClass, files: ScanFile[]): string[] {
  if (!cls.extendsName) return cls.isNode ? [...NODE_METHODS] : []
  if (isNodeBase(cls.extendsName)) return [...NODE_METHODS]
  const parent = findClass(files, cls.extendsName)
  if (!parent) return []
  return classMembers(parent, files).methods
}

function unique(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of items) {
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export function allTraits(files: ScanFile[]): string[] {
  return unique(files.flatMap((f) => f.traits.map((t) => t.name)))
}

export function allClasses(files: ScanFile[]): string[] {
  return unique(files.flatMap((f) => f.classes.map((c) => c.name)))
}

export function isSignalName(file: ScanFile, files: ScanFile[], name: string): boolean {
  if (file.signals.some((s) => s.name === name)) return true
  for (const f of files) {
    if (f.signals.some((s) => s.name === name)) return true
    for (const t of f.traits) {
      if (t.signals.some((s) => s.name === name)) return true
    }
  }
  return false
}

export function typeOfLocal(file: ScanFile, name: string): string | undefined {
  return file.typedLocals.find((t) => t.name === name)?.typeName
}

export type MemberRole = 'field' | 'method' | 'signal' | 'super' | 'emit'

export type MemberItem = { name: string; role: MemberRole }

export type ReceiverMembers =
  | { kind: 'list'; items: MemberItem[] }
  | { kind: 'catalog' }

function itemsFromMembers(mem: ClassMembers): MemberItem[] {
  return [
    ...mem.fields.map((name) => ({ name, role: 'field' as const })),
    ...mem.methods.map((name) => ({ name, role: 'method' as const })),
    ...mem.signals.map((name) => ({ name, role: 'signal' as const })),
  ]
}

/** Completions after `receiver.` — self / super / signal / typed local, else catalog. */
export function membersFor(
  file: ScanFile,
  files: ScanFile[],
  pos: number,
  receiver: string,
): ReceiverMembers {
  const enclosing = classAt(file, pos)
  if (receiver === 'self') {
    if (!enclosing) return { kind: 'list', items: [] }
    return { kind: 'list', items: itemsFromMembers(classMembers(enclosing, files)) }
  }
  if (receiver === 'super') {
    if (!enclosing) return { kind: 'list', items: [] }
    return {
      kind: 'list',
      items: parentMethods(enclosing, files).map((name) => ({
        name,
        role: 'super' as const,
      })),
    }
  }
  const fromClass = enclosing
    ? classMembers(enclosing, files).signals.includes(receiver)
    : false
  if (fromClass || isSignalName(file, files, receiver)) {
    return { kind: 'list', items: [{ name: 'emit', role: 'emit' }] }
  }
  const typeName = typeOfLocal(file, receiver)
  if (typeName) {
    const cls = findClass(files, typeName)
    if (cls) {
      return { kind: 'list', items: itemsFromMembers(classMembers(cls, files)) }
    }
  }
  return { kind: 'catalog' }
}
