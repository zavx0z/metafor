import type { NodeCondition, NodeElement, NodeLogical, NodeMap, NodeMeta, NodeText, NodeType, ValueDynamic, ValueVariable } from "@metafor/template"
import type {
  LocalTopologyEntanglementSeed,
  LocalTopologyFragment,
  LocalTopologyLink,
  LocalTopologyMetaLike,
  LocalTopologyObject,
  LocalTopologyPlacement,
  LocalTopologyPlacementRelation,
  LocalTopologyReference,
} from "./topology.t"

type FieldLike = {
  type?: string
  values?: unknown
}

type TopologyAddressPrefix = "w" | "a" | "f" | "m"

type FuzzyConditionBasis =
  | {
      kind: "state"
      dataPath: "/state"
    }
  | {
      kind: "enum"
      dataPath: string
      field: string
    }

type BuilderState = {
  objectIndex: number
  placementIndex: number
  referenceIndex: number
  objects: Record<string, LocalTopologyObject>
  placements: Record<string, LocalTopologyPlacement>
  links: LocalTopologyLink[]
  references: LocalTopologyReference[]
  entanglementSeeds: LocalTopologyEntanglementSeed[]
  roots: string[]
}

const HUB_ADDRESS_RE = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+$/

function normalizeFieldPath(dataPath: string): string | null {
  const match = /^\/(?:value|fields)\/([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(dataPath)
  if (match?.[1]) return match[1]
  return null
}

function isEnumFieldType(fieldType: string): boolean {
  return fieldType === "enum" || fieldType.startsWith("enum<")
}

function getEnumValues(meta: LocalTopologyMetaLike, dataPath: string): Array<string | number> | null {
  const fieldName = normalizeFieldPath(dataPath)
  if (!fieldName) return null

  const field = meta.fields?.[fieldName] as FieldLike | undefined
  if (!field?.type) return null

  if (!isEnumFieldType(String(field.type))) {
    return null
  }

  if (!Array.isArray(field.values) || field.values.length === 0) {
    throw new Error(`Поле "${fieldName}" объявлено как enum, но не содержит статических вариантов для topology.`)
  }

  const variants = field.values.filter((value): value is string | number => typeof value === "string" || typeof value === "number")
  if (variants.length !== field.values.length) {
    throw new Error(`Поле "${fieldName}" содержит неподдерживаемые enum-значения для topology.`)
  }

  return variants
}

function resolveFuzzyConditionBasis(meta: LocalTopologyMetaLike, dataPath: string): FuzzyConditionBasis {
  if (dataPath === "/state") {
    return {
      kind: "state",
      dataPath,
    }
  }

  const fieldName = normalizeFieldPath(dataPath)
  if (!fieldName) {
    throw new Error(
      `basis "${dataPath}" не поддерживается. Разрешены только "/state" и прямые enum-пути "/value/<field>" или "/fields/<field>".`,
    )
  }

  const field = meta.fields?.[fieldName] as FieldLike | undefined
  if (!field?.type) {
    throw new Error(
      `basis "${dataPath}" ссылается на поле "${fieldName}", но оно не объявлено как enum topology-field в meta.fields.`,
    )
  }

  const fieldType = String(field.type)
  if (!isEnumFieldType(fieldType)) {
    throw new Error(
      `basis "${dataPath}" ссылается на поле "${fieldName}" типа "${fieldType}", но Fuzzy branch selection разрешает только state или enum.`,
    )
  }

  return {
    kind: "enum",
    dataPath,
    field: fieldName,
  }
}

function validateConditionDataPaths(meta: LocalTopologyMetaLike, nodePath: string, dataPaths: string[]): void {
  for (const dataPath of dataPaths) {
    try {
      resolveFuzzyConditionBasis(meta, dataPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`NodeCondition в "${nodePath}" использует недопустимый branch-choice basis: ${message}`)
    }
  }
}

function makeObjectId(state: BuilderState, prefix: TopologyAddressPrefix): string {
  const id = `${prefix}${state.objectIndex}`
  state.objectIndex += 1
  return id
}

function makePlacementId(state: BuilderState): string {
  const id = `p${state.placementIndex}`
  state.placementIndex += 1
  return id
}

function makeReferenceId(state: BuilderState): string {
  const id = `r${state.referenceIndex}`
  state.referenceIndex += 1
  return id
}

function sanitizeSegment(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
  return cleaned || "node"
}

function buildAddress(parentAddress: string | undefined, prefix: TopologyAddressPrefix, segment: string): string {
  const next = `${prefix}:${sanitizeSegment(segment)}`
  return parentAddress ? `${parentAddress}/${next}` : `/${next}`
}

function collectDataPaths(value: ValueDynamic | ValueVariable | undefined): string[] {
  if (!value) return []
  if ("data" in value) {
    return Array.isArray(value.data) ? value.data : [value.data]
  }
  return []
}

function getNodeMetaSrc(node: NodeMeta): string | ValueDynamic | ValueVariable | undefined {
  const stringSrc = node.string?.src
  if (typeof stringSrc === "string") return stringSrc
  if (stringSrc && typeof stringSrc === "object" && "data" in stringSrc) {
    return stringSrc
  }

  const booleanSrc = node.boolean?.src
  if (booleanSrc && typeof booleanSrc === "object" && "data" in booleanSrc) {
    return booleanSrc
  }

  return undefined
}

function addPlacement(
  state: BuilderState,
  objectId: string,
  address: string,
  relation: LocalTopologyPlacementRelation,
  parentId?: string,
  branchValue?: string | number,
): string {
  const placementId = makePlacementId(state)
  const placement: LocalTopologyPlacement = {
    id: placementId,
    objectId,
    address,
    relation,
    ...(parentId ? { parentId } : {}),
    ...(branchValue !== undefined ? { branchValue } : {}),
  }
  state.placements[placementId] = placement
  if (!parentId) {
    state.roots.push(placementId)
  } else if (relation !== "root") {
    state.links.push({
      from: parentId,
      to: placementId,
      relation,
    })
  }
  return placementId
}

function addEntanglementSeed(
  state: BuilderState,
  placementId: string,
  objectId: string,
  kind: LocalTopologyObject["kind"],
  address: string,
  dataPaths: string[],
  referenceIds: string[] = [],
): void {
  state.entanglementSeeds.push({
    placementId,
    objectId,
    kind,
    address,
    dataPaths,
    referenceIds,
  })
}

function addReference(
  state: BuilderState,
  placementId: string,
  objectId: string,
  tag: string,
  src: string,
  via: "static" | "enum",
  field?: string,
  value?: string | number,
): string {
  if (!HUB_ADDRESS_RE.test(src)) {
    throw new Error(`Невозможно нормализовать topology src "${src}": требуется hub-адрес owner/path.`)
  }

  const id = makeReferenceId(state)
  const reference: LocalTopologyReference = {
    id,
    placementId,
    objectId,
    tag,
    src,
    via,
    ...(field ? { field } : {}),
    ...(value !== undefined ? { value } : {}),
  }
  state.references.push(reference)
  return id
}

function evaluateVariantExpression(expr: string, value: string | number): string {
  const tuple = [value]

  try {
    const asExpression = new Function("_", `return (${expr});`)
    const result = asExpression(tuple)
    if (typeof result === "string") return result
  } catch {
    // fall through to template mode
  }

  const templateFn = new Function("_", `return \`${expr}\`;`)
  const result = templateFn(tuple)
  if (typeof result !== "string") {
    throw new Error(`Выражение "${expr}" не даёт строковый topology src.`)
  }
  return result
}

function compileMetaSourceVariants(meta: LocalTopologyMetaLike, node: NodeMeta): null | {
  dataPath: string
  field: string
  values: Array<string | number>
  expr?: string
  resolve(value: string | number): string
} {
  const rawSrc = getNodeMetaSrc(node)
  if (!rawSrc || typeof rawSrc === "string") return null

  const dataPaths = collectDataPaths(rawSrc)
  if (dataPaths.length !== 1) {
    throw new Error(`meta.src в "${node.tag}" должен зависеть только от одного topology enum, чтобы DSL мог собрать локальную topology.`)
  }

  const dataPath = dataPaths[0]!
  const field = normalizeFieldPath(dataPath)
  const values = getEnumValues(meta, dataPath)

  if (!field || !values) {
    throw new Error(`meta.src в "${node.tag}" зависит от "${dataPath}", но это не статический enum topology-field.`)
  }

  if ("expr" in rawSrc) {
    return {
      dataPath,
      field,
      values,
      expr: rawSrc.expr,
      resolve(value: string | number): string {
        return evaluateVariantExpression(rawSrc.expr, value)
      },
    }
  }

  return {
    dataPath,
    field,
    values,
    resolve(value: string | number): string {
      if (typeof value !== "string") {
        throw new Error(`Поле "${field}" должно давать строковые hub-адреса в meta.src.`)
      }
      return value
    },
  }
}

function compileNode(
  meta: LocalTopologyMetaLike,
  node: NodeType,
  state: BuilderState,
  parentPlacementId: string | undefined,
  parentAddress: string | undefined,
  nodePath: string,
  relation: LocalTopologyPlacementRelation = parentPlacementId ? "contains" : "root",
): void {
  switch (node.type) {
    case "el":
      compileCarrierChildren(meta, node, state, parentPlacementId, parentAddress, nodePath)
      return
    case "text":
      return
    case "log":
      compileLogical(meta, node, state, parentPlacementId, parentAddress, nodePath, relation)
      return
    case "cond":
      compileCondition(meta, node, state, parentPlacementId, parentAddress, nodePath, relation)
      return
    case "map":
      compileMap(meta, node, state, parentPlacementId, parentAddress, nodePath, relation)
      return
    case "meta":
      compileMetaNode(meta, node, state, parentPlacementId, parentAddress, nodePath, relation)
      return
  }
}

function compileCarrierChildren(
  meta: LocalTopologyMetaLike,
  node: NodeElement | NodeMeta,
  state: BuilderState,
  parentPlacementId: string | undefined,
  parentAddress: string | undefined,
  nodePath: string,
): void {
  node.child?.forEach((child, index) => {
    compileNode(meta, child, state, parentPlacementId, parentAddress, `${nodePath}.${index}`)
  })
}

function compileLogical(
  meta: LocalTopologyMetaLike,
  node: NodeLogical,
  state: BuilderState,
  parentPlacementId: string | undefined,
  parentAddress: string | undefined,
  nodePath: string,
  relation: LocalTopologyPlacementRelation,
): void {
  const objectId = makeObjectId(state, "a")
  const dataPaths = Array.isArray(node.data) ? node.data : [node.data]

  state.objects[objectId] = {
    id: objectId,
    kind: "axion",
    nodePath,
    sourceNode: node,
    dataPaths,
    ...(node.expr ? { expr: node.expr } : {}),
  }

  const address = buildAddress(parentAddress, "a", nodePath)
  const placementId = addPlacement(state, objectId, address, relation, parentPlacementId)

  // Axion не участвует в entanglement — это не выбор ветви и не множественность
  // Это логическая группировка, которая не создаёт альтернативных миров

  node.child.forEach((child, index) => {
    compileNode(meta, child, state, placementId, address, `${nodePath}.${index}`)
  })
}

function compileCondition(
  meta: LocalTopologyMetaLike,
  node: NodeCondition,
  state: BuilderState,
  parentPlacementId: string | undefined,
  parentAddress: string | undefined,
  nodePath: string,
  relation: LocalTopologyPlacementRelation,
): void {
  const dataPaths = Array.isArray(node.data) ? node.data : [node.data]

  // Fuzzy branch-choice допускает только state и enum topology-fields.
  validateConditionDataPaths(meta, nodePath, dataPaths)

  const objectId = makeObjectId(state, "f")
  state.objects[objectId] = {
    id: objectId,
    kind: "fuzzy",
    nodePath,
    sourceNode: node,
    selector: {
      kind: "condition",
      dataPaths,
      ...(node.expr ? { expr: node.expr } : {}),
    },
  }

  const address = buildAddress(parentAddress, "f", nodePath)
  const placementId = addPlacement(state, objectId, address, relation, parentPlacementId)
  addEntanglementSeed(state, placementId, objectId, "fuzzy", address, dataPaths)

  node.child.forEach((child, index) => {
    const branchRelation: LocalTopologyPlacementRelation = index === 0 ? "true" : "false"
    compileNode(meta, child, state, placementId, address, `${nodePath}.${index}`, branchRelation)
  })
}

function compileMap(
  meta: LocalTopologyMetaLike,
  node: NodeMap,
  state: BuilderState,
  parentPlacementId: string | undefined,
  parentAddress: string | undefined,
  nodePath: string,
  relation: LocalTopologyPlacementRelation,
): void {
  const objectId = makeObjectId(state, "m")
  state.objects[objectId] = {
    id: objectId,
    kind: "macho",
    nodePath,
    sourceNode: node,
    dataPath: node.data,
  }

  const address = buildAddress(parentAddress, "m", nodePath)
  const placementId = addPlacement(state, objectId, address, relation, parentPlacementId)
  
  // MACHO на основе array не участвует в entanglement.
  // array задаёт множественность ветвей (branch expansion), но не сцепляется
  // с внешними реакциями через entanglement.
  // Изменение array происходит только через внутренний процесс атома и Higgs boson.

  node.child.forEach((child, index) => {
    compileNode(meta, child, state, placementId, address, `${nodePath}.${index}`, "expands")
  })
}

function compileStaticMetaNode(
  meta: LocalTopologyMetaLike,
  node: NodeMeta,
  state: BuilderState,
  parentPlacementId: string | undefined,
  parentAddress: string | undefined,
  nodePath: string,
  relation: LocalTopologyPlacementRelation,
  src?: string | ValueDynamic | ValueVariable,
  variant?: { field: string; value: string | number },
): string {
  const objectId = makeObjectId(state, "w")
  const srcString: string | undefined = src && typeof src === "object" && "data" in src
    ? (Array.isArray(src.data) ? src.data[0] : src.data)
    : src
  const tagString = typeof node.tag === "string" ? node.tag : (Array.isArray(node.tag.data) ? node.tag.data[0] : node.tag.data)
  if (!tagString) {
    throw new Error(`meta node tag is undefined at ${nodePath}`)
  }
  state.objects[objectId] = {
    id: objectId,
    kind: "wimp",
    nodePath,
    sourceNode: node,
    tag: tagString,
    ...(srcString ? { src: srcString } : {}),
    srcMode: variant ? "enum" : srcString ? "static" : "none",
    ...(variant ? { variant } : {}),
  }

  const segment = variant ? `${nodePath}-${String(variant.value)}` : nodePath
  const address = buildAddress(parentAddress, "w", segment)
  const placementId = addPlacement(state, objectId, address, relation, parentPlacementId, variant?.value)

  const dataPaths = variant ? [`/value/${variant.field}`] : []
  const referenceIds: string[] = []

  if (srcString) {
    referenceIds.push(addReference(state, placementId, objectId, tagString, srcString, variant ? "enum" : "static", variant?.field, variant?.value))
  }

  addEntanglementSeed(state, placementId, objectId, "wimp", address, dataPaths, referenceIds)

  node.child?.forEach((child, index) => {
    compileNode(meta, child, state, placementId, address, `${nodePath}.${index}`)
  })

  return placementId
}

function compileMetaNode(
  meta: LocalTopologyMetaLike,
  node: NodeMeta,
  state: BuilderState,
  parentPlacementId: string | undefined,
  parentAddress: string | undefined,
  nodePath: string,
  relation: LocalTopologyPlacementRelation,
): void {
  const rawSrc = getNodeMetaSrc(node)
  if (typeof rawSrc === "string" || rawSrc === undefined) {
    compileStaticMetaNode(meta, node, state, parentPlacementId, parentAddress, nodePath, relation, typeof rawSrc === "string" ? rawSrc : undefined)
    return
  }

  const variants = compileMetaSourceVariants(meta, node)
  if (!variants) {
    compileStaticMetaNode(meta, node, state, parentPlacementId, parentAddress, nodePath, relation)
    return
  }

  const fuzzyId = makeObjectId(state, "f")
  state.objects[fuzzyId] = {
    id: fuzzyId,
    kind: "fuzzy",
    nodePath,
    sourceNode: node,
    selector: {
      kind: "enum",
      dataPath: variants.dataPath,
      field: variants.field,
      values: variants.values,
      ...(variants.expr ? { expr: variants.expr } : {}),
    },
  }

  const fuzzyAddress = buildAddress(parentAddress, "f", `${nodePath}-src`)
  const fuzzyPlacementId = addPlacement(state, fuzzyId, fuzzyAddress, relation, parentPlacementId)
  addEntanglementSeed(state, fuzzyPlacementId, fuzzyId, "fuzzy", fuzzyAddress, [variants.dataPath])

  variants.values.forEach((value) => {
    const src = variants.resolve(value)
    compileStaticMetaNode(
      meta,
      node,
      state,
      fuzzyPlacementId,
      fuzzyAddress,
      nodePath,
      "branch",
      src,
      { field: variants.field, value },
    )
  })
}

export function compileLocalTopologyFragment(meta: LocalTopologyMetaLike): LocalTopologyFragment {
  const state: BuilderState = {
    objectIndex: 0,
    placementIndex: 0,
    referenceIndex: 0,
    objects: {},
    placements: {},
    links: [],
    references: [],
    entanglementSeeds: [],
    roots: [],
  }

  meta.gravity?.forEach((node, index) => {
    compileNode(meta, node, state, undefined, undefined, String(index))
  })

  return {
    meta: meta.name,
    objects: state.objects,
    roots: state.roots,
    placements: state.placements,
    links: state.links,
    references: state.references,
    entanglementSeeds: state.entanglementSeeds,
  }
}
