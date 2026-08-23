import "../../../index"
import {dirname, resolve} from "node:path"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1,
  validateMetaDeclarationRequest,
  type MetaAuthoringCapability,
  type MetaAuthoringRequestDigest,
  type MetaDeclarationApplyReceipt,
  type MetaDeclarationAuthoringCauseV1,
  type MetaDeclarationSourceProjectionV1,
  type MetaForceAcceptanceIdentity,
  type MetaSourceRevision,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import type {MetaFieldDSL} from "@metafor/types/metafor/schema"
import type {ForceMessageInput} from "shared/protocol/force/message"
import type {SourcedParticle} from "shared/protocol/force/particle"
import {
  discardSourceCandidates,
  planMetaDeclarationPatch,
  prepareSourceCandidates,
  recoverAndPublishSourceCandidates,
  readSourceSnapshot,
  type DeclarationMetaSnapshot,
  type PreparedSourceCandidate,
} from "create-metafor/library"
import {loadMeta, resolveMetaPath} from "../load.ts"
import type {DarkForceHistoryParticle} from "../force/history.ts"
import type {ForceAuthoringDecision} from "../force/lifecycle.ts"
import {metaAuthoringRequestDigest} from "./authoring.ts"

export interface DeclarationAuthoringHistory {
  findAuthoring(rpcSource: string, operationId: string): DarkForceHistoryParticle | null
}

export interface DeclarationAuthoringForce {
  acceptAuthoringParticle(
    input: ForceMessageInput,
    authoring: MetaDeclarationAuthoringCauseV1,
  ): Promise<ForceAuthoringDecision>
}

export interface DeclarationAuthoringMeta extends DeclarationMetaSnapshot {
  revision: MetaSourceRevision
}

export type DeclarationAuthoringCapabilityReader = (
  rpcSource: string,
) => readonly MetaAuthoringCapability[]

export type DeclarationAuthoringMetaReader = (
  address: MetaAddress,
) => Promise<DeclarationAuthoringMeta>

export type DeclarationAuthoringSourcePath = (address: MetaAddress) => string

export interface DeclarationAuthoringProjection {
  apply(particle: SourcedParticle): void | Promise<void>
}

export class DeclarationAuthoringError extends Error {
  override readonly name = "DeclarationAuthoringError"
}

const requestedRevisions = (input: unknown): Map<MetaAddress, MetaSourceRevision> => {
  const result = new Map<MetaAddress, MetaSourceRevision>()
  if (!input || typeof input !== "object" || Array.isArray(input)) return result
  const revisions = (input as {revisions?: unknown}).revisions
  if (!Array.isArray(revisions)) return result
  for (const revision of revisions) {
    if (!revision || typeof revision !== "object" || Array.isArray(revision)) continue
    const rawAddress = (revision as {address?: unknown}).address
    const address = typeof rawAddress === "string" ? parseMetaAddress(rawAddress) : null
    const value = (revision as {revision?: unknown}).revision
    if (address && typeof value === "string") result.set(address, value as MetaSourceRevision)
  }
  return result
}

const validationError = (
  issues: readonly {path: string; code: string; message: string}[],
): DeclarationAuthoringError => new DeclarationAuthoringError(
  issues.map((issue) => `${issue.path || "/"} ${issue.code}: ${issue.message}`).join("; "),
)

const acceptanceIdentity = (entry: DarkForceHistoryParticle): MetaForceAcceptanceIdentity => {
  const separator = entry.id.lastIndexOf(":")
  if (separator <= 0 || entry.id.slice(separator + 1) !== String(entry.sequence)) {
    throw new DeclarationAuthoringError("Force history contains an invalid authoring acceptance identity")
  }
  return {cutId: entry.id.slice(0, separator), sequence: entry.sequence, id: entry.id}
}

