/**
Проверка общей семантики нормализованной Matter topology.

Модуль не знает синтаксис DSL, wire protocol или способ хранения. Он принимает
готовый {@link MatterSchema} и закрепляет инварианты, которые одинаковы для
loader, authoring и Boundary. Реализация не зависит от Bun или Node.js и может
использоваться в browser bundle.

@packageDocumentation
*/

import type {
  MatterBindingValue,
  MatterFields,
  MatterParticle,
  MatterSchema,
  TopologyBasis,
} from "@metafor/types/metafor/matter"

const DEFAULT_MAX_DEPTH = 32
const DEFAULT_MAX_CHILDREN = 512
const DEFAULT_MAX_PARTICLES = 4_096

const HUB_ADDRESS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/
const MASS_KEY_PATH_RE = /^\/mass\/([^/]+)$/
const EXECUTABLE_BINDING_RE = /=>|\bfunction\b|\bnew\s+|(?:\b[$A-Z_a-z][$\w]*|\]|\))\s*(?:\?\.)?\s*\(/

/**
Ограничения одного прохода {@link validateMatterSchema}.

Depth считается от корневого particle с уровнем `0`. Width применяется к
корневой коллекции и к `children` каждого particle. Все значения должны быть
неотрицательными safe integers.
*/
export interface MatterValidationOptions {
  label?: string
  maxDepth?: number
  maxChildren?: number
  maxParticles?: number
}

interface ValidationContext {
  fields: MatterFields
  maxDepth: number
  maxChildren: number
  maxParticles: number
  particles: number
}

const violation = (location: string, message: string): never => {
  throw new Error(`Matter violation at "${location}": ${message}`)
}

const limit = (value: number | undefined, fallback: number, name: string): number => {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Matter validation option "${name}" must be a non-negative safe integer`)
  }
  return value
}

const pathsOf = (binding: MatterBindingValue, location: string, usage: string): string[] => {
  if (typeof binding === "string") {
    return violation(location, `${usage} must be a normalized binding descriptor.`)
  }

  const paths = binding.data === undefined
    ? []
    : Array.isArray(binding.data) ? binding.data : [binding.data]
  if (paths.length === 0 || paths.some((path) => path.length === 0)) {
    return violation(location, `${usage} must declare at least one dependency.`)
  }
  if (binding.directMass !== undefined) {
    return violation(location, `${usage} must not declare directMass metadata.`)
  }
  return paths
}

const basisOf = (path: string, fields: MatterFields): TopologyBasis => {
  if (path === "/state") return "state"
  if (path === "/mass" || path.startsWith("/mass/")) return "mass"
  if (path === "/energy" || path.startsWith("/energy/")) return "energy"

  const field = fields[path]
  if (!field) return "unknown"
  if (field.type === "enum") return "enum"
  if (field.type === "array") return "array"
  return "ordinary"
}

const describeBasis = (path: string, fields: MatterFields): string => {
  const basis = basisOf(path, fields)
  if (basis === "state") return 'state "/state"'
  if (basis === "mass") return `mass path "${path}"`
  if (basis === "energy") return `energy path "${path}"`
  if (basis === "unknown") return `unsupported path "${path}"`
  return `field "${path}" of type "${fields[path]!.type}"`
}

const validateTopologyBasis = (
  binding: MatterBindingValue,
  fields: MatterFields,
  location: string,
  usage: string,
  expected: "state" | "enum" | "array",
  exactOne: boolean,
): string[] => {
  const paths = pathsOf(binding, location, usage)
  if (exactOne && paths.length !== 1) {
    return violation(location, `${usage} must depend on exactly one ${expected} source, received ${paths.length}.`)
  }
  for (const path of paths) {
    if (basisOf(path, fields) === expected) continue
    violation(
      location,
      `${usage} uses ${describeBasis(path, fields)}. Only ${expected} may drive topology in matter.`,
    )
  }
  return paths
}

const validateAddress = (src: string, location: string): void => {
  if (!HUB_ADDRESS_RE.test(src)) {
    violation(
      location,
      `src "${src}" is not a valid Meta address. Use exactly owner/repository, such as "owner/project".`,
    )
  }
}

type NormalizedLiteral = string | number | boolean | null

type ParsedLiteral =
  | {ok: true; value: NormalizedLiteral}
  | {ok: false}

const parseSingleQuoted = (source: string): ParsedLiteral => {
  let value = ""
  for (let index = 1; index < source.length - 1; index++) {
    const char = source[index]!
    if (char === "\n" || char === "\r") return {ok: false}
    if (char !== "\\") {
      value += char
      continue
    }

    const escaped = source[++index]
    if (escaped === undefined) return {ok: false}
    if (escaped === "n") value += "\n"
    else if (escaped === "r") value += "\r"
    else if (escaped === "t") value += "\t"
    else if (escaped === "b") value += "\b"
    else if (escaped === "f") value += "\f"
    else if (escaped === "v") value += "\v"
    else if (escaped === "0") value += "\0"
    else if (escaped === "u") {
      const hex = source.slice(index + 1, index + 5)
      if (!/^[0-9A-Fa-f]{4}$/.test(hex)) return {ok: false}
      value += String.fromCharCode(Number.parseInt(hex, 16))
      index += 4
    } else value += escaped
  }
  return {ok: true, value}
}

const parseNormalizedLiteral = (source: string): ParsedLiteral => {
  const value = source.trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown
      return typeof parsed === "string" ? {ok: true, value: parsed} : {ok: false}
    } catch {
      return {ok: false}
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return parseSingleQuoted(value)
  if (value === "true") return {ok: true, value: true}
  if (value === "false") return {ok: true, value: false}
  if (value === "null") return {ok: true, value: null}
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(value)) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? {ok: true, value: parsed} : {ok: false}
  }
  return {ok: false}
}

const splitConditional = (source: string): [string, string, string] | undefined => {
  let quote: '"' | "'" | "`" | undefined
  let escaped = false
  let depth = 0
  let question = -1
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    if (quote !== undefined) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }
    if (char === "(") depth++
    else if (char === ")") depth--
    else if (depth === 0 && char === "?" && question === -1) question = index
    else if (depth === 0 && char === ":" && question !== -1) {
      return [source.slice(0, question), source.slice(question + 1, index), source.slice(index + 1)]
    }
  }
}

