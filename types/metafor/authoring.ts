import {
  parseMetaAddress,
  type JsonPointer,
  type MetaAddress,
  type ValidationIssue,
  type ValidationResult,
} from "./graph.ts"

export const META_AUTHORING_CONTRACT_VERSION = 1 as const

export const META_CAPABILITIES_READ_METHOD = "meta.capabilities.read" as const
export const META_SOURCE_REVISION_READ_METHOD = "meta.source.revision.read" as const
export const META_CREATE_METHOD = "meta.create" as const
export const META_MATTER_APPLY_METHOD = "meta.matter.apply" as const

export const META_SOURCE_READ_CAPABILITY = "meta.source.read" as const
export const META_CREATE_CAPABILITY = "meta.create" as const
export const META_MATTER_WRITE_CAPABILITY = "meta.matter.write" as const

export type MetaAuthoringMethod =
  | typeof META_CAPABILITIES_READ_METHOD
  | typeof META_SOURCE_REVISION_READ_METHOD
  | typeof META_CREATE_METHOD
  | typeof META_MATTER_APPLY_METHOD

export type MetaAuthoringCapabilityId =
  | typeof META_SOURCE_READ_CAPABILITY
  | typeof META_CREATE_CAPABILITY
  | typeof META_MATTER_WRITE_CAPABILITY

export type MetaAuthoringOperationClass = "source_read" | "create" | "matter"

export interface MetaAuthoringCapability {
  capability: MetaAuthoringCapabilityId
  method: MetaAuthoringMethod
  scopes: readonly MetaAddress[]
  operationClass: MetaAuthoringOperationClass
  liveState: boolean
  gitCommit: boolean
}

export type MetaAuthoringOperationId = string
export type MetaSourceRevision = `sha256:${string}`
export type MetaAuthoringRequestDigest = `sha256:${string}`

export const META_MATTER_AUTHORING_CAUSE_SCHEMA_V1 =
  "metafor/matter-authoring-cause/v1" as const

export interface MetaMatterSourceProjectionV1 {
  address: MetaAddress
  beforeRevision: MetaSourceRevision
  afterRevision: MetaSourceRevision
}

/** Immutable RPC causation stored in the same Dark Force history row. */
export interface MetaMatterAuthoringCauseV1 {
  schema: typeof META_MATTER_AUTHORING_CAUSE_SCHEMA_V1
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  rpcSource: string
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  sourceProjections: MetaMatterSourceProjectionV1[]
}

export interface MetaForceAcceptanceIdentity {
  cutId: string
  sequence: number
  id: string
}

export interface MetaMatterApplyReceipt {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  phase: "source_pending"
  acceptance: MetaForceAcceptanceIdentity
  sourceProjections: MetaMatterSourceProjectionV1[]
  boundary: "applied"
}

interface MetaAuthoringWriteEnvelope {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  operationId: MetaAuthoringOperationId
}

export interface MetaCreateRequest extends MetaAuthoringWriteEnvelope {
  capability: typeof META_CREATE_CAPABILITY
  address: MetaAddress
  name: string
  description: string
  profile: "empty"
  target: "absent"
}

export interface MetaMatterSourcePrecondition {
  address: MetaAddress
  revision: MetaSourceRevision
}

interface MetaMatterRequestBase extends MetaAuthoringWriteEnvelope {
  capability: typeof META_MATTER_WRITE_CAPABILITY
  child: MetaAddress
  revisions: MetaMatterSourcePrecondition[]
}

export interface MetaMatterAddRequest extends MetaMatterRequestBase {
  operation: "add"
  toParent: MetaAddress
}

export interface MetaMatterMoveRequest extends MetaMatterRequestBase {
  operation: "move"
  fromParent: MetaAddress
  toParent: MetaAddress
}

export interface MetaMatterRemoveRequest extends MetaMatterRequestBase {
  operation: "remove"
  fromParent: MetaAddress
}

