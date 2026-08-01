import {createHash} from "node:crypto"
import {
  parseMetaAddress,
  validateGraph,
  type MetaAddress,
} from "@metafor/types/metafor/graph"
import {
  planBoundaryDissolve,
  type BoundaryDissolvePlan,
} from "./dissolve.ts"
import {
  normalizeBoundaryDissolveProposalV1,
  type BoundaryDissolveProposalV1,
  type BoundaryDissolveStagingHooks,
} from "./dissolve-staging.ts"
import type {BoundaryDatabase} from "./sqlite.ts"

export const BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1 =
  "metafor/boundary-dissolve-candidate-stage/v1" as const

export const BOUNDARY_DISSOLVE_CANDIDATE_RETENTION =
  "retain-until-explicit-gc" as const

export type BoundaryDissolveCheckpointBindingV1 = Readonly<{
  cutId: string
  sequence: number
  commit: string
  boundarySha256: string
  projectionSha256: string
  massManifestSha256: string
}>

export type BoundaryDissolveCandidateBindingV1 = Readonly<{
  checkpoint: BoundaryDissolveCheckpointBindingV1
  rollbackManifestSha256: string
}>

export type BoundaryDissolveCandidateStageReceiptV1 = Readonly<{
  schema: typeof BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1
  receiptId: string
  stageId: string
  proposalId: string
  operation: "dissolve"
  status: "staged"
  source: MetaAddress
  target: MetaAddress
  sourceAtom: number
  targetAtom: number
  fenceCount: 5
  proposalSha256: string
  planSha256: string
  structuralSha256: string
  privateManifestSha256: string
  graphSha256: string
  checkpoint: BoundaryDissolveCheckpointBindingV1
  rollbackManifestSha256: string
  retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
  effects: "none"
}>

export type BoundaryDissolveCandidateExactPlanV1 = Readonly<{
  proposal: BoundaryDissolveProposalV1
  plan: BoundaryDissolvePlan
  receipt: BoundaryDissolveCandidateStageReceiptV1
}>

export type BoundaryDissolveCandidateStageErrorCode =
  | "invalid_binding"
  | "proposal_conflict"
  | "pre_state_conflict"
  | "graph_invalid"
  | "stage_corrupt"

export class BoundaryDissolveCandidateStageError extends Error {
  override readonly name = "BoundaryDissolveCandidateStageError"

  constructor(
    readonly code: BoundaryDissolveCandidateStageErrorCode,
    message: string,
  ) {
    super(message)
  }
}

type StageRow = {
  proposalId: string
  proposalSha256: string
  proposalJson: string
  planJson: string
  receiptJson: string
}

const digestPattern = /^[0-9a-f]{64}$/
const commitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/
const cutPattern = /^[A-Za-z0-9._-]+$/

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value).toSorted()
  const sorted = expected.toSorted()
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index])
}

const validDigest = (value: unknown): value is string =>
  typeof value === "string" && digestPattern.test(value)

const normalizeCheckpoint = (
  value: unknown,
): BoundaryDissolveCheckpointBindingV1 => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "cutId",
      "sequence",
      "commit",
      "boundarySha256",
      "projectionSha256",
      "massManifestSha256",
    ]) ||
    typeof value.cutId !== "string" ||
    !cutPattern.test(value.cutId) ||
    !Number.isSafeInteger(value.sequence) ||
    Number(value.sequence) <= 0 ||
    typeof value.commit !== "string" ||
    !commitPattern.test(value.commit) ||
    !validDigest(value.boundarySha256) ||
    !validDigest(value.projectionSha256) ||
    !validDigest(value.massManifestSha256)
  ) {
    throw new BoundaryDissolveCandidateStageError(
      "invalid_binding",
      "Detached dissolve candidate checkpoint binding is invalid",
    )
  }
  return Object.freeze({
    cutId: value.cutId,
    sequence: Number(value.sequence),
    commit: value.commit,
    boundarySha256: value.boundarySha256,
    projectionSha256: value.projectionSha256,
    massManifestSha256: value.massManifestSha256,
  })
}

