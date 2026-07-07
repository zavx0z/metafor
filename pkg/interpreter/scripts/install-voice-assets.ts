import {copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync} from "node:fs"
import {createHash} from "node:crypto"
import {join, resolve} from "node:path"
import {spawnSync} from "node:child_process"

const SILERO_MODEL_URL = "https://raw.githubusercontent.com/snakers4/silero-vad/master/src/silero_vad/data/silero_vad_16k_op15.onnx"
const SILERO_MODEL_NAME = "silero_vad_16k_op15.onnx"
const SILERO_MODEL_SHA256 = "7ed98ddbad84ccac4cd0aeb3099049280713df825c610a8ed34543318f1b2c49"
const ORT_WASM_NAME = "ort-wasm-simd-threaded.wasm"

const root = resolve(import.meta.dir, "..")
const repoRoot = resolve(root, "..", "..")
const force = process.argv.includes("--force")
const downloadsDir = join(root, "tmp", "downloads")
const modelDir = join(root, "web", "assets", "voice", "models")
const ortDir = join(root, "web", "assets", "voice", "ort")

await main()

async function main(): Promise<void> {
  mkdirSync(downloadsDir, {recursive: true})
  mkdirSync(modelDir, {recursive: true})
  mkdirSync(ortDir, {recursive: true})

  installSileroModel()
  installOrtWasm()

  console.log("[interpreter:voice:assets] done")
  console.log(`[interpreter:voice:assets] SILERO_MODEL=${relative(join(modelDir, SILERO_MODEL_NAME))}`)
  console.log(`[interpreter:voice:assets] ORT_WASM=${relative(join(ortDir, ORT_WASM_NAME))}`)
}

function installSileroModel(): void {
  const outputPath = join(modelDir, SILERO_MODEL_NAME)
  if (!force && isUsableFile(outputPath) && sha256(outputPath) === SILERO_MODEL_SHA256) {
    console.log(`[interpreter:voice:assets] Silero model exists: ${relative(outputPath)}`)
    return
  }

  const downloadPath = join(downloadsDir, SILERO_MODEL_NAME)
  downloadFile(SILERO_MODEL_URL, downloadPath)
  const actualHash = sha256(downloadPath)
  if (actualHash !== SILERO_MODEL_SHA256) {
    throw new Error(`Silero model checksum mismatch: expected ${SILERO_MODEL_SHA256}, got ${actualHash}`)
  }
  copyFileSync(downloadPath, outputPath)
  console.log(`[interpreter:voice:assets] installed Silero model: ${relative(outputPath)}`)
}

function installOrtWasm(): void {
  const sourcePath = join(repoRoot, "node_modules", "onnxruntime-web", "dist", ORT_WASM_NAME)
  if (!isUsableFile(sourcePath)) {
    throw new Error(`ONNX Runtime wasm not found: ${sourcePath}. Run bun install first.`)
  }

  const outputPath = join(ortDir, ORT_WASM_NAME)
  if (!force && isUsableFile(outputPath) && sha256(outputPath) === sha256(sourcePath)) {
    console.log(`[interpreter:voice:assets] ONNX Runtime wasm exists: ${relative(outputPath)}`)
    return
  }

  copyFileSync(sourcePath, outputPath)
  console.log(`[interpreter:voice:assets] installed ONNX Runtime wasm: ${relative(outputPath)}`)
}

function downloadFile(url: string, outputPath: string): void {
  if (!force && isUsableFile(outputPath) && sha256(outputPath) === SILERO_MODEL_SHA256) {
    console.log(`[interpreter:voice:assets] using cached download: ${relative(outputPath)}`)
    return
  }

  console.log(`[interpreter:voice:assets] downloading ${url}`)
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
  console.log(`[interpreter:voice:assets] saved: ${relative(outputPath)} (${formatBytes(statSync(outputPath).size)})`)
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
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
  return path.replace(`${root}/`, "pkg/interpreter/")
}