export type MetaMatterRequest =
  | MetaMatterAddRequest
  | MetaMatterMoveRequest
  | MetaMatterRemoveRequest

export interface MetaAuthoringValidationContext {
  capabilities: readonly MetaAuthoringCapability[]
  currentRevision(address: MetaAddress): MetaSourceRevision | null
}

type RecordValue = Record<string, unknown>

const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SOURCE_REVISION = /^sha256:[a-f0-9]{64}$/

const pointerToken = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1")

const childPath = (path: JsonPointer, key: string | number): JsonPointer =>
  `${path}/${pointerToken(String(key))}` as JsonPointer

const isPlainRecord = (value: unknown): value is RecordValue => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

class AuthoringValidator {
  readonly issues: ValidationIssue[] = []

  issue(path: JsonPointer, code: string, message: string): void {
    this.issues.push({path, code, message})
  }

  record(value: unknown, path: JsonPointer, name: string): value is RecordValue {
    if (!isPlainRecord(value)) {
      this.issue(path, "invalid_type", `${name} must be a plain object`)
      return false
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        this.issue(path, "non_json_value", `${name} must not contain symbol properties`)
        return false
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        this.issue(childPath(path, key), "non_json_value", `Property "${key}" must be enumerable JSON data`)
        return false
      }
    }
    return true
  }

  array(value: unknown, path: JsonPointer, name: string): value is unknown[] {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      this.issue(path, "invalid_type", `${name} must be a plain array`)
      return false
    }
    const expectedKeys = new Set<string>(["length"])
    for (let index = 0; index < value.length; index++) expectedKeys.add(String(index))
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !expectedKeys.has(key)) {
        this.issue(path, "non_json_value", `${name} must not contain extra properties`)
        return false
      }
      if (key === "length") continue
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        this.issue(childPath(path, key), "non_json_value", `${name} items must be enumerable JSON data`)
        return false
      }
    }
    if (Object.keys(value).length !== value.length) {
      this.issue(path, "non_json_value", `${name} must not contain holes`)
      return false
    }
    return true
  }

  closed(value: RecordValue, path: JsonPointer, allowed: readonly string[]): void {
    const known = new Set(allowed)
    for (const key of Object.keys(value)) {
      if (!known.has(key)) {
        this.issue(childPath(path, key), "unknown_property", `Property "${key}" is not allowed`)
      }
    }
  }

  required(value: RecordValue, path: JsonPointer, keys: readonly string[]): void {
    for (const key of keys) {
      if (!Object.hasOwn(value, key)) {
        this.issue(childPath(path, key), "required", `Property "${key}" is required`)
      }
    }
  }

  literal(value: unknown, path: JsonPointer, expected: string | number, name: string): boolean {
    if (value === expected) return true
    this.issue(path, "invalid_literal", `${name} must be ${JSON.stringify(expected)}`)
    return false
  }

  address(value: unknown, path: JsonPointer): MetaAddress | null {
    if (typeof value === "string") {
      const parsed = parseMetaAddress(value)
      if (parsed !== null) return parsed
    }
    this.issue(path, "invalid_meta_address", "Expected canonical <owner>/<repository> address")
    return null
  }

  text(value: unknown, path: JsonPointer, name: string, allowEmpty = false): string | null {
    if (typeof value !== "string") {
      this.issue(path, "invalid_type", `${name} must be a string`)
      return null
    }
    if ((!allowEmpty && value.trim().length === 0) || value.length > 512) {
      this.issue(path, "invalid_text", `${name} must contain 1..512 characters`)
      return null
    }
    return value
  }

  operationId(value: unknown, path: JsonPointer): string | null {
    if (typeof value === "string" && OPERATION_ID.test(value)) return value
    this.issue(path, "invalid_operation_id", "operationId must be 1..128 safe identifier characters")
    return null
  }

  revision(value: unknown, path: JsonPointer): MetaSourceRevision | null {
    if (typeof value === "string" && SOURCE_REVISION.test(value)) {
      return value as MetaSourceRevision
    }
    this.issue(path, "invalid_source_revision", "revision must be a lowercase sha256 digest")
    return null
  }
}

