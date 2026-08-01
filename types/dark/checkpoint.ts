export const CHECKPOINT_MANIFEST_SCHEMA_V1 = "metafor/checkpoint-manifest/v1" as const
export const CHECKPOINT_REPOSITORY_ID = "zavx0z/metafor-checkpoints" as const
export const CHECKPOINT_REPOSITORY_URL = "https://github.com/zavx0z/metafor-checkpoints" as const
export const CHECKPOINT_GIT_CHUNK_BYTES = 4 * 1024 * 1024

export type CheckpointTriggerKindV1 =
  | "semantic-materialization"
  | "quiescent"
  | "material-mass"
  | "owner-bookmark"
  | "measured-replay-cost"

export interface CheckpointIdentityV1 {
  cutId: string
  sequence: number
}

export interface CheckpointTriggerV1 {
  kind: CheckpointTriggerKindV1
}

export interface CheckpointChunkV1 {
  sha256: string
  bytes: number
}

export interface CheckpointBlobV1 {
  sha256: string
  bytes: number
  chunks: CheckpointChunkV1[]
}

export interface CheckpointBoundaryV1 {
  format: "sqlite"
  blob: CheckpointBlobV1
}

export interface CheckpointMassV1 {
  keyId: string
  format: "json" | "binary"
  blob: CheckpointBlobV1
}

export interface CheckpointProjectionV1 {
  schema: "metafor/graph"
  root: string
  canonicalization: "rfc8785"
  blob: CheckpointBlobV1
}

export type CheckpointJsonValue =
  | null
  | boolean
  | number
  | string
  | CheckpointJsonValue[]
  | {[key: string]: CheckpointJsonValue}

export type CheckpointJsonPatchOperationV1 =
  | {op: "add" | "replace"; path: string; value: CheckpointJsonValue}
  | {op: "remove"; path: string}

export interface CheckpointPatchEntryV1 {
  sequence: number
  operations: CheckpointJsonPatchOperationV1[]
}

export interface CheckpointProjectionDigestV1 {
  sequence: number
  sha256: string
}

export interface CheckpointForwardPatchDocumentV1 {
  schema: "metafor/checkpoint-forward-patches/v1"
  cutId: string
  projection: {
    schema: "metafor/graph"
    root: string
    canonicalization: "rfc8785"
  }
  previousSnapshotSequence: number | null
  fromSequence: number
  throughSequence: number
  base: CheckpointProjectionDigestV1
  result: CheckpointProjectionDigestV1
  entries: CheckpointPatchEntryV1[]
}

export interface CheckpointForwardPatchesV1 {
  format: "json-patch"
  previousSnapshotSequence: number | null
  fromSequence: number
  throughSequence: number
  entries: number
  base: CheckpointProjectionDigestV1
  result: CheckpointProjectionDigestV1
  blob: CheckpointBlobV1
}

export interface CheckpointManifestV1 {
  schema: typeof CHECKPOINT_MANIFEST_SCHEMA_V1
  repository: typeof CHECKPOINT_REPOSITORY_ID
  identity: CheckpointIdentityV1
  capturedAt: string
  trigger: CheckpointTriggerV1
  boundary: CheckpointBoundaryV1
  mass: CheckpointMassV1[]
  projection: CheckpointProjectionV1
  patches: CheckpointForwardPatchesV1
}

export interface CheckpointValidationIssue {
  path: string
  code: string
  message: string
}

export type CheckpointValidationResult =
  | {ok: true; value: CheckpointManifestV1}
  | {ok: false; issues: CheckpointValidationIssue[]}

const digestPattern = /^[0-9a-f]{64}$/
const cutPattern = /^[A-Za-z0-9._-]+$/
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const triggerKinds = new Set<CheckpointTriggerKindV1>([
  "semantic-materialization",
  "quiescent",
  "material-mass",
  "owner-bookmark",
  "measured-replay-cost",
])
const pointerPattern = /^(?:|(?:\/(?:[^~]|~[01])*)+)$/

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const expected = keys.toSorted()
  const actual = Reflect.ownKeys(value)
  if (
    actual.length !== expected.length ||
    actual.some((key) => typeof key !== "string")
  ) return false
  const strings = (actual as string[]).toSorted()
  return strings.every((key, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return key === expected[index] &&
      descriptor !== undefined &&
      descriptor.enumerable &&
      "value" in descriptor
  })
}

const canonicalTime = (value: unknown): value is string => {
  if (typeof value !== "string") return false
  const time = new Date(value)
  return Number.isFinite(time.getTime()) && time.toISOString() === value
}

class Validator {
  readonly issues: CheckpointValidationIssue[] = []

  issue(path: string, code: string, message: string): void {
    this.issues.push({path, code, message})
  }

