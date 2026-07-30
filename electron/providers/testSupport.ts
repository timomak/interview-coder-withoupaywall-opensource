import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ProcessRequest, ProcessResult, SafeProcessRunner } from "./processRunner"

export class RecordingProcessRunner extends SafeProcessRunner {
  readonly requests: ProcessRequest[] = []

  override run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request)
    return super.run(request)
  }
}

export function makeFakeExecutable(
  name: string,
  body: string,
  version: string
): { directory: string; executable: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ic-p02-fake-"))
  const executable = path.join(directory, name)
  fs.writeFileSync(
    executable,
    `#!/opt/homebrew/opt/node@20/bin/node
const args = process.argv.slice(2)
if (args.includes("--version")) {
  process.stdout.write(${JSON.stringify(version)} + "\\n")
} else {
${body}
}
`,
    { mode: 0o700 }
  )
  return { directory, executable }
}

export const CLAUDE_SUCCESS_BODY = `
  process.stdout.write(JSON.stringify({type:"system",subtype:"init"}) + "\\n")
  process.stdout.write(JSON.stringify({type:"stream_event",event:{delta:{type:"text_delta",text:"claude-answer"}}}) + "\\n")
  process.stdout.write(JSON.stringify({type:"result",usage:{input_tokens:3,output_tokens:5},stop_reason:"end_turn"}) + "\\n")
`

export const CODEX_SUCCESS_BODY = `
  let input = ""
  process.stdin.on("data", chunk => { input += chunk })
  process.stdin.on("end", () => {
    process.stdout.write(JSON.stringify({method:"turn/started",params:{}}) + "\\n")
    process.stdout.write(JSON.stringify({method:"item/agentMessage/delta",params:{delta:"codex-answer"}}) + "\\n")
    process.stdout.write(JSON.stringify({method:"thread/tokenUsage/updated",params:{tokenUsage:{inputTokens:2,outputTokens:4}}}) + "\\n")
    process.stdout.write(JSON.stringify({method:"turn/completed",params:{turn:{status:"completed"}}}) + "\\n")
  })
`
