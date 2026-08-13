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
): { directory: string; executable: string; stateFile: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ic-p02-fake-"))
  const executable = path.join(directory, name)
  const stateFile = path.join(directory, "provider-state.json")
  fs.writeFileSync(
    executable,
    `#!${process.execPath}
const args = process.argv.slice(2)
const fs = require("node:fs")
const stateFile = ${JSON.stringify(stateFile)}
if (args.includes("--version")) {
  process.stdout.write(${JSON.stringify(version)} + "\\n")
} else {
${body}
}
`,
    { mode: 0o700 }
  )
  return { directory, executable, stateFile }
}

export const CLAUDE_SUCCESS_BODY = `
  const createAt = args.indexOf("--session-id")
  const resumeAt = args.indexOf("--resume")
  const known = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : []
  if (createAt >= 0) {
    const id = args[createAt + 1]
    if (known.includes(id)) {
      process.stderr.write("session already exists")
      process.exit(42)
    }
    known.push(id)
    fs.writeFileSync(stateFile, JSON.stringify(known))
  } else if (resumeAt >= 0 && !known.includes(args[resumeAt + 1])) {
    process.stderr.write("unknown session")
    process.exit(43)
  } else if (resumeAt < 0) {
    process.stderr.write("missing create or resume argument")
    process.exit(44)
  }
  process.stdout.write(JSON.stringify({type:"system",subtype:"init"}) + "\\n")
  process.stdout.write(JSON.stringify({type:"stream_event",event:{delta:{type:"text_delta",text:"claude-answer"}}}) + "\\n")
  process.stdout.write(JSON.stringify({type:"result",usage:{input_tokens:3,output_tokens:5},stop_reason:"end_turn"}) + "\\n")
`

export const CODEX_SUCCESS_BODY = `
  const readline = require("node:readline")
  const known = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : []
  let activeThread
  let turnStarted = false
  let turnCompleted = false
  let completionTimer
  const lines = readline.createInterface({ input: process.stdin })
  lines.on("line", raw => {
    const message = JSON.parse(raw)
    if (message.method === "thread/start") {
      activeThread = "019f-codex-thread-" + String(known.length + 1).padStart(4, "0")
      known.push(activeThread)
      fs.writeFileSync(stateFile, JSON.stringify(known))
      process.stdout.write(JSON.stringify({id:message.id,result:{thread:{id:activeThread}}}) + "\\n")
    } else if (message.method === "thread/resume") {
      activeThread = message.params.threadId
      if (!known.includes(activeThread)) {
        process.stdout.write(JSON.stringify({id:message.id,error:{message:"unknown thread"}}) + "\\n")
        process.exitCode = 43
        lines.close()
        return
      }
      process.stdout.write(JSON.stringify({id:message.id,result:{thread:{id:activeThread}}}) + "\\n")
    } else if (message.method === "turn/start") {
      if (!activeThread || message.params.threadId !== activeThread) {
        process.stderr.write("turn started without returned thread")
        process.exitCode = 44
        lines.close()
        return
      }
      const textInput = message.params.input.find(input => input.type === "text")
      if (textInput?.text.includes('"expectImage":true')) {
        const imageInput = message.params.input.find(input => input.type === "image")
        if (
          !imageInput?.url.startsWith("data:image/png;base64,") ||
          textInput.text.includes("data:image") ||
          message.params.outputSchema?.properties?.kind?.enum?.[0] !== "structured"
        ) {
          process.stderr.write("image prompt was not detached and typed")
          process.exitCode = 46
          lines.close()
          return
        }
      }
      turnStarted = true
    process.stdout.write(JSON.stringify({method:"turn/started",params:{}}) + "\\n")
    completionTimer = setTimeout(() => {
      process.stdout.write(JSON.stringify({method:"item/agentMessage/delta",params:{delta:"codex-answer"}}) + "\\n")
      process.stdout.write(JSON.stringify({method:"thread/tokenUsage/updated",params:{tokenUsage:{inputTokens:2,outputTokens:4}}}) + "\\n")
      turnCompleted = true
      process.stdout.write(JSON.stringify({method:"turn/completed",params:{turn:{status:"completed"}}}) + "\\n")
    }, 10)
    }
  })
  lines.on("close", () => {
    if (turnStarted && !turnCompleted) {
      clearTimeout(completionTimer)
      process.exitCode = 45
    }
  })
`
