import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs"
import {createHash} from "node:crypto"
import {dirname, join, resolve} from "node:path"
import {
  BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
} from "boundary/dissolve-candidate-staging.ts"
import type {
  BoundaryDissolveCausalAdmissionRecordV1,
  BoundaryEnergyDissolveFenceBindingV1,
  BoundaryEnergyDissolveRetargetBindingV1,
} from "boundary/dissolve-causal-admission.ts"

export const ENERGY_DISSOLVE_RETARGET_V1 =
  "metafor/energy-dissolve-retarget/v1" as const

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

export type EnergyDissolveSourceGenerations = readonly [
  number,
  number,
  number,
  number,
  number,
]

export type EnergyDissolveRetargetHandleV1 = Readonly<{
  ordinal: number
  entryId: string
  source: Readonly<{
    atom: number
    declaration: number
    authoredKey: string
    globalKey: string
    generation: number
  }>
  target: Readonly<{
    atom: number
    declaration: number
    authoredKey: string
    globalKey: string
    previousGlobalKey: string
  }>
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

export type EnergyDissolveRetargetRequestV1 = Readonly<{
  schema: typeof ENERGY_DISSOLVE_RETARGET_V1
  admissionId: string
  admissionReceiptId: string
  stageId: string
  stageReceiptId: string
  checkpoint: BoundaryDissolveCausalAdmissionRecordV1["plan"]["checkpoint"]
  planSha256: string
  handles: readonly [
    EnergyDissolveRetargetHandleV1,
    EnergyDissolveRetargetHandleV1,
    EnergyDissolveRetargetHandleV1,
    EnergyDissolveRetargetHandleV1,
    EnergyDissolveRetargetHandleV1,
  ]
  retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
  deletePolicy: "forbidden"
  releasePolicy: "source-fence-retained"
}>

export type EnergyDissolveRetargetEntryV1 = Readonly<{
  handle: EnergyDissolveRetargetHandleV1
  status: "pending" | "fenced" | "retargeted"
  targetGeneration: number | null
}>

export type EnergyDissolveRetargetReceiptV1 = Readonly<{
  schema: typeof ENERGY_DISSOLVE_RETARGET_V1
  receiptId: string
  stateSha256: string
  phase: "pending" | "fencing" | "fenced" | "retargeting" | "retargeted"
  request: EnergyDissolveRetargetRequestV1
  entries: readonly EnergyDissolveRetargetEntryV1[]
  commitReceiptId: string | null
  retention: typeof BOUNDARY_DISSOLVE_CANDIDATE_RETENTION
}>

export type EnergyDissolveRetargetHooks = Readonly<{
  /**
   * Must be idempotent for the stable entryId. Replaying it after reopen
   * reasserts a process-local fence that may have been lost in a crash.
   */
  fence(
    handle: EnergyDissolveRetargetHandleV1,
    entryId: string,
  ): Promise<void>
  /**
   * Must return the same target generation when replayed with the same
   * entryId. No delete or source-fence release callback is part of this API.
   */
  retarget(
    handle: EnergyDissolveRetargetHandleV1,
    entryId: string,
  ): Promise<Readonly<{targetGeneration: number}>>
}>

export type EnergyDissolveRetargetErrorCode =
  | "invalid_request"
  | "receipt_conflict"
  | "not_fenced"
  | "commit_required"
  | "stale_commit"
  | "generation_conflict"
  | "receipt_corrupt"

export class EnergyDissolveRetargetError extends Error {
  override readonly name = "EnergyDissolveRetargetError"

  constructor(
    readonly code: EnergyDissolveRetargetErrorCode,
    message: string,
  ) {
    super(message)
  }
}

const fail = (
  code: EnergyDissolveRetargetErrorCode,
  message: string,
): never => {
  throw new EnergyDissolveRetargetError(code, message)
}

const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0

const expectedEntryId = (
  admissionReceiptId: string,
  handle: EnergyDissolveRetargetHandleV1,
): string => {
  const {entryId: _entryId, ...body} = handle
  return sha256({admissionReceiptId, ...body})
}

export const buildEnergyDissolveRetargetRequest = (
  admission: BoundaryDissolveCausalAdmissionRecordV1,
  generations: EnergyDissolveSourceGenerations,
): EnergyDissolveRetargetRequestV1 => {
  if (
    admission.phase !== "admitted" ||
    admission.externalAdmission !== "closed" ||
    admission.plan.retainedBindings.length !== 5 ||
    !Array.isArray(generations) ||
    generations.length !== 5 ||
    generations.some((generation) => !positive(generation))
  ) return fail("invalid_request", "Energy dissolve request requires one exact admitted five-handle plan")

  const handles = admission.plan.retainedBindings.map((binding, index) => {
    const body = {
      ordinal: index + 1,
      source: {
        atom: binding.sourceAtom,
        declaration: binding.sourceDeclaration,
        authoredKey: binding.sourceAuthoredKey,
        globalKey: binding.sourceGlobalKey,
        generation: generations[index]!,
      },
      target: {
        atom: binding.targetAtom,
        declaration: binding.targetDeclaration,
        authoredKey: binding.targetAuthoredKey,
        globalKey: binding.sourceGlobalKey,
        previousGlobalKey: binding.targetPreviousGlobalKey,
      },
      format: binding.format,
      dependentBindings: binding.dependentBindings,
      retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
    } as const
    return Object.freeze({entryId: sha256({
      admissionReceiptId: admission.receiptId,
      ...body,
    }), ...body})
  }) as unknown as EnergyDissolveRetargetRequestV1["handles"]

  return Object.freeze({
    schema: ENERGY_DISSOLVE_RETARGET_V1,
    admissionId: admission.admissionId,
    admissionReceiptId: admission.receiptId,
    stageId: admission.plan.stageId,
    stageReceiptId: admission.plan.stageReceiptId,
    checkpoint: structuredClone(admission.plan.checkpoint),
    planSha256: admission.plan.structuralPlanSha256,
    handles,
    retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
    deletePolicy: "forbidden",
    releasePolicy: "source-fence-retained",
  })
}

const receiptFromBody = (
  body: Omit<EnergyDissolveRetargetReceiptV1, "stateSha256">,
): EnergyDissolveRetargetReceiptV1 =>
  Object.freeze({stateSha256: sha256(body), ...body})

const initialReceipt = (
  request: EnergyDissolveRetargetRequestV1,
): EnergyDissolveRetargetReceiptV1 => receiptFromBody({
  schema: ENERGY_DISSOLVE_RETARGET_V1,
  receiptId: sha256(request),
  phase: "pending",
  request,
  entries: Object.freeze(request.handles.map((handle) => Object.freeze({
    handle,
    status: "pending" as const,
    targetGeneration: null,
  }))),
  commitReceiptId: null,
  retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
})

const validateReceipt = (
  value: unknown,
): EnergyDissolveRetargetReceiptV1 => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("stateSha256" in value) ||
    typeof value.stateSha256 !== "string" ||
    !("receiptId" in value) ||
    typeof value.receiptId !== "string" ||
    !("request" in value) ||
    typeof value.request !== "object" ||
    value.request === null ||
    !("entries" in value) ||
    !Array.isArray(value.entries) ||
    value.entries.length !== 5 ||
    !("schema" in value) ||
    value.schema !== ENERGY_DISSOLVE_RETARGET_V1 ||
    !digestPattern.test(value.receiptId) ||
    !digestPattern.test(value.stateSha256)
  ) return fail("receipt_corrupt", "Energy dissolve receipt shape is invalid")
  const receipt = value as EnergyDissolveRetargetReceiptV1
  const {stateSha256, ...body} = receipt
  const statuses = receipt.entries.map(({status}) => status)
  const phaseConsistent =
    (
      receipt.phase === "pending" &&
      statuses.every((status) => status === "pending") &&
      receipt.commitReceiptId === null
    ) ||
    (
      receipt.phase === "fencing" &&
      statuses.every((status) => status !== "retargeted") &&
      receipt.commitReceiptId === null
    ) ||
    (
      receipt.phase === "fenced" &&
      statuses.every((status) => status === "fenced") &&
      receipt.commitReceiptId === null
    ) ||
    (
      receipt.phase === "retargeting" &&
      statuses.every((status) => status !== "pending") &&
      typeof receipt.commitReceiptId === "string" &&
      digestPattern.test(receipt.commitReceiptId)
    ) ||
    (
      receipt.phase === "retargeted" &&
      statuses.every((status) => status === "retargeted") &&
      typeof receipt.commitReceiptId === "string" &&
      digestPattern.test(receipt.commitReceiptId)
    )
  if (
    stateSha256 !== sha256(body) ||
    !phaseConsistent ||
    receipt.receiptId !== sha256(receipt.request) ||
    receipt.request.schema !== ENERGY_DISSOLVE_RETARGET_V1 ||
    receipt.request.handles.length !== 5 ||
    receipt.request.retention !== BOUNDARY_DISSOLVE_CANDIDATE_RETENTION ||
    receipt.request.deletePolicy !== "forbidden" ||
    receipt.request.releasePolicy !== "source-fence-retained" ||
    receipt.retention !== BOUNDARY_DISSOLVE_CANDIDATE_RETENTION ||
    receipt.entries.some((entry, index) =>
      canonicalJSON(entry.handle) !==
        canonicalJSON(receipt.request.handles[index]) ||
      entry.handle.ordinal !== index + 1 ||
      entry.handle.target.globalKey !== entry.handle.source.globalKey ||
      entry.handle.entryId !== expectedEntryId(
        receipt.request.admissionReceiptId,
        entry.handle,
      ) ||
      !positive(entry.handle.source.generation) ||
      !["pending", "fenced", "retargeted"].includes(entry.status) ||
      (
        entry.status === "retargeted"
          ? !positive(entry.targetGeneration)
          : entry.targetGeneration !== null
      ))
  ) return fail("receipt_corrupt", "Energy dissolve receipt digest or entries are invalid")
  return Object.freeze(receipt)
}

