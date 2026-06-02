import {chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync} from "node:fs"
import {basename, join, resolve} from "node:path"
import {spawnSync} from "node:child_process"

const VOSK_VERSION = "0.3.42"
const RU_MODEL_NAME = "vosk-model-small-ru-0.22"
const RU_MODEL_URLS = [
  `https://huggingface.co/rhasspy/vosk-models/resolve/main/ru/${RU_MODEL_NAME}.zip`,
  `https://alphacephei.com/vosk/models/${RU_MODEL_NAME}.zip`,
]
const RELEASE_BASE_URL = `https://github.com/alphacep/vosk-api/releases/download/v${VOSK_VERSION}`

type NativeAsset = {
  archiveName: string
  url: string
  libraryNames: string[]
  outputName: string
}

const nativeAssets: Record<NodeJS.Platform, NativeAsset | undefined> = {
  aix: undefined,
  android: undefined,
  darwin: {
    archiveName: `vosk-osx-${VOSK_VERSION}.zip`,
    url: `${RELEASE_BASE_URL}/vosk-osx-${VOSK_VERSION}.zip`,
    libraryNames: ["libvosk.dylib"],
    outputName: "libvosk.dylib",
  },
  freebsd: undefined,
  haiku: undefined,
  linux: {
    archiveName: `vosk-linux-x86_64-${VOSK_VERSION}.zip`,
    url: `${RELEASE_BASE_URL}/vosk-linux-x86_64-${VOSK_VERSION}.zip`,
    libraryNames: ["libvosk.so"],
    outputName: "libvosk.so",
  },
  openbsd: undefined,
  sunos: undefined,
  win32: {
    archiveName: `vosk-win64-${VOSK_VERSION}.zip`,
    url: `${RELEASE_BASE_URL}/vosk-win64-${VOSK_VERSION}.zip`,
    libraryNames: ["libvosk.dll", "vosk.dll"],
    outputName: "libvosk.dll",
  },
  cygwin: undefined,
  netbsd: undefined,
}

const root = resolve(import.meta.dir, "..")
const force = process.argv.includes("--force")
const downloadsDir = join(root, "tmp", "downloads")
const extractDir = join(root, "tmp", "extract", "vosk-assets")
const libDir = join(root, "lib")
const modelDir = join(root, "models", "ru")

await main()

async function main(): Promise<void> {
  const native = nativeAssets[process.platform]
  if (native === undefined) {
    throw new Error(`Unsupported platform for automatic Vosk asset install: ${process.platform}`)
  }

  mkdirSync(downloadsDir, {recursive: true})
  mkdirSync(libDir, {recursive: true})

  await installNativeLibrary(native)
  await installRussianModel()

  console.log("[voice:assets] done")
  console.log(`[voice:assets] VOSK_LIB=${join(libDir, native.outputName)}`)
  console.log(`[voice:assets] VOSK_MODEL=${modelDir}`)
}

async function installNativeLibrary(native: NativeAsset): Promise<void> {
  const outputPath = join(libDir, native.outputName)
  if (!force && existsSync(outputPath)) {
    console.log(`[voice:assets] native library exists: ${relative(outputPath)}`)
    return
  }

  const archivePath = join(downloadsDir, native.archiveName)
  downloadFile(process.env.VOSK_LIB_URL ? [process.env.VOSK_LIB_URL] : [native.url], archivePath)
  const unpackedDir = await extractArchive(archivePath, `lib-${process.platform}`)
  const sourcePath = findFirstFile(unpackedDir, native.libraryNames)
  if (sourcePath === null) {
    throw new Error(`Native Vosk library not found in ${archivePath}; expected one of: ${native.libraryNames.join(", ")}`)
  }

  copyFileSync(sourcePath, outputPath)
  if (process.platform !== "win32") chmodSync(outputPath, 0o755)
  console.log(`[voice:assets] installed native library: ${relative(outputPath)}`)
}

