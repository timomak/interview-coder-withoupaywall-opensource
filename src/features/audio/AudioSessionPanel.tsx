import type { InterviewMode } from "../../shared/interview"
import type {
  AudioCommand,
  AudioSessionState,
  AudioSource
} from "./contracts"
import { AudioSourceControls } from "./AudioSourceControls"
import { AudioStatus } from "./AudioStatus"
import { PendingQuestionReview } from "./PendingQuestionReview"
import { TranscriptPanel } from "./TranscriptPanel"
import { speakerCorrectionCommand } from "./model"

interface AudioSessionPanelProps {
  readonly mode: InterviewMode
  readonly state: AudioSessionState
  readonly available: boolean
  readonly error?: string
  readonly onCommand: (command: AudioCommand) => void
  readonly onOpenSystemSettings: (source: AudioSource) => void
  readonly onAnswer: (question: string) => void
}

export function AudioSessionPanel({
  mode,
  state,
  available,
  error,
  onCommand,
  onOpenSystemSettings,
  onAnswer
}: AudioSessionPanelProps) {
  return (
    <aside className="quiet-audio-panel" data-interactive aria-label="Session audio">
      <AudioStatus state={state} />
      <AudioSourceControls
        state={state}
        disabled={!available}
        onMasterToggle={() => onCommand({ type: "master-toggle" })}
        onSourceToggle={(source) =>
          onCommand({ type: "source-toggle", source })
        }
        onRetry={(source) => onCommand({ type: "source-retry", source })}
        onOpenSystemSettings={onOpenSystemSettings}
      />
      {!available ? (
        <p className="quiet-audio-note">
          Audio controls will be available when the session audio service is
          ready. Both sources remain off.
        </p>
      ) : null}
      {error ? (
        <p className="quiet-error" role="alert">
          {error}
        </p>
      ) : null}
      <TranscriptPanel
        segments={state.segments}
        onCorrectSpeaker={(segmentId, label) =>
          onCommand(speakerCorrectionCommand(segmentId, label))
        }
      />
      {state.pendingQuestion ? (
        <PendingQuestionReview
          mode={mode}
          question={state.pendingQuestion}
          disabled={!available}
          onEdit={(text) =>
            onCommand({
              type: "edit-pending-question",
              text
            })
          }
          onDismiss={() => onCommand({ type: "dismiss-pending-question" })}
          onAnswer={onAnswer}
        />
      ) : null}
    </aside>
  )
}
