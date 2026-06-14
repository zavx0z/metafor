import {isAbsolute, relative, resolve} from "node:path"
import {inspectModeFromCommand, type InspectMode} from "./inspect-mode.ts"

export type CliStartupModule = {
  id: string
  label: string
  modulePath: string
  command: string[]
  cwd: string
  env?: Record<string, string>
  pauseOnStart: boolean
  inspectMode: InspectMode
}

export type CliStartupTargets = {
  modules: CliStartupModule[]
  sqliteDatabases: string[]
}

export function startupTargetsFromArgs(rawArgs: string[], cwd = process.cwd()): CliStartupTargets {
  const args = stripLeadingSeparator(rawArgs)
  if (args.length === 0) return {modules: [], sqliteDatabases: []}

  const modules: CliStartupModule[] = []
  const sqliteDatabases: string[] = []
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
    if (isSqliteDatabaseArg(arg)) sqliteDatabases.push(resolveStartupPath(arg, cwd))
    else currentPath = arg
  }
  pushCurrent()
  return {modules, sqliteDatabases}
}

export function startupModulesFromArgs(rawArgs: string[], cwd = process.cwd()): CliStartupModule[] {
  return startupTargetsFromArgs(rawArgs, cwd).modules
}

function startupModuleFromPath(inputPath: string, params: string[], cwd: string): CliStartupModule {
  const resolvedPath = resolveStartupPath(inputPath, cwd)
  const label = displayPath(resolvedPath, cwd)
  const parsedParams = parseModuleParams(params)
  const normalizedParams = parsedParams.params.map(normalizeModuleParam)
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
    ...(Object.keys(parsedParams.env).length === 0 ? {} : {env: parsedParams.env}),
    pauseOnStart: inspectMode === "brk",
    inspectMode,
  }
}

function parseModuleParams(params: string[]): {params: string[]; env: Record<string, string>} {
  const env: Record<string, string> = {}
  const rest: string[] = []

  for (const param of params) {
    const match = /^--?env\.([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(param)
    if (match) {
      const [, key, value] = match
      if (key === undefined || value === undefined) continue
      env[key] = value
      continue
    }
    rest.push(param)
  }

  return {params: rest, env}
}

function isSqliteDatabaseArg(path: string): boolean {
  return /\.sqlite$/i.test(path.trim().replaceAll("\\", "/").replace(/[?#].*$/, ""))
}

function resolveStartupPath(inputPath: string, cwd: string): string {
  return (isAbsolute(inputPath) ? inputPath : resolve(cwd, inputPath)).replaceAll("\\", "/")
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
