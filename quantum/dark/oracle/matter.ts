import {
  META_AUTHORING_CONTRACT_VERSION,
  META_MATTER_AUTHORING_CAUSE_SCHEMA_V1,
  validateMetaMatterRequest,
  type MetaAuthoringCapability,
  type MetaAuthoringRequestDigest,
  type MetaForceAcceptanceIdentity,
  type MetaMatterApplyReceipt,
  type MetaMatterAuthoringCauseV1,
  type MetaMatterSourceProjectionV1,
  type MetaSourceRevision,
} from "shared/protocol/metafor/authoring"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import type {ForceMessageInput} from "shared/protocol/force/message"
import type {MatterFields, MatterParticle} from "@metafor/types/metafor/matter"
import type {SourcedParticle} from "shared/protocol/force/particle"
import type {AuthoredMatterProjectionChange} from "../dark.ts"
import {
  discardSourceCandidates,
  planMetaMatterPatch,
  prepareSourceCandidates,
  recoverAndPublishSourceCandidates,
  readSourceSnapshot,
  type MatterParentSnapshot,
  type PreparedSourceCandidate,
} from "create-metafor/library"
import {loadMeta, resolveMetaPath} from "../load.ts"
import type {DarkForceHistoryParticle} from "../force/history.ts"
import type {ForceAuthoringDecision} from "../force/lifecycle.ts"
import {metaAuthoringRequestDigest} from "./authoring.ts"

export {metaAuthoringRequestDigest} from "./authoring.ts"

export interface MatterAuthoringHistory {
  findAuthoring(rpcSource: string, operationId: string): DarkForceHistoryParticle | null
}

export interface MatterAuthoringForce {
  acceptAuthoringParticle(
    input: ForceMessageInput,
    authoring: MetaMatterAuthoringCauseV1,
  ): Promise<ForceAuthoringDecision>
}

export interface MatterAuthoringParent extends MatterParentSnapshot {
  revision: MetaSourceRevision
}

export type MatterAuthoringCapabilityReader = (
  rpcSource: string,
) => readonly MetaAuthoringCapability[]

export type MatterAuthoringParentReader = (
  address: MetaAddress,
) => Promise<MatterAuthoringParent>

export type MatterAuthoringSourcePath = (address: MetaAddress) => string

export interface MatterAuthoringProjection {
  apply(particle: SourcedParticle): AuthoredMatterProjectionChange | null | Promise<AuthoredMatterProjectionChange | null>
  reconcile(change: AuthoredMatterProjectionChange): Promise<void>
}

