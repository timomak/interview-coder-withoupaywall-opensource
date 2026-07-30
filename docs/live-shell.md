# Quiet Signal live shell

The live shell has four deliberate states: fully hidden, compact bar, compact
answer, and expanded workspace. Launch is fully hidden. Showing, hiding,
collapsing, expanding, or opening the compact composer never changes the
interview session or recording state. Reset remains the only terminal session
action.

The compact bar and compact answer size themselves from their explicit shell
content and are not manually resizable. The expanded workspace is the only
resizable state. Bounds are stored separately for each HUD state and display,
then clamped into the nearest available work area after a display is removed or
its geometry changes. This prevents a remembered overlay from reopening
off-screen.

## Interaction regions

Transparent overlay space is click-through. Authors must mark every surfaced
control container with `data-interactive`; pointer routing must never infer
interactivity from computed colors or opacity. The Content View pill marked
with `data-drag-root` is the drag surface. Buttons, fields, attachment controls,
and other interactive descendants use the no-drag application region so a
click cannot accidentally move the window.

## Shortcuts

The default map is:

- `Control+Shift+H` — show or hide
- `Control+Shift+R` — record
- `Control+Shift+S` — capture the current primary display
- `Control+Shift+D` — debug the current Coding implementation
- `Control+Shift+C` — open or focus the compact composer
- `Control+Shift+Enter` — submit the draft and selected evidence
- `Control+Shift+Arrow` — move the HUD
- `Control+Option+Left/Right` — change the active answer section
- `Control+Option+Up/Down` — scroll the active answer section
- `Control+Shift+Backspace` — Reset

HotKeys exposes every binding and rejects duplicate or operating-system
conflicts before committing a new map. Registration and preference persistence
are one transaction: either the complete map is active and saved, or the prior
map is restored. Reset all restores the documented defaults.

`Control+Shift+C` records whether the HUD was hidden. Closing the composer
returns to that exact hidden or visible origin. Plain Enter inserts a newline;
`Control+Enter` has no special behavior.

## Capture and protection

Content protection is applied immediately after creating the Electron window,
before every reveal, and before window reconfiguration. Screenshot input hides
the HUD, captures the operating system's current primary display in full,
stages one encrypted artifact, and restores the exact prior visibility state.
Region, active-window, and per-session display selection are intentionally not
supported.

These unit and Electron-shell tests prove application call order, display
selection, geometry, and visibility restoration. They do **not** qualify Google
Meet, browser-tab sharing, ScreenCaptureKit, or any other external capture
tuple. External capture qualification remains a separate release activity.

## Accessibility and migration

Compact density uses a 44px rail and 32px controls. Comfortable density uses a
52px rail and larger spacing without hiding or changing actions. Standard and
large text use the same information architecture. Required shell text is at
least 12px, all pointer actions have keyboard-operable controls, focus returns
to the originating control after transient panels close, and reduced-motion
preferences remove nonessential animation. The shell has no sound, haptic, TTS,
or alternate appearance path.

M-05a adds density, text-size, shortcut, and per-display geometry preferences to
the owner-only configuration. Missing or invalid additive values fall back to
safe defaults without changing an active interview. Rolling back to a build
that does not use these preferences leaves the session schema unchanged.
