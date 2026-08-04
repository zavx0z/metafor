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
export const META_DECLARATION_APPLY_METHOD = "meta.declaration.apply" as const

export const META_SOURCE_READ_CAPABILITY = "meta.source.read" as const
export const META_CREATE_CAPABILITY = "meta.create" as const
export const META_MATTER_WRITE_CAPABILITY = "meta.matter.write" as const
export const META_DECLARATION_WRITE_CAPABILITY = "meta.declaration.write" as const

export type MetaAuthoringMethod =
  | typeof META_CAPABILITIES_READ_METHOD
  | typeof META_SOURCE_REVISION_READ_METHOD
  | typeof META_CREATE_METHOD
  | typeof META_MATTER_APPLY_METHOD
  | typeof META_DECLARATION_APPLY_METHOD

export type MetaAuthoringCapabilityId =
  | typeof META_SOURCE_READ_CAPABILITY
  | typeof META_CREATE_CAPABILITY
  | typeof META_MATTER_WRITE_CAPABILITY
  | typeof META_DECLARATION_WRITE_CAPABILITY

export type MetaAuthoringOperationClass = "source_read" | "create" | "matter" | "declaration"

export interface MetaAuthoringCapability {
  capability: MetaAuthoringCapabilityId
  method: MetaAuthoringMethod
  scopes: readonly MetaAddress[]
  operationClass: MetaAuthoringOperationClass
  liveState: boolean
  gitCommit: boolean
}

export interface MetaCapabilitiesReadRequest {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
}

export interface MetaCapabilitiesReadReceipt {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  capabilities: MetaAuthoringCapability[]
}

export interface MetaSourceRevisionReadRequest {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  capability: typeof META_SOURCE_READ_CAPABILITY
  addresses: MetaAddress[]
}

export interface MetaSourceRevisionReadReceipt {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  sources: Array<{
    address: MetaAddress
    revision: MetaSourceRevision
  }>
}

export type MetaAuthoringOperationId = string
export type MetaSourceRevision = `sha256:${string}`
export type MetaAuthoringRequestDigest = `sha256:${string}`

export const META_MATTER_AUTHORING_CAUSE_SCHEMA_V1 =
  "metafor/matter-authoring-cause/v1" as const
export const META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1 =
  "metafor/declaration-authoring-cause/v1" as const

export interface MetaAuthoringSourceProjectionV1 {
  address: MetaAddress
  beforeRevision: MetaSourceRevision
  afterRevision: MetaSourceRevision
}

export type MetaMatterSourceProjectionV1 = MetaAuthoringSourceProjectionV1
export type MetaDeclarationSourceProjectionV1 = MetaAuthoringSourceProjectionV1

/** Immutable RPC causation stored in the same Dark Force history row. */
export interface MetaMatterAuthoringCauseV1 {
  schema: typeof META_MATTER_AUTHORING_CAUSE_SCHEMA_V1
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  rpcSource: string
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  sourceProjections: MetaMatterSourceProjectionV1[]
}

export interface MetaDeclarationAuthoringCauseV1 {
  schema: typeof META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  rpcSource: string
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  sourceProjections: MetaDeclarationSourceProjectionV1[]
}

export type MetaAuthoringCauseV1 =
  | MetaMatterAuthoringCauseV1
  | MetaDeclarationAuthoringCauseV1

export interface MetaForceAcceptanceIdentity {
  cutId: string
  sequence: number
  id: string
}

interface MetaMatterApplyReceiptBase {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  acceptance: MetaForceAcceptanceIdentity
  sourceProjections: MetaMatterSourceProjectionV1[]
  boundary: "applied"
}

export interface MetaMatterPublishedSourceV1 extends MetaMatterSourceProjectionV1 {
  outcome: "published" | "already_published"
}

export type MetaMatterApplyReceipt =
  | MetaMatterApplyReceiptBase & {
      phase: "source_pending"
      source: {outcome: "pending"; error: string}
    }
  | MetaMatterApplyReceiptBase & {
      phase: "runtime_committed"
      source: {
        outcome: "published" | "already_published"
        files: MetaMatterPublishedSourceV1[]
      }
      materialization: {outcome: "pending"; error: string}
    }
  | MetaMatterApplyReceiptBase & {
      phase: "complete"
      source: {
        outcome: "published" | "already_published"
        files: MetaMatterPublishedSourceV1[]
      }
      materialization: {outcome: "applied"}
    }

