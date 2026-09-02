import { useCallback, useEffect, useRef } from 'react'

const TRACKED = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'ShiftLeft',
  'ShiftRight',
])

function csv(set: Set<string>): string {
  return [...set].join(',')
}

/** Keys held / just-pressed while play mode is active. */
export function useRuntimeInput(active: boolean) {
  const held = useRef(new Set<string>())
  const pressed = useRef(new Set<string>())

  useEffect(() => {
    if (!active) {
      held.current.clear()
      pressed.current.clear()
      return
    }

    const onDown = (e: KeyboardEvent) => {
      if (!TRACKED.has(e.code)) return
      e.preventDefault()
      if (!held.current.has(e.code) && !e.repeat) {
        pressed.current.add(e.code)
      }
      held.current.add(e.code)
    }
    const onUp = (e: KeyboardEvent) => {
      held.current.delete(e.code)
    }
    const onBlur = () => {
      held.current.clear()
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      held.current.clear()
      pressed.current.clear()
    }
  }, [active])

  const poll = useCallback(() => {
    const keysCsv = csv(held.current)
    const pressedCsv = csv(pressed.current)
    pressed.current.clear()
    return { keysCsv, pressedCsv }
  }, [])

  return {
    poll,
    keysCsv: useCallback(() => csv(held.current), []),
    isDown: useCallback((code: string) => held.current.has(code), []),
  }
}