export class MatterAuthoringError extends Error {
  override readonly name = "MatterAuthoringError"
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

const validationError = (issues: readonly {path: string; code: string; message: string}[]): MatterAuthoringError =>
  new MatterAuthoringError(issues.map((issue) => `${issue.path || "/"} ${issue.code}: ${issue.message}`).join("; "))

const acceptanceIdentity = (entry: DarkForceHistoryParticle): MetaForceAcceptanceIdentity => {
  const separator = entry.id.lastIndexOf(":")
  if (separator <= 0 || entry.id.slice(separator + 1) !== String(entry.sequence)) {
    throw new MatterAuthoringError("Force history contains an invalid authoring acceptance identity")
  }
  return {cutId: entry.id.slice(0, separator), sequence: entry.sequence, id: entry.id}
}

const receiptBase = (
  operationId: string,
  requestDigest: MetaAuthoringRequestDigest,
  acceptance: MetaForceAcceptanceIdentity,
  sourceProjections: MetaMatterSourceProjectionV1[],
): Omit<Extract<MetaMatterApplyReceipt, {phase: "complete"}>, "phase" | "source" | "materialization"> => ({
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
  sourceProjections: MetaMatterSourceProjectionV1[],
  error: unknown,
): MetaMatterApplyReceipt => ({
  ...receiptBase(operationId, requestDigest, acceptance, sourceProjections),
  phase: "source_pending",
  source: {
    outcome: "pending",
    error: error instanceof Error ? error.message : String(error),
  },
})

export const readMatterAuthoringParent: MatterAuthoringParentReader = async (address) => {
  const targetPath = resolveMetaPath(address)
  const before = await readSourceSnapshot(targetPath)
  const dsl = await loadMeta(address)
  const after = await readSourceSnapshot(targetPath)
  if (before.revision !== after.revision) {
    throw new MatterAuthoringError(`Source changed while reading ${address}`)
  }
  return {
    address,
    targetPath,
    source: after.source,
    revision: after.revision,
    matter: structuredClone((dsl.matter ?? []) as readonly MatterParticle[]),
    fields: Object.fromEntries((dsl.fields ?? []).map((field) => [
      field.key,
      {
        type: field.type,
        ...(field.type === "enum" && field.values ? {values: [...field.values]} : {}),
      },
    ])) as MatterFields,
  }
}

export class MatterAuthoringService {
  constructor(
    private readonly history: MatterAuthoringHistory,
    private readonly force: MatterAuthoringForce,
    private readonly capabilities: MatterAuthoringCapabilityReader,
    private readonly readParent: MatterAuthoringParentReader = readMatterAuthoringParent,
    private readonly sourcePath: MatterAuthoringSourcePath = resolveMetaPath,
    private readonly projection: MatterAuthoringProjection = {
      apply: () => null,
      async reconcile() {},
    },
  ) {}

  async apply(input: unknown, rpcSource: string): Promise<MetaMatterApplyReceipt> {
    const grants = this.capabilities(rpcSource)
    const revisions = requestedRevisions(input)
    const normalized = validateMetaMatterRequest(input, {
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
        existing.authoring.schema !== META_MATTER_AUTHORING_CAUSE_SCHEMA_V1 ||
        existing.authoring.requestDigest !== requestDigest
      ) {
        throw new MatterAuthoringError(
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

    const affected = request.operation === "add"
      ? [request.to.address]
      : request.operation === "remove"
        ? [request.target.address]
        : [...new Set([request.from.address, request.to.address])]
    const parents = await Promise.all(affected.map((address) => this.readParent(address)))
    const current = new Map(parents.map((parent) => [parent.address, parent.revision] as const))
    const verified = validateMetaMatterRequest(input, {
      capabilities: grants,
      currentRevision: (address) => current.get(address) ?? null,
    })
    if (!verified.ok) throw validationError(verified.issues)

    const plan = planMetaMatterPatch(verified.value, parents)
    let prepared: PreparedSourceCandidate[] = []
    let liveAttempted = false
    try {
      prepared = await prepareSourceCandidates(plan.sourceEdits.map((edit) => ({
        targetPath: edit.targetPath,
        operationId: request.operationId,
        expectedRevision: current.get(edit.address)!,
        source: edit.afterSource,
      })))
      const addressByPath = new Map(plan.sourceEdits.map((edit) => [edit.targetPath, edit.address] as const))
      const sourceProjections = prepared.map((candidate): MetaMatterSourceProjectionV1 => {
        if (candidate.beforeRevision === "absent") {
          throw new MatterAuthoringError(`Matter source target is unexpectedly absent: ${candidate.targetPath}`)
        }
        return {
          address: addressByPath.get(candidate.targetPath)!,
          beforeRevision: candidate.beforeRevision,
          afterRevision: candidate.afterRevision,
        }
      }).sort((left, right) => left.address.localeCompare(right.address))
      const cause: MetaMatterAuthoringCauseV1 = {
        schema: META_MATTER_AUTHORING_CAUSE_SCHEMA_V1,
        contractVersion: META_AUTHORING_CONTRACT_VERSION,
        rpcSource,
        operationId: request.operationId,
        requestDigest,
        sourceProjections,
      }
      liveAttempted = true
      const decision = await this.force.acceptAuthoringParticle(plan.particle, cause)
      if (!decision.ok) throw new MatterAuthoringError(decision.error)
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
    sourceProjections: MetaMatterSourceProjectionV1[],
    particle: SourcedParticle,
  ): Promise<MetaMatterApplyReceipt> {
    let change: AuthoredMatterProjectionChange | null
    try {
      change = await this.projection.apply(particle)
    } catch (error) {
      return pendingReceipt(operationId, requestDigest, acceptance, sourceProjections, error)
    }
    try {
      const projectionByPath = new Map(sourceProjections.map((projection) => [
        this.sourcePath(projection.address),
        projection,
      ] as const))
      const published = await recoverAndPublishSourceCandidates(
        operationId,
        sourceProjections.map((projection) => ({
          targetPath: this.sourcePath(projection.address),
          beforeRevision: projection.beforeRevision,
          afterRevision: projection.afterRevision,
        })),
      )
      const files = published.files.map((file) => ({
        address: projectionByPath.get(file.targetPath)!.address,
        beforeRevision: projectionByPath.get(file.targetPath)!.beforeRevision,
        afterRevision: file.afterRevision,
        outcome: file.outcome,
      })).sort((left, right) => left.address.localeCompare(right.address))
      const source = {
        outcome: files.some(({outcome}) => outcome === "published")
          ? "published" as const
          : "already_published" as const,
        files,
      }
      if (change !== null) {
        try {
          await this.projection.reconcile(change)
        } catch (error) {
          return {
            ...receiptBase(operationId, requestDigest, acceptance, sourceProjections),
            phase: "runtime_committed",
            source,
            materialization: {
              outcome: "pending",
              error: error instanceof Error ? error.message : String(error),
            },
          }
        }
      }
      return {
        ...receiptBase(operationId, requestDigest, acceptance, sourceProjections),
        phase: "complete",
        source,
        materialization: {outcome: "applied"},
      }
    } catch (error) {
      return pendingReceipt(operationId, requestDigest, acceptance, sourceProjections, error)
    }
  }
}