  blob(input: unknown, path: string): input is CheckpointBlobV1 {
    if (!record(input) || !exact(input, ["bytes", "chunks", "sha256"])) {
      this.issue(path, "invalid_blob", "Checkpoint blob must be a closed object")
      return false
    }
    let valid = true
    if (typeof input.sha256 !== "string" || !digestPattern.test(input.sha256)) {
      this.issue(`${path}/sha256`, "invalid_digest", "Checkpoint digest must be lowercase SHA-256")
      valid = false
    }
    if (!Number.isSafeInteger(input.bytes) || Number(input.bytes) < 0) {
      this.issue(`${path}/bytes`, "invalid_size", "Checkpoint byte length must be a non-negative safe integer")
      valid = false
    }
    if (!Array.isArray(input.chunks)) {
      this.issue(`${path}/chunks`, "invalid_chunks", "Checkpoint chunks must be an array")
      return false
    }
    let total = 0
    input.chunks.forEach((chunk, index) => {
      const chunkPath = `${path}/chunks/${index}`
      if (!record(chunk) || !exact(chunk, ["bytes", "sha256"])) {
        this.issue(chunkPath, "invalid_chunk", "Checkpoint chunk must be a closed object")
        valid = false
        return
      }
      if (typeof chunk.sha256 !== "string" || !digestPattern.test(chunk.sha256)) {
        this.issue(`${chunkPath}/sha256`, "invalid_digest", "Checkpoint chunk digest must be lowercase SHA-256")
        valid = false
      }
      if (
        !Number.isSafeInteger(chunk.bytes) ||
        Number(chunk.bytes) <= 0 ||
        Number(chunk.bytes) > CHECKPOINT_GIT_CHUNK_BYTES
      ) {
        this.issue(`${chunkPath}/bytes`, "invalid_chunk_size", "Checkpoint chunk size is outside the v1 boundary")
        valid = false
      } else {
        total += Number(chunk.bytes)
      }
    })
    if (Number.isSafeInteger(input.bytes)) {
      if (Number(input.bytes) === 0 && input.chunks.length !== 0) {
        this.issue(`${path}/chunks`, "invalid_empty_blob", "Empty blob cannot contain chunks")
        valid = false
      } else if (Number(input.bytes) > 0 && total !== Number(input.bytes)) {
        this.issue(`${path}/chunks`, "chunk_size_mismatch", "Checkpoint chunk sizes must equal blob byte length")
        valid = false
      }
    }
    return valid
  }

  patches(input: unknown, identity: unknown): input is CheckpointForwardPatchesV1 {
    if (!record(input) || !exact(input, [
      "base",
      "blob",
      "entries",
      "format",
      "fromSequence",
      "previousSnapshotSequence",
      "result",
      "throughSequence",
    ])) {
      this.issue("/patches", "invalid_patches", "Checkpoint patch span must be a closed object")
      return false
    }
    let valid = true
    if (input.format !== "json-patch") {
      this.issue("/patches/format", "invalid_patch_format", "Checkpoint patch format is not supported")
      valid = false
    }
    const previous = input.previousSnapshotSequence
    if (previous !== null && (!Number.isSafeInteger(previous) || Number(previous) < 0)) {
      this.issue("/patches/previousSnapshotSequence", "invalid_patch_sequence", "Previous checkpoint sequence is invalid")
      valid = false
    }
    if (!Number.isSafeInteger(input.fromSequence) || Number(input.fromSequence) < 1) {
      this.issue("/patches/fromSequence", "invalid_patch_sequence", "Patch span start is invalid")
      valid = false
    }
    if (!Number.isSafeInteger(input.throughSequence) || Number(input.throughSequence) < 0) {
      this.issue("/patches/throughSequence", "invalid_patch_sequence", "Patch span end is invalid")
      valid = false
    }
    if (!Number.isSafeInteger(input.entries) || Number(input.entries) < 0) {
      this.issue("/patches/entries", "invalid_patch_entries", "Patch span entry count is invalid")
      valid = false
    }
    for (const [key, expectedSequence] of [
      ["base", previous === null ? 0 : Number(previous)] as const,
      ["result", record(identity) && Number.isSafeInteger(identity.sequence) ? Number(identity.sequence) : -1] as const,
    ]) {
      const digest = input[key]
      if (
        !record(digest) ||
        !exact(digest, ["sequence", "sha256"]) ||
        digest.sequence !== expectedSequence ||
        typeof digest.sha256 !== "string" ||
        !digestPattern.test(digest.sha256)
      ) {
        this.issue(`/patches/${key}`, "invalid_projection_digest", `Checkpoint patch ${key} digest is invalid`)
        valid = false
      }
    }
    if (
      (previous === null && input.fromSequence !== 1) ||
      (typeof previous === "number" && input.fromSequence !== previous + 1)
    ) {
      this.issue("/patches/fromSequence", "patch_coverage_mismatch", "Patch span must start after the previous snapshot")
      valid = false
    }
    if (record(identity) && Number.isSafeInteger(identity.sequence) && input.throughSequence !== identity.sequence) {
      this.issue("/patches/throughSequence", "patch_coverage_mismatch", "Patch span must end at checkpoint sequence")
      valid = false
    }
    const expectedEntries = Math.max(0, Number(input.throughSequence) - Number(input.fromSequence) + 1)
    if (Number.isSafeInteger(input.entries) && input.entries !== expectedEntries) {
      this.issue("/patches/entries", "patch_coverage_mismatch", "Patch span must contain one entry per acceptance sequence")
      valid = false
    }
    if (!this.blob(input.blob, "/patches/blob")) valid = false
    return valid
  }

