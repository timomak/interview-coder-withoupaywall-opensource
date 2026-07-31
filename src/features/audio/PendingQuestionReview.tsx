import { useEffect, useState } from "react"
import type { InterviewMode } from "../../shared/interview"
import type { PendingQuestion } from "./contracts"

const ANSWER_LABELS: Readonly<Record<InterviewMode, string>> = {
  coding: "Solve",
  "system-design": "Design",
  behavioral: "Coach answer"
}

interface PendingQuestionReviewProps {
  readonly mode: InterviewMode
  readonly question: PendingQuestion
  readonly disabled?: boolean
  readonly onEdit: (text: string) => void
  readonly onDismiss: () => void
  readonly onAnswer: (text: string) => void
}

export function PendingQuestionReview({
  mode,
  question,
  disabled = false,
  onEdit,
  onDismiss,
  onAnswer
}: PendingQuestionReviewProps) {
  const [draft, setDraft] = useState(question.text)

  useEffect(() => setDraft(question.text), [question.id, question.text])

  const commit = () => {
    const next = draft.trim()
    if (next && next !== question.text) onEdit(next)
  }

  return (
    <section className="quiet-pending-question" aria-label="Detected question">
      <div>
        <strong>Question detected</strong>
        <span>Review before asking InterviewCopilot to answer.</span>
      </div>
      <label>
        Pending question
        <textarea
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
        />
      </label>
      <div className="quiet-pending-actions">
        <button type="button" disabled={disabled} onClick={onDismiss}>
          Dismiss
        </button>
        <button
          type="button"
          className="quiet-primary"
          disabled={disabled || draft.trim().length === 0}
          onClick={() => {
            commit()
            onAnswer(draft.trim())
          }}
        >
          {ANSWER_LABELS[mode]}
        </button>
      </div>
    </section>
  )
}
