import {existsSync} from "node:fs"
import {homedir} from "node:os"
import {join, resolve} from "node:path"
import {spawnSync} from "node:child_process"

/**
 * Определяет единственного владельца development-контура.
 *
 * MetaFor Dev имеет приоритет только для созданной им process group. Контур
 * Interpreter считается штатным, пока каждый отвечающий домен присутствует в
 * его `process.list`. Любое смешанное или неизвестное владение безопасно
 * классифицируется как external.
 */
export const classifyWorldOwner = ({
  metaforDevOwned = false,
  interpreterServices = [],
  healthyServices = [],
} = {}) => {
  if (metaforDevOwned) return "metafor-dev"

  const interpreter = new Set(interpreterServices)
  const healthy = new Set(healthyServices)
  if (interpreter.size > 0 && [...healthy].every((name) => interpreter.has(name))) {
    return "interpreter"
  }
  if (healthy.size > 0) return "external"
  return "none"
}

const findInterpreterClient = () => {
  const configured = process.env.METAFOR_INTERPRETER_CLIENT?.trim()
  const codexHome = process.env.CODEX_HOME?.trim()
  const candidates = [
    configured,
    codexHome ? join(codexHome, "skills/interpreter/scripts/interpreter.ts") : undefined,
    join(homedir(), ".codex/skills/interpreter/scripts/interpreter.ts"),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    const path = resolve(candidate)
    if (existsSync(path)) return path
  }
  return undefined
}

export const interpreterProcessMatchesService = ({processState, service, repositoryRoot}) => {
  if (processState?.id !== service?.name) return false
  if (processState?.target?.state !== "running") return false

  const root = resolve(repositoryRoot)
  const targetCwd = processState?.target?.cwd
  if (typeof targetCwd !== "string" || resolve(targetCwd) !== root) return false

  const expectedModulePath = resolve(root, service.modulePath)
  if (typeof processState.modulePath === "string" && processState.modulePath.trim()) {
    return resolve(root, processState.modulePath) === expectedModulePath
  }

  const command = Array.isArray(processState?.target?.command) ? processState.target.command : []
  return command.some((argument) => (
    typeof argument === "string"
    && !argument.startsWith("-")
    && resolve(root, argument) === expectedModulePath
  ))
}

/** Читает только зарегистрированные Interpreter процессы текущего проекта. */
export const readInterpreterServices = ({repositoryRoot, services}) => {
  const client = findInterpreterClient()
  if (!client) return []

  const result = spawnSync(process.execPath, [client, "call", "process.list", "{}"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 2_500,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  })
  if (result.status !== 0 || !result.stdout) return []

  try {
    const payload = JSON.parse(result.stdout)
    const processes = Array.isArray(payload?.result?.processes) ? payload.result.processes : []
    const expected = new Map(services.map((service) => [service.name, service]))
    const owned = new Set()

    for (const processState of processes) {
      const service = expected.get(processState?.id)
      if (!service || !interpreterProcessMatchesService({processState, service, repositoryRoot})) continue
      owned.add(processState.id)
    }

    return [...owned]
  } catch {
    return []
  }
}
