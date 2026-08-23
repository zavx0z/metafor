import {readdirSync, readFileSync} from "node:fs"
import {resolve} from "node:path"
import {API, type Diagnostic, type Snapshot} from "typescript/unstable/async"

const root = resolve(import.meta.dir, "../..")
const configPath = resolve(root, "tsconfig.json")

const typingFiles = readdirSync(resolve(root, "tests"), {recursive: true})
  .filter((entry): entry is string => typeof entry === "string" && entry.endsWith("typing.spec.ts"))
  .map((entry) => resolve(root, "tests", entry))
  .sort()

const sourceByFile = new Map(typingFiles.map((fileName) => [fileName, readFileSync(fileName, "utf8")]))
const overrideByFile = new Map<string, string>()
const api = new API({
  cwd: root,
  fs: {
    readFile(fileName) {
      return overrideByFile.get(resolve(fileName))
    },
  },
})

let snapshot: Snapshot = await api.updateSnapshot({openProjects: [configPath]})

const project = () => snapshot.getProject(configPath) ?? snapshot.getProjects()[0]

const diagnosticsFor = async (fileName: string): Promise<readonly Diagnostic[]> => {
  const configured = project()
  if (!configured) throw new Error("Strict typing project was not opened")
  return [
    ...await configured.program.getSyntacticDiagnostics(fileName),
    ...await configured.program.getSemanticDiagnostics(fileName),
  ]
}

const updateFile = async (fileName: string): Promise<void> => {
  const previous = snapshot
  snapshot = await api.updateSnapshot({fileChanges: {changed: [fileName]}})
  await previous.dispose()
}

const formatDiagnostic = (diagnostic: Diagnostic): string => {
  if (!diagnostic.fileName) return `TS${diagnostic.code}: ${diagnostic.text}`
  const source = overrideByFile.get(resolve(diagnostic.fileName)) ??
    sourceByFile.get(resolve(diagnostic.fileName)) ??
    readFileSync(diagnostic.fileName, "utf8")
  const prefix = source.slice(0, diagnostic.pos)
  const lines = prefix.split(/\r?\n/)
  return `${diagnostic.fileName}:${lines.length}:${(lines.at(-1)?.length ?? 0) + 1} TS${diagnostic.code}: ${diagnostic.text}`
}

const proof: Array<{file: string; line: number; diagnostics: number[]}> = []

for (const fileName of typingFiles) {
  const source = sourceByFile.get(fileName)!
  const baseline = await diagnosticsFor(fileName)
  if (baseline.length > 0) {
    throw new Error(`Type-test baseline is not clean:\n${baseline.map(formatDiagnostic).join("\n")}`)
  }

  const directives = [...source.matchAll(/\/\/\s*@ts-expect-error[^\r\n]*/g)]
  for (const directive of directives) {
    const start = directive.index!
    const text = directive[0]
    const mutated = `${source.slice(0, start)}${" ".repeat(text.length)}${source.slice(start + text.length)}`
    overrideByFile.set(fileName, mutated)
    await updateFile(fileName)

    const diagnostics = await diagnosticsFor(fileName)
    overrideByFile.delete(fileName)
    await updateFile(fileName)

    const line = source.slice(0, start).split(/\r?\n/).length
    if (diagnostics.length === 0) {
      throw new Error(`${fileName}:${line} does not suppress a real TypeScript error`)
    }
    proof.push({
      file: fileName.slice(root.length + 1),
      line,
      diagnostics: [...new Set(diagnostics.map((diagnostic) => diagnostic.code))].sort((a, b) => a - b),
    })
  }
}

if (proof.length === 0) throw new Error("No @ts-expect-error directives found in strict typing suites")

await snapshot.dispose()
await api.close()

process.stdout.write(`${JSON.stringify({schema: "metafor/type-expect-error-proof@1", ok: true, count: proof.length, proof}, null, 2)}\n`)
