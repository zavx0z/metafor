import type {ForceMessageInput} from "shared/protocol/force/message"
import {resolveForceFieldId} from "shared/protocol/force/fields"
import {
  validateMetaFieldValueApplyRequest,
  validateMetaFieldsValueApplyRequest,
  validateMetaProcessExecutionReadRequest,
  type MetaFieldValueApplyRequest,
  type MetaProcessExecutionOutcome,
  type MetaProcessExecutionReadRequest,
  type MetaProcessExecutionStatus,
} from "shared/protocol/metafor/observation"
import type {JsonValue} from "@metafor/types/metafor/graph"
import type {BoundaryProcessExecutionProjection} from "shared/protocol/boundary/runtime"
import type {BoundaryDatabase} from "./sqlite.ts"
import {resolveBoundaryRuntimeAtom} from "./graph/runtime.ts"
import {boundaryFieldValueMatches, validateBoundaryFieldValues} from "./field-values"
import type {BoundaryFieldsValuePlan} from "shared/protocol/boundary/runtime"

const invalid = (issues: Array<{path: string; code: string; message: string}>): Error =>
  new Error(issues.map(({path, code, message}) => `${path || "/"} [${code}] ${message}`).join("; "))

const isJson = (value: unknown, ancestors = new Set<object>()): value is JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object" || ancestors.has(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) return false
  } else if (prototype !== Object.prototype && prototype !== null) return false
  ancestors.add(value)
  try {
    return Object.values(value).every((entry) => isJson(entry, ancestors))
  } finally {
    ancestors.delete(value)
  }
}

/** Resolves public stable Atom refs into scoped Boundary read and input plans. */
export class BoundaryRuntimeRpcService {
  constructor(private readonly boundary: BoundaryDatabase) {}

  /**
  Plans one external ordinary Field Gluon.

  `enum` and `array` are topology Fields and fail before a Particle is returned;
  this legacy scalar surface does not grant the separate owner batch capability.
  */
  async planFieldValue(input: unknown): Promise<ForceMessageInput> {
    const validation = validateMetaFieldValueApplyRequest(input)
    if (!validation.ok) throw invalid(validation.issues)
    const request: MetaFieldValueApplyRequest = validation.value
    const atom = await resolveBoundaryRuntimeAtom(this.boundary, request.atom)
    if (atom === null) throw new Error("Boundary Field Atom locator is stale or does not select an Atom")
    const fields = await this.boundary.projection.sql<Array<{
      id: number
      type: "string" | "number" | "boolean" | "array" | "enum"
      required: number
    }>>`
      SELECT field.id, field.type, field.required
        FROM atom
        JOIN field ON field.wimp = atom.wimp
       WHERE atom.id = ${atom} AND field.key = ${request.field}
       ORDER BY field.id
    `
    if (fields.length !== 1) throw new Error(`Boundary Field is not uniquely declared for selected Atom: ${request.field}`)
    const field = fields[0]!
    if (field.type === "array" || field.type === "enum") {
      throw new Error(`Boundary topology Field can be changed only by Process: ${request.field}`)
    }
    if (!boundaryFieldValueMatches(field.type, field.required === 1, request.value, [])) {
      throw new Error(`Boundary Field value does not match ${field.type} declaration: ${request.field}`)
    }
    return {parts: [{
      part: "gluon",
      op: "replace",
      path: atom,
      ts: Date.now(),
      value: {fields: {[String(field.id)]: structuredClone(request.value)}},
    }]}
  }

