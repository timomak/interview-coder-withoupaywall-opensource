import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
for (const relativePath of ["dist", "dist-electron"]) {
  const absolutePath = path.join(root, relativePath)
  fs.mkdirSync(absolutePath, { recursive: true })
  for (const entry of fs.readdirSync(absolutePath)) {
    fs.rmSync(path.join(absolutePath, entry), {
      recursive: true,
      force: true
    })
  }
}
