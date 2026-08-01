import {createHash} from "node:crypto"
import {lstatSync, readFileSync} from "node:fs"
import {join, resolve} from "node:path"
import {Database} from "bun:sqlite"
import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {MetaAddress, Graph} from "@metafor/types/metafor/graph"
import type {ForcePartInput} from "shared/protocol/force/particle"
import type {MonadRpcPeer} from "shared/transport/monad"
import {
  MF117_BOUNDARY_ADMIT_METHOD,
  MF117_BOUNDARY_COMMIT_METHOD,
  MF117_BOUNDARY_COMPLETE_METHOD,
  MF117_BOUNDARY_PREFLIGHT_METHOD,
  MF117_BOUNDARY_QUIESCENT_METHOD,
  MF117_BOUNDARY_RECEIPT_METHOD,
  MF117_BOUNDARY_VERIFY_METHOD,
  MF117_CANDIDATE_DIRECTORY,
  MF117_ENERGY_EVIDENCE_METHOD,
  MF117_SOURCE,
  MF117_TARGET,
} from "../shared/mf117.ts"
import {assembleGraphForRoot} from "../dark/monad/graph.ts"
import {canonicalizeGraph} from "../dark/checkpoint/projection.ts"
import {DARK_DECLARATION_PROJECTION_METHOD} from "../dark/graph.ts"
import type {CheckpointBarrierFrontier} from "../dark/checkpoint/barrier.ts"
import type {
  EnergyMF117MassEvidence,
  EnergyMF117MassEvidenceInput,
} from "../energy/dissolve-live.ts"
import type {BoundaryEnergyDissolveFenceBindingV1} from "./dissolve-causal-admission.ts"
import {
  BOUNDARY_DISSOLVE_CAUSAL_ADMISSION_V1,
  BoundaryDissolveCausalAdmission,
  buildBoundaryDissolveCausalPlan,
  type BoundaryDissolveCausalAdmissionInputV1,
  type BoundaryDissolveCausalAdmissionRecordV1,
} from "./dissolve-causal-admission.ts"
import type {
  BoundaryDissolveCandidateStageReceiptV1,
} from "./dissolve-candidate-staging.ts"
import type {
  BoundaryDissolveProposalV1,
} from "./dissolve-staging.ts"
import {
  executeBoundaryDissolveProof,
  planBoundaryDissolve,
  type BoundaryDissolvePlan,
  type BoundaryDissolveProof,
} from "./dissolve.ts"
import {
  BOUNDARY_GRAPH_PROJECTION_METHOD,
  readBoundaryGraphProjectionForRoot,
} from "./graph.ts"
import type {BoundaryDatabase} from "./sqlite.ts"
import type {DissolveCandidateBundleReceiptV1} from "../dark/checkpoint/dissolve-candidate.ts"
import type {BoundaryEnergyDissolveRetargetBindingV1} from "./dissolve-causal-admission.ts"

const schema = "metafor/boundary-mf117-live/v1" as const
const digestPattern = /^[0-9a-f]{64}$/

type CandidateStageRow = {
  proposal_json: string
  plan_json: string
  receipt_json: string
}

type CandidateAcceptance = {
  checkpoint: {cutId: string; sequence: number}
  proof: BoundaryDissolveProof
  postProjectionSha256: string
  promotion: BulkRootPromotionReceipt
  rollback: {verified: boolean}
  retention: string
}

type RollbackManifest = {
  files: Array<{path: string; bytes: number; sha256: string}>
}

export type BoundaryMF117PreflightInput = Readonly<{
  schema: typeof schema
  admissionId: string
  cutId: string
  sequence: number
}>

export type BoundaryMF117PreflightReceipt = Readonly<{
  schema: typeof schema
  admissionInput: BoundaryDissolveCausalAdmissionInputV1
  causalPlan: ReturnType<typeof buildBoundaryDissolveCausalPlan>
  beforeProjectionSha256: string
  postProjectionSha256: string
  integrity: Readonly<{quickCheck: "ok"; foreignKeyViolations: 0}>
  rollback: Readonly<{
    files: number
    manifestSha256: string
    verified: true
  }>
  retention: "retain-until-explicit-gc"
}>

