import {createHash} from "node:crypto"
import {lstat, readFile, realpath} from "node:fs/promises"
import {relative, sep} from "node:path"
import readScenario from "@zavx0z/storybook-specs-scenarios-reader"
import type {createDevelopmentCatalog} from "./development-catalog"

type Catalog = Pick<Awaited<ReturnType<typeof createDevelopmentCatalog>>, "contentNode">
type Progress = NonNullable<Parameters<typeof readScenario>[0]["onProgress"]>

export type DevelopmentScenarioSource = Readonly<{path: string; digest: string}>
export type DevelopmentScenarioListing = Readonly<{
  packageName: string
  nodeId: string
  sources: readonly DevelopmentScenarioSource[]
  revision: string
}>
export type DevelopmentScenarioRunInput = Readonly<{
  packageName: string
  nodeId?: string
  sourcePath: string
  expectedDigest: string
}>
export type DevelopmentScenarioReport = Readonly<{
  sourcePath: string
  digest: string
  exitCode: number
  source: string
  tests: readonly Readonly<{label: string; groupId: number | null; status: string; message: string | null}>[]
  groups: readonly Readonly<{id: number; parentId: number | null; label: string}>[]
  validation: Readonly<{status: string; checks: readonly Readonly<{
    rule: string
    status: string
    issues: readonly string[]
  }>[] }>
  stdout: string
  stderr: string
}>

/**
 * Выполняет только обнаруженный сценарий точного назначенного узла. `list`
 * фиксирует байты без запуска; `run` проверяет digest до и после штатного
 * Storybook reader, а закрытие отменяет все принадлежащие запросы.
 */
export function createDevelopmentScenarios(catalog: Catalog, artifacts: Readonly<{
  tracePreloadPath: string
  tsserverPath(): Promise<string>
}>) {
  const active = new Set<{controller: AbortController; task: Promise<unknown>}>()
  let closed = false
  const ready = () => {if (closed) throw new Error("Development scenarios are closed")}
  const source = async (packageName: string, nodeId?: string) => {
    ready()
    const selected = catalog.contentNode(packageName, nodeId)
    const ownerRoot = await realpath(selected.source.directory)
    const paths = selected.metadata.scenarioSpec?.sourcePaths ?? []
    const entries = await Promise.all(paths.map(async path => {
      const local = relative(selected.source.directory, path).split(sep).join("/")
      if (!local || local === ".." || local.startsWith("../")) throw new Error("Scenario is outside its assigned package")
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) throw new Error("Scenario source is not an owned regular file")
      const absolute = await realpath(path)
      const actual = relative(ownerRoot, absolute)
      if (!actual || actual === ".." || actual.startsWith(`..${sep}`)) throw new Error("Scenario resolves outside its assigned package")
      const bytes = await readFile(absolute)
      return {absolute, local, digest: createHash("sha256").update(bytes).digest("hex")}
    }))
    return {selected, entries}
  }
  const list = async (packageName: string, nodeId?: string): Promise<DevelopmentScenarioListing> => {
    const {selected, entries} = await source(packageName, nodeId)
    const sources = entries.map(entry => ({path: entry.local, digest: entry.digest}))
    return {packageName, nodeId: selected.node.id, sources,
      revision: createHash("sha256").update(JSON.stringify(sources)).digest("hex")}
  }
  const run = async (input: DevelopmentScenarioRunInput, signal: AbortSignal,
    onProgress?: Progress): Promise<DevelopmentScenarioReport> => {
    const {selected, entries} = await source(input.packageName, input.nodeId)
    const entry = entries.find(value => value.local === input.sourcePath)
    if (!entry || entry.digest !== input.expectedDigest) throw new Error("Scenario source changed; refresh its listing")
    if (entry.local.endsWith(".tsx")) throw new Error("Для JSX-сценария нужна подготовленная ревизия владельца")
    const controller = new AbortController()
    const request = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(120_000)])
    const task = (async () => {
      request.throwIfAborted()
      const tsserverPath = await artifacts.tsserverPath()
      request.throwIfAborted()
      const report = await readScenario({path: entry.absolute, tracePreloadPath: artifacts.tracePreloadPath,
        tsserverPath,
        signal: request, ...(onProgress ? {onProgress} : {})})
      request.throwIfAborted()
      const current = await source(input.packageName, selected.node.id)
      const next = current.entries.find(value => value.local === entry.local)
      if (next?.digest !== entry.digest || next.absolute !== entry.absolute)
        throw new Error("Scenario source changed during execution")
      return {
        sourcePath: entry.local, digest: entry.digest, exitCode: report.exitCode, source: report.source.text,
        tests: report.tests.map(({label, groupId, status, message}) => ({label, groupId, status, message})),
        groups: report.groups.map(({id, parentId, label}) => ({id, parentId, label})),
        validation: {status: report.validation.status, checks: report.validation.checks.map(({rule, status, issues}) =>
          ({rule, status, issues: issues.map(issue => issue.message)}))},
        stdout: report.stdout.slice(-262_144), stderr: report.stderr.slice(-262_144),
      }
    })()
    const job = {controller, task}
    active.add(job)
    try {return await task} finally {active.delete(job)}
  }
  return {list, run, async close() {
    if (closed) return
    closed = true
    for (const job of active) job.controller.abort(new DOMException("Development scenarios closed", "AbortError"))
    await Promise.allSettled([...active].map(job => job.task))
    active.clear()
  }}
}