const durableWrite = (
  filename: string,
  receipt: EnergyDissolveRetargetReceiptV1,
): void => {
  const directory = dirname(filename)
  mkdirSync(directory, {recursive: true, mode: 0o700})
  const temporary = join(
    directory,
    `.dissolve-retarget.${process.pid}.${crypto.randomUUID()}.tmp`,
  )
  const descriptor = openSync(temporary, "wx", 0o600)
  try {
    writeSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`, undefined, "utf8")
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  try {
    renameSync(temporary, filename)
    const parent = openSync(directory, "r")
    try {
      fsyncSync(parent)
    } finally {
      closeSync(parent)
    }
  } finally {
    if (existsSync(temporary)) rmSync(temporary)
  }
}

const readReceipt = (filename: string): EnergyDissolveRetargetReceiptV1 => {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(filename, "utf8")) as unknown
  } catch {
    throw new EnergyDissolveRetargetError(
      "receipt_corrupt",
      `Energy dissolve receipt cannot be read: ${filename}`,
    )
  }
  return validateReceipt(value)
}

/**
 * Private durable Energy service state for one causal dissolve admission.
 *
 * It owns no RPC endpoint and has no Mass filesystem mutation or delete path.
 */
export class DurableEnergyDissolveRetarget {
  readonly filename: string
  #receipt: EnergyDissolveRetargetReceiptV1
  #queue: Promise<void> = Promise.resolve()

  private constructor(
    filename: string,
    receipt: EnergyDissolveRetargetReceiptV1,
  ) {
    this.filename = resolve(filename)
    this.#receipt = receipt
  }

  static prepare(
    filename: string,
    request: EnergyDissolveRetargetRequestV1,
  ): DurableEnergyDissolveRetarget {
    const target = resolve(filename)
    const expected = initialReceipt(request)
    if (existsSync(target)) {
      const current = readReceipt(target)
      if (canonicalJSON(current.request) !== canonicalJSON(request)) {
        return fail("receipt_conflict", "Energy dissolve receipt already binds different evidence")
      }
      return new DurableEnergyDissolveRetarget(target, current)
    }
    durableWrite(target, expected)
    return new DurableEnergyDissolveRetarget(target, expected)
  }

  static open(filename: string): DurableEnergyDissolveRetarget {
    const target = resolve(filename)
    return new DurableEnergyDissolveRetarget(target, readReceipt(target))
  }

  receipt(): EnergyDissolveRetargetReceiptV1 {
    return structuredClone(this.#receipt)
  }

  async fence(
    hooks: Pick<EnergyDissolveRetargetHooks, "fence">,
  ): Promise<EnergyDissolveRetargetReceiptV1> {
    return await this.#serialize(async () => {
      if (this.#receipt.phase === "retargeting" || this.#receipt.phase === "retargeted") {
        return this.receipt()
      }
      await this.#persist({...this.#receipt, phase: "fencing"})
      for (let index = 0; index < this.#receipt.entries.length; index += 1) {
        const entry = this.#receipt.entries[index]!
        await hooks.fence(entry.handle, entry.handle.entryId)
        if (entry.status === "pending") {
          const entries = this.#receipt.entries.map((candidate, candidateIndex) =>
            candidateIndex === index
              ? Object.freeze({...candidate, status: "fenced" as const})
              : candidate)
          await this.#persist({...this.#receipt, entries: Object.freeze(entries)})
        }
      }
      await this.#persist({...this.#receipt, phase: "fenced"})
      return this.receipt()
    })
  }

  fenceBinding(): BoundaryEnergyDissolveFenceBindingV1 {
    if (this.#receipt.phase !== "fenced") {
      return fail("not_fenced", "Energy dissolve handles are not completely fenced")
    }
    return Object.freeze({
      schema: "metafor/energy-dissolve-fence-binding/v1",
      receiptId: this.#receipt.receiptId,
      receiptSha256: this.#receipt.stateSha256,
      admissionId: this.#receipt.request.admissionId,
      admissionReceiptId: this.#receipt.request.admissionReceiptId,
      stageId: this.#receipt.request.stageId,
      stageReceiptId: this.#receipt.request.stageReceiptId,
      planSha256: this.#receipt.request.planSha256,
      phase: "fenced",
      handleCount: 5,
    })
  }

  retargetBinding(): BoundaryEnergyDissolveRetargetBindingV1 {
    if (
      this.#receipt.phase !== "retargeted" ||
      this.#receipt.commitReceiptId === null
    ) return fail("commit_required", "Energy dissolve handles are not retargeted")
    return Object.freeze({
      schema: "metafor/energy-dissolve-retarget-binding/v1",
      receiptId: this.#receipt.receiptId,
      receiptSha256: this.#receipt.stateSha256,
      admissionId: this.#receipt.request.admissionId,
      stageId: this.#receipt.request.stageId,
      stageReceiptId: this.#receipt.request.stageReceiptId,
      planSha256: this.#receipt.request.planSha256,
      commitReceiptId: this.#receipt.commitReceiptId,
      phase: "retargeted",
      handleCount: 5,
    })
  }

  async retargetAfterCommit(
    admission: BoundaryDissolveCausalAdmissionRecordV1,
    hooks: Pick<EnergyDissolveRetargetHooks, "retarget">,
  ): Promise<EnergyDissolveRetargetReceiptV1> {
    return await this.#serialize(async () => {
      if (!admission.commit || (admission.phase !== "committed" && admission.phase !== "complete")) {
        return fail("commit_required", "Energy retarget requires an exact Boundary commit receipt")
      }
      const request = this.#receipt.request
      if (
        admission.admissionId !== request.admissionId ||
        admission.plan.stageId !== request.stageId ||
        admission.plan.stageReceiptId !== request.stageReceiptId ||
        admission.plan.structuralPlanSha256 !== request.planSha256 ||
        admission.commit.stageId !== request.stageId ||
        admission.commit.stageReceiptId !== request.stageReceiptId ||
        admission.commit.planId !== admission.plan.planId
      ) return fail("stale_commit", "Boundary commit does not match the Energy fence receipt")
      if (
        this.#receipt.entries.some((entry) => entry.status === "pending") ||
        !["fenced", "retargeting", "retargeted"].includes(this.#receipt.phase)
      ) return fail("not_fenced", "Energy retarget cannot start before all five fences")

      await this.#persist({
        ...this.#receipt,
        phase: "retargeting",
        commitReceiptId: admission.commit.commitReceiptId,
      })
      for (let index = 0; index < this.#receipt.entries.length; index += 1) {
        const entry = this.#receipt.entries[index]!
        const result = await hooks.retarget(entry.handle, entry.handle.entryId)
        if (!positive(result.targetGeneration)) {
          return fail("generation_conflict", "Energy retarget returned an invalid target generation")
        }
        if (
          entry.targetGeneration !== null &&
          entry.targetGeneration !== result.targetGeneration
        ) return fail("generation_conflict", "Energy retarget replay changed target generation")
        if (entry.status !== "retargeted") {
          const entries = this.#receipt.entries.map((candidate, candidateIndex) =>
            candidateIndex === index
              ? Object.freeze({
                ...candidate,
                status: "retargeted" as const,
                targetGeneration: result.targetGeneration,
              })
              : candidate)
          await this.#persist({...this.#receipt, entries: Object.freeze(entries)})
        }
      }
      await this.#persist({...this.#receipt, phase: "retargeted"})
      return this.receipt()
    })
  }

  async #persist(
    next: Omit<EnergyDissolveRetargetReceiptV1, "stateSha256"> & {
      stateSha256?: string
    },
  ): Promise<void> {
    const {stateSha256: _ignored, ...body} = next
    const receipt = receiptFromBody(body)
    durableWrite(this.filename, receipt)
    this.#receipt = receipt
  }

  async #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.#queue.then(operation)
    this.#queue = task.then(() => undefined, () => undefined)
    return await task
  }
}
