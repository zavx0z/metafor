import {createHash} from "node:crypto"
import {existsSync, mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {spawnSync} from "node:child_process"
import {
  CHECKPOINT_GIT_CHUNK_BYTES,
  CHECKPOINT_MANIFEST_SCHEMA_V1,
  CHECKPOINT_REPOSITORY_ID,
  type CheckpointBlobV1,
  type CheckpointForwardPatchDocumentV1,
  type CheckpointIdentityV1,
  type CheckpointJsonPatchOperationV1,
  type CheckpointManifestV1,
  type CheckpointMassV1,
  type CheckpointTriggerKindV1,
  validateCheckpointForwardPatchDocumentV1,
  validateCheckpointManifestV1,
} from "@dark/types/checkpoint"
import type {Graph} from "@metafor/types/metafor/graph"
import {
  applyGraphPatch,
  canonicalizeGraph,
} from "../graph/checkpoint.ts"

export interface CheckpointRepositoryLimits {
  maxBlobBytes: number
  maxTotalBytes: number
  maxMassEntries: number
}

export interface CheckpointMassCapture {
  keyId: string
  format: "json" | "binary"
  bytes: Uint8Array
}

export interface CheckpointPatchCaptureEntry {
  sequence: number
  operations: CheckpointJsonPatchOperationV1[]
}

export interface CheckpointCapture {
  identity: CheckpointIdentityV1
  capturedAt: string
  trigger: CheckpointTriggerKindV1
  boundary: Uint8Array
  mass: CheckpointMassCapture[]
  projection: {
    base: Graph
    result: Graph
  }
  patches: {
    previousSnapshotSequence: number | null
    entries: CheckpointPatchCaptureEntry[]
  }
}

export interface CheckpointWriteResult {
  commit: string
  manifest: CheckpointManifestV1
  sequenceRef: string
}

export interface CheckpointRepositoryHooks {
  beforePublish?(commit: string): void
}

export class CheckpointRepositoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "CheckpointRepositoryError"
  }
}

const digest = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex")
const sequenceName = (sequence: number): string => sequence.toString().padStart(20, "0")
const sequenceRef = (identity: CheckpointIdentityV1): string =>
  `refs/metafor/checkpoints/${identity.cutId}/${sequenceName(identity.sequence)}`
const headRef = (cutId: string): string => `refs/metafor/checkpoints/${cutId}/head`
const chunkPath = (sha256: string): string => `objects/sha256/${sha256.slice(0, 2)}/${sha256}`
const commitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

const utf16Compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => utf16Compare(left, right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    )
  }
  return value
}

const canonicalJSON = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(canonicalValue(value)))

const validateLimits = (limits: CheckpointRepositoryLimits): CheckpointRepositoryLimits => {
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new CheckpointRepositoryError("invalid_limits", `Checkpoint repository ${key} must be a positive safe integer`)
    }
  }
  return Object.freeze({...limits})
}

const bytes = (value: Uint8Array, label: string): Uint8Array => {
  if (!(value instanceof Uint8Array)) {
    throw new CheckpointRepositoryError("invalid_capture", `${label} must be bytes`)
  }
  return new Uint8Array(value)
}

type GitResult = {status: number | null; stdout: Buffer; stderr: Buffer; error?: Error}

const gitResult = (
  repository: string,
  args: readonly string[],
  input?: Uint8Array | string,
  extraEnvironment: NodeJS.ProcessEnv = {},
): GitResult => {
  const result = spawnSync("git", ["--git-dir", repository, ...args], {
    env: {...process.env, GIT_TERMINAL_PROMPT: "0", ...extraEnvironment},
    input,
    maxBuffer: 512 * 1024 * 1024,
  })
  return {
    status: result.status,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ""),
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? ""),
    ...(result.error ? {error: result.error} : {}),
  }
}

const git = (
  repository: string,
  args: readonly string[],
  input?: Uint8Array | string,
  extraEnvironment: NodeJS.ProcessEnv = {},
): Buffer => {
  const result = gitResult(repository, args, input, extraEnvironment)
  if (result.error || result.status !== 0) {
    const detail = result.stderr.toString("utf8").trim() || result.error?.message || `exit ${result.status}`
    throw new CheckpointRepositoryError("git_failure", `Checkpoint Git command failed: ${detail}`, {
      cause: result.error,
    })
  }
  return result.stdout
}

