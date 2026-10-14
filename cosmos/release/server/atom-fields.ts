import {READ_GRAPH_DELTA_METHOD, validateGraph, type RuntimeAtom, type RuntimeNode} from "@metafor/types/metafor/graph"
import {OracleRpcRemoteError, type OracleRpcPeer} from "shared/transport/oracle"
import {META_FIELD_VALUE_APPLY_METHOD, isMetaFieldValueApplyRefusal, validateMetaCausalFrontier, validateMetaGraphSnapshotIdentity,
  type ReadGraphDeltaReceipt, type MetaFieldValueApplyReceipt, type MetaRuntimeFieldValue} from "shared/protocol/metafor/observation"
import {ATOM_FIELD_EDIT_SCHEMA, type AtomFieldEditErrorCode, type AtomFieldEditReceipt, type AtomFieldEditRequest} from "../shared/atom-fields"

/** Закрытая ошибка HTTP adapter; private Oracle messages наружу не передаются. */
export class AtomFieldEditError extends Error {
  constructor(readonly status: number, readonly code: AtomFieldEditErrorCode, message: string) {super(message)}
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const scalar = (value: unknown): value is MetaRuntimeFieldValue => value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)
const invalid = () => new AtomFieldEditError(400, "invalid_request", "Нужно объявленное обычное Field, типизированное значение и его наблюдение")
const unavailable = () => new AtomFieldEditError(503, "world_unavailable", "Текущее состояние мира недоступно")
const conflict = () => new AtomFieldEditError(409, "conflict", "Мир или значение Field изменились; обновите наблюдение перед изменением")

function parse(value: unknown): AtomFieldEditRequest {
  const keys = ["atomRef", "field", "value", "expectedValue", "expectedFrontier"]
  if (!object(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key)) ||
      typeof value.atomRef !== "string" || !/^atom:[A-Za-z0-9._:-]{1,128}$/.test(value.atomRef) ||
      typeof value.field !== "string" || !value.field || value.field.length > 180 || value.field.trim() !== value.field || /[\u0000-\u001f\u007f]/u.test(value.field) ||
      !scalar(value.value) || !scalar(value.expectedValue) || typeof value.value === "string" && value.value.length > 256 * 1024 ||
      typeof value.expectedValue === "string" && value.expectedValue.length > 256 * 1024 || !validateMetaCausalFrontier(value.expectedFrontier).ok) throw invalid()
  return structuredClone(value) as unknown as AtomFieldEditRequest
}

/**
 * Release-owned adapter выбранного Atom, вызываемый после существующей
 * same-origin authorization `/agents`; сам не выдаёт HTTP или remote capability.
 * Coherent public Oracle snapshot связывает декларацию, значение и frontier.
 * Одно изменение передаётся существующему Field.apply без повторов и без доступа
 * к Boundary, Mass или приватному Store. Enum/array изменяют только Processes.
 * Закрытие либо отзыв admission до отправки запрещают новое намерение.
 * Смысл операции принадлежит [представлению Atom](../README.md#данные-мира-для-представления-atom).
 * [Проверки](../spec/atom-fields.spec.ts) покрывают stale input, типы и неизвестный исход.
 */
export function createAtomFieldBridge(options: {peer: Pick<OracleRpcPeer, "call">; admitted?: () => boolean}) {
  let closed = false
  const pending = new Set<string>()
  const ready = () => {if (closed || options.admitted?.() === false) throw unavailable()}
  return {
    close() {closed = true},
    async editField(value: unknown): Promise<AtomFieldEditReceipt> {
      const request = parse(value)
      ready()
      const key = request.atomRef + "/" + request.field
      if (pending.has(key) || pending.size >= 16) throw new AtomFieldEditError(409, "busy", "Изменение Field уже принимается")
      pending.add(key)
      let sent = false
      try {
        const observed = await options.peer.call<ReadGraphDeltaReceipt>("dark", READ_GRAPH_DELTA_METHOD, {contractVersion: 1, base: null})
        ready()
        if (!observed || observed.contractVersion !== 1 || observed.resolution !== "exact" || observed.kind !== "snapshot" ||
            !observed.snapshot || !validateMetaGraphSnapshotIdentity(observed.snapshot.identity, "").ok || !validateGraph(observed.snapshot.graph).ok ||
            observed.snapshot.identity.root !== observed.snapshot.graph.root) throw unavailable()
        const {graph, identity} = observed.snapshot
        const nodes: RuntimeNode[] = [...graph.runtime.roots]
        let atom: RuntimeAtom | undefined
        for (let index = 0; index < nodes.length; index++) {
          const node = nodes[index]!
          if (node.kind === "atom" && node.ref === request.atomRef) atom = node
          nodes.push(...(node.children ?? []))
        }
        if (!atom || !Object.hasOwn(atom.values, request.field)) throw invalid()
        const declaration = graph.template[atom.meta]?.fields.find(field => field.key === request.field)
        if (!declaration) throw invalid()
        if (declaration.type === "array" || declaration.type === "enum") throw new AtomFieldEditError(400, "field_not_editable", "Topology Field изменяется принадлежащим ему Process")
        if (request.value === null ? declaration.required === true : typeof request.value !== declaration.type) throw invalid()
        const frontier = identity.frontier
        if (request.expectedFrontier.cutId !== frontier.cutId || request.expectedFrontier.throughSequence > frontier.throughSequence ||
            atom.values[request.field] !== request.expectedValue) throw conflict()
        const result = {schema: ATOM_FIELD_EDIT_SCHEMA, version: 1 as const, atomRef: atom.ref, field: request.field, value: request.value}
        if (atom.values[request.field] === request.value) return {...result, acceptance: "observed", receipt: null}
        ready()
        sent = true
        const receipt = await options.peer.call<MetaFieldValueApplyReceipt>("dark", META_FIELD_VALUE_APPLY_METHOD,
          {contractVersion: 1, atom: {root: graph.root, ref: atom.ref, meta: atom.meta}, field: request.field, value: request.value, expectedFrontier: frontier})
        if (!receipt || receipt.contractVersion !== 1 || receipt.resolution !== "exact" || receipt.atom?.root !== graph.root ||
            receipt.atom.ref !== atom.ref || receipt.atom.meta !== atom.meta || receipt.field !== request.field ||
            receipt.acceptance?.cutId !== frontier.cutId || receipt.acceptance.sequence !== frontier.throughSequence + 1 ||
            receipt.acceptance.id !== `${frontier.cutId}:${frontier.throughSequence + 1}` || !validateMetaCausalFrontier(receipt.frontier).ok ||
            receipt.frontier.cutId !== frontier.cutId || receipt.frontier.throughSequence < receipt.acceptance.sequence) throw new AtomFieldEditError(503, "admission_unknown", "Исход изменения Field не подтверждён; обновите наблюдение перед решением о повторе")
        return {...result, acceptance: "admitted", receipt}
      } catch (error) {
        if (error instanceof AtomFieldEditError) throw error
        if (sent && error instanceof OracleRpcRemoteError && error.code === "admission_refused" && isMetaFieldValueApplyRefusal(error.data)) {
          throw new AtomFieldEditError(409, "field_not_admitted", "Изменение Field не принято; обновите наблюдение")
        }
        throw sent ? new AtomFieldEditError(503, "admission_unknown", "Исход изменения Field неизвестен; обновите наблюдение перед решением о повторе") : unavailable()
      } finally {pending.delete(key)}
    },
  }
}
