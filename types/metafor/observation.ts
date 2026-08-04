import type {MetaAuthoringCauseV1} from "./authoring.ts"
import {
  parseMetaAddress,
  type JsonPointer,
  type JsonValue,
  type MetaAddress,
  type ValidationIssue,
  type ValidationResult,
} from "./graph.ts"
import type {SourcedParticle} from "shared/protocol/force/particle"

export const META_OBSERVATION_CONTRACT_VERSION = 1 as const
export const DARK_FORCE_HISTORY_READ_METHOD = "dark.force.history.read" as const
export const ENERGY_MASS_RESULT_READ_METHOD = "energy.mass.result.read" as const
export const ENERGY_MASS_RESULT_MAX_BYTES = 4 * 1024 * 1024

export type MetaObservationDigest = `sha256:${string}`

export type MetaCausalFrontier = {
  cutId: string
  throughSequence: number
  retroactiveComplete: false
}

export type MetaRuntimeAtomPointer = `/runtime/roots/${number}${string}`

/** Snapshot-local Graph path guarded by both current root and expected Meta. */
export type MetaRuntimeAtomLocator = {
  root: MetaAddress
  pointer: MetaRuntimeAtomPointer
  meta: MetaAddress
}

export type DarkForceHistoryFrontierReadRequest = {
  contractVersion: typeof META_OBSERVATION_CONTRACT_VERSION
  query: {kind: "frontier"}
}

export type DarkForceHistoryRangeReadRequest = {
  contractVersion: typeof META_OBSERVATION_CONTRACT_VERSION
  query: {
    kind: "range"
    cutId: string
    fromSequence: number
    toSequence?: number
    limit: number
  }
}

export type DarkForceHistoryReadRequest =
  | DarkForceHistoryFrontierReadRequest
  | DarkForceHistoryRangeReadRequest

export type DarkForceHistoryPublicEntry = {
  id: string
  sequence: number
  acceptedAt: string
  particle: SourcedParticle
  authoring?: MetaAuthoringCauseV1
}

export type DarkForceHistoryReadReceipt = {
  contractVersion: typeof META_OBSERVATION_CONTRACT_VERSION
  resolution: "exact"
  frontier: MetaCausalFrontier
  range: null | {
    requestedFromSequence: number
    requestedToSequence: number | null
    firstSequence: number | null
    lastSequence: number | null
    truncated: boolean
    nextSequence: number | null
  }
  entries: DarkForceHistoryPublicEntry[]
}

export type EnergyMassResultReadRequest = {
  contractVersion: typeof META_OBSERVATION_CONTRACT_VERSION
  atom: MetaRuntimeAtomLocator
  key: string
  maxBytes: number
  expectedDigest?: MetaObservationDigest
}

export type EnergyMassResultContent =
  | {format: "json"; present: false}
  | {format: "json"; present: true; value: JsonValue}
  | {format: "binary"; base64: string}

export type EnergyMassResultReadReceipt = {
  contractVersion: typeof META_OBSERVATION_CONTRACT_VERSION
  resolution: "exact"
  frontier: MetaCausalFrontier
  atom: MetaRuntimeAtomLocator
  key: string
  digest: MetaObservationDigest
  bytes: number
  content: EnergyMassResultContent
}

type RecordValue = Record<string, unknown>

const DIGEST = /^sha256:[a-f0-9]{64}$/
const CUT_ID = /^[A-Za-z0-9._-]+$/

const pointerToken = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1")

const childPath = (path: JsonPointer, key: string | number): JsonPointer =>
  `${path}/${pointerToken(String(key))}` as JsonPointer

const isRecord = (value: unknown): value is RecordValue => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    return Boolean(descriptor?.enumerable && "value" in descriptor)
  })
}

const exactKeys = (
  value: RecordValue,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
}

const issue = (path: JsonPointer, code: string, message: string): ValidationIssue =>
  ({path, code, message})

const safePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0

const runtimePointerIndices = (value: unknown): number[] | null => {
  if (typeof value !== "string" || value.length > 4096) return null
  const tokens = value.split("/")
  if (tokens.length < 4 || tokens[0] !== "" || tokens[1] !== "runtime" || tokens[2] !== "roots") return null
  const indices: number[] = []
  for (let index = 3; index < tokens.length; index += 2) {
    const raw = tokens[index]
    if (!/^(0|[1-9]\d*)$/.test(raw ?? "")) return null
    const parsed = Number(raw)
    if (!Number.isSafeInteger(parsed)) return null
    indices.push(parsed)
    if (indices.length > 256) return null
    if (index + 1 < tokens.length && tokens[index + 1] !== "children") return null
  }
  return tokens.length % 2 === 0 ? indices : null
}

/** Returns root and child indices encoded by one strict public Graph pointer. */
export const parseMetaRuntimeAtomPointer = (value: unknown): number[] | null =>
  runtimePointerIndices(value)

