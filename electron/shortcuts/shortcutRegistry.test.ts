import { describe, expect, it, vi } from "vitest"
import { ShortcutsHelper } from "../shortcuts"
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_ACTIONS,
  type ShortcutBindings
} from "../../src/shared/shell"

describe("shortcut registry", () => {
  it("registers remaps and rolls back conflicts atomically", () => {
    const registered = new Map<string, () => void>()
    const invoked: string[] = []
    const register = vi.fn((accelerator: string, callback: () => void) => {
      if (accelerator === "Control+Shift+9") return false
      registered.set(accelerator, callback)
      return true
    })
    const unregisterAll = vi.fn(() => registered.clear())
    const shortcuts = new ShortcutsHelper({
      invoke: (action) => invoked.push(action),
      register,
      unregisterAll
    })

    expect(shortcuts.registerGlobalShortcuts()).toMatchObject({ ok: true })
    expect([...registered.keys()].sort()).toEqual(
      Object.values(DEFAULT_SHORTCUT_BINDINGS).sort()
    )

    const duplicate = {
      ...DEFAULT_SHORTCUT_BINDINGS,
      record: DEFAULT_SHORTCUT_BINDINGS.screenshot
    } satisfies ShortcutBindings
    expect(shortcuts.applyBindings(duplicate)).toMatchObject({
      ok: false,
      bindings: DEFAULT_SHORTCUT_BINDINGS
    })
    expect(unregisterAll).toHaveBeenCalledTimes(1)

    const unavailable = {
      ...DEFAULT_SHORTCUT_BINDINGS,
      record: "Control+Shift+9"
    } satisfies ShortcutBindings
    expect(shortcuts.applyBindings(unavailable)).toMatchObject({
      ok: false,
      rejectedAccelerator: "Control+Shift+9",
      bindings: DEFAULT_SHORTCUT_BINDINGS
    })
    expect([...registered.keys()].sort()).toEqual(
      Object.values(DEFAULT_SHORTCUT_BINDINGS).sort()
    )

    const remapped = {
      ...DEFAULT_SHORTCUT_BINDINGS,
      record: "Control+Shift+8"
    } satisfies ShortcutBindings
    expect(shortcuts.applyBindings(remapped)).toMatchObject({ ok: true })
    registered.get("Control+Shift+8")?.()
    expect(invoked).toEqual(["record"])
    expect(SHORTCUT_ACTIONS).toHaveLength(15)
  })
})
