import {READ_GRAPH_DELTA_METHOD, validateGraph, type RuntimeAtom, type RuntimeNode} from "@metafor/types/metafor/graph"
import {OracleRpcRemoteError, type OracleRpcPeer} from "shared/transport/oracle"
import {META_FIELDS_VALUE_APPLY_METHOD, isMetaFieldsValueApplyRefusal, validateMetaCausalFrontier,
  validateMetaFieldsValueApplyRequest, type ReadGraphDeltaReceipt, type MetaFieldsValueApplyReceipt} from "shared/protocol/metafor/observation"
import {ATOM_FIELDS_EDIT_SCHEMA, type AtomFieldsEditReceipt} from "../shared/atom-fields"
import {AtomFieldEditError} from "./atom-fields"

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const unavailable = () => new AtomFieldEditError(503, "world_unavailable", "Состояние Atom недоступно")
const unknown = () => new AtomFieldEditError(503, "admission_unknown", "Сохранение не подтверждено; обновите состояние перед решением о повторе")

/**
 * Same-origin adapter передаёт весь черновик одному public Quantum RPC.
 * CAS, типы и единственная transaction принадлежат Boundary. После admission
 * причинное чтение подтверждает применение; запущенный Process может уже
 * изменить поля снова, поэтому результат не выводится из равенства latest values.
 */
export function createAtomFieldsBatchBridge(options: {peer: Pick<OracleRpcPeer, "call">; admitted?: () => boolean}) {
  let closed = false
  const pending = new Set<string>()
  const ready = () => {if (closed || options.admitted?.() === false) throw unavailable()}
  const snapshot = async () => {
    ready()
    const value = await options.peer.call<ReadGraphDeltaReceipt>("dark", READ_GRAPH_DELTA_METHOD, {contractVersion: 1, base: null})
    ready()
    if (!value || value.kind !== "snapshot" || value.resolution !== "exact" || value.contractVersion !== 1 ||
        !validateGraph(value.snapshot.graph).ok || !validateMetaCausalFrontier(value.snapshot.identity.frontier).ok ||
        value.snapshot.graph.root !== value.snapshot.identity.root) throw unavailable()
    return value.snapshot
  }
  return {
    close() {closed = true},
    async saveFields(value: unknown): Promise<AtomFieldsEditReceipt> {
      ready()
      if (!object(value) || Object.keys(value).sort().join(",") !== "atomRef,expectedFrontier,updates" ||
          typeof value.atomRef !== "string" || !/^atom:[A-Za-z0-9._:-]{1,128}$/.test(value.atomRef) ||
          !validateMetaCausalFrontier(value.expectedFrontier).ok) throw new AtomFieldEditError(400, "invalid_request", "Нужен набор изменений одного Atom")
      const atomRef = value.atomRef
      if (pending.has(atomRef) || pending.size >= 8) throw new AtomFieldEditError(409, "busy", "Этот Atom уже сохраняется")
      pending.add(atomRef)
      let sent = false
      try {
        const before = await snapshot()
        const nodes: RuntimeNode[] = [...before.graph.runtime.roots]
        let atom: RuntimeAtom | undefined
        for (let index = 0; index < nodes.length; index++) {
          const node = nodes[index]!
          if (node.kind === "atom" && node.ref === atomRef) atom = node
          nodes.push(...node.children ?? [])
        }
        if (!atom) throw new AtomFieldEditError(400, "invalid_request", "Atom отсутствует")
        const expected = value.expectedFrontier as import("shared/protocol/metafor/observation").MetaCausalFrontier
        const frontier = before.identity.frontier
        if (expected.cutId !== frontier.cutId || expected.throughSequence > frontier.throughSequence)
          throw new AtomFieldEditError(409, "conflict", "Мир изменился; обновите наблюдение")
        const checked = validateMetaFieldsValueApplyRequest({contractVersion: 1,
          atom: {root: before.graph.root, ref: atom.ref, meta: atom.meta}, updates: value.updates, expectedFrontier: frontier})
        if (!checked.ok) throw new AtomFieldEditError(400, "invalid_request", "Набор содержит неверные значения полей")
        for (const update of checked.value.updates) {
          const field = before.graph.template[atom.meta]?.fields.find(field => field.key === update.field)
          const next = update.value
          if (!field || !Object.hasOwn(atom.values, update.field) || (next === null ? field.required === true
            : field.type === "enum" ? typeof next !== "string" || !field.values.includes(next)
            : field.type === "array" ? !Array.isArray(next)
            : typeof next !== field.type)) throw new AtomFieldEditError(400, "invalid_request", "Значение не соответствует объявленному полю")
        }
        ready()
        sent = true
        const receipt = await options.peer.call<MetaFieldsValueApplyReceipt>("dark", META_FIELDS_VALUE_APPLY_METHOD, checked.value)
        const fields = checked.value.updates.map(update => update.field)
        if (!receipt || receipt.contractVersion !== 1 || receipt.resolution !== "exact" ||
            receipt.atom?.root !== before.graph.root || receipt.atom.ref !== atom.ref || receipt.atom.meta !== atom.meta ||
            !Array.isArray(receipt.fields) || receipt.fields.length !== fields.length || !fields.every(field => receipt.fields.includes(field)) ||
            receipt.acceptance?.cutId !== frontier.cutId || receipt.acceptance.sequence !== frontier.throughSequence + 1 ||
            receipt.acceptance.id !== `${frontier.cutId}:${frontier.throughSequence + 1}`) throw unknown()
        const after = await snapshot()
        if (after.graph.root !== before.graph.root || after.identity.frontier.cutId !== frontier.cutId ||
            after.identity.frontier.throughSequence < receipt.acceptance.sequence) throw unknown()
        return {schema: ATOM_FIELDS_EDIT_SCHEMA, version: 1, atomRef: atom.ref, fields,
          committed: true, receipt, observedFrontier: after.identity.frontier}
      } catch (error) {
        if (error instanceof AtomFieldEditError) throw error
        if (error instanceof OracleRpcRemoteError && error.code === "admission_refused" && isMetaFieldsValueApplyRefusal(error.data))
          throw new AtomFieldEditError(409, "field_not_admitted", "Ни одно поле не сохранено: значения или причинная граница изменились")
        throw sent ? unknown() : unavailable()
      } finally {pending.delete(atomRef)}
    },
  }
}
