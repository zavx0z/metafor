import {resolve} from "node:path"

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

  const output = development.findIndex((argument) => argument.startsWith("--outfile"))
  development.splice(output === -1 ? development.length : output, 0, "--sourcemap=inline")
  return development
}

/** Возвращает абсолютный artifact path из package-owned build command. */
export function packageArtifactPath(root: string, script: string) {
  const output = buildOutput(packageBuildCommand(script, "production"))
  const artifact = resolve(root, output)
  if (artifact !== root && !artifact.startsWith(`${root}/`))
    throw new Error("Package build outfile must stay inside package root")
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
  let output: string | undefined
  for (let index = 0; index < command.length; index += 1) {
    const argument = command[index]
    if (argument === "--outfile") output = command[index + 1]
    else if (argument?.startsWith("--outfile=")) output = argument.slice("--outfile=".length)
  }
  if (!output) throw new Error("Package build script must define `--outfile`")
  return output
}