const compareNormalizedSlot = (source: string, variant: string): boolean | undefined => {
  const left = /^_\[0\]\s*(===|!==)\s*([\s\S]+)$/.exec(source.trim())
  const right = /^([\s\S]+?)\s*(===|!==)\s*_\[0\]$/.exec(source.trim())
  const operator = left?.[1] ?? right?.[2]
  const literal = parseNormalizedLiteral(left?.[2] ?? right?.[1] ?? "")
  if (!operator || !literal.ok) return
  const equal = variant === literal.value
  return operator === "===" ? equal : !equal
}

const resolveNormalizedBranch = (source: string, variant: string): string | undefined => {
  const value = source.trim()
  if (value === "_[0]") return variant

  const literal = parseNormalizedLiteral(value)
  if (literal.ok) return String(literal.value)

  const conditional = splitConditional(value)
  if (!conditional) return
  const condition = compareNormalizedSlot(conditional[0], variant)
  if (condition === undefined) return
  return resolveNormalizedBranch(condition ? conditional[1] : conditional[2], variant)
}

const interpolationEnd = (source: string, start: number): number => {
  let depth = 1
  let quote: '"' | "'" | "`" | undefined
  let escaped = false
  for (let index = start; index < source.length; index++) {
    const char = source[index]!
    if (quote !== undefined) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'" || char === "`") quote = char
    else if (char === "{") depth++
    else if (char === "}" && --depth === 0) return index
  }
  return -1
}