const normalizeBinding = (
  value: unknown,
): BoundaryDissolveCandidateBindingV1 => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["checkpoint", "rollbackManifestSha256"]) ||
    !validDigest(value.rollbackManifestSha256)
  ) {
    throw new BoundaryDissolveCandidateStageError(
      "invalid_binding",
      "Detached dissolve candidate binding is invalid",
    )
  }
  return Object.freeze({
    checkpoint: normalizeCheckpoint(value.checkpoint),
    rollbackManifestSha256: value.rollbackManifestSha256,
  })
}

const planSha256 = (plan: BoundaryDissolvePlan): string =>
  sha256(JSON.stringify(plan))

const validateCandidateMassEvidence = (
  plan: BoundaryDissolvePlan,
): void => {
  const entries = plan.privateManifest.entries
  const absent = entries.filter(({evidence}) => evidence.kind === "absent")
  const present = entries.filter(({evidence}) => evidence.kind === "present")
  if (
    entries.length !== 5 ||
    present.length !== 4 ||
    absent.length !== 1 ||
    absent[0]?.sourceAuthoredKey !== "chatOutbox" ||
    absent[0]?.targetAuthoredKey !== "chatOutbox"
  ) {
    throw new BoundaryDissolveCandidateStageError(
      "pre_state_conflict",
      "Detached dissolve candidate requires four present Mass entries and explicit absent chatOutbox",
    )
  }
}

const parseReceipt = (
  json: string,
  expectedProposalSha256?: string,
): BoundaryDissolveCandidateStageReceiptV1 => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json) as unknown
  } catch (error) {
    throw new BoundaryDissolveCandidateStageError(
      "stage_corrupt",
      "Detached dissolve candidate receipt is not JSON",
    )
  }
  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, [
      "schema",
      "receiptId",
      "stageId",
      "proposalId",
      "operation",
      "status",
      "source",
      "target",
      "sourceAtom",
      "targetAtom",
      "fenceCount",
      "proposalSha256",
      "planSha256",
      "structuralSha256",
      "privateManifestSha256",
      "graphSha256",
      "checkpoint",
      "rollbackManifestSha256",
      "retention",
      "effects",
    ]) ||
    parsed.schema !== BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1 ||
    parsed.operation !== "dissolve" ||
    parsed.status !== "staged" ||
    parsed.fenceCount !== 5 ||
    parsed.retention !== BOUNDARY_DISSOLVE_CANDIDATE_RETENTION ||
    parsed.effects !== "none" ||
    typeof parsed.receiptId !== "string" ||
    typeof parsed.stageId !== "string" ||
    !validDigest(parsed.proposalSha256) ||
    !validDigest(parsed.planSha256) ||
    !validDigest(parsed.structuralSha256) ||
    !validDigest(parsed.privateManifestSha256) ||
    !validDigest(parsed.graphSha256) ||
    !validDigest(parsed.rollbackManifestSha256) ||
    typeof parsed.proposalId !== "string" ||
    parsed.proposalId.length === 0 ||
    typeof parsed.source !== "string" ||
    parseMetaAddress(parsed.source) !== parsed.source ||
    typeof parsed.target !== "string" ||
    parseMetaAddress(parsed.target) !== parsed.target ||
    parsed.source === parsed.target ||
    !Number.isSafeInteger(parsed.sourceAtom) ||
    Number(parsed.sourceAtom) <= 0 ||
    !Number.isSafeInteger(parsed.targetAtom) ||
    Number(parsed.targetAtom) <= 0
  ) {
    throw new BoundaryDissolveCandidateStageError(
      "stage_corrupt",
      "Detached dissolve candidate receipt is invalid",
    )
  }
  const checkpoint = normalizeCheckpoint(parsed.checkpoint)
  const {receiptId, ...body} = parsed
  if (
    receiptId !== sha256(JSON.stringify(body)) ||
    parsed.stageId !== sha256(
      `${checkpoint.commit}:${parsed.proposalSha256}:${parsed.planSha256}`,
    ) ||
    (
      expectedProposalSha256 !== undefined &&
      parsed.proposalSha256 !== expectedProposalSha256
    )
  ) {
    throw new BoundaryDissolveCandidateStageError(
      "stage_corrupt",
      "Detached dissolve candidate receipt digest is invalid",
    )
  }
  return Object.freeze({
    ...(parsed as BoundaryDissolveCandidateStageReceiptV1),
    checkpoint,
  })
}

