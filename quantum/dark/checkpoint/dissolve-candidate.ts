import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs"
import {createHash} from "node:crypto"
import {tmpdir} from "node:os"
import {basename, dirname, extname, join, relative, resolve, sep} from "node:path"
import {
  canonicalizeGraph,
} from "../graph/checkpoint.ts"
import {
  publishCurrentOfflineCheckpoint,
  type CurrentOfflineCheckpointPublication,
} from "./capture.ts"
import {
  DetachedBoundaryDissolveCandidateStaging,
  BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
  type BoundaryDissolveCandidateStageReceiptV1,
  type BoundaryDissolveCheckpointBindingV1,
} from "../../boundary/dissolve-candidate-staging.ts"
import {
  createIsolatedBoundaryDissolveMassEvidenceReader,
  type BoundaryDissolveValidAbsence,
} from "../../boundary/dissolve-mass-evidence.ts"
import type {
  BoundaryDissolveProposalV1,
} from "../../boundary/dissolve-staging.ts"
import {
  open as openBoundary,
  type BoundaryDatabase,
} from "boundary/sqlite"
import {DarkForceHistory} from "../force/history.ts"
import {readCheckpointControlState} from "./control.ts"
import {
  MassCatalog,
  massFileName,
  type MassFileFormat,
} from "../../../shared/mass.ts"
import type {MetaAddress, Graph} from "@metafor/types/metafor/graph"
import type {
  CheckpointMassCapture,
  CheckpointPatchCaptureEntry,
  CheckpointRepositoryLimits,
} from "./repository.ts"

export const DISSOLVE_CANDIDATE_ROLLBACK_MANIFEST_V1 =
  "metafor/dissolve-candidate-rollback/v1" as const
export const DISSOLVE_CANDIDATE_BUNDLE_RECEIPT_V1 =
  "metafor/dissolve-candidate-bundle/v1" as const
export const DISSOLVE_CANDIDATE_FAILURE_RECEIPT_V1 =
  "metafor/dissolve-candidate-failure/v1" as const

export type CandidateFileDigestV1 = Readonly<{
  path: string
  bytes: number
  sha256: string
}>

export type DissolveCandidateRollbackManifestV1 = Readonly<{
  schema: typeof DISSOLVE_CANDIDATE_ROLLBACK_MANIFEST_V1
  capturedAt: string
  checkpoint: Readonly<{cutId: string; sequence: number; commit: string}>
  files: readonly CandidateFileDigestV1[]
  retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
}>

export type DissolveCandidateBundleReceiptV1 = Readonly<{
  schema: typeof DISSOLVE_CANDIDATE_BUNDLE_RECEIPT_V1
  bundleId: string
  capturedAt: string
  root: MetaAddress
  checkpoint: BoundaryDissolveCheckpointBindingV1
  rollbackManifestSha256: string
  rollbackFiles: number
  stage: Readonly<{stageId: string; receiptId: string}>
  candidateBoundarySha256: string
  candidateMassManifestSha256: string
  retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
  effects: "none"
}>

export type DissolveCandidateBundleOptions = Readonly<{
  targetDirectory: string
  root: MetaAddress
  stoppedBoundary: string
  stoppedMassDirectory: string
  stoppedHistoryDirectory: string
  stoppedControlState: string
  previousCheckpointRepository?: string
  previousSnapshotSequence: number | null
  baseProjection: Graph
  patches: readonly CheckpointPatchCaptureEntry[]
  proposal: BoundaryDissolveProposalV1
  validAbsent: readonly BoundaryDissolveValidAbsence[]
  capturedAt: string
  confirmStoppedPrivateCopies: true
  readGraph(
    boundary: BoundaryDatabase,
    root: MetaAddress,
    phase: "before" | "planned",
  ): Promise<Graph>
  limits?: CheckpointRepositoryLimits
}>

export type DissolveCandidateBundleResult = Readonly<{
  directory: string
  checkpointCommit: string
  rollbackManifest: DissolveCandidateRollbackManifestV1
  rollbackManifestSha256: string
  stage: BoundaryDissolveCandidateStageReceiptV1
  receipt: DissolveCandidateBundleReceiptV1
}>

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

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex")

const canonicalSha256 = (value: unknown): string =>
  sha256(canonicalBytes(value))

