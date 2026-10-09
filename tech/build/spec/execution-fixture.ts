import {mkdir, readdir, realpath, symlink} from "node:fs/promises"
import {dirname, join} from "node:path"
import {createPackageBuilder, type PackageBuildOptions, type PackageBuildReport, type PackageBuildResult} from "@metafor/tech-build"
import type {IsolatedPackageBuildRequest} from "../adapter"
import {buildFixture, type BuildFixtureChanges} from "./fixture"

export type ExecutionFixture = Awaited<ReturnType<typeof executionFixture>>

/** Наблюдает настоящие дочерние процессы, не подменяя exit codes или compiler bytes. */
export function observeBuildProcesses(root: string) {
  const spawn = Bun.spawn.bind(Bun) as unknown as (command: string[], options: unknown) => Bun.Subprocess
  const processes: {kind: "typecheck" | "compiler"; child: Bun.Subprocess; request?: IsolatedPackageBuildRequest; report?: PackageBuildReport}[] = []
  const observedSpawn = ((command: string[], options: {cwd?: string; stdin?: unknown}) => {
    const child = spawn(command, options)
    if (options.cwd !== root) return child
    const kind = command.includes("--silent") ? "typecheck" : "compiler"
    const record: typeof processes[number] = {kind, child}
    processes.push(record)
    if (!(options.stdin instanceof Blob)) return child
    const request = options.stdin.text().then((value: string) => {
      record.request = JSON.parse(value)
      return record.request!
    })
    const exited = child.exited.then(async (code) => {
      const input = await request
      if (await Bun.file(input.report).exists()) {
        const report = await Bun.file(input.report).json()
        if (Array.isArray(report.outputs)) record.report = report
      }
      return code
    })
    return new Proxy(child, {
      get(target, property) {
        if (property === "exited") return exited
        const value = Reflect.get(target, property)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
  }) as typeof Bun.spawn
  return {
    processes,
    spawn: observedSpawn,
    count: (kind: "typecheck" | "compiler") => processes.filter((process) => process.kind === kind).length,
    async released() {
      return processes.every(({child}) => child.exitCode !== null || child.signalCode !== null) &&
        (await Promise.all(processes.map(async ({request}) => request === undefined || !(await Bun.file(request.report).exists())))).every(Boolean)
    },

  }
}

export async function executionFixture(path: string, changes: BuildFixtureChanges & {symbolicLinks?: Record<string, string>} = {}) {
  const fixture = await buildFixture(path, structuredClone(changes))
  fixture.root = await realpath(fixture.root)
  // Отрицательный manifest должен сохранять именно отсутствующий typecheck.
  if (changes.manifest?.scripts && !Object.hasOwn(changes.manifest.scripts, "typecheck")) {
    const manifest = await Bun.file(join(fixture.root, "package.json")).json()
    delete manifest.scripts.typecheck
    await Bun.write(join(fixture.root, "package.json"), JSON.stringify(manifest))
  }
  for (const [path, target] of Object.entries(changes.symbolicLinks ?? {})) {
    await mkdir(dirname(join(fixture.root, path)), {recursive: true})
    await Bun.write(join(fixture.root, target), "export const outside = true\n")
    await symlink(target, join(fixture.root, path))
  }
  const observation = observeBuildProcesses(fixture.root)
  return {...fixture, observation, cleanup: () => fixture.cleanup()}
}

export function fixtureBuilder(fixture: ExecutionFixture, profile: "development" | "production" = "production") {
  return createPackageBuilder({resolvePackage: () => fixture.root, profile, spawn: fixture.observation.spawn})
}

export async function buildOutcome(builder: ReturnType<typeof fixtureBuilder>, name: string, options: PackageBuildOptions = {}): Promise<PackageBuildResult> {
  try {
    return await builder.buildPackage(name, options)
  } catch (error) {
    return {module: name, env: options.env ?? "main", success: false, stage: "configuration", exitCode: null, stdout: "", stderr: error instanceof Error ? error.message : String(error), outputs: []}
  }
}

export async function typechecks(fixture: ExecutionFixture) {
  const log = Bun.file(join(fixture.directory, "typechecks.log"))
  return await log.exists() ? (await log.text()).trim().split("\n").length : 0
}

export async function reportDirectories(fixture: ExecutionFixture) {
  return await Promise.all(fixture.observation.processes.map(async ({request}) => request === undefined || !(await readdir(dirname(request.report)).then(() => true, () => false))))
}