const validateLocator = (
  value: unknown,
  path: JsonPointer,
): ValidationResult<MetaRuntimeAtomLocator> => {
  if (!isRecord(value) || !exactKeys(value, ["root", "pointer", "meta"])) {
    return {ok: false, issues: [issue(path, "invalid_locator", "Atom locator must be a closed plain object")]}
  }
  const root = typeof value.root === "string" ? parseMetaAddress(value.root) : null
  const meta = typeof value.meta === "string" ? parseMetaAddress(value.meta) : null
  const pointer = runtimePointerIndices(value.pointer)
  const issues: ValidationIssue[] = []
  if (!root) issues.push(issue(childPath(path, "root"), "invalid_meta_address", "Locator root must be canonical"))
  if (!meta) issues.push(issue(childPath(path, "meta"), "invalid_meta_address", "Locator Meta must be canonical"))
  if (!pointer) issues.push(issue(childPath(path, "pointer"), "invalid_runtime_pointer", "Locator pointer must select a Graph runtime path"))
  if (issues.length > 0 || !root || !meta) return {ok: false, issues}
  return {ok: true, value: {root, pointer: value.pointer as MetaRuntimeAtomPointer, meta}}
}

export const validateDarkForceHistoryReadRequest = (
  input: unknown,
): ValidationResult<DarkForceHistoryReadRequest> => {
  if (!isRecord(input) || !exactKeys(input, ["contractVersion", "query"])) {
    return {ok: false, issues: [issue("", "invalid_request", "History request must be a closed plain object")]}
  }
  if (input.contractVersion !== META_OBSERVATION_CONTRACT_VERSION) {
    return {ok: false, issues: [issue("/contractVersion", "invalid_literal", "Unsupported observation contract version")]}
  }
  if (!isRecord(input.query) || typeof input.query.kind !== "string") {
    return {ok: false, issues: [issue("/query", "invalid_query", "History query must be a closed plain object")]}
  }
  if (input.query.kind === "frontier") {
    if (!exactKeys(input.query, ["kind"])) {
      return {ok: false, issues: [issue("/query", "unknown_property", "Frontier query contains unknown properties")]}
    }
    return {ok: true, value: {contractVersion: 1, query: {kind: "frontier"}}}
  }
  if (input.query.kind !== "range" || !exactKeys(input.query, ["kind", "cutId", "fromSequence", "limit"], ["toSequence"])) {
    return {ok: false, issues: [issue("/query", "invalid_query", "History range query is invalid or contains unknown properties")]}
  }
  const issues: ValidationIssue[] = []
  if (typeof input.query.cutId !== "string" || !CUT_ID.test(input.query.cutId)) {
    issues.push(issue("/query/cutId", "invalid_cut", "History cutId is invalid"))
  }
  if (!safePositive(input.query.fromSequence)) {
    issues.push(issue("/query/fromSequence", "invalid_sequence", "fromSequence must be a positive safe integer"))
  }
  if (input.query.toSequence !== undefined && !safePositive(input.query.toSequence)) {
    issues.push(issue("/query/toSequence", "invalid_sequence", "toSequence must be a positive safe integer"))
  }
  if (safePositive(input.query.fromSequence) && safePositive(input.query.toSequence) && input.query.toSequence < input.query.fromSequence) {
    issues.push(issue("/query/toSequence", "invalid_range", "toSequence must not precede fromSequence"))
  }
  if (!safePositive(input.query.limit) || input.query.limit > 512) {
    issues.push(issue("/query/limit", "invalid_limit", "History limit must be between 1 and 512"))
  }
  if (issues.length > 0) return {ok: false, issues}
  return {ok: true, value: structuredClone(input) as DarkForceHistoryRangeReadRequest}
}

export const validateEnergyMassResultReadRequest = (
  input: unknown,
): ValidationResult<EnergyMassResultReadRequest> => {
  if (!isRecord(input) || !exactKeys(input, ["contractVersion", "atom", "key", "maxBytes"], ["expectedDigest"])) {
    return {ok: false, issues: [issue("", "invalid_request", "Mass result request must be a closed plain object")]}
  }
  const issues: ValidationIssue[] = []
  if (input.contractVersion !== META_OBSERVATION_CONTRACT_VERSION) {
    issues.push(issue("/contractVersion", "invalid_literal", "Unsupported observation contract version"))
  }
  const locator = validateLocator(input.atom, "/atom")
  if (!locator.ok) issues.push(...locator.issues)
  if (typeof input.key !== "string" || input.key.length === 0 || input.key.length > 256 || input.key.includes("\0")) {
    issues.push(issue("/key", "invalid_mass_key", "Mass key is invalid"))
  }
  if (!safePositive(input.maxBytes) || input.maxBytes > ENERGY_MASS_RESULT_MAX_BYTES) {
    issues.push(issue("/maxBytes", "invalid_limit", `Mass maxBytes must be between 1 and ${ENERGY_MASS_RESULT_MAX_BYTES}`))
  }
  if (input.expectedDigest !== undefined && (typeof input.expectedDigest !== "string" || !DIGEST.test(input.expectedDigest))) {
    issues.push(issue("/expectedDigest", "invalid_digest", "Expected Mass digest is invalid"))
  }
  if (issues.length > 0 || !locator.ok) return {ok: false, issues}
  return {
    ok: true,
    value: {
      contractVersion: 1,
      atom: locator.value,
      key: input.key as string,
      maxBytes: input.maxBytes as number,
      ...(input.expectedDigest === undefined ? {} : {expectedDigest: input.expectedDigest as MetaObservationDigest}),
    },
  }
}
