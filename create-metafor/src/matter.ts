import ts from "typescript"
import {isDeepStrictEqual} from "node:util"
import type {
  MetaMatterOccurrenceLocator,
  MetaMatterPlacement,
  MetaMatterRequest,
} from "@metafor/types/metafor/authoring"
import type {MetaAddress, MetaMatterBinding, MetaMatterParticle} from "@metafor/types/metafor/graph"
import type {MatterFields, MatterParticle} from "@metafor/types/metafor/matter"
import type {ForceMessageInput} from "shared/protocol/force/message"

export type MatterPatchErrorCode =
  | "parent_missing"
  | "unsupported_matter_source"
  | "occurrence_missing"
  | "occurrence_mismatch"
  | "invalid_placement"
  | "invalid_matter_composition"

export class MatterPatchError extends Error {
  override readonly name = "MatterPatchError"

  constructor(readonly code: MatterPatchErrorCode, message: string) {
    super(message)
  }
}

export interface MatterParentSnapshot {
  address: MetaAddress
  targetPath: string
  source: string
  matter: readonly MatterParticle[]
  fields?: MatterFields
}

export interface MatterSourceEdit {
  address: MetaAddress
  targetPath: string
  beforeSource: string
  afterSource: string
}

export interface MetaMatterPatchPlan {
  particle: ForceMessageInput
  sourceEdits: MatterSourceEdit[]
}

type MutableParticle = MetaMatterParticle
type MutableTree = MutableParticle[]
type EdgeSlot = "root" | "child" | "then" | "else" | "branch"
type ChildEntry = {edgeSlot: Exclude<EdgeSlot, "root">; particle: MutableParticle}

type TreeEntry = {
  particle: MutableParticle
  id: number
  parent: number | null
  edgeSlot: EdgeSlot
  position: number
}

type TreeVersion = {
  wimp: MetaAddress
  entries: Array<Record<string, unknown>>
}

type MatterTreePatch = {
  before: TreeVersion[]
  after: TreeVersion[]
}

type Located = {
  particle: MutableParticle
  siblings: MutableParticle[] | ChildEntry[]
  index: number
}

const clone = <T>(value: T): T => structuredClone(value)

const parent = (
  parents: ReadonlyMap<MetaAddress, MatterParentSnapshot>,
  address: MetaAddress,
): MatterParentSnapshot => {
  const snapshot = parents.get(address)
  if (!snapshot) throw new MatterPatchError("parent_missing", `Matter parent snapshot is missing: ${address}`)
  return snapshot
}

const locate = (tree: MutableTree, locator: MetaMatterOccurrenceLocator): Located => {
  let siblings: Located["siblings"] = tree
  let particle: MutableParticle | undefined
  for (let depth = 0; depth < locator.path.length; depth++) {
    const step = locator.path[depth]!
    const entry = siblings[step.position] as MutableParticle | ChildEntry | undefined
    if (!entry) {
      throw new MatterPatchError(
        "occurrence_missing",
        `${locator.address} Matter locator is absent at step ${depth}`,
      )
    }
    const edgeSlot: EdgeSlot = "edgeSlot" in entry ? entry.edgeSlot : "root"
    if (edgeSlot !== step.edgeSlot) {
      throw new MatterPatchError(
        "occurrence_missing",
        `${locator.address} Matter locator edge differs at step ${depth}`,
      )
    }
    particle = "particle" in entry ? entry.particle : entry
    if (depth < locator.path.length - 1) siblings = particle!.children ?? []
  }
  if (!particle) throw new MatterPatchError("occurrence_missing", `${locator.address} Matter locator is empty`)
  return {particle, siblings, index: locator.path.at(-1)!.position}
}

const placementChildren = (
  tree: MutableTree,
  placement: MetaMatterPlacement,
): {siblings: Located["siblings"]; parent: MutableParticle | null} => {
  if (placement.parent === null) return {siblings: tree, parent: null}
  const located = locate(tree, placement.parent)
  return {siblings: located.particle.children ?? (located.particle.children = []), parent: located.particle}
}

