import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(prefix = 'ent') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

/** True when a key event is aimed at a text field or the script editor. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
    return true
  }
  return Boolean(target.closest('.cm-editor'))
}