async function installRussianModel(): Promise<void> {
  const modelMarker = join(modelDir, "conf", "model.conf")
  if (!force && existsSync(modelMarker)) {
    console.log(`[voice:assets] Russian model exists: ${relative(modelDir)}`)
    return
  }

  const archivePath = join(downloadsDir, `${RU_MODEL_NAME}.zip`)
  downloadFile(process.env.VOSK_MODEL_URL ? [process.env.VOSK_MODEL_URL] : RU_MODEL_URLS, archivePath)
  const unpackedDir = await extractArchive(archivePath, "model-ru")
  const sourceDir = findFirstDirectory(unpackedDir, RU_MODEL_NAME)
  if (sourceDir === null) {
    throw new Error(`Russian Vosk model directory ${RU_MODEL_NAME} not found in ${archivePath}`)
  }

  if (force && existsSync(modelDir)) rmSync(modelDir, {recursive: true, force: true})
  mkdirSync(modelDir, {recursive: true})
  cpSync(sourceDir, modelDir, {recursive: true, force: true})
  console.log(`[voice:assets] installed Russian model: ${relative(modelDir)}`)
}

function downloadFile(urls: string[], outputPath: string): void {
  if (!force && isUsableFile(outputPath)) {
    console.log(`[voice:assets] using cached download: ${relative(outputPath)}`)
    return
  }

  let lastError: Error | null = null
  for (const url of urls) {
    try {
      downloadFileFromUrl(url, outputPath)
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[voice:assets] download failed, trying next source: ${lastError.message}`)
    }
  }
  throw lastError ?? new Error(`No download URLs configured for ${outputPath}`)
}

function downloadFileFromUrl(url: string, outputPath: string): void {
  console.log(`[voice:assets] downloading ${url}`)
  const partialPath = `${outputPath}.partial`
  rmSync(partialPath, {force: true})

  const curl = spawnSync("curl", [
    "-fL",
    "--retry", "3",
    "--retry-delay", "2",
    "--connect-timeout", "20",
    "--max-time", "600",
    "--speed-limit", "10240",
    "--speed-time", "30",
    "--output", partialPath,
    url,
  ], {stdio: "inherit"})
  if (curl.error !== undefined) {
    throw new Error(`Failed to run curl. Install curl or download ${url} to ${outputPath}. ${curl.error.message}`)
  }
  if (curl.status !== 0) {
    rmSync(partialPath, {force: true})
    throw new Error(`curl failed with exit code ${curl.status ?? "unknown"}: ${url}`)
  }
  if (!isUsableFile(partialPath)) {
    rmSync(partialPath, {force: true})
    throw new Error(`Downloaded empty file: ${url}`)
  }
  renameSync(partialPath, outputPath)
  console.log(`[voice:assets] saved: ${relative(outputPath)} (${formatBytes(statSync(outputPath).size)})`)
}

async function extractArchive(archivePath: string, name: string): Promise<string> {
  const targetDir = join(extractDir, name)
  rmSync(targetDir, {recursive: true, force: true})
  mkdirSync(targetDir, {recursive: true})

  const unzip = spawnSync("unzip", ["-q", "-o", archivePath, "-d", targetDir], {stdio: "inherit"})
  if (unzip.error !== undefined) {
    throw new Error(`Failed to run unzip. Install unzip or unpack ${basename(archivePath)} manually. ${unzip.error.message}`)
  }
  if (unzip.status !== 0) throw new Error(`unzip failed for ${archivePath}`)
  return targetDir
}

function findFirstFile(dir: string, names: string[]): string | null {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isFile() && names.includes(entry.name)) return path
    if (entry.isDirectory()) {
      const found = findFirstFile(path, names)
      if (found !== null) return found
    }
  }
  return null
}

function findFirstDirectory(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isDirectory() && entry.name === name) return path
    if (entry.isDirectory()) {
      const found = findFirstDirectory(path, name)
      if (found !== null) return found
    }
  }
  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isUsableFile(path: string): boolean {
  try {
    return statSync(path).isFile() && statSync(path).size > 0
  } catch {
    return false
  }
}

function relative(path: string): string {
  const stat = existsSync(path) ? statSync(path) : null
  return `${path.replace(`${root}/`, "pkg/voice/")}${stat?.isDirectory() ? "/" : ""}`
}
