import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {mkdir} from "node:fs/promises"

/** Hamiltonian packages, которые предоставляют browser artifact. */
export type BuildableModule = string

/** Packages, которые можно явно пересобрать во время работы host. */
export type RebuildableModule = string

/** Готовый package-owned browser artifact. */
export interface PackageBuildArtifact {
  path: string
  size: number
  type: string
}

/** Результат запуска package-owned `scripts.build`. */
export interface PackageBuildResult {
  module: BuildableModule
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  outputs: PackageBuildArtifact[]
}

/** Необязательная цель package build, используемая серверной staging-транзакцией. */
export interface PackageBuildOptions {
  artifact?: string
}

/** Проверенный package-owned contract browser artifact. */
export interface PackageOwner {
  root: string
  manifest: string
  artifact: string
  build: string
  cache: string | null
  headers: Record<string, string>
}

const packageOwners = new Map<BuildableModule, Promise<PackageOwner>>()
const pendingBuilds = new Map<string, Promise<PackageBuildResult>>()

/**
 * Возвращает package artifact, лениво собирая его при отсутствии или пустом файле.
 *
 * Одновременные первые GET одного package используют одну сборку. После ошибки
 * Promise удаляется, поэтому следующий GET может повторить сборку.
 */
export async function packageResponse(module: BuildableModule) {
  const owner = await packageOwner(module)
  let artifact = await readArtifact(owner)

  if (!artifact) {
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[hamiltonian/server/build]", "готовой сборки нет, запускаем сборку", {
        module,
        path: owner.artifact,
      })
    }
    const result = await buildPackage(module)
    if (!result.success) {
      if (Bun.env.NODE_ENV === "development") {
        console.debug("[hamiltonian/server/build]", "не удалось собрать модуль по запросу", {
          module,
          exitCode: result.exitCode,
          stderr: result.stderr,
        })
      }
      return Response.json(result, {status: 422})
    }

    artifact = await readArtifact(owner)
    if (!artifact) {
      const failure = buildContractFailure(result, owner.artifact)
      if (Bun.env.NODE_ENV === "development") {
        console.debug("[hamiltonian/server/build]", "сборка не создала готовый файл", {
          module,
          path: owner.artifact,
        })
      }
      return Response.json(failure, {status: 422})
    }
  }

  if (Bun.env.NODE_ENV === "development") {
    console.debug("[hamiltonian/server/build]", "отдаём готовую сборку", {module, ...artifact})
  }
  const responseHeaders = new Headers({"Cache-Control": "no-cache"})
  responseHeaders.set("Content-Type", artifact.type)
  for (const [name, value] of Object.entries(owner.headers)) responseHeaders.set(name, value)
  return new Response(Bun.file(artifact.path), {headers: responseHeaders})
}

/** Разрешает внешний query parameter как package с полным browser build contract. */
export async function buildableModule(value: string | null): Promise<BuildableModule | null> {
  if (value === null) return null
  try {
    await packageOwner(value)
    return value
  } catch {
    return null
  }
}

/**
 * Всегда запускает package-owned `scripts.build` и возвращает результат процесса.
 *
 * Если тот же package уже собирается в ту же цель, вызывающие используют его
 * pending Promise.
 */
export function buildPackage(
  module: BuildableModule,
  options: PackageBuildOptions = {},
): Promise<PackageBuildResult> {
  const {artifact} = options
  const key = `${module}\u0000${artifact ?? "default"}`
  const pending = pendingBuilds.get(key)
  if (pending) {
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[hamiltonian/server/build]", "ожидаем уже запущенную сборку пакета", {module})
    }
    return pending
  }

  if (Bun.env.NODE_ENV === "development") {
    console.debug("[hamiltonian/server/build]", "запрошена сборка пакета", {module})
  }
  const build = runPackageBuild(module, artifact)
  pendingBuilds.set(key, build)
  void build.then(
    () => pendingBuilds.delete(key),
    () => pendingBuilds.delete(key),
  )
  return build
}

/**
 * Читает production build command пакета и адаптирует только общий development profile.
 *
 * Параметры entrypoint, target, format, external и outfile всегда принадлежат
 * package-owned `scripts.build` и не дублируются в host.
 */