const checkedDirectory = (value: string, label: string): string => {
  const path = resolve(value)
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular directory: ${path}`)
  }
  return path
}

const checkedFile = (value: string, label: string): string => {
  const path = resolve(value)
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${path}`)
  }
  return path
}

const copyTree = (source: string, target: string): void => {
  const root = checkedDirectory(source, "Stopped private directory")
  mkdirSync(target, {recursive: false, mode: 0o700})
  const visit = (from: string, to: string): void => {
    for (const name of readdirSync(from).toSorted()) {
      const sourceEntry = join(from, name)
      const targetEntry = join(to, name)
      const stat = lstatSync(sourceEntry)
      if (stat.isSymbolicLink()) {
        throw new Error(`Stopped private copy contains a symlink: ${sourceEntry}`)
      }
      if (stat.isDirectory()) {
        mkdirSync(targetEntry, {mode: 0o700})
        visit(sourceEntry, targetEntry)
        continue
      }
      if (!stat.isFile()) {
        throw new Error(`Stopped private copy contains a non-file entry: ${sourceEntry}`)
      }
      copyFileSync(sourceEntry, targetEntry)
      chmodSync(targetEntry, 0o600)
    }
  }
  visit(root, target)
}

const copySQLiteSet = (source: string, target: string): void => {
  const filename = checkedFile(source, "Stopped private Boundary SQLite")
  mkdirSync(dirname(target), {recursive: true, mode: 0o700})
  copyFileSync(filename, target)
  chmodSync(target, 0o600)
  for (const suffix of ["-wal", "-shm"]) {
    const companion = `${filename}${suffix}`
    if (!existsSync(companion)) continue
    checkedFile(companion, `Stopped private Boundary SQLite ${suffix}`)
    copyFileSync(companion, `${target}${suffix}`)
    chmodSync(`${target}${suffix}`, 0o600)
  }
}

const regularFiles = (root: string, prefix: string): CandidateFileDigestV1[] => {
  const output: CandidateFileDigestV1[] = []
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).toSorted()) {
      const filename = join(directory, name)
      const stat = lstatSync(filename)
      if (stat.isSymbolicLink()) {
        throw new Error(`Candidate bundle contains a symlink: ${filename}`)
      }
      if (stat.isDirectory()) {
        visit(filename)
        continue
      }
      if (!stat.isFile()) {
        throw new Error(`Candidate bundle contains a non-file entry: ${filename}`)
      }
      const bytes = new Uint8Array(readFileSync(filename))
      output.push({
        path: `${prefix}/${relative(root, filename).split(sep).join("/")}`,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
      })
    }
  }
  visit(root)
  return output.toSorted((left, right) => utf16Compare(left.path, right.path))
}

const fsyncTree = (root: string): void => {
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).toSorted()) {
      const filename = join(directory, name)
      const stat = lstatSync(filename)
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        visit(filename)
        continue
      }
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Candidate bundle cannot sync non-regular entry: ${filename}`)
      }
      const descriptor = openSync(filename, "r")
      try {
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
    }
    const descriptor = openSync(directory, "r")
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
  }
  visit(root)
}

const atomicDurableJSON = (filename: string, value: unknown): void => {
  const directory = dirname(filename)
  mkdirSync(directory, {recursive: true, mode: 0o700})
  const temporary = join(
    directory,
    `.${basename(filename)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  )
  const descriptor = openSync(temporary, "wx", 0o600)
  try {
    writeSync(descriptor, canonicalBytes(value))
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  renameSync(temporary, filename)
  const parent = openSync(directory, "r")
  try {
    fsyncSync(parent)
  } finally {
    closeSync(parent)
  }
}

const compactSQLite = async (
  filename: string,
  massDirectory: string,
): Promise<BoundaryDatabase> => {
  const boundary = await openBoundary(filename, {
    massCatalog: new MassCatalog(massDirectory),
  })
  const quick = await boundary.projection.sql<Array<{quick_check: string}>>`
    PRAGMA quick_check
  `
  if (quick.length !== 1 || quick[0]?.quick_check !== "ok") {
    await boundary.close()
    throw new Error("Detached candidate Boundary quick_check failed")
  }
  const foreign = await boundary.projection.sql<unknown[]>`
    PRAGMA foreign_key_check
  `
  if (foreign.length > 0) {
    await boundary.close()
    throw new Error("Detached candidate Boundary foreign_key_check failed")
  }
  await boundary.projection.sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE)")
  return boundary
}

