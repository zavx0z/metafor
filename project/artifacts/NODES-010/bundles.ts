import {execFileSync} from "node:child_process"
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {dirname, join, relative, resolve} from "node:path"
import {fileURLToPath} from "node:url"

const directory = dirname(fileURLToPath(import.meta.url))
const repository = resolve(directory, "../../..")
const fixtureRoot = join(repository, "pkg/nodes/fixtures")

const matrix = [
  entry("core", "core-consumer.ts", [], ["NO_LEGAL_LAYOUT", "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT", "NodeSystemSurface", "struct GlobalUniforms"]),
  entry("fixed-layout", "fixed-layout-consumer.ts", ["Port has conflicting edge roles", "NO_LEGAL_LAYOUT"], ["NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT", "NodeSystemSurface"]),
  entry("adaptive-layout", "adaptive-layout-consumer.ts", ["NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT", "NO_LEGAL_LAYOUT"], ["Port has conflicting edge roles", "NodeSystemSurface"]),
  entry("fixed-card", "fixed-card-consumer.ts", ["NO_LEGAL_LAYOUT"], ["NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT", "NodeSystemSurface", "struct GlobalUniforms"]),
  entry("adaptive-card", "adaptive-card-consumer.ts", ["NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT", "NO_LEGAL_LAYOUT"], ["source must be out/EAST", "NodeSystemSurface", "struct GlobalUniforms"]),
  entry("custom-surface", "custom-positioned-consumer.ts", ["NodeSystemSurface", "struct GlobalUniforms"], ["NO_LEGAL_LAYOUT", "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT", "NodeInspectorSurface"]),
  entry("fixed-worker-executor", "fixed-layout-worker-executor-consumer.ts", ["Port has conflicting edge roles", "NO_LEGAL_LAYOUT"], ["NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT"]),
  entry("adaptive-worker-executor", "adaptive-layout-worker-executor-consumer.ts", ["NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT", "NO_LEGAL_LAYOUT"], ["Port has conflicting edge roles"]),
  entry("fixed-worker-client", "fixed-layout-worker-client-consumer.ts", ["Stale layout generation"], ["NO_LEGAL_LAYOUT", "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT", "Port has conflicting edge roles"]),
  entry("adaptive-worker-client", "adaptive-layout-worker-client-consumer.ts", ["Stale layout generation"], ["NO_LEGAL_LAYOUT", "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT", "Port has conflicting edge roles"]),
]

const bundles = matrix.map(build)
const report = {
  schemaVersion: 1,
  task: "NODES-010",
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {cwd: repository, encoding: "utf8"}).trim(),
  bun: process.versions.bun,
  target: "browser",
  format: "esm",
  minified: true,
  bundles,
}

const output = `${JSON.stringify(report, null, 2)}\n`
writeFileSync(join(directory, "bundles-current.json"), output)
process.stdout.write(output)

type MatrixEntry = Readonly<{
  name: string
  fixture: string
  requiredSymbols: readonly string[]
  forbiddenSymbols: readonly string[]
}>

function entry(
  name: string,
  fixture: string,
  requiredSymbols: readonly string[],
  forbiddenSymbols: readonly string[],
): MatrixEntry {
  return {name, fixture, requiredSymbols, forbiddenSymbols}
}

function build(item: MatrixEntry) {
  const temporary = mkdtempSync(join(tmpdir(), "nodes-010-bundle-"))
  const output = join(temporary, `${item.name}.js`)
  try {
    execFileSync(process.execPath, [
      "build",
      join(fixtureRoot, item.fixture),
      "--target=browser",
      "--format=esm",
      "--minify",
      `--outfile=${output}`,
    ], {cwd: repository, stdio: "pipe"})
    const bytes = readFileSync(output)
    const source = bytes.toString("utf8")
    const required = Object.fromEntries(item.requiredSymbols.map((symbol) => [symbol, source.includes(symbol)]))
    const forbidden = item.forbiddenSymbols.filter((symbol) => source.includes(symbol))
    if (Object.values(required).some((present) => !present)) {
      throw new Error(`${item.name} is missing required symbols: ${JSON.stringify(required)}`)
    }
    if (forbidden.length > 0) throw new Error(`${item.name} contains forbidden symbols: ${forbidden.join(", ")}`)
    return {
      name: item.name,
      fixture: relative(repository, join(fixtureRoot, item.fixture)),
      entrypointSha256: hash(readFileSync(join(fixtureRoot, item.fixture))),
      bundleSha256: hash(bytes),
      rawBytes: bytes.byteLength,
      gzipBytes: Bun.gzipSync(bytes).byteLength,
      requiredSymbols: required,
      forbiddenSymbols: Object.fromEntries(item.forbiddenSymbols.map((symbol) => [symbol, false])),
    }
  } finally {
    rmSync(temporary, {recursive: true, force: true})
  }
}

function hash(value: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}