export type MetaDeclarationApplyReceipt = MetaMatterApplyReceipt

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

export interface MetaCreateReceipt {
  contractVersion: typeof META_AUTHORING_CONTRACT_VERSION
  operationId: MetaAuthoringOperationId
  requestDigest: MetaAuthoringRequestDigest
  phase: "created"
  outcome: "created" | "already_created"
  address: MetaAddress
  sourceRevision: MetaSourceRevision
  files: string[]
  repository: {
    initialized: true
    branch: "main"
    head: null
    staged: false
  }
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

interface MetaOptionalFieldBase {
  key: string
  required: false
  label?: string
}

export type MetaOptionalFieldDeclaration =
  | MetaOptionalFieldBase & {type: "string"; default?: string}
  | MetaOptionalFieldBase & {type: "number"; default?: number}
  | MetaOptionalFieldBase & {type: "boolean"; default?: boolean}
  | MetaOptionalFieldBase & {type: "array"; default?: number[]; data?: string}
  | MetaOptionalFieldBase & {type: "enum"; values: string[]; default?: string}

interface MetaDeclarationRequestBase extends MetaAuthoringWriteEnvelope {
  capability: typeof META_DECLARATION_WRITE_CAPABILITY
  entity: "field"
  revisions: MetaMatterSourcePrecondition[]
}

export interface MetaFieldDeclarationAddRequest extends MetaDeclarationRequestBase {
  operation: "add"
  address: MetaAddress
  field: MetaOptionalFieldDeclaration
}

export interface MetaFieldDeclarationReplaceRequest extends MetaDeclarationRequestBase {
  operation: "replace"
  address: MetaAddress
  key: string
  field: MetaOptionalFieldDeclaration
}

export interface MetaFieldDeclarationRemoveRequest extends MetaDeclarationRequestBase {
  operation: "remove"
  address: MetaAddress
  key: string
}

export interface MetaFieldDeclarationMoveRequest extends MetaDeclarationRequestBase {
  operation: "move"
  fromAddress: MetaAddress
  toAddress: MetaAddress
  key: string
}

export type MetaDeclarationRequest =
  | MetaFieldDeclarationAddRequest
  | MetaFieldDeclarationReplaceRequest
  | MetaFieldDeclarationRemoveRequest
  | MetaFieldDeclarationMoveRequest

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

export const validateMetaCapabilitiesReadRequest = (
  input: unknown,
): ValidationResult<MetaCapabilitiesReadRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.capabilities.read request")) return {ok: false, issues: validator.issues}
  validator.closed(input, "", ["contractVersion"])
  validator.required(input, "", ["contractVersion"])
  validator.literal(
    input.contractVersion,
    "/contractVersion",
    META_AUTHORING_CONTRACT_VERSION,
    "contractVersion",
  )
  if (validator.issues.length > 0) return {ok: false, issues: validator.issues}
  return {ok: true, value: {contractVersion: META_AUTHORING_CONTRACT_VERSION}}
}

export const validateMetaSourceRevisionReadRequest = (
  input: unknown,
  context: Pick<MetaAuthoringValidationContext, "capabilities">,
): ValidationResult<MetaSourceRevisionReadRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.source.revision.read request")) return {ok: false, issues: validator.issues}
  validator.closed(input, "", ["contractVersion", "capability", "addresses"])
  validator.required(input, "", ["contractVersion", "capability", "addresses"])
  validator.literal(
    input.contractVersion,
    "/contractVersion",
    META_AUTHORING_CONTRACT_VERSION,
    "contractVersion",
  )
  validator.literal(input.capability, "/capability", META_SOURCE_READ_CAPABILITY, "capability")
  const addresses: MetaAddress[] = []
  const seen = new Set<MetaAddress>()
  if (validator.array(input.addresses, "/addresses", "addresses")) {
    if (input.addresses.length === 0) validator.issue("/addresses", "invalid_scope", "addresses must not be empty")
    input.addresses.forEach((value, index) => {
      const address = validator.address(value, childPath("/addresses", index))
      if (address === null) return
      if (seen.has(address)) {
        validator.issue(childPath("/addresses", index), "duplicate_address", `Address ${address} is duplicated`)
        return
      }
      seen.add(address)
      addresses.push(address)
    })
  }
  const grant = grantFor(
    validator,
    context.capabilities,
    META_SOURCE_READ_CAPABILITY,
    META_SOURCE_REVISION_READ_METHOD,
    "source_read",
    false,
  )
  requireScope(validator, grant, addresses)
  if (validator.issues.length > 0) return {ok: false, issues: validator.issues}
  return {
    ok: true,
    value: {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      capability: META_SOURCE_READ_CAPABILITY,
      addresses: addresses.sort((left, right) => left.localeCompare(right)),
    },
  }
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

