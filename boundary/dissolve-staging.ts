import {SQL} from "bun"
import {createHash} from "node:crypto"
import {
  parseMetaAddress,
  validateMetaJSONV1,
  type MetaAddress,
} from "@metafor/types/metafor/meta-json"
import {
  planBoundaryDissolve,
  type BoundaryDissolveDigestReader,
  type BoundaryDissolveFiveMassMappings,
  type BoundaryDissolveMetaJSONReader,
  type BoundaryDissolvePlan,
  type BoundaryDissolveRequest,
} from "./dissolve.ts"
import type {BoundaryDatabase} from "./sqlite.ts"

export const BOUNDARY_DISSOLVE_PROPOSAL_V1 =
  "metafor/boundary-dissolve-proposal/v1" as const
export const BOUNDARY_DISSOLVE_STAGE_RECEIPT_V1 =
  "metafor/boundary-dissolve-stage-receipt/v1" as const

export type BoundaryDissolveProposalV1 = Readonly<{
  schema: typeof BOUNDARY_DISSOLVE_PROPOSAL_V1
  proposalId: string
  operation: "dissolve"
  request: BoundaryDissolveRequest
}>

export type BoundaryDissolveStageReceiptV1 = Readonly<{
  schema: typeof BOUNDARY_DISSOLVE_STAGE_RECEIPT_V1
  receiptId: string
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
  metaJSONSha256: string
  effects: "none"
}>

export type BoundaryDissolveStagingHooks = Readonly<{
  digest: BoundaryDissolveDigestReader
  readMetaJSON: BoundaryDissolveMetaJSONReader
}>

export type BoundaryDissolveStagingErrorCode =
  | "invalid_proposal"
  | "proposal_conflict"
  | "pre_state_conflict"
  | "meta_json_invalid"
  | "receipt_corrupt"

export class BoundaryDissolveStagingError extends Error {
  override readonly name = "BoundaryDissolveStagingError"

  constructor(
    readonly code: BoundaryDissolveStagingErrorCode,
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

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value).toSorted()
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected.toSorted()[index])
}

const invalidProposal = (message: string): never => {
  throw new BoundaryDissolveStagingError("invalid_proposal", message)
}

const normalizeProposal = (value: unknown): BoundaryDissolveProposalV1 => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schema", "proposalId", "operation", "request"]) ||
    value.schema !== BOUNDARY_DISSOLVE_PROPOSAL_V1 ||
    value.operation !== "dissolve" ||
    typeof value.proposalId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.proposalId)
  ) {
    return invalidProposal("Boundary dissolve proposal envelope is invalid")
  }

  const request = value.request
  if (
    !isRecord(request) ||
    !hasExactKeys(request, ["source", "target", "targetPosition", "mass"])
  ) {
    return invalidProposal("Boundary dissolve request must be a closed object")
  }
  const source = typeof request.source === "string"
    ? parseMetaAddress(request.source)
    : null
  const target = typeof request.target === "string"
    ? parseMetaAddress(request.target)
    : null
  if (!source || !target || source === target) {
    return invalidProposal("Boundary dissolve source and target must be distinct canonical Meta addresses")
  }
  if (
    !Number.isSafeInteger(request.targetPosition) ||
    Number(request.targetPosition) < 0 ||
    !Array.isArray(request.mass) ||
    request.mass.length !== 5
  ) {
    return invalidProposal("Boundary dissolve request requires a position and exactly five Mass mappings")
  }

  const mass = request.mass.map((mapping) => {
    if (
      !isRecord(mapping) ||
      !hasExactKeys(mapping, ["sourceKey", "targetKey"]) ||
      typeof mapping.sourceKey !== "string" ||
      mapping.sourceKey.length === 0 ||
      typeof mapping.targetKey !== "string" ||
      mapping.targetKey.length === 0
    ) {
      return invalidProposal("Boundary dissolve Mass mappings must be closed non-empty key pairs")
    }
    return {sourceKey: mapping.sourceKey, targetKey: mapping.targetKey}
  }) as unknown as BoundaryDissolveFiveMassMappings

  return Object.freeze({
    schema: BOUNDARY_DISSOLVE_PROPOSAL_V1,
    proposalId: value.proposalId,
    operation: "dissolve",
    request: {
      source,
      target,
      targetPosition: Number(request.targetPosition),
      mass,
    },
  })
}

const planSha256 = (plan: BoundaryDissolvePlan): string =>
  sha256(JSON.stringify(plan))

const receiptFromJson = (
  json: string,
  expectedSha256?: string,
): BoundaryDissolveStageReceiptV1 => {
  const parsed: unknown = JSON.parse(json)
  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, [
      "schema",
      "receiptId",
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
      "metaJSONSha256",
      "effects",
    ]) ||
    parsed.schema !== BOUNDARY_DISSOLVE_STAGE_RECEIPT_V1 ||
    parsed.operation !== "dissolve" ||
    parsed.status !== "staged" ||
    parsed.fenceCount !== 5 ||
    parsed.effects !== "none" ||
    typeof parsed.receiptId !== "string"
  ) {
    throw new BoundaryDissolveStagingError("receipt_corrupt", "Stored dissolve receipt is invalid")
  }
  const {receiptId, ...body} = parsed
  if (
    receiptId !== sha256(JSON.stringify(body)) ||
    (expectedSha256 !== undefined && parsed.proposalSha256 !== expectedSha256)
  ) {
    throw new BoundaryDissolveStagingError("receipt_corrupt", "Stored dissolve receipt digest is invalid")
  }
  return Object.freeze(parsed as BoundaryDissolveStageReceiptV1)
}

