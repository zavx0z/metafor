import {constants} from "node:fs"
import {open} from "node:fs/promises"
import {isAbsolute, relative, resolve, sep} from "node:path"
import type {DevelopmentConfiguration} from "../shared/development"

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const only = (value: Record<string, unknown>, fields: readonly string[]) => Object.keys(value).every(key => fields.includes(key))
const text = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f]/u.test(value)
const path = (value: unknown): value is string => text(value) && isAbsolute(value)

/** Самостоятельное private назначение Cosmos; отсутствие не заимствует окружение другого Project. */
export async function readDevelopmentConfiguration(environment: Readonly<Record<string, string | undefined>>): Promise<DevelopmentConfiguration | null> {
  const filename = environment.COSMOS_DEVELOPMENT_CONFIG
  if (filename === undefined) return null
  if (!path(filename)) throw new Error("Invalid Cosmos development assignment path")
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
  let value: unknown
  try {
    const info = await file.stat()
    if (!info.isFile() || (info.mode & 0o777) !== 0o600 || info.uid !== process.getuid?.() || info.size > 262144) throw new Error("Development authority requires an owned private regular file")
    value = JSON.parse(await file.readFile("utf8"))
  } finally {await file.close()}
  if (!object(value) || !only(value, ["version", "id", "rootPackage", "roots", "stateDirectory", "execution", "machine"])
    || value.version !== 1 || !text(value.id) || !text(value.rootPackage) || !path(value.stateDirectory) || !Array.isArray(value.roots)
    || value.roots.length === 0 || value.roots.length > 64 || value.roots.some(root => !object(root) || !only(root, ["name", "directory", "writable"])
      || !text(root.name) || !path(root.directory) || typeof root.writable !== "boolean")) throw new Error("Invalid Cosmos development workspace assignment")
  for (const root of value.roots) {
    if (!root.writable) continue
    const local = relative(resolve(root.directory), resolve(filename))
    if (local === "" || !isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`)) throw new Error("Development authority must be outside writable source roots")
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
  return value as unknown as DevelopmentConfiguration
}
