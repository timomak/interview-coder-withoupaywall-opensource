import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { listPackage } from "@electron/asar"
import { fileURLToPath, pathToFileURL } from "node:url"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..")
const ALLOWED_ASAR_ROOTS = new Set([
  "dist",
  "dist-electron",
  "node_modules",
  "package.json"
])
const FORBIDDEN_PROJECT_ROOTS = new Set([
  ".artifacts",
  "electron",
  "renderer",
  "scripts",
  "src",
  "tests"
])
const RAW_SOURCE_PATTERN = /\.(?:jsx|ts|mts|cts|tsx)$/i
const TEST_SOURCE_PATTERN =
  /\.(?:test|spec)\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/i
const FORBIDDEN_OUTER_PATTERN =
  /(?:^|\/)(?:scripts?\/verification|verification)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.map$/i
const ELECTRON_LOCALES = new Set(
  "af am ar bg bn ca cs da de el en en_gb es es_419 et fa fi fil fr gu he hi hr hu id it ja kn ko lt lv ml mr ms nb nl pl pt_br pt_pt ro ru sk sl sr sv sw ta te th tr uk ur vi zh_cn zh_tw"
    .split(" ")
)
const EXACT_ALLOWED_OUTER_FILES = new Set(
  [
    "Contents/Info.plist",
    "Contents/PkgInfo",
    "Contents/MacOS/InterviewCopilot",
    "Contents/Resources/app.asar",
    "Contents/Resources/icon.icns",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/vk_swiftshader_icd.json",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/MainMenu.nib",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/chrome_100_percent.pak",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/chrome_200_percent.pak",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/icudtl.dat",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/resources.pak",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/v8_context_snapshot.arm64.bin",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/v8_context_snapshot.x64.bin",
    "Contents/Frameworks/Mantle.framework/Versions/A/Mantle",
    "Contents/Frameworks/Mantle.framework/Versions/A/Resources/Info.plist",
    "Contents/Frameworks/ReactiveObjC.framework/Versions/A/ReactiveObjC",
    "Contents/Frameworks/ReactiveObjC.framework/Versions/A/Resources/Info.plist",
    "Contents/Frameworks/Squirrel.framework/Versions/A/Squirrel",
    "Contents/Frameworks/Squirrel.framework/Versions/A/Resources/Info.plist",
    "Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt"
  ].map((entry) => entry.toLocaleLowerCase("en-US"))
)
const APPROVED_SYMLINKS = new Map(
  Object.entries({
    "Contents/Frameworks/Electron Framework.framework/Electron Framework":
      "Versions/Current/Electron Framework",
    "Contents/Frameworks/Electron Framework.framework/Resources":
      "Versions/Current/Resources",
    "Contents/Frameworks/Electron Framework.framework/Libraries":
      "Versions/Current/Libraries",
    "Contents/Frameworks/Electron Framework.framework/Helpers":
      "Versions/Current/Helpers",
    "Contents/Frameworks/Electron Framework.framework/Versions/Current": "A",
    "Contents/Frameworks/Mantle.framework/Mantle": "Versions/Current/Mantle",
    "Contents/Frameworks/Mantle.framework/Resources": "Versions/Current/Resources",
    "Contents/Frameworks/Mantle.framework/Versions/Current": "A",
    "Contents/Frameworks/ReactiveObjC.framework/ReactiveObjC":
      "Versions/Current/ReactiveObjC",
    "Contents/Frameworks/ReactiveObjC.framework/Resources":
      "Versions/Current/Resources",
    "Contents/Frameworks/ReactiveObjC.framework/Versions/Current": "A",
    "Contents/Frameworks/Squirrel.framework/Squirrel":
      "Versions/Current/Squirrel",
    "Contents/Frameworks/Squirrel.framework/Resources":
      "Versions/Current/Resources",
    "Contents/Frameworks/Squirrel.framework/Versions/Current": "A"
  }).map(([entry, target]) => [entry.toLocaleLowerCase("en-US"), target])
)

function normalizeBundlePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\/+/, "")
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex")
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath))
}

function walkBundle(directory, root, entries) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    const relativePath = normalizeBundlePath(path.relative(root, entryPath))
    const stats = fs.lstatSync(entryPath)
    if (stats.isSymbolicLink()) {
      const target = fs.readlinkSync(entryPath)
      entries.push({
        path: relativePath,
        type: "symlink",
        size: Buffer.byteLength(target),
        sha256: sha256Bytes(target),
        target
      })
    } else if (stats.isDirectory()) {
      walkBundle(entryPath, root, entries)
    } else if (stats.isFile()) {
      entries.push({
        path: relativePath,
        type: "file",
        size: stats.size,
        sha256: sha256File(entryPath)
      })
    } else {
      entries.push({
        path: relativePath,
        type: "other",
        size: stats.size,
        sha256: null
      })
    }
  }
}

function isAllowedOuterFile(relativePath) {
  const normalized = relativePath.toLocaleLowerCase("en-US")
  if (EXACT_ALLOWED_OUTER_FILES.has(normalized)) return true
  if (
    /^contents\/frameworks\/interviewcopilot helper(?: \((?:gpu|plugin|renderer)\))?\.app\/contents\/(?:info\.plist|pkginfo|macos\/interviewcopilot helper(?: \((?:gpu|plugin|renderer)\))?)$/.test(
      normalized
    )
  ) {
    return true
  }
  const locale = normalized.match(
    /^contents\/frameworks\/electron framework\.framework\/versions\/a\/resources\/([^/]+)\.lproj\/locale\.pak$/
  )
  return Boolean(locale && ELECTRON_LOCALES.has(locale[1]))
}