const gitText = (
  repository: string,
  args: readonly string[],
  input?: Uint8Array | string,
  extraEnvironment: NodeJS.ProcessEnv = {},
): string => git(repository, args, input, extraEnvironment).toString("utf8").trim()

const readRef = (repository: string, ref: string): string | null => {
  const result = gitResult(repository, ["rev-parse", "--verify", "--quiet", ref])
  if (result.status === 1) return null
  if (result.error || result.status !== 0) {
    throw new CheckpointRepositoryError("git_failure", `Cannot resolve checkpoint ref ${ref}`)
  }
  const commit = result.stdout.toString("utf8").trim()
  if (!commitPattern.test(commit)) {
    throw new CheckpointRepositoryError("invalid_commit", `Checkpoint ref ${ref} does not resolve to a commit`)
  }
  return commit
}

const parseJSON = (value: Buffer, label: string): unknown => {
  try {
    return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(value))
  } catch (error) {
    throw new CheckpointRepositoryError("invalid_json", `${label} is not canonical JSON`, {cause: error})
  }
}

const blob = (
  value: Uint8Array,
  chunks: Map<string, Uint8Array>,
  limits: CheckpointRepositoryLimits,
  label: string,
): CheckpointBlobV1 => {
  if (value.byteLength > limits.maxBlobBytes) {
    throw new CheckpointRepositoryError("blob_too_large", `${label} exceeds the configured checkpoint blob budget`)
  }
  const entries: CheckpointBlobV1["chunks"] = []
  for (let offset = 0; offset < value.byteLength; offset += CHECKPOINT_GIT_CHUNK_BYTES) {
    const chunk = value.slice(offset, Math.min(value.byteLength, offset + CHECKPOINT_GIT_CHUNK_BYTES))
    const sha256 = digest(chunk)
    const previous = chunks.get(sha256)
    if (previous && !Buffer.from(previous).equals(Buffer.from(chunk))) {
      throw new CheckpointRepositoryError("digest_collision", "Checkpoint chunk digest collision")
    }
    if (!previous) chunks.set(sha256, chunk)
    entries.push({sha256, bytes: chunk.byteLength})
  }
  return {sha256: digest(value), bytes: value.byteLength, chunks: entries}
}

const patchDocument = (
  capture: CheckpointCapture,
  base: ReturnType<typeof canonicalizeGraph>,
  result: ReturnType<typeof canonicalizeGraph>,
): CheckpointForwardPatchDocumentV1 => {
  const fromSequence = capture.patches.previousSnapshotSequence === null
    ? 1
    : capture.patches.previousSnapshotSequence + 1
  const document: CheckpointForwardPatchDocumentV1 = {
    schema: "metafor/checkpoint-forward-patches/v1",
    cutId: capture.identity.cutId,
    projection: {
      schema: "metafor/graph",
      root: result.value.root,
      canonicalization: "rfc8785",
    },
    previousSnapshotSequence: capture.patches.previousSnapshotSequence,
    fromSequence,
    throughSequence: capture.identity.sequence,
    base: {
      sequence: capture.patches.previousSnapshotSequence ?? 0,
      sha256: base.sha256,
    },
    result: {
      sequence: capture.identity.sequence,
      sha256: result.sha256,
    },
    entries: capture.patches.entries.map((entry) => ({
      sequence: entry.sequence,
      operations: entry.operations,
    })),
  }
  if (!validateCheckpointForwardPatchDocumentV1(document)) {
    throw new CheckpointRepositoryError("invalid_patch_span", "Checkpoint forward patch span is not closed or complete")
  }
  return structuredClone(document)
}

export class CheckpointGitRepository {
  readonly directory: string
  readonly limits: CheckpointRepositoryLimits

  private constructor(
    directory: string,
    limits: CheckpointRepositoryLimits,
    private readonly hooks: CheckpointRepositoryHooks = {},
  ) {
    this.directory = resolve(directory)
    this.limits = validateLimits(limits)
    if (gitText(this.directory, ["rev-parse", "--is-bare-repository"]) !== "true") {
      throw new CheckpointRepositoryError("not_bare", "Checkpoint repository must be bare")
    }
  }