const receiptFromRow = (
  row: StageRow,
): BoundaryDissolveCandidateStageReceiptV1 => {
  if (sha256(row.proposalJson) !== row.proposalSha256) {
    throw new BoundaryDissolveCandidateStageError(
      "stage_corrupt",
      "Detached dissolve candidate proposal digest is invalid",
    )
  }
  let proposal: ReturnType<typeof normalizeBoundaryDissolveProposalV1>
  let plan: unknown
  try {
    proposal = normalizeBoundaryDissolveProposalV1(
      JSON.parse(row.proposalJson) as unknown,
    )
    plan = JSON.parse(row.planJson) as unknown
  } catch {
    throw new BoundaryDissolveCandidateStageError(
      "stage_corrupt",
      "Detached dissolve candidate proposal or plan is invalid",
    )
  }
  if (
    JSON.stringify(proposal) !== row.proposalJson ||
    proposal.proposalId !== row.proposalId ||
    !isRecord(plan)
  ) {
    throw new BoundaryDissolveCandidateStageError(
      "stage_corrupt",
      "Detached dissolve candidate proposal or plan is not canonical",
    )
  }
  const receipt = parseReceipt(row.receiptJson, row.proposalSha256)
  if (
    receipt.proposalId !== row.proposalId ||
    receipt.source !== proposal.request.source ||
    receipt.target !== proposal.request.target ||
    sha256(row.planJson) !== receipt.planSha256
  ) {
    throw new BoundaryDissolveCandidateStageError(
      "stage_corrupt",
      "Detached dissolve candidate plan digest is invalid",
    )
  }
  return receipt
}

/**
 * Durable stage owned by one detached candidate Boundary SQLite.
 *
 * The caller must already have copied and verified the stopped checkpoint.
 * This class never opens a filesystem path, owns no Mass/history reader and
 * exposes no Boundary/Monad/Force runtime method.
 */
export class DetachedBoundaryDissolveCandidateStaging {
  readonly #boundary: BoundaryDatabase
  readonly #binding: BoundaryDissolveCandidateBindingV1
  #queue: Promise<void> = Promise.resolve()

  private constructor(
    boundary: BoundaryDatabase,
    binding: BoundaryDissolveCandidateBindingV1,
  ) {
    this.#boundary = boundary
    this.#binding = binding
  }

