export type ScriptEditorSession = {
  anchor: number
  head: number
  scrollTop: number
  scrollLeft: number
}

const sessions = new Map<string, ScriptEditorSession>()

export function getScriptSession(id: string): ScriptEditorSession | undefined {
  return sessions.get(id)
}

export function setScriptSession(id: string, session: ScriptEditorSession) {
  sessions.set(id, session)
}

export function clearScriptSession(id: string) {
  sessions.delete(id)
}

/** Jump the open buffer to a line/col. `nonce` retriggers the same location. */
export type ScriptReveal = {
  scriptId: string
  line: number
  col: number
  nonce: number
}