  /** Проверяет весь владельческий CAS и планирует один Gluon либо один Higgs для набора с topology Field; ничего не материализует. */
  async planFieldsValue(input: unknown): Promise<BoundaryFieldsValuePlan> {
    const validation = validateMetaFieldsValueApplyRequest(input)
    if (!validation.ok) throw invalid(validation.issues)
    const request = validation.value
    const atom = await resolveBoundaryRuntimeAtom(this.boundary, request.atom)
    if (atom === null) throw new Error("Boundary Fields Atom locator is stale or does not select an Atom")
    const declared = await this.boundary.projection.sql<Array<{id: number; key: string}>>`
      SELECT field.id, field.key FROM field JOIN atom ON atom.wimp = field.wimp WHERE atom.id = ${atom}
    `
    const fields: Record<string, unknown> = {}, expectedFields: Record<string, unknown> = {}
    for (const update of request.updates) {
      const matches = declared.filter(field => field.key === update.field)
      if (matches.length !== 1) throw new Error(`Boundary Field is not uniquely declared for selected Atom: ${update.field}`)
      const id = String(matches[0]!.id)
      fields[id] = structuredClone(update.value)
      expectedFields[id] = structuredClone(update.expectedValue)
    }
    const checked = await validateBoundaryFieldValues(this.boundary.projection.sql, atom, fields, expectedFields)
    if (!checked.ok) return {schema: "metafor/fields-admission-refusal/v1", contractVersion: 1, reason: checked.reason, fields: checked.fields}
    return {parts: [{part: checked.topology ? "higgs" : "gluon", op: "replace", path: atom, ts: Date.now(),
      value: {kind: "field-values/v1", fields, expectedFields}}]}
  }

  async projectProcessExecution(input: unknown): Promise<BoundaryProcessExecutionProjection> {
    const validation = validateMetaProcessExecutionReadRequest(input)
    if (!validation.ok) throw invalid(validation.issues)
    const request: MetaProcessExecutionReadRequest = validation.value
    const atom = await resolveBoundaryRuntimeAtom(this.boundary, request.atom)
    if (atom === null) throw new Error("Boundary Process Atom locator is stale or does not select an Atom")
    const processes = await this.boundary.projection.sql<Array<{id: number}>>`
      SELECT process.id
        FROM atom
        JOIN process ON process.wimp = atom.wimp
       WHERE atom.id = ${atom} AND process.key = ${request.process}
       ORDER BY process.id
    `
    if (processes.length !== 1) throw new Error(`Boundary Process is not uniquely declared for selected Atom: ${request.process}`)
    const row = (await this.boundary.projection.sql<Array<{
      status: MetaProcessExecutionStatus
      resultJson: string | null
    }>>`
      SELECT status, result_json AS resultJson
        FROM boundary_process_execution
       WHERE execution_id = ${request.execution}
         AND atom = ${atom}
         AND process = ${processes[0]!.id}
    `)[0]
    if (!row) throw new Error(`Boundary Process execution does not match selected Atom and Process: ${request.execution}`)
    if (row.resultJson === null) return {status: row.status, outcome: null}
    let result: unknown
    try {
      result = JSON.parse(row.resultJson)
    } catch {
      throw new Error(`Boundary Process execution result is invalid JSON: ${request.execution}`)
    }
    if (typeof result !== "object" || result === null || Array.isArray(result)) {
      throw new Error(`Boundary Process execution result is invalid: ${request.execution}`)
    }
    const source = result as Record<string, unknown>
    if (typeof source.fields !== "object" || source.fields === null || Array.isArray(source.fields)) {
      throw new Error(`Boundary Process execution Fields are invalid: ${request.execution}`)
    }
    const proposed = source.fields as Record<string, unknown>
    const fieldIds = Object.keys(proposed).map((key) => resolveForceFieldId(key))
    if (fieldIds.some((id) => id === null)) throw new Error(`Boundary Process execution contains an invalid Field identity: ${request.execution}`)
    const declarations = await this.boundary.projection.sql<Array<{id: number; key: string}>>`
      SELECT field.id, field.key FROM field
       JOIN atom ON atom.wimp = field.wimp
      WHERE atom.id = ${atom}
    `
    const keys = new Map(declarations.map((field) => [Number(field.id), field.key]))
    const fields: {[key: string]: JsonValue} = {}
    for (const [identity, value] of Object.entries(proposed)) {
      const id = resolveForceFieldId(identity)!
      const key = keys.get(id)
      if (!key || !isJson(value)) throw new Error(`Boundary Process execution Field result is unavailable: ${identity}`)
      fields[key] = structuredClone(value)
    }
    if (source.error !== undefined && typeof source.error !== "string") {
      throw new Error(`Boundary Process execution error is invalid: ${request.execution}`)
    }
    const outcome: MetaProcessExecutionOutcome = {
      fields,
      ...(typeof source.error === "string" ? {error: source.error} : {}),
    }
    return {status: row.status, outcome}
  }
}
