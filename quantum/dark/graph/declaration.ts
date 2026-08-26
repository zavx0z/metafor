/**
Dark-owned проекция reachable MetaDSL declarations в `Graph.template`.

Модуль не читает Boundary и не сохраняет assembled Graph между запросами.

@packageDocumentation
*/

import {
  parseMetaAddress,
  type JsonValue,
  type MetaAddress,
  type MetaField,
  type Graph,
  type MetaMass,
  type MetaMatterBinding,
  type MetaMatterParticle,
  type MetaProcess,
  type MetaReaction,
  type MetaState,
  type MetaTemplate,
} from "@metafor/types/metafor/graph"
import type {MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {loadMeta} from "../load.ts"

export const DARK_DECLARATION_PROJECTION_METHOD = "dark.declarationProjection.read" as const

/** Внедряемое чтение одного canonical MetaDSL source. */
export type MetaLoader = (src: string) => Promise<MetaDSL>

/** Dark-owned root и `Graph.template` без runtime и собственного хранения. */
export type DarkGraphTemplate = {
  root: MetaAddress
  template: Graph["template"]
}

/** Одна reachable declaration и Meta addresses, на которые ссылается её Matter. */
export type LoadedMetaDeclaration = {
  address: MetaAddress
  dsl: MetaDSL
  references: MetaAddress[]
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const record = (value: unknown, path: string): Record<string, unknown> => {
  if (!isPlainRecord(value)) throw new Error(`${path} must be a plain object`)
  return value
}

const required = (
  value: Record<string, unknown>,
  key: string,
  path: string,
): unknown => {
  if (!Object.hasOwn(value, key) || value[key] === undefined) {
    throw new Error(`${path}.${key} is required`)
  }
  return value[key]
}

const requiredString = (
  value: Record<string, unknown>,
  key: string,
  path: string,
): string => {
  const item = required(value, key, path)
  if (typeof item !== "string") throw new Error(`${path}.${key} must be a string`)
  return item
}

const jsonValue = (
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite JSON numbers`)
    return value
  }
  if (value instanceof RegExp) return {source: value.source, flags: value.flags}
  if (typeof value !== "object") {
    throw new Error(`${path} contains a non-serializable ${typeof value} value`)
  }
  if (ancestors.has(value)) throw new Error(`${path} contains a circular reference`)
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        if (item === undefined) throw new Error(`${path}[${index}] contains undefined`)
        return jsonValue(item, `${path}[${index}]`, ancestors)
      })
    }
    if (!isPlainRecord(value)) {
      throw new Error(`${path} contains a non-JSON object`)
    }
    const result: {[key: string]: JsonValue} = {}
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue
      result[key] = jsonValue(item, `${path}.${key}`, ancestors)
    }
    return result
  } finally {
    ancestors.delete(value)
  }
}

const pick = (
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): {[key: string]: JsonValue} => {
  const result: {[key: string]: JsonValue} = {}
  for (const key of keys) {
    if (!Object.hasOwn(value, key) || value[key] === undefined) continue
    result[key] = jsonValue(value[key], `${path}.${key}`)
  }
  return result
}

const array = <T>(
  value: unknown,
  path: string,
  project: (item: unknown, path: string) => T,
): T[] => {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value.map((item, index) => project(item, `${path}[${index}]`))
}

const field = (value: unknown, path: string): MetaField => {
  const input = record(value, path)
  required(input, "key", path)
  required(input, "type", path)
  return pick(
    input,
    ["key", "type", "required", "default", "label", "values", "id", "data"],
    path,
  ) as unknown as MetaField
}

const state = (value: unknown, path: string): MetaState => {
  const input = record(value, path)
  const name = requiredString(input, "name", path)
  const transitions = input.transitions === undefined || input.transitions === null
    ? null
    : jsonValue(record(input.transitions, `${path}.transitions`), `${path}.transitions`)
  return {name, transitions} as MetaState
}

const mass = (value: unknown, path: string): MetaMass => {
  const input = record(value, path)
  required(input, "key", path)
  required(input, "format", path)
  return pick(input, ["key", "format", "label", "description"], path) as unknown as MetaMass
}

const action = (
  value: unknown,
  path: string,
): Record<string, JsonValue> => {
  const input = record(value, path)
  required(input, "src", path)
  return pick(input, ["src", "importSpecifier", "wrapperSrc", "read"], path)
}

const handler = (
  value: unknown,
  path: string,
): Record<string, JsonValue> => {
  const input = record(value, path)
  required(input, "src", path)
  return pick(input, ["src", "read", "write"], path)
}

const process = (value: unknown, path: string): MetaProcess => {
  const input = record(value, path)
  const key = requiredString(input, "key", path)
  const source = record(required(input, "declaration", path), `${path}.declaration`)
  const type = requiredString(source, "type", `${path}.declaration`)
  const declaration = pick(source, ["type", "label", "desc", "env"], `${path}.declaration`)
  if (type === "action") {
    declaration.action = action(
      required(source, "action", `${path}.declaration`),
      `${path}.declaration.action`,
    )
    if (source.success !== undefined) {
      declaration.success = handler(source.success, `${path}.declaration.success`)
    }
    if (source.error !== undefined) {
      declaration.error = handler(source.error, `${path}.declaration.error`)
    }
  } else if (type === "finally") {
    declaration.before = action(
      required(source, "before", `${path}.declaration`),
      `${path}.declaration.before`,
    )
  } else {
    throw new Error(`${path}.declaration.type must be action or finally`)
  }
  return {key, declaration} as unknown as MetaProcess
}

const reaction = (value: unknown, path: string): MetaReaction => {
  const input = record(value, path)
  return {
    key: requiredString(input, "key", path),
    label: requiredString(input, "label", path),
    desc: input.desc === undefined ? null : jsonValue(input.desc, `${path}.desc`) as string | null,
    sources: jsonValue(required(input, "sources", path), `${path}.sources`) as unknown as MetaReaction["sources"],
    src: requiredString(input, "src", path),
    read: jsonValue(input.read ?? [], `${path}.read`) as string[],
    write: jsonValue(input.write ?? [], `${path}.write`) as string[],
    massRead: jsonValue(input.massRead ?? [], `${path}.massRead`) as string[],
    massWrite: jsonValue(input.massWrite ?? [], `${path}.massWrite`) as string[],
    states: jsonValue(input.states ?? [], `${path}.states`) as string[],
  }
}

const binding = (value: unknown, path: string): MetaMatterBinding => {
  if (typeof value === "string") return value
  const input = record(value, path)
  const result = pick(input, ["data", "expr"], path)
  if (input.directMass !== undefined) {
    const direct = record(input.directMass, `${path}.directMass`)
    const kind = requiredString(direct, "kind", `${path}.directMass`)
    if (kind === "whole") {
      result.directMass = {kind}
    } else if (kind === "keys") {
      result.directMass = {
        kind,
        entries: array(
          required(direct, "entries", `${path}.directMass`),
          `${path}.directMass.entries`,
          (entry, entryPath) => {
            const inputEntry = record(entry, entryPath)
            return {
              target: requiredString(inputEntry, "target", entryPath),
              source: requiredString(inputEntry, "source", entryPath),
            }
          },
        ),
      }
    } else {
      throw new Error(`${path}.directMass.kind must be whole or keys`)
    }
  }
  return result as MetaMatterBinding
}

const matter = (value: unknown, path: string): MetaMatterParticle => {
  const input = record(value, path)
  const kind = requiredString(input, "kind", path)
  let result: Record<string, unknown>
  if (kind === "wimp") {
    const source = requiredString(input, "src", path)
    const src = parseMetaAddress(source)
    if (!src) throw new Error(`${path}.src must be a canonical <owner>/<repository> address`)
    result = {kind, src}
    for (const key of ["fieldsBinding", "massBinding", "energyBinding"] as const) {
      if (input[key] !== undefined) result[key] = binding(input[key], `${path}.${key}`)
    }
  } else if (kind === "fuzzy") {
    result = {
      kind,
      fuzzyKind: requiredString(input, "fuzzyKind", path),
      predicateBinding: binding(required(input, "predicateBinding", path), `${path}.predicateBinding`),
    }
  } else if (kind === "axion") {
    result = {
      kind,
      predicateBinding: binding(required(input, "predicateBinding", path), `${path}.predicateBinding`),
    }
  } else if (kind === "macho") {
    result = {
      kind,
      collectionBinding: binding(required(input, "collectionBinding", path), `${path}.collectionBinding`),
    }
  } else {
    throw new Error(`${path}.kind must be wimp, fuzzy, axion or macho`)
  }
  if (input.children !== undefined) {
    result.children = array(input.children, `${path}.children`, (child, childPath) => {
      const edge = record(child, childPath)
      return {
        edgeSlot: requiredString(edge, "edgeSlot", childPath),
        particle: matter(required(edge, "particle", childPath), `${childPath}.particle`),
      }
    })
  }
  return result as unknown as MetaMatterParticle
}

/** Projects the current compact MetaDSL into the one public MetaTemplate shape. */
export const normalizeMetaTemplate = (
  value: MetaDSL,
  address: string,
): MetaTemplate => {
  const input = record(value, `MetaDSL(${address})`)
  const result: MetaTemplate = {
    name: requiredString(input, "name", `MetaDSL(${address})`),
    fields: array(
      required(input, "fields", `MetaDSL(${address})`),
      `MetaDSL(${address}).fields`,
      field,
    ),
    superposition: array(
      required(input, "superposition", `MetaDSL(${address})`),
      `MetaDSL(${address}).superposition`,
      state,
    ),
    mass: input.mass === undefined
      ? []
      : array(input.mass, `MetaDSL(${address}).mass`, mass),
    processes: input.processes === undefined
      ? []
      : array(input.processes, `MetaDSL(${address}).processes`, process),
  }
  if (input.desc !== undefined) {
    if (typeof input.desc !== "string") throw new Error(`MetaDSL(${address}).desc must be a string`)
    result.desc = input.desc
  }
  if (input.reactions !== undefined) {
    result.reactions = array(input.reactions, `MetaDSL(${address}).reactions`, reaction)
  }
  if (input.matter !== undefined) {
    result.matter = array(input.matter, `MetaDSL(${address}).matter`, matter)
  }
  if (input.bulk !== undefined) {
    const source = record(input.bulk, `MetaDSL(${address}).bulk`)
    result.bulk = {view: requiredString(source, "view", `MetaDSL(${address}).bulk`)}
  }
  return result
}

const matterReferences = (value: MetaDSL, address: string): MetaAddress[] => {
  if (value.matter === undefined) return []
  if (!Array.isArray(value.matter)) throw new Error(`MetaDSL(${address}).matter must be an array`)
  const references: MetaAddress[] = []
  let frontier: MatterParticle[] = [...value.matter]
  while (frontier.length > 0) {
    const next: MatterParticle[] = []
    for (const particle of frontier) {
      if (particle.kind === "wimp") {
        const reference = parseMetaAddress(particle.src)
        if (!reference) {
          throw new Error(
            `MetaDSL(${address}) Matter src must be a canonical <owner>/<repository> address: ${particle.src}`,
          )
        }
        references.push(reference)
      }
      if (particle.children !== undefined) {
        if (!Array.isArray(particle.children)) {
          throw new Error(`MetaDSL(${address}) Matter children must be an array`)
        }
        for (const child of particle.children) next.push(child.particle)
      }
    }
    frontier = next
  }
  return references
}

const reactionReferences = (value: MetaDSL, address: string): MetaAddress[] => {
  if (value.reactions === undefined) return []
  if (!Array.isArray(value.reactions)) throw new Error(`MetaDSL(${address}).reactions must be an array`)
  const references: MetaAddress[] = []
  for (const [reactionIndex, reaction] of value.reactions.entries()) {
    if (!Array.isArray(reaction.sources)) {
      throw new Error(`MetaDSL(${address}).reactions[${reactionIndex}].sources must be an array`)
    }
    for (const [sourceIndex, source] of reaction.sources.entries()) {
      if (source.meta === undefined) continue
      const reference = parseMetaAddress(source.meta)
      if (!reference) {
        throw new Error(
          `MetaDSL(${address}).reactions[${reactionIndex}].sources[${sourceIndex}].meta must be a canonical <owner>/<repository> address`,
        )
      }
      if (!references.includes(reference)) references.push(reference)
    }
  }
  return references
}

const declarationReferences = (value: MetaDSL, address: string): MetaAddress[] => {
  const references: MetaAddress[] = []
  for (const reference of [...matterReferences(value, address), ...reactionReferences(value, address)]) {
    if (!references.includes(reference)) references.push(reference)
  }
  return references
}

/**
 * Loads one canonical root breadth-first. Matter reach is the safe default for
 * materialization callers; Graph reach additionally follows Reaction source
 * Meta only for the read-only declaration projection. The generator pauses
 * after each Meta so a caller can consume locally ready declarations first.
 */
export async function* loadMetaDeclarationGraph(
  root: string,
  readMeta: MetaLoader = loadMeta,
  reach: "matter" | "graph" = "matter",
): AsyncGenerator<LoadedMetaDeclaration, void, void> {
  const canonicalRoot = parseMetaAddress(root)
  if (!canonicalRoot) {
    throw new Error(`Dark declaration root must be a canonical <owner>/<repository> address: ${root}`)
  }
  const pending: MetaAddress[] = [canonicalRoot]
  const queued = new Set<MetaAddress>(pending)
  for (let index = 0; index < pending.length; index++) {
    const address = pending[index]!
    const dsl = await readMeta(address)
    const references = reach === "graph"
      ? declarationReferences(dsl, address)
      : matterReferences(dsl, address)
    yield {address, dsl, references}
    for (const reference of references) {
      if (queued.has(reference)) continue
      queued.add(reference)
      pending.push(reference)
    }
  }
}

const rootParam = (params: unknown): MetaAddress => {
  const input = record(params, "Dark declaration projection params")
  const keys = Object.keys(input)
  if (keys.length !== 1 || keys[0] !== "root") {
    throw new Error("Dark declaration projection params must contain only root")
  }
  const root = typeof input.root === "string" ? parseMetaAddress(input.root) : null
  if (!root) {
    throw new Error("Dark declaration projection root must be a canonical <owner>/<repository> address")
  }
  return root
}

/** Reads a complete, serializable declaration graph without retaining an assembled document. */
export const readDarkDeclarationProjection = async (
  params: unknown,
  readMeta: MetaLoader = loadMeta,
): Promise<DarkGraphTemplate> => {
  const root = rootParam(params)
  const template = {} as Graph["template"]
  for await (const {address, dsl} of loadMetaDeclarationGraph(root, readMeta, "graph")) {
    template[address] = normalizeMetaTemplate(dsl, address)
  }
  return {root, template}
}
