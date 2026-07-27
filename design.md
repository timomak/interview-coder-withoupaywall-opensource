# InterviewCopilot Product and Interface Design

Status: Living working specification

Last updated: 2026-07-26
Theme: **Quiet Signal**

This document is the source of truth for the InterviewCopilot product experience. It records confirmed codebase constraints, resolved product decisions, open questions, interaction behavior, and the visual system. Decisions will be resolved one at a time and logged here before implementation.

## 1. Product thesis

InterviewCopilot should become a calm, mode-aware interview HUD: it listens to or sees the interview, identifies the current task, and reveals only the next useful layer of assistance.

It should feel like a quiet instrument rather than a chat application, IDE, dashboard, or cyberpunk overlay.

The initial product model has two independent axes:

1. **Interview mode:** Coding, System Design, or Behavioral.
2. **Input channel:** Audio, screenshot, or manual text.

AI provider and model are implementation choices. They belong in advanced preferences and must not be presented as interview modes.

InterviewCopilot is a **Live interview copilot first**. Practice is not part of the initial product surface or navigation. It may be evaluated later as a deliberately separate experience, but Practice requirements must not add density, steps, or review features to the Live interface.

The initial experience is optimized for **Senior and Staff+ software engineers**. Default assistance assumes the candidate can handle fundamentals and instead emphasizes ambiguity reduction, technical judgment, trade-offs, production constraints, leadership, and organizational impact. The product may remain usable at other levels, but it will not flatten its defaults to serve every candidate equally.

The product position is:

> **The invisible live copilot for Staff+ engineering interviews—across coding, system design, and behavioral.**

Within this position, *invisible* means that the InterviewCopilot overlay is excluded from ordinary screen sharing and recording on explicitly qualified configurations. Staff-level judgment across the full interview loop is the substantive reason to believe it is more than another capture-private coding-answer overlay. Neither half is sufficient alone: capture privacy without judgment is a utility, while judgment without a quiet live experience is ordinary interview preparation software.

The customer-facing promise is deliberately broader than a single conferencing brand:

- **Headline:** “Stay private while you share your screen.”
- **Qualifier:** “InterviewCopilot is designed to stay out of ordinary macOS screen shares and recordings. Coverage varies by application and capture mode; verify your setup before an interview.”

Google Meet may appear as a verified compatibility result, but it does not define the product category or headline. The product never describes itself as universally undetectable and does not claim protection from proctoring, process inspection, device monitoring, or other anti-cheating controls.

Capture privacy is release-critical but universal undetectability is not a defensible product claim. Supported conferencing, recording, operating-system, and display configurations require a maintained compatibility matrix and repeatable release testing. A configuration that cannot exclude the overlay from ordinary user-authorized capture must not be represented as supported.

InterviewCopilot does not promise invisibility to websites, browsers, interview platforms, proctoring software, process monitors, enterprise device management, accessibility or input-event monitoring, or a person inspecting the local computer. It must not tamper with monitoring software, hide or disguise its process, spoof device or browser state, intercept a platform's telemetry, suppress platform warnings, or otherwise attempt to evade anti-cheating or proctoring controls. Qualification is limited to documented operating-system content-protection behavior and ordinary screen/window capture paths.

## 2. Confirmed codebase constraints

These are facts established against upstream `main` at
`9dcb4b2d39607273a8528a24657cdb4f5bfc3412`. A separate uncommitted prototype
is present in the planning worktree; prototype-only behavior is called out as
such and is not an implemented or verified baseline.

- The application is Electron 29, React 18, TypeScript, Vite, Tailwind, and Radix UI.
- The main window is frameless, transparent, always on top, hidden from the taskbar, present on all workspaces, and protected from screen capture where Electron supports it.
- The current implementation calls `BrowserWindow.setContentProtection(true)`, but this is not a cross-platform guarantee. Electron documents that it maps to `WDA_EXCLUDEFROMCAPTURE` on supported Windows versions and `NSWindowSharingNone` on macOS, while modern macOS applications using ScreenCaptureKit can still capture the protected window. The transparent Windows window also requires direct regression testing rather than an assumption that display affinity succeeds.
- The user has directly observed that the current macOS build is excluded during both entire-display and specific-window sharing in Google Meet. The exact browser version and macOS version have not yet been recorded, so these are proven regression baselines for the tested Meet path rather than evidence that every macOS capture implementation is protected.
- The upstream initial window is 800 × 600 with a 750 × 550 minimum, and renderer content reports its dimensions back to Electron and can resize dynamically. The prototype lowers the minimum to 320 × 80; the target shell dimensions remain specified in section 5.
- Upstream does not reliably pass pointer events through every transparent area. The prototype explores computed-surface mouse passthrough, but that approach has not been accepted or regression-tested.
- Upstream creates the window with `show: true` and conditionally hides it through opacity. The prototype explores an explicitly hidden launch and `Control+Shift` shortcuts; neither is an established baseline.
- The renderer currently has queue, solution, and debug states rather than a durable interview-session model.
- Screenshots are the only live interview input. There is no recorder, transcript model, speaker attribution, voice activity detection, or audio state in configuration.
- Upstream settings store a legacy API key, legacy provider and per-stage model names, language, and opacity. Mode and session preferences do not exist.
- The prototype adds Claude Code and Codex subscription-provider selection and uses only the selected provider. It still retains legacy API-key/provider paths and therefore does not satisfy the launch provider boundary.
- Prototype subscription calls are one-shot: Claude disables session persistence and Codex runs ephemerally. Provider-managed conversation compaction therefore cannot operate across InterviewCopilot requests until this integration is replaced with persistent resumable sessions.
- Current screenshots are written as plaintext files under the application data directory. The main configuration is plaintext JSON with owner-only file permissions. An unused `electron-store` instance contains a hard-coded encryption key, which does not provide meaningful protection.
- Tailwind has no semantic color or spacing tokens. Visual styling is composed from repeated black, white-alpha, blue, and red utility classes.
- The interface uses many 10px and 11px labels. This is too small for glanceable interview use.
- Inter is loaded from Google Fonts. A production-ready desktop build should bundle required fonts or use native system fonts rather than depend on a network request.
- Existing uncommitted work in the repository is user-owned and must be preserved during implementation.

## 3. Experience principles

### 3.1 Glanceable before comprehensive

The first response must be usable within two seconds of looking at the overlay. Deeper detail is progressively disclosed.

### 3.2 Stable under pressure

Controls must not shift when screenshot counts, transcript length, or processing state changes. The primary action remains in a predictable location.

### 3.3 State is never mysterious

When InterviewCopilot surfaces an answer or control, its state is unambiguous. It does not remain visible merely to report background listening, capture, or processing state.

### 3.4 Mode changes behavior

Coding, System Design, and Behavioral use the same shell but have different inputs, answer schemas, renderers, and follow-up actions. A mode is not just a different system prompt.

### 3.5 Invisible externally, legible to its user

The overlay should be visually restrained, but its own state and controls must remain legible. Discretion must not create ambiguity.

### 3.6 Shortcut-first, visibly operable

Global keyboard shortcuts are first-class controls for the main live interactions because the user must be able to capture evidence and request help without focusing or revealing the overlay. Every shortcut action also has a visible, keyboard-accessible control when the overlay is open; shortcuts accelerate the product but do not create inaccessible hidden-only functionality. Shortcut hints remain concise and appear in Settings, tooltips, and appropriate empty states rather than beside every repeated control.

### 3.7 Local-feeling and privacy-explicit

The interface must plainly distinguish local capture/transcription from data sent to an AI provider. Retention and deletion controls must be understandable without reading legal copy.

## 4. Theme: Quiet Signal

### 4.1 Character

Quiet Signal is the committed InterviewCopilot visual character: calm, precise, discreet, and trustworthy. It avoids gamer aesthetics, large neon glows, decorative gradients, fake terminal motifs, and conversational clutter.

The visual hierarchy comes from luminance, spacing, typography, and a narrow accent edge—not from large blocks of saturated color.

### 4.2 Color tokens

| Token | Value | Use |
|---|---:|---|
| `canvas` | transparent | Electron window outside interactive surfaces |
| `surface-strong` | `rgba(8, 10, 13, 0.94)` | Dock and primary HUD |
| `surface` | `rgba(13, 17, 23, 0.92)` | Answer panels |
| `surface-raised` | `#111720` | Menus, popovers, active cards |
| `surface-hover` | `#171E28` | Hover and selected rows |
| `border` | `rgba(183, 192, 204, 0.16)` | Default boundary |
| `border-strong` | `rgba(183, 192, 204, 0.28)` | Focused or raised boundary |
| `text-primary` | `#F4F7FB` | Main answer and control text |
| `text-secondary` | `#B7C0CC` | Supporting information |
| `text-muted` | `#8590A0` | Metadata and inactive content |
| `signal` | `#6EE7C1` | Global primary action and ready state |
| `coding` | `#6EE7C1` | Coding mode marker |
| `system-design` | `#A78BFA` | System Design mode marker |
| `behavioral` | `#F4C76B` | Behavioral mode marker |
| `info` | `#70B7FF` | Neutral progress and links |
| `danger` | `#FB7185` | Destructive actions and failures |

Mode colors are identifiers, not separate themes. They may appear on the mode icon, a 2px active edge, a status dot, and selected controls. The primary content surface remains neutral.

Primary buttons use `signal` with `#06110E` text. System Design and Behavioral do not recolor every primary button; mode color and action hierarchy remain separate concepts.

### 4.3 Typography

- UI font: native system sans (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif).
- Code font: native system monospace (`SFMono-Regular`, `Cascadia Code`, `Consolas`, monospace).
- Settings provides independent content text-size presets: **Small** at 13px / 19px, **Default** at 14px / 21px, and **Large** at 16px / 24px.
- The content preset applies consistently to answers, agent chat, transcripts, and code. It does not resize window chrome or control labels; density controls that geometry separately.
- Primary answer default: 14px / 21px, regular.
- Controls: 13px / 18px, medium.
- Section heading: 13px / 18px, semibold.
- Metadata: 12px / 16px, medium.
- No required information may be smaller than 12px.
- Use sentence case. Avoid all caps except very short transcript speaker labels.

### 4.4 Geometry and spacing

- Base spacing unit: 4px.
- Common gaps: 4, 8, 12, 16, and 24px.
- Settings offers two density presets. **Compact** is the default with 32px controls and a 44px primary rail. **Comfortable** uses 40px controls, a 52px primary rail, and the next larger spacing token at dense interaction boundaries.
- Density changes spacing and hit-target geometry only. It never hides actions, changes answer structure, alters shortcuts, or changes the current workspace state.
- Minimum pointer target: 32 × 32px.
- Control radius: 8px.
- Panel radius: 12px.
- Dialog radius: 16px.
- Use a 1px border plus restrained shadow for elevation.
- Use 16px backdrop blur on the primary HUD. Avoid nested blur layers.

### 4.5 Motion

