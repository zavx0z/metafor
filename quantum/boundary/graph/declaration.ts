/**
Boundary declaration projection for live authoring and source-free restoration.
Reads one serialized canonical snapshot; never evaluates source or exposes row IDs.
@packageDocumentation
*/
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {BoundaryMetaReadReceipt} from "shared/protocol/boundary/declaration"
import type {BoundaryInitialProjectionEntry} from "shared/protocol/boundary/initial"
import type {BoundaryDatabase} from "../sqlite.ts"

type Row = Record<string, any>

const record = (input: unknown): Row => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid canonical declaration")
  return input as Row
}

const withoutNull = (value: Row, keys: string[]): Row => Object.fromEntries(
  keys.filter(key => value[key] !== null && value[key] !== undefined).map(key => [key, structuredClone(value[key])]),
)

/** Converts persisted declaration relations back to semantic names in the same snapshot. */
export function projectBoundaryMeta(entries: readonly BoundaryInitialProjectionEntry[], root: MetaAddress): BoundaryMetaReadReceipt {
  const grouped = new Map<string, Map<string, Row[]>>()
  for (const entry of entries) {
    if (typeof entry.path !== "string" || entry.path.includes("/")) continue
    const value = record(entry.value)
    const owner = entry.path === "wimp" ? value.src : value.wimp
    if (typeof owner !== "string") continue
    const meta = grouped.get(owner) ?? new Map<string, Row[]>()
    const rows = meta.get(entry.path) ?? []
    rows.push(value)
    meta.set(entry.path, rows)
    grouped.set(owner, meta)
  }
  const declarations: BoundaryMetaReadReceipt["declarations"] = []
  const pending: string[] = [root]
  const seen = new Set<string>()
  for (let index = 0; index < pending.length; index++) {
    const address = parseMetaAddress(pending[index]!)
    if (!address) throw new Error("Invalid canonical Meta identity")
    if (seen.has(address)) continue
    seen.add(address)
    const group = grouped.get(address)
    const head = group?.get("wimp")?.[0]
    if (!group || !head) throw new Error(`Canonical declaration is unavailable: ${address}`)
    const rows = (kind: string): Row[] => [...(group.get(kind) ?? [])].sort((a, b) => Number(a.localId) - Number(b.localId))
    const fields = rows("field")
    const states = rows("state").sort((a, b) => a.position - b.position)
    const defaultValue = (field: Row): unknown => {
      if (field.type !== "enum" || field.default === null) return structuredClone(field.default)
      const variant = rows("variant").find(item => item.id === field.default?.variant && item.field === field.id)
      if (!variant) throw new Error("Canonical enum default is unavailable")
      return variant.itemValue
    }
    const resolveName = (items: Row[], id: number, key: string): string => {
      const value = items.find(item => item.id === id)?.[key]
      if (typeof value !== "string") throw new Error(`Canonical ${address} declaration relation is unavailable`)
      return value
    }
    const keys = (ids: number[] = []): string[] => ids.map(id => resolveName(fields, id, "key"))
    const handler = (value: Row): Row => ({
      ...withoutNull(value, ["src", "importSpecifier", "wrapperSrc"]),
      read: (value.readFields ?? []).map((pair: [number, string]) => {
        const key = resolveName(fields, pair[0], "key")
        if (pair[1] !== key) throw new Error("Canonical Process Field relation disagrees")
        return key
      }),
      ...(value.writeFields ? {write: value.writeFields.map((pair: [number, string]) => {
        const key = resolveName(fields, pair[0], "key")
        if (pair[1] !== key) throw new Error("Canonical Process Field relation disagrees")
        return key
      })} : {}),
    })
    const matters = rows("matter")
    const matter = (parent: number | null, ancestors = new Set<number>()): Row[] => matters
      .filter(item => item.parent === parent)
      .sort((a, b) => a.position - b.position)
      .map(item => {
        if (ancestors.has(item.localId)) throw new Error("Canonical Matter contains a cycle")
        const next = new Set(ancestors).add(item.localId)
        const children = matter(item.localId, next)
        if (item.kind === "wimp") pending.push(item.src)
        const particle = {
          ...withoutNull(item, ["kind", "src", "fieldsBinding", "massBinding", "energyBinding", "fuzzyKind", "predicateBinding", "collectionBinding"]),
          ...(children.length ? {children} : {}),
        }
        return parent === null ? particle : {edgeSlot: item.edgeSlot, particle}
      })
    const meta = {
      name: head.name ?? address,
      ...withoutNull(head, ["desc", "lifecycle"]),
      fields: fields.map(field => ({
        ...withoutNull(field, ["key", "type", "label"]),
        ...(field.required === true ? {required: true} : {}),
        ...(Object.hasOwn(field, "default") ? {default: defaultValue(field)} : {}),
        ...(field.type === "enum" ? {values: rows("variant").filter(v => v.field === field.id)
          .sort((a, b) => a.position - b.position).map(v => v.itemValue)} : {}),
      })),
      superposition: states.map(state => {
        const transitions = rows("transition").filter(item => item.fromState === state.id).sort((a, b) => a.position - b.position)
        return {name: state.name, transitions: transitions.length ? Object.fromEntries(transitions.map(transition => [
          resolveName(states, transition.toState, "name"),
          Object.fromEntries(rows("condition").filter(item => item.transition === transition.id)
            .sort((a, b) => a.position - b.position).map(item => [resolveName(fields, item.field, "key"), item.predicate])),
        ])) : null}
      }),
      mass: rows("mass").map(item => withoutNull(item, ["key", "format", "label", "description"])),
      processes: rows("process").map(item => {
        const descriptor = record(item.descriptor)
        return {key: item.state, declaration: {
          ...withoutNull(descriptor, ["type", "label", "desc", "env"]),
          ...(descriptor.type === "finally" ? {before: handler(record(descriptor.before))} : {
            action: handler(record(descriptor.action)),
            ...(descriptor.success ? {success: handler(record(descriptor.success))} : {}),
            ...(descriptor.error ? {error: handler(record(descriptor.error))} : {}),
          }),
        }}
      }),
      reactions: rows("reaction").map(item => {
        for (const source of item.sources ?? []) if (source.meta && grouped.has(source.meta)) pending.push(source.meta)
        return {
          ...withoutNull(item, ["key", "label", "desc", "src", "sources", "massRead", "massWrite"]),
          read: keys(item.read), write: keys(item.write),
          states: (item.states ?? []).map((id: number) => resolveName(states, id, "name")),
        }
      }),
      matter: matter(null),
      ...(rows("bulk")[0] ? {bulk: {view: rows("bulk")[0]!.view}} : {}),
    } as unknown as MetaDSL
    declarations.push({address, meta})
  }
  return {root, declarations}
}

/** One closed, internal Oracle read; external scope is enforced by the calling Dark capability. */
export async function readBoundaryMeta(boundary: BoundaryDatabase, input: unknown): Promise<BoundaryMetaReadReceipt> {
  const request = record(input)
  const root = typeof request.root === "string" ? parseMetaAddress(request.root) : null
  if (!root || Object.keys(request).length !== 1) throw new Error("Boundary Meta read requires one canonical root")
  return projectBoundaryMeta((await boundary.initialProjection()).entries, root)
}
