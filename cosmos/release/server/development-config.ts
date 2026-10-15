import {constants} from "node:fs"
import {open} from "node:fs/promises"
import {isAbsolute, relative, resolve, sep} from "node:path"
import type {DevelopmentConfiguration} from "../shared/development"

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const only = (value: Record<string, unknown>, fields: readonly string[]) => Object.keys(value).every(key => fields.includes(key))
const text = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f]/u.test(value)
const path = (value: unknown): value is string => text(value) && isAbsolute(value)

/**
Самостоятельное private назначение Cosmos; отсутствие не заимствует окружение
другого Project. Базовый v1 сохраняет прежние поля для чтения старым выпуском.
Новые preparation/scenarios читаются только из соседнего
`${COSMOS_DEVELOPMENT_CONFIG}.capabilities.json`: owned 0600 regular file без
symlink, version 1 и workspaceId, совпадающий с id базового назначения.
Отсутствие sidecar сохраняет прежнее поведение. Каждое чтение заново проверяет
оба файла, поэтому изменение capability видно существующему assignment guard.
Проверки: [совместимость private config](../spec/development-config.spec.ts).
*/
export async function readDevelopmentConfiguration(environment: Readonly<Record<string, string | undefined>>): Promise<DevelopmentConfiguration | null> {
  const filename = environment.COSMOS_DEVELOPMENT_CONFIG
  if (filename === undefined) return null
  if (!path(filename)) throw new Error("Invalid Cosmos development assignment path")
  const value = await readPrivateAssignment(filename)
  if (!object(value) || !only(value, ["version", "id", "rootPackage", "roots", "stateDirectory", "execution", "machine"])
    || value.version !== 1 || !text(value.id) || !text(value.rootPackage) || !path(value.stateDirectory) || !Array.isArray(value.roots)
    || value.roots.length === 0 || value.roots.length > 64 || value.roots.some(root => !object(root) || !only(root, ["name", "directory", "writable"])
      || !text(root.name) || !path(root.directory) || typeof root.writable !== "boolean")) throw new Error("Invalid Cosmos development workspace assignment")
  const capabilityFilename = `${filename}.capabilities.json`
  for (const root of value.roots) {
    if (!root.writable) continue
    for (const authority of [filename, capabilityFilename]) {
      const local = relative(resolve(root.directory), resolve(authority))
      if (local === "" || !isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`)) throw new Error("Development authority must be outside writable source roots")
    }
  }
  const execution = value.execution
  if (!object(execution) || !only(execution, ["connections", "connectionId", "approvalMode"]) || !text(execution.connectionId)
    || !Array.isArray(execution.connections) || execution.connections.length === 0 || execution.connections.length > 64
    || execution.approvalMode !== undefined && !["ask", "scoped-autonomous"].includes(String(execution.approvalMode))) throw new Error("Invalid development execution assignment")
  const ids = new Set<string>()
  for (const connection of execution.connections) {
    if (!object(connection) || !only(connection, ["id", "label", "enabled", "provider", "peer", "endpoint"]) || !text(connection.id)
      || !text(connection.label) || typeof connection.enabled !== "boolean" || ids.has(connection.id)
      || !["codex", "ollama", "capsule", "chrome-studio"].includes(String(connection.provider)) || !object(connection.peer)
      || !only(connection.peer, ["peerId", "executorId"]) || !text(connection.peer.peerId) || !text(connection.peer.executorId)) throw new Error("Development requires explicit peer connection descriptors")
    ids.add(connection.id)
    if (connection.provider !== "codex") {
      if (!object(connection.endpoint) || !only(connection.endpoint, connection.provider === "ollama" ? ["url"] : ["url", "profile", "service"])
        || typeof connection.endpoint.url !== "string" || connection.provider !== "ollama" && (typeof connection.endpoint.profile !== "string"
          || !["chatgpt", "deepseek", "qwen"].includes(String(connection.endpoint.service)))) throw new Error("Invalid development peer endpoint descriptor")
    }
  }
  if (!execution.connections.some(connection => connection.id === execution.connectionId && connection.enabled)) throw new Error("Selected development connection is unavailable")
  if (value.machine !== undefined && (!object(value.machine) || !only(value.machine, ["enabled", "hostId", "revision"])
    || typeof value.machine.enabled !== "boolean" || !text(value.machine.hostId) || !text(value.machine.revision))) throw new Error("Invalid machine capability assignment")
  const capabilities = await readPrivateAssignment(capabilityFilename, true)
  if (capabilities === undefined) return value as unknown as DevelopmentConfiguration
  if (!object(capabilities) || !only(capabilities, ["version", "workspaceId", "preparation", "scenarios"])
    || capabilities.version !== 1 || capabilities.workspaceId !== value.id)
    throw new Error("Invalid development capabilities workspace assignment")
  if (capabilities.preparation !== undefined && (!object(capabilities.preparation) || !only(capabilities.preparation, ["enabled", "revision", "inputRoots"])
    || typeof capabilities.preparation.enabled !== "boolean" || !text(capabilities.preparation.revision) || !Array.isArray(capabilities.preparation.inputRoots)
    || capabilities.preparation.inputRoots.length === 0 || capabilities.preparation.inputRoots.length > 1024
    || capabilities.preparation.inputRoots.some(root => !path(root)))) throw new Error("Invalid preparation capability assignment")
  if (capabilities.scenarios !== undefined && (!object(capabilities.scenarios) || !only(capabilities.scenarios, ["compilerPath", "compilerSha256"])
    || !path(capabilities.scenarios.compilerPath) || typeof capabilities.scenarios.compilerSha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(capabilities.scenarios.compilerSha256))) throw new Error("Invalid scenario compiler assignment")
  return {...value, ...(capabilities.preparation === undefined ? {} : {preparation: capabilities.preparation}),
    ...(capabilities.scenarios === undefined ? {} : {scenarios: capabilities.scenarios})} as unknown as DevelopmentConfiguration
}

async function readPrivateAssignment(filename: string, optional = false): Promise<unknown> {
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
    if (optional && error.code === "ENOENT") return undefined
    throw error
  })
  if (!file) return undefined
  try {
    const info = await file.stat()
    if (!info.isFile() || (info.mode & 0o777) !== 0o600 || info.uid !== process.getuid?.() || info.size > 262144)
      throw new Error("Development authority requires an owned private regular file")
    return JSON.parse(await file.readFile("utf8"))
  } finally {await file.close()}
}
