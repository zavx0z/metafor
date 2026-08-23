import {mkdir} from "node:fs/promises"
import {dirname} from "node:path"
import {packageBuildCommand, withPackageBuildOutput} from "./command"
import type {
  BrowserPackageEnvironment,
  PackageEnvironment,
} from "../../../shared/package/environment"
import type {
  BuildablePackage,
  PackageBuildOptions,
  PackageBuildResult,
  PackageOwner,
} from "../shared/contracts"
import {packageArtifact, packageOwner} from "./manifest"
import {artifactResponse} from "./response"
import {
  browserPackageSourceMapUrl,
  externalizeSourceMap,
  sourceMapArtifact,
} from "./source-map"

const pendingBuilds = new Map<string, Promise<PackageBuildResult>>()
const pendingTypechecks = new Map<string, Promise<PackageTypecheckResult>>()

interface PackageTypecheckResult {
  exitCode: number
  stdout: string
  stderr: string
}

/** Возвращает env artifact, лениво собирая его при отсутствии или пустом файле. */
export async function packageResponse(
  name: BuildablePackage,
  env?: BrowserPackageEnvironment,
  request?: Request,
) {
  const owner = await packageOwner(name, env)
  let artifact = await packageArtifact(owner.artifact)

  if (!artifact) {
    const result = await buildPackage(name, {env: owner.env})
    if (!result.success) return Response.json(result, {status: 422})

    artifact = await packageArtifact(owner.artifact)
    if (!artifact) {
      const failure = buildContractFailure(result, owner.artifact)
      return Response.json(failure, {status: 422})
    }
  }

  const headers = new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
    "X-Package-Env": owner.env,
    "X-Package-SHA256": artifact.sha256,
    "X-Package-Size": String(artifact.size),
  })
  const sourceMap = await packageArtifact(sourceMapArtifact(artifact.path))
  if (sourceMap) headers.set(
    "SourceMap",
    browserPackageSourceMapUrl(name, owner.env as BrowserPackageEnvironment),
  )
  for (const [header, value] of Object.entries(owner.headers)) headers.set(header, value)
  return await artifactResponse(request, artifact, headers)
}

/** Возвращает внешнюю development source map initial package. */
export async function packageSourceMapResponse(
  name: BuildablePackage,
  env: BrowserPackageEnvironment,
  request?: Request,
) {
  const owner = await packageOwner(name, env)
  const artifact = await packageArtifact(sourceMapArtifact(owner.artifact))
  if (!artifact) return new Response(null, {status: 404})
  return await artifactResponse(request, artifact, new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
  }))
}

/** Разрешает внешнее имя как package с полным browser build contract. */
export async function buildablePackage(
  value: string | null,
  env?: PackageEnvironment,
): Promise<BuildablePackage | null> {
  if (value === null) return null
  try {
    await packageOwner(value, env)
    return value
  } catch {
    return null
  }
}

/** Запускает package-owned `scripts.build:<env>`, схлопывая одинаковые pending builds. */
export async function buildPackage(
  name: BuildablePackage,
  options: PackageBuildOptions = {},
): Promise<PackageBuildResult> {
  const owner = await packageOwner(name, options.env)
  const key = `${name}\u0000${owner.env}\u0000${options.artifact ?? "default"}`
  const pending = pendingBuilds.get(key)
  if (pending) return pending

  const build = runPackageBuild(name, owner, options.artifact)
  pendingBuilds.set(key, build)
  void build.then(
    () => pendingBuilds.delete(key),
    () => pendingBuilds.delete(key),
  )
  return build
}

