import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"
import { createWindowOpenHandler } from "./windowOpenPolicy"

function lifecycleErrors(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    "electron/main.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const createWindow = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "createWindow"
  )
  if (!createWindow?.body) return ["createWindow function is missing"]

  const constructionIndex = createWindow.body.statements.findIndex(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === "mainWindow" &&
          declaration.initializer?.getText(sourceFile).startsWith(
            "createCaptureProtectedWindow("
          )
      )
  )
  if (constructionIndex === -1) {
    return ["capture-protected mainWindow construction is missing"]
  }

  const nextStatement = createWindow.body.statements[constructionIndex + 1]
  const expected =
    "mainWindow.webContents.setWindowOpenHandler(" +
    "createWindowOpenHandler((url) => shell.openExternal(url)))"
  const normalized = nextStatement
    ?.getText(sourceFile)
    .replace(/\s+/g, "")
    .replace(/;$/, "")
  if (normalized !== expected.replace(/\s+/g, "")) {
    return [
      "deny handler must be the first executable statement after protected construction"
    ]
  }

  const precedingText = createWindow.body.statements
    .slice(0, constructionIndex + 1)
    .map((statement) => statement.getText(sourceFile))
    .join("\n")
  if (/\bmainWindow\s*\./.test(precedingText)) {
    return ["mainWindow is used before the deny handler is installed"]
  }
  return []
}

describe("window-open capture lifecycle policy", () => {
  it("P01-R1-B01 denies every implicit child while preserving external links", () => {
    const openExternal = vi.fn()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const handler = createWindowOpenHandler(openExternal)

    expect(handler({ url: "https://example.com/untrusted-child" })).toEqual({
      action: "deny"
    })
    expect(handler({ url: "about:blank" })).toEqual({ action: "deny" })
    expect(handler({ url: "not a valid URL" })).toEqual({ action: "deny" })
    expect(openExternal).not.toHaveBeenCalled()

    expect(handler({ url: "https://docs.google.com/document/1" })).toEqual({
      action: "deny"
    })
    expect(handler({ url: "https://calendar.google.com/calendar" })).toEqual({
      action: "deny"
    })
    expect(openExternal).toHaveBeenNthCalledWith(
      1,
      "https://docs.google.com/document/1"
    )
    expect(openExternal).toHaveBeenNthCalledWith(
      2,
      "https://calendar.google.com/calendar"
    )

    const mainSource = fs.readFileSync(
      path.join(process.cwd(), "electron/main.ts"),
      "utf8"
    )
    expect(lifecycleErrors(mainSource)).toEqual([])

    const reorderedSource = mainSource.replace(
      "  mainWindow.webContents.setWindowOpenHandler(",
      "  state.mainWindow = mainWindow\n  mainWindow.webContents.setWindowOpenHandler("
    )
    expect(reorderedSource).not.toBe(mainSource)
    expect(lifecycleErrors(reorderedSource)).toContain(
      "deny handler must be the first executable statement after protected construction"
    )
    expect(mainSource).not.toContain('action: "allow"')

    const shortcutsSource = fs.readFileSync(
      path.join(process.cwd(), "electron/shortcuts.ts"),
      "utf8"
    )
    const screenshotSource = fs.readFileSync(
      path.join(process.cwd(), "electron/ScreenshotHelper.ts"),
      "utf8"
    )
    expect(mainSource).toMatch(
      /new ScreenshotHelper\(\)[\s\S]*new InterviewCaptureController\([\s\S]*new ShortcutsHelper\([\s\S]*registerGlobalShortcuts\(\)/
    )
    expect(shortcutsSource).not.toMatch(
      /setView|reset-view|screenshot-taken|processingHelper/
    )
    expect(screenshotSource.match(/screenshotQueue/g)).not.toHaveLength(0)
    expect(screenshotSource).not.toMatch(/extraScreenshotQueue|setView/)
  })
})