export function packageBuildCommand(
  script: string,
  environment = Bun.env.NODE_ENV,
): string[] {
  const command = script.trim().split(/\s+/)
  if (command[0] !== "bun" || command[1] !== "build")
    throw new Error("Package build script must be a direct `bun build` command")
  if (environment !== "development") return command

  const development: string[] = []
  for (let index = 0; index < command.length; index += 1) {
    const argument = command[index]
    if (argument === undefined) continue
    if (argument === "--production") continue
    if (argument === "--drop" && command[index + 1] === "console.debug") {
      index += 1
      continue
    }
    if (argument === "--drop=console.debug") continue
    if (argument === "--sourcemap") {
      index += 1
      continue
    }
    if (argument.startsWith("--sourcemap=")) continue
    development.push(argument)
  }

  const output = development.findIndex((argument) => argument.startsWith("--outfile"))
  development.splice(output === -1 ? development.length : output, 0, "--sourcemap=inline")
  return development
}

async function runPackageBuild(
  module: BuildableModule,
  artifactOverride?: string,
): Promise<PackageBuildResult> {
  try {
    const owner = await packageOwner(module)
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[hamiltonian/server/build]", "проверка пакета перед сборкой началась", {
        module,
        root: owner.root,
      })
    }
    const prebuild = Bun.spawn([Bun.which("bun") ?? "bun", "run", "--silent", "prebuild"], {
      cwd: owner.root,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [prebuildExitCode, prebuildStdout, prebuildStderr] = await Promise.all([
      prebuild.exited,
      new Response(prebuild.stdout).text(),
      new Response(prebuild.stderr).text(),
    ])
    if (prebuildExitCode !== 0) {
      if (Bun.env.NODE_ENV === "development") {
        console.debug("[hamiltonian/server/build]", "проверка пакета завершилась с ошибкой", {
          module,
          exitCode: prebuildExitCode,
          stderr: prebuildStderr,
        })
      }
      return {
        module,
        success: false,
        exitCode: prebuildExitCode,
        stdout: prebuildStdout,
        stderr: prebuildStderr,
        outputs: [],
      }
    }

    if (Bun.env.NODE_ENV === "development") {
      console.debug("[hamiltonian/server/build]", "проверка пакета завершена", {
        module,
        exitCode: prebuildExitCode,
      })
    }
    const artifactPath = artifactOverride ?? owner.artifact
    await mkdir(dirname(artifactPath), {recursive: true})
    const command = packageBuildOutput(packageBuildCommand(owner.build), artifactPath)
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[hamiltonian/server/build]", "сборка пакета началась", {
        module,
        command,
        environment: Bun.env.NODE_ENV,
        root: owner.root,
      })
    }
    const child = Bun.spawn(command, {
      cwd: owner.root,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, buildStdout, buildStderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    const stdout = `${prebuildStdout}${buildStdout}`
    const stderr = `${prebuildStderr}${buildStderr}`

    if (exitCode !== 0) {
      if (Bun.env.NODE_ENV === "development") {
        console.debug("[hamiltonian/server/build]", "сборка пакета завершилась с ошибкой", {
          module,
          exitCode,
          stderr,
        })
      }
      return {module, success: false, exitCode, stdout, stderr, outputs: []}
    }

    const artifact = await readArtifactPath(artifactPath)
    if (!artifact) {
      const failure = buildContractFailure(
        {module, success: true, exitCode, stdout, stderr, outputs: []},
        artifactPath,
      )
      if (Bun.env.NODE_ENV === "development") {
        console.debug("[hamiltonian/server/build]", "сборка пакета не создала готовый файл", {
          module,
          path: artifactPath,
        })
      }
      return failure
    }

    if (Bun.env.NODE_ENV === "development") {
      console.debug("[hamiltonian/server/build]", "сборка пакета завершена", {
        module,
        exitCode,
        artifact,
      })
    }
    return {module, success: true, exitCode, stdout, stderr, outputs: [artifact]}
  } catch (error) {
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[hamiltonian/server/build]", "сборка пакета завершилась с ошибкой", {module}, error)
    }
    return {
      module,
      success: false,
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      outputs: [],
    }
  }
}

