import {basename, resolve} from "node:path"

interface PackageProgrammaticBuildBase {
  readonly conditions: readonly string[]
  readonly drop: readonly string[]
  readonly entrypoint: string
  readonly external: readonly string[]
  readonly format?: "esm" | "cjs" | "iife"
  readonly minify: true
  readonly packages?: "bundle" | "external"
  readonly profile: "development" | "production"
  readonly sourcemap: "none" | "linked" | "inline" | "external"
  readonly target: "browser" | "bun"
}

/** Проверенный immutable single-entry план isolated build adapter. */
export interface PackageSingleBuildPlan extends PackageProgrammaticBuildBase {
  readonly mode: "single"
  readonly outfile: string
}

/** Проверенный immutable multi-entry план одной memory build operation. */
export interface PackageMultiBuildPlan extends PackageProgrammaticBuildBase {
  readonly mode: "multi"
  readonly outdir: string
  readonly splitting: true
}

export type PackageProgrammaticBuildPlan = PackageSingleBuildPlan | PackageMultiBuildPlan

/**
Читает env production command и адаптирует только общий development profile.

Entry point, target, format, external и outfile всегда принадлежат package.
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
    if (argument === undefined || argument === "--production") continue
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

  const output = development.findIndex((argument) =>
    argument.startsWith("--outfile") || argument.startsWith("--outdir"))
  development.splice(output === -1 ? development.length : output, 0, "--sourcemap=inline")
  return development
}

/**
Переводит уже действующую direct `bun build` command в закрытый план JavaScript
API, не отдавая plugin module доступ к build parameters.

Single mode сохраняет `--outfile`. Multi mode принимает один canonical root
source из command, требует `--outdir` и `--splitting`, а полный список
entrypoints получает отдельно из exports graph. Compile, naming и произвольные
CLI flags не проходят через adapter неявно.

@param script - Package-owned production command из `scripts.build:<env>`.
@param profile - Выбранный release profile; development сохраняет действующее
  преобразование {@link packageBuildCommand}.
@param mode - Output cardinality, уже выведенная из buildable exports graph.

@returns Полностью разобранный single- либо multi-entry план.

@throws Если command неоднозначна, содержит unsupported flag либо нарушает
  действующий production/development profile.
*/
export function packageProgrammaticBuildPlan(
  script: string,
  profile: "development" | "production",
  mode: "single" | "multi",
): PackageProgrammaticBuildPlan {
  const command = packageBuildCommand(script, profile)
  const entrypoints: string[] = []
  const conditions: string[] = []
  const drop: string[] = []
  const external: string[] = []
  let target: PackageProgrammaticBuildBase["target"] | undefined
  let format: PackageProgrammaticBuildBase["format"]
  let packages: PackageProgrammaticBuildBase["packages"]
  let outfile: string | undefined
  let outdir: string | undefined
  let sourcemap: PackageProgrammaticBuildBase["sourcemap"] = "none"
  let production = false
  let minify = false
  let splitting = false

  for (let index = 2; index < command.length; index += 1) {
    const argument = command[index]
    if (argument === undefined) continue
    if (!argument.startsWith("-")) {
      entrypoints.push(argument)
      continue
    }
    if (argument === "--production") {
      if (production) throw duplicateBuildArgument(argument)
      production = true
      continue
    }
    if (argument === "--minify") {
      if (minify) throw duplicateBuildArgument(argument)
      minify = true
      continue
    }
    if (argument === "--splitting") {
      if (splitting) throw duplicateBuildArgument(argument)
      splitting = true
      continue
    }
    if (argument === "--drop" || argument.startsWith("--drop=")) {
      const value = optionValue(command, index, "--drop")
      index += value.consumed
      drop.push(value.value)
      continue
    }
    if (argument === "--external" || argument === "-e" || argument.startsWith("--external=")) {
      const flag = argument === "-e" ? "-e" : "--external"
      const value = optionValue(command, index, flag)
      index += value.consumed
      external.push(value.value)
      continue
    }
    if (argument === "--conditions" || argument.startsWith("--conditions=")) {
      const value = optionValue(command, index, "--conditions")
      index += value.consumed
      conditions.push(value.value)
      continue
    }
    if (argument === "--target" || argument.startsWith("--target=")) {
      if (target !== undefined) throw duplicateBuildArgument("--target")
      const value = optionValue(command, index, "--target")
      index += value.consumed
      if (value.value !== "browser" && value.value !== "bun")
        throw new Error(`Package plugin build target is unsupported: ${value.value}`)
      target = value.value
      continue
    }
    if (argument === "--format" || argument.startsWith("--format=")) {
      if (format !== undefined) throw duplicateBuildArgument("--format")
      const value = optionValue(command, index, "--format")
      index += value.consumed
      if (value.value !== "esm" && value.value !== "cjs" && value.value !== "iife")
        throw new Error(`Package plugin build format is unsupported: ${value.value}`)
      format = value.value
      continue
    }
    if (argument === "--packages" || argument.startsWith("--packages=")) {
      if (packages !== undefined) throw duplicateBuildArgument("--packages")
      const value = optionValue(command, index, "--packages")
      index += value.consumed
      if (value.value !== "bundle" && value.value !== "external")
        throw new Error(`Package plugin build packages mode is unsupported: ${value.value}`)
      packages = value.value
      continue
    }
    if (argument === "--sourcemap" || argument.startsWith("--sourcemap=")) {
      if (sourcemap !== "none") throw duplicateBuildArgument("--sourcemap")
      const value = optionValue(command, index, "--sourcemap")
      index += value.consumed
      if (!["none", "linked", "inline", "external"].includes(value.value))
        throw new Error(`Package plugin build sourcemap is unsupported: ${value.value}`)
      sourcemap = value.value as PackageProgrammaticBuildBase["sourcemap"]
      continue
    }
    if (argument === "--outfile" || argument.startsWith("--outfile=")) {
      if (outfile !== undefined) throw duplicateBuildArgument("--outfile")
      const value = optionValue(command, index, "--outfile")
      index += value.consumed
      outfile = value.value
      continue
    }
    if (argument === "--outdir" || argument.startsWith("--outdir=")) {
      if (outdir !== undefined) throw duplicateBuildArgument("--outdir")
      const value = optionValue(command, index, "--outdir")
      index += value.consumed
      outdir = value.value
      continue
    }
    throw new Error(`Package plugin build argument is unsupported: ${argument}`)
  }

  if (entrypoints.length !== 1)
    throw new Error("Package plugin build must define exactly one entrypoint")
  if (conditions.length === 0)
    throw new Error("Package plugin build must define at least one condition")
  if (target === undefined) throw new Error("Package plugin build must define one target")
  if (!minify) throw new Error("Package plugin build must enable minify")
  if (profile === "production" && !production)
    throw new Error("Package production plugin build must enable production")
  if (profile === "development" && production)
    throw new Error("Package development plugin build must not enable production")
  if (profile === "development" && sourcemap !== "inline")
    throw new Error("Package development plugin build must use an inline source map")
  if (profile === "production" && sourcemap !== "none")
    throw new Error("Package production plugin build must not emit a source map")

  const base = {
    conditions: Object.freeze(conditions),
    drop: Object.freeze(drop),
    entrypoint: entrypoints[0]!,
    external: Object.freeze(external),
    ...(format === undefined ? {} : {format}),
    minify: true,
    ...(packages === undefined ? {} : {packages}),
    profile,
    sourcemap,
    target,
  } as const
  if (mode === "single") {
    if (!outfile || outdir !== undefined || splitting)
      throw new Error("Package single-entry plugin build requires only one outfile")
    return Object.freeze({...base, mode, outfile})
  }
  if (!outdir || outfile !== undefined || !splitting)
    throw new Error("Package multi-entry build requires one outdir and splitting")
  return Object.freeze({...base, mode, outdir, splitting: true})
}