const optionalFieldDeclaration = (
  validator: AuthoringValidator,
  value: unknown,
  path: JsonPointer,
): MetaOptionalFieldDeclaration | null => {
  if (!validator.record(value, path, "Field declaration")) return null
  const type = value.type
  const allowed = type === "array"
    ? ["key", "type", "required", "default", "label", "data"]
    : type === "enum"
      ? ["key", "type", "required", "default", "label", "values"]
      : ["key", "type", "required", "default", "label"]
  validator.closed(value, path, allowed)
  validator.required(value, path, type === "enum"
    ? ["key", "type", "required", "values"]
    : ["key", "type", "required"])
  const key = validator.text(value.key, childPath(path, "key"), "Field key")
  if (key?.includes("\0")) {
    validator.issue(childPath(path, "key"), "invalid_field_key", "Field key must not contain NUL")
  }
  if (value.required !== false) {
    validator.issue(childPath(path, "required"), "invalid_literal", "Optional Field required must be false")
  }
  if (value.label !== undefined) validator.text(value.label, childPath(path, "label"), "Field label", true)
  if (type !== "string" && type !== "number" && type !== "boolean" && type !== "array" && type !== "enum") {
    validator.issue(childPath(path, "type"), "invalid_field_type", "Field type must be string, number, boolean, array or enum")
    return null
  }

  const base = {
    key: key ?? "",
    type,
    required: false as const,
    ...(typeof value.label === "string" ? {label: value.label} : {}),
  }
  if (type === "string") {
    if (value.default !== undefined && typeof value.default !== "string") {
      validator.issue(childPath(path, "default"), "invalid_field_default", "String Field default must be a string")
    }
    return {...base, type, ...(typeof value.default === "string" ? {default: value.default} : {})}
  }
  if (type === "number") {
    if (value.default !== undefined && (typeof value.default !== "number" || !Number.isFinite(value.default))) {
      validator.issue(childPath(path, "default"), "invalid_field_default", "Number Field default must be finite")
    }
    return {
      ...base,
      type,
      ...(typeof value.default === "number" && Number.isFinite(value.default) ? {default: value.default} : {}),
    }
  }
  if (type === "boolean") {
    if (value.default !== undefined && typeof value.default !== "boolean") {
      validator.issue(childPath(path, "default"), "invalid_field_default", "Boolean Field default must be boolean")
    }
    return {...base, type, ...(typeof value.default === "boolean" ? {default: value.default} : {})}
  }
  if (type === "array") {
    const defaultValue: number[] = []
    if (value.default !== undefined) {
      if (validator.array(value.default, childPath(path, "default"), "Array Field default")) {
        value.default.forEach((item, index) => {
          if (typeof item !== "number" || !Number.isFinite(item)) {
            validator.issue(
              childPath(childPath(path, "default"), index),
              "invalid_field_default",
              "Array Field default items must be finite numbers",
            )
          } else defaultValue.push(item)
        })
      }
    }
    if (value.data !== undefined) validator.text(value.data, childPath(path, "data"), "Array Field data")
    return {
      ...base,
      type,
      ...(value.default !== undefined ? {default: defaultValue} : {}),
      ...(typeof value.data === "string" ? {data: value.data} : {}),
    }
  }

  const values: string[] = []
  const seen = new Set<string>()
  if (validator.array(value.values, childPath(path, "values"), "Enum Field values")) {
    if (value.values.length === 0) {
      validator.issue(childPath(path, "values"), "invalid_enum_values", "Enum Field values must not be empty")
    }
    value.values.forEach((item, index) => {
      const itemPath = childPath(childPath(path, "values"), index)
      const normalized = validator.text(item, itemPath, "Enum Field value")
      if (normalized === null) return
      if (seen.has(normalized)) {
        validator.issue(itemPath, "duplicate_enum_value", `Enum Field value ${normalized} is duplicated`)
        return
      }
      seen.add(normalized)
      values.push(normalized)
    })
  }
  if (value.default !== undefined && (typeof value.default !== "string" || !seen.has(value.default))) {
    validator.issue(childPath(path, "default"), "invalid_field_default", "Enum Field default must name one declared value")
  }
  return {
    ...base,
    type,
    values,
    ...(typeof value.default === "string" && seen.has(value.default) ? {default: value.default} : {}),
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

export const validateMetaDeclarationRequest = (
  input: unknown,
  context: MetaAuthoringValidationContext,
): ValidationResult<MetaDeclarationRequest> => {
  const validator = new AuthoringValidator()
  if (!validator.record(input, "", "meta.declaration.apply request")) return {ok: false, issues: validator.issues}
  const operation = input.operation
  const operationFields = operation === "add"
    ? ["address", "field"]
    : operation === "replace"
      ? ["address", "key", "field"]
      : operation === "remove"
        ? ["address", "key"]
        : operation === "move"
          ? ["fromAddress", "toAddress", "key"]
          : []
  validator.closed(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "entity",
    "operation",
    "revisions",
    ...operationFields,
  ])
  validator.required(input, "", [
    "contractVersion",
    "operationId",
    "capability",
    "entity",
    "operation",
    "revisions",
    ...operationFields,
  ])
  const envelope = commonEnvelope(validator, input)
  validator.literal(input.capability, "/capability", META_DECLARATION_WRITE_CAPABILITY, "capability")
  validator.literal(input.entity, "/entity", "field", "entity")
  if (operation !== "add" && operation !== "replace" && operation !== "remove" && operation !== "move") {
    validator.issue("/operation", "forbidden_operation", "Field operation must be add, replace, remove or move")
  }
  const address = operation === "add" || operation === "replace" || operation === "remove"
    ? validator.address(input.address, "/address")
    : null
  const fromAddress = operation === "move"
    ? validator.address(input.fromAddress, "/fromAddress")
    : null
  const toAddress = operation === "move"
    ? validator.address(input.toAddress, "/toAddress")
    : null
  if (operation === "move" && fromAddress !== null && fromAddress === toAddress) {
    validator.issue("/toAddress", "forbidden_operation", "Field move requires distinct source and destination Meta")
  }
  const key = operation === "replace" || operation === "remove" || operation === "move"
    ? validator.text(input.key, "/key", "Field key")
    : null
  const field = operation === "add" || operation === "replace"
    ? optionalFieldDeclaration(validator, input.field, "/field")
    : null
  const revisions = sourcePreconditions(validator, input.revisions)
  const affected = operation === "move"
    ? [fromAddress, toAddress].filter((item): item is MetaAddress => item !== null)
    : address === null ? [] : [address]
  const grant = grantFor(
    validator,
    context.capabilities,
    META_DECLARATION_WRITE_CAPABILITY,
    META_DECLARATION_APPLY_METHOD,
    "declaration",
    true,
  )
  requireScope(validator, grant, affected)
  exactRevisions(validator, revisions, affected, context.currentRevision)
  if (
    validator.issues.length > 0 ||
    !envelope ||
    (operation !== "add" && operation !== "replace" && operation !== "remove" && operation !== "move")
  ) return {ok: false, issues: validator.issues}

  const base = {
    contractVersion: META_AUTHORING_CONTRACT_VERSION,
    operationId: envelope.operationId,
    capability: META_DECLARATION_WRITE_CAPABILITY,
    entity: "field" as const,
    revisions,
  }
  if (operation === "add" && address !== null && field !== null) {
    return {ok: true, value: {...base, operation, address, field}}
  }
  if (operation === "replace" && address !== null && key !== null && field !== null) {
    return {ok: true, value: {...base, operation, address, key, field}}
  }
  if (operation === "remove" && address !== null && key !== null) {
    return {ok: true, value: {...base, operation, address, key}}
  }
  if (operation === "move" && fromAddress !== null && toAddress !== null && key !== null) {
    return {ok: true, value: {...base, operation, fromAddress, toAddress, key}}
  }
  return {ok: false, issues: validator.issues}
}
