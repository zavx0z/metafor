import {
  createHash,
} from "node:crypto"
import {
  cpSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs"
import {tmpdir} from "node:os"
import {basename, extname, join, resolve} from "node:path"
import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  validateGraph,
  type Graph,
} from "@metafor/types/metafor/graph"
import {readBoundaryGraphProjection} from "../../boundary/graph.ts"
import {open as openBoundary} from "../../boundary/sqlite.ts"
import {readDarkDeclarationProjection} from "../graph.ts"
import {DarkForceHistory} from "../force/history.ts"
import {
  CheckpointGitRepository,
  CheckpointRepositoryError,
  type CheckpointMassCapture,
  type CheckpointPatchCaptureEntry,
  type CheckpointRepositoryLimits,
  type CheckpointWriteResult,
} from "./repository.ts"
import {
  canonicalizeGraph,
  diffGraph,
} from "./projection.ts"
import {initializeCheckpointControlBaseline} from "./control.ts"

export const LOCAL_CHECKPOINT_LIMITS_V1: CheckpointRepositoryLimits = {
  maxBlobBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxMassEntries: 256,
}

export type OfflineCheckpointCaptureOptions = {
  root: string
  historyDirectory: string
  baseBoundary: string
  currentBoundary: string
  massDirectory: string
  repository: string
  controlState: string
  capturedAt?: string
  trigger?: "semantic-materialization" | "quiescent" | "material-mass" | "owner-bookmark" | "measured-replay-cost"
  limits?: CheckpointRepositoryLimits
}

export type OfflineCheckpointCaptureResult = {
  checkpoint: CheckpointWriteResult
  cutId: string
  sequence: number
  projectionSha256: string
  massEntries: number
  boundaryBytes: number
  repository: string
  controlState: string
}

export type FirstOfflineCheckpointPublication = {
  cutId: string
  sequence: number
  acceptedSequences: number[]
  base: Graph
  result: Graph
  boundary: Uint8Array
  mass: CheckpointMassCapture[]
  repository: string
  controlState: string
  capturedAt: string
  trigger: NonNullable<OfflineCheckpointCaptureOptions["trigger"]>
  limits?: CheckpointRepositoryLimits
}

export type CurrentOfflineCheckpointPublication = {
  cutId: string
  sequence: number
  previousSnapshotSequence: number | null
  acceptedSequences: number[]
  base: Graph
  result: Graph
  boundary: Uint8Array
  mass: CheckpointMassCapture[]
  patches: CheckpointPatchCaptureEntry[]
  repository: string
  capturedAt: string
  trigger: NonNullable<OfflineCheckpointCaptureOptions["trigger"]>
  limits?: CheckpointRepositoryLimits
}

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex")

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

const canonicalBytes = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(canonicalValue(value)))

const copySQLiteSet = (source: string, targetDirectory: string): string => {
  const target = join(targetDirectory, basename(source))
  if (!existsSync(source) || !lstatSync(source).isFile()) {
    throw new Error(`Checkpoint Boundary database is missing: ${source}`)
  }
  copyFileSync(source, target)
  for (const suffix of ["-wal", "-shm"]) {
    const companion = `${source}${suffix}`
    if (existsSync(companion)) copyFileSync(companion, `${target}${suffix}`)
  }
  return target
}

const offlineProjection = async (
  root: string,
  sourceDatabase: string,
): Promise<{projection: Graph; boundary: Uint8Array}> => {
  const directory = mkdtempSync(join(tmpdir(), "metafor-checkpoint-boundary-"))
  try {
    const filename = copySQLiteSet(sourceDatabase, directory)
    const boundary = await openBoundary(filename)
    try {
      const [dark, current] = await Promise.all([
        readDarkDeclarationProjection({root}),
        readBoundaryGraphProjection(boundary, {root}),
      ])
      const candidate = {
        schema: GRAPH_SCHEMA,
        root: dark.root,
        template: dark.template,
        runtime: current.runtime,
      }
      const validation = validateGraph(candidate)
      if (!validation.ok) {
        throw new Error(
          `Offline checkpoint Graph is invalid: ${validation.issues.map(({path, code}) => `${path}:${code}`).join(", ")}`,
        )
      }
      return {
        projection: validation.value,
        boundary: new Uint8Array(),
      }
    } finally {
      await boundary.close()
    }
  } finally {
    rmSync(directory, {recursive: true, force: true})
  }
}

