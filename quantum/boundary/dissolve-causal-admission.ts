import {createHash} from "node:crypto"
import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {CheckpointBarrierFrontier} from "../dark/checkpoint/barrier.ts"
import {
  DISSOLVE_CANDIDATE_BUNDLE_RECEIPT_V1,
  type DissolveCandidateBundleReceiptV1,
} from "../dark/checkpoint/dissolve-candidate.ts"
import {forceDomains} from "../dark/force/store.ts"
import {
  BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
  BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1,
  type BoundaryDissolveCandidateStageReceiptV1,
} from "./dissolve-candidate-staging.ts"
import type {
  BoundaryDissolvePlan,
  BoundaryDissolveProof,
} from "./dissolve.ts"
import type {BoundaryDatabase} from "./sqlite.ts"

export const BOUNDARY_DISSOLVE_CAUSAL_ADMISSION_V1 =
  "metafor/boundary-dissolve-causal-admission/v1" as const
export const BOUNDARY_DISSOLVE_CAUSAL_PLAN_V1 =
  "metafor/boundary-dissolve-causal-plan/v1" as const
export const BOUNDARY_DISSOLVE_COMMIT_RECEIPT_V1 =
  "metafor/boundary-dissolve-commit-receipt/v1" as const

const digestPattern = /^[0-9a-f]{64}$/

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

const canonicalJSON = (value: unknown): string =>
  JSON.stringify(canonicalValue(value))

const sha256 = (value: unknown): string =>
  createHash("sha256").update(canonicalJSON(value)).digest("hex")

const rawSha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex")

export type BoundaryDissolveCausalAdmissionInputV1 = Readonly<{
  schema: typeof BOUNDARY_DISSOLVE_CAUSAL_ADMISSION_V1
  admissionId: string
  bundle: DissolveCandidateBundleReceiptV1
  stage: BoundaryDissolveCandidateStageReceiptV1
  proof: BoundaryDissolveProof
  promotionReceipt: BulkRootPromotionReceipt
  postProjectionSha256: string
  plan: BoundaryDissolvePlan
}>

export type BoundaryDissolveRetainedBindingV1 = Readonly<{
  ordinal: number
  sourceAtom: number
  sourceDeclaration: number
  sourceAuthoredKey: string
  sourceGlobalKey: string
  targetAtom: number
  targetDeclaration: number
  targetAuthoredKey: string
  targetPreviousGlobalKey: string
  format: "json" | "binary"
  dependentBindings: readonly Readonly<{
    atom: number
    declaration: number
    previousKey: string
    parentAtom: number
    parentDeclaration: number
  }>[]
  retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
}>

export type BoundaryDissolvePostCommitStepV1 =
  | Readonly<{
    ordinal: number
    kind: "energy-retarget"
    handleCount: 5
  }>
  | Readonly<{
    ordinal: number
    kind: "force-entity"
    entity: Readonly<{
      kind: "atom" | "topology"
      id: number
      operation: "replace" | "remove"
      path: string
    }>
    wire: Readonly<{messages: 1; partsPerMessage: 1}>
  }>
  | Readonly<{
    ordinal: number
    kind: "bulk-promote"
    promotionReceiptSha256: string
  }>
  | Readonly<{
    ordinal: number
    kind: "retain-evidence"
    retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
  }>
  | Readonly<{
    ordinal: number
    kind: "release-admission"
  }>

export type BoundaryDissolveCausalPlanV1 = Readonly<{
  schema: typeof BOUNDARY_DISSOLVE_CAUSAL_PLAN_V1
  planId: string
  admissionId: string
  bundleId: string
  stageId: string
  stageReceiptId: string
  checkpoint: BoundaryDissolveCandidateStageReceiptV1["checkpoint"]
  structuralPlanSha256: string
  detachedProofSha256: string
  postProjectionSha256: string
  preCommit: readonly [
    "close-structural-admission",
    "hold-applied-through-frontier",
    "fence-five-energy-handles",
    "boundary-atomic-commit",
  ]
  postCommit: readonly BoundaryDissolvePostCommitStepV1[]
  retainedBindings: readonly BoundaryDissolveRetainedBindingV1[]
  retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
  liveEffects: "none-until-external-commit"
}>

export type BoundaryEnergyDissolveFenceBindingV1 = Readonly<{
  schema: "metafor/energy-dissolve-fence-binding/v1"
  receiptId: string
  receiptSha256: string
  admissionId: string
  admissionReceiptId: string
  stageId: string
  stageReceiptId: string
  planSha256: string
  phase: "fenced"
  handleCount: 5
}>

