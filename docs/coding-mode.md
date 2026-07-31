# Coding mode

Coding requests require the user to choose **Analyze**, **Generate Code**,
**Debug**, or **Follow-up**. The choice is part of the typed provider request;
the app never guesses from speech or screenshots.

The initial solution renders a concise Answer before Plan, Code, and Explain.
Plan asks for two to four approach bullets, one trade-off, and time and space
complexity. Code is selectable but read-only. Its only actions are Copy,
Regenerate, Debug, and Explain; InterviewCopilot has no editor, terminal,
execution, or test tool.

Typed payloads may deliver independently final sections progressively—for
example Answer and Plan before Code and Explain. Each payload is restricted to
the declared section set, while the accumulated response must satisfy the
complete intent contract before the turn is accepted. First-class languages
also require representative language syntax, preventing a provider from
satisfying Code with prose.

The selected language is normalized by M-05b and snapshotted when the interview
starts. Python means Python 3. Python 3, JavaScript/TypeScript, Java, Go, C++,
and C# are first-class fixture-backed languages. Rust, Swift, Kotlin, Ruby,
SQL, and R are visibly best-effort. Settings changes affect the next session,
not the active snapshot.

**New Question** starts a clean problem-local view while retaining prior
branches, transcript identifiers, and interview chronology. Fix current code
(`Control+Shift+D`) captures one new primary-display screenshot and submits
only that artifact. Other staged evidence stays pending, and the current
solution stays intact. A supported diagnosis is appended as a versioned Fix
card. When the image is insufficient, the card asks for specific better
evidence and must not fabricate a patch or fall back to answer regeneration.
The first submission defines the current problem atomically. New Question
requires a non-empty next problem, and Debug is unavailable until that current
branch has both a problem and generated code.

Coding provider requests omit profile and opportunity context and expose no
code-writing or execution tools. This prevents accidental personal-context
leakage and keeps the product a read-only interview copilot.
