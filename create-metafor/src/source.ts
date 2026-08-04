import {createHash} from "node:crypto"
import {
  lstat,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises"
import {basename, dirname, resolve} from "node:path"
import type {MetaSourceRevision} from "@metafor/types/metafor/authoring"

export type SourceWriteErrorCode =
  | "invalid_target"
  | "target_missing"
  | "target_not_file"
  | "source_revision_mismatch"
  | "unchanged_source"
  | "candidate_conflict"
  | "duplicate_target"
  | "source_locked"
  | "source_publish_failed"
  | "source_verification_failed"
  | "source_rollback_failed"

export class SourceWriteError extends Error {
  override readonly name = "SourceWriteError"

  constructor(
    readonly code: SourceWriteErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export interface PrepareSourceCandidateOptions {
  targetPath: string
  operationId: string
  expectedRevision: MetaSourceRevision
  source: string
}

export interface PreparedSourceCandidate {
  readonly targetPath: string
  readonly candidatePath: string
  readonly operationId: string
  readonly beforeRevision: MetaSourceRevision
  readonly afterRevision: MetaSourceRevision
  readonly beforeSource: string
  readonly afterSource: string
  readonly mode: number
}

export interface SourcePublishReceipt {
  readonly operationId: string
  readonly files: Array<{
    targetPath: string
    beforeRevision: MetaSourceRevision
    afterRevision: MetaSourceRevision
    outcome: "published" | "already_published"
  }>
}

const SAFE_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export const sourceRevision = (source: string | Uint8Array): MetaSourceRevision =>
  `sha256:${createHash("sha256").update(source).digest("hex")}` as MetaSourceRevision

const exactTarget = (targetPath: string): string => {
  const target = resolve(targetPath)
  if (basename(target) !== "meta.ts") {
    throw new SourceWriteError("invalid_target", `Source target must be the exact meta.ts file: ${target}`)
  }
  return target
}

const targetSource = async (
  targetPath: string,
): Promise<{source: string; revision: MetaSourceRevision; mode: number}> => {
  let targetStat
  try {
    targetStat = await lstat(targetPath)
  } catch (error) {
    throw new SourceWriteError("target_missing", `Source target does not exist: ${targetPath}`, {cause: error})
  }
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
    throw new SourceWriteError("target_not_file", `Source target must be a regular file: ${targetPath}`)
  }
  const bytes = await readFile(targetPath)
  return {
    source: bytes.toString("utf8"),
    revision: sourceRevision(bytes),
    mode: targetStat.mode & 0o777,
  }
}

export const readSourceRevision = async (targetPath: string): Promise<MetaSourceRevision> =>
  (await targetSource(exactTarget(targetPath))).revision

const writeExclusiveFile = async (
  path: string,
  source: string,
  mode: number,
): Promise<void> => {
  const handle = await open(path, "wx", mode)
  try {
    await handle.writeFile(source, "utf8")
    await handle.sync()
  } finally {
    await handle.close()
  }
}

const prepareExclusiveFile = async (
  path: string,
  source: string,
  mode: number,
  conflictMessage: string,
): Promise<void> => {
  try {
    await writeExclusiveFile(path, source, mode)
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as {code?: unknown}).code
      : null
    if (code !== "EEXIST") throw error
    const existing = await readFile(path, "utf8")
    if (existing !== source) {
      throw new SourceWriteError("candidate_conflict", conflictMessage, {cause: error})
    }
  }
}

export const prepareSourceCandidate = async (
  options: PrepareSourceCandidateOptions,
): Promise<PreparedSourceCandidate> => {
  const targetPath = exactTarget(options.targetPath)
  if (!SAFE_OPERATION_ID.test(options.operationId)) {
    throw new SourceWriteError("candidate_conflict", "Source candidate operationId is invalid")
  }
  const before = await targetSource(targetPath)
  if (before.revision !== options.expectedRevision) {
    throw new SourceWriteError(
      "source_revision_mismatch",
      `Source revision mismatch for ${targetPath}: expected ${options.expectedRevision}, received ${before.revision}`,
    )
  }
  const afterRevision = sourceRevision(options.source)
  if (afterRevision === before.revision) {
    throw new SourceWriteError("unchanged_source", `Source candidate does not change ${targetPath}`)
  }
  const candidatePath = resolve(dirname(targetPath), `.${basename(targetPath)}.${options.operationId}.candidate`)
  await prepareExclusiveFile(
    candidatePath,
    options.source,
    before.mode,
    `Prepared source candidate conflicts with operation ${options.operationId}: ${targetPath}`,
  )
  const prepared = await readFile(candidatePath)
  if (sourceRevision(prepared) !== afterRevision) {
    await unlink(candidatePath).catch(() => {})
    throw new SourceWriteError("source_verification_failed", `Prepared source candidate verification failed: ${targetPath}`)
  }
  return {
    targetPath,
    candidatePath,
    operationId: options.operationId,
    beforeRevision: before.revision,
    afterRevision,
    beforeSource: before.source,
    afterSource: options.source,
    mode: before.mode,
  }
}

export const prepareSourceCandidates = async (
  options: readonly PrepareSourceCandidateOptions[],
): Promise<PreparedSourceCandidate[]> => {
  if (options.length === 0) {
    throw new SourceWriteError("candidate_conflict", "Source preparation requires at least one candidate")
  }
  const operationId = options[0]!.operationId
  if (options.some((candidate) => candidate.operationId !== operationId)) {
    throw new SourceWriteError("candidate_conflict", "Source batch must belong to one operationId")
  }
  const targets = options.map(({targetPath}) => exactTarget(targetPath))
  if (new Set(targets).size !== targets.length) {
    throw new SourceWriteError("duplicate_target", "Source preparation contains duplicate targets")
  }
  const prepared: PreparedSourceCandidate[] = []
  try {
    for (const option of options) prepared.push(await prepareSourceCandidate(option))
    return prepared
  } catch (error) {
    await discardSourceCandidates(prepared)
    throw error
  }
}

export const discardSourceCandidates = async (
  candidates: readonly PreparedSourceCandidate[],
): Promise<void> => {
  await Promise.all(candidates.map(({candidatePath}) => unlink(candidatePath).catch(() => {})))
}

type HeldLock = {
  path: string
  handle: Awaited<ReturnType<typeof open>>
}

const acquireLocks = async (
  candidates: readonly PreparedSourceCandidate[],
): Promise<HeldLock[]> => {
  const locks: HeldLock[] = []
  try {
    for (const candidate of [...candidates].sort((left, right) => left.targetPath.localeCompare(right.targetPath))) {
      const path = resolve(dirname(candidate.targetPath), `.${basename(candidate.targetPath)}.metafor.lock`)
      let handle
      try {
        handle = await open(path, "wx", 0o600)
      } catch (error) {
        throw new SourceWriteError("source_locked", `Source target is locked: ${candidate.targetPath}`, {cause: error})
      }
      locks.push({path, handle})
      await handle.writeFile(candidate.operationId, "utf8")
      await handle.sync()
    }
    return locks
  } catch (error) {
    await releaseLocks(locks)
    throw error
  }
}

const releaseLocks = async (locks: readonly HeldLock[]): Promise<void> => {
  for (const lock of [...locks].reverse()) {
    await lock.handle.close().catch(() => {})
    await unlink(lock.path).catch(() => {})
  }
}

const rollbackPath = (candidate: PreparedSourceCandidate): string =>
  resolve(dirname(candidate.targetPath), `.${basename(candidate.targetPath)}.${candidate.operationId}.rollback`)

const rollbackPublished = async (
  published: readonly PreparedSourceCandidate[],
  rollbackPaths: ReadonlyMap<string, string>,
): Promise<void> => {
  try {
    for (const candidate of [...published].reverse()) {
      const rollback = rollbackPaths.get(candidate.targetPath)
      if (!rollback) throw new Error(`Missing rollback source for ${candidate.targetPath}`)
      await rename(rollback, candidate.targetPath)
    }
    for (const candidate of published) {
      const restored = await targetSource(candidate.targetPath)
      if (restored.revision !== candidate.beforeRevision) {
        throw new Error(`Rollback verification failed for ${candidate.targetPath}`)
      }
    }
  } catch (error) {
    throw new SourceWriteError("source_rollback_failed", "Source batch rollback failed", {cause: error})
  }
}

const restorePreparedCandidates = async (
  candidates: readonly PreparedSourceCandidate[],
): Promise<void> => {
  for (const candidate of candidates) {
    await prepareExclusiveFile(
      candidate.candidatePath,
      candidate.afterSource,
      candidate.mode,
      `Prepared source candidate cannot be restored: ${candidate.targetPath}`,
    )
  }
}

export const publishSourceCandidates = async (
  candidates: readonly PreparedSourceCandidate[],
): Promise<SourcePublishReceipt> => {
  if (candidates.length === 0) {
    throw new SourceWriteError("candidate_conflict", "Source publish requires at least one candidate")
  }
  const operationId = candidates[0]!.operationId
  if (candidates.some((candidate) => candidate.operationId !== operationId)) {
    throw new SourceWriteError("candidate_conflict", "Source batch must belong to one operationId")
  }
  const targets = new Set<string>()
  for (const candidate of candidates) {
    const targetPath = exactTarget(candidate.targetPath)
    if (targetPath !== candidate.targetPath || targets.has(targetPath)) {
      throw new SourceWriteError("duplicate_target", `Source batch contains duplicate or non-exact target: ${targetPath}`)
    }
    targets.add(targetPath)
  }

  const locks = await acquireLocks(candidates)
  const toPublish: PreparedSourceCandidate[] = []
  const outcomes = new Map<string, "published" | "already_published">()
  const rollbackPaths = new Map<string, string>()
  const published: PreparedSourceCandidate[] = []
  try {
    for (const candidate of candidates) {
      const current = await targetSource(candidate.targetPath)
      if (current.revision === candidate.afterRevision) {
        outcomes.set(candidate.targetPath, "already_published")
        continue
      }
      if (current.revision !== candidate.beforeRevision) {
        throw new SourceWriteError(
          "source_revision_mismatch",
          `Source changed after candidate preparation: ${candidate.targetPath}`,
        )
      }
      const prepared = await readFile(candidate.candidatePath)
      if (sourceRevision(prepared) !== candidate.afterRevision) {
        throw new SourceWriteError("source_verification_failed", `Prepared candidate changed: ${candidate.targetPath}`)
      }
      toPublish.push(candidate)
    }

    for (const candidate of toPublish) {
      const rollback = rollbackPath(candidate)
      await prepareExclusiveFile(
        rollback,
        candidate.beforeSource,
        candidate.mode,
        `Rollback source conflicts with operation ${operationId}: ${candidate.targetPath}`,
      )
      rollbackPaths.set(candidate.targetPath, rollback)
    }

    try {
      for (const candidate of toPublish) {
        await rename(candidate.candidatePath, candidate.targetPath)
        published.push(candidate)
        outcomes.set(candidate.targetPath, "published")
      }
      for (const candidate of candidates) {
        const written = await targetSource(candidate.targetPath)
        if (written.revision !== candidate.afterRevision) {
          throw new SourceWriteError("source_verification_failed", `Published source verification failed: ${candidate.targetPath}`)
        }
      }
    } catch (error) {
      await rollbackPublished(published, rollbackPaths)
      await restorePreparedCandidates(published)
      await Promise.all([...rollbackPaths.values()].map((path) => unlink(path).catch(() => {})))
      if (error instanceof SourceWriteError) throw error
      throw new SourceWriteError("source_publish_failed", "Source batch publication failed", {cause: error})
    }

    await Promise.all([
      ...candidates.map(({candidatePath}) => unlink(candidatePath).catch(() => {})),
      ...[...rollbackPaths.values()].map((path) => unlink(path).catch(() => {})),
    ])
    return {
      operationId,
      files: [...candidates]
        .sort((left, right) => left.targetPath.localeCompare(right.targetPath))
        .map((candidate) => ({
          targetPath: candidate.targetPath,
          beforeRevision: candidate.beforeRevision,
          afterRevision: candidate.afterRevision,
          outcome: outcomes.get(candidate.targetPath)!,
        })),
    }
  } finally {
    await releaseLocks(locks)
  }
}