export type BoundaryEnergyDissolveRetargetBindingV1 = Readonly<{
  schema: "metafor/energy-dissolve-retarget-binding/v1"
  receiptId: string
  receiptSha256: string
  admissionId: string
  stageId: string
  stageReceiptId: string
  planSha256: string
  commitReceiptId: string
  phase: "retargeted"
  handleCount: 5
}>

export type BoundaryDissolveCommitReceiptV1 = Readonly<{
  schema: typeof BOUNDARY_DISSOLVE_COMMIT_RECEIPT_V1
  commitReceiptId: string
  admissionId: string
  admissionReceiptId: string
  stageId: string
  stageReceiptId: string
  planId: string
  proofSha256: string
  postProjectionSha256: string
  retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
}>

export type BoundaryDissolveCausalAdmissionRecordV1 = Readonly<{
  schema: typeof BOUNDARY_DISSOLVE_CAUSAL_ADMISSION_V1
  receiptId: string
  admissionId: string
  bindingSha256: string
  phase: "admitted" | "quiescent" | "committed" | "complete"
  externalAdmission: "closed" | "open"
  plan: BoundaryDissolveCausalPlanV1
  quiescence: Readonly<{
    frontier: CheckpointBarrierFrontier
    energy: BoundaryEnergyDissolveFenceBindingV1
  }> | null
  commit: BoundaryDissolveCommitReceiptV1 | null
  completedPostCommitOrdinals: readonly number[]
  effectReceiptIds: readonly string[]
  retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
}>

export type BoundaryDissolveCausalAdmissionErrorCode =
  | "invalid_admission"
  | "admission_conflict"
  | "stale_candidate"
  | "invalid_phase"
  | "out_of_order"
  | "record_corrupt"

export class BoundaryDissolveCausalAdmissionError extends Error {
  override readonly name = "BoundaryDissolveCausalAdmissionError"

  constructor(
    readonly code: BoundaryDissolveCausalAdmissionErrorCode,
    message: string,
  ) {
    super(message)
  }
}

type AdmissionRow = Readonly<{
  admissionId: string
  bindingSha256: string
  recordJson: string
}>

const fail = (
  code: BoundaryDissolveCausalAdmissionErrorCode,
  message: string,
): never => {
  throw new BoundaryDissolveCausalAdmissionError(code, message)
}

const sameCheckpoint = (
  left: BoundaryDissolveCandidateStageReceiptV1["checkpoint"],
  right: BoundaryDissolveCandidateStageReceiptV1["checkpoint"],
): boolean => canonicalJSON(left) === canonicalJSON(right)

const retainedBindings = (
  plan: BoundaryDissolvePlan,
): readonly BoundaryDissolveRetainedBindingV1[] =>
  Object.freeze(plan.transfers.map((transfer, index) => Object.freeze({
    ordinal: index + 1,
    sourceAtom: plan.source.atom,
    sourceDeclaration: transfer.sourceDeclaration,
    sourceAuthoredKey: transfer.sourceAuthoredKey,
    sourceGlobalKey: transfer.sourceGlobalKey,
    targetAtom: plan.target.atom,
    targetDeclaration: transfer.targetDeclaration,
    targetAuthoredKey: transfer.targetAuthoredKey,
    targetPreviousGlobalKey: transfer.targetPreviousGlobalKey,
    format: transfer.format,
    dependentBindings: Object.freeze(transfer.dependents.map((dependent) =>
      Object.freeze({
        atom: dependent.atom,
        declaration: dependent.declaration,
        previousKey: dependent.currentKey,
        parentAtom: dependent.parentAtom,
        parentDeclaration: dependent.parentDeclaration,
      }))),
    retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
  })))

const entityPostCommitSteps = (
  plan: BoundaryDissolvePlan,
): BoundaryDissolvePostCommitStepV1[] => {
  const changed = plan.preservedRuntime.filter((runtime, index) =>
    index === 0 || runtime.scopeAtom === plan.source.atom)
  const entities: Array<{
    kind: "atom" | "topology"
    id: number
    operation: "replace" | "remove"
    path: string
  }> = changed.map((runtime) => ({
    kind: runtime.kind,
    id: runtime.id,
    operation: "replace" as const,
    path: `${runtime.kind}/${runtime.id}`,
  }))
  entities.push({
    kind: "atom",
    id: plan.source.atom,
    operation: "remove",
    path: `atom/${plan.source.atom}`,
  })
  return entities.map((entity, index) => Object.freeze({
    ordinal: index + 2,
    kind: "force-entity" as const,
    entity: Object.freeze(entity),
    wire: Object.freeze({messages: 1 as const, partsPerMessage: 1 as const}),
  }))
}