const allowedEdge = (parentParticle: MutableParticle | null, edgeSlot: EdgeSlot): boolean => {
  if (parentParticle === null) return edgeSlot === "root"
  if (parentParticle.kind === "wimp" || parentParticle.kind === "macho") return edgeSlot === "child"
  if (parentParticle.kind === "fuzzy") return edgeSlot === "branch"
  return edgeSlot === "child" || edgeSlot === "then" || edgeSlot === "else"
}

const insertAt = (
  tree: MutableTree,
  placement: MetaMatterPlacement,
  particle: MutableParticle,
): void => {
  insertInto(placementChildren(tree, placement), placement, particle)
}

const insertInto = (
  target: {siblings: Located["siblings"]; parent: MutableParticle | null},
  placement: MetaMatterPlacement,
  particle: MutableParticle,
): void => {
  if (!allowedEdge(target.parent, placement.edgeSlot)) {
    throw new MatterPatchError(
      "invalid_placement",
      `${placement.address} ${target.parent?.kind ?? "root"} cannot contain ${placement.edgeSlot} edge`,
    )
  }
  if (placement.position > target.siblings.length) {
    throw new MatterPatchError(
      "invalid_placement",
      `${placement.address} Matter position ${placement.position} exceeds ${target.siblings.length}`,
    )
  }
  if (target.parent?.kind === "axion") {
    const slots = target.siblings.map((entry) => "edgeSlot" in entry ? entry.edgeSlot : "root")
    if (placement.edgeSlot === "then" && slots.slice(0, placement.position).includes("else")) {
      throw new MatterPatchError("invalid_placement", "Axion then child cannot follow an else child")
    }
    if (placement.edgeSlot === "else" && slots.slice(placement.position).includes("then")) {
      throw new MatterPatchError("invalid_placement", "Axion else child cannot precede a then child")
    }
    if (placement.edgeSlot === "child" && slots.some((slot) => slot === "then" || slot === "else")) {
      throw new MatterPatchError("invalid_placement", "Axion cannot mix logical and conditional children")
    }
    if ((placement.edgeSlot === "then" || placement.edgeSlot === "else") && slots.includes("child")) {
      throw new MatterPatchError("invalid_placement", "Axion cannot mix conditional and logical children")
    }
  }
  if (target.parent === null) {
    ;(target.siblings as MutableTree).splice(placement.position, 0, particle)
  } else {
    ;(target.siblings as ChildEntry[]).splice(
      placement.position,
      0,
      {edgeSlot: placement.edgeSlot as ChildEntry["edgeSlot"], particle},
    )
  }
}

const removeAt = (located: Located): MutableParticle => {
  const [removed] = located.siblings.splice(located.index, 1) as Array<MutableParticle | ChildEntry>
  if (!removed) throw new MatterPatchError("occurrence_missing", "Matter occurrence disappeared during planning")
  return "particle" in removed ? removed.particle : removed
}

const flatten = (tree: readonly MutableParticle[]): TreeEntry[] => {
  const result: TreeEntry[] = []
  let frontier: Array<{particle: MutableParticle; parent: number | null; edgeSlot: EdgeSlot; position: number}> =
    tree.map((particle, position) => ({particle, parent: null, edgeSlot: "root", position}))
  let id = 0
  while (frontier.length > 0) {
    const next: typeof frontier = []
    for (const item of frontier) {
      const currentId = ++id
      result.push({...item, id: currentId})
      for (let position = 0; position < (item.particle.children?.length ?? 0); position++) {
        const child = item.particle.children![position]!
        next.push({particle: child.particle, parent: currentId, edgeSlot: child.edgeSlot, position})
      }
    }
    frontier = next
  }
  if (result.length > 4_096) {
    throw new MatterPatchError("invalid_matter_composition", "Matter tree exceeds 4096 particles")
  }
  return result
}

