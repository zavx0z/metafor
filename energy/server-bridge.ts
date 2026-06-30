import type {Buffer} from "node:buffer"
import type {BoundaryUpdateMessage} from "boundary"
import type {EnergyEnv, EnergyMass, EnergyProcessResult, EnergyProcessTask, EnergyRuntimeKind} from "./energy.t.ts"
import type {EnergyBridgeIncomingMessage, EnergyBridgeOutgoingMessage, EnergyServerSocketState, EnergyServerStatus} from "./server.t.ts"

const runtimeKinds = new Set<EnergyRuntimeKind>([
  "server",
  "browser-main",
  "worker",
  "service-worker",
  "desktop-main",
  "unknown",
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isPositiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

const stringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined

export function bridgeUrlWithToken(rawUrl: string, token: string | null): string {
  if (token === null || token.length === 0) return rawUrl
  const url = new URL(rawUrl)
  url.searchParams.set("token", token)
  return url.toString()
}

export function readEnergyBridgeIncomingMessage(raw: string | Buffer): EnergyBridgeIncomingMessage | null {
  let value: unknown
  try {
    value = JSON.parse(String(raw))
  } catch {
    return null
  }
  if (!isRecord(value) || typeof value.type !== "string") return null

  if (value.type === "force") {
    return Array.isArray(value.parts)
      ? {type: "force", parts: value.parts as BoundaryUpdateMessage["parts"]}
      : null
  }
  if (value.type === "process-task") {
    const task = readProcessTask(value.task)
    return value.version === 1 && task !== null ? {type: "process-task", version: 1, task} : null
  }
  if (value.type === "claim-accepted") {
    return isPositiveId(value.actorId) && isPositiveId(value.processId)
      ? {type: "claim-accepted", actorId: value.actorId, processId: value.processId, ...(typeof value.token === "string" ? {token: value.token} : {})}
      : null
  }
  if (value.type === "claim-rejected") {
    return isPositiveId(value.actorId) && isPositiveId(value.processId) && typeof value.reason === "string"
      ? {type: "claim-rejected", actorId: value.actorId, processId: value.processId, reason: value.reason}
      : null
  }
  if (value.type === "error") {
    return typeof value.error === "string" ? {type: "error", error: value.error} : null
  }

  return null
}

export function createEnergyServerStatus(input: {
  pid: number
  startedAt: string
  host: string
  port: number
  bridgeUrl: string
  socketState: EnergyServerSocketState
  env: EnergyEnv
  activeTasks: number
  completedTasks: number
  failedTasks: number
  lastTaskAt: string | null
  lastResultAt: string | null
  lastError: string | null
}): EnergyServerStatus {
  return {
    ok: true,
    runtime: "energy",
    pid: input.pid,
    startedAt: input.startedAt,
    host: input.host,
    port: input.port,
    bridgeUrl: input.bridgeUrl,
    socketState: input.socketState,
    connected: input.socketState === "connected",
    env: input.env,
    activeTasks: input.activeTasks,
    completedTasks: input.completedTasks,
    failedTasks: input.failedTasks,
    lastTaskAt: input.lastTaskAt,
    lastResultAt: input.lastResultAt,
    lastError: input.lastError,
  }
}

export function createEnergyHello(env: EnergyEnv, pid: number, startedAt: string): EnergyBridgeOutgoingMessage {
  return {type: "hello", runtime: "energy", env, pid, startedAt}
}

export function createEnergyClaim(task: EnergyProcessTask, env: EnergyEnv, token: string): EnergyBridgeOutgoingMessage {
  return {
    type: "claim",
    actorId: task.actorId,
    processId: task.processId,
    token,
    env,
    ...(task.mass !== undefined ? {mass: task.mass} : {}),
  }
}

export function createEnergySuccessForce(result: Extract<EnergyProcessResult, {ok: true}>): BoundaryUpdateMessage {
  return {
    parts: [{
      part: "w+",
      op: "replace",
      path: result.actorId,
      processId: result.processId,
      ...(result.token !== undefined ? {token: result.token} : {}),
      value: {fields: result.fields},
    }],
  }
}

export function createEnergyFailureForce(result: Extract<EnergyProcessResult, {ok: false}>): BoundaryUpdateMessage {
  return {
    parts: [{
      part: "w-",
      op: "replace",
      path: result.actorId,
      processId: result.processId,
      ...(result.token !== undefined ? {token: result.token} : {}),
      value: {
        error: result.error,
        ...(result.fields !== undefined ? {fields: result.fields} : {}),
      },
    }],
  }
}

function readProcessTask(value: unknown): EnergyProcessTask | null {
  if (!isRecord(value) || !isPositiveId(value.actorId) || !isPositiveId(value.processId)) return null
  if (typeof value.state !== "string" && typeof value.state !== "number") return null
  const mass = readMass(value.mass)
  if (value.mass !== undefined && mass === null) return null
  if (value.fields !== undefined && !isRecord(value.fields)) return null
  if (value.env !== undefined && !isRecord(value.env)) return null
  return {
    actorId: value.actorId,
    state: value.state,
    processId: value.processId,
    ...(typeof value.token === "string" ? {token: value.token} : {}),
    ...(isRecord(value.env) ? {env: value.env} : {}),
    ...(mass !== undefined && mass !== null ? {mass} : {}),
    ...(isRecord(value.fields) ? {fields: value.fields} : {}),
  }
}

export function readEnergyEnv(value: unknown): EnergyEnv | null {
  if (!isRecord(value) || typeof value.kind !== "string" || !runtimeKinds.has(value.kind as EnergyRuntimeKind)) return null
  if (typeof value.id !== "string" || value.id.length === 0) return null
  const labels = stringArray(value.labels)
  const capabilities = stringArray(value.capabilities)
  if (value.labels !== undefined && labels === undefined) return null
  if (value.capabilities !== undefined && capabilities === undefined) return null
  return {
    kind: value.kind as EnergyRuntimeKind,
    id: value.id,
    ...(labels !== undefined ? {labels} : {}),
    ...(capabilities !== undefined ? {capabilities} : {}),
  }
}

function readMass(value: unknown): EnergyMass | null | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return null
  const transport = optionalString(value.transport)
  if (transport !== undefined && transport !== "websocket" && transport !== "local" && transport !== "worker" && transport !== "service-worker") return null
  const labels = stringArray(value.labels)
  if (value.labels !== undefined && labels === undefined) return null
  return {
    ...(isPositiveId(value.actorId) ? {actorId: value.actorId} : {}),
    ...(isPositiveId(value.deviceActorId) ? {deviceActorId: value.deviceActorId} : {}),
    ...(typeof value.connectionId === "string" ? {connectionId: value.connectionId} : {}),
    ...(transport !== undefined ? {transport} : {}),
    ...(labels !== undefined ? {labels} : {}),
  }
}