const resolveNormalizedFuzzySource = (
  expression: string | undefined,
  variant: string,
  location: string,
): string => {
  if (expression === undefined) return variant

  const trimmed = expression.trim()
  const template = trimmed.startsWith("`") && trimmed.endsWith("`")
    ? trimmed.slice(1, -1)
    : trimmed
  if (!template.includes("${")) {
    const resolved = resolveNormalizedBranch(template, variant)
    if (resolved !== undefined) return resolved
    return violation(location, `Fuzzy expression "${expression}" is not a supported normalized enum projection.`)
  }

  let result = ""
  let cursor = 0
  while (cursor < template.length) {
    const start = template.indexOf("${", cursor)
    if (start === -1) {
      result += template.slice(cursor)
      break
    }
    result += template.slice(cursor, start)
    const end = interpolationEnd(template, start + 2)
    if (end === -1) return violation(location, `Fuzzy expression "${expression}" has an unclosed interpolation.`)
    const resolved = resolveNormalizedBranch(template.slice(start + 2, end), variant)
    if (resolved === undefined) {
      return violation(location, `Fuzzy expression "${expression}" is not a supported normalized enum projection.`)
    }
    result += resolved
    cursor = end + 1
  }
  return result
}

const resolveMatterFuzzySourcesAt = (
  binding: MatterBindingValue,
  fields: MatterFields,
  location: string,
): string[] => {
  const [fieldKey] = validateTopologyBasis(binding, fields, location, "dynamic src", "enum", true)
  const variants = fields[fieldKey!]?.values
  if (!Array.isArray(variants) || variants.length === 0) {
    return violation(location, `enum field "${fieldKey}" must declare at least one variant.`)
  }
  const expression = typeof binding === "string" ? binding : binding.expr
  return variants.map((variant) => resolveNormalizedFuzzySource(expression, variant, location))
}

/**
Разрешает ordered WIMP `src` одного нормализованного Fuzzy binding.

Resolver принимает ровно одну enum dependency и ограниченный expression с
плейсхолдером `_[0]`: прямую подстановку либо strict equality ternary со
скалярными литералами. Он не вызывает `eval`/`Function` и не исполняет DSL или
JavaScript source; неизвестная форма expression завершается fail-closed.

@param binding - Нормализованный Fuzzy predicate descriptor.
@param fields - Field definitions Meta, содержащие referenced enum variants.
@returns По одному `src` на variant в порядке enum declaration.

@throws `Error`, если binding не ссылается ровно на один enum, enum пуст либо
  expression выходит за поддерживаемую нормализованную grammar.

@example
```ts
const sources = resolveMatterFuzzySources(
  {data: "mode", expr: "demo/${_[0]}"},
  {mode: {type: "enum", values: ["card", "table"]}},
)
```
*/
export const resolveMatterFuzzySources = (
  binding: Exclude<MatterBindingValue, string>,
  fields: MatterFields,
): string[] => resolveMatterFuzzySourcesAt(binding, fields, "matter.fuzzy.predicateBinding")

const validatePlainBinding = (binding: MatterBindingValue | undefined, location: string): void => {
  if (binding === undefined || typeof binding === "string") return
  pathsOf(binding, location, "binding")
}