- Hover and press transitions: 120ms.
- Panel expansion and state changes: 180ms.
- Use ease-out for entrances and ease-in for exits.
- No bounce or decorative continuous animation.
- Waveform motion is allowed only while audio is actively being captured.
- Respect `prefers-reduced-motion`; state must remain understandable without motion.

InterviewCopilot does not add a separate High Legibility, high-contrast, or reduced-transparency theme at launch. Quiet Signal's default tokens must carry the required readable contrast without a second visual system.

### 4.6 Iconography

Use Lucide, which is already installed. Icons use a consistent 16px size in surfaced controls and 14px in compact metadata. Pair unfamiliar icons with labels until the user has learned the interaction. Do not use emoji as interface icons.

Keyboard shortcuts use native macOS symbols (`⌃`, `⌥`, `⇧`, `⌘`, `↵`) in the interface while searchable labels and accessibility text spell out Control, Option, Shift, Command, and Return. Keycaps are quiet secondary metadata rather than raised skeuomorphic buttons.

## 5. Window and shell architecture

The interface has four deliberate window states.

### 5.1 Fully hidden

- The application launches fully hidden and contributes no visible pixels.
- A global visibility shortcut reveals or hides the compact bar.
- Hiding the overlay during an active session does not pause listening, processing, or session context.

### 5.2 Compact bar

- Target height: 44px.
- Target width: approximately 320–520px depending on visible controls.
- Its dimensions are automatic rather than user-resizable.
- Before a session, it contains mode selection and **Start Interview**.
- During a session, it presents the locked mode, listening/processing state, compact input status, primary contextual action, Reset access, and More.
- During a session, the permanent action set is Record, Screenshot, Chat, and Submit, followed by the compact context-status indicator. Reset is available under More rather than occupying the repeated live-action row.
- It remains at the user's chosen screen position until hidden with the visibility shortcut.
- It is the collapsed state after an answer is dismissed.
- The main Content View pill is the drag surface. Its neutral background, brand label, and mode/status area can drag the window; action buttons, attachment chips, fields, and other interactive descendants retain their own pointer behavior and never initiate a drag. The compact answer and expanded workspace expose the same familiar pill/header drag surface.
- Position is remembered per display. If a remembered display is disconnected or its work area changes, the bar is clamped fully onto the nearest available display.
- Keyboard movement remains available for precise nudging.

Concept:

```text
[InterviewCopilot] [Coding] [Record 00:18] [Camera 2] [Chat] [Submit] [Full context] [HotKeys] [More]
```

Record shows capture state and elapsed time. Screenshot shows the pending or session screenshot count. Chat opens the compact composer. Submit uses the universal `Control+Shift+Enter` flow and is disabled only when neither a draft nor selected pending evidence exists. The context indicator uses the states defined under AI provider settings. HotKeys opens the shortcut panel. More contains Reset and other infrequent session actions.

### 5.3 Compact answer

- Target width: approximately 520px.
- Shows the immediate answer and one active supporting section.
- Expands from and retains the compact bar.
- Avoids vertical scrolling for the first useful answer whenever possible.
- Opens automatically when a generated answer becomes useful and can be collapsed back to the compact bar.
- Width is stable and height grows with content up to a display-relative cap; overflow then scrolls inside the answer region.
- It is not manually resizable.

### 5.4 Expanded workspace

- Target width: approximately 760px, constrained to the active display.
- Used for complete code, diagrams, transcript review, story editing, agent chat, and preferences.
- Expansion is explicit and reversible.
- Window dimensions persist separately from the compact-answer state.
- This is the only manually resizable state. Its size is remembered per display and clamped to the available work area when display geometry changes.

### 5.5 Session control model

Before a session, the compact bar presents mode selection and **Start Interview**. There is no separate End Interview control. After Start Interview, the selected mode locks and the bar switches to live status and actions. **Reset** is the only explicit terminal lifecycle action; hiding, collapsing, or expanding the overlay does not change session state.

The pre-session mode selector is a three-part segmented control with Coding, System Design, and Behavioral visible simultaneously. It uses the mode accents only for the active segment and supports arrow-key navigation. The bar grows to its pre-session width rather than collapsing the three initial modes into a menu. A larger mode chooser becomes appropriate only if future custom or specialist modes exceed the available bar width.

The compact bar is the persistent command rail whenever the overlay is visible. A global visibility shortcut is required. Provider, model, and language controls never appear in the live bar. The active Coding language may appear as read-only metadata in a generated answer.

Reset stops audio capture, cancels in-flight processing, discards the active provider conversation, seals the completed session into local History, clears every artifact from the active HUD and working context, and returns the product to its pre-session Start Interview state. It preserves preferences, provider configuration, reusable profile or Story Bank data, and the archived History entry.

The user selects a mode before Start Interview. That mode remains locked until Reset and appears as compact status in the active bar. Changing mode therefore always begins from a clean session state.

Within the active session, InterviewCopilot retains the complete local sequence of transcript segments, screenshots, detected questions, answers, follow-ups, and explicit interviewer constraints. The selected provider owns one persistent resumable conversation for the life of that interview session. The initial provider turn receives the complete applicable starting context; subsequent turns send new inputs and changes into the same conversation, where the provider retains and automatically compacts working history as needed. Behavioral and System Design initialize with the complete candidate dossier and active opportunity context; Coding excludes both under D-037. The provider runtime accepts a caller-supplied opaque conversation identifier and may hold it only in memory; it never writes that identifier or a provider session file to plaintext application storage. The Interview Orchestrator stores the identifier only inside the P03 encrypted active-session snapshot, so a crash or accidental quit can offer Resume or Reset on relaunch without creating an unencrypted recovery path.

The primary live loop is capture-first and shortcut-friendly:

1. The user manually starts or resumes recording and may manually take one or more screenshots. The global Record action starts or resumes microphone and system-audio capture together; invoking it while both are active pauses both.
2. Finalized transcript segments and screenshots appear as pending input artifacts; neither capture action silently generates an answer.
3. The user invokes the mode-specific answer action, including through the existing `Control+Shift+Enter` shortcut pattern. InterviewCopilot sends the applicable new evidence into the current persistent agent and streams the result into the curated mode-specific layout.
4. Recording and screenshot capture remain available after every answer. Later turns add evidence to the same interview conversation and current question branch unless the user explicitly starts a new branch.
5. The user may open the agent composer and submit a typed message by itself or together with newly captured transcript and screenshots. This is another turn in the current provider conversation, not a separate chat session.

Every answer action and composer submission automatically preselects all finalized transcript segments and screenshots captured since the previous successful agent turn. These pending artifacts appear as individually removable attachment chips before submission. Removing a chip excludes that artifact from the upcoming turn without deleting it from the local session; it remains pending until submitted, explicitly discarded, or intentionally excluded from agent context. Previously accepted artifacts remain available through the persistent provider conversation and are not redundantly attached again.

Submitting with no typed message sends the selected pending evidence as a mode-specific answer request. Submitting with text sends the message and selected pending evidence together. When no pending evidence is selected, the message is a text-only turn with the current agent. A submission with neither text nor selected evidence is disabled.

The default main-interaction shortcut map is:

| Action | Default global shortcut |
|---|---|
| Show or hide InterviewCopilot | `Control+Shift+H` |
| Start/resume or pause both recording sources | `Control+Shift+R` |
| Capture the primary display | `Control+Shift+S` |
| Capture and diagnose the current Coding implementation | `Control+Shift+D` |
| Reveal and focus the compact agent composer | `Control+Shift+C` |
| Submit pending evidence and optional message | `Control+Shift+Enter` |
| Move the answer view | `Control+Shift+Arrow keys` |
| Navigate answer sections and scroll active content | `Control+Option+Arrow keys` |
| Reset the active interview | `Control+Shift+Backspace` |

Record deliberately takes the mnemonic `R`; the destructive Reset action moves away from the easily repeated recording key. All shortcuts are user-remappable in Settings, with conflict detection and a restore-defaults action.

`Control+Shift+C` reveals the overlay if necessary and opens a compact composer attached to the current HUD rather than expanding the full workspace. It focuses the message field, exposes the removable pending-evidence chips from D-043e, and preserves the last curated answer behind or above it. Invoking the shortcut again focuses the already-open composer rather than closing it. Closing the compact composer returns to the exact prior hidden, compact-bar, or answer state without changing recording or session state.

The compact composer is a multiline field. `Enter` inserts a newline. `Control+Shift+Enter` is the single universal Send/Submit action whether or not the composer is focused: when a draft exists, it sends that message with the selected pending-evidence chips; without a draft, it submits the selected pending evidence as a mode-specific answer request. With neither a draft nor selected evidence, it performs no provider request and visibly indicates that input is required. `Control+Enter` has no special behavior. A visible Send button provides the equivalent pointer-accessible action.

`Control+Shift+Arrow keys` moves the entire current answer view without focusing it. Movement repeats smoothly while a key is held, respects the usable display bounds, and updates the remembered position for that display. It does not scroll answer content or change the active section.

The **HotKeys** button opens a translucent panel anchored to the Content View pill. The panel groups commands into Session, Capture, Agent, Answer navigation, Window, and Accessibility; shows every current binding; allows inline rebinding; detects system and in-app conflicts before saving; and provides Reset all to defaults. Closing it returns focus to the originating HotKeys button. It is available before and during a session and never pauses recording or processing.

Completed sessions are retained as searchable local History. History is deliberately absent from the live shell and main navigation; it is available only under **Settings → History**. Reset clears the active interview experience but archives the completed session rather than deleting it. Archive contents, retention controls, and at-rest protection are resolved separately.

Each History entry retains its mode, timestamps, finalized transcript with available speaker attribution, detected questions, interviewer constraints, generated answers, code, diagrams, summaries, follow-ups, and compressed screenshots. Raw microphone or system-audio recordings are never archived. Temporary audio buffers are discarded after transcription.

History entries remain indefinitely until the user explicitly deletes them. InterviewCopilot does not automatically expire or prune completed sessions based on age.

Settings → History supports search, opening an archived session, deleting one session, deleting all History, and exporting one session as Markdown or structured JSON. Markdown export includes referenced image assets in a companion folder or bundle; JSON preserves the typed session structure. Tags, favorites, multi-select, and bulk export are out of scope initially.

All persisted active-session recovery data and archived History use application-level encryption at rest. The encryption key is generated per installation and stored through macOS Keychain or Windows Credential Manager, not alongside the encrypted database. Search indexes and cached screenshot representations must not create plaintext copies. Export deliberately decrypts the selected session into the user-chosen destination.

### 5.5 Input tray

Screenshots and transcript segments share one collapsible input tray.

- Screenshots collapse into a stable `Camera 3` control rather than consuming horizontal width.
- Screenshot input captures the operating system's current primary display in full. Region, active-window, and per-session display selection are intentionally unsupported.
- Expanding it reveals a horizontal carousel with always-discoverable remove actions.
- The latest transcript remains visible as a maximum two-line preview.
- Partial transcript text is muted; finalized text is primary.
- The user can edit or select the detected question before invoking an answer.
- When screenshot and transcript evidence conflict, the screenshot is authoritative. Spoken content may supplement compatible constraints but does not override visible requirements. With no screenshot present, the transcript becomes the primary question source.

