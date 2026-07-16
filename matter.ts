import { parse } from "@metafor/template"
import type { Fields } from "@metafor/types/metafor/fields"
import type { MatterDeclaration, MatterFields, MatterSchema, MatterTemplateSchema, TopologyBasis } from "@metafor/types/metafor/matter"
import type { Mass } from "@metafor/types/metafor/schema"
import type { MatterBindingValue, MatterChild, MatterParticle } from "@metafor/types/metafor/matter"
import type { NodeType } from "@metafor/types/template/node/index"
import type { NodeCondition } from "@metafor/types/template/node/condition"
import type { NodeLogical } from "@metafor/types/template/node/logical"
import type { NodeMap } from "@metafor/types/template/node/map"
import type { NodeMeta } from "@metafor/types/template/node/meta"

const HUB_ADDRESS_RE = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+$/

const FIELD_PATH_PREFIXES = ["/value/", "/fields/"] as const

const normalizeMatterPath = (path: string): string => {
  const prefix = FIELD_PATH_PREFIXES.find((item) => path.startsWith(item))
  if (!prefix) return path

  const suffix = path.slice(prefix.length)
  const [key] = suffix.split(/[./\[]/, 1)
  return key || path
}

const normalizeMatterData = <T extends string | string[]>(data: T): T =>
  (Array.isArray(data) ? data.map(normalizeMatterPath) : normalizeMatterPath(data)) as T

const normalizeMatterBinding = <T extends MatterBindingValue | undefined>(value: T): T => {
  if (value === undefined || typeof value === "string" || value.data === undefined) return value
  const binding = value as Exclude<MatterBindingValue, string>
  return {...binding, data: normalizeMatterData(binding.data!)} as T
}

const extractFieldKey = (path: string): string | undefined => {
  const key = normalizeMatterPath(path)
  if (key.startsWith("/") || key.startsWith("[") || key.startsWith(".")) return
  return key || undefined
}

const resolveTopologyBasis = (path: string, fields: MatterFields): TopologyBasis => {
  if (path === "/state") return "state"
  if (path.startsWith("/mass/")) return "mass"

  const key = extractFieldKey(path)
  if (!key) return "unknown"

  const field = fields[key]
  if (!field) return "unknown"

  if (field.type === "enum") return "enum"
  if (field.type === "array") return "array"
  return "ordinary"
}

const describeBasis = (path: string, fields: MatterFields): string => {
  const basis = resolveTopologyBasis(path, fields)
  if (basis === "state") return 'state "/state"'
  if (basis === "mass") return `mass path "${path}"`
  if (basis === "unknown") return `unsupported path "${path}"`

  const key = extractFieldKey(path)
  if (!key) return `path "${path}"`

  const field = fields[key]
  if (!field) return `unknown field "${key}" from "${path}"`
  return `field "${key}" of type "${field.type}"`
}

const toPathList = (value: string | string[]): string[] => (Array.isArray(value) ? value : [value])

const validateBasisList = (
  paths: string | string[],
  fields: MatterFields,
  location: string,
  allowed: TopologyBasis[],
  usage: string,
): void => {
  for (const path of toPathList(paths)) {
    const basis = resolveTopologyBasis(path, fields)
    if (allowed.includes(basis)) continue

    const allowedText = allowed.join(" or ")
    throw new Error(
      `Matter violation at "${location}": ${usage} uses ${describeBasis(path, fields)}. ` +
        `Only ${allowedText} may drive topology in matter.`,
    )
  }
}

const validateStaticSrc = (src: string, location: string): void => {
  if (!HUB_ADDRESS_RE.test(src)) {
    throw new Error(
      `Matter violation at "${location}": src "${src}" is not a valid hub address. ` +
        `Use owner/path form such as "owner/project".`,
    )
  }
}

const validateDynamicSrc = (src: Exclude<NodeMeta["src"], string>, fields: MatterFields, location: string): void => {
  if (!src.data) {
    throw new Error(`Matter violation at "${location}": dynamic src must have data expression.`)
  }
  const paths = toPathList(src.data as string | string[])
  if (paths.length !== 1) {
    throw new Error(
      `Matter violation at "${location}": dynamic src must depend on exactly one enum field, received ${paths.length} paths.`,
    )
  }

  validateBasisList(paths[0]!, fields, location, ["enum"], "dynamic src")
}

const validateMetaNode = (node: NodeMeta, fields: MatterFields, location: string): void => {
  if (node.tag !== "meta-for") {
    throw new Error(
      `Matter violation at "${location}": only <meta-for /> is allowed in matter, received <${node.tag}>.`,
    )
  }

  if (typeof node.src === "string") {
    validateStaticSrc(node.src, `${location}.src`)
    return
  }

  validateDynamicSrc(node.src, fields, `${location}.src`)
}

const validateNode = (node: NodeType, fields: MatterFields, location: string): void => {
  switch (node.type) {
    case "meta":
      validateMetaNode(node, fields, location)
      node.child?.forEach((child, index) => validateNode(child, fields, `${location}.child[${index}]`))
      return
    case "log":
      validateBasisList(node.data, fields, location, ["state"], "logical branch")
      node.child.forEach((child, index) => validateNode(child, fields, `${location}.child[${index}]`))
      return
    case "cond":
      validateBasisList(node.data, fields, location, ["state"], "conditional branch")
      node.child.forEach((child, index) => validateNode(child, fields, `${location}.child[${index}]`))
      return
    case "map":
      validateBasisList(node.data, fields, location, ["array"], "map branch")
      node.child.forEach((child, index) => validateNode(child, fields, `${location}.child[${index}]`))
      return
    case "el":
      throw new Error(
        `Matter violation at "${location}": HTML element <${node.tag}> is not allowed in matter. ` +
          `Matter declares atom topology only; move HTML structure into Bulk.`,
      )
    case "text":
      throw new Error(
        `Matter violation at "${location}": text nodes are not allowed in matter. ` +
          `Matter declares atom topology only; move text rendering into Bulk.`,
      )
  }
}

const normalizeMatterNode = (node: NodeType): NodeType => {
  switch (node.type) {
    case "meta":
      return {
        ...node,
        src: normalizeMatterBinding(node.src),
        ...(node.fields !== undefined ? {fields: normalizeMatterBinding(node.fields)} : {}),
        ...(node.mass !== undefined ? {mass: normalizeMatterBinding(node.mass)} : {}),
        ...(node.child !== undefined ? {child: node.child.map(normalizeMatterNode)} : {}),
      }
    case "log":
      return {
        ...node,
        data: normalizeMatterData(node.data),
        child: node.child.map(normalizeMatterNode),
      }
    case "cond":
      return {
        ...node,
        data: normalizeMatterData(node.data),
        child: node.child.map(normalizeMatterNode),
      }
    case "map":
      return {
        ...node,
        data: normalizeMatterPath(node.data),
        child: node.child.map(normalizeMatterNode),
      }
    default:
      return node
  }
}

const createContinuationSrc = (expr: string | undefined, value: string | number): string => {
  if (!expr) return String(value)

  const escaped = expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return String(new Function("_", `return \`${escaped}\``)([value]))
}

const resolveMetaBranchSrcs = (fields: MatterFields, node: { src: string | { data?: string | string[]; expr?: string } }): string[] => {
  if (typeof node.src === "string") return [node.src]

  const source = node.src
  const paths = source.data !== undefined ? (Array.isArray(source.data) ? source.data : [source.data]) : []
  const firstKey = paths[0]
  if (!firstKey || firstKey.startsWith("/") || firstKey.startsWith("[") || firstKey.startsWith(".")) return []

  const field = fields[firstKey]
  if (!field || field.type !== "enum") return []

  return (field.values ?? []).map((variant) => createContinuationSrc(source.expr, variant))
}

const childRelations = (fields: MatterFields, children: NodeType[] | undefined): MatterChild[] | undefined => {
  if (!Array.isArray(children) || children.length === 0) return

  const relations = children.flatMap((child) => projectMatterNode(fields, child))
  return relations.length > 0
    ? relations.map((particle): MatterChild => ({edgeSlot: "child", particle}))
    : undefined
}

const projectMatterNode = (fields: MatterFields, node: NodeType): MatterParticle[] => {
  if (node.type === "meta") {
    const metaNode = node as {
      src: string | { data?: string | string[]; expr?: string }
      fields?: MatterBindingValue
      mass?: MatterBindingValue
      child?: NodeType[]
    }
    const children = childRelations(fields, metaNode.child)

    if (typeof metaNode.src === "string") {
      return [
        {
          kind: "wimp",
          src: metaNode.src,
          ...(metaNode.fields !== undefined ? {fieldsBinding: metaNode.fields} : {}),
          ...(metaNode.mass !== undefined ? {massBinding: metaNode.mass} : {}),
          ...(children !== undefined ? {children} : {}),
        },
      ]
    }

    return [
      {
        kind: "fuzzy",
        fuzzyKind: "dynamic-meta",
        predicateBinding: metaNode.src,
        children: resolveMetaBranchSrcs(fields, metaNode).map((src): MatterChild => ({
          edgeSlot: "branch",
          particle: {
            kind: "wimp",
            src,
            ...(metaNode.fields !== undefined ? {fieldsBinding: metaNode.fields} : {}),
            ...(metaNode.mass !== undefined ? {massBinding: metaNode.mass} : {}),
            ...(children !== undefined ? {children} : {}),
          },
        })),
      },
    ]
  }

  if (node.type === "cond") {
    const conditionNode = node as NodeCondition
    const thenParticle = conditionNode.child?.[0] ? projectMatterNode(fields, conditionNode.child[0])[0] : undefined
    const elseParticle = conditionNode.child?.[1] ? projectMatterNode(fields, conditionNode.child[1])[0] : undefined
    const children: MatterChild[] = []
    if (thenParticle) children.push({edgeSlot: "then", particle: thenParticle})
    if (elseParticle) children.push({edgeSlot: "else", particle: elseParticle})

    return [
      {
        kind: "axion",
        predicateBinding: conditionNode.expr !== undefined ? {data: conditionNode.data, expr: conditionNode.expr} : {data: conditionNode.data},
        ...(children.length > 0 ? {children} : {}),
      },
    ]
  }

  if (node.type === "log") {
    const logicalNode = node as NodeLogical
    const children = childRelations(fields, logicalNode.child)
    return [
      {
        kind: "axion",
        predicateBinding: logicalNode.expr !== undefined ? {data: logicalNode.data, expr: logicalNode.expr} : {data: logicalNode.data},
        ...(children !== undefined ? {children} : {}),
      },
    ]
  }

  if (node.type === "map") {
    const mapNode = node as NodeMap
    const children = childRelations(fields, mapNode.child)
    return [
      {
        kind: "macho",
        collectionBinding: {data: mapNode.data},
        ...(children !== undefined ? {children} : {}),
      },
    ]
  }

  return []
}

export const parseMatter = <ɸ extends Fields = Fields, m extends Mass = Mass, 𝛴 extends string = string>(
  matter: MatterDeclaration<ɸ, m, 𝛴>,
  fields: MatterFields,
  metaName?: string,
): MatterSchema => {
  const nodes = parse(matter).map(normalizeMatterNode)
  validateMatter(nodes, fields, metaName)
  return nodes.flatMap((node) => projectMatterNode(fields, node))
}

export function validateMatter(matter: MatterTemplateSchema | undefined, fields: MatterFields, metaName?: string): void {
  if (!matter) return

  matter.forEach((node, index) => {
    const location = metaName ? `${metaName}.matter[${index}]` : `matter[${index}]`
    validateNode(node, fields, location)
  })
}