const entryValue = (address: MetaAddress, entry: TreeEntry): Record<string, unknown> => {
  const {children: _children, ...definition} = entry.particle
  return {
    wimp: address,
    id: entry.id,
    parent: entry.parent,
    edgeSlot: entry.edgeSlot,
    position: entry.position,
    ...clone(definition),
  }
}

const treeVersion = (address: MetaAddress, tree: MutableTree): TreeVersion => ({
  wimp: address,
  entries: flatten(tree).map((entry) => entryValue(address, entry)),
})

const mappedTreeVersion = (
  address: MetaAddress,
  tree: MutableTree,
  previous: ReadonlyMap<MutableParticle, {wimp: MetaAddress; id: number}>,
): TreeVersion => ({
  wimp: address,
  entries: flatten(tree).map((entry) => ({
    ...entryValue(address, entry),
    ...(previous.has(entry.particle) ? {before: previous.get(entry.particle)!} : {}),
  })),
})

const valueAt = (version: TreeVersion, locator: MetaMatterOccurrenceLocator): Record<string, unknown> => {
  let parentId: number | null = null
  let found: Record<string, unknown> | undefined
  for (const step of locator.path) {
    found = version.entries.find((entry) =>
      entry.parent === parentId && entry.edgeSlot === step.edgeSlot && entry.position === step.position
    )
    if (!found) throw new MatterPatchError("occurrence_missing", `${locator.address} Matter identity is absent`)
    parentId = Number(found.id)
  }
  return found!
}

const escapeAttribute = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")

type MapContext = {item: string; index: string}

const propertyPath = (root: string, path: string): string => {
  const segments = path.split(/[/.]/).filter(Boolean)
  return segments.reduce((result, segment) => `${result}[${JSON.stringify(segment)}]`, root)
}

const dataReference = (path: string, maps: readonly MapContext[]): string => {
  if (path === "/state") return "state"
  if (path === "/mass") return "mass"
  if (path.startsWith("/mass/")) return propertyPath("mass", path.slice("/mass/".length))
  if (path === "/energy") return "energy"
  if (path.startsWith("/energy/")) return propertyPath("energy", path.slice("/energy/".length))
  if (path === "[item]" || path.startsWith("[item]/") || path.startsWith("[item].")) {
    const current = maps.at(-1)
    if (!current) throw new MatterPatchError("invalid_matter_composition", `Map-relative binding ${path} has no map parent`)
    return propertyPath(current.item, path.slice("[item]".length))
  }
  if (path === "[index]") {
    const current = maps.at(-1)
    if (!current) throw new MatterPatchError("invalid_matter_composition", "Map index binding has no map parent")
    return current.index
  }
  const parentItems = /^(\.\.\/)+\[item\](.*)$/.exec(path)
  if (parentItems) {
    const depth = parentItems[1]!.split("../").length - 1
    const current = maps.at(-(depth + 1))
    if (!current) throw new MatterPatchError("invalid_matter_composition", `Map-relative binding ${path} exceeds map depth`)
    return propertyPath(current.item, parentItems[2]!)
  }
  if (path.startsWith("/")) {
    throw new MatterPatchError("invalid_matter_composition", `Unsupported normalized Matter binding path ${path}`)
  }
  return propertyPath("value", path)
}

const bindingExpression = (binding: MetaMatterBinding, maps: readonly MapContext[]): string => {
  if (typeof binding === "string") return binding
  const paths = binding.data === undefined ? [] : Array.isArray(binding.data) ? binding.data : [binding.data]
  const references = paths.map((path) => dataReference(path, maps))
  if (binding.expr === undefined) {
    if (references.length !== 1) {
      throw new MatterPatchError("invalid_matter_composition", "Variable Matter binding must contain exactly one data path")
    }
    return references[0]!
  }
  return binding.expr.replace(/_\[(\d+)]/g, (_match, rawIndex: string) => {
    const reference = references[Number(rawIndex)]
    if (reference === undefined) {
      throw new MatterPatchError("invalid_matter_composition", `Matter binding references missing data index ${rawIndex}`)
    }
    return reference
  })
}