const receiptBase = (
  operationId: string,
  requestDigest: MetaAuthoringRequestDigest,
  acceptance: MetaForceAcceptanceIdentity,
  sourceProjections: MetaDeclarationSourceProjectionV1[],
): Omit<Extract<MetaDeclarationApplyReceipt, {phase: "complete"}>, "phase" | "source" | "materialization"> => ({
  contractVersion: META_AUTHORING_CONTRACT_VERSION,
  operationId,
  requestDigest,
  acceptance,
  sourceProjections: structuredClone(sourceProjections),
  boundary: "applied",
})

const pendingReceipt = (
  operationId: string,
  requestDigest: MetaAuthoringRequestDigest,
  acceptance: MetaForceAcceptanceIdentity,
  sourceProjections: MetaDeclarationSourceProjectionV1[],
  error: unknown,
): MetaDeclarationApplyReceipt => ({
  ...receiptBase(operationId, requestDigest, acceptance, sourceProjections),
  phase: "source_pending",
  source: {
    outcome: "pending",
    error: error instanceof Error ? error.message : String(error),
  },
})

export const readDeclarationAuthoringMeta: DeclarationAuthoringMetaReader = async (address) => {
  const targetPath = resolveMetaPath(address)
  const before = await readSourceSnapshot(targetPath)
  const dsl = await loadMeta(address)
  const after = await readSourceSnapshot(targetPath)
  if (before.revision !== after.revision) {
    throw new DeclarationAuthoringError(`Source changed while reading ${address}`)
  }
  return {
    address,
    targetPath,
    source: after.source,
    revision: after.revision,
    name: dsl.name,
    ...(dsl.desc === undefined ? {} : {description: dsl.desc}),
    fields: structuredClone(dsl.fields as readonly MetaFieldDSL[]),
    states: structuredClone(dsl.superposition),
    mass: structuredClone(dsl.mass ?? []),
    processes: structuredClone(dsl.processes ?? []),
    reactions: structuredClone(dsl.reactions ?? []),
    ...(dsl.bulk === undefined ? {} : {bulk: structuredClone(dsl.bulk)}),
  }
}

export class DeclarationAuthoringService {
  constructor(
    private readonly history: DeclarationAuthoringHistory,
    private readonly force: DeclarationAuthoringForce,
    private readonly capabilities: DeclarationAuthoringCapabilityReader,
    private readonly readMeta: DeclarationAuthoringMetaReader = readDeclarationAuthoringMeta,
    private readonly sourcePath: DeclarationAuthoringSourcePath = resolveMetaPath,
    private readonly projection: DeclarationAuthoringProjection = {apply() {}},
  ) {}

  async apply(input: unknown, rpcSource: string): Promise<MetaDeclarationApplyReceipt> {
    const grants = this.capabilities(rpcSource)
    const revisions = requestedRevisions(input)
    const normalized = validateMetaDeclarationRequest(input, {
      capabilities: grants,
      currentRevision: (address) => revisions.get(address) ?? null,
    })
    if (!normalized.ok) throw validationError(normalized.issues)
    const request = normalized.value
    const requestDigest = metaAuthoringRequestDigest(request)
    const existing = this.history.findAuthoring(rpcSource, request.operationId)
    if (existing) {
      if (
        !existing.authoring ||
        existing.authoring.schema !== META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1 ||
        existing.authoring.requestDigest !== requestDigest
      ) {
        throw new DeclarationAuthoringError(
          `Operation ${rpcSource}/${request.operationId} is already bound to a different request`,
        )
      }
      return await this.#project(
        request.operationId,
        requestDigest,
        acceptanceIdentity(existing),
        existing.authoring.sourceProjections,
        existing.particle,
      )
    }

    const affected = request.operation === "move"
      ? [request.fromAddress, request.toAddress]
      : [request.address]
    const metas = await Promise.all(affected.map((address) => this.readMeta(address)))
    const current = new Map(metas.map((meta) => [meta.address, meta.revision] as const))
    const verified = validateMetaDeclarationRequest(input, {
      capabilities: grants,
      currentRevision: (address) => current.get(address) ?? null,
    })
    if (!verified.ok) throw validationError(verified.issues)

