import {createHash} from "node:crypto"
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs"
import {dirname, join, resolve} from "node:path"
import type {SourcedForceMessage} from "shared/protocol/force/message"
import type {MonadRpcPeer} from "shared/transport/monad"
import {
  MF117_BOUNDARY_ADMIT_METHOD,
  MF117_BOUNDARY_COMMIT_METHOD,
  MF117_BOUNDARY_COMPLETE_METHOD,
  MF117_BOUNDARY_PREFLIGHT_METHOD,
  MF117_BOUNDARY_QUIESCENT_METHOD,
  MF117_BOUNDARY_RECEIPT_METHOD,
  MF117_BOUNDARY_VERIFY_METHOD,
  MF117_BULK_PREFLIGHT_METHOD,
  MF117_BULK_PROMOTE_METHOD,
  MF117_BULK_VERIFY_METHOD,
  MF117_CANDIDATE_DIRECTORY,
  MF117_ENERGY_FENCE_METHOD,
  MF117_ENERGY_PREFLIGHT_METHOD,
  MF117_ENERGY_RETARGET_METHOD,
  MF117_ENERGY_VERIFY_METHOD,
  MF117_PREFLIGHT_SCHEMA,
  MF117_SOURCE,
  MF117_STATE_DIRECTORY,
  MF117_TARGET,
} from "../shared/mf117.ts"
import type {
  BoundaryMF117CommitReceipt,
  BoundaryMF117PreflightReceipt,
} from "../boundary/dissolve-live.ts"
import type {
  BoundaryDissolveCausalAdmissionRecordV1,
  BoundaryDissolvePostCommitStepV1,
} from "../boundary/dissolve-causal-admission.ts"
import type {EnergyMF117PreflightReceipt} from "../energy/dissolve-live.ts"
import type {DarkCheckpointControl} from "./checkpoint/control.ts"
import type {DarkForceHistory, DarkForceHistoryStatus} from "./force/history.ts"
import type {ForceLifecycle} from "./force/lifecycle.ts"

const boundarySchema = "metafor/boundary-mf117-live/v1" as const
const energySchema = "metafor/energy-mf117-live/v1" as const
const bulkSchema = "metafor/bulk-mf117-live/v1" as const
const digestPattern = /^[0-9a-f]{64}$/

type RollbackManifest = {
  files: Array<{path: string; bytes: number; sha256: string}>
}

export type MF117LivePreflightReceipt = Readonly<{
  schema: typeof MF117_PREFLIGHT_SCHEMA
  receiptId: string
  generatedAt: string
  admissionId: string
  cut: Readonly<{cutId: string; sequence: number}>
  boundary: BoundaryMF117PreflightReceipt
  energy: EnergyMF117PreflightReceipt
  bulk: Readonly<{
    schema: typeof bulkSchema
    sourceRootTorus: {darkParticleId: number; outerDiameterMm: number}
    targetChildTorus: {darkParticleId: number; parentDarkParticleId: number}
    promotionReceiptSha256: string
    noGhostTorus: true
  }>
  rollback: Readonly<{
    files: 11
    manifestSha256: string
    darkFiles: 4
    boundaryFiles: 3
    massFiles: 4
    verified: true
  }>
  liveMutation: false
  activation: "not-started"
  retention: "retain-until-explicit-gc"
}>

export type MF117LiveCompletion = Readonly<{
  schema: "metafor/mf117-completion/v1"
  admissionId: string
  cutId: string
  preflightSequence: number
  finalSequence: number
  forceConsequences: number
  boundary: unknown
  energy: unknown
  bulk: unknown
  rollbackAvailable: true
  noDowntime: true
  retention: "retain-until-explicit-gc"
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

const sha256 = (value: unknown): string =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonicalValue(value)))
    .digest("hex")
const rawSha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex")