const grantFor = (
  validator: AuthoringValidator,
  capabilities: readonly MetaAuthoringCapability[],
  capability: MetaAuthoringCapabilityId,
  method: MetaAuthoringMethod,
  operationClass: MetaAuthoringOperationClass,
  liveState: boolean,
): MetaAuthoringCapability | null => {
  const grant = capabilities.find((candidate) =>
    candidate.capability === capability &&
    candidate.method === method &&
    candidate.operationClass === operationClass &&
    candidate.liveState === liveState
  )
  if (grant) return grant
  validator.issue("/capability", "capability_denied", `Capability ${capability} is not granted for ${method}`)
  return null
}

const requireScope = (
  validator: AuthoringValidator,
  grant: MetaAuthoringCapability | null,
  addresses: readonly MetaAddress[],
): void => {
  if (!grant) return
  const allowed = new Set(grant.scopes)
  for (const address of addresses) {
    if (!allowed.has(address)) {
      validator.issue("/capability", "scope_denied", `Capability scope does not include ${address}`)
    }
  }
}

const commonEnvelope = (
  validator: AuthoringValidator,
  value: RecordValue,
): {operationId: string} | null => {
  validator.literal(
    value.contractVersion,
    "/contractVersion",
    META_AUTHORING_CONTRACT_VERSION,
    "contractVersion",
  )
  const operationId = validator.operationId(value.operationId, "/operationId")
  return operationId === null ? null : {operationId}
}

export const validateMetaCreateRequest = (
  input: unknown,
  context: Pick<MetaAuthoringValidationContext, "capabilities">,
): ValidationResult<MetaCreateRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.create request")) return {ok: false, issues: validator.issues}
  validator.closed(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "address",
    "name",
    "description",
    "profile",
    "target",
  ])
  validator.required(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "address",
    "name",
    "description",
    "profile",
    "target",
  ])
  const envelope = commonEnvelope(validator, input)
  validator.literal(input.capability, "/capability", META_CREATE_CAPABILITY, "capability")
  const address = validator.address(input.address, "/address")
  const name = validator.text(input.name, "/name", "name")
  const description = validator.text(input.description, "/description", "description", true)
  validator.literal(input.profile, "/profile", "empty", "profile")
  validator.literal(input.target, "/target", "absent", "target")
  const grant = grantFor(
    validator,
    context.capabilities,
    META_CREATE_CAPABILITY,
    META_CREATE_METHOD,
    "create",
    false,
  )
  if (address !== null) requireScope(validator, grant, [address])
  if (validator.issues.length > 0 || !envelope || address === null || name === null || description === null) {
    return {ok: false, issues: validator.issues}
  }
  return {
    ok: true,
    value: {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: envelope.operationId,
      capability: META_CREATE_CAPABILITY,
      address,
      name,
      description,
      profile: "empty",
      target: "absent",
    },
  }
}

const sourcePreconditions = (
  validator: AuthoringValidator,
  value: unknown,
): MetaMatterSourcePrecondition[] => {
  if (!validator.array(value, "/revisions", "revisions")) return []
  const result: MetaMatterSourcePrecondition[] = []
  const seen = new Set<MetaAddress>()
  value.forEach((entry, index) => {
    const path = childPath("/revisions", index)
    if (!validator.record(entry, path, "source precondition")) return
    validator.closed(entry, path, ["address", "revision"])
    validator.required(entry, path, ["address", "revision"])
    const address = validator.address(entry.address, childPath(path, "address"))
    const revision = validator.revision(entry.revision, childPath(path, "revision"))
    if (address === null || revision === null) return
    if (seen.has(address)) {
      validator.issue(childPath(path, "address"), "duplicate_revision", `Revision for ${address} is duplicated`)
      return
    }
    seen.add(address)
    result.push({address, revision})
  })
  return result.sort((left, right) => left.address.localeCompare(right.address))
}