const closeStandaloneSQLite = async (
  boundary: BoundaryDatabase,
  filename: string,
): Promise<void> => {
  await boundary.projection.sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE)")
  await boundary.close()
  for (const suffix of ["-wal", "-shm"]) {
    const companion = `${filename}${suffix}`
    if (existsSync(companion)) rmSync(companion)
  }
  const descriptor = openSync(filename, "r")
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

const massCapture = (directory: string): CheckpointMassCapture[] =>
  readdirSync(directory).toSorted().map((name) => {
    const filename = join(directory, name)
    const stat = lstatSync(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Candidate Mass entry is not a regular file: ${filename}`)
    }
    const extension = extname(name)
    const keyId = name.slice(0, -extension.length)
    const format: MassFileFormat | null = extension === ".json"
      ? "json"
      : extension === ".bin"
        ? "binary"
        : null
    if (
      !format ||
      massFileName(keyId, format) !== name
    ) {
      throw new Error(`Candidate Mass filename is invalid: ${name}`)
    }
    return {
      keyId,
      format,
      bytes: new Uint8Array(readFileSync(filename)),
    }
  })

const historySequences = (
  history: DarkForceHistory,
  fromSequence: number,
  throughSequence: number,
): number[] => {
  const sequences: number[] = []
  let cursor = fromSequence
  while (cursor <= throughSequence) {
    const entries = history.read({
      fromSequence: cursor,
      toSequence: throughSequence,
      limit: Math.min(1_000, throughSequence - cursor + 1),
    })
    if (entries.length === 0) break
    for (const entry of entries) {
      if (entry.sequence !== cursor) {
        throw new Error("Stopped Dark Force history coverage is not contiguous")
      }
      sequences.push(entry.sequence)
      cursor += 1
    }
  }
  if (cursor !== throughSequence + 1) {
    throw new Error("Stopped Dark Force history coverage is incomplete")
  }
  return sequences
}

const writeFailureReceipt = (
  directory: string,
  error: unknown,
  capturedAt: string,
): void => {
  try {
    atomicDurableJSON(join(directory, "candidate-failure.json"), {
      schema: DISSOLVE_CANDIDATE_FAILURE_RECEIPT_V1,
      failedAt: capturedAt,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
      retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
      effects: "none",
    })
  } catch {
    // The partially built private target is still retained for inspection.
  }
}

/**
 * Builds one non-live candidate bundle from caller-certified stopped copies.
 *
 * No source path is opened as a database or mutated. The only Boundary write
 * is the candidate stage table inside targetDirectory/candidate/boundary.sqlite.
 */
export const createDetachedDissolveCandidateBundle = async (
  options: DissolveCandidateBundleOptions,
): Promise<DissolveCandidateBundleResult> => {
  if (options.confirmStoppedPrivateCopies !== true) {
    throw new Error("Detached dissolve candidate requires certified stopped private copies")
  }
  if (
    options.root !== options.proposal.request.source ||
    options.validAbsent.length !== 1 ||
    new Date(options.capturedAt).toISOString() !== options.capturedAt
  ) {
    throw new Error("Detached dissolve candidate identity, absence or capture time is invalid")
  }
  const target = resolve(options.targetDirectory)
  if (existsSync(target)) {
    throw new Error(`Detached dissolve candidate target already exists: ${target}`)
  }
  const sourceDirectories = [
    resolve(options.stoppedMassDirectory),
    resolve(options.stoppedHistoryDirectory),
    ...(options.previousCheckpointRepository
      ? [resolve(options.previousCheckpointRepository)]
      : []),
  ]
  if (sourceDirectories.some((source) =>
    target === source ||
    target.startsWith(`${source}${sep}`) ||
    source.startsWith(`${target}${sep}`)
  )) {
    throw new Error("Detached dissolve candidate target overlaps a stopped private source")
  }
  mkdirSync(target, {mode: 0o700})

  try {
    const rollback = join(target, "rollback")
    const rollbackBoundary = join(rollback, "boundary.sqlite")
    const rollbackMass = join(rollback, "mass")
    const rollbackHistory = join(rollback, "history")
    const rollbackControl = join(rollback, "checkpoint-control.json")
    mkdirSync(rollback, {mode: 0o700})
    copySQLiteSet(options.stoppedBoundary, rollbackBoundary)
    copyTree(options.stoppedMassDirectory, rollbackMass)
    copyTree(options.stoppedHistoryDirectory, rollbackHistory)
    copyFileSync(
      checkedFile(options.stoppedControlState, "Stopped checkpoint control state"),
      rollbackControl,
    )
    chmodSync(rollbackControl, 0o600)

    const candidate = join(target, "candidate")
    const candidateBoundary = join(candidate, "boundary.sqlite")
    const candidateMass = join(candidate, "mass")
    mkdirSync(candidate, {mode: 0o700})
    copySQLiteSet(rollbackBoundary, candidateBoundary)
    copyTree(rollbackMass, candidateMass)

    let candidateDatabase = await compactSQLite(
      candidateBoundary,
      candidateMass,
    )
    const preGraph = await options.readGraph(
      candidateDatabase,
      options.proposal.request.source,
      "before",
    )
    await closeStandaloneSQLite(candidateDatabase, candidateBoundary)
    const preStageBoundaryBytes = new Uint8Array(
      readFileSync(candidateBoundary),
    )

    const historyValidationRoot = mkdtempSync(
      join(tmpdir(), "metafor-dissolve-candidate-history-"),
    )
    const historyCapture = (() => {
      try {
        const validationHistory = join(historyValidationRoot, "history")
        copyTree(rollbackHistory, validationHistory)
        const history = new DarkForceHistory(validationHistory)
        const status = history.status()
        const fromSequence = (options.previousSnapshotSequence ?? 0) + 1
        return {
          status,
          acceptedSequences: historySequences(
            history,
            fromSequence,
            status.sequence,
          ),
        }
      } finally {
        rmSync(historyValidationRoot, {recursive: true, force: true})
      }
    })()
    const historyStatus = historyCapture.status
    const acceptedSequences = historyCapture.acceptedSequences
    const control = readCheckpointControlState(rollbackControl)
    if (
      control.barrier.cutId !== historyStatus.cutId ||
      control.barrier.acceptanceSequence !== historyStatus.sequence
    ) {
      throw new Error("Stopped checkpoint control state does not match Dark Force history")
    }
    if (
      options.patches.length !== acceptedSequences.length ||
      options.patches.some((entry, index) =>
        entry.sequence !== acceptedSequences[index]
      )
    ) {
      throw new Error("Detached candidate patch span does not match stopped history")
    }

    fsyncTree(rollback)
    const rollbackFiles = regularFiles(rollback, "rollback")
    const repository = join(target, "checkpoint.git")
    if (options.previousSnapshotSequence !== null) {
      if (!options.previousCheckpointRepository) {
        throw new Error("Current-sequence candidate requires the previous checkpoint repository")
      }
      copyTree(options.previousCheckpointRepository, repository)
    } else if (options.previousCheckpointRepository) {
      throw new Error("Initial candidate checkpoint cannot copy a previous repository")
    }
    const checkpointInput: CurrentOfflineCheckpointPublication = {
      cutId: historyStatus.cutId,
      sequence: historyStatus.sequence,
      previousSnapshotSequence: options.previousSnapshotSequence,
      acceptedSequences,
      base: options.baseProjection,
      result: preGraph,
      boundary: preStageBoundaryBytes,
      mass: massCapture(rollbackMass),
      patches: [...options.patches],
      repository,
      capturedAt: options.capturedAt,
      trigger: "owner-bookmark",
      ...(options.limits ? {limits: options.limits} : {}),
    }
    const checkpoint = publishCurrentOfflineCheckpoint(checkpointInput)
    const rollbackManifest: DissolveCandidateRollbackManifestV1 = {
      schema: DISSOLVE_CANDIDATE_ROLLBACK_MANIFEST_V1,
      capturedAt: options.capturedAt,
      checkpoint: {
        cutId: checkpoint.manifest.identity.cutId,
        sequence: checkpoint.manifest.identity.sequence,
        commit: checkpoint.commit,
      },
      files: rollbackFiles,
      retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
    }
    const rollbackManifestSha256 = canonicalSha256(rollbackManifest)
    atomicDurableJSON(
      join(target, "rollback-manifest.json"),
      rollbackManifest,
    )
    const checkpointBinding: BoundaryDissolveCheckpointBindingV1 = {
      cutId: checkpoint.manifest.identity.cutId,
      sequence: checkpoint.manifest.identity.sequence,
      commit: checkpoint.commit,
      boundarySha256: checkpoint.manifest.boundary.blob.sha256,
      projectionSha256: checkpoint.manifest.projection.blob.sha256,
      massManifestSha256: canonicalSha256(checkpoint.manifest.mass),
    }

    candidateDatabase = await compactSQLite(candidateBoundary, candidateMass)
    const staging = await DetachedBoundaryDissolveCandidateStaging.open(
      candidateDatabase,
      {checkpoint: checkpointBinding, rollbackManifestSha256},
    )
    const stage = await staging.stage(options.proposal, {
      massEvidence: createIsolatedBoundaryDissolveMassEvidenceReader(
        candidateMass,
        options.validAbsent,
      ),
      readGraph: async (root, phase) =>
        await options.readGraph(candidateDatabase, root, phase),
    })
    const stagedProjection = await options.readGraph(
      candidateDatabase,
      options.proposal.request.source,
      "before",
    )
    if (
      canonicalizeGraph(stagedProjection).sha256 !==
        canonicalizeGraph(preGraph).sha256
    ) {
      throw new Error("Detached candidate stage changed the Boundary world projection")
    }
    await closeStandaloneSQLite(candidateDatabase, candidateBoundary)

    candidateDatabase = await compactSQLite(candidateBoundary, candidateMass)
    const reopened = await DetachedBoundaryDissolveCandidateStaging.open(
      candidateDatabase,
      {checkpoint: checkpointBinding, rollbackManifestSha256},
    )
    const reopenedReceipt = await reopened.stage(options.proposal, {
      massEvidence: createIsolatedBoundaryDissolveMassEvidenceReader(
        candidateMass,
        options.validAbsent,
      ),
      readGraph: async (root, phase) =>
        await options.readGraph(candidateDatabase, root, phase),
    })
    if (
      !reopenedReceipt ||
      JSON.stringify(reopenedReceipt) !== JSON.stringify(stage)
    ) {
      throw new Error("Detached candidate stage did not survive a verified reopen")
    }
    await closeStandaloneSQLite(candidateDatabase, candidateBoundary)
    fsyncTree(candidate)

    const candidateMassManifest = regularFiles(candidateMass, "candidate/mass")
    if (
      canonicalSha256(candidateMassManifest.map(({path, ...entry}) => ({
        ...entry,
        path: path.replace(/^candidate\/mass\//, ""),
      }))) !==
      canonicalSha256(
        rollbackFiles
          .filter(({path}) => path.startsWith("rollback/mass/"))
          .map(({path, ...entry}) => ({
            ...entry,
            path: path.replace(/^rollback\/mass\//, ""),
          })),
      )
    ) {
      throw new Error("Detached candidate staging changed Mass bytes")
    }

    const receiptBody = {
      schema: DISSOLVE_CANDIDATE_BUNDLE_RECEIPT_V1,
      capturedAt: options.capturedAt,
      root: options.root,
      checkpoint: checkpointBinding,
      rollbackManifestSha256,
      rollbackFiles: rollbackFiles.length,
      stage: {stageId: stage.stageId, receiptId: stage.receiptId},
      candidateBoundarySha256: sha256(
        new Uint8Array(readFileSync(candidateBoundary)),
      ),
      candidateMassManifestSha256: canonicalSha256(candidateMassManifest),
      retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
      effects: "none",
    } as const
    const receipt: DissolveCandidateBundleReceiptV1 = Object.freeze({
      bundleId: canonicalSha256(receiptBody),
      ...receiptBody,
    })
    atomicDurableJSON(join(target, "candidate-receipt.json"), receipt)
    return {
      directory: target,
      checkpointCommit: checkpoint.commit,
      rollbackManifest,
      rollbackManifestSha256,
      stage,
      receipt,
    }
  } catch (error) {
    writeFailureReceipt(target, error, options.capturedAt)
    throw error
  }
}
