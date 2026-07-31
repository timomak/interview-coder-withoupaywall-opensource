import { spawn } from "node:child_process"
import path from "node:path"

const root = process.cwd()
const executable = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron"
)
const probe = path.join(
  root,
  "scripts",
  "verification",
  "electron-shell-runtime-probe.cjs"
)
const prefix = "INTERVIEWCOPILOT_ELECTRON_SHELL_PROBE="

const result = await new Promise((resolve, reject) => {
  const child = spawn(executable, [probe], {
    cwd: root,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString()
  })
  child.on("error", reject)
  child.on("close", (code) => resolve({ code, stdout, stderr }))
})

if (result.code !== 0) {
  throw new Error(
    `Electron shell runtime probe failed (${result.code}): ${result.stderr}`
  )
}
const line = result.stdout
  .split(/\r?\n/)
  .find(/** @param {string} candidate */ (candidate) =>
    candidate.startsWith(prefix)
  )
if (!line) throw new Error("Electron shell runtime probe emitted no receipt")
const receipt = JSON.parse(line.slice(prefix.length))
for (const field of [
  "visible",
  "contentProtectionApplied",
  "pointerRoutingApplied",
  "displayMatched"
]) {
  if (receipt[field] !== true) {
    throw new Error(`Electron shell runtime probe failed ${field}`)
  }
}
if (!receipt.primaryDisplayId || receipt.bounds.width < 320) {
  throw new Error("Electron shell runtime probe returned malformed geometry")
}
process.stdout.write(
  `Electron shell runtime probe passed on display ${receipt.primaryDisplayId}\n`
)