const exactRevisions = (
  validator: AuthoringValidator,
  revisions: readonly MetaMatterSourcePrecondition[],
  affected: readonly MetaAddress[],
  currentRevision: MetaAuthoringValidationContext["currentRevision"],
): void => {
  const required = new Set(affected)
  const provided = new Map(revisions.map((entry) => [entry.address, entry] as const))
  for (const address of required) {
    const entry = provided.get(address)
    if (!entry) {
      validator.issue("/revisions", "missing_revision", `Expected source revision for ${address}`)
      continue
    }
    const current = currentRevision(address)
    if (current === null) {
      validator.issue("/revisions", "revision_unavailable", `Current source revision is unavailable for ${address}`)
    } else if (entry.revision !== current) {
      validator.issue("/revisions", "revision_mismatch", `Source revision mismatch for ${address}: expected ${current}`)
    }
  }
  for (const {address} of revisions) {
    if (!required.has(address)) {
      validator.issue("/revisions", "extra_revision", `Source revision for unaffected ${address} is not allowed`)
    }
  }
}

export const validateMetaMatterRequest = (
  input: unknown,
  context: MetaAuthoringValidationContext,
): ValidationResult<MetaMatterRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.matter.apply request")) return {ok: false, issues: validator.issues}
  const operation = input.operation
  const operationFields = operation === "add"
    ? ["toParent"]
    : operation === "move"
      ? ["fromParent", "toParent"]
      : operation === "remove"
        ? ["fromParent"]
        : []
  validator.closed(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "operation",
    "child",
    "revisions",
    ...operationFields,
  ])
  validator.required(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "operation",
    "child",
    "revisions",
    ...operationFields,
  ])
  const envelope = commonEnvelope(validator, input)
  validator.literal(input.capability, "/capability", META_MATTER_WRITE_CAPABILITY, "capability")
  if (operation !== "add" && operation !== "move" && operation !== "remove") {
    validator.issue("/operation", "forbidden_operation", "Matter operation must be add, move or remove")
  }
  const child = validator.address(input.child, "/child")
  const fromParent = operation === "move" || operation === "remove"
    ? validator.address(input.fromParent, "/fromParent")
    : null
  const toParent = operation === "add" || operation === "move"
    ? validator.address(input.toParent, "/toParent")
    : null
  if (operation === "move" && fromParent !== null && fromParent === toParent) {
    validator.issue("/toParent", "forbidden_operation", "move requires distinct source and destination parents")
  }
  const revisions = sourcePreconditions(validator, input.revisions)
  const affected = [...new Set([fromParent, toParent].filter((address): address is MetaAddress => address !== null))]
  const scope = [...new Set([child, ...affected].filter((address): address is MetaAddress => address !== null))]
  const grant = grantFor(
    validator,
    context.capabilities,
    META_MATTER_WRITE_CAPABILITY,
    META_MATTER_APPLY_METHOD,
    "matter",
    true,
  )
  requireScope(validator, grant, scope)
  exactRevisions(validator, revisions, affected, context.currentRevision)
  if (
    validator.issues.length > 0 ||
    !envelope ||
    child === null ||
    (operation !== "add" && operation !== "move" && operation !== "remove")
  ) return {ok: false, issues: validator.issues}

  const base = {
    contractVersion: META_AUTHORING_CONTRACT_VERSION,
    operationId: envelope.operationId,
    capability: META_MATTER_WRITE_CAPABILITY,
    child,
    revisions,
  }
  if (operation === "add" && toParent !== null) {
    return {ok: true, value: {...base, operation, toParent}}
  }
  if (operation === "move" && fromParent !== null && toParent !== null) {
    return {ok: true, value: {...base, operation, fromParent, toParent}}
  }
  if (operation === "remove" && fromParent !== null) {
    return {ok: true, value: {...base, operation, fromParent}}
  }
  return {ok: false, issues: validator.issues}
}