/** Возвращает абсолютный artifact path из package-owned build command. */
export function packageArtifactPath(root: string, script: string) {
  const command = packageBuildCommand(script, "production")
  const output = buildOutput(command)
  if (output.kind === "outdir") {
    const entrypoint = command[2]
    if (!entrypoint || entrypoint.startsWith("-"))
      throw new Error("Package build script must define one root entrypoint")
    const file = basename(entrypoint).replace(/\.[^.\/]+$/, ".js")
    return containedBuildPath(root, resolve(root, output.path, file), "outdir")
  }
  return containedBuildPath(root, output.path, "outfile")
}

function containedBuildPath(root: string, output: string, label: "outdir" | "outfile") {
  const artifact = resolve(root, output)
  if (artifact !== root && !artifact.startsWith(`${root}/`))
    throw new Error(`Package build ${label} must stay inside package root`)
  return artifact
}

/** Перенаправляет package build в staging artifact, не меняя остальные параметры. */
export function withPackageBuildOutput(command: readonly string[], artifact: string) {
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

function buildOutput(command: readonly string[]) {
  let outfile: string | undefined
  let outdir: string | undefined
  for (let index = 0; index < command.length; index += 1) {
    const argument = command[index]
    if (argument === "--outfile") outfile = command[index + 1]
    else if (argument?.startsWith("--outfile=")) outfile = argument.slice("--outfile=".length)
    else if (argument === "--outdir") outdir = command[index + 1]
    else if (argument?.startsWith("--outdir=")) outdir = argument.slice("--outdir=".length)
  }
  if (Boolean(outfile) === Boolean(outdir))
    throw new Error("Package build script must define exactly one outfile or outdir")
  return outfile
    ? {kind: "outfile" as const, path: outfile}
    : {kind: "outdir" as const, path: outdir!}
}

function optionValue(command: readonly string[], index: number, flag: string) {
  const argument = command[index]!
  const prefix = `${flag}=`
  if (argument.startsWith(prefix)) {
    const value = argument.slice(prefix.length)
    if (!value) throw new Error(`Package plugin build ${flag} value is missing`)
    return {value, consumed: 0}
  }
  const value = command[index + 1]
  if (!value || value.startsWith("-"))
    throw new Error(`Package plugin build ${flag} value is missing`)
  return {value, consumed: 1}
}

function duplicateBuildArgument(argument: string) {
  return new Error(`Package plugin build argument is duplicated: ${argument}`)
}