const validateRuntimeBinding = (
  binding: MatterBindingValue | undefined,
  domain: "mass" | "energy",
  location: string,
): void => {
  if (binding === undefined) return
  if (typeof binding === "string") {
    if (domain === "mass") {
      violation(location, "mass binding must include normalized directMass metadata.")
    }
    const source = binding.trim()
    if (!source.startsWith("{") || !source.endsWith("}") || EXECUTABLE_BINDING_RE.test(source)) {
      violation(location, "energy binding must be a pure object projection.")
    }
    return
  }

  const paths = binding.data === undefined
    ? []
    : Array.isArray(binding.data) ? binding.data : [binding.data]
  if (paths.length === 0 || paths.some((path) => path.length === 0)) {
    violation(location, `${domain} binding must declare a /${domain} dependency.`)
  }
  for (const path of paths) {
    const validRoot = path === `/${domain}` || path.startsWith(`/${domain}/`)
    if (!validRoot || path.includes("[item]") || path.includes("[index]") || path.includes("../")) {
      violation(
        location,
        `${domain} binding dependency "${path}" must use /${domain}[/...] without map-relative context.`,
      )
    }
  }
  if (binding.expr !== undefined && EXECUTABLE_BINDING_RE.test(binding.expr)) {
    violation(location, `${domain} binding must not create or call executable resources.`)
  }

  if (domain === "energy") {
    if (binding.directMass !== undefined) {
      violation(location, "energy binding must not declare directMass metadata.")
    }
    return
  }

  const direct = binding.directMass
  if (direct === undefined) {
    return violation(location, "mass binding must include normalized directMass metadata.")
  }
  if (direct.kind === "whole") {
    if (paths.length !== 1 || paths[0] !== "/mass" || binding.expr !== undefined) {
      violation(location, "whole directMass must depend only on /mass.")
    }
    return
  }
  if (direct.entries.length === 0) {
    violation(location, "directMass keys must contain a non-empty key mapping.")
  }

  const dependencySources = new Set<string>()
  for (const path of paths) {
    const source = MASS_KEY_PATH_RE.exec(path)?.[1]
    if (!source || !IDENTIFIER_RE.test(source) || dependencySources.has(source)) {
      return violation(location, "directMass keys require unique /mass/<identifier> dependencies.")
    }
    dependencySources.add(source)
  }

  const targets = new Set<string>()
  const mappedSources = new Set<string>()
  for (const entry of direct.entries) {
    if (
      !IDENTIFIER_RE.test(entry.target) ||
      !IDENTIFIER_RE.test(entry.source) ||
      targets.has(entry.target) ||
      mappedSources.has(entry.source) ||
      !dependencySources.has(entry.source)
    ) {
      violation(location, "directMass key mapping is invalid.")
    }
    targets.add(entry.target)
    mappedSources.add(entry.source)
  }
  if (direct.entries.length !== paths.length || mappedSources.size !== dependencySources.size) {
    violation(location, "directMass must map every declared /mass/<key> dependency exactly once.")
  }
}

const validateChildren = (
  particle: MatterParticle,
  context: ValidationContext,
  location: string,
  depth: number,
): void => {
  const children = particle.children ?? []
  if (children.length > context.maxChildren) {
    violation(location, `particle has ${children.length} children; limit is ${context.maxChildren}.`)
  }

  let axionMode: "logical" | "conditional" | undefined
  let sawElse = false
  for (let index = 0; index < children.length; index++) {
    const child = children[index]!
    const childLocation = `${location}.children[${index}]`

    if (particle.kind === "wimp" || particle.kind === "macho") {
      if (child.edgeSlot !== "child") {
        violation(`${childLocation}.edgeSlot`, `Matter ${particle.kind} accepts only child edges.`)
      }
    } else if (particle.kind === "fuzzy") {
      if (child.edgeSlot !== "branch") {
        violation(`${childLocation}.edgeSlot`, "Matter fuzzy accepts only branch edges.")
      }
      if (child.particle.kind !== "wimp") {
        violation(`${childLocation}.particle`, "Fuzzy branches must contain WIMP particles.")
      }
    } else if (child.edgeSlot === "child") {
      if (axionMode === "conditional") {
        violation(`${location}.children`, "Axion cannot mix logical and conditional child edges.")
      }
      axionMode = "logical"
    } else if (child.edgeSlot === "then" || child.edgeSlot === "else") {
      if (axionMode === "logical") {
        violation(`${location}.children`, "Axion cannot mix logical and conditional child edges.")
      }
      axionMode = "conditional"
      if (child.edgeSlot === "then" && sawElse) {
        violation(`${childLocation}.edgeSlot`, "Axion then children must precede else children.")
      }
      if (child.edgeSlot === "else") sawElse = true
    } else {
      violation(`${childLocation}.edgeSlot`, "Matter axion accepts only child, then or else edges.")
    }

    validateParticle(child.particle, context, `${childLocation}.particle`, depth + 1)
  }
}

