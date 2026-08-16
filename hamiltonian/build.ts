import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

const packages = {
  "@startup/main": {rebuild: false},
  "@startup/service": {
    rebuild: false,
    contentSecurityPolicy: "script-src 'unsafe-eval'",
  },
  "@import/main": {rebuild: true},
  "@import/service": {rebuild: true},
  "@internal/rpc": {rebuild: true},
} as const

/** Hamiltonian packages, которые предоставляют browser artifact. */
export type BuildableModule = keyof typeof packages

/** Packages, которые можно явно пересобрать во время работы host. */
export type RebuildableModule = {
  [Module in BuildableModule]: typeof packages[Module]["rebuild"] extends true ? Module : never
}[BuildableModule]

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

interface PackageOwner {
  root: string
  artifact: string
}

const packageOwners = new Map<BuildableModule, Promise<PackageOwner>>()
const pendingBuilds = new Map<BuildableModule, Promise<PackageBuildResult>>()

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
    const result = await buildPackage(module)
    if (!result.success) return Response.json(result, {status: 422})

    artifact = await readArtifact(owner)
    if (!artifact) {
      return Response.json(buildContractFailure(result, owner.artifact), {status: 422})
    }
  }

  const responseHeaders = new Headers({"Cache-Control": "no-cache"})
  responseHeaders.set("Content-Type", artifact.type)
  const policy = packages[module]
  if ("contentSecurityPolicy" in policy)
    responseHeaders.set("Content-Security-Policy", policy.contentSecurityPolicy)
  return new Response(Bun.file(artifact.path), {headers: responseHeaders})
}

/** Преобразует внешний query parameter в каноническое package name. */
export function buildableModule(value: string | null): BuildableModule | null {
  if (value !== null && Object.hasOwn(packages, value)) return value as BuildableModule
  return null
}

/** Принимает только package, которому разрешена явная повторная сборка. */
export function rebuildableModule(value: string | null): RebuildableModule | null {
  const module = buildableModule(value)
  if (module !== null && packages[module].rebuild) return module as RebuildableModule
  return null
}

/** Читает единственный JSON-контракт групповой повторной сборки. */
export async function rebuildableModules(
  request: Request,
): Promise<RebuildableModule[] | Response> {
  const mediaType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (mediaType !== "application/json") return new Response(null, {status: 415})
  if (new URL(request.url).search !== "") return new Response(null, {status: 400})

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return new Response(null, {status: 400})
  }

  if (!isBuildInput(input)) return new Response(null, {status: 400})

  const modules = input.modules.map(rebuildableModule)
  if (modules.some((module) => module === null)) return new Response(null, {status: 404})
  return [...new Set(modules as RebuildableModule[])]
}

/**
 * Всегда запускает package-owned `scripts.build` и возвращает результат процесса.
 *
 * Если тот же package уже собирается, вызывающие используют его pending Promise.
 */
export function buildPackage(module: BuildableModule): Promise<PackageBuildResult> {
  const pending = pendingBuilds.get(module)
  if (pending) return pending

  const build = runPackageBuild(module)
  pendingBuilds.set(module, build)
  void build.then(
    () => pendingBuilds.delete(module),
    () => pendingBuilds.delete(module),
  )
  return build
}

async function runPackageBuild(module: BuildableModule): Promise<PackageBuildResult> {
  try {
    const owner = await packageOwner(module)
    const child = Bun.spawn([Bun.which("bun") ?? "bun", "run", "--silent", "build"], {
      cwd: owner.root,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])

    if (exitCode !== 0) {
      return {module, success: false, exitCode, stdout, stderr, outputs: []}
    }

    const artifact = await readArtifact(owner)
    if (!artifact) {
      return buildContractFailure(
        {module, success: true, exitCode, stdout, stderr, outputs: []},
        owner.artifact,
      )
    }

    return {module, success: true, exitCode, stdout, stderr, outputs: [artifact]}
  } catch (error) {
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

async function packageOwner(module: BuildableModule) {
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
      }

      if (manifest.name !== module)
        throw new Error(`Resolved package ${String(manifest.name)} does not match ${module}`)
      if (typeof manifest.scripts?.typecheck !== "string")
        throw new Error(`${module} typecheck script is missing`)
      if (manifest.scripts.prebuild !== "bun run typecheck")
        throw new Error(`${module} prebuild must run \`bun run typecheck\``)
      if (typeof manifest.scripts.build !== "string")
        throw new Error(`${module} build script is missing`)

      return {root, artifact: join(root, "dist/index.js")}
    }

    const parent = dirname(root)
    if (parent === root) break
    root = parent
  }

  throw new Error(`Hamiltonian package is missing for ${module}`)
}

async function readArtifact(owner: PackageOwner): Promise<PackageBuildArtifact | null> {
  const artifact = Bun.file(owner.artifact, {type: "text/javascript; charset=utf-8"})
  if (!await artifact.exists() || artifact.size === 0) return null
  return {path: owner.artifact, size: artifact.size, type: artifact.type}
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

function isBuildInput(value: unknown): value is {modules: string[]} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  return Object.keys(input).length === 1
    && Array.isArray(input.modules)
    && input.modules.length > 0
    && input.modules.every((module) => typeof module === "string")
}