  static initialize(
    directory: string,
    limits: CheckpointRepositoryLimits,
    hooks: CheckpointRepositoryHooks = {},
  ): CheckpointGitRepository {
    const target = resolve(directory)
    validateLimits(limits)
    if (existsSync(target)) {
      throw new CheckpointRepositoryError("target_exists", "Checkpoint repository target already exists")
    }
    const result = spawnSync("git", ["init", "--bare", "--quiet", target], {
      env: {...process.env, GIT_TERMINAL_PROMPT: "0"},
    })
    if (result.error || result.status !== 0) {
      throw new CheckpointRepositoryError("git_failure", "Cannot initialize checkpoint bare repository", {
        cause: result.error,
      })
    }
    return new CheckpointGitRepository(target, limits, hooks)
  }

  static open(
    directory: string,
    limits: CheckpointRepositoryLimits,
    hooks: CheckpointRepositoryHooks = {},
  ): CheckpointGitRepository {
    return new CheckpointGitRepository(directory, limits, hooks)
  }

  private manifest(commit: string): CheckpointManifestV1 {
    if (!commitPattern.test(commit)) {
      throw new CheckpointRepositoryError("invalid_commit", "Checkpoint commit identity is invalid")
    }
    const input = parseJSON(git(this.directory, ["show", `${commit}:checkpoint.json`]), "Checkpoint manifest")
    const result = validateCheckpointManifestV1(input)
    if (!result.ok) {
      throw new CheckpointRepositoryError(
        "invalid_manifest",
        `Checkpoint manifest is invalid: ${result.issues.map((issue) => `${issue.path}:${issue.code}`).join(", ")}`,
      )
    }
    return result.value
  }

  private verifyBlob(commit: string, input: CheckpointBlobV1, expectedPaths: Set<string>): Uint8Array {
    const hash = createHash("sha256")
    const output = Buffer.alloc(input.bytes)
    let offset = 0
    for (const chunk of input.chunks) {
      const path = chunkPath(chunk.sha256)
      expectedPaths.add(path)
      const value = git(this.directory, ["show", `${commit}:${path}`])
      if (value.byteLength !== chunk.bytes || digest(value) !== chunk.sha256) {
        throw new CheckpointRepositoryError("corrupt_chunk", `Checkpoint chunk ${chunk.sha256} failed integrity validation`)
      }
      value.copy(output, offset)
      offset += value.byteLength
      hash.update(value)
    }
    if (offset !== input.bytes || hash.digest("hex") !== input.sha256) {
      throw new CheckpointRepositoryError("corrupt_blob", `Checkpoint blob ${input.sha256} failed integrity validation`)
    }
    return output
  }

  verify(identity: CheckpointIdentityV1): CheckpointWriteResult {
    const ref = sequenceRef(identity)
    const commit = readRef(this.directory, ref)
    if (!commit) throw new CheckpointRepositoryError("missing_checkpoint", `Checkpoint ${identity.cutId}:${identity.sequence} is missing`)
    return this.verifyCommit(commit, identity, ref)
  }

  verifyCommit(
    commit: string,
    identity?: CheckpointIdentityV1,
    ref = identity ? sequenceRef(identity) : "",
  ): CheckpointWriteResult {
    const manifest = this.manifest(commit)
    if (
      identity &&
      (manifest.identity.cutId !== identity.cutId || manifest.identity.sequence !== identity.sequence)
    ) {
      throw new CheckpointRepositoryError("identity_mismatch", "Checkpoint ref and manifest identity differ")
    }
    const expectedPaths = new Set<string>(["checkpoint.json"])
    this.verifyBlob(commit, manifest.boundary.blob, expectedPaths)
    for (const entry of manifest.mass) this.verifyBlob(commit, entry.blob, expectedPaths)
    const projection = this.verifyBlob(commit, manifest.projection.blob, expectedPaths)
    const canonicalProjection = canonicalizeGraph(parseJSON(Buffer.from(projection), "Checkpoint Graph projection"))
    if (
      canonicalProjection.sha256 !== manifest.projection.blob.sha256 ||
      canonicalProjection.value.root !== manifest.projection.root
    ) {
      throw new CheckpointRepositoryError("invalid_projection", "Checkpoint Graph projection does not match its manifest")
    }
    const patches = parseJSON(
      Buffer.from(this.verifyBlob(commit, manifest.patches.blob, expectedPaths)),
      "Checkpoint forward patch span",
    )
    if (
      !validateCheckpointForwardPatchDocumentV1(patches) ||
      patches.cutId !== manifest.identity.cutId ||
      patches.previousSnapshotSequence !== manifest.patches.previousSnapshotSequence ||
      patches.fromSequence !== manifest.patches.fromSequence ||
      patches.throughSequence !== manifest.patches.throughSequence ||
      patches.entries.length !== manifest.patches.entries ||
      patches.base.sequence !== manifest.patches.base.sequence ||
      patches.base.sha256 !== manifest.patches.base.sha256 ||
      patches.result.sequence !== manifest.patches.result.sequence ||
      patches.result.sha256 !== manifest.patches.result.sha256 ||
      patches.result.sha256 !== canonicalProjection.sha256
    ) {
      throw new CheckpointRepositoryError("invalid_patch_span", "Checkpoint forward patch span does not match its manifest")
    }
    const actualPaths = gitText(this.directory, ["ls-tree", "-r", "--name-only", commit])
      .split("\n")
      .filter(Boolean)
      .toSorted()
    if (
      actualPaths.length !== expectedPaths.size ||
      actualPaths.some((path, index) => path !== [...expectedPaths].toSorted()[index])
    ) {
      throw new CheckpointRepositoryError("unexpected_tree", "Checkpoint commit contains unexpected or missing files")
    }
    return {commit, manifest, sequenceRef: ref}
  }