### 5.6 Answer workspace

- The first tab is always the shortest immediately useful response.
- Answer generation is progressive. On Submit, the workspace creates stable section shells immediately and streams each usable section as its content arrives; it never waits for the complete response before showing useful content.
- Streaming may fill independent sections concurrently, but it must not reorder visible sections or repeatedly reflow the reading position. A quiet in-section live indicator distinguishes incomplete content and disappears when that section is final.
- Completed sections remain readable and interactive while other sections continue. A late section or diagram cannot block an earlier speakable answer, approach, or correction.
- Only one main content region is active at a time.
- Agent chat is a secondary input surface inside the expanded workspace. The curated answer renderer remains primary; opening chat does not replace it with a generic terminal or chronological agent transcript.
- A typed chat turn uses the same locked interview mode, provider, model, prompt policy, applicable personal context, current question branch, and persistent provider conversation as shortcut-generated answers.
- Responses to chat turns populate the applicable curated answer sections when they satisfy the current mode schema. Conversational clarification that does not map to a structured section remains visible in a compact chat exchange without replacing the last curated answer.
- Curated response sections are individually collapsible. One section is keyboard-active at a time. `Control+Option+Left/Right` moves to the previous/next section, collapses the section being left, expands the destination, and scrolls its header into view. `Control+Option+Up/Down` scrolls vertically inside the active section without changing sections. Manual header activation toggles any section without changing provider context.

### 5.7 Capture-privacy qualification

Capture privacy is a tested platform capability, not a UI setting or an inferred consequence of calling Electron's content-protection API.

- The qualification unit is an exact tuple of operating-system family and supported release range, display mode, InterviewCopilot window mode, capture API or application, capture scope, and relevant application version.
- Every candidate tuple must be exercised with a deterministic, high-contrast moving marker in the overlay. Automated or reproducible capture inspection must prove that the marker never enters captured frames while ordinary underlying content remains visible.
- Full-display capture, individual-window capture, browser-tab sharing, operating-system screenshots, built-in screen recording, and supported third-party conferencing/recording paths are distinct cases. A pass in one does not imply a pass in another.
- macOS is the only launch engineering and capture-privacy qualification target. Windows and Linux application support and capture qualification are deferred to a later phase.
- The existing macOS build has already passed real entire-display and specific-window screen-sharing tests and both behaviors must be preserved as launch regression baselines. Electron's documented ScreenCaptureKit limitation means these results cannot be generalized to every application or version without testing.
- Entire-display, specific-window, and browser-tab sharing remain separate macOS qualification paths. The first two have an observed working baseline; browser-tab sharing and every named launch application still require explicit verification.
- Google Meet is the only conferencing product in the initial launch qualification matrix. That committed matrix freezes only the exact pre-release environment/scope policy and purpose-separated verification keys. A final test of the externally selected release commit's signed/notarized build on those macOS and browser versions is a mandatory release gate, and a required detached post-build release statement binds that commit, the matrix bytes, and the package identity without creating a Git self-reference. Zoom, Microsoft Teams, and other sharing or recording products are deferred and must not inherit the Google Meet claim without their own tests.
- Do not add an application-agnostic “Test My Setup” flow at launch. Arbitrary capture software cannot be meaningfully certified by a generic self-test, and the extra setup would add disproportionate complexity. Keep verification limited to explicitly qualified integrations.
- The implementation safeguard is centralized in `electron/captureProtection.ts`. Every InterviewCopilot `BrowserWindow` must call `applyCaptureProtection` immediately after creation and whenever a lifecycle path can recreate or materially reconfigure the window. A unit guard ensures that helper always invokes `setContentProtection(true)`. Removing, bypassing, or weakening this helper is a release-blocking change and still requires the external Google Meet regression test because unit coverage cannot inspect captured frames.
- Settings → Privacy & Capture includes a guided Google Meet verification. It walks the user through entire-display and specific-window sharing with a conspicuous animated test marker and requires confirmation from Meet's remote presentation view or a second participant/device for each scope. The app never infers a pass from the local preview alone.
- A completed guided test stores a local verification record containing the InterviewCopilot version, macOS version, browser name/version, tested Meet scopes, timestamp, and user-confirmed result. Settings then shows **Google Meet verified on this Mac** with the tested scopes and date. The state is **Not verified** before testing, **Verification failed** after any failed scope, and **Retest required** after an InterviewCopilot update that touches window/capture behavior or after a macOS/browser major-version change. This status is evidence for the recorded configuration, not a universal guarantee.
- Future Windows qualification requires Windows 10 version 2004 or newer because that is where `WDA_EXCLUDEFROMCAPTURE` is documented, but no Windows capture-privacy claim belongs in the macOS-focused launch.
- Microsoft explicitly describes display affinity as a content-protection aid rather than DRM or a security boundary. InterviewCopilot must not extrapolate a passing ordinary-capture test into platform or local-process undetectability.
- Linux capture stacks and compositors vary substantially and are unqualified until separately proven.
- Release CI must retain golden capture artifacts and fail the capture-privacy gate when the overlay appears in any supported captured frame. Manual qualification remains necessary for external applications whose capture pipeline cannot be automated reliably.

Primary documentation inputs:

