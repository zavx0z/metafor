import {lstat, mkdir, realpath} from "node:fs/promises"
import {pathToFileURL} from "node:url"
import {dirname, extname, isAbsolute, join, relative, resolve, sep} from "node:path"
import {isGeneratedPackageArtifactKey, type PackageArtifactKey} from "./identity/artifact"
import {packageVersionArtifactPath} from "./identity/artifact-path"
import {packagePublicArtifactOutput} from "./source"
import {sourceMapArtifact} from "./source-map"
import type {PackageBuildReportOutput, PackageOwner} from "./contracts"

type Binding = {artifact: PackageArtifactKey; load: "eager" | "lazy"; output: PackageBuildReportOutput}
type Target = {output: {mode: "single"; artifact: string} | {mode: "multi"; outdir: string}}
type Edit = {start: number; end: number; text: string}

/** Materializes executable aliases in the same relative graph used by storage. */
export async function materializeServerBindings(owner: PackageOwner, execution: Target, bindings: readonly Binding[], development: boolean): Promise<Binding[]> {
  const root = resolve(execution.output.mode === "multi" ? execution.output.outdir : dirname(execution.output.artifact))
  const versionPath = (binding: Binding) => {
    const source = owner.sources.find(source => source.artifact === binding.artifact)
    const extension = source && binding.artifact !== "." && !isGeneratedPackageArtifactKey(binding.artifact)
      ? extname(packagePublicArtifactOutput(binding.artifact, source.source)) : undefined
    return packageVersionArtifactPath(owner.env, binding.artifact, extension)
  }
  const canonical = new Map<string, string>()
  for (const binding of bindings) {
    if (!canonical.has(binding.output.relative) || !isGeneratedPackageArtifactKey(binding.artifact)) canonical.set(binding.output.relative, versionPath(binding))
  }
  const result: Binding[] = []
  for (const binding of bindings) {
    const output = binding.output
    const address = versionPath(binding)
    const target = binding.artifact === "." && execution.output.mode === "single" ? execution.output.artifact : join(root, address)
    await safeDestination(root, target)
    const javascript = output.path.endsWith(".js") && (output.kind === "entry-point" || output.kind === "chunk")
    if (javascript) {
      const source = await Bun.file(output.path).text()
      const edits: Edit[] = []
      for (const [native, destination] of canonical) {
        const from = modulePath(relative(dirname(output.relative), native))
        const to = modulePath(relative(dirname(address), destination))
        if (from === to) continue
        // Only exact compiler-derived graph address literals are rewritten.
        // Bare and builtin imports retain their own resolution contracts.
        for (const quote of ["\"", "'"]) {
          const literal = `${quote}${from}${quote}`
          let start = source.indexOf(literal)
          while (start >= 0) {
            edits.push({start, end: start + literal.length, text: JSON.stringify(to)})
            start = source.indexOf(literal, start + literal.length)
          }
        }
      }
      edits.sort((left, right) => left.start - right.start)
      for (let index = 1; index < edits.length; index++) if (edits[index]!.start < edits[index - 1]!.end) throw new Error("Overlapping server artifact relocation")
      let relocated = source
      for (const edit of [...edits].reverse()) relocated = relocated.slice(0, edit.start) + edit.text + relocated.slice(edit.end)
      const map = Bun.file(sourceMapArtifact(output.path))
      const sourceMap = development && await map.exists() ? await map.json() : undefined
      if (sourceMap) {
        relocateMappings(sourceMap, source, edits)
        // Bun's in-memory maps name inputs relative to the compiler cwd, not
        // the subsequently selected map file. Keep that source identity stable
        // when public and generated companions move to different directories.
        sourceMap.sources = sourceMap.sources.map((name: string) => {
          if (!isAbsolute(name) && (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(name) || name.startsWith("<"))) return name
          if (typeof sourceMap.sourceRoot === "string" && !isAbsolute(sourceMap.sourceRoot) && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(sourceMap.sourceRoot)) return new URL(name, `${sourceMap.sourceRoot.replace(/\/$/, "")}/`).href
          return pathToFileURL(resolve(owner.root, sourceMap.sourceRoot ?? "", name)).href
        })
        delete sourceMap.sourceRoot
        sourceMap.file = target.slice(target.lastIndexOf(sep) + 1)
        await safeDestination(root, sourceMapArtifact(target))
        await Bun.write(sourceMapArtifact(target), JSON.stringify(sourceMap))
      }
      await Bun.write(target, relocated)
    } else if (resolve(output.path) !== resolve(target)) await Bun.write(target, Bun.file(output.path))
    result.push({...binding, output: {...output, path: target}})
  }
  return result
}