  write(capture: CheckpointCapture): CheckpointWriteResult {
    const ref = sequenceRef(capture.identity)
    if (readRef(this.directory, ref)) {
      throw new CheckpointRepositoryError("duplicate_checkpoint", `Checkpoint ${capture.identity.cutId}:${capture.identity.sequence} already exists`)
    }
    if (capture.mass.length > this.limits.maxMassEntries) {
      throw new CheckpointRepositoryError("too_many_mass_entries", "Checkpoint Mass catalog exceeds its configured budget")
    }
    const previousCommit = readRef(this.directory, headRef(capture.identity.cutId))
    const previousManifest = previousCommit ? this.manifest(previousCommit) : null
    if (
      previousManifest &&
      (
        capture.identity.sequence <= previousManifest.identity.sequence ||
        capture.patches.previousSnapshotSequence !== previousManifest.identity.sequence
      )
    ) {
      throw new CheckpointRepositoryError("invalid_parent", "Checkpoint does not continue the current cut head")
    }
    if (!previousManifest && capture.patches.previousSnapshotSequence !== null) {
      throw new CheckpointRepositoryError("invalid_parent", "First checkpoint in a cut cannot name a previous snapshot")
    }

    const chunks = new Map<string, Uint8Array>()
    const boundaryBytes = bytes(capture.boundary, "Boundary checkpoint")
    const baseProjection = canonicalizeGraph(capture.projection.base)
    const resultProjection = canonicalizeGraph(capture.projection.result)
    if (baseProjection.value.root !== resultProjection.value.root) {
      throw new CheckpointRepositoryError("projection_root_mismatch", "Checkpoint base and result roots differ")
    }
    if (
      previousManifest &&
      previousManifest.projection.blob.sha256 !== baseProjection.sha256
    ) {
      throw new CheckpointRepositoryError("projection_base_mismatch", "Checkpoint base projection is not the previous snapshot")
    }
    if (!previousManifest && baseProjection.sha256 !== resultProjection.sha256) {
      throw new CheckpointRepositoryError(
        "first_projection_base_missing",
        "First non-zero checkpoint requires a proven unchanged sequence-zero projection baseline",
      )
    }
    const mass = capture.mass
      .map((entry) => ({
        keyId: entry.keyId,
        format: entry.format,
        bytes: bytes(entry.bytes, `Mass ${entry.keyId}`),
      }))
      .toSorted((left, right) => utf16Compare(left.keyId, right.keyId))
    const patches = patchDocument(capture, baseProjection, resultProjection)
    let replayed = baseProjection.value
    for (const entry of patches.entries) {
      replayed = applyGraphPatch(replayed, entry.operations)
    }
    if (canonicalizeGraph(replayed).sha256 !== resultProjection.sha256) {
      throw new CheckpointRepositoryError("invalid_patch_result", "Checkpoint patch span does not produce its result projection")
    }
    const patchBytes = canonicalJSON(patches)
    const logicalBytes = boundaryBytes.byteLength +
      mass.reduce((total, entry) => total + entry.bytes.byteLength, 0) +
      patchBytes.byteLength +
      resultProjection.bytes.byteLength
    if (logicalBytes > this.limits.maxTotalBytes) {
      throw new CheckpointRepositoryError("checkpoint_too_large", "Checkpoint exceeds its configured total byte budget")
    }
    const massManifest: CheckpointMassV1[] = mass.map((entry) => ({
      keyId: entry.keyId,
      format: entry.format,
      blob: blob(entry.bytes, chunks, this.limits, `Mass ${entry.keyId}`),
    }))
    const manifest: CheckpointManifestV1 = {
      schema: CHECKPOINT_MANIFEST_SCHEMA_V1,
      repository: CHECKPOINT_REPOSITORY_ID,
      identity: structuredClone(capture.identity),
      capturedAt: capture.capturedAt,
      trigger: {kind: capture.trigger},
      boundary: {format: "sqlite", blob: blob(boundaryBytes, chunks, this.limits, "Boundary checkpoint")},
      mass: massManifest,
      projection: {
        schema: "metafor/graph",
        root: resultProjection.value.root,
        canonicalization: "rfc8785",
        blob: blob(resultProjection.bytes, chunks, this.limits, "Graph projection"),
      },
      patches: {
        format: "json-patch",
        previousSnapshotSequence: patches.previousSnapshotSequence,
        fromSequence: patches.fromSequence,
        throughSequence: patches.throughSequence,
        entries: patches.entries.length,
        base: structuredClone(patches.base),
        result: structuredClone(patches.result),
        blob: blob(patchBytes, chunks, this.limits, "Forward patch span"),
      },
    }
    const validation = validateCheckpointManifestV1(manifest)
    if (!validation.ok) {
      throw new CheckpointRepositoryError(
        "invalid_manifest",
        `Checkpoint manifest construction failed: ${validation.issues.map((issue) => issue.code).join(", ")}`,
      )
    }

    const files = new Map<string, string>()
    for (const [sha256, value] of chunks) {
      files.set(chunkPath(sha256), gitText(this.directory, ["hash-object", "-w", "--stdin"], value))
    }
    files.set(
      "checkpoint.json",
      gitText(this.directory, ["hash-object", "-w", "--stdin"], canonicalJSON(manifest)),
    )
    const temporary = mkdtempSync(join(tmpdir(), "metafor-checkpoint-index-"))
    let tree: string
    try {
      const index = join(temporary, "index")
      const environment = {GIT_INDEX_FILE: index}
      git(this.directory, ["read-tree", "--empty"], undefined, environment)
      for (const [path, object] of [...files].toSorted(([left], [right]) => utf16Compare(left, right))) {
        git(this.directory, ["update-index", "--add", "--cacheinfo", "100644", object, path], undefined, environment)
      }
      tree = gitText(this.directory, ["write-tree"], undefined, environment)
    } finally {
      rmSync(temporary, {recursive: true, force: true})
    }
    const commitArgs = ["commit-tree", tree]
    if (previousCommit) commitArgs.push("-p", previousCommit)
    const commit = gitText(
      this.directory,
      commitArgs,
      `checkpoint ${capture.identity.cutId}:${capture.identity.sequence}\n`,
      {
        GIT_AUTHOR_NAME: "MetaFor Checkpoint",
        GIT_AUTHOR_EMAIL: "checkpoint@metafor.local",
        GIT_COMMITTER_NAME: "MetaFor Checkpoint",
        GIT_COMMITTER_EMAIL: "checkpoint@metafor.local",
        GIT_AUTHOR_DATE: capture.capturedAt,
        GIT_COMMITTER_DATE: capture.capturedAt,
      },
    )
    if (!commitPattern.test(commit)) {
      throw new CheckpointRepositoryError("invalid_commit", "Git did not create a canonical checkpoint commit")
    }
    this.verifyCommit(commit)
    this.hooks.beforePublish?.(commit)

    const cutHead = headRef(capture.identity.cutId)
    const transaction = [
      "start",
      `create ${ref} ${commit}`,
      previousCommit
        ? `update ${cutHead} ${commit} ${previousCommit}`
        : `create ${cutHead} ${commit}`,
      "prepare",
      "commit",
      "",
    ].join("\n")
    try {
      git(this.directory, ["update-ref", "--stdin"], transaction)
    } catch (error) {
      throw new CheckpointRepositoryError("publish_conflict", "Checkpoint ref publication failed atomically", {
        cause: error,
      })
    }
    return this.verify(capture.identity)
  }
}
