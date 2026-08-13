import { stripCodeFences } from "./language"

const ACTIONS = ["copy", "regenerate", "explain"] as const
type CodeAction = (typeof ACTIONS)[number]

export interface CodePanelProps {
  readonly code: string
  readonly onAction: (action: CodeAction) => void
}

export function CodePanel({ code, onAction }: CodePanelProps) {
  return (
    <article className="quiet-code-panel" aria-label="Code">
      <div className="quiet-code-actions" role="toolbar" aria-label="Code actions">
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            data-interactive
            onClick={() => onAction(action)}
          >
            {action[0].toUpperCase() + action.slice(1)}
          </button>
        ))}
      </div>
      <pre tabIndex={0} aria-readonly="true">
        <code>{stripCodeFences(code)}</code>
      </pre>
    </article>
  )
}
