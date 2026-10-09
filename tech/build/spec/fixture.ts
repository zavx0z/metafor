import {cp, mkdir, mkdtemp, readdir, rm, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join, resolve} from "node:path"

export interface BuildFixtureChanges {
  manifest?: Record<string, unknown>
  dependencies?: Record<string, string>
  files?: Record<string, string>
}

/** Каждый пример получает отдельные исходники и зависимости; исходный fixture не изменяется. */
export async function buildFixture(path: string, changes: BuildFixtureChanges = {}) {
  const directory = await mkdtemp(join(tmpdir(), "tech-build-scenario-"))
  const root = join(directory, "package")
  try {
    await cp(path, root, {recursive: true})
    const modules = join(directory, "node_modules")
    await mkdir(modules, {recursive: true})
    for (const entry of [".bin", "@types", "bun-types", "typescript"]) {
      await symlink(resolve(import.meta.dir, "../../../node_modules", entry), join(modules, entry))
    }
    for (const [name, source] of Object.entries(changes.dependencies ?? {})) {
      const target = join(modules, name)
      await mkdir(dirname(target), {recursive: true})
      await cp(source, target, {recursive: true})
    }
    const manifestPath = join(root, "package.json")
    const manifest = {...(await Bun.file(manifestPath).json()), ...changes.manifest}
    const typecheck = manifest.scripts.typecheck
    manifest.scripts.typecheck = `bun ./record-typecheck.ts && ${typecheck}`
    await Bun.write(
      join(root, "record-typecheck.ts"),
      'import {appendFileSync} from "node:fs"\nappendFileSync("../typechecks.log", "check\\n")\n',
    )
    await Bun.write(manifestPath, JSON.stringify(manifest))
    for (const [path, source] of Object.entries(changes.files ?? {})) {
      await Bun.write(join(root, path), source)
    }
    return {
      root,
      directory,
      name: manifest.name as string,
      manifest: await Bun.file(manifestPath).text(),
      inputs: await snapshotBuildInputs(root),
      cleanup: () => rm(directory, {recursive: true, force: true}),
    }
  } catch (error) {
    await rm(directory, {recursive: true, force: true})
    throw error
  }
}

/**
Исполняет неизменённые outputs в отдельном процессе. Resolver заменяет только
доставку канонического URL на файл того же результата, не переписывая его байты.
*/
export async function executeBuildFixture<T>(
  directory: string,
  results: readonly import("@metafor/tech-build").PackageBuildResult[],
  version: string,
  source: string,
): Promise<T> {
  const {browserPackageArtifactUrl, isBrowserPackageEnvironment} = await import("@metafor/tech-build/identity")
  const entries: Record<string, string> = {}
  const urls: Record<string, string> = {}
  for (const result of results) {
    for (const output of result.outputs) {
      if (!output.artifact || output.kind === "sourcemap") continue
      entries[`${result.env}:${output.artifact}`] = output.path
      if (isBrowserPackageEnvironment(result.env)) {
        urls[browserPackageArtifactUrl(result.module, result.env, output.artifact, version)] = output.path
      }
    }
  }
  const runner = join(directory, "execute.ts")
  await Bun.write(runner, `
import {pathToFileURL} from "node:url"
const request = JSON.parse(await Bun.stdin.text())
Bun.plugin({
  name: "fixture-artifact-delivery",
  setup(build) {
    build.onResolve({filter: /^\\/@/}, ({path}) => {
      const target = request.urls[path]
      if (!target) throw new Error("Unknown prepared artifact URL: " + path)
      return {path: target}
    })
  },
})
const load = async (env, artifact = ".") => {
  const path = request.entries[env + ":" + artifact]
  if (!path) throw new Error("Missing prepared artifact: " + env + ":" + artifact)
  return await import(pathToFileURL(path).href)
}
const run = new (Object.getPrototypeOf(async function() {}).constructor)("load", request.source)
const value = await run(load)
await Bun.write(request.resultPath, JSON.stringify(value))
`)
  const resultPath = join(directory, `execution-${crypto.randomUUID()}.json`)
  const child = Bun.spawn([process.execPath, runner], {
    cwd: directory,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  child.stdin.write(JSON.stringify({entries, urls, source, resultPath}))
  child.stdin.end()
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text(), new Response(child.stdout).text()])
  if (exitCode !== 0) throw new Error(`Prepared artifacts failed to execute (${exitCode}): ${stderr}`)
  return await Bun.file(resultPath).json() as T
}

/** Снимок всех подготовленных исходников, конфигураций и manifest перед сборкой. */
export async function snapshotBuildInputs(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of await readdir(root, {recursive: true, withFileTypes: true})) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    files[path.slice(root.length + 1)] = new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex")
  }
  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)))
}
