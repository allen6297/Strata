import { useCallback, useRef, useState } from 'react'
import type { Entity } from '@/types/scene'

const MAX_HISTORY = 80

function cloneEntities(entities: Entity[]) {
  return entities.map((e) => ({ ...e }))
}

export function useEntityHistory(initial: Entity[]) {
  const [entities, setEntitiesState] = useState(() => cloneEntities(initial))
  const undoStack = useRef<Entity[][]>([])
  const redoStack = useRef<Entity[][]>([])
  const entitiesRef = useRef(entities)
  const transientBaseline = useRef<Entity[] | null>(null)
  const [, bump] = useState(0)

  entitiesRef.current = entities

  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0

  const setEntities = useCallback((next: Entity[] | ((prev: Entity[]) => Entity[])) => {
    setEntitiesState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      entitiesRef.current = resolved
      return resolved
    })
  }, [])

  const commit = useCallback((next: Entity[] | ((prev: Entity[]) => Entity[])) => {
    const prev = cloneEntities(entitiesRef.current)
    const resolved =
      typeof next === 'function' ? next(entitiesRef.current) : next
    undoStack.current.push(prev)
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
    setEntities(cloneEntities(resolved))
    bump((n) => n + 1)
  }, [setEntities])

  const replace = useCallback(
    (next: Entity[]) => {
      undoStack.current = []
      redoStack.current = []
      transientBaseline.current = null
      setEntities(cloneEntities(next))
      bump((n) => n + 1)
    },
    [setEntities],
  )

  const beginTransient = useCallback(() => {
    if (!transientBaseline.current) {
      transientBaseline.current = cloneEntities(entitiesRef.current)
    }
  }, [])

  const applyTransient = useCallback(
    (next: Entity[] | ((prev: Entity[]) => Entity[])) => {
      setEntities(next)
    },
    [setEntities],
  )

  const endTransient = useCallback(() => {
    const baseline = transientBaseline.current
    transientBaseline.current = null
    if (!baseline) return
    const current = entitiesRef.current
    const changed = JSON.stringify(baseline) !== JSON.stringify(current)
    if (changed) {
      undoStack.current.push(baseline)
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
      redoStack.current = []
      bump((n) => n + 1)
    }
  }, [])

  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(cloneEntities(entitiesRef.current))
    setEntities(cloneEntities(prev))
    bump((n) => n + 1)
  }, [setEntities])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(cloneEntities(entitiesRef.current))
    setEntities(cloneEntities(next))
    bump((n) => n + 1)
  }, [setEntities])

  return {
    entities,
    setEntities,
    commit,
    replace,
    beginTransient,
    applyTransient,
    endTransient,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