export async function packageOwner(module: BuildableModule) {
  let owner = packageOwners.get(module)
  if (!owner) {
    owner = findPackage(module).catch((error: unknown) => {
      packageOwners.delete(module)
      throw error
    })
    packageOwners.set(module, owner)
  }
  return await owner
}

/** Находит package-владельца через его корневой export и проверяет build contract. */
async function findPackage(module: BuildableModule): Promise<PackageOwner> {
  const boundary = dirname(fileURLToPath(import.meta.url))
  const entrypoint = Bun.resolveSync(module, boundary)
  let root = dirname(entrypoint)

  while (root === boundary || root.startsWith(`${boundary}/`)) {
    const manifestFile = Bun.file(join(root, "package.json"))
    if (await manifestFile.exists()) {
      const manifest = await manifestFile.json() as {
        name?: unknown
        scripts?: Record<string, unknown>
        artifact?: {cache?: unknown, headers?: Record<string, unknown>}
      }

      if (manifest.name !== module)
        throw new Error(`Resolved package ${String(manifest.name)} does not match ${module}`)
      if (typeof manifest.scripts?.typecheck !== "string")
        throw new Error(`${module} typecheck script is missing`)
      if (manifest.scripts.prebuild !== "bun run typecheck")
        throw new Error(`${module} prebuild must run \`bun run typecheck\``)
      if (typeof manifest.scripts.build !== "string")
        throw new Error(`${module} build script is missing`)

      const build = manifest.scripts.build
      const artifact = resolvePackageArtifact(root, packageBuildCommand(build, "production"))

      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(manifest.artifact?.headers ?? {})) {
        if (typeof value !== "string")
          throw new Error(`${module} artifact header ${name} must be a string`)
        headers[name] = value
      }

      const cache = manifest.artifact?.cache
      if (cache !== undefined && typeof cache !== "string")
        throw new Error(`${module} artifact cache must be a string`)

      return {
        root,
        manifest: join(root, "package.json"),
        artifact,
        build,
        cache: cache ?? null,
        headers,
      }
    }

    const parent = dirname(root)
    if (parent === root) break
    root = parent
  }

  throw new Error(`Hamiltonian package is missing for ${module}`)
}

async function readArtifact(owner: PackageOwner): Promise<PackageBuildArtifact | null> {
  return await readArtifactPath(owner.artifact)
}

async function readArtifactPath(path: string): Promise<PackageBuildArtifact | null> {
  const artifact = Bun.file(path, {type: "text/javascript; charset=utf-8"})
  if (!await artifact.exists() || artifact.size === 0) return null
  return {path, size: artifact.size, type: artifact.type}
}

function buildContractFailure(
  result: PackageBuildResult,
  artifact: string,
): PackageBuildResult {
  const message = `${result.module} build did not produce non-empty ${artifact}`
  return {
    ...result,
    success: false,
    stderr: [result.stderr.trimEnd(), message].filter(Boolean).join("\n"),
    outputs: [],
  }
}

function resolvePackageArtifact(root: string, command: readonly string[]) {
  let output: string | undefined
  for (let index = 0; index < command.length; index += 1) {
    const argument = command[index]
    if (argument === "--outfile") output = command[index + 1]
    else if (argument?.startsWith("--outfile=")) output = argument.slice("--outfile=".length)
  }
  if (!output) throw new Error("Package build script must define `--outfile`")

  const artifact = resolve(root, output)
  if (artifact !== root && !artifact.startsWith(`${root}/`))
    throw new Error("Package build outfile must stay inside package root")
  return artifact
}

function packageBuildOutput(command: readonly string[], artifact: string) {
  const output = [...command]
  for (let index = 0; index < output.length; index += 1) {
    const argument = output[index]
    if (argument === "--outfile") {
      output[index + 1] = artifact
      return output
    }
    if (argument?.startsWith("--outfile=")) {
      output[index] = `--outfile=${artifact}`
      return output
    }
  }
  throw new Error("Package build script must define `--outfile`")
}
