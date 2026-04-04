import { parse } from "@metafor/template"
import type { Fields } from "./fields.t.ts"
import type { MatterDeclaration, MatterFields, MatterSchema, NodeCondition, NodeLogical, NodeMeta, NodeType } from "./matter.t.ts"
import type { Mass } from "./metafor.t.ts"
import type { State } from "./superposition.t.ts"

type TopologyBasis = "state" | "enum" | "array" | "ordinary" | "mass" | "unknown"

const HUB_ADDRESS_RE = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+$/

const isFieldPath = (path: string): boolean => path.startsWith("/value/") || path.startsWith("/fields/")

const extractFieldKey = (path: string): string | undefined => {
  if (!isFieldPath(path)) return

  const suffix = path.startsWith("/value/") ? path.slice("/value/".length) : path.slice("/fields/".length)
  const [key] = suffix.split(/[./\[]/, 1)
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

const toSinglePath = (value: string | string[]): string | undefined => {
  const paths = toPathList(value)
  return paths.length === 1 ? paths[0] : undefined
}

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
        `Use owner/path form such as "zavx0z/git".`,
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

const validateRedundantEnumNullGuard = (
  node: NodeLogical | NodeCondition,
  fields: MatterFields,
  location: string,
): void => {
  const basisPath = toSinglePath(node.data)
  if (!basisPath) return
  if (resolveTopologyBasis(basisPath, fields) !== "enum") return
  if (node.child.length !== 1) return

  const child = node.child[0]
  if (!child || child.type !== "meta") return
  if (typeof child.src === "string") return

  const srcPath = toSinglePath(child.src.data)
  if (srcPath !== basisPath) return

  const key = extractFieldKey(basisPath) ?? basisPath
  throw new Error(
    `Matter violation at "${location}": enum field "${key}" must not be used as a null-guard for its own dynamic src. ` +
      `Render <meta-for /> directly; optional enum null must not produce a "...-null" actor.`,
  )
}

const validateNode = (node: NodeType, fields: MatterFields, location: string): void => {
  switch (node.type) {
    case "meta":
      validateMetaNode(node, fields, location)
      node.child?.forEach((child, index) => validateNode(child, fields, `${location}.child[${index}]`))
      return
    case "log":
      validateBasisList(node.data, fields, location, ["state", "enum"], "logical branch")
      validateRedundantEnumNullGuard(node, fields, location)
      node.child.forEach((child, index) => validateNode(child, fields, `${location}.child[${index}]`))
      return
    case "cond":
      validateBasisList(node.data, fields, location, ["state", "enum"], "conditional branch")
      validateRedundantEnumNullGuard(node, fields, location)
      node.child.forEach((child, index) => validateNode(child, fields, `${location}.child[${index}]`))
      return
    case "map":
      validateBasisList(node.data, fields, location, ["array"], "map branch")
      node.child.forEach((child, index) => validateNode(child, fields, `${location}.child[${index}]`))
      return
    case "el":
      throw new Error(
        `Matter violation at "${location}": HTML element <${node.tag}> is not allowed in matter. ` +
          `Matter declares actor topology only; move HTML structure into Bulk.`,
      )
    case "text":
      throw new Error(
        `Matter violation at "${location}": text nodes are not allowed in matter. ` +
          `Matter declares actor topology only; move text rendering into Bulk.`,
      )
  }
}

export const parseMatter = <ɸ extends Fields = Fields, m extends Mass = Mass, 𝛴 extends State = State>(
  matter: MatterDeclaration<ɸ, m, 𝛴>,
): MatterSchema => parse(matter)

export function validateMatter(matter: MatterSchema | undefined, fields: MatterFields, metaName?: string): void {
  if (!matter) return

  matter.forEach((node, index) => {
    const location = metaName ? `${metaName}.matter[${index}]` : `matter[${index}]`
    validateNode(node, fields, location)
  })
}
