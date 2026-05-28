import {isAbsolute, relative, resolve} from "node:path"
import {inspectModeFromCommand, type InspectMode} from "./inspect-mode.ts"

export type CliStartupModule = {
  id: string
  label: string
  modulePath: string
  command: string[]
  cwd: string
  pauseOnStart: boolean
  inspectMode: InspectMode
}

export function startupModulesFromArgs(rawArgs: string[], cwd = process.cwd()): CliStartupModule[] {
  const args = stripLeadingSeparator(rawArgs)
  if (args.length === 0) return []

  const modules: CliStartupModule[] = []
  let currentPath: string | undefined
  let currentParams: string[] = []

  const pushCurrent = (): void => {
    if (currentPath === undefined) return
    modules.push(startupModuleFromPath(currentPath, currentParams, cwd))
    currentPath = undefined
    currentParams = []
  }

  for (const arg of args) {
    if (arg.startsWith("-")) {
      if (currentPath === undefined) {
        throw new Error(`module parameter '${arg}' must follow a module path`)
      }
      currentParams.push(arg)
      continue
    }

    pushCurrent()
    currentPath = arg
  }
  pushCurrent()
  return modules
}

function startupModuleFromPath(inputPath: string, params: string[], cwd: string): CliStartupModule {
  const resolvedPath = isAbsolute(inputPath) ? inputPath : resolve(cwd, inputPath)
  const label = displayPath(resolvedPath, cwd)
  const normalizedParams = params.map(normalizeModuleParam)
  const command = isTestModulePath(resolvedPath)
    ? ["bun", "test", ...normalizedParams, resolvedPath]
    : ["bun", resolvedPath, ...normalizedParams]
  const inspectMode = inspectModeFromCommand(command) ?? "brk"
  return {
    id: moduleIdFromPath(label),
    label,
    modulePath: resolvedPath,
    command,
    cwd,
    pauseOnStart: inspectMode === "brk",
    inspectMode,
  }
}

function stripLeadingSeparator(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args
}

function normalizeModuleParam(param: string): string {
  if (!param.startsWith("-") || param === "-") return param
  if (param.startsWith("--")) return param
  return `-${param}`
}

function isTestModulePath(path: string): boolean {
  return /\.(?:spec|test)\.[cm]?[jt]sx?$/i.test(path)
}

function displayPath(path: string, cwd: string): string {
  const rel = relative(cwd, path).replaceAll("\\", "/")
  return rel.length > 0 && !rel.startsWith("../") && rel !== ".."
    ? rel
    : path.replaceAll("\\", "/")
}

function moduleIdFromPath(path: string): string {
  const slug = path
    .trim()
    .toLowerCase()
    .replaceAll("\\", "/")
    .replace(/^[a-z]:/i, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
  return slug.length > 0 ? slug : "module"
}
