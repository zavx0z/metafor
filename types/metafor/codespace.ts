/**
 * Closed operations for the host-assigned [Codespace Tool](../../standard/codespace/README.md).
 * Descriptors never grant access and never carry host credentials or executable argv.
 * @packageDocumentation
 */
export const CODESPACE_META = "@metafor/codespace" as const
export const CODESPACE_HOST = "codespace-host" as const
export const CODESPACE_STATUS_METHOD = "existingCodespace.status" as const
export const CODESPACE_START_METHOD = "existingCodespace.start" as const

export type CodespaceOperation = "status" | "start"

/** One explicit request identity; retained pending starts are never retried automatically. */
export interface CodespaceRequest {
  readonly id: string
  readonly operation: CodespaceOperation
}

/** External observation/admission, not a claim that VPN or a model provider is ready. */
export interface CodespaceResult {
  readonly schema: "metafor/codespace/v1"
  readonly version: 1
  readonly operation: CodespaceOperation
  readonly target: {readonly name: string; readonly account: string}
  readonly state: string
  readonly outcome: "observed" | "start-accepted" | "already-running" | "already-starting"
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

export const validCodespaceRequestId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200 &&
  value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value)

/** Fail-closed decoding for public native results and persisted receipts. */
export function isCodespaceResult(value: unknown): value is CodespaceResult {
  if (!record(value) || Object.keys(value).sort().join(",") !== "operation,outcome,schema,state,target,version" ||
      value.schema !== "metafor/codespace/v1" || value.version !== 1 ||
      (value.operation !== "status" && value.operation !== "start") ||
      typeof value.state !== "string" || !/^[A-Za-z][A-Za-z0-9 ]{0,63}$/.test(value.state) ||
      !record(value.target) || Object.keys(value.target).sort().join(",") !== "account,name" ||
      typeof value.target.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(value.target.name) ||
      typeof value.target.account !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(value.target.account)) return false
  if (value.operation === "status") return value.outcome === "observed"
  if (value.outcome === "already-running") return value.state === "Available"
  if (value.outcome === "already-starting") return ["Starting", "Queued", "Provisioning"].includes(value.state)
  return value.outcome === "start-accepted"
}