    const plan = planMetaDeclarationPatch(verified.value, metas)
    let prepared: PreparedSourceCandidate[] = []
    let liveAttempted = false
    try {
      prepared = await prepareSourceCandidates(plan.sourceEdits.map((edit) => ({
        targetPath: edit.targetPath,
        operationId: request.operationId,
        expectedRevision: edit.expectedRevision ?? current.get(edit.address)!,
        source: edit.afterSource,
      })))
      const editByPath = new Map(plan.sourceEdits.map((edit) => [edit.targetPath, edit] as const))
      const sourceProjections = prepared.map((candidate) => ({
        address: editByPath.get(candidate.targetPath)!.address,
        ...(editByPath.get(candidate.targetPath)!.relativePath === undefined
          ? {}
          : {path: editByPath.get(candidate.targetPath)!.relativePath}),
        beforeRevision: candidate.beforeRevision,
        afterRevision: candidate.afterRevision,
      })).sort((left, right) =>
        `${left.address}\u0000${left.path ?? "meta.ts"}`.localeCompare(`${right.address}\u0000${right.path ?? "meta.ts"}`)
      )
      const cause: MetaDeclarationAuthoringCauseV1 = {
        schema: META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1,
        contractVersion: META_AUTHORING_CONTRACT_VERSION,
        rpcSource,
        operationId: request.operationId,
        requestDigest,
        sourceProjections,
      }
      liveAttempted = true
      const decision = await this.force.acceptAuthoringParticle(plan.particle, cause)
      if (!decision.ok) throw new DeclarationAuthoringError(decision.error)
      return await this.#project(
        request.operationId,
        requestDigest,
        decision.acceptance,
        sourceProjections,
        decision.particle,
      )
    } catch (error) {
      if (!liveAttempted) await discardSourceCandidates(prepared)
      throw error
    }
  }

  async #project(
    operationId: string,
    requestDigest: MetaAuthoringRequestDigest,
    acceptance: MetaForceAcceptanceIdentity,
    sourceProjections: MetaDeclarationSourceProjectionV1[],
    particle: SourcedParticle,
  ): Promise<MetaDeclarationApplyReceipt> {
    try {
      await this.projection.apply(particle)
      const targetPath = (projection: MetaDeclarationSourceProjectionV1): string => {
        const metaPath = this.sourcePath(projection.address)
        return projection.path === undefined || projection.path === "meta.ts"
          ? metaPath
          : resolve(dirname(metaPath), projection.path)
      }
      const projectionByPath = new Map(sourceProjections.map((projection) => [
        targetPath(projection),
        projection,
      ] as const))
      const published = await recoverAndPublishSourceCandidates(
        operationId,
        sourceProjections.map((projection) => ({
          targetPath: targetPath(projection),
          beforeRevision: projection.beforeRevision,
          afterRevision: projection.afterRevision,
        })),
      )
      const files = published.files.map((file) => ({
        address: projectionByPath.get(file.targetPath)!.address,
        ...(projectionByPath.get(file.targetPath)!.path === undefined
          ? {}
          : {path: projectionByPath.get(file.targetPath)!.path}),
        beforeRevision: file.beforeRevision,
        afterRevision: file.afterRevision,
        outcome: file.outcome,
      })).sort((left, right) =>
        `${left.address}\u0000${left.path ?? "meta.ts"}`.localeCompare(`${right.address}\u0000${right.path ?? "meta.ts"}`)
      )
      return {
        ...receiptBase(operationId, requestDigest, acceptance, sourceProjections),
        phase: "complete",
        source: {
          outcome: files.some(({outcome}) => outcome === "published")
            ? "published"
            : "already_published",
          files,
        },
        materialization: {outcome: "applied"},
      }
    } catch (error) {
      return pendingReceipt(operationId, requestDigest, acceptance, sourceProjections, error)
    }
  }
}
