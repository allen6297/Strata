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
  'ShiftLeft',
  'ShiftRight',
])

/** Keys held while play mode is active (for RoseGold `strata:input`). */
export function useRuntimeInput(active: boolean) {
  const held = useRef(new Set<string>())

  useEffect(() => {
    if (!active) {
      held.current.clear()
      return
    }

    const onDown = (e: KeyboardEvent) => {
      if (TRACKED.has(e.code)) {
        e.preventDefault()
        held.current.add(e.code)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      held.current.delete(e.code)
    }
    const onBlur = () => held.current.clear()

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      held.current.clear()
    }
  }, [active])

  return {
    keysCsv: useCallback(() => [...held.current].join(','), []),
    isDown: useCallback((code: string) => held.current.has(code), []),
  }
}
