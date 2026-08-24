const identityEnvironment = "COSMOS_PACKAGE_IDENTITY"

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
