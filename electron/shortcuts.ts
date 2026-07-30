import { globalShortcut, app } from "electron"
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_ACTIONS,
  shortcutConflicts,
  type ShortcutAction,
  type ShortcutBindings
} from "../src/shared/shell"

export interface ShortcutsHelperDependencies {
  readonly invoke: (action: ShortcutAction) => void
  readonly register?: (accelerator: string, callback: () => void) => boolean
  readonly unregisterAll?: () => void
}

export interface ShortcutRegistrationResult {
  readonly ok: boolean
  readonly bindings: ShortcutBindings
  readonly conflicts: Readonly<Record<string, readonly ShortcutAction[]>>
  readonly rejectedAccelerator?: string
}

export class ShortcutsHelper {
  private bindings: ShortcutBindings
  private hasRegisteredBindings = false

  constructor(
    private readonly deps: ShortcutsHelperDependencies,
    initialBindings: ShortcutBindings = DEFAULT_SHORTCUT_BINDINGS
  ) {
    this.bindings = { ...initialBindings }
  }

  currentBindings(): ShortcutBindings {
    return { ...this.bindings }
  }

  applyBindings(next: ShortcutBindings): ShortcutRegistrationResult {
    const conflicts = shortcutConflicts(next)
    if (Object.keys(conflicts).length > 0) {
      return { ok: false, bindings: this.currentBindings(), conflicts }
    }

    const previous = this.bindings
    const register = this.deps.register ?? globalShortcut.register.bind(globalShortcut)
    const unregisterAll =
      this.deps.unregisterAll ?? globalShortcut.unregisterAll.bind(globalShortcut)
    unregisterAll()
    for (const action of SHORTCUT_ACTIONS) {
      const accelerator = next[action]
      if (!register(accelerator, () => this.deps.invoke(action))) {
        unregisterAll()
        if (this.hasRegisteredBindings) {
          for (const previousAction of SHORTCUT_ACTIONS) {
            const restored = register(previous[previousAction], () =>
              this.deps.invoke(previousAction)
            )
            if (!restored) {
              throw new Error("Could not restore the previous shortcut map")
            }
          }
        }
        return {
          ok: false,
          bindings: this.currentBindings(),
          conflicts: {},
          rejectedAccelerator: accelerator
        }
      }
    }
    this.bindings = { ...next }
    this.hasRegisteredBindings = true
    return { ok: true, bindings: this.currentBindings(), conflicts: {} }
  }

  registerGlobalShortcuts(): ShortcutRegistrationResult {
    if (!this.deps.unregisterAll) {
      app.on("will-quit", () => globalShortcut.unregisterAll())
    }
    return this.applyBindings(this.bindings)
  }
}