export const buildBoundaryDissolveCausalPlan = (
  input: BoundaryDissolveCausalAdmissionInputV1,
): BoundaryDissolveCausalPlanV1 => {
  if (
    input.schema !== BOUNDARY_DISSOLVE_CAUSAL_ADMISSION_V1 ||
    typeof input.admissionId !== "string" ||
    input.admissionId.length === 0 ||
    !digestPattern.test(input.postProjectionSha256)
  ) fail("invalid_admission", "Causal dissolve admission envelope is invalid")

  const {bundle, stage, proof, promotionReceipt, plan} = input
  const planSha256 = rawSha256(JSON.stringify(plan))
  const {bundleId, ...bundleBody} = bundle
  const {receiptId: stageReceiptId, ...stageBody} = stage
  const expectedTransferredKeys = plan.transfers.map(
    ({sourceGlobalKey}) => sourceGlobalKey,
  )
  const expectedRetainedKeys = [...new Set(plan.transfers
    .filter(({sourceGlobalKey, targetPreviousGlobalKey}) =>
      sourceGlobalKey !== targetPreviousGlobalKey)
    .map(({targetPreviousGlobalKey}) => targetPreviousGlobalKey))]
  if (
    bundle.schema !== DISSOLVE_CANDIDATE_BUNDLE_RECEIPT_V1 ||
    !digestPattern.test(bundleId) ||
    bundleId !== sha256(bundleBody) ||
    !digestPattern.test(bundle.candidateBoundarySha256) ||
    !digestPattern.test(bundle.candidateMassManifestSha256) ||
    bundle.effects !== "none" ||
    bundle.retention !== BOUNDARY_DISSOLVE_CANDIDATE_RETENTION ||
    bundle.stage.stageId !== stage.stageId ||
    bundle.stage.receiptId !== stage.receiptId ||
    bundle.root !== stage.source ||
    !sameCheckpoint(bundle.checkpoint, stage.checkpoint) ||
    stage.schema !== BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1 ||
    !digestPattern.test(stageReceiptId) ||
    stageReceiptId !== rawSha256(JSON.stringify(stageBody)) ||
    stage.stageId !== rawSha256(
      `${stage.checkpoint.commit}:${stage.proposalSha256}:${stage.planSha256}`,
    ) ||
    stage.effects !== "none" ||
    stage.retention !== BOUNDARY_DISSOLVE_CANDIDATE_RETENTION ||
    stage.fenceCount !== 5 ||
    stage.planSha256 !== planSha256 ||
    stage.privateManifestSha256 !== rawSha256(
      JSON.stringify(plan.privateManifest),
    ) ||
    plan.source.atom !== stage.sourceAtom ||
    plan.source.src !== stage.source ||
    plan.target.atom !== stage.targetAtom ||
    plan.target.src !== stage.target ||
    plan.transfers.length !== 5 ||
    proof.sourceAtom !== stage.sourceAtom ||
    proof.targetAtom !== stage.targetAtom ||
    proof.planSha256 !== stage.planSha256 ||
    proof.structuralSha256 !== stage.structuralSha256 ||
    proof.privateManifestSha256 !== stage.privateManifestSha256 ||
    canonicalJSON(proof.transferredGlobalKeys) !==
      canonicalJSON(expectedTransferredKeys) ||
    canonicalJSON(proof.retainedUnreferencedKeys) !==
      canonicalJSON(expectedRetainedKeys) ||
    promotionReceipt.version !== 1 ||
    promotionReceipt.kind !== "root-promotion" ||
    promotionReceipt.verified !== true ||
    promotionReceipt.removedRootAtomId !== stage.sourceAtom ||
    promotionReceipt.removedRootSrc !== stage.source ||
    promotionReceipt.promotedAtomId !== stage.targetAtom ||
    promotionReceipt.promotedRootSrc !== stage.target
  ) fail("invalid_admission", "Causal dissolve evidence is not one exact candidate")

  const replacements = entityPostCommitSteps(plan)
  const bulkOrdinal = replacements.length + 2
  const postCommit: BoundaryDissolvePostCommitStepV1[] = [
    Object.freeze({ordinal: 1, kind: "energy-retarget", handleCount: 5}),
    ...replacements,
    Object.freeze({
      ordinal: bulkOrdinal,
      kind: "bulk-promote",
      promotionReceiptSha256: sha256(promotionReceipt),
    }),
    Object.freeze({
      ordinal: bulkOrdinal + 1,
      kind: "retain-evidence",
      retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
    }),
    Object.freeze({ordinal: bulkOrdinal + 2, kind: "release-admission"}),
  ]
  const body = {
    schema: BOUNDARY_DISSOLVE_CAUSAL_PLAN_V1,
    admissionId: input.admissionId,
    bundleId: bundle.bundleId,
    stageId: stage.stageId,
    stageReceiptId: stage.receiptId,
    checkpoint: stage.checkpoint,
    structuralPlanSha256: stage.planSha256,
    detachedProofSha256: sha256(proof),
    postProjectionSha256: input.postProjectionSha256,
    preCommit: [
      "close-structural-admission",
      "hold-applied-through-frontier",
      "fence-five-energy-handles",
      "boundary-atomic-commit",
    ] as const,
    postCommit: Object.freeze(postCommit),
    retainedBindings: retainedBindings(plan),
    retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
    liveEffects: "none-until-external-commit",
  } as const
  return Object.freeze({planId: sha256(body), ...body})
}