  validate(input: unknown): CheckpointValidationResult {
    if (!record(input) || !exact(input, [
      "boundary",
      "capturedAt",
      "identity",
      "mass",
      "patches",
      "projection",
      "repository",
      "schema",
      "trigger",
    ])) {
      return {ok: false, issues: [{path: "", code: "invalid_manifest", message: "Checkpoint manifest must be a closed object"}]}
    }
    if (input.schema !== CHECKPOINT_MANIFEST_SCHEMA_V1) {
      this.issue("/schema", "invalid_schema", "Checkpoint manifest schema is not supported")
    }
    if (input.repository !== CHECKPOINT_REPOSITORY_ID) {
      this.issue("/repository", "invalid_repository", "Checkpoint repository identity is not canonical")
    }
    if (
      !record(input.identity) ||
      !exact(input.identity, ["cutId", "sequence"]) ||
      typeof input.identity.cutId !== "string" ||
      !cutPattern.test(input.identity.cutId) ||
      !Number.isSafeInteger(input.identity.sequence) ||
      Number(input.identity.sequence) < 0
    ) {
      this.issue("/identity", "invalid_identity", "Checkpoint identity must be canonical (cutId, sequence)")
    }
    if (!canonicalTime(input.capturedAt)) {
      this.issue("/capturedAt", "invalid_time", "Checkpoint capture time must be canonical ISO-8601")
    }
    if (
      !record(input.trigger) ||
      !exact(input.trigger, ["kind"]) ||
      typeof input.trigger.kind !== "string" ||
      !triggerKinds.has(input.trigger.kind as CheckpointTriggerKindV1)
    ) {
      this.issue("/trigger", "invalid_trigger", "Checkpoint trigger must be an approved semantic trigger")
    }
    if (
      !record(input.boundary) ||
      !exact(input.boundary, ["blob", "format"]) ||
      input.boundary.format !== "sqlite"
    ) {
      this.issue("/boundary", "invalid_boundary", "Checkpoint Boundary capture must be closed SQLite metadata")
    } else {
      this.blob(input.boundary.blob, "/boundary/blob")
    }
    if (!Array.isArray(input.mass)) {
      this.issue("/mass", "invalid_mass", "Checkpoint Mass catalog must be an array")
    } else {
      let previous = ""
      const seen = new Set<string>()
      input.mass.forEach((entry, index) => {
        const path = `/mass/${index}`
        if (!record(entry) || !exact(entry, ["blob", "format", "keyId"])) {
          this.issue(path, "invalid_mass_entry", "Checkpoint Mass entry must be a closed object")
          return
        }
        if (typeof entry.keyId !== "string" || !keyPattern.test(entry.keyId)) {
          this.issue(`${path}/keyId`, "invalid_key_id", "Checkpoint Mass key must be a Boundary-issued key ID")
        } else {
          if (seen.has(entry.keyId)) this.issue(`${path}/keyId`, "duplicate_key_id", "Checkpoint Mass key is duplicated")
          if (previous && entry.keyId.localeCompare(previous) <= 0) {
            this.issue(`${path}/keyId`, "unordered_key_id", "Checkpoint Mass entries must use canonical key order")
          }
          seen.add(entry.keyId)
          previous = entry.keyId
        }
        if (entry.format !== "json" && entry.format !== "binary") {
          this.issue(`${path}/format`, "invalid_mass_format", "Checkpoint Mass format is not supported")
        }
        this.blob(entry.blob, `${path}/blob`)
      })
    }
    if (
      !record(input.projection) ||
      !exact(input.projection, ["blob", "canonicalization", "root", "schema"]) ||
      input.projection.schema !== "metafor/graph" ||
      input.projection.canonicalization !== "rfc8785" ||
      typeof input.projection.root !== "string" ||
      !/^[^/]+\/[^/]+$/.test(input.projection.root)
    ) {
      this.issue("/projection", "invalid_projection", "Checkpoint projection must be one canonical Graph root")
    } else {
      this.blob(input.projection.blob, "/projection/blob")
    }
    this.patches(input.patches, input.identity)
    if (
      record(input.projection) &&
      record(input.projection.blob) &&
      record(input.patches) &&
      record(input.patches.result) &&
      input.projection.blob.sha256 !== input.patches.result.sha256
    ) {
      this.issue(
        "/patches/result/sha256",
        "projection_digest_mismatch",
        "Checkpoint result digest must equal the stored projection blob digest",
      )
    }
    return this.issues.length === 0
      ? {ok: true, value: input as unknown as CheckpointManifestV1}
      : {ok: false, issues: this.issues}
  }
}