const dynamicSourceExpression = (binding: MetaMatterBinding, maps: readonly MapContext[]): string => {
  const expression = bindingExpression(binding, maps)
  if (expression.startsWith("${") && expression.endsWith("}")) return expression.slice(2, -1)
  return expression.includes("${") ? `\`${expression.replaceAll("`", "\\`")}\`` : expression
}

const serializeChildren = (
  children: readonly {edgeSlot: Exclude<EdgeSlot, "root">; particle: MetaMatterParticle}[],
  indent: string,
  maps: readonly MapContext[],
): string => children.map(({particle}) => serializeParticle(particle, indent, maps)).join("\n")

const serializeWimp = (
  particle: Extract<MetaMatterParticle, {kind: "wimp"}>,
  indent: string,
  maps: readonly MapContext[],
  source?: string,
): string => {
  const attributes = [
    `src="${source ?? escapeAttribute(particle.src)}"`,
    ...(particle.fieldsBinding === undefined ? [] : [`fields=\${${bindingExpression(particle.fieldsBinding, maps)}}`]),
    ...(particle.massBinding === undefined ? [] : [`mass=\${${bindingExpression(particle.massBinding, maps)}}`]),
    ...(particle.energyBinding === undefined ? [] : [`energy=\${${bindingExpression(particle.energyBinding, maps)}}`]),
  ].join(" ")
  if (!particle.children?.length) return `${indent}<meta-for ${attributes} />`
  return `${indent}<meta-for ${attributes}>\n${serializeChildren(particle.children, `${indent}  `, maps)}\n${indent}</meta-for>`
}

const fuzzyBranch = (particle: Extract<MetaMatterParticle, {kind: "fuzzy"}>): Extract<MetaMatterParticle, {kind: "wimp"}> => {
  const first = particle.children?.[0]?.particle
  if (!first || first.kind !== "wimp") {
    throw new MatterPatchError("invalid_matter_composition", "Fuzzy has no WIMP branch")
  }
  const continuation = ({src: _src, ...value}: typeof first) => value
  for (const child of particle.children ?? []) {
    if (child.edgeSlot !== "branch" || child.particle.kind !== "wimp" ||
        !isDeepStrictEqual(continuation(child.particle), continuation(first))) {
      throw new MatterPatchError("invalid_matter_composition", "Fuzzy WIMP branches must share one continuation")
    }
  }
  return first
}

const serializeParticle = (
  particle: MetaMatterParticle,
  indent: string,
  maps: readonly MapContext[],
): string => {
  if (particle.kind === "wimp") return serializeWimp(particle, indent, maps)
  if (particle.kind === "fuzzy") {
    const branch = fuzzyBranch(particle)
    return serializeWimp(branch, indent, maps, `\${${dynamicSourceExpression(particle.predicateBinding, maps)}}`)
  }
  if (particle.kind === "macho") {
    const depth = maps.length
    const context = {item: `_matterItem${depth}`, index: `_matterIndex${depth}`}
    const children = serializeChildren(particle.children ?? [], `${indent}  `, [...maps, context])
    return `${indent}\${${bindingExpression(particle.collectionBinding, maps)}.map((${context.item}, ${context.index}) => html\`\n${children}\n${indent}\`)}`
  }

  const children = particle.children ?? []
  const predicate = bindingExpression(particle.predicateBinding, maps)
  const logical = children.every(({edgeSlot}) => edgeSlot === "child")
  if (logical) {
    return `${indent}\${${predicate} && html\`\n${serializeChildren(children, `${indent}  `, maps)}\n${indent}\`}`
  }
  const thenChildren = children.filter(({edgeSlot}) => edgeSlot === "then")
  const elseChildren = children.filter(({edgeSlot}) => edgeSlot === "else")
  if (thenChildren.length + elseChildren.length !== children.length) {
    throw new MatterPatchError("invalid_matter_composition", "Conditional Axion has an invalid child edge")
  }
  return `${indent}\${${predicate}\n${indent}  ? html\`\n${serializeChildren(thenChildren, `${indent}    `, maps)}\n${indent}  \`\n${indent}  : html\`\n${serializeChildren(elseChildren, `${indent}    `, maps)}\n${indent}  \`}`
}