  static async open(
    boundary: BoundaryDatabase,
    binding: BoundaryDissolveCandidateBindingV1,
  ): Promise<DetachedBoundaryDissolveCandidateStaging> {
    const normalized = normalizeBinding(binding)
    await boundary.projection.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS boundary_dissolve_candidate_stage (
        proposal_id TEXT PRIMARY KEY,
        proposal_sha256 TEXT NOT NULL,
        proposal_json TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        receipt_json TEXT NOT NULL
      ) STRICT;
    `)
    const columns = await boundary.projection.sql<Array<{
      name: string
      type: string
      notnull: number
      pk: number
    }>>`PRAGMA table_info(boundary_dissolve_candidate_stage)`
    const expected = [
      {name: "proposal_id", type: "TEXT", notnull: 1, pk: 1},
      {name: "proposal_sha256", type: "TEXT", notnull: 1, pk: 0},
      {name: "proposal_json", type: "TEXT", notnull: 1, pk: 0},
      {name: "plan_json", type: "TEXT", notnull: 1, pk: 0},
      {name: "receipt_json", type: "TEXT", notnull: 1, pk: 0},
    ]
    const normalizedColumns = columns.map(({name, type, notnull, pk}) => ({
      name,
      type,
      notnull,
      pk,
    }))
    if (JSON.stringify(normalizedColumns) !== JSON.stringify(expected)) {
      throw new BoundaryDissolveCandidateStageError(
        "stage_corrupt",
        "Detached dissolve candidate stage table is invalid",
      )
    }
    const stage = new DetachedBoundaryDissolveCandidateStaging(
      boundary,
      normalized,
    )
    for (const row of await stage.#rows()) {
      const receipt = receiptFromRow(row)
      if (
        JSON.stringify(receipt.checkpoint) !==
          JSON.stringify(normalized.checkpoint) ||
        receipt.rollbackManifestSha256 !== normalized.rollbackManifestSha256
      ) {
        throw new BoundaryDissolveCandidateStageError(
          "stage_corrupt",
          "Detached dissolve candidate stage binding does not match its bundle",
        )
      }
    }
    return stage
  }

  async stage(
    input: unknown,
    hooks: BoundaryDissolveStagingHooks,
  ): Promise<BoundaryDissolveCandidateStageReceiptV1> {
    return await this.#serialize(async () => {
      const proposal = normalizeBoundaryDissolveProposalV1(input)
      const proposalJson = JSON.stringify(proposal)
      const proposalDigest = sha256(proposalJson)
      let transaction = false
      try {
        await this.#boundary.projection.sql.unsafe("BEGIN IMMEDIATE")
        transaction = true
        const existing = await this.#row(proposal.proposalId)
        if (existing) {
          if (
            existing.proposalSha256 !== proposalDigest ||
            existing.proposalJson !== proposalJson
          ) {
            throw new BoundaryDissolveCandidateStageError(
              "proposal_conflict",
              `Detached dissolve proposal ${proposal.proposalId} already has different content`,
            )
          }
          const receipt = receiptFromRow(existing)
          if (
            JSON.stringify(receipt.checkpoint) !==
              JSON.stringify(this.#binding.checkpoint) ||
            receipt.rollbackManifestSha256 !==
              this.#binding.rollbackManifestSha256
          ) {
            throw new BoundaryDissolveCandidateStageError(
              "proposal_conflict",
              "Detached dissolve proposal is bound to a different checkpoint",
            )
          }
          const currentPlan = await planBoundaryDissolve(
            this.#boundary,
            proposal.request,
            hooks.massEvidence,
          )
          validateCandidateMassEvidence(currentPlan)
          if (planSha256(currentPlan) !== receipt.planSha256) {
            throw new BoundaryDissolveCandidateStageError(
              "pre_state_conflict",
              "Detached dissolve candidate pre-state changed after staging",
            )
          }
          const graph = await hooks.readGraph(
            proposal.request.source,
            "before",
          )
          if (
            !validateGraph(graph) ||
            graph.root !== proposal.request.source ||
            sha256(JSON.stringify(graph)) !== receipt.graphSha256
          ) {
            throw new BoundaryDissolveCandidateStageError(
              "pre_state_conflict",
              "Detached dissolve candidate Graph changed after staging",
            )
          }
          await this.#boundary.projection.sql.unsafe("COMMIT")
          transaction = false
          return receipt
        }

        const plan = await planBoundaryDissolve(
          this.#boundary,
          proposal.request,
          hooks.massEvidence,
        )
        validateCandidateMassEvidence(plan)
        const firstPlanDigest = planSha256(plan)
        const graph = await hooks.readGraph(
          proposal.request.source,
          "before",
        )
        if (
          !validateGraph(graph) ||
          graph.root !== proposal.request.source
        ) {
          throw new BoundaryDissolveCandidateStageError(
            "graph_invalid",
            `Detached dissolve stage requires valid ${proposal.request.source} Graph`,
          )
        }
        const currentPlan = await planBoundaryDissolve(
          this.#boundary,
          proposal.request,
          hooks.massEvidence,
        )
        validateCandidateMassEvidence(currentPlan)
        if (planSha256(currentPlan) !== firstPlanDigest) {
          throw new BoundaryDissolveCandidateStageError(
            "pre_state_conflict",
            "Detached dissolve candidate pre-state changed during validation",
          )
        }

        const stageId = sha256(
          `${this.#binding.checkpoint.commit}:${proposalDigest}:${firstPlanDigest}`,
        )
        const receiptBody = {
          schema: BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1,
          stageId,
          proposalId: proposal.proposalId,
          operation: "dissolve",
          status: "staged",
          source: proposal.request.source,
          target: proposal.request.target,
          sourceAtom: plan.source.atom,
          targetAtom: plan.target.atom,
          fenceCount: 5,
          proposalSha256: proposalDigest,
          planSha256: firstPlanDigest,
          structuralSha256: plan.structuralSha256,
          privateManifestSha256: sha256(
            JSON.stringify(plan.privateManifest),
          ),
          graphSha256: sha256(JSON.stringify(graph)),
          checkpoint: this.#binding.checkpoint,
          rollbackManifestSha256: this.#binding.rollbackManifestSha256,
          retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
          effects: "none",
        } as const
        const receipt = Object.freeze({
          receiptId: sha256(JSON.stringify(receiptBody)),
          ...receiptBody,
        })
        await this.#boundary.projection.sql`
          INSERT INTO boundary_dissolve_candidate_stage (
            proposal_id, proposal_sha256, proposal_json, plan_json, receipt_json
          ) VALUES (
            ${proposal.proposalId}, ${proposalDigest}, ${proposalJson},
            ${JSON.stringify(plan)}, ${JSON.stringify(receipt)}
          )
        `
        await this.#boundary.projection.sql.unsafe("COMMIT")
        transaction = false
        return receipt
      } catch (error) {
        if (transaction) {
          await this.#boundary.projection.sql.unsafe("ROLLBACK")
            .catch(() => undefined)
        }
        throw error
      }
    })
  }

  async receipt(
    proposalId: string,
  ): Promise<BoundaryDissolveCandidateStageReceiptV1 | null> {
    const row = await this.#row(proposalId)
    return row ? receiptFromRow(row) : null
  }

  owns(boundary: BoundaryDatabase): boolean {
    return this.#boundary === boundary
  }

  /**
   * Returns only the exact plan bytes already persisted by this detached stage.
   *
   * A freshly planned current candidate must serialize identically before the
   * stored plan can be used by the separate non-live acceptance executor.
   */
  async exactPlan(
    proposalId: string,
    hooks: BoundaryDissolveStagingHooks,
  ): Promise<BoundaryDissolveCandidateExactPlanV1> {
    return await this.#serialize(async () => {
      const row = await this.#row(proposalId)
      if (!row) {
        throw new BoundaryDissolveCandidateStageError(
          "stage_corrupt",
          `Detached dissolve candidate stage ${proposalId} is missing`,
        )
      }
      const receipt = receiptFromRow(row)
      const proposal = normalizeBoundaryDissolveProposalV1(
        JSON.parse(row.proposalJson) as unknown,
      )
      const currentPlan = await planBoundaryDissolve(
        this.#boundary,
        proposal.request,
        hooks.massEvidence,
      )
      validateCandidateMassEvidence(currentPlan)
      if (
        JSON.stringify(currentPlan) !== row.planJson ||
        planSha256(currentPlan) !== receipt.planSha256
      ) {
        throw new BoundaryDissolveCandidateStageError(
          "pre_state_conflict",
          "Detached dissolve candidate no longer matches its exact staged plan",
        )
      }
      const graph = await hooks.readGraph(
        proposal.request.source,
        "before",
      )
      if (
        !validateGraph(graph) ||
        graph.root !== proposal.request.source ||
        sha256(JSON.stringify(graph)) !== receipt.graphSha256
      ) {
        throw new BoundaryDissolveCandidateStageError(
          "pre_state_conflict",
          "Detached dissolve candidate Graph no longer matches its stage",
        )
      }
      return Object.freeze({
        proposal,
        plan: JSON.parse(row.planJson) as BoundaryDissolvePlan,
        receipt,
      })
    })
  }

  async count(): Promise<number> {
    const row = (await this.#boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM boundary_dissolve_candidate_stage
    `)[0]
    return Number(row?.count ?? 0)
  }

  async #rows(): Promise<StageRow[]> {
    return await this.#boundary.projection.sql<StageRow[]>`
      SELECT proposal_id AS proposalId, proposal_sha256 AS proposalSha256,
             proposal_json AS proposalJson, plan_json AS planJson,
             receipt_json AS receiptJson
        FROM boundary_dissolve_candidate_stage
       ORDER BY proposal_id
    `
  }

  async #row(proposalId: string): Promise<StageRow | null> {
    const row = (await this.#boundary.projection.sql<StageRow[]>`
      SELECT proposal_id AS proposalId, proposal_sha256 AS proposalSha256,
             proposal_json AS proposalJson, plan_json AS planJson,
             receipt_json AS receiptJson
        FROM boundary_dissolve_candidate_stage
       WHERE proposal_id = ${proposalId}
    `)[0]
    return row ?? null
  }

  async #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.#queue.then(operation)
    this.#queue = task.then(() => undefined, () => undefined)
    return await task
  }
}
