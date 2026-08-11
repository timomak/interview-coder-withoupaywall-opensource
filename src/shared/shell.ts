export const SHORTCUT_ACTIONS = [
  "visibility",
  "record",
  "screenshot",
  "debug",
  "composer",
  "submit",
  "move-left",
  "move-right",
  "move-up",
  "move-down",
  "section-previous",
  "section-next",
  "section-scroll-up",
  "section-scroll-down",
  "reset"
] as const

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]
export type ShortcutBindings = Readonly<Record<ShortcutAction, string>>

export function isShortcutAction(value: unknown): value is ShortcutAction {
  return (
    typeof value === "string" &&
    SHORTCUT_ACTIONS.includes(value as ShortcutAction)
  )
}

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = Object.freeze({
  visibility: "Control+Shift+H",
  record: "Control+Shift+R",
  screenshot: "Control+Shift+S",
  debug: "Control+Shift+D",
  composer: "Control+Shift+C",
  submit: "Control+Shift+Enter",
  "move-left": "Control+Shift+Left",
  "move-right": "Control+Shift+Right",
  "move-up": "Control+Shift+Up",
  "move-down": "Control+Shift+Down",
  "section-previous": "Control+Option+Left",
  "section-next": "Control+Option+Right",
  "section-scroll-up": "Control+Option+Up",
  "section-scroll-down": "Control+Option+Down",
  reset: "Control+Shift+Backspace"
})

export type DensityPreference = "compact" | "comfortable"
export type TextSizePreference = "small" | "default" | "large"
export type HudState = "compact-bar" | "compact-answer" | "expanded"

export function deriveStartupHudState(config: {
  readonly provider?: unknown
  readonly model?: unknown
}): HudState {
  return typeof config.provider === "string" &&
    config.provider.length > 0 &&
    typeof config.model === "string" &&
    config.model.length > 0
    ? "compact-bar"
    : "expanded"
}

export interface PersistedWindowBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface LiveShellPreferences {
  readonly density: DensityPreference
  readonly textSize: TextSizePreference
  readonly shortcuts: ShortcutBindings
  readonly geometry: Readonly<
    Record<string, Partial<Record<HudState, PersistedWindowBounds>>>
  >
}

export const DEFAULT_LIVE_SHELL_PREFERENCES: LiveShellPreferences =
  Object.freeze({
    density: "compact",
    textSize: "default",
    shortcuts: DEFAULT_SHORTCUT_BINDINGS,
    geometry: {}
  })

export interface HudStateInputs {
  readonly settingsOpen: boolean
  readonly workspaceExpanded: boolean
  readonly composerOpen: boolean
  readonly hotKeysOpen: boolean
  readonly sectionCount: number
  readonly artifactCount: number
}

export function deriveHudState(inputs: HudStateInputs): HudState {
  if (inputs.settingsOpen || inputs.workspaceExpanded) return "expanded"
  if (
    inputs.composerOpen ||
    inputs.hotKeysOpen ||
    inputs.sectionCount > 0 ||
    inputs.artifactCount > 0
  ) {
    return "compact-answer"
  }
  return "compact-bar"
}

export function shortcutConflicts(
  bindings: ShortcutBindings
): Readonly<Record<string, readonly ShortcutAction[]>> {
  const actionsByAccelerator = new Map<string, ShortcutAction[]>()
  for (const action of SHORTCUT_ACTIONS) {
    const normalized = bindings[action].trim().toLowerCase()
    const actions = actionsByAccelerator.get(normalized) ?? []
    actions.push(action)
    actionsByAccelerator.set(normalized, actions)
  }
  return Object.fromEntries(
    [...actionsByAccelerator.entries()]
      .filter(([, actions]) => actions.length > 1)
      .map(([accelerator, actions]) => [accelerator, actions])
  )
}

export function isShortcutBindings(value: unknown): value is ShortcutBindings {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    Object.keys(candidate).length === SHORTCUT_ACTIONS.length &&
    SHORTCUT_ACTIONS.every(
      (action) =>
        typeof candidate[action] === "string" &&
        String(candidate[action]).trim().length > 0
    )
  )
}
