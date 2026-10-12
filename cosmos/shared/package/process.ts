const identityEnvironment = "COSMOS_PACKAGE_IDENTITY"
const modeEnvironment = "COSMOS_PROCESS_MODE"
const transitionEnvironment = "COSMOS_PROCESS_TRANSITION"

/** Exact identity одного запускаемого server package artifact. */
export interface ServerProcessIdentity {
  readonly env: "server" | "server-worker"
  readonly name: string
  readonly sha256: string
  readonly size: number
  readonly version: string
}

/** Единственное подтверждение полного запуска server package process. */
export interface ServerProcessReady {
  readonly type: "ready"
  readonly identity: ServerProcessIdentity
}

export function serverProcessIdentityEnvironment(identity: ServerProcessIdentity) {
  return {[identityEnvironment]: JSON.stringify(identity)}
}

export function currentServerProcessIdentity(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ServerProcessIdentity {
  const source = env[identityEnvironment]
  if (!source) throw new Error("Server package process identity is missing")
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error("Server package process identity is invalid")
  }
  if (!isServerProcessIdentity(value)) throw new Error("Server package process identity is invalid")
  return value
}

export function serverProcessReady(identity: ServerProcessIdentity): ServerProcessReady {
  return {type: "ready", identity}
}

export function readServerProcessReady(value: unknown): ServerProcessReady | null {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.keys(value).length !== 2
    || (value as Record<string, unknown>).type !== "ready"
    || !isServerProcessIdentity((value as Record<string, unknown>).identity)
  ) return null
  return value as ServerProcessReady
}

export function isServerProcessIdentity(value: unknown): value is ServerProcessIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const identity = value as Record<string, unknown>
  return Object.keys(identity).length === 5
    && typeof identity.name === "string"
    && (identity.env === "server" || identity.env === "server-worker")
    && typeof identity.version === "string"
    && /^\d+\.\d+\.\d+$/.test(identity.version)
    && typeof identity.sha256 === "string"
    && /^[0-9a-f]{64}$/.test(identity.sha256)
    && typeof identity.size === "number"
    && Number.isSafeInteger(identity.size)
    && identity.size > 0
}

export function sameServerProcessIdentity(
  left: ServerProcessIdentity,
  right: ServerProcessIdentity,
) {
  return left.name === right.name
    && left.env === right.env
    && left.version === right.version
    && left.sha256 === right.sha256
    && left.size === right.size
}

/** Режим нового process; отсутствие declaration сохраняет прежний one-shot запуск. */
export interface ServerProcessLaunch {
  readonly mode: "active" | "prepared"
  readonly transitionId: string
}

export type ServerProcessOperation = "quiesce" | "resume" | "unbind" | "bind" | "admit"
export type ServerProcessLifecycleType = "prepared" | "quiesced" | "resumed" | "unbound" | "ready" | "admitted"

/** Команда конкретной incarnation: чужая identity и чужой переход не получают ACK. */
export interface ServerProcessCommand {
  readonly type: ServerProcessOperation
  readonly identity: ServerProcessIdentity
  readonly transitionId: string
}

/** Подтверждение одной границы staged запуска; legacy ready остаётся отдельной формой. */
export interface ServerProcessLifecycle {
  readonly type: ServerProcessLifecycleType
  readonly identity: ServerProcessIdentity
  readonly transitionId: string
}

/** Отказ операции до ACK, не разрешающий restart либо rollback. */
export interface ServerProcessFailure {
  readonly type: "failed"
  readonly operation: ServerProcessOperation | "prepare"
  readonly identity: ServerProcessIdentity
  readonly transitionId: string
  readonly error: string
}

/** Release запрашивает только установленную цель; executable path выбирает parent. */
export interface ServerProcessHandoverRequest {
  readonly type: "handover-request"
  readonly requestId: string
  readonly target: string
}

export type ServerProcessHandoverResult =
  | {readonly type: "handover-result"; readonly requestId: string; readonly success: true}
  | {readonly type: "handover-result"; readonly requestId: string; readonly success: false; readonly error: string}

export function serverProcessLaunchEnvironment(launch: ServerProcessLaunch) {
  return {[modeEnvironment]: launch.mode, [transitionEnvironment]: launch.transitionId}
}

/** Читает production staged declaration, не придумывая режим для legacy child. */
export function currentServerProcessLaunch(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ServerProcessLaunch | null {
  const mode = env[modeEnvironment]
  const transitionId = env[transitionEnvironment]
  if (mode === undefined && transitionId === undefined) return null
  if ((mode !== "active" && mode !== "prepared") || !nonempty(transitionId))
    throw new Error("Server package process launch is invalid")
  return {mode, transitionId}
}

export function serverProcessCommandMessage(
  type: ServerProcessOperation,
  identity: ServerProcessIdentity,
  transitionId: string,
): ServerProcessCommand {
  return {type, identity, transitionId}
}

export function serverProcessLifecycle(
  type: ServerProcessLifecycleType,
  identity: ServerProcessIdentity,
  transitionId: string,
): ServerProcessLifecycle {
  return {type, identity, transitionId}
}

export function serverProcessFailure(
  operation: ServerProcessFailure["operation"],
  identity: ServerProcessIdentity,
  transitionId: string,
  error: string,
): ServerProcessFailure {
  return {type: "failed", operation, identity, transitionId, error}
}

export function readServerProcessCommand(value: unknown): ServerProcessCommand | null {
  return stageEnvelope(value) && operation(value.type) ? value as unknown as ServerProcessCommand : null
}

export function readServerProcessLifecycle(value: unknown): ServerProcessLifecycle | null {
  return stageEnvelope(value) && ["prepared", "quiesced", "resumed", "unbound", "ready", "admitted"].includes(value.type as string)
    ? value as unknown as ServerProcessLifecycle : null
}

export function readServerProcessFailure(value: unknown): ServerProcessFailure | null {
  if (!exact(value, ["type", "operation", "identity", "transitionId", "error"])) return null
  return value.type === "failed" && (operation(value.operation) || value.operation === "prepare")
    && isServerProcessIdentity(value.identity) && nonempty(value.transitionId) && nonempty(value.error)
    ? value as unknown as ServerProcessFailure : null
}

export function readServerProcessHandoverRequest(value: unknown): ServerProcessHandoverRequest | null {
  return exact(value, ["type", "requestId", "target"]) && value.type === "handover-request"
    && nonempty(value.requestId) && nonempty(value.target)
    ? value as unknown as ServerProcessHandoverRequest : null
}

export function readServerProcessHandoverResult(value: unknown): ServerProcessHandoverResult | null {
  if (!exact(value, ["type", "requestId", "success"]) && !exact(value, ["type", "requestId", "success", "error"])) return null
  if (value.type !== "handover-result" || !nonempty(value.requestId)) return null
  if (value.success === true && Object.keys(value).length === 3) return value as unknown as ServerProcessHandoverResult
  return value.success === false && nonempty(value.error) ? value as unknown as ServerProcessHandoverResult : null
}

function stageEnvelope(value: unknown): value is Record<string, unknown> {
  return exact(value, ["type", "identity", "transitionId"])
    && isServerProcessIdentity(value.identity) && nonempty(value.transitionId)
}

function operation(value: unknown): value is ServerProcessOperation {
  return typeof value === "string" && ["quiesce", "resume", "unbind", "bind", "admit"].includes(value)
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
}
