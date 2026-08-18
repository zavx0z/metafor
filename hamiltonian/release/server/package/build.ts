import {mkdir} from "node:fs/promises"
import {dirname} from "node:path"
import {packageBuildCommand, withPackageBuildOutput} from "./command"
import type {
  BuildablePackage,
  PackageBuildOptions,
  PackageBuildResult,
  PackageEnvironment,
  PackageOwner,
} from "../shared/contracts"
import {packageArtifact, packageOwner} from "./manifest"

const pendingBuilds = new Map<string, Promise<PackageBuildResult>>()
const pendingTypechecks = new Map<string, Promise<PackageTypecheckResult>>()

interface PackageTypecheckResult {
  exitCode: number
  stdout: string
  stderr: string
}

/** Возвращает env artifact, лениво собирая его при отсутствии или пустом файле. */
export async function packageResponse(name: BuildablePackage, env?: PackageEnvironment) {
  const owner = await packageOwner(name, env)
  let artifact = await packageArtifact(owner.artifact)

  if (!artifact) {
    debug("готовой сборки нет, запускаем сборку", {package: name, path: owner.artifact})
    const result = await buildPackage(name, {env: owner.env})
    if (!result.success) {
      debug("не удалось собрать пакет по запросу", {
        package: name,
        exitCode: result.exitCode,
        stderr: result.stderr,
      })
      return Response.json(result, {status: 422})
    }

    artifact = await packageArtifact(owner.artifact)
    if (!artifact) {
      const failure = buildContractFailure(result, owner.artifact)
      debug("сборка не создала готовый файл", {package: name, path: owner.artifact})
      return Response.json(failure, {status: 422})
    }
  }

  debug("отдаём готовую сборку", {package: name, ...artifact})
  const headers = new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
    "X-Package-Env": owner.env,
    "X-Package-SHA256": artifact.sha256,
    "X-Package-Size": String(artifact.size),
  })
  for (const [header, value] of Object.entries(owner.headers)) headers.set(header, value)
  return new Response(Bun.file(artifact.path), {headers})
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
  if (pending) {
    debug("ожидаем уже запущенную сборку пакета", {package: name})
    return pending
  }

  debug("запрошена сборка пакета", {env: owner.env, package: name})
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
    debug("проверка пакета перед сборкой началась", {
      env: owner.env,
      package: name,
      root: owner.root,
    })

    const typecheck = await runPackageTypecheck(name, owner)
    if (typecheck.exitCode !== 0) {
      debug("проверка пакета завершилась с ошибкой", {
        package: name,
        exitCode: typecheck.exitCode,
        stderr: typecheck.stderr,
      })
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

    debug("проверка пакета завершена", {
      env: owner.env,
      package: name,
      exitCode: typecheck.exitCode,
    })
    const artifactPath = artifactOverride ?? owner.artifact
    await mkdir(dirname(artifactPath), {recursive: true})
    const command = withPackageBuildOutput(packageBuildCommand(owner.build), artifactPath)
    debug("сборка пакета началась", {
      package: name,
      env: owner.env,
      command,
      environment: Bun.env.NODE_ENV,
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
      debug("сборка пакета завершилась с ошибкой", {package: name, exitCode, stderr})
      return {module: name, env: owner.env, success: false, exitCode, stdout, stderr, outputs: []}
    }

    const artifact = await packageArtifact(artifactPath)
    if (!artifact) {
      const failure = buildContractFailure(
        {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs: []},
        artifactPath,
      )
      debug("сборка пакета не создала готовый файл", {package: name, path: artifactPath})
      return failure
    }

    debug("сборка пакета завершена", {env: owner.env, package: name, exitCode, artifact})
    return {module: name, env: owner.env, success: true, exitCode, stdout, stderr, outputs: [artifact]}
  } catch (error) {
    debug("сборка пакета завершилась с ошибкой", {package: name, error})
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

  const typecheck = executePackageTypecheck(owner)
  pendingTypechecks.set(owner.manifest, typecheck)
  void typecheck.then(
    () => pendingTypechecks.delete(owner.manifest),
    () => pendingTypechecks.delete(owner.manifest),
  )
  debug("запущен единый package typecheck", {package: name, root: owner.root})
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
    console.debug("[@hamiltonian/release:server:build]", event, details)
}