function normalizedOuterEntries(bundleEntries, bundleFiles) {
  if (Array.isArray(bundleEntries)) return bundleEntries
  return (bundleFiles ?? []).map((relativePath) => ({
    path: relativePath,
    type: "file",
    size: 0,
    sha256: "fixture"
  }))
}

export function validatePackagedInventory({
  asarEntries,
  bundleEntries,
  bundleFiles
}) {
  const errors = []
  const normalizedEntries = asarEntries.map(normalizeBundlePath)
  const seenAsar = new Map()
  for (const entry of normalizedEntries) {
    const lower = entry.toLocaleLowerCase("en-US")
    if (seenAsar.has(lower) && seenAsar.get(lower) !== entry) {
      errors.push(`case-colliding app.asar paths: ${seenAsar.get(lower)} and ${entry}`)
    }
    seenAsar.set(lower, entry)
    const [root] = entry.split("/")
    if (!ALLOWED_ASAR_ROOTS.has(root)) {
      errors.push(`unexpected packaged application path: ${entry}`)
    }
    if (FORBIDDEN_PROJECT_ROOTS.has(root)) {
      errors.push(`project source root leaked into app.asar: ${entry}`)
    }
    if (root !== "node_modules" && TEST_SOURCE_PATTERN.test(entry)) {
      errors.push(`test/spec source leaked into app.asar: ${entry}`)
    }
    if (root !== "node_modules" && RAW_SOURCE_PATTERN.test(entry)) {
      errors.push(`raw runtime source leaked into app.asar: ${entry}`)
    }
    if (root !== "node_modules" && /\.map$/i.test(entry)) {
      errors.push(`source map leaked into app.asar: ${entry}`)
    }
    if (/scripts\/verification\//i.test(entry)) {
      errors.push(`verification source leaked into app.asar: ${entry}`)
    }
  }

  if (!normalizedEntries.includes("dist-electron/main.js")) {
    errors.push("compiled Electron main entry is missing from app.asar")
  }
  if (!normalizedEntries.includes("dist/index.html")) {
    errors.push("compiled renderer entry is missing from app.asar")
  }

  const observedOuterCase = new Map()
  const outerEntries = normalizedOuterEntries(bundleEntries, bundleFiles)
  for (const entry of outerEntries) {
    const normalized = normalizeBundlePath(entry.path)
    const lower = normalized.toLocaleLowerCase("en-US")
    if (observedOuterCase.has(lower) && observedOuterCase.get(lower) !== normalized) {
      errors.push(
        `case-colliding outer bundle paths: ${observedOuterCase.get(lower)} and ${normalized}`
      )
    }
    observedOuterCase.set(lower, normalized)
    if (
      FORBIDDEN_OUTER_PATTERN.test(normalized) ||
      TEST_SOURCE_PATTERN.test(normalized) ||
      RAW_SOURCE_PATTERN.test(normalized)
    ) {
      errors.push(`forbidden outer bundle resource: ${normalized}`)
    }
    if (entry.type === "symlink") {
      const expectedTarget = APPROVED_SYMLINKS.get(lower)
      if (!expectedTarget || entry.target !== expectedTarget) {
        errors.push(`unexpected outer bundle symlink: ${normalized}`)
      }
    } else if (entry.type !== "file" || !isAllowedOuterFile(normalized)) {
      errors.push(`unexpected outer bundle resource: ${normalized}`)
    }
  }
  if (!outerEntries.some((entry) => normalizeBundlePath(entry.path) === "Contents/Resources/app.asar")) {
    errors.push("outer application bundle is missing Contents/Resources/app.asar")
  }
  return [...new Set(errors)]
}

function parseArguments(argv) {
  if (argv.length === 2 && argv[0] === "--app" && argv[1]) {
    return { app: path.resolve(argv[1]) }
  }
  throw new Error("usage: package-inventory.mjs --app <InterviewCopilot.app>")
}

export function inspectPackagedApplication(appPath) {
  const asarPath = path.join(appPath, "Contents/Resources/app.asar")
  if (!fs.existsSync(asarPath)) {
    throw new Error(`packaged app.asar is missing: ${asarPath}`)
  }
  const asarEntries = listPackage(asarPath).map(normalizeBundlePath).sort()
  const bundleEntries = []
  walkBundle(appPath, appPath, bundleEntries)
  bundleEntries.sort((left, right) => left.path.localeCompare(right.path))
  const errors = validatePackagedInventory({ asarEntries, bundleEntries })
  return {
    schemaVersion: 2,
    appPath,
    asarPath,
    asarSha256: sha256File(asarPath),
    asarEntries,
    bundleEntries,
    bundleFiles: bundleEntries.map((entry) => entry.path),
    errors
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  const inventory = inspectPackagedApplication(options.app)
  const outputDirectory =
    process.env.VERIFICATION_ARTIFACT_DIRECTORY ?? path.dirname(options.app)
  const outputPath = path.join(outputDirectory, "package-inventory.json")
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`)
  if (inventory.errors.length > 0) {
    throw new Error(inventory.errors.join("\n"))
  }
  console.log(
    `Packaged inventory accepted: ${inventory.asarEntries.length} asar entries, ` +
      `${inventory.bundleEntries.length} outer entries, asar sha256=${inventory.asarSha256}, ` +
      `inventory=${path.relative(REPOSITORY_ROOT, outputPath)}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
