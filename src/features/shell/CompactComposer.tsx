import { useEffect, useRef, useState } from "react"

export interface CompactComposerProps {
  readonly initialValue?: string
  readonly hasSelectedEvidence: boolean
  readonly onSubmit: (message: string) => Promise<boolean> | boolean
  readonly onClose: () => void
}

export function CompactComposer({
  initialValue = "",
  hasSelectedEvidence,
  onSubmit,
  onClose
}: CompactComposerProps) {
  const [message, setMessage] = useState(initialValue)
  const [status, setStatus] = useState("")
  const field = useRef<HTMLTextAreaElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    field.current?.focus()
    return () => returnFocus.current?.focus()
  }, [])

  const submit = async () => {
    const trimmed = message.trim()
    if (!trimmed && !hasSelectedEvidence) {
      setStatus("Add a message or select evidence before submitting.")
      return
    }
    if (await onSubmit(trimmed)) {
      setMessage("")
      setStatus("")
    }
  }

  return (
    <section className="quiet-composer" data-interactive aria-label="Agent composer">
      <textarea
        ref={field}
        aria-label="Message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.ctrlKey && event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
      />
      <div className="quiet-composer-actions">
        <button type="button" data-interactive onClick={onClose}>
          Close
        </button>
        <button className="quiet-primary" type="button" data-interactive onClick={() => void submit()}>
          Send
        </button>
      </div>
      <p role="status" aria-live="polite">{status}</p>
    </section>
  )
}
