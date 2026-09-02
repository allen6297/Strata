import { StreamLanguage } from '@codemirror/language'
import type { StringStream } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const KEYWORDS =
  /^(fn|if|elif|else|while|for|in|match|return|break|continue|pass|import|from|as|struct|class|trait|extends|enum|impl|mod|signal|var|const|pub|self|super)\b/

const TYPES =
  /^(Void|Bool|Int|Float|String|Str|Array|Map|Option|Result|Vec2)\b/

const ATOMS = /^(true|false|none)\b/

const BUILTINS = /^(print|len|assert)\b/

interface RgState {
  string: null | 'plain' | 'f'
  interp: number
  afterFn: boolean
}

function tokenString(stream: StringStream, state: RgState): string {
  const isF = state.string === 'f'
  while (!stream.eol()) {
    if (isF && state.interp === 0) {
      if (stream.match('{{') || stream.match('}}')) continue
      if (stream.peek() === '{') {
        stream.next()
        state.interp = 1
        return 'string'
      }
    }
    const c = stream.next()
    if (c === '\\') {
      stream.next()
      continue
    }
    if (c === '"') {
      state.string = null
      return 'string'
    }
  }
  return 'string'
}

function tokenBase(stream: StringStream, state: RgState): string | null {
  if (state.string) {
    if (state.interp > 0) {
      if (stream.eatSpace()) return null
      if (stream.peek() === '{') {
        stream.next()
        state.interp += 1
        return 'punctuation'
      }
      if (stream.peek() === '}') {
        stream.next()
        state.interp -= 1
        return state.interp === 0 ? 'string' : 'punctuation'
      }
      return tokenCode(stream, state)
    }
    return tokenString(stream, state)
  }

  if (stream.eatSpace()) return null

  if (stream.match(/^##.*/)) return 'docComment'
  if (stream.match(/^#.*/)) return 'comment'

  if (stream.match(/^f"/)) {
    state.string = 'f'
    return 'string'
  }
  if (stream.match(/^"/)) {
    state.string = 'plain'
    return 'string'
  }

  if (stream.match(/^@[A-Za-z_]\w*/)) return 'meta'

  return tokenCode(stream, state)
}

function tokenCode(stream: StringStream, state: RgState): string | null {
  if (stream.match(KEYWORDS)) {
    if (stream.current() === 'fn') state.afterFn = true
    else state.afterFn = false
    return 'keyword'
  }

  if (stream.match(TYPES)) {
    state.afterFn = false
    return 'typeName'
  }

  if (stream.match(ATOMS)) {
    state.afterFn = false
    return 'atom'
  }

  if (stream.match(/^\d+\.\d+/) || stream.match(/^\d+/)) {
    state.afterFn = false
    return 'number'
  }

  if (stream.match(/^[A-Z][A-Za-z0-9_]*/)) {
    state.afterFn = false
    return 'typeName'
  }

  if (stream.match(/^[A-Za-z_]\w*/)) {
    const name = stream.current()
    if (state.afterFn) {
      state.afterFn = false
      return 'variableName.definition'
    }
    if (BUILTINS.test(name) && stream.match(/^\s*\(/, false)) {
      return 'variableName.standard'
    }
    if (stream.match(/^\s*\(/, false)) return 'variableName'
    return 'variableName'
  }

  state.afterFn = false

  if (stream.match(/^(->|==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\|\||&&|\.\.=|\.\.)/)) {
    return 'operator'
  }
  if (stream.match(/^[+\-*/%<>=!&|^~]/)) return 'operator'

  stream.next()
  return null
}

export const roseGoldLanguage = StreamLanguage.define<RgState>({
  name: 'rosegold',
  startState() {
    return {
      string: null,
      interp: 0,
      afterFn: false,
    }
  },
  token: tokenBase,
  tokenTable: {
    docComment: t.docComment,
  },
  indent(_state, textAfter, context) {
    const pos = context.simulatedBreak ?? 0
    const base = context.lineIndent(pos, -1)
    if (/^\s*(\}|elif\b|else\b)/.test(textAfter)) {
      return Math.max(0, base - context.unit)
    }
    const prev = context.lineAt(pos, -1)
    if (/\{\s*$/.test(prev.text)) return base + context.unit
    return base
  },
  languageData: {
    commentTokens: { line: '#' },
    closeBrackets: { brackets: ['(', '[', '{', '"'] },
    indentOnInput: /^\s*(elif|else|\})$/,
  },
})