const regularBytes = (filename: string): Uint8Array => {
  const stat = lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Dark MF-117 evidence is not a regular file: ${filename}`)
  }
  return new Uint8Array(readFileSync(filename))
}

const durableJSON = (filename: string, value: unknown): void => {
  const directory = dirname(filename)
  mkdirSync(directory, {recursive: true, mode: 0o700})
  const temporary = join(directory, `.preflight.${process.pid}.${crypto.randomUUID()}.tmp`)
  const descriptor = openSync(temporary, "wx", 0o600)
  try {
    writeSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, undefined, "utf8")
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

const receipt = (
  value: Omit<MF117LivePreflightReceipt, "receiptId">,
): MF117LivePreflightReceipt =>
  Object.freeze({receiptId: sha256(value), ...value})

/**
 * Dark-owned exact coordinator. Read-only preflight completes before admission
 * closes. Once admission state exists, every failure stays fail-closed and the
 * same command resumes from durable Boundary/Energy receipts.
 */
export class MF117LiveCoordinator {
  readonly #preflightPath: string
  readonly #candidateDirectory: string
  #queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly lifecycle: ForceLifecycle,
    private readonly checkpoint: DarkCheckpointControl,
    private readonly history: Pick<DarkForceHistory, "status" | "read">,
    private readonly peer: MonadRpcPeer,
    options: {
      preflightPath?: string
      candidateDirectory?: string
    } = {},
  ) {
    this.#preflightPath = resolve(
      options.preflightPath ?? join(MF117_STATE_DIRECTORY, "preflight.json"),
    )
    this.#candidateDirectory = resolve(
      options.candidateDirectory ?? MF117_CANDIDATE_DIRECTORY,
    )
  }

  async preflight(): Promise<MF117LivePreflightReceipt> {
    return await this.#serialize(async () => {
      const force = this.lifecycle.status()
      const history = this.history.status()
      const frontier = this.checkpoint.barrier.frontier()
      if (
        !force.ok ||
        force.state !== "running" ||
        force.externalAdmission !== "open" ||
        frontier.phase !== "open" ||
        frontier.cutId !== history.cutId ||
        frontier.acceptanceSequence !== history.sequence ||
        frontier.domains.some(({sentOrdinal, appliedOrdinal}) =>
          sentOrdinal !== appliedOrdinal)
      ) throw new Error("MF-117 preflight requires one healthy open applied-through Force cut")
      const admissionId = `mf117-${sha256({
        operation: "inference-to-lada",
        cutId: history.cutId,
        sequence: history.sequence,
      })}`
      const boundary = await this.peer.call<BoundaryMF117PreflightReceipt>(
        "boundary",
        MF117_BOUNDARY_PREFLIGHT_METHOD,
        {
          schema: boundarySchema,
          admissionId,
          cutId: history.cutId,
          sequence: history.sequence,
        },
        {waitMs: 30_000},
      )
      if (
        boundary.schema !== boundarySchema ||
        boundary.admissionInput.admissionId !== admissionId ||
        boundary.admissionInput.plan.source.src !== MF117_SOURCE ||
        boundary.admissionInput.plan.target.src !== MF117_TARGET ||
        boundary.causalPlan.checkpoint.cutId !== history.cutId ||
        boundary.causalPlan.checkpoint.sequence !== history.sequence ||
        boundary.integrity.quickCheck !== "ok" ||
        boundary.integrity.foreignKeyViolations !== 0 ||
        boundary.rollback.verified !== true
      ) throw new Error("MF-117 Boundary preflight receipt is invalid")
      const energy = await this.peer.call<EnergyMF117PreflightReceipt>(
        "energy",
        MF117_ENERGY_PREFLIGHT_METHOD,
        {
          schema: energySchema,
          bindings: boundary.causalPlan.retainedBindings,
        },
        {waitMs: 30_000},
      )
      const expectedEvidence =
        boundary.admissionInput.plan.privateManifest.entries.map(({evidence}) =>
          evidence)
      if (
        energy.schema !== energySchema ||
        energy.source !== MF117_SOURCE ||
        energy.target !== MF117_TARGET ||
        energy.generations.length !== 5 ||
        JSON.stringify(energy.evidence) !== JSON.stringify(expectedEvidence) ||
        energy.rollback.verified !== true
      ) throw new Error("MF-117 Energy preflight receipt is invalid")
      const bulk = await this.peer.call<MF117LivePreflightReceipt["bulk"]>(
        "bulk",
        MF117_BULK_PREFLIGHT_METHOD,
        {
          schema: bulkSchema,
          promotion: boundary.admissionInput.promotionReceipt,
        },
        {waitMs: 30_000},
      )
      if (
        bulk.schema !== bulkSchema ||
        bulk.sourceRootTorus.darkParticleId !==
          boundary.admissionInput.plan.source.atom * 2 ||
        bulk.targetChildTorus.darkParticleId !==
          boundary.admissionInput.plan.target.atom * 2 ||
        bulk.targetChildTorus.parentDarkParticleId !==
          bulk.sourceRootTorus.darkParticleId ||
        bulk.promotionReceiptSha256 !==
          sha256(boundary.admissionInput.promotionReceipt) ||
        bulk.noGhostTorus !== true
      ) throw new Error("MF-117 Bulk torus preflight receipt is invalid")
      const rollback = this.#verifyDarkRollback(
        history,
        boundary.rollback.files,
        energy.rollback.files,
      )
      const finalForce = this.lifecycle.status()
      const finalHistory = this.history.status()
      const finalFrontier = this.checkpoint.barrier.frontier()
      if (
        !finalForce.ok ||
        finalForce.state !== "running" ||
        finalForce.externalAdmission !== "open" ||
        finalHistory.cutId !== history.cutId ||
        finalHistory.sequence !== history.sequence ||
        finalFrontier.phase !== "open" ||
        finalFrontier.cutId !== history.cutId ||
        finalFrontier.acceptanceSequence !== history.sequence ||
        finalFrontier.domains.some(({sentOrdinal, appliedOrdinal}) =>
          sentOrdinal !== appliedOrdinal)
      ) throw new Error("MF-117 current cut advanced during preflight")
      const body = {
        schema: MF117_PREFLIGHT_SCHEMA,
        generatedAt: new Date().toISOString(),
        admissionId,
        cut: {cutId: history.cutId, sequence: history.sequence},
        boundary,
        energy,
        bulk,
        rollback,
        liveMutation: false,
        activation: "not-started",
        retention: "retain-until-explicit-gc",
      } as const
      const result = receipt(body)
      durableJSON(this.#preflightPath, result)
      return result
    })
  }

  async activate(preflightReceiptId: string): Promise<MF117LiveCompletion> {
    return await this.#serialize(async () => {
      const preflight = this.#readPreflight(preflightReceiptId)
      let admission = await this.#boundaryReceipt(preflight.admissionId)
      if (admission?.phase === "complete") {
        return await this.#finish(preflight, admission)
      }
      const history = this.history.status()
      const force = this.lifecycle.status()
      if (
        history.cutId !== preflight.cut.cutId ||
        (admission === null && history.sequence !== preflight.cut.sequence) ||
        !force.ok ||
        force.state !== "running" ||
        (
          admission === null
            ? this.checkpoint.barrier.phase !== "open"
            : force.externalAdmission !== "closed"
        )
      ) throw new Error("MF-117 activation no longer matches its exact preflight cut")

      if (admission === null) {
        if (force.externalAdmission === "open") {
          this.lifecycle.closeExternalAdmission()
        }
        try {
          admission = await this.peer.call<BoundaryDissolveCausalAdmissionRecordV1>(
            "boundary",
            MF117_BOUNDARY_ADMIT_METHOD,
            {
              schema: boundarySchema,
              admissionInput: preflight.boundary.admissionInput,
            },
            {waitMs: 30_000},
          )
        } catch (error) {
          let recovered: BoundaryDissolveCausalAdmissionRecordV1 | null
          try {
            recovered = await this.#boundaryReceipt(preflight.admissionId)
          } catch {
            // Without a readable durable receipt the only safe state is closed.
            throw error
          }
          if (recovered === null) {
            this.lifecycle.openExternalAdmission()
            throw error
          }
          admission = recovered
        }
      }
      if (admission.phase === "admitted") {
        const frontier = await this.checkpoint.holdUnderClosedAdmission()
        const energy = await this.peer.call<{
          binding: unknown
        }>(
          "energy",
          MF117_ENERGY_FENCE_METHOD,
          {
            schema: energySchema,
            admission,
            generations: preflight.energy.generations,
          },
          {waitMs: 30_000},
        )
        admission = await this.peer.call<BoundaryDissolveCausalAdmissionRecordV1>(
          "boundary",
          MF117_BOUNDARY_QUIESCENT_METHOD,
          {
            schema: boundarySchema,
            admissionId: admission.admissionId,
            frontier,
            energy: energy.binding,
          },
          {waitMs: 30_000},
        )
      }

      const committed = await this.peer.call<BoundaryMF117CommitReceipt>(
        "boundary",
        MF117_BOUNDARY_COMMIT_METHOD,
        {
          schema: boundarySchema,
          admissionInput: preflight.boundary.admissionInput,
        },
        {waitMs: 30_000},
      )
      admission = committed.admission
      if (this.checkpoint.barrier.phase === "held") {
        this.checkpoint.releaseAdmissionHold()
      }

      const energy = await this.peer.call<{
        binding: unknown
      }>(
        "energy",
        MF117_ENERGY_RETARGET_METHOD,
        {schema: energySchema, admission},
        {waitMs: 30_000},
      )
      admission = await this.#complete(
        admission,
        this.#step(admission, "energy-retarget").ordinal,
        energy.binding,
      )

      const forceSteps = admission.plan.postCommit.filter(
        (step): step is Extract<BoundaryDissolvePostCommitStepV1, {kind: "force-entity"}> =>
          step.kind === "force-entity",
      )
      if (forceSteps.length !== committed.consequences.length) {
        throw new Error("MF-117 Boundary consequence count changed")
      }
      for (let index = 0; index < forceSteps.length; index += 1) {
        const step = forceSteps[index]!
        if (admission.completedPostCommitOrdinals.includes(step.ordinal)) continue
        const consequence = committed.consequences[index]!
        let accepted = this.history.read({
          fromSequence: preflight.cut.sequence + 1,
          part: consequence.part,
          op: consequence.op,
          by: "boundary",
          path: consequence.path,
          limit: 2,
        })
        if (accepted.length > 1) {
          throw new Error(`MF-117 duplicate Force consequence exists: ${step.entity.path}`)
        }
        if (accepted.length === 0) {
          const decision = await this.lifecycle.acceptParticle(
            "boundary",
            {
              parts: [{...consequence, by: "boundary"}],
            } as SourcedForceMessage,
          )
          if (!decision.ok) throw new Error(decision.error)
          accepted = this.history.read({
            fromSequence: preflight.cut.sequence + 1,
            part: consequence.part,
            op: consequence.op,
            by: "boundary",
            path: consequence.path,
            limit: 2,
          })
        }
        if (
          accepted.length !== 1 ||
          JSON.stringify(accepted[0]!.particle.value) !==
            JSON.stringify(consequence.value)
        ) throw new Error(`MF-117 Force consequence receipt is invalid: ${step.entity.path}`)
        admission = await this.#complete(
          admission,
          step.ordinal,
          accepted[0]!.id,
        )
      }

      const bulk = await this.peer.call<{receiptId: string}>(
        "bulk",
        MF117_BULK_PROMOTE_METHOD,
        {
          schema: bulkSchema,
          promotion: preflight.boundary.admissionInput.promotionReceipt,
        },
        {waitMs: 30_000},
      )
      admission = await this.#complete(
        admission,
        this.#step(admission, "bulk-promote").ordinal,
        bulk.receiptId,
      )
      admission = await this.#complete(
        admission,
        this.#step(admission, "retain-evidence").ordinal,
        preflight.rollback.manifestSha256,
      )
      admission = await this.#complete(
        admission,
        this.#step(admission, "release-admission").ordinal,
        sha256({admissionId: admission.admissionId, effect: "release-admission"}),
      )
      this.lifecycle.openExternalAdmission()
      return await this.#finish(preflight, admission)
    })
  }

  async #finish(
    preflight: MF117LivePreflightReceipt,
    admission: BoundaryDissolveCausalAdmissionRecordV1,
  ): Promise<MF117LiveCompletion> {
    if (this.checkpoint.barrier.phase === "held") {
      this.checkpoint.releaseAdmissionHold()
    }
    if (this.lifecycle.status().externalAdmission === "closed") {
      this.lifecycle.openExternalAdmission()
    }
    const [boundary, energy, bulk] = await Promise.all([
      this.peer.call(
        "boundary",
        MF117_BOUNDARY_VERIFY_METHOD,
        {
          schema: boundarySchema,
          admissionInput: preflight.boundary.admissionInput,
        },
        {waitMs: 30_000},
      ),
      this.peer.call(
        "energy",
        MF117_ENERGY_VERIFY_METHOD,
        {schema: energySchema},
        {waitMs: 30_000},
      ),
      this.peer.call(
        "bulk",
        MF117_BULK_VERIFY_METHOD,
        {schema: bulkSchema},
        {waitMs: 30_000},
      ),
    ])
    const current = await this.#boundaryReceipt(admission.admissionId)
    const force = this.lifecycle.status()
    const history = this.history.status()
    if (
      current?.phase !== "complete" ||
      current.externalAdmission !== "open" ||
      !force.ok ||
      force.externalAdmission !== "open" ||
      history.cutId !== preflight.cut.cutId
    ) throw new Error("MF-117 completion health receipt is invalid")
    this.#verifyDarkRollback(
      {cutId: preflight.cut.cutId, sequence: preflight.cut.sequence} as DarkForceHistoryStatus,
      preflight.boundary.rollback.files,
      preflight.energy.rollback.files,
    )
    return Object.freeze({
      schema: "metafor/mf117-completion/v1",
      admissionId: admission.admissionId,
      cutId: history.cutId,
      preflightSequence: preflight.cut.sequence,
      finalSequence: history.sequence,
      forceConsequences: admission.plan.postCommit.filter(({kind}) =>
        kind === "force-entity").length,
      boundary,
      energy,
      bulk,
      rollbackAvailable: true,
      noDowntime: true,
      retention: "retain-until-explicit-gc",
    })
  }

  async #complete(
    admission: BoundaryDissolveCausalAdmissionRecordV1,
    ordinal: number,
    effect: unknown,
  ): Promise<BoundaryDissolveCausalAdmissionRecordV1> {
    if (admission.completedPostCommitOrdinals.includes(ordinal)) return admission
    return await this.peer.call<BoundaryDissolveCausalAdmissionRecordV1>(
      "boundary",
      MF117_BOUNDARY_COMPLETE_METHOD,
      {
        schema: boundarySchema,
        admissionId: admission.admissionId,
        ordinal,
        effect,
      },
      {waitMs: 30_000},
    )
  }

  #step(
    admission: BoundaryDissolveCausalAdmissionRecordV1,
    kind: BoundaryDissolvePostCommitStepV1["kind"],
  ): BoundaryDissolvePostCommitStepV1 {
    const step = admission.plan.postCommit.find((entry) => entry.kind === kind)
    if (!step) throw new Error(`MF-117 causal step is missing: ${kind}`)
    return step
  }

  async #boundaryReceipt(
    admissionId: string,
  ): Promise<BoundaryDissolveCausalAdmissionRecordV1 | null> {
    return await this.peer.call<BoundaryDissolveCausalAdmissionRecordV1 | null>(
      "boundary",
      MF117_BOUNDARY_RECEIPT_METHOD,
      {schema: boundarySchema, admissionId},
      {waitMs: 30_000},
    )
  }

  #readPreflight(receiptId: string): MF117LivePreflightReceipt {
    if (!digestPattern.test(receiptId) || !existsSync(this.#preflightPath)) {
      throw new Error("MF-117 preflight receipt is unavailable")
    }
    const value = JSON.parse(
      new TextDecoder("utf8", {fatal: true}).decode(
        regularBytes(this.#preflightPath),
      ),
    ) as MF117LivePreflightReceipt
    const {receiptId: stored, ...body} = value
    if (
      stored !== receiptId ||
      stored !== sha256(body) ||
      value.schema !== MF117_PREFLIGHT_SCHEMA ||
      value.liveMutation !== false ||
      value.activation !== "not-started" ||
      value.boundary.admissionInput.plan.source.src !== MF117_SOURCE ||
      value.boundary.admissionInput.plan.target.src !== MF117_TARGET
    ) throw new Error("MF-117 preflight receipt is corrupt")
    return value
  }

  #verifyDarkRollback(
    history: Pick<DarkForceHistoryStatus, "cutId" | "sequence">,
    boundaryFiles: number,
    massFiles: number,
  ): MF117LivePreflightReceipt["rollback"] {
    const manifestPath = join(this.#candidateDirectory, "rollback-manifest.json")
    const manifestBytes = regularBytes(manifestPath)
    const manifest = JSON.parse(
      new TextDecoder("utf8", {fatal: true}).decode(manifestBytes),
    ) as RollbackManifest
    const files = manifest.files?.filter(({path}) =>
      path === "rollback/checkpoint-control.json" ||
      path === "rollback/history/catalog.json" ||
      path === "rollback/history/manifest.json" ||
      /^rollback\/history\/segments\/[0-9]{20}\.ndjson$/.test(path))
    if (
      !files ||
      files.length !== 4 ||
      boundaryFiles !== 3 ||
      massFiles !== 4 ||
      history.cutId !== this.history.status().cutId ||
      history.sequence > this.history.status().sequence
    ) throw new Error("Dark MF-117 rollback binding is incomplete")
    for (const entry of files) {
      const bytes = regularBytes(join(this.#candidateDirectory, entry.path))
      if (
        !Number.isSafeInteger(entry.bytes) ||
        bytes.byteLength !== entry.bytes ||
        !digestPattern.test(entry.sha256) ||
        rawSha256(bytes) !== entry.sha256
      ) throw new Error(`Dark MF-117 rollback digest changed: ${entry.path}`)
    }
    const rollbackHistory = jsonFile<{
      cutId: string
      segments: Array<{lastSequence: number}>
    }>(join(this.#candidateDirectory, "rollback", "history", "catalog.json"))
    const rollbackControl = jsonFile<{
      barrier: {cutId: string; acceptanceSequence: number}
    }>(join(this.#candidateDirectory, "rollback", "checkpoint-control.json"))
    const rollbackSequence = rollbackHistory.segments.at(-1)?.lastSequence ?? 0
    if (
      rollbackHistory.cutId !== history.cutId ||
      rollbackSequence !== history.sequence ||
      rollbackControl.barrier.cutId !== history.cutId ||
      rollbackControl.barrier.acceptanceSequence !== history.sequence
    ) throw new Error("Dark MF-117 rollback is not the exact preflight cut")
    return Object.freeze({
      files: 11,
      manifestSha256: rawSha256(manifestBytes),
      darkFiles: 4,
      boundaryFiles: 3,
      massFiles: 4,
      verified: true,
    })
  }

  async #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.#queue.then(operation)
    this.#queue = task.then(() => undefined, () => undefined)
    return await task
  }
}

const jsonFile = <T>(filename: string): T =>
  JSON.parse(
    new TextDecoder("utf8", {fatal: true}).decode(regularBytes(filename)),
  ) as T