- [Electron `BrowserWindow.setContentProtection`](https://electronjs.org/docs/latest/api/browser-window)
- [Microsoft `SetWindowDisplayAffinity`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)
- [Apple ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- Secondary detail uses tabs or disclosure panels, not a long stack of equally weighted sections.
- Copy actions remain visible on focus and hover and are keyboard accessible.
- Streaming begins with the concise response before deeper sections complete.

## 6. Mode specifications

### 6.1 Coding

Primary action: **Solve**

Tabs:

1. **Answer:** A concise explanation the candidate can say immediately.
2. **Plan:** Algorithm, alternatives, edge cases, and clarifying questions.
3. **Code:** Implementation, read-only language label, line numbers, and copy action.
4. **Explain:** Walkthrough, complexity, tests, and likely follow-ups.

Contextual actions: Simpler approach, Optimize, Find bug, Explain selection, Test edge cases, and Predict follow-up.

Debugging is a follow-up state inside Coding rather than a top-level interview mode.

Every Coding request has an explicit user-selected intent: Analyze, Generate Code, Debug, or Follow-up. InterviewCopilot does not classify later screenshots or speech into an intent automatically. The selected intent determines the response schema and primary action before provider processing begins.

`Control+Shift+D` is a dedicated **Fix current code** intent within an active Coding question branch. It captures the operating system's current primary display and immediately submits that new screenshot to the current persistent agent. It does not include unrelated staged artifacts, which remain pending, and it never falls back to Analyze, Generate Code, or full answer regeneration.

The agent compares the screenshot with the current problem, constraints, generated solution, and prior fixes, then returns a targeted diagnostic response: detected issue, minimal correction, corrected snippet or patch, and a short explanation. The existing approach and full solution remain intact. The fix appears as a new versioned Fix card/section associated with the current answer. If no defect can be identified confidently, the result says so and requests a more useful screenshot rather than inventing a change. Outside an active Coding branch, the action is unavailable and explains why; there is no cross-mode fallback.

**New Question** creates a clean Coding problem workspace inside the same interview session. It closes the prior problem branch, clears its active screenshots and problem-specific working context from the input tray, and preserves the complete interview-level transcript, prior question branches, and History chronology. Follow-up always attaches to the current problem branch.

Generated code is read-only inside InterviewCopilot. The Code tab provides Copy, Regenerate, Debug, and Explain actions plus normal text selection, but no editing, execution, terminal, or test runner. The interview platform or external IDE remains the place where the candidate changes and runs code.

For the primary Senior/Staff+ audience, Coding answers should prioritize communicating assumptions, choosing between viable approaches, production-quality failure handling, testing strategy, and maintainability—not only reaching the expected algorithm.

After Solve, Coding opens on Answer with a two-to-four-bullet approach, one key trade-off, and one-line time and space complexity. Full code streams into the adjacent Code tab and never displaces the concise first view.

First-class Coding language families are Python 3, JavaScript/TypeScript, Java, Go, C++, and C#. Rust, Swift, Kotlin, Ruby, SQL, and R remain selectable as best-effort languages. First-class support requires dedicated prompt fixtures, syntax rendering, response parsing, representative interview-problem regression tests, and debugging coverage; best-effort languages do not carry the same quality guarantee.

Coding language is a global preference under Settings. Every Coding session snapshots the current preference at Start Interview and uses it for the whole session. Changing the global preference while a session is active applies to the next Coding session rather than mutating the active one.

### 6.2 System Design

Primary action: **Design**

Tabs:

1. **Clarify:** Functional requirements, nonfunctional requirements, constraints, and clarification questions.
2. **Estimate:** Traffic, storage, bandwidth, and explicit assumptions.
3. **Architecture:** Read-only generated architecture diagram with inspectable components.
4. **Data & APIs:** Data model, events, and endpoint contracts.
5. **Deep Dives & Trade-offs:** Bottlenecks, consistency, failure modes, migration, and scaling path.

Every design uses this sequence. The model may leave a section intentionally concise when it is not material, but it may not reorder the workflow or invent an unrelated document structure.

Estimate defaults to two to four calculations that materially influence the architecture, each with visible assumptions and units. It avoids exhaustive or decorative arithmetic. A Deepen estimates action can request storage, bandwidth, cache, cost, or other secondary calculations when relevant.

Design generates all five sections immediately from the available screenshot, transcript, and session context. Clarify lists the questions that should be asked and labels every inferred answer as an assumption, but it does not gate Architecture or require manual confirmation. Later interviewer answers can be supplied through Follow-up and used to regenerate affected sections.

System Design Follow-up is agent-directed. The agent analyzes each new constraint, determines its dependency blast radius, updates only the sections that should change, and preserves unaffected work. It may regenerate the full architecture when a constraint invalidates the foundation. Every revision returns a concise What changed summary covering assumptions, estimates, components, APIs/data, and trade-offs that materially changed. The user does not manually select sections to refresh.

The architecture view is a structured, read-only node-and-edge rendering rather than a flat model-generated image. Each component can expose purpose, scale, alternatives, and failure behavior. The user may inspect, zoom, pan, or regenerate the diagram but cannot move, rename, add, remove, reconnect, copy, or export elements inside InterviewCopilot.

Diagram nodes use a vendor-neutral vocabulary such as Client, Gateway, Service, Queue, Stream, Worker, Cache, Database, Object Store, Search Index, and External System. Cloud-specific products may be mentioned as implementation examples in component details but do not replace the generic architecture labels or introduce provider-logo dependency.

The Architecture tab provides no standalone diagram export. Diagram data remains part of the archived session and whole-session Markdown/JSON export, but there is no Mermaid, SVG, PNG, or image-copy action for the diagram itself.

For the primary audience, the mode must support ambiguous requirements, cross-team boundaries, migration paths, operational ownership, cost, and explicit trade-off narratives in addition to component selection.

### 6.3 Behavioral

Primary action: **Coach answer**

Tabs:

1. **Answer:** A concise, conversational response outline.
2. **STAR:** Situation, Task, Action, and Result structure.
3. **Evidence:** Metrics, decisions, ownership, and concrete details to mention.
4. **Follow-ups:** Likely challenges and suggested response angles.

Behavioral includes a private Story Bank. Stories are structured evidence, not only generated prose. The live answer should default to glanceable talking points rather than a paragraph intended to be read verbatim.

For the primary audience, prompts and evidence should emphasize technical leadership, influence without authority, strategy, conflict, mentoring, organizational leverage, and measurable business or reliability outcomes.

The Story Bank lives inside a canonical Markdown candidate dossier, logically named `candidate-profile.md`. InterviewCopilot stores the document encrypted at rest, presents it through a friendly editor under Settings, and supports explicit Markdown import/export. The agent receives the Markdown content as the authoritative reusable candidate context.

An agent-guided conversation creates and maintains the dossier. It can start from an empty profile or imported resume, interview the user about roles, projects, decisions, conflicts, failures, leadership, scope, and measurable outcomes, identify missing evidence, and draft the final Markdown for review. The user can resume the conversation later to refine or add stories.

Recommended document structure:

1. Candidate summary and target roles.
2. Career timeline and role scope.
3. Technical strengths and domains.
4. Projects and measurable outcomes.
5. Leadership principles and working style.
6. Story Bank entries with competencies, STAR evidence, metrics, and provenance.
7. Known constraints, weak areas, and claims not to make.

Each story carries provenance such as `verified`, `user-edited`, or `synthetic-draft`.

The global **Allow synthetic stories** setting is off by default. When off, Behavioral mode uses only verified or user-edited dossier evidence and states when no suitable story exists. When on, the agent may create a realistic fallback consistent with the candidate's documented roles, seniority, technologies, and scope. It saves the new story to the dossier as `synthetic-draft`, shows a subtle Synthetic label in the live answer, and reuses the same facts for future consistency. Synthetic stories are never silently promoted to verified.

Verified and user-edited stories use only dossier-backed facts and metrics. When a real outcome was not measured or recorded, the answer stays qualitative rather than inventing precision. A synthetic story may include plausible synthetic metrics when the setting is enabled; those values inherit the story's Synthetic label and are saved with it so later answers do not drift.

Answer opens with concise talking points suitable for glancing while speaking. An optional **Full Answer** view expands those same facts into polished conversational prose. Changing format must not introduce new events, technologies, scope, outcomes, or metrics; both views are renderings of the same selected Story Bank entry.

Opportunity-specific context is maintained separately from the candidate dossier as a Markdown document logically named `interview-context.md`. It contains company, role/title, level, job description, competency focus, interview-loop notes, and user instructions. It is edited under Settings → Profile & Context, stored encrypted locally, and preserved across Reset. The Behavioral agent receives both `candidate-profile.md` and the selected interview context so durable candidate facts are not contaminated by one opportunity.

Settings may hold multiple named opportunity contexts, such as `Stripe — Staff Engineer`, with exactly one active selection. The active selection persists across Reset and is snapshotted into each archived session so later edits do not rewrite historical context. Selecting or editing an opportunity while a session is active applies to the next session.

The candidate dossier and active opportunity context are available to Behavioral and System Design. Behavioral uses them for story selection and phrasing; System Design uses relevant domain experience, target level, company context, and role expectations to calibrate depth and examples. Coding never receives either document and remains grounded in the problem evidence, session context, and global language preference.

## 7. Voice and transcript experience

Voice is part of the session shell, not a separate transcription screen.

Required visible states:

1. Microphone off.
2. Listening.
3. Speech detected.
4. Transcribing.
5. Question detected.
6. Preparing answer.
7. Ready.
8. Audio or permission error.

Recommended baseline behavior:

- Local transcription is the default. An optional cloud fallback may be enabled by the user for unsupported hardware, insufficient local performance, or accuracy problems.
- InterviewCopilot never silently changes from local to cloud transcription. The active transcription path is visible in Audio settings and session status.
- Transcription is the only model-driven capability required to run locally. Diarization, question detection, summarization, context reasoning, conflict resolution, and answer generation are delegated dynamically to frontier models through the user's configured subscription.
- Every new session initializes both system audio and microphone as off. Start Interview creates the session but does not capture audio until the user explicitly enables at least one source.
- Once enabled, a source is captured continuously until the user pauses it, disables it, or resets the session.
- Pause/Resume stops or restarts new capture without discarding context or ending the session. Hiding or collapsing the overlay does not pause capture.
- System audio and microphone are separate channels with independent user-controlled activation. Either source may be enabled or disabled before or during the session without resetting context.
- The global Record action is a deterministic master toggle for both sources: when both are actively capturing it pauses both; when either source is inactive or paused it starts or resumes both. The visible per-source controls may still disable or re-enable microphone and system audio independently after the master action.
- Question detection updates the transcript candidate but never submits an AI answer request automatically.
- The compact bar waits for the user to invoke the mode-specific primary action: Solve, Design, or Coach answer.
- Question detection surfaces a reviewable candidate question and a visible Answer action.
- System-audio segments default to `INTERVIEWER` and microphone segments default to `YOU`.
- Frontier-model diarization separates voices when a single channel contains multiple speakers, such as an in-person interview captured through the microphone.
- Uncertain attribution is explicitly marked rather than silently guessed. The transcript view lets the user correct a segment label, and that correction updates session context and archived History.
- The microphone control shows elapsed listening time and a restrained waveform.
- A privacy indicator states whether transcription is local or remote.
- Session audio retention is off by default; transcript retention is a separate setting.
- Spoken AI output is out of scope for the first voice release.

## 8. Loading, error, and recovery behavior

- InterviewCopilot is fully silent. Recording, screenshot capture, submission, completion, cancellation, and errors use visual state only; the app emits no UI sounds, spoken responses, or haptic feedback.
- Primary actions change to a clear progress state and expose Cancel.
- Cancel interrupts only the active provider turn. It does not Reset the interview, discard submitted context, close the persistent provider conversation, or roll back completed output.
- Each answer section may complete independently. Completed sections remain final; an interrupted partial section remains visible with an `Incomplete` state rather than disappearing.
- After cancellation or partial failure, offer **Continue unfinished** for only the interrupted or failed sections. It resumes from the existing provider conversation and request identity, so evidence already accepted into context is not submitted as a duplicate question.
- If a deeper section fails, preserve already completed content. Whole-response Retry appears only when no usable section completed or the provider session itself must be recovered.
- Uncertain interpretation never blocks generation and does not produce a numeric confidence score. The agent makes a best-effort answer, states only assumptions that materially affect it, and may add a compact **Questions to ask the interviewer** section when clarification would change the solution or recommendation.
- A user correction sent through chat becomes a context delta on the current question branch. The agent revises only affected sections and preserves unaffected output.
- Permission errors link directly to a short resolution step.
- A disconnected provider never masquerades as a generic processing failure.
- Permission and provider failures are inline, scoped, and recoverable. Disable only the affected action, preserve the active session and all local context, and show the exact next action: **Open System Settings** for a denied macOS permission or **Reconnect** for provider authentication, followed by **Retry**.
- Declining microphone permission leaves screenshots, typed chat, and other permitted inputs usable. Declining screen-capture permission leaves audio and typed chat usable. A provider outage prevents new answer turns but does not prevent reviewing existing output or managing local pending evidence.
- Do not trap the user in repeated permission dialogs or generic toast loops. After denial, request again only from an explicit user retry.
- Reset always means clear the entire live session and return to Start Interview; it is not reused for question-level actions.
- Destructive session actions require confirmation only when unsaved reusable context would be lost.

## 9. Preferences and onboarding

First run uses one compact setup checklist rather than a tutorial carousel:

1. Detect Claude Code and Codex installation/authentication state.
2. Require the user to select and successfully authenticate exactly one subscription provider.
3. Continue directly to the pre-session compact bar and **Start Interview**.

Microphone, system-audio, and screen-capture permissions are not requested speculatively during onboarding. Request each permission in context when the user first invokes the feature, explain the immediate reason in one sentence, and keep unrelated features usable if the user declines.

Preferences are grouped into:

1. General.
2. Profile & Context.
3. Audio.
4. AI provider.
5. Privacy.
6. Prompts and templates.
7. History.
8. Advanced.

Provider diagnostics and raw model identifiers belong in AI provider or Advanced. They must not crowd the live HUD.

Answer intelligence supports subscription-authenticated Claude Code and Codex only. InterviewCopilot does not expose OpenAI, Anthropic, or Gemini API-key provider configuration. Settings detects CLI installation and subscription authentication independently for Claude Code and Codex. Optional cloud transcription is configured separately under Audio and does not reintroduce a general answer-provider API-key flow.

InterviewCopilot has no product plans, credits, quotas, or feature entitlements. Every shipped feature is available in the open-source application; users are responsible only for access to their selected Claude Code or Codex subscription. Legacy credit counters, subscription portal surfaces, out-of-credits events, and paywall-era copy are migration debris and must be removed.

InterviewCopilot collects no product analytics, behavioral events, device fingerprints, or remotely uploaded crash reports. Operational diagnostics remain local and must exclude transcripts, screenshots, audio, prompts, model responses, candidate/opportunity documents, provider credentials, and authentication tokens. Settings may provide a user-initiated diagnostic export with a preview of the redacted bundle; nothing is transmitted automatically.

The user selects exactly one subscription provider. Start Interview snapshots that provider for the persistent conversation. InterviewCopilot never fails over, retries through, or routes work to the other provider automatically. A provider failure surfaces a clear recoverable error and leaves switching entirely under user control; a Settings change applies to the next session.

Settings stores a separate model selection for Claude Code and Codex, including an explicit Provider default choice. Start Interview snapshots the model with the provider, and that pair remains fixed for the persistent conversation. InterviewCopilot never upgrades, downgrades, or routes between models per task. A Settings change applies to the next session, and each archived session records the provider/model pair it used.

AI provider settings also expose a two-state **Response mode** control:

- **Fast:** ask the selected model for lower-latency, concise reasoning using the provider's supported lower-effort control.
- **Reasoning:** allow the selected model more deliberate reasoning using the provider's supported higher-effort control.

This is a user choice, not automatic routing. The provider-neutral driver translates the two product states into provider-specific effort options without changing the selected provider or model. Start Interview snapshots response mode together with provider and model; all three remain locked for the persistent interview conversation, and Settings changes apply to the next session. If a provider/model cannot honor a state, the UI marks that combination unavailable rather than silently substituting a model, provider, or effort level. Both states publish and stream usable content immediately when the provider makes it available; InterviewCopilot never holds a Fast response to meet a layout threshold or cuts off a Reasoning response to meet a timer.

The persistent provider conversation must have access to the full applicable active-session record. The initial turn seeds all starting context, and later turns add finalized transcript, new question branches, screenshots, generated answers, follow-ups, constraints, and mode-state changes. Behavioral and System Design seed the full candidate dossier and active opportunity context. Coding never receives those personal documents. Raw audio is excluded unless a separate cloud-audio operation explicitly requires it.

The active HUD includes a compact context-status indicator. Its normal settled label is **Full context** with a checkmark, meaning every applicable, submitted artifact has been accepted into the persistent provider conversation. It changes to **New context · N** while `N` locally captured artifacts are staged but not yet submitted, **Updating** while artifacts are being sent, and **Context issue** when anything is rejected, interrupted, or still pending after a retry. Provider compaction does not make the indicator an error: when the provider explicitly reports compaction, the detail view records **Provider compacted** while the main label remains **Full context** because the persistent conversation still owns the working history. The label must never imply that every original token remains verbatim after provider compaction.

Selecting the indicator opens a restrained detail popover showing the snapshotted provider and model, interview mode, last successful update, and included source categories with counts: transcript segments, screenshots, question branches, and mode state. Behavioral and System Design also show whether candidate profile and opportunity context were included; Coding explicitly shows them as excluded by mode. Provider-reported context-window use and compaction status may appear when available. Estimated or fabricated token counts are prohibited.

Settings → Prompts and templates opens a dedicated **Prompt Studio** with two synchronized surfaces:

1. **Chat:** A specialized prompt agent interviews the user about desired behavior, proposes a template, explains effects, and presents a reviewable diff before saving changes.
2. **Manage:** A manual CRUD interface to create, read, duplicate, edit, rename, and delete user templates.

Built-in mode templates are readable, duplicable, and restorable but not destructively editable. User templates may customize instructions, tone, depth, priorities, and output preferences while the underlying typed response schema and renderer contract remain protected. Chat and manual edits operate on the same stored template representation.

At launch, every user template is a variant of Coding, System Design, or Behavioral and remains inside that core mode's template selection. Custom named modes that inherit a core schema and appear under More are deferred to a later phase. Completely arbitrary schemas and renderers are out of scope.

Instruction conflicts are resolved dynamically by the agent rather than through a user-visible fixed precedence ladder. The agent weighs current-task relevance, specificity, recency, provenance, and mode applicability and records the effective resolution in session state. Protected response schemas and explicit product invariants—such as screenshot authority, mode locking, and the factual/synthetic Story Bank rules—remain outside dynamic resolution and cannot be overridden by a template or dossier entry.

There is no second tutorial or permission checklist after provider setup.
Capture and microphone permissions remain contextual first-use requests, the
default mode is selected in the pre-session bar, and a sample question is not
required to finish onboarding.

## 10. Accessibility baseline

- All controls have visible keyboard focus.
- Required text meets WCAG AA contrast against its rendered translucent surface.
- Status never relies on color alone.
- Live transcript changes use appropriate, noninterrupting announcements.
- The waveform has a text equivalent.
- Focus is retained predictably when compact panels expand.
- Hover-only actions are prohibited.
- Zoom must not push surfaced answer controls out of reach.
- Reduced motion is supported. Quiet Signal must remain readable at the
  accessibility baseline without a separate product-level high-contrast or
  reduced-transparency appearance mode at launch.

## 11. Competitive interpretation

Research inputs:

- [ULTRACODE](https://ultracode.ai/#features)
- [InterviewCoder](https://www.interviewcoder.co)

Patterns worth adopting:

- A single visually dominant live action.
- Progressive disclosure of alternative and deeper answers.
- Clear audio/capture feedback when a setup, answer, or recovery surface is intentionally visible.
- Mode-specific prompt/context management.
- Compact, progressively disclosed answer controls.

Patterns to avoid:

- Heavy neon glow and promotional gradients.
- Tiny low-contrast controls.
- Treating every mode as code with a different prompt.
- Long generated documents without a glanceable first answer.
- Marketing claims inside the product interface.

## 12. Architecture implications

Implementation should eventually introduce these concepts:

- `InterviewMode`: mode identity, action labels, context fields, prompt policy, answer schema, renderer, and follow-up actions.
- `InterviewSession`: session type, mode, inputs, transcript, questions, responses, and retention state.
- `InputArtifact`: screenshot, transcript segment, or manual text with provenance and timestamps.
- `ResponseSection`: independently streamable typed output rather than one regex-parsed response.
- Semantic design tokens exposed through CSS variables and Tailwind mappings.
- Shared primitives for pre-session setup, temporary answer header, input tray, tabs, disclosure section, empty state, skeleton, and error recovery.

### 12.1 Provider runtime and orchestration

InterviewCopilot should reuse the architectural boundary proven in twarp's agent view without adopting a generic coding-chat product model:

1. A provider-neutral `AgentDriver` owns installation and authentication checks, process lifecycle, caller-supplied opaque session or thread identity, structured input, normalized streaming events, graceful interruption, resume, token/context signals, compaction signals, and provider errors. It can resume after its own child process restarts, but it keeps the opaque identity only in memory and never persists it in plaintext or provider-owned application files.
2. The Claude adapter runs one long-lived headless CLI process per interview using structured JSON input and output, a pinned session identifier, the InterviewCopilot system prompt, schema-constrained output where supported, deliberately restricted tools, and native resume.
3. The Codex adapter runs `codex app-server` over its structured protocol, starts or resumes one thread per interview, installs InterviewCopilot instructions as thread-level developer instructions, uses application-labeled additional context and per-turn output schemas, and consumes native usage and compaction events.
4. An Interview Orchestrator above both adapters owns the selected mode, protected product invariants, prompt-template composition, applicable dossier and opportunity context, transcript and screenshot provenance, question branches, requested intent, typed response schemas, retries, synchronization state, and encrypted persistence/recovery of the opaque provider conversation identifier through the P03 storage interface. Provider-specific JSON never reaches the renderer.
5. A session reducer converts normalized provider and capture events into the durable `InterviewSession` and independently streamable `ResponseSection` model. The compact HUD renders that typed state rather than raw assistant Markdown or terminal scrollback.
6. The encrypted local session archive remains the canonical unabridged product record. Native Claude or Codex persistence is a resumable reasoning runtime, not InterviewCopilot's History database or only source of truth.
7. Shortcut-generated answers and typed composer messages enter the same orchestrator and persistent conversation. They differ only in user intent and which new input artifacts accompany the turn; provider adapters and renderers do not maintain a separate chat agent.

This is therefore a specialized agent host, not merely a terminal wrapper with a system prompt. The provider supplies frontier reasoning, authentication, model access, persistence, and automatic compaction; InterviewCopilot supplies interview state, context policy, mode-specific contracts, capture, privacy, and the pressure-optimized interface.

The twarp patterns to reuse are the long-lived process per conversation, provider-neutral driver capabilities, normalized event stream, one-writer command channel, graceful Stop, native resume, defensive parsing, and explicit context usage. The generic composer, raw terminal toggle, coding tool/diff cards, unrestricted agent tools, and reliance on provider session files for product history should not become the primary InterviewCopilot experience.

Detailed component and storage architecture will continue to tighten as the remaining product decisions are resolved.

## 13. Decision tree

Decisions are resolved in dependency order. A later branch may be reordered when an earlier answer removes or introduces a dependency.

### A. Product center

- **D-001 — Resolved:** InterviewCopilot is primarily a Live interview copilot.
- **D-002 — Resolved:** The canonical product and display name is `InterviewCopilot`.
- **D-003 — Resolved:** Optimize the initial experience for Senior and Staff+ software engineers.
- **D-004 — Resolved:** Lead with discretion and prove it through Staff-level judgment across the entire interview loop.
- **D-005a — Superseded by D-005c:** The earlier absolute invisible/undetectable positioning is replaced by a testable capture-privacy claim.
- **D-005b — Resolved:** Enforce no usage boundary, responsibility notice, or consent requirement; the user is entirely responsible for use.
- **D-005c — Resolved constraint:** Claim capture privacy only for qualified ordinary screen-sharing and recording configurations; do not implement or claim evasion of platform, proctoring, process, or device monitoring.
- **D-005d — Resolved:** Focus launch engineering and capture-privacy qualification exclusively on macOS; defer Windows and Linux.
- **D-005e — Resolved for launch:** Qualify Google Meet entire-display and specific-window sharing; defer Zoom, Teams, and other capture applications.
- **D-005f — Resolved:** Show Google Meet verification only after a guided entire-display and specific-window test on the current Mac/browser, and invalidate it after relevant version changes.
- **D-005g — Resolved:** Use the broad headline “Stay private while you share your screen,” qualified by “InterviewCopilot is designed to stay out of ordinary macOS screen shares and recordings. Coverage varies by application and capture mode; verify your setup before an interview.” Keep application-specific verification details in Privacy & Capture rather than naming Google Meet in the primary promise.
- **D-005h — Resolved:** Do not build a generic “Test My Setup” verifier at launch; expose verification only for applications and capture modes InterviewCopilot explicitly qualifies.

### B. Session model

- **D-006a — Resolved:** `Start Interview` explicitly starts a session; there is no separate End Interview action, and `Reset` is the only terminal lifecycle control.
- **D-006b — Resolved, refined by D-009a:** Reset archives the completed session, clears the entire active interview context, and preserves durable preferences and reusable profile data.
- **D-007 — Resolved:** Lock the selected interview mode from Start Interview until Reset.
- **D-008 — Resolved, refined by D-043a/b:** Retain complete local history and maintain the complete applicable working context in one persistent provider conversation per interview.
- **D-009a — Resolved:** Persist active-session recovery and completed searchable History locally; expose History only under Settings.
- **D-009b — Resolved:** Archive the full structured session and compressed screenshots, but never archive raw audio.
- **D-009c — Resolved:** Retain History indefinitely until the user explicitly deletes it.
- **D-009d — Resolved:** Automatically encrypt persisted session recovery and History with an application key held by the operating-system credential store.
- **D-009e — Resolved:** Provide search, open, delete one, delete all, and individual Markdown/JSON export; omit advanced library management initially.
- **D-010 — Deferred:** If Practice is introduced later, how is it kept separate from the Live experience?

### C. Shell and navigation

- **D-011a — Resolved:** Launch fully hidden; a global visibility shortcut reveals the compact bar; useful generated answers expand automatically into the compact answer panel.
- **D-011b — Resolved:** The global visibility shortcut toggles the entire overlay without changing active session state.
- **D-011c — Resolved, refined by D-011f:** Keep global shortcuts as first-class, remappable controls for the main live interactions while providing equivalent visible controls.
- **D-011d — Resolved:** Use `Control+Shift+C` to reveal and focus a compact agent composer attached to the current HUD.
- **D-011e — Resolved, revised:** Use `Control+Shift+Enter` as the universal Send/Submit action and ordinary `Enter` to create a composer newline.
- **D-011f — Resolved:** Add a visible HotKeys button and editable, conflict-aware shortcut panel with Reset all to defaults.
- **D-012a — Resolved, refined:** Make the main Content View pill the drag surface and use `Control+Shift+Arrow keys` to move the answer view.
- **D-012b — Resolved:** Automatically size the compact bar and answer panel; make only the expanded workspace manually resizable and persist its size per display.
- **D-012c — Resolved:** Use `Control+Option+Left/Right` for previous/next section and `Control+Option+Up/Down` to scroll vertically inside the active section. Section navigation collapses the section being left, expands the destination, and brings its header into view.
- **D-013 — Resolved:** Show Coding, System Design, and Behavioral as three visible segmented buttons in the pre-session compact bar.
- **D-014 — Resolved, refined by D-011f:** Permanently show Record, Screenshot, Chat, Submit, context status, and HotKeys in the active compact bar; place Reset under More.
- **D-015 — Resolved:** When a visible answer is dismissed, collapse it to the compact bar; the visibility shortcut can hide the bar completely.

### D. Audio and capture

- **D-016 — Resolved:** Transcribe locally by default and offer an explicit optional cloud fallback.
- **D-017 — Resolved, refined by D-017c:** Capture an enabled source continuously and provide Pause/Resume without ending the session; Start Interview alone does not activate audio.
- **D-017b — Resolved:** Support separate system-audio and microphone channels and let the user activate or deactivate either source independently.
- **D-017c — Resolved:** Start every new session with system audio and microphone both off.
- **D-017d — Resolved:** Make the global Record action toggle microphone and system-audio capture together while retaining independent visible source controls.
- **D-017e — Resolved:** Use `Control+Shift+R` for Record and move Reset to `Control+Shift+Backspace`.
- **D-018 — Resolved:** Highlight the detected question and wait for the user to explicitly request an answer.
- **D-019 — Resolved:** Combine source-channel labels with diarization, visibly mark uncertainty, and allow transcript-label correction.
- **D-020a — Resolved:** Support full-display screenshot capture only; omit active-window and region capture.
- **D-020b — Resolved:** Always capture the operating system's current primary display.
- **D-021 — Resolved:** Treat the screenshot as authoritative when it conflicts with the transcript.

### E. Coding mode

- **D-022 — Resolved:** Open with a concise approach, key trade-off, and complexity; keep full code in the adjacent tab.
- **D-023a — Resolved:** Make Python, JavaScript/TypeScript, Java, Go, C++, and C# first-class; retain Rust, Swift, Kotlin, Ruby, SQL, and R as best-effort.
- **D-023b — Resolved:** Select and persist Coding language globally in Settings; snapshot it for each session at Start Interview.
- **D-024 — Resolved:** Require an explicit Analyze, Generate Code, Debug, or Follow-up intent for every Coding request.
- **D-024b — Resolved:** Use `Control+Shift+D` to capture and diagnose the current Coding implementation without regenerating the solution.
- **D-025 — Resolved:** Use an explicit New Question action to create a clean Coding problem branch while preserving interview-level context.
- **D-026 — Resolved:** Keep generated code read-only with Copy, Regenerate, Debug, and Explain; provide no in-app editing or execution.

### F. System Design mode

- **D-027 — Resolved:** Generate a read-only structured architecture diagram with inspection and regeneration but no editing.
- **D-028a — Resolved:** Use a fixed Clarify → Estimate → Architecture → Data/API → Deep Dives and Trade-offs sequence.
- **D-028b — Resolved:** Show two to four material estimates with explicit assumptions and offer deeper calculations on request.
- **D-029 — Resolved:** Generate the complete design immediately, making unresolved requirements explicit assumptions rather than blockers.
- **D-030a — Resolved:** Use vendor-neutral architecture components and keep provider-specific services as secondary examples.
- **D-030b — Resolved:** Provide no standalone diagram copy or export controls.
- **D-031 — Resolved:** Let the agent dynamically determine and apply the appropriate System Design updates, then summarize what changed.

### G. Behavioral mode

- **D-032a — Resolved:** Build and maintain an encrypted, Markdown-based candidate dossier through an agent-guided conversation, with manual editing and resume/Markdown import.
- **D-032b — Resolved:** Permit synthetic stories only when the user enables Allow synthetic stories; save and label every generated fallback as synthetic.
- **D-033 — Resolved:** Show talking points by default and provide an optional Full Answer view using the same underlying facts.
- **D-034 — Resolved:** Use only documented claims for real stories; allow clearly synthetic plausible metrics only inside opted-in synthetic stories.
- **D-035a — Resolved:** Store optional opportunity-specific context in a separate encrypted Markdown document under Settings and preserve it across Reset.
- **D-035b — Resolved:** Store multiple named opportunity contexts with one persistent active selection.
- **D-036 — Deferred:** Define post-answer feedback only if a separate Practice experience is pursued later.

### H. Personalization and prompts

- **D-037 — Resolved:** Use candidate and opportunity context in Behavioral and System Design, but exclude both from Coding.
- **D-038 — Resolved:** Provide a dedicated Prompt Studio with an agent-guided chat and synchronized manual CRUD for user templates.
- **D-039a — Resolved for launch:** Allow user-created template variants only within Coding, System Design, and Behavioral.
- **D-039b — Deferred:** Later evaluate custom named modes that inherit a core mode and appear under More.
- **D-040 — Resolved:** Let the agent dynamically reconcile semantic instruction conflicts within protected product and schema invariants.

### I. AI, privacy, and reliability

- **D-041 — Resolved:** Require only transcription to run locally; delegate all other model intelligence dynamically to frontier subscription models.
- **D-042a — Resolved:** Support Claude Code and Codex subscription providers only; remove legacy answer-provider API-key integrations.
- **D-042b — Resolved:** Use only the provider explicitly selected by the user; provide no automatic fallback or cross-provider routing.
- **D-042c — Resolved:** Let the user select a model per subscription provider and keep it fixed until manually changed.
- **D-042d — Resolved:** Add a user-selected `Fast / Reasoning` response-mode setting, map it to the chosen provider/model's native effort controls without automatic fallback, and lock it from Start Interview until Reset.
- **D-043a — Resolved, refined by D-043b:** Make the complete applicable context available to one persistent provider conversation, seeding full starting state and sending subsequent deltas.
- **D-043b — Resolved:** Rely on the selected provider's automatic compaction within its persistent interview conversation; retain the unabridged record locally.
- **D-043c — Resolved:** Show a compact live context-status indicator with a source-level detail popover and provider-reported compaction/usage information when available.
- **D-043d — Resolved:** Keep the curated mode workspace primary and add a composer for direct conversation with the current persistent agent; do not add a generic chronological Agent View.
- **D-043e — Resolved:** Automatically preselect every newly captured, unsent transcript segment and screenshot as a removable attachment on the next agent turn.
- **D-044a — Resolved:** Stream usable answer content progressively into stable typed sections instead of waiting for the full response. Completed sections remain usable while later sections continue.
- **D-044b — Resolved for answer delivery:** Do not impose a fixed answer deadline or delay output to assemble a complete response. Instrument latency internally and publish useful content whenever the selected provider/model and response mode make it available. Local-transcription performance remains an implementation benchmark rather than an answer holdback policy.
- **D-045a — Resolved:** Cancel only the active provider turn, retain completed and partial sections, keep the persistent interview conversation alive, and offer `Continue unfinished` for interrupted or failed sections without duplicating submitted evidence.
- **D-045b — Resolved:** Always provide a best-effort answer without confidence scoring or a blocking review state. State consequential assumptions and, when useful, suggest questions the user should consider asking the interviewer; accept corrections through chat and revise affected sections.

### J. Theme and accessibility

- **D-046 — Resolved:** Use Quiet Signal as the core brand character: calm dark-neutral surfaces, restrained accents, minimal glow, and clear technical typography without hacker or gamer styling.
- **D-047 — Resolved:** Keep subtle mode accents—green for Coding, violet for System Design, and amber for Behavioral—while using the global signal green for primary actions in every mode.
- **D-048a — Resolved:** Offer `Compact` and `Comfortable` interface-density presets, defaulting to Compact; density changes spacing and control geometry without changing structure or behavior.
- **D-048b — Resolved:** Offer `Small`, `Default`, and `Large` content text-size presets across answers, chat, transcripts, and code, with no required text below 12px; keep this independent from interface density.
- **D-049 — Resolved:** Do not add separate high-contrast, High Legibility, or reduced-transparency appearance modes at launch; keep one readable Quiet Signal theme. Reduced-motion behavior remains supported independently.
- **D-050 — Resolved:** Keep InterviewCopilot fully silent with no UI sounds, spoken responses, or haptics; communicate all state visually.

### K. Onboarding and commercialization

- **D-051 — Resolved:** Use one compact provider setup checklist, require one working Claude Code or Codex subscription selection, then land directly on Start Interview. Omit a tutorial carousel and request capture permissions only on first use.
- **D-052 — Resolved:** Keep permission and provider failures inline and scoped to the affected feature; preserve the interview, provide `Open System Settings` or `Reconnect`, and retry only after explicit user action.
- **D-053 — Resolved:** Keep InterviewCopilot open source under the repository's existing AGPL-3.0-or-later model rather than turning it into a closed commercial or open-core product.
- **D-054 — Resolved:** Gate no features behind InterviewCopilot plans, credits, quotas, or entitlements; remove legacy credit and subscription-portal machinery.
- **D-055 — Resolved:** Collect no analytics and upload no crash reports automatically. Keep only content-safe local diagnostics that the user may inspect and manually export.

## 14. Decision log

| ID | Status | Decision | Rationale and consequences |
|---|---|---|---|
| Theme-001 / D-046 | Resolved | Use the Quiet Signal visual system described above. | It fits the transparent desktop HUD, improves glanceability, and differentiates InterviewCopilot from competitors' neon-heavy visual language without turning the interface into a hacker aesthetic. |
| D-047 | Resolved | Use green, violet, and amber as restrained identifiers for Coding, System Design, and Behavioral while keeping primary actions globally green. | Mode color improves orientation at a glance; limiting it to icons, active edges, status, and selected controls preserves one coherent Quiet Signal theme. |
| D-048a | Resolved | Provide Compact and Comfortable density presets, defaulting to Compact. | Compact minimizes screen footprint during live use; Comfortable increases spacing and hit targets without creating a different information architecture or shortcut model. |
| D-048b | Resolved | Provide Small, Default, and Large content text-size presets across answers, chat, transcripts, and code, independent of density. | Users can increase reading size without inflating every HUD control or losing the compact live layout; required information never drops below 12px. |
| D-049 | Resolved | Ship one readable Quiet Signal appearance without separate high-contrast, High Legibility, or reduced-transparency modes. | Avoid the implementation and testing cost of parallel visual systems at launch. Reduced motion remains an independent behavior setting rather than an alternate theme. |
| D-050 | Resolved | Keep the application fully silent: no UI sounds, TTS, or haptic feedback. | Visual status is discreet and cannot leak app activity into an interview or recording environment. |
| D-051 | Resolved | First run is a single provider setup checklist followed directly by Start Interview; feature permissions are requested contextually on first use. | The current app already has a provider-gated welcome path. Refining that path preserves speed while avoiding premature microphone or screen-capture prompts and a tutorial users must dismiss. |
| D-052 | Resolved | Recover from permission and provider failures inline, disable only the affected action, preserve local session state, and offer a specific repair action followed by explicit Retry. | The current implementation mostly relies on provider toasts and has no complete macOS permission-recovery path. Scoped recovery prevents a declined microphone or capture permission—or a provider disconnect—from destroying otherwise usable interview context. |
| D-053 | Resolved | Keep InterviewCopilot open source under AGPL-3.0-or-later. | This matches the repository's current license and free/open-source positioning. Users supply their own Claude Code or Codex subscription, and the product architecture does not depend on a proprietary answer backend. |
| D-054 | Resolved | Make every shipped feature available without InterviewCopilot plans, credits, quotas, or entitlements. | Users already bring a Claude Code or Codex subscription. Removing the repository's legacy credit counters and subscription portal keeps the open-source product model honest and simplifies the live UI and failure paths. |
| D-055 | Resolved | Collect no product analytics or device identifiers and perform no automatic crash upload; retain only content-safe local diagnostics with explicit manual export. | This matches the privacy-sensitive, open-source, local-first product model. Interview content, provider output, personal context, and credentials must never enter diagnostic logs. |
| Mode-001 | Proposed baseline | Start with Coding, System Design, and Behavioral. | These require genuinely different answer structures and cover the user's stated minimum. |
| Voice-001 | Proposed baseline | Treat voice as a shared input channel with visible session state; do not add spoken AI output initially. | Interviewer transcription provides more value than TTS while keeping the live UI quiet. |
| D-001 | Resolved | InterviewCopilot is primarily a Live interview copilot. | The live HUD, low latency, glanceability, and minimal interaction take priority. Practice scoring, review, and coaching are excluded from the initial product surface and cannot complicate Live. |
| D-002 | Resolved | Use `InterviewCopilot` as the canonical product and display name. | The current `Interview Coder` labels will be migrated during implementation. The `TimoCodes` repository name may remain temporarily as an internal migration detail but is not a user-facing brand. |
| D-003 | Resolved | Optimize for Senior and Staff+ software engineers. | Defaults favor judgment, trade-offs, production constraints, technical leadership, and organizational impact. Broad accessibility remains valuable, but equal optimization across all seniority levels is not a goal. |
| D-004 | Resolved | Position InterviewCopilot as “The invisible live copilot for Staff+ engineering interviews—across coding, system design, and behavioral.” | Invisibility is the immediate promise; Staff-level full-loop judgment is the product-depth differentiator. Product design and messaging must demonstrate both. |
| D-005a | Superseded by D-005c | The earlier absolute invisible/undetectable positioning is no longer the release claim. | Universal local or platform-level undetectability cannot be honestly guaranteed or safely validated. |
| D-005b | Resolved | Treat InterviewCopilot as a neutral tool and enforce no responsibility notice or consent gate. | Onboarding and session start remain frictionless. The product does not repeatedly interrupt the live workflow with usage confirmations. |
| D-005c | Resolved constraint | Limit the promise to exclusion from ordinary screen sharing and recording on explicitly qualified configurations. | Capture privacy remains release-critical and testable. The product will not hide its process, tamper with monitoring, spoof platform state, or attempt to evade anti-cheating or proctoring controls. |
| D-005d | Resolved | Make macOS the only initial engineering and capture-privacy qualification target; defer Windows and Linux. | The launch matrix stays narrow enough to test rigorously. Capture scopes and applications qualify independently; Google Meet already provides the observed entire-display and specific-window baseline recorded under D-005e. |
| D-005e | Resolved for launch | Require the externally selected release commit's signed/notarized build to pass Google Meet entire-display and specific-window sharing tests on the committed supported macOS/browser matrix. | Both scopes already have an observed working baseline. The immutable checkout supplies the expected commit and matrix/key policy; a mandatory detached post-build statement binds an immutable RC-scoped package set that later unchanged release reporters validate without rebuilding. The final test is a release gate; Zoom, Teams, browser-tab sharing, and other capture products remain unqualified until independently tested. |
| D-005f | Resolved | Provide a guided Google Meet test and show verified status only for the recorded Mac, browser, app version, and passing capture scopes. | Verification requires confirmation from the remote Meet view or a second device, becomes stale after capture-relevant app changes or major OS/browser changes, and never implies universal invisibility. The underlying `setContentProtection(true)` path is centralized and unit-guarded. |
| D-005g | Resolved | Lead with “Stay private while you share your screen,” then state that InterviewCopilot is designed to stay out of ordinary macOS screen shares and recordings and that coverage varies by application and capture mode. | The product promise should describe the general user benefit rather than a Google Meet feature. Exact verified applications, modes, versions, and dates remain visible in Privacy & Capture, while universal undetectability and anti-monitoring claims remain out of scope. |
| D-005h | Resolved | Omit an application-agnostic “Test My Setup” flow at launch. | A generic self-test creates setup cost without reliably certifying arbitrary capture implementations. Verification remains available only for explicitly qualified applications and capture modes. |
| D-006a | Resolved | Use only `Start Interview` and `Reset` as explicit session lifecycle controls. | Hiding or collapsing does not affect the session. Omitting a separate End action keeps the live control model minimal; Reset owns termination semantics. |
| D-006b | Resolved, refined by D-009a | Reset stops capture and processing, archives the completed session, clears the active working context, and returns to Start Interview. | Active transcripts, screenshots, questions, answers, and follow-ups leave the live HUD; the local History entry, preferences, provider configuration, and reusable Story Bank/profile data survive. |
| D-007 | Resolved | Select the interview mode before Start Interview and lock it until Reset. | Each session maintains one coherent prompt policy, context model, answer schema, and renderer. The active mode appears as status rather than an editable control. |
| D-008 | Resolved, refined by D-043a/b | Keep complete local session history and one persistent provider conversation per interview. | The conversation receives full starting context and later deltas; the encrypted local record remains unabridged regardless of provider compaction. |
| D-009a | Resolved | Use local storage for active crash recovery and permanent searchable session History; show History only under Settings. | Relaunch can offer Resume or Reset. Completed sessions remain retrievable without adding a history surface or visual weight to the live HUD. |
| D-009b | Resolved | Archive mode, timestamps, finalized transcript, questions, constraints, answers, code, diagrams, summaries, follow-ups, and compressed screenshots; exclude raw audio. | History remains reconstructable and searchable without retaining large, highly sensitive audio recordings. Temporary audio buffers are discarded after transcription. |
| D-009c | Resolved | Retain archived sessions indefinitely until explicit deletion. | History behaves as a durable user library. No automatic age-based expiry or pruning occurs. |
| D-009d | Resolved | Automatically encrypt persisted active-session recovery and History with an application key stored in macOS Keychain or Windows Credential Manager. | Session text, indexes, screenshots, diagrams, and caches must not remain as plaintext at rest. Explicit export is the only intentional plaintext release. |
| D-009e | Resolved | Provide History search, open, delete one, delete all, and individual Markdown/JSON export. | Users receive essential control and portability without expanding Settings into a complex library product. Tags, favorites, multi-select, and bulk export are deferred. |
| D-011a | Resolved | Launch hidden; reveal a 44px compact bar with the global visibility shortcut; automatically expand useful answers into a compact panel. | The product remains invisible until intentionally summoned, then provides stable live status and controls without opening the full workspace. |
| D-011b | Resolved | Use the global visibility shortcut to toggle the entire overlay without affecting the active session. | The user can instantly hide or restore the bar while audio capture, processing, and context continue. |
| D-011c | Resolved, refined by D-011f | Use remappable global shortcuts for the main live interactions and retain equivalent visible controls. | The user can record, capture, submit, and reveal the product without focusing the overlay, while Settings conflict detection and visible controls preserve accessibility and control. |
| D-011d | Resolved | Use `Control+Shift+C` to reveal and focus a compact composer attached to the current HUD. | A typed turn remains fast and discreet, can include pending evidence, and uses the current persistent agent without forcing the expanded workspace or introducing a generic Agent View. |
| D-011e | Resolved, revised | Use `Control+Shift+Enter` as the universal Send/Submit action and ordinary `Enter` for a composer newline. | One shortcut submits either a typed message with selected evidence or pending evidence alone, matching the existing processing muscle memory without creating a second send command. |
| D-011f | Resolved | Add a permanently discoverable HotKeys button and an anchored shortcut-management panel with inline editing, conflict detection, and Reset all to defaults. | The shortcut-first product remains learnable and controllable without duplicating a shortcut hint beside every live action. |
| D-012a | Resolved, refined | Drag from the main Content View pill, snap near screen edges, remember position per display, and move the answer view with `Control+Shift+Arrow keys`. | The dominant control surface doubles as a predictable drag handle, while global movement works without focusing or revealing extra controls. Interactive descendants never initiate dragging. |
| D-012b | Resolved | Automatically size the compact bar and compact answer; allow manual resizing only in the expanded workspace and remember that size per display. | Live states remain stable and low-effort while diagrams, code, Settings, and History can use a user-controlled workspace. |
| D-012c | Resolved | Use `Control+Option+Left/Right` to move between answer sections and `Control+Option+Up/Down` to scroll vertically within the active section. | Moving between sections collapses the section being left, expands the destination, and brings its header into view, preserving a single focused reading path while keeping all four commands spatially coherent. |
| D-013 | Resolved | Use a visible three-part segmented selector for Coding, System Design, and Behavioral before Start Interview. | The modes define the session and should remain immediately discoverable. A separate chooser is deferred until the mode count grows beyond the compact bar. |
| D-014 | Resolved, refined by D-011f | Keep Record, Screenshot, Chat, Submit, context status, and HotKeys permanently visible during an active session; put Reset under More. | The repeated capture and agent-turn controls stay immediate, shortcut management remains discoverable, and the destructive terminal action stays outside the main interaction row. |
| D-015 | Resolved | Collapse dismissed answers back to the compact bar; hide the bar only through the visibility control. | The visible session retains glanceable mode and state while still allowing a zero-pixel hidden state on demand. |
| D-016 | Resolved | Use local transcription by default with an explicit optional cloud fallback. | The product favors low latency and local processing but can recover from unsupported or underpowered devices. Remote audio processing is never enabled silently. |
| D-017 | Resolved, refined by D-017c | Once the user enables an audio source, capture it continuously; provide Pause/Resume while retaining session context. | Continuous capture preserves follow-ups and constraints without constant interaction. Starting a session alone does not activate audio. Hiding the overlay does not change enabled-source state. |
| D-017b | Resolved | Support system audio and microphone as separate channels with independent user-controlled activation. | Continuous listening captures only enabled sources. The user can change either source during a session without losing context or resetting. |
| D-017c | Resolved | Initialize system audio and microphone as off for every new session. | Audio capture always requires an explicit per-session activation and never inherits an enabled state from a prior interview. |
| D-017d | Resolved | Use one global Record action to start/resume or pause microphone and system audio together. | The shortcut is predictable and immediately captures both sides of the interview. Visible source controls still let the user disable or re-enable either channel independently. |
| D-017e | Resolved | Assign `Control+Shift+R` to the master Record toggle and move Reset to `Control+Shift+Backspace`. | Record receives the obvious mnemonic while session destruction requires a more deliberate chord. Existing screenshot, submit, and visibility shortcuts remain stable. |
| D-018 | Resolved | Surface the detected question and wait for Solve, Design, or Coach answer before generating. | The user controls timing, provider cost, and false-positive question boundaries; no detected speech silently initiates an answer request. |
| D-019 | Resolved | Default system audio to Interviewer and microphone to You; use diarization for multi-speaker channels, mark uncertainty, and allow corrections. | Source separation supplies reliable defaults while in-person/shared-channel interviews remain usable. Corrections update live context and History. |
| D-020a | Resolved | Support full-display screenshot capture only. | The capture interaction remains immediate and predictable. Active-window and region selection are intentionally excluded. |
| D-020b | Resolved | Always capture the operating system's current primary display. | Screenshot behavior is deterministic and needs no display picker. If the OS primary display changes, subsequent captures follow it. |
| D-021 | Resolved | Use the screenshot as the authoritative source when screenshot and transcript conflict. | Compatible speech can add context, but visible problem requirements win. The transcript is primary only when no screenshot is present. |
| D-022 | Resolved | Make the initial Coding answer a short approach, key trade-off, and time/space complexity; place full code in the adjacent tab. | The candidate receives something immediately speakable without scanning a full solution. Code can continue streaming independently. |
| D-023a | Resolved | Treat Python, JavaScript/TypeScript, Java, Go, C++, and C# as first-class; retain Rust, Swift, Kotlin, Ruby, SQL, and R as best-effort. | Core languages receive explicit quality fixtures and regression coverage. Additional languages remain useful without implying equal validation. |
| D-023b | Resolved | Store Coding language as a global Settings preference and snapshot it when a Coding session starts. | Language selection stays out of the compact live workflow. Mid-session Settings changes apply only to the next session, preserving answer consistency. |
| D-024 | Resolved | Require the user to choose Analyze, Generate Code, Debug, or Follow-up for every Coding request. | The system never guesses whether new evidence is a bug, changed constraint, or continuation. Each intent uses its own response schema and visible primary action. |
| D-024b | Resolved | Use `Control+Shift+D` to capture the primary display and ask the current Coding agent for a targeted fix. | The diagnostic screenshot is submitted immediately and independently of other staged evidence. The current solution is preserved, the response is a versioned Fix card, and no full-regeneration or cross-mode fallback occurs. |
| D-025 | Resolved | Add New Question to create a clean Coding problem branch within the active interview session. | Prior problem state leaves the active workspace, while complete interview-level transcript, prior branches, and History chronology remain continuous and available as full request context. |
| D-026 | Resolved | Keep code read-only with Copy, Regenerate, Debug, and Explain; omit editing, execution, terminal access, and test running. | InterviewCopilot remains a focused live copilot while the interview platform or external IDE owns code manipulation and execution. |
| D-027 | Resolved | Render System Design architecture as a read-only structured diagram. | Users can inspect, zoom, pan, and regenerate, but diagram editing and whiteboarding stay outside InterviewCopilot. |
| D-028a | Resolved | Use a consistent Clarify, Estimate, Architecture, Data/API, Deep Dives and Trade-offs sequence for every System Design session. | Stable navigation improves glanceability and prevents arbitrary model-generated document structures. |
| D-028b | Resolved | Default to two to four material capacity calculations with explicit assumptions; provide deeper estimates on request. | The live answer demonstrates quantitative judgment without crowding the interface with low-value arithmetic. |
| D-029 | Resolved | Generate all System Design sections immediately and label unresolved requirements as explicit assumptions. | The candidate receives a usable architecture without completing an interaction gate; later constraints can regenerate affected sections through Follow-up. |
| D-030a | Resolved | Use vendor-neutral component types for generated architecture diagrams. | The diagram communicates architecture and trade-offs without prematurely coupling the answer to AWS, Azure, GCP, or their icon libraries. |
| D-030b | Resolved | Provide no standalone diagram copy or export action. | Diagrams remain available within archived sessions and whole-session export, but the live Architecture tab stays focused and uncluttered. |
| D-031 | Resolved | Use agent-directed dynamic updates for System Design follow-ups. | The agent evaluates dependency impact, preserves unaffected sections, revises or regenerates what is necessary, and presents a concise What changed summary. |
| D-032a | Resolved | Use an agent-guided conversation to build and maintain a canonical Markdown candidate dossier with manual editing and resume/Markdown import. | Behavioral mode receives structured reusable context while the user retains a portable, reviewable source of truth. The document is encrypted at rest and exportable as Markdown. |
| D-032b | Resolved | Allow live synthetic stories only when the user explicitly enables the global setting; persist and label each generated fallback as `synthetic-draft`. | Verified evidence remains preferred. Synthetic material stays consistent across future answers and is never silently represented as verified dossier content. |
| D-033 | Resolved | Default Behavioral output to concise talking points with an optional Full Answer view. | The candidate gets a glanceable natural-speaking aid while retaining access to polished phrasing. Both formats must use identical underlying claims. |
| D-034 | Resolved | Real stories use only dossier-backed facts and stay qualitative when metrics are unknown; opted-in synthetic stories may use labeled plausible metrics. | Factual stories remain consistent and unsupported precision is avoided, while synthetic examples can still be complete and reusable. |
| D-035a | Resolved | Maintain company, role, level, job description, competency focus, and interview notes in a separate encrypted Markdown opportunity context under Settings. | Reset preserves opportunity context. The agent combines it with the candidate dossier without mixing short-lived target-role information into durable candidate history. |
| D-035b | Resolved | Store multiple named opportunity contexts with one active selection. | Parallel interview processes remain separate. Sessions snapshot the selected context for historical accuracy, and mid-session selection changes apply only to the next session. |
| D-037 | Resolved | Provide candidate-profile and active opportunity context to Behavioral and System Design only. | Personal evidence and target-role calibration improve those modes; Coding remains objectively grounded in the problem and selected language. |
| D-038 | Resolved | Add a Prompt Studio combining a specialized template-building chat with manual CRUD. | Conversational creation lowers the barrier while direct management gives power users control. Built-in templates and response-schema contracts remain protected. |
| D-039a | Resolved for launch | Limit user templates to variants within the three core modes. | The segmented selector and typed renderers remain stable while users can still specialize behavior. Arbitrary schemas are out of scope. |
| D-039b | Deferred | Later evaluate custom named modes that inherit a core schema and appear under More. | This preserves a clear expansion path without making the initial Prompt Studio an application builder. |
| D-040 | Resolved | Let the agent dynamically resolve semantic conflicts using relevance, specificity, recency, provenance, and mode applicability. | Behavior can adapt to context without exposing a rigid hierarchy. Protected renderer contracts and explicit product invariants remain non-overridable. |
| D-041 | Resolved | Make transcription the only locally required AI capability; use frontier models on the user's subscription for all other intelligence. | Capture, encryption, and storage remain local application mechanics, but the product does not bundle local models for diarization, detection, summarization, or answer reasoning. |
| D-042a | Resolved | Support only Claude Code and Codex subscription-authenticated providers for answer intelligence. | Onboarding and settings avoid general API-key billing and configuration. Legacy OpenAI, Anthropic, and Gemini answer-provider integrations are removed; cloud transcription remains separate. |
| D-042b | Resolved | Use only the subscription provider explicitly selected by the user. | The existing primary-provider behavior is retained. Failures surface clearly, and the user must manually choose another provider; automatic fallback and dynamic cross-provider routing are prohibited. |
| D-042c | Resolved | Store a user-controlled model selection for Claude Code and Codex and never switch it automatically. | Provider default remains an explicit selectable option. Sessions snapshot the provider/model pair for reproducibility. |
| D-042d | Resolved | Add a `Fast / Reasoning` setting, translate it into the selected provider/model's native effort controls, and snapshot it with provider/model at Start Interview. | The user explicitly chooses latency versus deliberation, while one persistent conversation keeps a consistent configuration until Reset. InterviewCopilot never silently changes or downgrades the selection; unsupported combinations are unavailable. |
| D-043a | Resolved, refined by D-043b | Seed a persistent provider conversation with complete applicable starting context and send subsequent session deltas into it. | Behavioral/System Design include candidate and opportunity documents; Coding excludes them. Raw audio remains outside general answer requests. |
| D-043b | Resolved | Use one persistent resumable provider conversation per interview and rely on provider auto-compaction. | The driver resumes process failures from a caller-supplied opaque identifier held only in memory; the orchestrator persists that identifier solely inside the encrypted active-session record for app-restart recovery. Reset discards the provider conversation. InterviewCopilot does not implement a second hidden compaction layer. |
| D-043c | Resolved | Show a `Full context` status indicator with `Updating` and `Context issue` states plus an inspectable source-level detail popover. | The user can verify what entered the persistent conversation without crowding the HUD. Provider-reported compaction is disclosed without falsely implying that all original tokens remain verbatim. |
| D-043d | Resolved | Keep the curated mode-specific workspace primary while allowing typed conversation with the current persistent agent. | Shortcut answers and chat messages share one provider conversation and context model. Structured responses update the curated layout; ordinary clarification can remain a compact exchange without introducing a generic terminal-style Agent View. |
| D-043e | Resolved | Preselect all newly captured, unsent transcript segments and screenshots as removable attachments for the next answer or chat submission. | The default preserves complete context without resending artifacts already held by the persistent agent. Users can exclude irrelevant evidence or send a text-only message while retaining deliberate control. |
| D-044a | Resolved | Stream usable answer content progressively into stable typed sections rather than waiting for the full response. | The first speakable or actionable result appears as soon as possible; late code, diagrams, or deep-detail sections do not block already completed content or cause the reading position to jump. |
| D-044b | Resolved for answer delivery | Publish usable answer content whenever it becomes available rather than enforcing a fixed response deadline. | Fast and Reasoning intentionally have different latency profiles. Latency remains observable for engineering, but the UI neither withholds ready content nor truncates deliberate work to hit an arbitrary timer. |
| D-045a | Resolved | Cancel only the current generation, preserve completed and partial output, retain the persistent conversation, and retry only unfinished sections. | Cancellation is a safe turn-level control rather than a session reset. Reusing the existing request and accepted context prevents duplicate evidence and unnecessary regeneration. |
| D-045b | Resolved | Always answer on a best-effort basis, state only consequential assumptions, and suggest interviewer clarifications when they could materially change the answer. | Numeric confidence and blocking review states add friction without reliable precision. The user can correct the interpretation through chat, after which the agent revises only affected sections. |
| D-036 | Deferred | Define Practice-only post-answer feedback only if a separate Practice product is pursued. | The Live-first product does not add scoring or retrospective coaching to the active interview workflow. |

## 15. Implementation execution

The reviewed phase order, dependency graph, acceptance gates, migration owners,
prototype disposition, and implementation/review/remediation prompts are defined
in [`docs/implementation/phase-execution-packet.md`](docs/implementation/phase-execution-packet.md),
revision P00-R8. This design remains the product source of truth; the packet is
the execution contract. Prototype evidence does not establish phase completion.