const recordReceipt = (
  value: Omit<BoundaryDissolveCausalAdmissionRecordV1, "receiptId">,
): BoundaryDissolveCausalAdmissionRecordV1 =>
  Object.freeze({receiptId: sha256(value), ...value})

const parseRecord = (row: AdmissionRow): BoundaryDissolveCausalAdmissionRecordV1 => {
  let value: unknown
  try {
    value = JSON.parse(row.recordJson) as unknown
  } catch {
    return fail("record_corrupt", "Boundary dissolve admission record is not JSON")
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("receiptId" in value) ||
    typeof value.receiptId !== "string" ||
    !("admissionId" in value) ||
    value.admissionId !== row.admissionId ||
    !("bindingSha256" in value) ||
    value.bindingSha256 !== row.bindingSha256
  ) return fail("record_corrupt", "Boundary dissolve admission record shape is invalid")
  const {receiptId, ...body} = value as BoundaryDissolveCausalAdmissionRecordV1
  if (receiptId !== sha256(body)) {
    return fail("record_corrupt", "Boundary dissolve admission record digest is invalid")
  }
  return Object.freeze(value as BoundaryDissolveCausalAdmissionRecordV1)
}

/**
 * Boundary-owned non-live admission state.
 *
 * This class creates only a private control table in a caller-provided
 * Boundary database. It exposes no server/RPC method and never materializes a
 * Particle, a world row or a Bulk projection.
 */
export class BoundaryDissolveCausalAdmission {
  #queue: Promise<void> = Promise.resolve()

  private constructor(private readonly boundary: BoundaryDatabase) {}