async function runPackageBuild(
  name: BuildablePackage,
  owner: PackageOwner,
  artifactOverride?: string,
): Promise<PackageBuildResult> {
  try {
    const typecheck = await runPackageTypecheck(name, owner)
    if (typecheck.exitCode !== 0) {
      return {
        module: name,
        env: owner.env,
        success: false,
        exitCode: typecheck.exitCode,
        stdout: typecheck.stdout,
        stderr: typecheck.stderr,
        outputs: [],
      }
    }

    const artifactPath = artifactOverride ?? owner.artifact
    await mkdir(dirname(artifactPath), {recursive: true})
    const command = withPackageBuildOutput(packageBuildCommand(owner.build), artifactPath)
    debug("сборка artifact начата", {
      artifact: artifactPath,
      command,
      env: owner.env,
      package: name,
      profile: Bun.env.NODE_ENV,
      root: owner.root,
    })

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
    const stdout = `${typecheck.stdout}${buildStdout}`
    const stderr = `${typecheck.stderr}${buildStderr}`

    if (exitCode !== 0) {
      debug("сборка artifact завершилась с ошибкой", {
        env: owner.env,
        error: stderr,
        exitCode,
        package: name,
      })
      return {module: name, env: owner.env, success: false, exitCode, stdout, stderr, outputs: []}
    }

    if (Bun.env.NODE_ENV === "development") await externalizeSourceMap(artifactPath)

    const artifact = await packageArtifact(artifactPath)
    if (!artifact) {
      const failure = buildContractFailure(
        {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs: []},
        artifactPath,
      )
      debug("сборка artifact завершилась с ошибкой", {
        env: owner.env,
        error: failure.stderr,
        exitCode: failure.exitCode,
        package: name,
      })
      return failure
    }

    debug("сборка artifact завершена", {
      artifact,
      env: owner.env,
      exitCode,
      package: name,
    })
    const outputs = [artifact]
    if (Bun.env.NODE_ENV === "development") {
      const sourceMap = await packageArtifact(sourceMapArtifact(artifactPath))
      if (!sourceMap) {
        const failure = buildContractFailure(
          {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs},
          sourceMapArtifact(artifactPath),
        )
        debug("сборка artifact завершилась с ошибкой", {
          env: owner.env,
          error: failure.stderr,
          exitCode: failure.exitCode,
          package: name,
        })
        return failure
      }
      outputs.push(sourceMap)
    }

    return {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs}
  } catch (error) {
    debug("сборка artifact завершилась с ошибкой", {
      env: owner.env,
      error: errorMessage(error),
      exitCode: null,
      package: name,
    })
    return {
      module: name,
      env: owner.env,
      success: false,
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      outputs: [],
    }
  }
}

/** Один раз проверяет package перед параллельной группой его env builds. */
async function runPackageTypecheck(name: BuildablePackage, owner: PackageOwner) {
  const pending = pendingTypechecks.get(owner.manifest)
  if (pending) return pending

  debug("package typecheck начат", {package: name, root: owner.root})
  const typecheck = executePackageTypecheck(owner).then((result) => {
    debug("package typecheck завершён", {
      exitCode: result.exitCode,
      package: name,
      stderr: result.stderr.trim() || null,
    })
    return result
  })
  pendingTypechecks.set(owner.manifest, typecheck)
  void typecheck.then(
    () => pendingTypechecks.delete(owner.manifest),
    () => pendingTypechecks.delete(owner.manifest),
  )
  return typecheck
}

async function executePackageTypecheck(owner: PackageOwner): Promise<PackageTypecheckResult> {
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "run",
    "--silent",
    owner.typecheck,
  ], {
    cwd: owner.root,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return {exitCode, stdout, stderr}
}

function buildContractFailure(result: PackageBuildResult, artifact: string): PackageBuildResult {
  const message = `${result.module} build did not produce non-empty ${artifact}`
  return {
    ...result,
    success: false,
    stderr: [result.stderr.trimEnd(), message].filter(Boolean).join("\n"),
    outputs: [],
  }
}

function debug(event: string, details: unknown) {
  if (Bun.env.NODE_ENV === "development")
    console.debug("[@cosmos/release:server:build]", event, details)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