export type BoundaryMF117CommitReceipt = Readonly<{
  schema: typeof schema
  admission: BoundaryDissolveCausalAdmissionRecordV1
  proof: BoundaryDissolveProof
  consequences: readonly ForcePartInput[]
}>

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex")

const regularBytes = (filename: string): Uint8Array => {
  const stat = lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Boundary MF-117 evidence is not a regular file: ${filename}`)
  }
  return new Uint8Array(readFileSync(filename))
}

const jsonFile = <T>(filename: string): T =>
  JSON.parse(
    new TextDecoder("utf8", {fatal: true}).decode(regularBytes(filename)),
  ) as T

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Boundary MF-117 request must be an object")
  }
  return value as Record<string, unknown>
}

const exact = (value: Record<string, unknown>, keys: readonly string[]): void => {
  if (
    JSON.stringify(Object.keys(value).toSorted()) !==
      JSON.stringify([...keys].toSorted())
  ) throw new Error("Boundary MF-117 request is not closed")
}

const candidateEvidence = (
  directory: string,
): {
  bundle: DissolveCandidateBundleReceiptV1
  proposal: BoundaryDissolveProposalV1
  plan: BoundaryDissolvePlan
  stage: BoundaryDissolveCandidateStageReceiptV1
  acceptance: CandidateAcceptance
} => {
  const bundle = jsonFile<DissolveCandidateBundleReceiptV1>(
    join(directory, "candidate-receipt.json"),
  )
  const acceptance = jsonFile<CandidateAcceptance>(
    join(directory, "acceptance-evidence.json"),
  )
  const database = new Database(
    join(directory, "candidate", "boundary.sqlite"),
    {readonly: true, strict: true},
  )
  try {
    const rows = database.query<CandidateStageRow, []>(`
      SELECT proposal_json, plan_json, receipt_json
        FROM boundary_dissolve_candidate_stage
       ORDER BY proposal_id
    `).all()
    if (rows.length !== 1) {
      throw new Error("Boundary MF-117 candidate must contain exactly one stage")
    }
    return {
      bundle,
      proposal: JSON.parse(rows[0]!.proposal_json) as BoundaryDissolveProposalV1,
      plan: JSON.parse(rows[0]!.plan_json) as BoundaryDissolvePlan,
      stage: JSON.parse(rows[0]!.receipt_json) as BoundaryDissolveCandidateStageReceiptV1,
      acceptance,
    }
  } finally {
    database.close(false)
  }
}

/**
 * Boundary-owned exact MF-117 adapter. It exposes only fixed internal Monad
 * methods and keeps structural mutation plus the commit receipt in one SQLite
 * transaction.
 */
export class BoundaryMF117LiveAdapter {
  readonly #candidateDirectory: string
  #peer: MonadRpcPeer | null = null

  constructor(
    private readonly boundary: BoundaryDatabase,
    options: {candidateDirectory?: string} = {},
  ) {
    this.#candidateDirectory = resolve(
      options.candidateDirectory ?? MF117_CANDIDATE_DIRECTORY,
    )
  }

  register(peer: MonadRpcPeer): void {
    this.#peer = peer
    peer.expose(MF117_BOUNDARY_PREFLIGHT_METHOD, async (input) =>
      await this.preflight(input))
    peer.expose(MF117_BOUNDARY_ADMIT_METHOD, async (input) =>
      await this.admit(input))
    peer.expose(MF117_BOUNDARY_QUIESCENT_METHOD, async (input) =>
      await this.quiescent(input))
    peer.expose(MF117_BOUNDARY_COMMIT_METHOD, async (input) =>
      await this.commit(input))
    peer.expose(MF117_BOUNDARY_COMPLETE_METHOD, async (input) =>
      await this.complete(input))
    peer.expose(MF117_BOUNDARY_RECEIPT_METHOD, async (input) =>
      await this.receipt(input))
    peer.expose(MF117_BOUNDARY_VERIFY_METHOD, async (input) =>
      await this.verify(input))
  }

  async preflight(value: unknown): Promise<BoundaryMF117PreflightReceipt> {
    const input = record(value)
    exact(input, ["schema", "admissionId", "cutId", "sequence"])
    if (
      input.schema !== schema ||
      typeof input.admissionId !== "string" ||
      input.admissionId.length === 0 ||
      typeof input.cutId !== "string" ||
      !Number.isSafeInteger(input.sequence) ||
      Number(input.sequence) <= 0
    ) throw new Error("Boundary MF-117 preflight identity is invalid")
    await this.#requirePreDissolveRoot()
    const evidence = candidateEvidence(this.#candidateDirectory)
    if (
      evidence.proposal.request.source !== MF117_SOURCE ||
      evidence.proposal.request.target !== MF117_TARGET ||
      evidence.stage.checkpoint.cutId !== input.cutId ||
      evidence.stage.checkpoint.sequence !== input.sequence ||
      evidence.acceptance.checkpoint.cutId !== input.cutId ||
      evidence.acceptance.checkpoint.sequence !== input.sequence ||
      evidence.acceptance.rollback.verified !== true ||
      evidence.acceptance.retention !== "retain-until-explicit-gc" ||
      !digestPattern.test(evidence.acceptance.postProjectionSha256)
    ) throw new Error("Boundary MF-117 candidate is not bound to the exact current cut")

    const freshPlan = await planBoundaryDissolve(
      this.boundary,
      evidence.proposal.request,
      async ({keyId, format}) => await this.#massEvidence(
        evidence.plan,
        keyId,
        format,
      ),
    )
    if (JSON.stringify(freshPlan) !== JSON.stringify(evidence.plan)) {
      throw new Error("Boundary MF-117 current structural/Mass plan changed")
    }
    const before = await this.#graph(MF117_SOURCE)
    const beforeProjectionSha256 = canonicalizeGraph(before).sha256
    if (beforeProjectionSha256 !== evidence.stage.checkpoint.projectionSha256) {
      throw new Error("Boundary MF-117 current Graph is not the admitted cut")
    }

    const admissionInput = Object.freeze({
      schema: BOUNDARY_DISSOLVE_CAUSAL_ADMISSION_V1,
      admissionId: input.admissionId,
      bundle: evidence.bundle,
      stage: evidence.stage,
      proof: evidence.acceptance.proof,
      promotionReceipt: evidence.acceptance.promotion,
      postProjectionSha256: evidence.acceptance.postProjectionSha256,
      plan: evidence.plan,
    }) satisfies BoundaryDissolveCausalAdmissionInputV1
    const causalPlan = buildBoundaryDissolveCausalPlan(admissionInput)
    const integrity = await this.#integrity()
    const rollback = this.#verifyRollbackBoundary()
    return Object.freeze({
      schema,
      admissionInput,
      causalPlan,
      beforeProjectionSha256,
      postProjectionSha256: evidence.acceptance.postProjectionSha256,
      integrity,
      rollback,
      retention: "retain-until-explicit-gc",
    })
  }

  async admit(value: unknown): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    const input = record(value)
    exact(input, ["schema", "admissionInput"])
    if (input.schema !== schema) throw new Error("Boundary MF-117 admission request is invalid")
    const admission = await BoundaryDissolveCausalAdmission.open(this.boundary)
    return await admission.admit(
      input.admissionInput as BoundaryDissolveCausalAdmissionInputV1,
    )
  }

  async quiescent(value: unknown): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    const input = record(value)
    exact(input, ["schema", "admissionId", "frontier", "energy"])
    if (input.schema !== schema || typeof input.admissionId !== "string") {
      throw new Error("Boundary MF-117 quiescence request is invalid")
    }
    const admission = await BoundaryDissolveCausalAdmission.open(this.boundary)
    return await admission.markQuiescent(
      input.admissionId,
      input.frontier as CheckpointBarrierFrontier,
      input.energy as BoundaryEnergyDissolveFenceBindingV1,
    )
  }

  async commit(value: unknown): Promise<BoundaryMF117CommitReceipt> {
    const input = record(value)
    exact(input, ["schema", "admissionInput"])
    if (input.schema !== schema) throw new Error("Boundary MF-117 commit request is invalid")
    const admissionInput =
      input.admissionInput as BoundaryDissolveCausalAdmissionInputV1
    const admission = await BoundaryDissolveCausalAdmission.open(this.boundary)
    const current = await admission.receipt(admissionInput.admissionId)
    if (current?.phase === "committed" || current?.phase === "complete") {
      return Object.freeze({
        schema,
        admission: current,
        proof: admissionInput.proof,
        consequences: Object.freeze(await this.#consequences(current)),
      })
    }
    if (current?.phase !== "quiescent") {
      throw new Error("Boundary MF-117 commit requires exact durable quiescence")
    }
    let committed: BoundaryDissolveCausalAdmissionRecordV1 | null = null
    const proof = await executeBoundaryDissolveProof(
      this.boundary,
      admissionInput.plan.source.src === admissionInput.plan.target.src
        ? (() => { throw new Error("Boundary MF-117 source and target collided") })()
        : {
            source: admissionInput.plan.source.src,
            target: admissionInput.plan.target.src,
            targetPosition: admissionInput.plan.target.position,
            mass: admissionInput.plan.transfers.map((transfer) => ({
              sourceKey: transfer.sourceAuthoredKey,
              targetKey: transfer.targetAuthoredKey,
            })) as unknown as BoundaryDissolveProposalV1["request"]["mass"],
          },
      admissionInput.plan,
      {
        fence: async () => {},
        release: async () => {},
        massEvidence: async ({keyId, format}) =>
          await this.#massEvidence(admissionInput.plan, keyId, format),
        readGraph: async (root) => await this.#graph(root),
        beforeCommit: async (liveProof, plannedGraph) => {
          if (JSON.stringify(liveProof) !== JSON.stringify(admissionInput.proof)) {
            throw new Error("Boundary MF-117 live proof differs from detached admission")
          }
          const postProjectionSha256 =
            canonicalizeGraph(plannedGraph).sha256
          if (postProjectionSha256 !== admissionInput.postProjectionSha256) {
            throw new Error("Boundary MF-117 live post-projection changed")
          }
          committed = await admission.recordCommitted(
            admissionInput.admissionId,
            liveProof,
            postProjectionSha256,
          )
        },
      },
    )
    if (!committed) {
      throw new Error("Boundary MF-117 atomic commit receipt was not persisted")
    }
    return Object.freeze({
      schema,
      admission: committed,
      proof,
      consequences: Object.freeze(
        await this.#consequences(committed as BoundaryDissolveCausalAdmissionRecordV1),
      ),
    })
  }

  async complete(value: unknown): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    const input = record(value)
    exact(input, ["schema", "admissionId", "ordinal", "effect"])
    if (
      input.schema !== schema ||
      typeof input.admissionId !== "string" ||
      !Number.isSafeInteger(input.ordinal)
    ) throw new Error("Boundary MF-117 consequence receipt is invalid")
    const admission = await BoundaryDissolveCausalAdmission.open(this.boundary)
    return await admission.completePostCommitStep(
      input.admissionId,
      Number(input.ordinal),
      input.effect as string | BoundaryEnergyDissolveRetargetBindingV1,
    )
  }

  async receipt(value: unknown): Promise<BoundaryDissolveCausalAdmissionRecordV1 | null> {
    const input = record(value)
    exact(input, ["schema", "admissionId"])
    if (input.schema !== schema || typeof input.admissionId !== "string") {
      throw new Error("Boundary MF-117 receipt request is invalid")
    }
    const admission = await BoundaryDissolveCausalAdmission.open(this.boundary)
    return await admission.receipt(input.admissionId)
  }

  async verify(value: unknown): Promise<{
    schema: typeof schema
    activeRoot: typeof MF117_TARGET
    previousRoot: typeof MF117_SOURCE
    sourceAtomAbsent: true
    preservedAtomIds: readonly number[]
    massKeysRetained: 5
    rollbackVerified: true
    integrity: BoundaryMF117PreflightReceipt["integrity"]
  }> {
    const input = record(value)
    exact(input, ["schema", "admissionInput"])
    if (input.schema !== schema) throw new Error("Boundary MF-117 verify request is invalid")
    const admissionInput =
      input.admissionInput as BoundaryDissolveCausalAdmissionInputV1
    const roots = await this.boundary.projection.sql<Array<{
      id: number
      wimp: string
      parentAtom: number | null
      parentTopology: number | null
    }>>`
      SELECT id, wimp, parent_atom AS parentAtom,
             parent_topology AS parentTopology
        FROM atom
       WHERE id IN (
         ${admissionInput.plan.source.atom},
         ${admissionInput.plan.target.atom}
       )
       ORDER BY id
    `
    const active = (await this.boundary.projection.sql<Array<{
      activeSrc: string
      previousSrc: string
      planSha256: string
      retention: string
    }>>`
      SELECT active_src AS activeSrc, previous_src AS previousSrc,
             dissolve_plan_sha256 AS planSha256, retention
        FROM boundary_active_root WHERE singleton = 1
    `)[0]
    const target = roots.find(({id}) => id === admissionInput.plan.target.atom)
    const source = roots.find(({id}) => id === admissionInput.plan.source.atom)
    if (
      source ||
      target?.wimp !== MF117_TARGET ||
      target.parentAtom !== null ||
      target.parentTopology !== null ||
      active?.activeSrc !== MF117_TARGET ||
      active.previousSrc !== MF117_SOURCE ||
      active.planSha256 !== sha256(JSON.stringify(admissionInput.plan)) ||
      active.retention !== "retain-until-explicit-gc"
    ) throw new Error("Boundary MF-117 active root receipt is inconsistent")
    const keys = await this.boundary.projection.sql<Array<{key: string}>>`
      SELECT membership.key
        FROM mass_membership AS membership
       WHERE membership.atom = ${admissionInput.plan.target.atom}
       ORDER BY membership.declaration
    `
    const expectedKeys = admissionInput.plan.transfers
      .map(({sourceGlobalKey}) => sourceGlobalKey)
      .toSorted()
    if (
      JSON.stringify(keys.map(({key}) => key).toSorted()) !==
        JSON.stringify(expectedKeys)
    ) throw new Error("Boundary MF-117 target Mass key ownership changed")
    const meta = await this.#graph(MF117_TARGET)
    if (
      canonicalizeGraph(meta).sha256 !==
        admissionInput.postProjectionSha256
    ) throw new Error("Boundary MF-117 target Graph digest changed")
    const rollback = this.#verifyRollbackBoundary()
    return {
      schema,
      activeRoot: MF117_TARGET,
      previousRoot: MF117_SOURCE,
      sourceAtomAbsent: true,
      preservedAtomIds: admissionInput.proof.preservedRuntimeIds
        .filter((path) => path.startsWith("atom/"))
        .map((path) => Number(path.slice("atom/".length))),
      massKeysRetained: 5,
      rollbackVerified: rollback.verified,
      integrity: await this.#integrity(),
    }
  }

  async #graph(root: MetaAddress): Promise<Graph> {
    const peer = this.#peer
    if (!peer) throw new Error("Boundary MF-117 Monad peer is unavailable")
    return await assembleGraphForRoot({
      call: async <T>(target: string, method: string, params: unknown): Promise<T> => {
        if (target === "dark" && method === DARK_DECLARATION_PROJECTION_METHOD) {
          return await peer.call<T>("dark", method, params, {waitMs: 30_000})
        }
        if (target === "boundary" && method === BOUNDARY_GRAPH_PROJECTION_METHOD) {
          return await readBoundaryGraphProjectionForRoot(this.boundary, root) as T
        }
        throw new Error(`Boundary MF-117 unexpected Graph provider: ${target}.${method}`)
      },
    } as Pick<MonadRpcPeer, "call">, root)
  }

  async #massEvidence(
    plan: BoundaryDissolvePlan,
    keyId: string,
    format: "json" | "binary",
  ): Promise<EnergyMF117MassEvidence> {
    const peer = this.#peer
    if (!peer) throw new Error("Boundary MF-117 Monad peer is unavailable")
    const transfer = plan.transfers.find((entry) =>
      entry.sourceGlobalKey === keyId && entry.format === format)
    if (!transfer) throw new Error("Boundary MF-117 Mass evidence key is outside the plan")
    const request: EnergyMF117MassEvidenceInput = {
      schema: "metafor/energy-mf117-live/v1",
      atom: plan.source.atom,
      declaration: transfer.sourceDeclaration,
      keyId,
      format,
    }
    return await peer.call<EnergyMF117MassEvidence>(
      "energy",
      MF117_ENERGY_EVIDENCE_METHOD,
      request,
      {waitMs: 30_000},
    )
  }

  async #consequences(
    admission: BoundaryDissolveCausalAdmissionRecordV1,
  ): Promise<ForcePartInput[]> {
    const entries = (await this.boundary.initialProjection()).entries
    return admission.plan.postCommit
      .filter((step): step is Extract<typeof step, {kind: "force-entity"}> =>
        step.kind === "force-entity")
      .map((step) => {
        if (step.entity.operation === "remove") {
          return {
            part: "graviton",
            op: "remove",
            path: step.entity.path,
            ts: Date.now(),
          } satisfies ForcePartInput
        }
        const entry = entries.find((candidate) =>
          candidate.part === "graviton" &&
          candidate.path === step.entity.path &&
          candidate.value !== undefined)
        if (!entry) {
          throw new Error(`Boundary MF-117 consequence is unavailable: ${step.entity.path}`)
        }
        return {
          ...structuredClone(entry),
          op: "replace",
          ts: Date.now(),
        } as ForcePartInput
      })
  }

  async #requirePreDissolveRoot(): Promise<void> {
    const rows = await this.boundary.projection.sql<Array<{
      id: number
      wimp: string
      parentAtom: number | null
      parentTopology: number | null
    }>>`
      SELECT id, wimp, parent_atom AS parentAtom,
             parent_topology AS parentTopology
        FROM atom
       WHERE parent_atom IS NULL AND parent_topology IS NULL
       ORDER BY id
    `
    if (
      rows.length !== 1 ||
      rows[0]?.id !== 1 ||
      rows[0]?.wimp !== MF117_SOURCE
    ) throw new Error("Boundary MF-117 requires exactly one current Inference root")
    const activeTable = (await this.boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM sqlite_master
       WHERE type = ${"table"} AND name = ${"boundary_active_root"}
    `)[0]?.count ?? 0
    if (Number(activeTable) !== 0) {
      throw new Error("Boundary MF-117 active-root transition already exists")
    }
  }

  async #integrity(): Promise<BoundaryMF117PreflightReceipt["integrity"]> {
    const quick = await this.boundary.projection.sql<Array<{quick_check: string}>>`
      PRAGMA quick_check
    `
    const foreign = await this.boundary.projection.sql<unknown[]>`
      PRAGMA foreign_key_check
    `
    if (quick[0]?.quick_check !== "ok" || foreign.length !== 0) {
      throw new Error("Boundary MF-117 integrity check failed")
    }
    return {quickCheck: "ok", foreignKeyViolations: 0}
  }

  #verifyRollbackBoundary(): BoundaryMF117PreflightReceipt["rollback"] {
    const manifestPath = join(this.#candidateDirectory, "rollback-manifest.json")
    const manifestBytes = regularBytes(manifestPath)
    const manifest = JSON.parse(
      new TextDecoder("utf8", {fatal: true}).decode(manifestBytes),
    ) as RollbackManifest
    const files = manifest.files?.filter(({path}) =>
      /^rollback\/boundary\.sqlite(?:-(?:wal|shm))?$/.test(path))
    if (!files || files.length !== 3) {
      throw new Error("Boundary MF-117 rollback SQLite set is incomplete")
    }
    for (const entry of files) {
      const bytes = regularBytes(join(this.#candidateDirectory, entry.path))
      if (
        !Number.isSafeInteger(entry.bytes) ||
        bytes.byteLength !== entry.bytes ||
        !digestPattern.test(entry.sha256) ||
        sha256(bytes) !== entry.sha256
      ) throw new Error(`Boundary MF-117 rollback digest changed: ${entry.path}`)
    }
    return Object.freeze({
      files: files.length,
      manifestSha256: sha256(manifestBytes),
      verified: true,
    })
  }
}

export const BOUNDARY_MF117_LIVE_SCHEMA = schema