  static async open(
    boundary: BoundaryDatabase,
  ): Promise<BoundaryDissolveCausalAdmission> {
    await boundary.projection.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS boundary_dissolve_causal_admission (
        admission_id TEXT PRIMARY KEY,
        binding_sha256 TEXT NOT NULL,
        record_json TEXT NOT NULL
      ) STRICT;
    `)
    const admission = new BoundaryDissolveCausalAdmission(boundary)
    for (const row of await admission.#rows()) parseRecord(row)
    return admission
  }

  async admit(
    input: BoundaryDissolveCausalAdmissionInputV1,
  ): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    return await this.#serialize(async () => {
      const plan = buildBoundaryDissolveCausalPlan(input)
      const bindingSha256 = sha256(input)
      const existing = await this.#row(input.admissionId)
      if (existing) {
        if (existing.bindingSha256 !== bindingSha256) {
          return fail(
            "admission_conflict",
            `Causal admission ${input.admissionId} already binds different evidence`,
          )
        }
        return parseRecord(existing)
      }
      const record = recordReceipt({
        schema: BOUNDARY_DISSOLVE_CAUSAL_ADMISSION_V1,
        admissionId: input.admissionId,
        bindingSha256,
        phase: "admitted",
        externalAdmission: "closed",
        plan,
        quiescence: null,
        commit: null,
        completedPostCommitOrdinals: Object.freeze([]),
        effectReceiptIds: Object.freeze([]),
        retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
      })
      await this.boundary.projection.sql`
        INSERT INTO boundary_dissolve_causal_admission (
          admission_id, binding_sha256, record_json
        ) VALUES (
          ${record.admissionId}, ${record.bindingSha256}, ${JSON.stringify(record)}
        )
      `
      return record
    })
  }

  async markQuiescent(
    admissionId: string,
    frontier: CheckpointBarrierFrontier,
    energy: BoundaryEnergyDissolveFenceBindingV1,
  ): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    return await this.#serialize(async () => {
      const current = await this.#required(admissionId)
      if (current.phase === "quiescent") {
        if (canonicalJSON(current.quiescence) !== canonicalJSON({frontier, energy})) {
          return fail("admission_conflict", "Quiescent admission already binds different receipts")
        }
        return current
      }
      if (current.phase !== "admitted") {
        return fail("invalid_phase", "Only an admitted dissolve can become quiescent")
      }
      if (
        frontier.phase !== "held" ||
        frontier.cutId !== current.plan.checkpoint.cutId ||
        frontier.acceptanceSequence !== current.plan.checkpoint.sequence ||
        frontier.domains.length !== forceDomains.length ||
        new Set(frontier.domains.map(({domain}) => domain)).size !==
          forceDomains.length ||
        forceDomains.some((domain) =>
          !frontier.domains.some((entry) => entry.domain === domain)) ||
        frontier.domains.some((domain) =>
          domain.sentOrdinal !== domain.appliedOrdinal ||
          domain.appliedAcceptanceSequence > frontier.acceptanceSequence) ||
        energy.schema !== "metafor/energy-dissolve-fence-binding/v1" ||
        energy.phase !== "fenced" ||
        energy.handleCount !== 5 ||
        energy.admissionId !== current.admissionId ||
        energy.admissionReceiptId !== current.receiptId ||
        energy.stageId !== current.plan.stageId ||
        energy.stageReceiptId !== current.plan.stageReceiptId ||
        energy.planSha256 !== current.plan.structuralPlanSha256 ||
        !digestPattern.test(energy.receiptId) ||
        !digestPattern.test(energy.receiptSha256)
      ) return fail("stale_candidate", "Quiescence does not match the exact admitted candidate")
      return await this.#replace(current, {
        ...current,
        phase: "quiescent",
        quiescence: Object.freeze({
          frontier: structuredClone(frontier),
          energy: structuredClone(energy),
        }),
      })
    })
  }

  async recordCommitted(
    admissionId: string,
    proof: BoundaryDissolveProof,
    postProjectionSha256: string,
  ): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    return await this.#serialize(async () => {
      const current = await this.#required(admissionId)
      if (current.phase === "committed" || current.phase === "complete") {
        if (
          current.commit?.proofSha256 !== sha256(proof) ||
          current.commit.postProjectionSha256 !== postProjectionSha256
        ) return fail("admission_conflict", "Boundary commit receipt already differs")
        return current
      }
      if (current.phase !== "quiescent") {
        return fail("invalid_phase", "Boundary commit requires exact quiescence and five fences")
      }
      if (
        proof.sourceAtom !== current.plan.retainedBindings[0]?.sourceAtom ||
        proof.targetAtom !== current.plan.retainedBindings[0]?.targetAtom ||
        proof.planSha256 !== current.plan.structuralPlanSha256 ||
        sha256(proof) !== current.plan.detachedProofSha256 ||
        proof.transferredGlobalKeys.length !== 5 ||
        postProjectionSha256 !== current.plan.postProjectionSha256
      ) return fail("stale_candidate", "Boundary commit does not match the admitted proof")
      const body = {
        schema: BOUNDARY_DISSOLVE_COMMIT_RECEIPT_V1,
        admissionId: current.admissionId,
        admissionReceiptId: current.receiptId,
        stageId: current.plan.stageId,
        stageReceiptId: current.plan.stageReceiptId,
        planId: current.plan.planId,
        proofSha256: sha256(proof),
        postProjectionSha256,
        retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
      } as const
      const commit = Object.freeze({
        commitReceiptId: sha256(body),
        ...body,
      })
      return await this.#replace(current, {
        ...current,
        phase: "committed",
        commit,
      })
    })
  }

  async completePostCommitStep(
    admissionId: string,
    ordinal: number,
    effect: string | BoundaryEnergyDissolveRetargetBindingV1,
  ): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    return await this.#serialize(async () => {
      const current = await this.#required(admissionId)
      if (current.phase !== "committed" && current.phase !== "complete") {
        return fail("invalid_phase", "Post-commit consequences require an exact Boundary commit")
      }
      const requestedStep = current.plan.postCommit[ordinal - 1]
      const effectReceiptId = typeof effect === "string"
        ? effect
        : effect.receiptSha256
      if (
        requestedStep?.kind === "energy-retarget" &&
        (
          typeof effect === "string" ||
          effect.schema !== "metafor/energy-dissolve-retarget-binding/v1" ||
          effect.phase !== "retargeted" ||
          effect.handleCount !== 5 ||
          effect.admissionId !== current.admissionId ||
          effect.stageId !== current.plan.stageId ||
          effect.stageReceiptId !== current.plan.stageReceiptId ||
          effect.planSha256 !== current.plan.structuralPlanSha256 ||
          effect.commitReceiptId !== current.commit?.commitReceiptId ||
          effect.receiptId !== current.quiescence?.energy.receiptId ||
          !digestPattern.test(effect.receiptSha256)
        )
      ) return fail("stale_candidate", "Energy retarget does not match the committed admission")
      if (requestedStep?.kind !== "energy-retarget" && typeof effect !== "string") {
        return fail("out_of_order", "Energy retarget receipt is not valid for this consequence")
      }
      const completed = current.completedPostCommitOrdinals
      if (ordinal <= completed.length) {
        if (
          completed[ordinal - 1] !== ordinal ||
          current.effectReceiptIds[ordinal - 1] !== effectReceiptId
        ) return fail("admission_conflict", "Duplicate consequence has different evidence")
        return current
      }
      const step = current.plan.postCommit[completed.length]
      if (
        !step ||
        step.ordinal !== ordinal ||
        typeof effectReceiptId !== "string" ||
        effectReceiptId.length === 0
      ) return fail("out_of_order", "Post-commit consequence is out of order")
      const nextCompleted = Object.freeze([...completed, ordinal])
      const complete = nextCompleted.length === current.plan.postCommit.length
      return await this.#replace(current, {
        ...current,
        phase: complete ? "complete" : "committed",
        externalAdmission: complete ? "open" : "closed",
        completedPostCommitOrdinals: nextCompleted,
        effectReceiptIds: Object.freeze([
          ...current.effectReceiptIds,
          effectReceiptId,
        ]),
      })
    })
  }

  async receipt(
    admissionId: string,
  ): Promise<BoundaryDissolveCausalAdmissionRecordV1 | null> {
    const row = await this.#row(admissionId)
    return row ? parseRecord(row) : null
  }

  async #replace(
    current: BoundaryDissolveCausalAdmissionRecordV1,
    next: Omit<BoundaryDissolveCausalAdmissionRecordV1, "receiptId"> |
      BoundaryDissolveCausalAdmissionRecordV1,
  ): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    const {receiptId: _previousReceiptId, ...body} =
      next as BoundaryDissolveCausalAdmissionRecordV1
    const record = recordReceipt(body)
    const changed = await this.boundary.projection.sql<Array<{admissionId: string}>>`
      UPDATE boundary_dissolve_causal_admission
         SET record_json = ${JSON.stringify(record)}
       WHERE admission_id = ${current.admissionId}
         AND binding_sha256 = ${current.bindingSha256}
         AND record_json = ${JSON.stringify(current)}
       RETURNING admission_id AS admissionId
    `
    if (changed.length !== 1) {
      return fail("admission_conflict", "Boundary dissolve admission changed concurrently")
    }
    return record
  }

  async #required(
    admissionId: string,
  ): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    const row = await this.#row(admissionId)
    if (!row) return fail("invalid_admission", `Unknown causal admission ${admissionId}`)
    return parseRecord(row)
  }

  async #rows(): Promise<AdmissionRow[]> {
    return await this.boundary.projection.sql<AdmissionRow[]>`
      SELECT admission_id AS admissionId, binding_sha256 AS bindingSha256,
             record_json AS recordJson
        FROM boundary_dissolve_causal_admission
       ORDER BY admission_id
    `
  }

  async #row(admissionId: string): Promise<AdmissionRow | null> {
    const row = (await this.boundary.projection.sql<AdmissionRow[]>`
      SELECT admission_id AS admissionId, binding_sha256 AS bindingSha256,
             record_json AS recordJson
        FROM boundary_dissolve_causal_admission
       WHERE admission_id = ${admissionId}
    `)[0]
    return row ?? null
  }

  async #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.#queue.then(operation)
    this.#queue = task.then(() => undefined, () => undefined)
    return await task
  }
}