function modulePath(path: string) { const value = path.split(sep).join("/"); return value.startsWith("./") || value.startsWith("../") ? value : `./${value}` }

async function safeDestination(root: string, target: string) {
  const suffix = relative(root, target)
  if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) throw new Error("Server artifact escapes staging root")
  const canonicalRoot = await realpath(root)
  let directory = root
  const parts = suffix.split(sep)
  for (const part of parts.slice(0, -1)) {
    directory = join(directory, part)
    const stat = await lstat(directory).catch(error => {if (error.code === "ENOENT") return undefined; throw error})
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error("Server artifact parent must be a real directory")
    if (!stat) await mkdir(directory)
  }
  const existing = await lstat(target).catch(error => {if (error.code === "ENOENT") return undefined; throw error})
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error("Server artifact target must be a regular file")
  const actual = relative(canonicalRoot, await realpath(dirname(target)))
  if (actual === ".." || actual.startsWith(`..${sep}`) || isAbsolute(actual)) throw new Error("Server artifact parent escapes staging root")
}

// Relocation changes generated columns only. Source/name deltas and the
// embedded original source texts remain the compiler's verified map.
function relocateMappings(map: {mappings: string}, source: string, edits: readonly Edit[]) {
  const byLine = new Map<number, Array<{start: number; end: number; delta: number; length: number}>>()
  for (const edit of edits) {
    const prefix = source.slice(0, edit.start)
    const line = prefix.split("\n").length - 1
    const column = edit.start - prefix.lastIndexOf("\n") - 1
    const values = byLine.get(line) ?? []
    values.push({start: column, end: column + edit.end - edit.start, delta: edit.text.length - (edit.end - edit.start), length: edit.text.length})
    byLine.set(line, values)
  }
  map.mappings = map.mappings.split(";").map((line, index) => {
    const shifts = byLine.get(index)
    if (!shifts || !line) return line
    let originalColumn = 0
    let previousColumn = 0
    return line.split(",").map(segment => {
      const first = decodeFirst(segment)
      originalColumn += first.value
      let column = originalColumn
      for (const edit of shifts) {
        if (originalColumn >= edit.end) column += edit.delta
        else if (originalColumn > edit.start) column += Math.min(originalColumn - edit.start, edit.length) - (originalColumn - edit.start)
      }
      const encoded = encode(column - previousColumn)
      previousColumn = column
      return encoded + segment.slice(first.end)
    }).join(",")
  }).join(";")
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
function decodeFirst(segment: string) {
  let value = 0, shift = 0, index = 0, digit: number
  do {
    digit = alphabet.indexOf(segment[index++]!)
    if (digit < 0) throw new Error("Invalid source map generated column")
    value += (digit & 31) * 2 ** shift
    shift += 5
  } while (digit & 32)
  return {value: value & 1 ? -(value >>> 1) : value >>> 1, end: index}
}
function encode(value: number) {
  let raw = value < 0 ? -value * 2 + 1 : value * 2
  let result = ""
  do {let digit = raw % 32; raw = Math.floor(raw / 32); if (raw) digit |= 32; result += alphabet[digit]} while (raw)
  return result
}