export const validateCheckpointManifestV1 = (input: unknown): CheckpointValidationResult =>
  new Validator().validate(input)

const jsonValue = (value: unknown, ancestors: Set<object>): value is CheckpointJsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object") return false
  if (ancestors.has(value)) return false
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return false
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (
          !descriptor ||
          !descriptor.enumerable ||
          !("value" in descriptor) ||
          !jsonValue(descriptor.value, ancestors)
        ) return false
      }
      return Reflect.ownKeys(value).every((key) => {
        if (key === "length") {
          const descriptor = Object.getOwnPropertyDescriptor(value, "length")
          return descriptor !== undefined && !descriptor.enumerable && "value" in descriptor &&
            descriptor.value === value.length
        }
        return typeof key === "string" && /^(?:0|[1-9][0-9]*)$/.test(key)
      })
    }
    if (!record(value)) return false
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") return false
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return descriptor !== undefined &&
        descriptor.enumerable &&
        "value" in descriptor &&
        jsonValue(descriptor.value, ancestors)
    })
  } finally {
    ancestors.delete(value)
  }
}

const patchOperation = (value: unknown): value is CheckpointJsonPatchOperationV1 => {
  if (!record(value) || typeof value.op !== "string" || typeof value.path !== "string" || !pointerPattern.test(value.path)) {
    return false
  }
  if (value.op === "remove") return exact(value, ["op", "path"])
  if (value.op === "add" || value.op === "replace") {
    return exact(value, ["op", "path", "value"]) && jsonValue(value.value, new Set())
  }
  return false
}

export const validateCheckpointForwardPatchDocumentV1 = (
  input: unknown,
): input is CheckpointForwardPatchDocumentV1 => {
  if (!record(input) || !exact(input, [
    "cutId",
    "entries",
    "base",
    "fromSequence",
    "previousSnapshotSequence",
    "projection",
    "result",
    "schema",
    "throughSequence",
  ])) return false
  if (
    input.schema !== "metafor/checkpoint-forward-patches/v1" ||
    typeof input.cutId !== "string" ||
    !cutPattern.test(input.cutId) ||
    (input.previousSnapshotSequence !== null && (
      !Number.isSafeInteger(input.previousSnapshotSequence) ||
      Number(input.previousSnapshotSequence) < 0
    )) ||
    !Number.isSafeInteger(input.fromSequence) ||
    Number(input.fromSequence) < 1 ||
    !Number.isSafeInteger(input.throughSequence) ||
    Number(input.throughSequence) < 0 ||
    !Array.isArray(input.entries)
  ) return false
  const previous = input.previousSnapshotSequence
  if (
    (previous === null && input.fromSequence !== 1) ||
    (typeof previous === "number" && input.fromSequence !== previous + 1) ||
    input.entries.length !== Math.max(0, Number(input.throughSequence) - Number(input.fromSequence) + 1)
  ) return false
  if (
    !record(input.projection) ||
    !exact(input.projection, ["canonicalization", "root", "schema"]) ||
    input.projection.schema !== "metafor/graph" ||
    input.projection.canonicalization !== "rfc8785" ||
    typeof input.projection.root !== "string" ||
    !/^[^/]+\/[^/]+$/.test(input.projection.root)
  ) return false
  if (
    !record(input.base) ||
    !exact(input.base, ["sequence", "sha256"]) ||
    input.base.sequence !== (previous === null ? 0 : previous) ||
    typeof input.base.sha256 !== "string" ||
    !digestPattern.test(input.base.sha256) ||
    !record(input.result) ||
    !exact(input.result, ["sequence", "sha256"]) ||
    input.result.sequence !== input.throughSequence ||
    typeof input.result.sha256 !== "string" ||
    !digestPattern.test(input.result.sha256)
  ) return false
  return input.entries.every((entry, index) =>
    record(entry) &&
    exact(entry, ["operations", "sequence"]) &&
    entry.sequence === Number(input.fromSequence) + index &&
    Array.isArray(entry.operations) &&
    entry.operations.every(patchOperation),
  )
}
