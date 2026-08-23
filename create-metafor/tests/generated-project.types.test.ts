import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {API, type Diagnostic} from "typescript/unstable/async"

import {
  generateMetaFile,
  generateMetaforTypesFile,
  generateTsconfigFile,
} from "../src/generators.ts"

const fixtureRoot = join(import.meta.dir, "fixtures", "generated-project")
const typeRoots = resolve(import.meta.dir, "../../node_modules/@types")

type CompileResult = {
  diagnostics: readonly Diagnostic[]
  sourceFiles: readonly string[]
}

async function fixture(name: string): Promise<string> {
  return await readFile(join(fixtureRoot, name), "utf8")
}

async function compileGeneratedProject(
  declaration: string,
  contracts?: Readonly<Record<string, string>>,
): Promise<CompileResult> {
  const project = await mkdtemp(join(tmpdir(), "create-metafor-types-"))
  const actions = join(project, "actions")

  try {
    await mkdir(actions)
    const contractFiles = contracts ?? {"contract.ts": await fixture("contract.ts.txt")}
    const generatedConfig = JSON.parse(generateTsconfigFile()) as {
      compilerOptions: Record<string, unknown>
    }
    generatedConfig.compilerOptions.typeRoots = [typeRoots]
    generatedConfig.compilerOptions.skipLibCheck = false
    await Promise.all([
      writeFile(join(project, "metafor.d.ts"), declaration),
      writeFile(join(project, "meta.ts"), generateMetaFile("generated", "Generated", "Error")),
      ...Object.entries(contractFiles).map(([name, source]) => writeFile(join(project, name), source)),
      writeFile(join(project, "tsconfig.json"), JSON.stringify(generatedConfig)),
      writeFile(join(actions, "start.ts"), await fixture("actions/start.ts.txt")),
      writeFile(join(actions, "release.ts"), await fixture("actions/release.ts.txt")),
      writeFile(join(actions, "probe.ts"), await fixture("actions/probe.ts.txt")),
    ])

    const configPath = join(project, "tsconfig.json")
    const api = new API({cwd: project})
    const snapshot = await api.updateSnapshot({openProjects: [configPath]})
    try {
      const configured = snapshot.getProject(configPath) ?? snapshot.getProjects()[0]
      if (!configured) throw new Error("Generated TypeScript project was not opened")
      const program = configured.program
      return {
        diagnostics: [
          ...await program.getConfigFileParsingDiagnostics(),
          ...await program.getProgramDiagnostics(),
          ...await program.getGlobalDiagnostics(),
          ...await program.getSyntacticDiagnostics(),
          ...await program.getBindDiagnostics(),
          ...await program.getSemanticDiagnostics(),
        ],
        sourceFiles: await program.getSourceFileNames(),
      }
    } finally {
      await snapshot.dispose()
      await api.close()
    }
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map((diagnostic) =>
    `${diagnostic.fileName ?? "<global>"}: TS${diagnostic.code}: ${diagnostic.text}`
  ).join("\n")
}

test("generated project preserves the strict local MetaFor contract", async () => {
  const result = await compileGeneratedProject(generateMetaforTypesFile())

  expect(result.sourceFiles.some((file) => file.endsWith("/metafor.d.ts"))).toBe(true)
  expect(result.sourceFiles.some((file) => file.endsWith("/meta.ts"))).toBe(true)
  expect(result.sourceFiles.some((file) => file.endsWith("/contract.ts"))).toBe(true)
  expect(formatDiagnostics(result.diagnostics)).toBe("")
}, 30_000)

test("compile fixture reports an unused expectation when Update is weakened", async () => {
  const declaration = generateMetaforTypesFile()
  const weakened = declaration.replace(
    "values: Partial<MetaForValues<Fields>>,\n) => Partial<MetaForValues<Fields>>",
    "values: Record<string, unknown>,\n) => Record<string, unknown>",
  )

  expect(weakened).not.toBe(declaration)

  const result = await compileGeneratedProject(weakened)
  expect(result.diagnostics.some((diagnostic) => diagnostic.code === 2578)).toBe(true)
}, 30_000)

test("every generated @ts-expect-error suppresses a real compiler error", async () => {
  const contract = await fixture("contract.ts.txt")
  const directives = [...contract.matchAll(/\/\/\s*@ts-expect-error[^\r\n]*/g)]
  expect(directives.length).toBeGreaterThan(0)

  const mutations = Object.fromEntries(directives.map((directive, index) => {
    const start = directive.index!
    const text = directive[0]
    const mutated = `${contract.slice(0, start)}${" ".repeat(text.length)}${contract.slice(start + text.length)}`
    return [`contract-mutant-${index}.ts`, mutated]
  }))
  const result = await compileGeneratedProject(generateMetaforTypesFile(), mutations)

  const proof: Array<{line: number; diagnostics: number[]}> = []
  directives.forEach((directive, index) => {
    const name = `contract-mutant-${index}.ts`
    const diagnostics = result.diagnostics.filter((diagnostic) =>
      diagnostic.fileName?.endsWith(`/${name}`) && diagnostic.code !== 2578,
    )
    expect(diagnostics.length).toBeGreaterThan(0)
    proof.push({
      line: contract.slice(0, directive.index!).split(/\r?\n/).length,
      diagnostics: [...new Set(diagnostics.map((diagnostic) => diagnostic.code))].sort((left, right) => left - right),
    })
  })

  expect(proof).toHaveLength(directives.length)
}, 30_000)
