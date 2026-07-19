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
    const expected = new Map(services.map(({name, modulePath}) => [name, modulePath]))
    const owned = new Set()

    for (const processState of processes) {
      const modulePath = expected.get(processState?.id)
      if (!modulePath || processState.modulePath !== modulePath) continue
      if (processState?.target?.state !== "running") continue
      if (resolve(processState?.target?.cwd ?? "") !== repositoryRoot) continue
      owned.add(processState.id)
    }

    return [...owned]
  } catch {
    return []
  }
}