const validateParticle = (
  particle: MatterParticle,
  context: ValidationContext,
  location: string,
  depth: number,
): void => {
  if (depth > context.maxDepth) {
    violation(location, `subtree exceeds ${context.maxDepth} nested levels.`)
  }
  context.particles++
  if (context.particles > context.maxParticles) {
    violation(location, `tree exceeds ${context.maxParticles} particles.`)
  }

  if (particle.kind === "wimp") {
    validateAddress(particle.src, `${location}.src`)
    validatePlainBinding(particle.fieldsBinding, `${location}.fieldsBinding`)
    validateRuntimeBinding(particle.massBinding, "mass", `${location}.massBinding`)
    validateRuntimeBinding(particle.energyBinding, "energy", `${location}.energyBinding`)
  } else if (particle.kind === "fuzzy") {
    if (particle.fuzzyKind !== "dynamic-meta") {
      violation(`${location}.fuzzyKind`, "Fuzzy kind must be dynamic-meta.")
    }
    const expectedSources = resolveMatterFuzzySourcesAt(
      particle.predicateBinding,
      context.fields,
      `${location}.predicateBinding`,
    )
    const branches = particle.children ?? []
    if (branches.length === 0) {
      violation(`${location}.children`, "Fuzzy must contain its resolved WIMP branches.")
    }
    if (branches.length !== expectedSources.length) {
      violation(
        `${location}.children`,
        `Fuzzy must contain one resolved WIMP branch per enum variant; expected ${expectedSources.length}, received ${branches.length}.`,
      )
    }
    if (branches.every((branch) => branch.particle.kind === "wimp")) {
      for (let index = 0; index < expectedSources.length; index++) {
        const actual = branches[index]!.particle as Extract<MatterParticle, {kind: "wimp"}>
        const expected = expectedSources[index]!
        if (actual.src !== expected) {
          violation(
            `${location}.children[${index}].particle.src`,
            `Fuzzy branch src "${actual.src}" does not match enum branch ${index}; expected "${expected}".`,
          )
        }
      }
    }
  } else if (particle.kind === "axion") {
    validateTopologyBasis(
      particle.predicateBinding,
      context.fields,
      `${location}.predicateBinding`,
      "Axion predicate",
      "state",
      false,
    )
  } else {
    validateTopologyBasis(
      particle.collectionBinding,
      context.fields,
      `${location}.collectionBinding`,
      "Macho collection",
      "array",
      true,
    )
  }

  validateChildren(particle, context, location, depth)
}

/**
Проверяет семантические законы уже нормализованного Matter forest.

Функция не меняет schema и не исполняет DSL/JavaScript expression. Для Fuzzy
она использует browser-safe {@link resolveMatterFuzzySources}; затем проверяет
Meta addresses, topology basis, композицию edges, прямые Mass/Energy проекции и
ограничивает размер дерева до безопасного для authoring и Boundary.

@param schema - Нормализованные particles, созданные Matter adapter.
@param fields - Field definitions того же Meta; по ним различаются `enum`,
  `array` и ordinary topology sources.
@param options - Diagnostic label и лимиты одного forest. По умолчанию:
  depth `32`, width `512`, total `4096` particles.

@throws `Error` с точным location первой нарушенной Matter-семантики.

@example
```ts
validateMatterSchema(
  [{kind: "axion", predicateBinding: {data: "/state"}}],
  {},
  {label: "example.matter"},
)
```
*/
export const validateMatterSchema = (
  schema: MatterSchema,
  fields: MatterFields,
  options: MatterValidationOptions = {},
): void => {
  const label = options.label?.trim() || "matter"
  const context: ValidationContext = {
    fields,
    maxDepth: limit(options.maxDepth, DEFAULT_MAX_DEPTH, "maxDepth"),
    maxChildren: limit(options.maxChildren, DEFAULT_MAX_CHILDREN, "maxChildren"),
    maxParticles: limit(options.maxParticles, DEFAULT_MAX_PARTICLES, "maxParticles"),
    particles: 0,
  }

  if (schema.length > context.maxChildren) {
    violation(label, `root has ${schema.length} particles; limit is ${context.maxChildren}.`)
  }
  for (let index = 0; index < schema.length; index++) {
    validateParticle(schema[index]!, context, `${label}[${index}]`, 0)
  }
}