const callbackSource = (tree: MutableTree): string => {
  if (tree.length === 0) return "({ state, value, mass, energy, html }) => html``"
  return `({ state, value, mass, energy, html }) => html\`\n${tree.map((particle) =>
    serializeParticle(particle, "    ", [])
  ).join("\n")}\n  \``
}

const rewriteMatter = (source: string, tree: MutableTree): string => {
  const file = ts.createSourceFile("meta.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const calls: ts.CallExpression[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "matter"
    ) calls.push(node)
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (calls.length !== 1) {
    throw new MatterPatchError("unsupported_matter_source", "meta.ts must contain exactly one .matter call")
  }
  const call = calls[0]!
  if (call.arguments.length > 1) {
    throw new MatterPatchError("unsupported_matter_source", ".matter must contain zero or one callback")
  }
  const open = source.indexOf("(", call.expression.getEnd())
  const close = call.getEnd() - 1
  if (open < 0 || source[close] !== ")") {
    throw new MatterPatchError("unsupported_matter_source", ".matter call range is invalid")
  }
  const after = source.slice(0, open + 1) + callbackSource(tree) + source.slice(close)
  const parsed = ts.createSourceFile("meta.ts", after, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if ((parsed as ts.SourceFile & {parseDiagnostics: readonly ts.Diagnostic[]}).parseDiagnostics.length > 0) {
    throw new MatterPatchError("unsupported_matter_source", "Generated Matter source is not valid TypeScript")
  }
  return after
}

const resolvedFuzzySources = (particle: MetaMatterParticle, fields: MatterFields): string[] => {
  if (particle.kind !== "fuzzy" || typeof particle.predicateBinding === "string") return []
  const data = particle.predicateBinding.data
  const paths = data === undefined ? [] : Array.isArray(data) ? data : [data]
  if (paths.length !== 1) return []
  const field = fields[paths[0]!]
  if (!field || field.type !== "enum") return []
  const expression = particle.predicateBinding.expr
  return (field.values ?? []).map((value) => {
    if (!expression) return String(value)
    const resolved = expression === "_[0]"
      ? String(value)
      : expression.replaceAll("${_[0]}", String(value))
    return resolved.includes("${") || /_\[\d+]/.test(resolved) ? "" : resolved
  })
}

const validateFuzzy = (tree: MutableTree, fields: MatterFields, address: MetaAddress): void => {
  const pending = [...tree]
  while (pending.length > 0) {
    const particle = pending.shift()!
    if (particle.kind === "fuzzy") {
      const actual = particle.children?.map(({particle: branch}) => branch.kind === "wimp" ? branch.src : "") ?? []
      const expected = resolvedFuzzySources(particle, fields)
      if (expected.length === 0 || !isDeepStrictEqual(actual, expected)) {
        throw new MatterPatchError(
          "invalid_matter_composition",
          `${address} Fuzzy branches do not match its enum source binding`,
        )
      }
      fuzzyBranch(particle)
    }
    for (const child of particle.children ?? []) pending.push(child.particle)
  }
}

const operationAddresses = (request: MetaMatterRequest): MetaAddress[] => request.operation === "add"
  ? [request.to.address]
  : request.operation === "remove"
    ? [request.target.address]
    : [...new Set([request.from.address, request.to.address])]

export const planMetaMatterPatch = (
  request: MetaMatterRequest,
  snapshots: readonly MatterParentSnapshot[],
  timestamp = Date.now(),
): MetaMatterPatchPlan => {
  const parents = new Map(snapshots.map((snapshot) => [snapshot.address, snapshot] as const))
  const addresses = operationAddresses(request)
  for (const address of addresses) parent(parents, address)
  const afterTrees = new Map(addresses.map((address) => [
    address,
    clone(parent(parents, address).matter) as MutableTree,
  ] as const))
  const before = addresses.map((address) => treeVersion(address, afterTrees.get(address)!))
    .sort((left, right) => left.wimp.localeCompare(right.wimp))
  const previous = new Map<MutableParticle, {wimp: MetaAddress; id: number}>()
  for (const address of addresses) for (const entry of flatten(afterTrees.get(address)!)) {
    previous.set(entry.particle, {wimp: address, id: entry.id})
  }

  let beforeValue: Record<string, unknown> | null = null
  let afterValue: Record<string, unknown> | null = null
  let resultParticle: MutableParticle | null = null
  if (request.operation === "add") {
    resultParticle = clone(request.particle)
    insertAt(afterTrees.get(request.to.address)!, request.to, resultParticle)
  } else if (request.operation === "remove") {
    const tree = afterTrees.get(request.target.address)!
    const located = locate(tree, request.target)
    if (!isDeepStrictEqual(located.particle, request.particle)) {
      throw new MatterPatchError("occurrence_mismatch", "Matter remove particle does not match the located occurrence")
    }
    beforeValue = valueAt(treeVersion(request.target.address, tree), request.target)
    removeAt(located)
  } else {
    const sourceTree = afterTrees.get(request.from.address)!
    const located = locate(sourceTree, request.from)
    if (!isDeepStrictEqual(located.particle, request.particle)) {
      throw new MatterPatchError("occurrence_mismatch", "Matter move particle does not match the located occurrence")
    }
    beforeValue = valueAt(treeVersion(request.from.address, sourceTree), request.from)
    const moving = located.particle
    const target = placementChildren(afterTrees.get(request.to.address)!, request.to)
    const targetParent = target.parent
    if (targetParent) {
      const pending = [moving]
      while (pending.length > 0) {
        const current = pending.shift()!
        if (current === targetParent) {
          throw new MatterPatchError("invalid_placement", "Matter occurrence cannot move into its own subtree")
        }
        for (const child of current.children ?? []) pending.push(child.particle)
      }
    }
    removeAt(located)
    insertInto(target, request.to, moving)
    resultParticle = moving
  }

  for (const address of addresses) {
    validateFuzzy(afterTrees.get(address)!, parent(parents, address).fields ?? {}, address)
  }
  const after = addresses.map((address) => mappedTreeVersion(address, afterTrees.get(address)!, previous))
    .sort((left, right) => left.wimp.localeCompare(right.wimp))
  const treePatch: MatterTreePatch = {before, after}

  if (request.operation === "add" || request.operation === "move") {
    const resultEntry = flatten(afterTrees.get(request.to.address)!).find(({particle}) => particle === resultParticle)
    afterValue = after.find(({wimp}) => wimp === request.to.address)!.entries
      .find(({id}) => id === resultEntry?.id) ?? null
    if (!afterValue) throw new MatterPatchError("occurrence_missing", "Matter result is absent after planning")
  }

  const value = {
    ...clone(request.operation === "remove" ? beforeValue! : afterValue!),
    treePatch,
  }
  const part = request.operation === "add"
    ? {part: "inflaton" as const, op: "add" as const, path: "matter", ts: timestamp, value}
    : request.operation === "remove"
      ? {part: "inflaton" as const, op: "remove" as const, path: "matter", ts: timestamp, value}
      : {
          part: "inflaton" as const,
          op: "move" as const,
          path: "matter",
          from: `${request.from.address}#${Number(beforeValue!.id)}`,
          ts: timestamp,
          value,
        }

  const sourceEdits = addresses.map((address): MatterSourceEdit => {
    const snapshot = parent(parents, address)
    return {
      address,
      targetPath: snapshot.targetPath,
      beforeSource: snapshot.source,
      afterSource: rewriteMatter(snapshot.source, afterTrees.get(address)!),
    }
  }).filter(({beforeSource, afterSource}) => beforeSource !== afterSource)
    .sort((left, right) => left.address.localeCompare(right.address))
  if (sourceEdits.length === 0) {
    throw new MatterPatchError("invalid_placement", "Matter operation does not change source")
  }
  return {particle: {parts: [part]}, sourceEdits}
}