const offlineCurrentProjection = async (
  root: string,
  sourceDatabase: string,
): Promise<{projection: Graph; boundary: Uint8Array}> => {
  const directory = mkdtempSync(join(tmpdir(), "metafor-checkpoint-boundary-"))
  try {
    const filename = copySQLiteSet(sourceDatabase, directory)
    const boundary = await openBoundary(filename)
    let projection: Graph
    try {
      const [dark, current] = await Promise.all([
        readDarkDeclarationProjection({root}),
        readBoundaryGraphProjection(boundary, {root}),
      ])
      const validation = validateGraph({
        schema: GRAPH_SCHEMA,
        root: dark.root,
        template: dark.template,
        runtime: current.runtime,
      })
      if (!validation.ok) {
        throw new Error(
          `Offline checkpoint Graph is invalid: ${validation.issues.map(({path, code}) => `${path}:${code}`).join(", ")}`,
        )
      }
      projection = validation.value
    } finally {
      await boundary.close()
    }
    return {
      projection,
      boundary: new Uint8Array(readFileSync(filename)),
    }
  } finally {
    rmSync(directory, {recursive: true, force: true})
  }
}

const mass = (directory: string): CheckpointMassCapture[] => {
  const root = resolve(directory)
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    throw new Error(`Checkpoint Mass directory is missing: ${root}`)
  }
  return readdirSync(root).toSorted().map((name) => {
    const filename = join(root, name)
    const stat = lstatSync(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Checkpoint Mass entry is not a regular file: ${filename}`)
    }
    const extension = extname(name)
    const keyId = name.slice(0, -extension.length)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(keyId)) {
      throw new Error(`Checkpoint Mass key filename is invalid: ${name}`)
    }
    const format = extension === ".json"
      ? "json"
      : extension === ".bin"
        ? "binary"
        : null
    if (!format) throw new Error(`Checkpoint Mass format is invalid: ${name}`)
    return {
      keyId,
      format,
      bytes: new Uint8Array(readFileSync(filename)),
    }
  })
}

const samePublishedCapture = (
  checkpoint: CheckpointWriteResult,
  publication: FirstOfflineCheckpointPublication,
): boolean => {
  const manifest = checkpoint.manifest
  const expectedMass = publication.mass
    .map((entry) => ({
      keyId: entry.keyId,
      format: entry.format,
      sha256: sha256(entry.bytes),
      bytes: entry.bytes.byteLength,
    }))
    .toSorted((left, right) => left.keyId < right.keyId ? -1 : left.keyId > right.keyId ? 1 : 0)
  return manifest.capturedAt === publication.capturedAt &&
    manifest.trigger.kind === publication.trigger &&
    manifest.boundary.blob.sha256 === sha256(publication.boundary) &&
    manifest.boundary.blob.bytes === publication.boundary.byteLength &&
    manifest.projection.blob.sha256 === canonicalizeGraph(publication.result).sha256 &&
    manifest.patches.previousSnapshotSequence === null &&
    manifest.patches.fromSequence === 1 &&
    manifest.patches.throughSequence === publication.sequence &&
    manifest.patches.entries === publication.acceptedSequences.length &&
    manifest.mass.length === expectedMass.length &&
    manifest.mass.every((entry, index) => {
      const expected = expectedMass[index]
      return expected !== undefined &&
        entry.keyId === expected.keyId &&
        entry.format === expected.format &&
        entry.blob.sha256 === expected.sha256 &&
        entry.blob.bytes === expected.bytes
    })
}

const expectedPatchSha256 = (
  publication: CurrentOfflineCheckpointPublication,
): string => {
  const base = canonicalizeGraph(publication.base)
  const result = canonicalizeGraph(publication.result)
  return sha256(canonicalBytes({
    schema: "metafor/checkpoint-forward-patches/v1",
    cutId: publication.cutId,
    projection: {
      schema: "metafor/graph",
      root: result.value.root,
      canonicalization: "rfc8785",
    },
    previousSnapshotSequence: publication.previousSnapshotSequence,
    fromSequence: (publication.previousSnapshotSequence ?? 0) + 1,
    throughSequence: publication.sequence,
    base: {
      sequence: publication.previousSnapshotSequence ?? 0,
      sha256: base.sha256,
    },
    result: {
      sequence: publication.sequence,
      sha256: result.sha256,
    },
    entries: publication.patches,
  }))
}

const samePublishedCurrentCapture = (
  checkpoint: CheckpointWriteResult,
  publication: CurrentOfflineCheckpointPublication,
): boolean => {
  const manifest = checkpoint.manifest
  const result = canonicalizeGraph(publication.result)
  const expectedMass = publication.mass
    .map((entry) => ({
      keyId: entry.keyId,
      format: entry.format,
      sha256: sha256(entry.bytes),
      bytes: entry.bytes.byteLength,
    }))
    .toSorted((left, right) => utf16Compare(left.keyId, right.keyId))
  return manifest.identity.cutId === publication.cutId &&
    manifest.identity.sequence === publication.sequence &&
    manifest.capturedAt === publication.capturedAt &&
    manifest.trigger.kind === publication.trigger &&
    manifest.boundary.blob.sha256 === sha256(publication.boundary) &&
    manifest.boundary.blob.bytes === publication.boundary.byteLength &&
    manifest.projection.blob.sha256 === result.sha256 &&
    manifest.patches.previousSnapshotSequence === publication.previousSnapshotSequence &&
    manifest.patches.fromSequence === (publication.previousSnapshotSequence ?? 0) + 1 &&
    manifest.patches.throughSequence === publication.sequence &&
    manifest.patches.entries === publication.patches.length &&
    manifest.patches.blob.sha256 === expectedPatchSha256(publication) &&
    manifest.mass.length === expectedMass.length &&
    manifest.mass.every((entry, index) => {
      const expected = expectedMass[index]
      return expected !== undefined &&
        entry.keyId === expected.keyId &&
        entry.format === expected.format &&
        entry.blob.sha256 === expected.sha256 &&
        entry.blob.bytes === expected.bytes
    })
}

/**
 * Publishes or resumes any verified stopped checkpoint sequence.
 *
 * The caller must provide the exact previous snapshot projection and one
 * canonical patch entry for every accepted history sequence in the span.
 * This function does not infer empty mutations from a count and does not
 * initialize or change a live checkpoint-control baseline.
 */
export const publishCurrentOfflineCheckpoint = (
  publication: CurrentOfflineCheckpointPublication,
): CheckpointWriteResult => {
  const fromSequence = (publication.previousSnapshotSequence ?? 0) + 1
  if (
    !Number.isSafeInteger(publication.sequence) ||
    publication.sequence < fromSequence ||
    publication.acceptedSequences.length !== publication.sequence - fromSequence + 1 ||
    publication.acceptedSequences.some((sequence, index) => sequence !== fromSequence + index) ||
    publication.patches.length !== publication.acceptedSequences.length ||
    publication.patches.some((entry, index) =>
      entry.sequence !== publication.acceptedSequences[index]
    )
  ) {
    throw new Error("Current checkpoint history/patch coverage is incomplete")
  }

  const repositoryPath = resolve(publication.repository)
  const limits = publication.limits ?? LOCAL_CHECKPOINT_LIMITS_V1
  const repository = existsSync(repositoryPath)
    ? CheckpointGitRepository.open(repositoryPath, limits)
    : CheckpointGitRepository.initialize(repositoryPath, limits)
  const capture = {
    identity: {cutId: publication.cutId, sequence: publication.sequence},
    capturedAt: publication.capturedAt,
    trigger: publication.trigger,
    boundary: publication.boundary,
    mass: publication.mass,
    projection: {
      base: publication.base,
      result: publication.result,
    },
    patches: {
      previousSnapshotSequence: publication.previousSnapshotSequence,
      entries: publication.patches,
    },
  } as const
  try {
    return repository.write(capture)
  } catch (error) {
    if (!(error instanceof CheckpointRepositoryError) || error.code !== "duplicate_checkpoint") throw error
    const checkpoint = repository.verify(capture.identity)
    if (!samePublishedCurrentCapture(checkpoint, publication)) {
      throw new Error("Existing current checkpoint does not match the requested stopped capture", {
        cause: error,
      })
    }
    return checkpoint
  }
}

/**
 * Publishes or resumes the first non-zero checkpoint.
 *
 * Ref publication precedes control-baseline initialization deliberately: a
 * crash can only leave the contour fail-closed with a missing baseline. A
 * retry verifies the exact existing commit and completes initialization.
 */
export const publishFirstOfflineCheckpoint = (
  publication: FirstOfflineCheckpointPublication,
): CheckpointWriteResult => {
  if (
    publication.sequence <= 0 ||
    publication.acceptedSequences.length !== publication.sequence ||
    publication.acceptedSequences.some((sequence, index) => sequence !== index + 1)
  ) throw new Error("First checkpoint accepted sequence coverage is incomplete")
  const base = canonicalizeGraph(publication.base)
  const result = canonicalizeGraph(publication.result)
  const operations = diffGraph(publication.base, publication.result)
  if (base.sha256 !== result.sha256 || operations.length !== 0) {
    throw new Error("First non-zero checkpoint cannot prove an unchanged sequence-zero Graph baseline")
  }

  const repositoryPath = resolve(publication.repository)
  const checkpoint = publishCurrentOfflineCheckpoint({
    cutId: publication.cutId,
    sequence: publication.sequence,
    previousSnapshotSequence: null,
    acceptedSequences: publication.acceptedSequences,
    base: publication.base,
    result: publication.result,
    boundary: publication.boundary,
    mass: publication.mass,
    patches: publication.acceptedSequences.map((sequence) => ({sequence, operations: []})),
    repository: repositoryPath,
    capturedAt: publication.capturedAt,
    trigger: publication.trigger,
    ...(publication.limits ? {limits: publication.limits} : {}),
  })
  if (!samePublishedCapture(checkpoint, publication)) {
    throw new Error("Published first checkpoint does not match the requested capture")
  }
  initializeCheckpointControlBaseline(
    resolve(publication.controlState),
    publication.cutId,
    publication.sequence,
  )
  return checkpoint
}

/**
 * Captures only an already stopped contour.
 *
 * The caller owns process/listener proof and backups. This function copies both
 * SQLite inputs into private temporary directories, never opens the live or
 * backup database in place, and publishes no ref until all integrity checks pass.
 */
export const captureOfflineCheckpoint = async (
  options: OfflineCheckpointCaptureOptions,
): Promise<OfflineCheckpointCaptureResult> => {
  const root = parseMetaAddress(options.root)
  if (!root) throw new Error("Checkpoint root must be a canonical two-segment Meta address")
  const historyCopyRoot = mkdtempSync(join(tmpdir(), "metafor-checkpoint-history-"))
  let status: ReturnType<DarkForceHistory["status"]>
  let accepted: ReturnType<DarkForceHistory["read"]>
  try {
    const copiedHistory = join(historyCopyRoot, "history")
    cpSync(resolve(options.historyDirectory), copiedHistory, {
      recursive: true,
      errorOnExist: true,
      force: false,
    })
    const history = new DarkForceHistory(copiedHistory)
    status = history.status()
    if (status.sequence <= 0) throw new Error("First live checkpoint requires a non-zero accepted Particle baseline")
    if (status.sequence !== 1) {
      throw new Error("First live checkpoint v1 requires exactly one replayable acceptance after sequence zero")
    }
    accepted = history.read({fromSequence: 1, toSequence: status.sequence, limit: status.sequence})
    if (
      accepted.length !== status.sequence ||
      accepted.some((entry, index) => entry.sequence !== index + 1)
    ) throw new Error("Dark Force history has incomplete first checkpoint coverage")
  } finally {
    rmSync(historyCopyRoot, {recursive: true, force: true})
  }

  const [base, current] = await Promise.all([
    offlineProjection(root, resolve(options.baseBoundary)),
    offlineCurrentProjection(root, resolve(options.currentBoundary)),
  ])
  const resultCanonical = canonicalizeGraph(current.projection)
  const repositoryPath = resolve(options.repository)
  const checkpoint = publishFirstOfflineCheckpoint({
    cutId: status.cutId,
    sequence: status.sequence,
    acceptedSequences: accepted.map(({sequence}) => sequence),
    base: base.projection,
    result: current.projection,
    boundary: current.boundary,
    mass: mass(options.massDirectory),
    repository: repositoryPath,
    controlState: resolve(options.controlState),
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    trigger: options.trigger ?? "owner-bookmark",
    ...(options.limits ? {limits: options.limits} : {}),
  })
  return {
    checkpoint,
    cutId: status.cutId,
    sequence: status.sequence,
    projectionSha256: resultCanonical.sha256,
    massEntries: checkpoint.manifest.mass.length,
    boundaryBytes: checkpoint.manifest.boundary.blob.bytes,
    repository: repositoryPath,
    controlState: resolve(options.controlState),
  }
}
