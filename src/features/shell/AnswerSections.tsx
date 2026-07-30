import { useEffect, useRef, useState } from "react"
import type { ResponseSection } from "../../shared/interview"

export interface AnswerSectionsProps {
  readonly sections: readonly ResponseSection[]
}

export function AnswerSections({ sections }: AnswerSectionsProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeBody = useRef<HTMLDivElement | null>(null)

  useEffect(
    () =>
      window.electronAPI.onShellShortcut((action) => {
        if (action === "section-previous" || action === "section-next") {
          setActiveIndex((current) => {
            if (sections.length === 0) return 0
            const delta = action === "section-previous" ? -1 : 1
            return (current + delta + sections.length) % sections.length
          })
          return
        }
        if (
          action === "section-scroll-up" ||
          action === "section-scroll-down"
        ) {
          activeBody.current?.scrollBy({
            top: action === "section-scroll-up" ? -120 : 120,
            behavior: "smooth"
          })
        }
      }),
    [sections.length]
  )

  return (
    <div className="quiet-answer-sections">
      {sections.map((section, index) => {
        const active = index === activeIndex
        return (
          <section key={section.id} className="quiet-answer-section">
            <button
              type="button"
              data-interactive
              aria-expanded={active}
              onClick={() => setActiveIndex(index)}
            >
              {section.id}
            </button>
            {active ? (
              <div
                ref={activeBody}
                className="quiet-answer-body"
                tabIndex={0}
              >
                <pre>{section.body}</pre>
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
