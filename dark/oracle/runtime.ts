import {
  META_FIELD_VALUE_APPLY_METHOD,
  META_OBSERVATION_CONTRACT_VERSION,
  META_PROCESS_EXECUTION_READ_METHOD,
  validateMetaFieldValueApplyRequest,
  validateMetaProcessExecutionReadRequest,
  type MetaCausalFrontier,
  type MetaFieldValueApplyReceipt,
  type MetaProcessExecutionOutcome,
  type MetaProcessExecutionReadReceipt,
  type MetaProcessExecutionStatus,
} from "@metafor/types/metafor/observation"
import type {MetaForceAcceptanceIdentity} from "@metafor/types/metafor/authoring"
import {
  BOUNDARY_FIELD_VALUE_PLAN_METHOD,
  BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD,
  type BoundaryProcessExecutionProjection,
} from "@metafor/types/boundary/runtime"
import type {ForceMessageInput} from "shared/protocol/force/message"
import type {DarkForceHistory, DarkForceHistoryParticle} from "../force/history.ts"
import type {ForceLifecycle} from "../force/lifecycle.ts"
import type {OracleRpcPeer} from "shared/transport/oracle"

type RuntimePeer = Pick<OracleRpcPeer, "call">
type RuntimeHistory = Pick<DarkForceHistory, "read" | "status">
type RuntimeIngress = Pick<ForceLifecycle, "acceptAgentParticleAtFrontier">

const invalid = (issues: Array<{path: string; code: string; message: string}>): Error =>
  new Error(issues.map(({path, code, message}) => `${path || "/"} [${code}] ${message}`).join("; "))

const acceptanceIdentity = (entry: DarkForceHistoryParticle): MetaForceAcceptanceIdentity => {
  const separator = entry.id.lastIndexOf(":")
  if (separator <= 0 || entry.id.slice(separator + 1) !== String(entry.sequence)) {
    throw new Error("Dark Force history contains an invalid acceptance identity")
  }
  return {cutId: entry.id.slice(0, separator), sequence: entry.sequence, id: entry.id}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const plannedFieldParticle = (value: unknown): ForceMessageInput => {
  if (!isRecord(value) || !Array.isArray(value.parts) || value.parts.length !== 1) {
    throw new Error("Boundary returned an invalid Field Particle plan")
  }
  const part = value.parts[0]
  if (!isRecord(part) || (part.part !== "gluon" && part.part !== "higgs") || part.op !== "replace" ||
      typeof part.path !== "number" || !Number.isSafeInteger(part.path) || part.path <= 0 || part.from !== undefined ||
      typeof part.ts !== "number" || !Number.isSafeInteger(part.ts) || part.ts < 0 ||
      !isRecord(part.value) || !isRecord(part.value.fields) || Object.keys(part.value.fields).length !== 1) {
    throw new Error("Boundary returned an invalid Field Particle plan")
  }
  return structuredClone(value) as unknown as ForceMessageInput
}

const projection = (value: unknown): BoundaryProcessExecutionProjection => {
  if (!isRecord(value) || !Object.hasOwn(value, "status") || !Object.hasOwn(value, "outcome") || Object.keys(value).length !== 2) {
    throw new Error("Boundary returned an invalid Process execution projection")
  }
  const statuses = new Set<MetaProcessExecutionStatus>(["pending", "committed", "failed", "superseded"])
  if (!statuses.has(value.status as MetaProcessExecutionStatus)) {
    throw new Error("Boundary returned an invalid Process execution status")
  }
  if (value.outcome !== null && !isRecord(value.outcome)) {
    throw new Error("Boundary returned an invalid Process execution outcome")
  }
  return structuredClone(value) as BoundaryProcessExecutionProjection
}

export class MetaRuntimeRpcService {
  constructor(
    private readonly history: RuntimeHistory,
    private readonly ingress: RuntimeIngress,
    private readonly peer: RuntimePeer,
  ) {}

  async applyFieldValue(input: unknown): Promise<MetaFieldValueApplyReceipt> {
    const validation = validateMetaFieldValueApplyRequest(input)
    if (!validation.ok) throw invalid(validation.issues)
    const request = validation.value
    const plan = plannedFieldParticle(await this.peer.call(
      "boundary",
      BOUNDARY_FIELD_VALUE_PLAN_METHOD,
      request,
    ))
    const decision = await this.ingress.acceptAgentParticleAtFrontier(plan, request.expectedFrontier)
    if (!decision.ok) throw new Error(decision.error)
    if (decision.acceptance.cutId !== request.expectedFrontier.cutId ||
        decision.acceptance.sequence !== request.expectedFrontier.throughSequence + 1) {
      throw new Error("Dark Force returned a non-contiguous Field acceptance identity")
    }
    return {
      contractVersion: META_OBSERVATION_CONTRACT_VERSION,
      resolution: "exact",
      atom: structuredClone(request.atom),
      field: request.field,
      acceptance: structuredClone(decision.acceptance),
      frontier: this.frontier(),
    }
  }

  async readProcessExecution(input: unknown): Promise<MetaProcessExecutionReadReceipt> {
    const validation = validateMetaProcessExecutionReadRequest(input)
    if (!validation.ok) throw invalid(validation.issues)
    const request = validation.value
    const current = projection(await this.peer.call(
      "boundary",
      BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD,
      request,
    ))
    const registration = this.history.read({
      part: "photon",
      op: "test",
      from: request.execution,
      limit: 2,
    })
    if (registration.length !== 1) {
      throw new Error(`Dark Force history cannot resolve one Process execution acceptance: ${request.execution}`)
    }
    let settlement: MetaForceAcceptanceIdentity | null = null
    if (current.status === "committed" || current.status === "failed") {
      const settled = this.history.read({
        part: current.status === "committed" ? "w+" : "w-",
        op: "copy",
        from: request.execution,
        limit: 2,
      })
      if (settled.length !== 1) {
        throw new Error(`Dark Force history cannot resolve one Process execution settlement: ${request.execution}`)
      }
      settlement = acceptanceIdentity(settled[0]!)
    }
    if ((current.status === "committed" || current.status === "failed") !== (current.outcome !== null)) {
      throw new Error(`Boundary Process execution outcome disagrees with status: ${request.execution}`)
    }
    return {
      contractVersion: META_OBSERVATION_CONTRACT_VERSION,
      resolution: "exact",
      atom: structuredClone(request.atom),
      process: request.process,
      execution: request.execution,
      status: current.status,
      acceptance: acceptanceIdentity(registration[0]!),
      settlement,
      outcome: current.outcome === null ? null : structuredClone(current.outcome) as MetaProcessExecutionOutcome,
      frontier: this.frontier(),
    }
  }

  private frontier(): MetaCausalFrontier {
    const status = this.history.status()
    return {
      cutId: status.cutId,
      throughSequence: status.sequence,
      retroactiveComplete: false,
    }
  }
}

export {META_FIELD_VALUE_APPLY_METHOD, META_PROCESS_EXECUTION_READ_METHOD}
