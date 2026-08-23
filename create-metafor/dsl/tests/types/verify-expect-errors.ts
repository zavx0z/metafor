import {readdirSync, readFileSync} from "node:fs"
import {resolve} from "node:path"
import ts from "typescript"

const root = resolve(import.meta.dir, "../..")
const configPath = resolve(root, "tsconfig.json")
const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"))
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root)
if (parsed.errors.length > 0) {
  throw new Error(ts.formatDiagnostics(parsed.errors, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  }))
}

const typingFiles = readdirSync(resolve(root, "tests"), {recursive: true})
  .filter((entry): entry is string => typeof entry === "string" && entry.endsWith("typing.spec.ts"))
  .map((entry) => resolve(root, "tests", entry))
  .sort()

const sourceByFile = new Map(typingFiles.map((fileName) => [fileName, readFileSync(fileName, "utf8")]))
const overrideByFile = new Map<string, string>()
const versionByFile = new Map<string, number>()

const service = ts.createLanguageService({
  getCompilationSettings: () => parsed.options,
  getScriptFileNames: () => parsed.fileNames,
  getScriptVersion: (fileName) => String(versionByFile.get(resolve(fileName)) ?? 0),
  getScriptSnapshot: (fileName) => {
    const absolute = resolve(fileName)
    const text = overrideByFile.get(absolute) ?? ts.sys.readFile(absolute)
    return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
  },
  getCurrentDirectory: () => root,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
})

const diagnosticsFor = (fileName: string): ts.Diagnostic[] => [
  ...service.getSyntacticDiagnostics(fileName),
  ...service.getSemanticDiagnostics(fileName),
]

const formatDiagnostic = (diagnostic: ts.Diagnostic): string => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  if (!diagnostic.file || diagnostic.start === undefined) return `TS${diagnostic.code}: ${message}`
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  return `${diagnostic.file.fileName}:${location.line + 1}:${location.character + 1} TS${diagnostic.code}: ${message}`
}

const proof: Array<{file: string; line: number; diagnostics: number[]}> = []

for (const fileName of typingFiles) {
  const source = sourceByFile.get(fileName)!
  const baseline = diagnosticsFor(fileName)
  if (baseline.length > 0) {
    throw new Error(`Type-test baseline is not clean:\n${baseline.map(formatDiagnostic).join("\n")}`)
  }

  const directives = [...source.matchAll(/\/\/\s*@ts-expect-error[^\r\n]*/g)]
  for (const directive of directives) {
    const start = directive.index!
    const text = directive[0]
    const mutated = `${source.slice(0, start)}${" ".repeat(text.length)}${source.slice(start + text.length)}`
    overrideByFile.set(fileName, mutated)
    versionByFile.set(fileName, (versionByFile.get(fileName) ?? 0) + 1)

    const diagnostics = diagnosticsFor(fileName)
    overrideByFile.delete(fileName)
    versionByFile.set(fileName, (versionByFile.get(fileName) ?? 0) + 1)

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

process.stdout.write(`${JSON.stringify({schema: "metafor/type-expect-error-proof@1", ok: true, count: proof.length, proof}, null, 2)}\n`)
