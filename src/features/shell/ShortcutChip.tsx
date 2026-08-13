const KEY_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  Control: "⌃",
  Shift: "⇧",
  Enter: "⏎",
  Backspace: "⌫",
  Left: "←",
  Right: "→",
  Up: "↑",
  Down: "↓",
  PageUp: "⇞",
  PageDown: "⇟"
})

export function formatShortcut(binding: string): string {
  return binding
    .split("+")
    .map((part) => KEY_GLYPHS[part] ?? part.toUpperCase())
    .join("")
}

export interface ShortcutChipProps {
  readonly binding?: string
}

export function ShortcutChip({ binding }: ShortcutChipProps) {
  if (!binding) return null
  return (
    <kbd className="quiet-shortcut-chip" aria-hidden="true">
      {formatShortcut(binding)}
    </kbd>
  )
}