const receiptFromRow = (row: StageRow): BoundaryDissolveStageReceiptV1 => {
  if (sha256(row.proposalJson) !== row.proposalSha256) {
    throw new BoundaryDissolveStagingError("receipt_corrupt", "Stored dissolve proposal digest is invalid")
  }
  const receipt = receiptFromJson(row.receiptJson, row.proposalSha256)
  if (sha256(row.planJson) !== receipt.planSha256) {
    throw new BoundaryDissolveStagingError("receipt_corrupt", "Stored dissolve plan digest is invalid")
  }
  return receipt
}

/**
 * Private prerequisite adapter. Its staging database is always in-memory and
 * it is deliberately absent from the Boundary package exports and runtime.
 */
export class IsolatedBoundaryDissolveStaging {
  readonly #sql: SQL
  #queue: Promise<void> = Promise.resolve()

  private constructor(sql: SQL) {
    this.#sql = sql
  }

  static async open(): Promise<IsolatedBoundaryDissolveStaging> {
    const sql = new SQL("sqlite::memory:")
    await sql.unsafe(`
      CREATE TABLE boundary_dissolve_stage (
        proposal_id TEXT PRIMARY KEY,
        proposal_sha256 TEXT NOT NULL,
        proposal_json TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        receipt_json TEXT NOT NULL
      ) STRICT;
    `)
    return new IsolatedBoundaryDissolveStaging(sql)
  }

  async stage(
    boundary: BoundaryDatabase,
    input: unknown,
    hooks: BoundaryDissolveStagingHooks,
  ): Promise<BoundaryDissolveStageReceiptV1> {
    return await this.#serialize(async () => {
      const proposal = normalizeProposal(input)
      const proposalJson = JSON.stringify(proposal)
      const proposalDigest = sha256(proposalJson)
      let transaction = false
      try {
        await this.#sql.unsafe("BEGIN IMMEDIATE")
        transaction = true
        const existing = await this.#row(proposal.proposalId)
        if (existing) {
          if (
            existing.proposalSha256 !== proposalDigest ||
            existing.proposalJson !== proposalJson
          ) {
            throw new BoundaryDissolveStagingError(
              "proposal_conflict",
              `Dissolve proposal ${proposal.proposalId} is already staged with different content`,
            )
          }
          const receipt = receiptFromRow(existing)
          await this.#sql.unsafe("COMMIT")
          transaction = false
          return receipt
        }

        const plan = await planBoundaryDissolve(boundary, proposal.request, hooks.digest)
        const firstPlanDigest = planSha256(plan)
        const metaJSON = await hooks.readMetaJSON(proposal.request.source, "before")
        if (!validateMetaJSONV1(metaJSON) || metaJSON.root !== proposal.request.source) {
          throw new BoundaryDissolveStagingError(
            "meta_json_invalid",
            `Dissolve staging requires a valid ${proposal.request.source} MetaJSON document`,
          )
        }

        const currentPlan = await planBoundaryDissolve(boundary, proposal.request, hooks.digest)
        const currentPlanDigest = planSha256(currentPlan)
        if (currentPlanDigest !== firstPlanDigest) {
          throw new BoundaryDissolveStagingError(
            "pre_state_conflict",
            "Boundary dissolve pre-state changed during staging validation",
          )
        }

        const receiptBody = {
          schema: BOUNDARY_DISSOLVE_STAGE_RECEIPT_V1,
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
          privateManifestSha256: sha256(JSON.stringify(plan.privateManifest)),
          metaJSONSha256: sha256(JSON.stringify(metaJSON)),
          effects: "none",
        } as const
        const receipt = Object.freeze({
          receiptId: sha256(JSON.stringify(receiptBody)),
          ...receiptBody,
        })
        const receiptJson = JSON.stringify(receipt)
        await this.#sql`
          INSERT INTO boundary_dissolve_stage (
            proposal_id, proposal_sha256, proposal_json, plan_json, receipt_json
          ) VALUES (
            ${proposal.proposalId}, ${proposalDigest}, ${proposalJson},
            ${JSON.stringify(plan)}, ${receiptJson}
          )
        `
        await this.#sql.unsafe("COMMIT")
        transaction = false
        return receipt
      } catch (error) {
        if (transaction) await this.#sql.unsafe("ROLLBACK").catch(() => undefined)
        throw error
      }
    })
  }

  async receipt(proposalId: string): Promise<BoundaryDissolveStageReceiptV1 | null> {
    const row = await this.#row(proposalId)
    return row ? receiptFromRow(row) : null
  }

  async count(): Promise<number> {
    const row = (await this.#sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM boundary_dissolve_stage
    `)[0]
    return Number(row?.count ?? 0)
  }

  async close(): Promise<void> {
    await this.#sql.close()
  }

  async #row(proposalId: string): Promise<StageRow | null> {
    const row = (await this.#sql<StageRow[]>`
      SELECT proposal_id AS proposalId, proposal_sha256 AS proposalSha256,
             proposal_json AS proposalJson, plan_json AS planJson,
             receipt_json AS receiptJson
        FROM boundary_dissolve_stage
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
