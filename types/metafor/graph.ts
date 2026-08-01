/**
 * Schema marker of the single public Graph contract. JSON is only its wire
 * serialization and does not name a second domain format.
 */
export const GRAPH_SCHEMA = "metafor/graph" as const
export const READ_GRAPH_METHOD = "readGraph" as const

export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | {[key: string]: JsonValue}
export type JsonPointer = "" | `/${string}`
export type DocumentPointer = `#${JsonPointer}`

declare const MetaAddressBrand: unique symbol

/** Canonical safe two-segment `<owner>/<repository>` address. */
export type MetaAddress = string & {readonly [MetaAddressBrand]: "MetaAddress"}

/** Parameters accepted by the Dark Monad `readGraph` RPC. */
export interface ReadGraphParams {
  root: MetaAddress
}

interface MetaFieldBase {
  key: string
  label?: string
}

type MetaOptionalField<Kind extends string, Default> =
  MetaFieldBase & {
    type: Kind
    required?: never
    default?: Default
    id?: never
  }

type MetaRequiredIdentifiedField<Kind extends string, Default> =
  MetaFieldBase & {
    type: Kind
    required: true
    default: Default
    id?: true
  }

export type MetaStringField =
  | MetaOptionalField<"string", string>
  | MetaRequiredIdentifiedField<"string", string>

export type MetaNumberField =
  | MetaOptionalField<"number", number>
  | MetaRequiredIdentifiedField<"number", number>

export type MetaBooleanField =
  | MetaOptionalField<"boolean", boolean>
  | MetaRequiredIdentifiedField<"boolean", boolean>

export type MetaArrayField =
  MetaFieldBase & {
    type: "array"
    data?: string
    id?: never
  } & (
    | {required?: never; default?: number[]}
    | {required: true; default: number[]}
  )

export type MetaEnumField =
  MetaFieldBase & {
    type: "enum"
    values: string[]
  } & (
    | {required?: never; default?: string; id?: never}
    | {required: true; default: string; id?: true}
  )

export type MetaField =
  | MetaStringField
  | MetaNumberField
  | MetaBooleanField
  | MetaArrayField
  | MetaEnumField

export interface MetaRegExp {
  source: string
  flags: string
}

export type MetaBooleanCondition =
  | boolean
  | null
  | {null?: boolean; eq?: boolean; notEq?: boolean; logicalEq?: boolean}

export type MetaStringCondition =
  | string
  | null
  | MetaRegExp
  | {
      null?: boolean
      startsWith?: string
      endsWith?: string
      include?: string
      pattern?: MetaRegExp
      eq?: string
      notEq?: string
      notInclude?: string
      notStartsWith?: string
      notEndsWith?: string
      length?: number | {min?: number; max?: number}
      between?: [string, string]
      in?: string[]
      notIn?: string[]
    }

export type MetaNumberCondition =
  | number
  | null
  | {
      null?: boolean
      eq?: number
      gt?: number
      gte?: number
      lt?: number
      lte?: number
      notEq?: number
      notGt?: number
      notGte?: number
      notLt?: number
      notLte?: number
      between?: [number, number]
      in?: number[]
      notIn?: number[]
    }

export interface MetaArrayItemCondition {
  gt?: number
  gte?: number
  lt?: number
  lte?: number
  eq?: number
}

export type MetaArrayCondition =
  | number[]
  | null
  | {
      null?: boolean
      length?: number | {min?: number; max?: number}
      includes?: number
      notIncludes?: number
      every?: MetaArrayItemCondition
      some?: MetaArrayItemCondition
      isEmpty?: boolean
    }

export type MetaEnumCondition =
  | string
  | null
  | {
      null?: boolean
      eq?: string
      notEq?: string
      oneOf?: string[]
      notOneOf?: string[]
    }

export type MetaCondition =
  | MetaBooleanCondition
  | MetaStringCondition
  | MetaNumberCondition
  | MetaArrayCondition
  | MetaEnumCondition

export type MetaConditionWave = {[field: string]: MetaCondition}
export type MetaTransitions = {[targetState: string]: MetaConditionWave}

export interface MetaState {
  name: string
  transitions: MetaTransitions | null
}

export interface MetaMass {
  key: string
  format: "json" | "binary"
  label?: string
  description?: string
}

export type MetaExecutionEnv =
  | "browser"
  | "node"
  | "worker"
  | "server"
  | "any"

export interface MetaActionDescriptor {
  src: string
  importSpecifier?: string
  wrapperSrc?: string
  read?: string[]
}

export interface MetaHandlerDescriptor {
  src: string
  read?: string[]
  write?: string[]
}

export interface MetaActionProcessDescriptor {
  type: "action"
  label?: string
  desc?: string
  env?: MetaExecutionEnv[]
  action: MetaActionDescriptor
  success?: MetaHandlerDescriptor
  error?: MetaHandlerDescriptor
}

export interface MetaFinallyProcessDescriptor {
  type: "finally"
  label?: string
  desc?: string
  env?: MetaExecutionEnv[]
  before: MetaActionDescriptor
}

export interface MetaProcess {
  key: string
  declaration: MetaActionProcessDescriptor | MetaFinallyProcessDescriptor
}

export interface MetaReaction {
  key: string
  label: string
  desc: string | null
  cond: string
  src: string
  read: string[]
  write: string[]
  states: string[]
}

export type MetaMatterDirectMass =
  | {kind: "whole"}
  | {
      kind: "keys"
      entries: Array<{target: string; source: string}>
    }

export type MetaMatterBinding =
  | string
  | {
      data?: string | string[]
      expr?: string
      directMass?: MetaMatterDirectMass
    }

export interface MetaMatterWimpChild {
  edgeSlot: "child"
  particle: MetaMatterParticle
}

export interface MetaMatterFuzzyChild {
  edgeSlot: "branch"
  particle: MetaMatterWimp
}

export interface MetaMatterAxionChild {
  edgeSlot: "then" | "else" | "child"
  particle: MetaMatterParticle
}

export interface MetaMatterMachoChild {
  edgeSlot: "child"
  particle: MetaMatterParticle
}

export interface MetaMatterWimp {
  kind: "wimp"
  src: MetaAddress
  fieldsBinding?: MetaMatterBinding
  massBinding?: MetaMatterBinding
  energyBinding?: MetaMatterBinding
  children?: MetaMatterWimpChild[]
}

export interface MetaMatterFuzzy {
  kind: "fuzzy"
  fuzzyKind: "dynamic-meta"
  predicateBinding: MetaMatterBinding
  children?: MetaMatterFuzzyChild[]
}

export interface MetaMatterAxion {
  kind: "axion"
  predicateBinding: MetaMatterBinding
  children?: MetaMatterAxionChild[]
}

export interface MetaMatterMacho {
  kind: "macho"
  collectionBinding: MetaMatterBinding
  children?: MetaMatterMachoChild[]
}

export type MetaMatterParticle =
  | MetaMatterWimp
  | MetaMatterFuzzy
  | MetaMatterAxion
  | MetaMatterMacho

export interface MetaTemplate {
  name: string
  desc?: string
  fields: MetaField[]
  superposition: MetaState[]
  mass: MetaMass[]
  processes: MetaProcess[]
  reactions?: MetaReaction[]
  matter?: MetaMatterParticle[]
  bulk?: {view: string}
}

export interface RuntimeAtom {
  kind: "atom"
  declaration: DocumentPointer
  meta: MetaAddress
  state: string | null
  values: {[field: string]: JsonValue}
  children?: RuntimeNode[]
}

export interface RuntimeTopology {
  kind: "topology"
  declaration: DocumentPointer
  topology: "fuzzy" | "axion" | "macho"
  children?: RuntimeNode[]
}

export type RuntimeNode = RuntimeAtom | RuntimeTopology

/**
 * The single public Graph assembled on demand by Dark Monad from the Dark
 * declaration projection and the current Boundary projection. JSON is only
 * the transport serialization of this Graph, not its domain name or a second
 * public format. Graph is never authored or canonical storage. A downstream
 * domain such as Bulk may retain a validated Graph as its local current read
 * model, but must refresh it through `readGraph`, not assemble a competing
 * Graph.
 */
export interface Graph {
  schema: typeof GRAPH_SCHEMA
  root: MetaAddress
  template: {[address: MetaAddress]: MetaTemplate}
  runtime: {
    roots: RuntimeNode[]
  }
}

export interface ValidationIssue {
  path: JsonPointer
  code: string
  message: string
}

export type ValidationResult<T> =
  | {ok: true; value: T}
  | {ok: false; issues: ValidationIssue[]}

/** Closed validation surface for the single Graph contract. */
export interface GraphValidators {
  graph(input: unknown): ValidationResult<Graph>
}

type RecordValue = Record<string, unknown>
type OccurrenceExpectation = {
  pointer: DocumentPointer
}
type OccurrencePlan =
  | {mode: "static"; items: OccurrenceExpectation[]}
  | {mode: "axion"; alternatives: OccurrenceExpectation[][]}
  | {mode: "macho"; items: OccurrenceExpectation[]}
  | {mode: "fuzzy"; items: OccurrenceExpectation[]}

const ADDRESS_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const EXECUTION_ENVS = new Set<MetaExecutionEnv>([
  "browser",
  "node",
  "worker",
  "server",
  "any",
])
const FIELD_TYPES = new Set(["string", "number", "boolean", "array", "enum"])
const TOPOLOGIES = new Set(["fuzzy", "axion", "macho"])

const isRecord = (value: unknown): value is RecordValue => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const pointerToken = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1")

const childPath = (path: JsonPointer, key: string | number): JsonPointer =>
  `${path}/${pointerToken(String(key))}` as JsonPointer

const isMetaAddress = (value: unknown): value is MetaAddress => {
  if (typeof value !== "string") return false
  const segments = value.split("/")
  return segments.length === 2 && segments.every((segment) => ADDRESS_SEGMENT.test(segment))
}

/** Validates and brands a canonical public Meta address. */
export const parseMetaAddress = (value: string): MetaAddress | null =>
  isMetaAddress(value) ? value : null

class Validator {
  readonly issues: ValidationIssue[] = []

  issue(path: JsonPointer, code: string, message: string): void {
    this.issues.push({path, code, message})
  }

  record(value: unknown, path: JsonPointer, name: string): value is RecordValue {
    if (isRecord(value)) return true
    this.issue(path, "invalid_type", `${name} must be an object`)
    return false
  }

  array(value: unknown, path: JsonPointer, name: string): value is unknown[] {
    if (Array.isArray(value)) return true
    this.issue(path, "invalid_type", `${name} must be an array`)
    return false
  }

  string(value: unknown, path: JsonPointer, name: string): value is string {
    if (typeof value === "string") return true
    this.issue(path, "invalid_type", `${name} must be a string`)
    return false
  }

  closed(value: RecordValue, path: JsonPointer, allowed: readonly string[]): void {
    const known = new Set(allowed)
    for (const key of Object.keys(value)) {
      if (!known.has(key)) {
        this.issue(childPath(path, key), "unknown_property", `Property "${key}" is not allowed`)
      }
    }
  }

  required(value: RecordValue, path: JsonPointer, keys: readonly string[]): void {
    for (const key of keys) {
      if (!Object.hasOwn(value, key)) {
        this.issue(childPath(path, key), "required", `Property "${key}" is required`)
      }
    }
  }

  address(value: unknown, path: JsonPointer): value is MetaAddress {
    if (isMetaAddress(value)) return true
    this.issue(path, "invalid_meta_address", "Expected canonical <owner>/<repository> address")
    return false
  }

  stringArray(value: unknown, path: JsonPointer, name: string): value is string[] {
    if (!this.array(value, path, name)) return false
    value.forEach((item, index) => this.string(item, childPath(path, index), `${name} item`))
    return value.every((item) => typeof item === "string")
  }

  unique(values: readonly string[], path: JsonPointer, name: string): void {
    const seen = new Set<string>()
    values.forEach((value, index) => {
      if (seen.has(value)) {
        this.issue(childPath(path, index), "duplicate_key", `${name} "${value}" is duplicated`)
      }
      seen.add(value)
    })
  }

  json(value: unknown, path: JsonPointer): value is JsonValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true
    if (typeof value === "number") {
      if (Number.isFinite(value)) return true
      this.issue(path, "invalid_json_number", "JSON numbers must be finite")
      return false
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => this.json(item, childPath(path, index)))
      return true
    }
    if (isRecord(value)) {
      Object.entries(value).forEach(([key, item]) => this.json(item, childPath(path, key)))
      return true
    }
    this.issue(path, "non_json_value", "Value must be closed JSON without undefined, functions, symbols or live objects")
    return false
  }

  field(value: unknown, path: JsonPointer): void {
    if (!this.record(value, path, "Field")) return
    this.closed(value, path, ["key", "type", "required", "default", "label", "values", "id", "data"])
    this.required(value, path, ["key", "type"])
    this.string(value.key, childPath(path, "key"), "Field key")
    if (!FIELD_TYPES.has(value.type as string)) {
      this.issue(childPath(path, "type"), "invalid_field_type", "Unsupported Field type")
      return
    }
    if (value.required !== undefined && value.required !== true) {
      this.issue(childPath(path, "required"), "invalid_literal", "required may only be true when present")
    }
    if (value.id !== undefined && value.id !== true) {
      this.issue(childPath(path, "id"), "invalid_literal", "id may only be true when present")
    }
    if (value.id === true && (value.required !== true || value.type === "array")) {
      this.issue(
        childPath(path, "id"),
        "invalid_field_property",
        "id is only valid on required primitive or enum Fields",
      )
    }
    if (value.label !== undefined) this.string(value.label, childPath(path, "label"), "Field label")
    if (value.data !== undefined) {
      if (value.type !== "array") {
        this.issue(childPath(path, "data"), "invalid_field_property", "data is only valid for array Fields")
      }
      this.string(value.data, childPath(path, "data"), "Field data")
    }
    if (value.required === true && !Object.hasOwn(value, "default")) {
      this.issue(childPath(path, "default"), "required", "Required Field must declare a default")
    }

    const defaultPath = childPath(path, "default")
    if (value.type === "string" && value.default !== undefined && typeof value.default !== "string") {
      this.issue(defaultPath, "invalid_default", "String Field default must be a string")
    }
    if (value.type === "number" && value.default !== undefined &&
      (typeof value.default !== "number" || !Number.isFinite(value.default))) {
      this.issue(defaultPath, "invalid_default", "Number Field default must be a finite number")
    }
    if (value.type === "boolean" && value.default !== undefined && typeof value.default !== "boolean") {
      this.issue(defaultPath, "invalid_default", "Boolean Field default must be a boolean")
    }
    if (value.type === "array") {
      if (value.default !== undefined &&
        (!Array.isArray(value.default) || value.default.some((item) => typeof item !== "number" || !Number.isFinite(item)))) {
        this.issue(defaultPath, "invalid_default", "Array Field default must be finite number[]")
      }
      if (value.values !== undefined) {
        this.issue(childPath(path, "values"), "invalid_field_property", "values is only valid for enum Fields")
      }
    } else if (value.values !== undefined && value.type !== "enum") {
      this.issue(childPath(path, "values"), "invalid_field_property", "values is only valid for enum Fields")
    }
    if (value.type === "enum") {
      if (this.stringArray(value.values, childPath(path, "values"), "Enum variants")) {
        this.unique(value.values, childPath(path, "values"), "Enum variant")
        if (value.values.length === 0) {
          this.issue(childPath(path, "values"), "empty_variants", "Enum must declare at least one variant")
        }
        if (value.default !== undefined && !value.values.includes(value.default as string)) {
          this.issue(defaultPath, "invalid_default", "Enum default must be one of its variants")
        }
      }
    }
  }

  conditionOperators(value: RecordValue, path: JsonPointer, allowed: readonly string[]): void {
    if (Object.keys(value).length === 0) {
      this.issue(path, "empty_condition", "Condition must contain at least one operator")
      return
    }
    const operators = new Set(allowed)
    for (const key of Object.keys(value)) {
      if (!operators.has(key)) {
        this.issue(
          childPath(path, key),
          "invalid_condition_operator",
          `Condition operator "${key}" is not valid for this Field type`,
        )
      }
    }
  }

  finiteNumber(value: unknown, path: JsonPointer, name: string): boolean {
    if (typeof value === "number" && Number.isFinite(value)) return true
    this.issue(path, "invalid_condition_operand", `${name} must be a finite number`)
    return false
  }

  regexp(value: unknown, path: JsonPointer): boolean {
    if (!this.record(value, path, "Regular expression descriptor")) return false
    this.conditionOperators(value, path, ["source", "flags"])
    this.required(value, path, ["source", "flags"])
    const source = this.string(value.source, childPath(path, "source"), "Regular expression source")
    const flags = this.string(value.flags, childPath(path, "flags"), "Regular expression flags")
    if (flags && (
      !/^(?!.*(.).*\1)[dgimsuvy]*$/.test(value.flags as string) ||
      ((value.flags as string).includes("u") && (value.flags as string).includes("v"))
    )) {
      this.issue(childPath(path, "flags"), "invalid_condition_operand", "Regular expression flags are invalid")
      return false
    }
    if (!source || !flags) return false
    try {
      new RegExp(value.source as string, value.flags as string)
    } catch {
      this.issue(
        childPath(path, "source"),
        "invalid_regexp",
        "Regular expression source does not compile with the declared flags",
      )
      return false
    }
    return true
  }

  conditionArray(
    value: unknown,
    path: JsonPointer,
    item: (value: unknown, path: JsonPointer) => boolean,
    name: string,
    exactLength?: number,
  ): boolean {
    if (!this.array(value, path, name)) return false
    if (exactLength !== undefined && value.length !== exactLength) {
      this.issue(path, "invalid_condition_operand", `${name} must contain exactly ${exactLength} items`)
    }
    return value.map((entry, index) => item(entry, childPath(path, index))).every(Boolean)
  }

  condition(value: unknown, path: JsonPointer, field: RecordValue): void {
    const type = field.type
    const optional = field.required !== true
    if (value === null) {
      if (!optional) {
        this.issue(path, "invalid_condition_operand", "null is only valid for an optional Field")
      }
      return
    }

    if (!isRecord(value)) {
      if (type === "boolean" && typeof value === "boolean") return
      if (type === "string" && typeof value === "string") return
      if (type === "number" && typeof value === "number" && Number.isFinite(value)) return
      if (type === "array" && Array.isArray(value) &&
        value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) return
      if (type === "enum" && typeof value === "string" &&
        Array.isArray(field.values) && field.values.includes(value)) return
      this.issue(path, "invalid_condition_operand", `Condition operand does not match ${String(type)} Field`)
      return
    }

    if (type === "string" && (
      Object.hasOwn(value, "source") || Object.hasOwn(value, "flags")
    ) && Object.keys(value).every((key) => key === "source" || key === "flags")) {
      this.regexp(value, path)
      return
    }

    const validateNull = (item: unknown, itemPath: JsonPointer): boolean => {
      if (typeof item !== "boolean") {
        this.issue(itemPath, "invalid_condition_operand", "null operator must be boolean")
        return false
      }
      if (!optional) {
        this.issue(itemPath, "invalid_condition_operator", "null operator is only valid for an optional Field")
        return false
      }
      return true
    }
    const validateBoolean = (item: unknown, itemPath: JsonPointer): boolean => {
      if (typeof item === "boolean") return true
      this.issue(itemPath, "invalid_condition_operand", "Boolean operator requires a boolean")
      return false
    }
    const validateString = (item: unknown, itemPath: JsonPointer): boolean => {
      if (typeof item === "string") return true
      this.issue(itemPath, "invalid_condition_operand", "String operator requires a string")
      return false
    }
    const validateNumber = (item: unknown, itemPath: JsonPointer): boolean =>
      this.finiteNumber(item, itemPath, "Numeric operator")

    if (type === "boolean") {
      this.conditionOperators(value, path, ["null", "eq", "notEq", "logicalEq"])
      for (const [operator, operand] of Object.entries(value)) {
        if (operator === "null") validateNull(operand, childPath(path, operator))
        else if (["eq", "notEq", "logicalEq"].includes(operator)) validateBoolean(operand, childPath(path, operator))
      }
      return
    }

    if (type === "number") {
      const numeric = ["eq", "gt", "gte", "lt", "lte", "notEq", "notGt", "notGte", "notLt", "notLte"]
      this.conditionOperators(value, path, ["null", ...numeric, "between", "in", "notIn"])
      for (const [operator, operand] of Object.entries(value)) {
        const operandPath = childPath(path, operator)
        if (operator === "null") validateNull(operand, operandPath)
        else if (numeric.includes(operator)) validateNumber(operand, operandPath)
        else if (operator === "between") this.conditionArray(operand, operandPath, validateNumber, "Number range", 2)
        else if (operator === "in" || operator === "notIn") {
          this.conditionArray(operand, operandPath, validateNumber, "Number set")
        }
      }
      return
    }

    if (type === "string") {
      const strings = [
        "startsWith", "endsWith", "include", "eq", "notEq", "notInclude",
        "notStartsWith", "notEndsWith",
      ]
      this.conditionOperators(value, path, ["null", ...strings, "pattern", "length", "between", "in", "notIn"])
      for (const [operator, operand] of Object.entries(value)) {
        const operandPath = childPath(path, operator)
        if (operator === "null") validateNull(operand, operandPath)
        else if (strings.includes(operator)) validateString(operand, operandPath)
        else if (operator === "pattern") this.regexp(operand, operandPath)
        else if (operator === "between") this.conditionArray(operand, operandPath, validateString, "String range", 2)
        else if (operator === "in" || operator === "notIn") {
          this.conditionArray(operand, operandPath, validateString, "String set")
        } else if (operator === "length") {
          if (isRecord(operand)) {
            this.conditionOperators(operand, operandPath, ["min", "max"])
            Object.entries(operand).forEach(([key, item]) => validateNumber(item, childPath(operandPath, key)))
          } else validateNumber(operand, operandPath)
        }
      }
      return
    }

    if (type === "array") {
      this.conditionOperators(value, path, ["null", "length", "includes", "notIncludes", "every", "some", "isEmpty"])
      for (const [operator, operand] of Object.entries(value)) {
        const operandPath = childPath(path, operator)
        if (operator === "null") validateNull(operand, operandPath)
        else if (operator === "includes" || operator === "notIncludes") validateNumber(operand, operandPath)
        else if (operator === "isEmpty") validateBoolean(operand, operandPath)
        else if (operator === "length") {
          if (isRecord(operand)) {
            this.conditionOperators(operand, operandPath, ["min", "max"])
            Object.entries(operand).forEach(([key, item]) => validateNumber(item, childPath(operandPath, key)))
          } else validateNumber(operand, operandPath)
        } else if (operator === "every" || operator === "some") {
          if (!this.record(operand, operandPath, "Array item condition")) continue
          this.conditionOperators(operand, operandPath, ["gt", "gte", "lt", "lte", "eq"])
          Object.entries(operand).forEach(([key, item]) => validateNumber(item, childPath(operandPath, key)))
        }
      }
      return
    }

    if (type === "enum") {
      this.conditionOperators(value, path, ["null", "eq", "notEq", "oneOf", "notOneOf"])
      const variants = Array.isArray(field.values) ? field.values : []
      const validateVariant = (item: unknown, itemPath: JsonPointer): boolean => {
        if (typeof item === "string" && variants.includes(item)) return true
        this.issue(itemPath, "invalid_condition_operand", "Enum operand must be a declared variant")
        return false
      }
      for (const [operator, operand] of Object.entries(value)) {
        const operandPath = childPath(path, operator)
        if (operator === "null") validateNull(operand, operandPath)
        else if (operator === "eq" || operator === "notEq") validateVariant(operand, operandPath)
        else if (operator === "oneOf" || operator === "notOneOf") {
          this.conditionArray(operand, operandPath, validateVariant, "Enum variant set")
        }
      }
    }
  }

  states(value: unknown, path: JsonPointer, fields: Map<string, RecordValue>): Set<string> {
    const names: string[] = []
    if (!this.array(value, path, "Superposition")) return new Set()
    for (let index = 0; index < value.length; index++) {
      const statePath = childPath(path, index)
      const state = value[index]
      if (!this.record(state, statePath, "State")) continue
      this.closed(state, statePath, ["name", "transitions"])
      this.required(state, statePath, ["name", "transitions"])
      if (this.string(state.name, childPath(statePath, "name"), "State name")) names.push(state.name)
      if (state.transitions !== null) {
        if (!this.record(state.transitions, childPath(statePath, "transitions"), "Transitions")) continue
        for (const [target, wave] of Object.entries(state.transitions)) {
          const wavePath = childPath(childPath(statePath, "transitions"), target)
          if (!this.record(wave, wavePath, "Transition conditions")) continue
          for (const [field, condition] of Object.entries(wave)) {
            const declaration = fields.get(field)
            if (!declaration) {
              this.issue(childPath(wavePath, field), "unknown_field_reference", `Unknown Field "${field}"`)
            } else {
              this.condition(condition, childPath(wavePath, field), declaration)
            }
          }
        }
      }
    }
    this.unique(names, path, "State")
    const nameSet = new Set(names)
    for (let index = 0; index < value.length; index++) {
      const state = value[index]
      if (!isRecord(state) || !isRecord(state.transitions)) continue
      for (const target of Object.keys(state.transitions)) {
        if (target === state.name) {
          this.issue(
            childPath(childPath(childPath(path, index), "transitions"), target),
            "self_transition",
            `State "${state.name}" cannot transition to itself`,
          )
        }
        if (!nameSet.has(target)) {
          this.issue(
            childPath(childPath(childPath(path, index), "transitions"), target),
            "unknown_state_reference",
            `Unknown transition target "${target}"`,
          )
        }
      }
    }
    return nameSet
  }

  action(value: unknown, path: JsonPointer): void {
    if (!this.record(value, path, "Action descriptor")) return
    this.closed(value, path, ["src", "importSpecifier", "wrapperSrc", "read"])
    this.required(value, path, ["src"])
    this.string(value.src, childPath(path, "src"), "Action source")
    if (value.importSpecifier !== undefined) {
      this.string(value.importSpecifier, childPath(path, "importSpecifier"), "Import specifier")
    }
    if (value.wrapperSrc !== undefined) {
      this.string(value.wrapperSrc, childPath(path, "wrapperSrc"), "Action wrapper")
    }
    if (value.read !== undefined) this.stringArray(value.read, childPath(path, "read"), "Action read set")
  }

  handler(value: unknown, path: JsonPointer): void {
    if (!this.record(value, path, "Handler descriptor")) return
    this.closed(value, path, ["src", "read", "write"])
    this.required(value, path, ["src"])
    this.string(value.src, childPath(path, "src"), "Handler source")
    if (value.read !== undefined) this.stringArray(value.read, childPath(path, "read"), "Handler read set")
    if (value.write !== undefined) this.stringArray(value.write, childPath(path, "write"), "Handler write set")
  }

  fieldReferences(value: unknown, path: JsonPointer, fieldKeys: Set<string>): void {
    if (!Array.isArray(value)) return
    value.forEach((key, index) => {
      if (typeof key === "string" && !fieldKeys.has(key)) {
        this.issue(childPath(path, index), "unknown_field_reference", `Unknown Field "${key}"`)
      }
    })
  }

  processes(value: unknown, path: JsonPointer, fieldKeys: Set<string>, stateNames: Set<string>): void {
    if (!this.array(value, path, "Processes")) return
    const keys: string[] = []
    value.forEach((item, index) => {
      const itemPath = childPath(path, index)
      if (!this.record(item, itemPath, "Process")) return
      this.closed(item, itemPath, ["key", "declaration"])
      this.required(item, itemPath, ["key", "declaration"])
      if (this.string(item.key, childPath(itemPath, "key"), "Process key")) {
        keys.push(item.key)
        if (!stateNames.has(item.key)) {
          this.issue(childPath(itemPath, "key"), "unknown_state_reference", `Process State "${item.key}" is not declared`)
        }
      }
      const declaration = item.declaration
      const declarationPath = childPath(itemPath, "declaration")
      if (!this.record(declaration, declarationPath, "Process declaration")) return
      if (declaration.type === "action") {
        this.closed(declaration, declarationPath, ["type", "label", "desc", "env", "action", "success", "error"])
        this.required(declaration, declarationPath, ["type", "action"])
        this.action(declaration.action, childPath(declarationPath, "action"))
        if (declaration.success !== undefined) this.handler(declaration.success, childPath(declarationPath, "success"))
        if (declaration.error !== undefined) this.handler(declaration.error, childPath(declarationPath, "error"))
        this.fieldReferences((declaration.action as RecordValue | undefined)?.read, childPath(childPath(declarationPath, "action"), "read"), fieldKeys)
        for (const phase of ["success", "error"] as const) {
          const handler = declaration[phase]
          if (!isRecord(handler)) continue
          this.fieldReferences(handler.read, childPath(childPath(declarationPath, phase), "read"), fieldKeys)
          this.fieldReferences(handler.write, childPath(childPath(declarationPath, phase), "write"), fieldKeys)
        }
      } else if (declaration.type === "finally") {
        this.closed(declaration, declarationPath, ["type", "label", "desc", "env", "before"])
        this.required(declaration, declarationPath, ["type", "before"])
        this.action(declaration.before, childPath(declarationPath, "before"))
        this.fieldReferences((declaration.before as RecordValue | undefined)?.read, childPath(childPath(declarationPath, "before"), "read"), fieldKeys)
      } else {
        this.issue(childPath(declarationPath, "type"), "invalid_process_type", "Process type must be action or finally")
      }
      if (declaration.label !== undefined) this.string(declaration.label, childPath(declarationPath, "label"), "Process label")
      if (declaration.desc !== undefined) this.string(declaration.desc, childPath(declarationPath, "desc"), "Process description")
      if (declaration.env !== undefined && this.stringArray(declaration.env, childPath(declarationPath, "env"), "Process environments")) {
        declaration.env.forEach((env, envIndex) => {
          if (!EXECUTION_ENVS.has(env as MetaExecutionEnv)) {
            this.issue(childPath(childPath(declarationPath, "env"), envIndex), "invalid_environment", `Unknown environment "${env}"`)
          }
        })
      }
    })
    this.unique(keys, path, "Process key")
  }

  reactions(value: unknown, path: JsonPointer, fieldKeys: Set<string>, stateNames: Set<string>): void {
    if (!this.array(value, path, "Reactions")) return
    const keys: string[] = []
    value.forEach((item, index) => {
      const itemPath = childPath(path, index)
      if (!this.record(item, itemPath, "Reaction")) return
      this.closed(item, itemPath, ["key", "label", "desc", "cond", "src", "read", "write", "states"])
      this.required(item, itemPath, ["key", "label", "desc", "cond", "src", "read", "write", "states"])
      if (this.string(item.key, childPath(itemPath, "key"), "Reaction key")) keys.push(item.key)
      this.string(item.label, childPath(itemPath, "label"), "Reaction label")
      if (item.desc !== null) this.string(item.desc, childPath(itemPath, "desc"), "Reaction description")
      this.string(item.cond, childPath(itemPath, "cond"), "Reaction condition source")
      this.string(item.src, childPath(itemPath, "src"), "Reaction update source")
      if (this.stringArray(item.read, childPath(itemPath, "read"), "Reaction read set")) {
        this.fieldReferences(item.read, childPath(itemPath, "read"), fieldKeys)
      }
      if (this.stringArray(item.write, childPath(itemPath, "write"), "Reaction write set")) {
        this.fieldReferences(item.write, childPath(itemPath, "write"), fieldKeys)
      }
      if (this.stringArray(item.states, childPath(itemPath, "states"), "Reaction States")) {
        item.states.forEach((state, stateIndex) => {
          if (!stateNames.has(state)) {
            this.issue(childPath(childPath(itemPath, "states"), stateIndex), "unknown_state_reference", `Unknown State "${state}"`)
          }
        })
      }
    })
    this.unique(keys, path, "Reaction key")
  }

  binding(value: unknown, path: JsonPointer): void {
    if (typeof value === "string") return
    if (!this.record(value, path, "Matter binding")) return
    this.closed(value, path, ["data", "expr", "directMass"])
    if (value.data !== undefined) {
      if (typeof value.data !== "string") this.stringArray(value.data, childPath(path, "data"), "Matter binding data")
    }
    if (value.expr !== undefined) this.string(value.expr, childPath(path, "expr"), "Matter binding expression")
    if (value.directMass !== undefined) {
      const directPath = childPath(path, "directMass")
      if (!this.record(value.directMass, directPath, "Direct Mass binding")) return
      if (value.directMass.kind === "whole") {
        this.closed(value.directMass, directPath, ["kind"])
      } else if (value.directMass.kind === "keys") {
        this.closed(value.directMass, directPath, ["kind", "entries"])
        this.required(value.directMass, directPath, ["kind", "entries"])
        if (this.array(value.directMass.entries, childPath(directPath, "entries"), "Direct Mass entries")) {
          value.directMass.entries.forEach((entry, index) => {
            const entryPath = childPath(childPath(directPath, "entries"), index)
            if (!this.record(entry, entryPath, "Direct Mass entry")) return
            this.closed(entry, entryPath, ["target", "source"])
            this.required(entry, entryPath, ["target", "source"])
            this.string(entry.target, childPath(entryPath, "target"), "Direct Mass target")
            this.string(entry.source, childPath(entryPath, "source"), "Direct Mass source")
          })
        }
      } else {
        this.issue(childPath(directPath, "kind"), "invalid_mass_binding", "Direct Mass kind must be whole or keys")
      }
    }
  }

  matter(value: unknown, path: JsonPointer, targets: Set<MetaAddress>): void {
    if (!this.array(value, path, "Matter")) return
    value.forEach((particle, index) => this.matterParticle(particle, childPath(path, index), targets))
  }

  matterParticle(value: unknown, path: JsonPointer, targets: Set<MetaAddress>): void {
    if (!this.record(value, path, "Matter particle")) return
    const kind = value.kind
    if (kind === "wimp") {
      this.closed(value, path, ["kind", "src", "fieldsBinding", "massBinding", "energyBinding", "children"])
      this.required(value, path, ["kind", "src"])
      if (this.address(value.src, childPath(path, "src"))) targets.add(value.src)
      for (const binding of ["fieldsBinding", "massBinding", "energyBinding"] as const) {
        if (value[binding] !== undefined) this.binding(value[binding], childPath(path, binding))
      }
    } else if (kind === "fuzzy") {
      this.closed(value, path, ["kind", "fuzzyKind", "predicateBinding", "children"])
      this.required(value, path, ["kind", "fuzzyKind", "predicateBinding"])
      if (value.fuzzyKind !== "dynamic-meta") {
        this.issue(childPath(path, "fuzzyKind"), "invalid_literal", "Fuzzy Matter must use dynamic-meta")
      }
      this.binding(value.predicateBinding, childPath(path, "predicateBinding"))
    } else if (kind === "axion") {
      this.closed(value, path, ["kind", "predicateBinding", "children"])
      this.required(value, path, ["kind", "predicateBinding"])
      this.binding(value.predicateBinding, childPath(path, "predicateBinding"))
    } else if (kind === "macho") {
      this.closed(value, path, ["kind", "collectionBinding", "children"])
      this.required(value, path, ["kind", "collectionBinding"])
      this.binding(value.collectionBinding, childPath(path, "collectionBinding"))
    } else {
      this.issue(childPath(path, "kind"), "invalid_matter_kind", "Matter kind must be wimp, fuzzy, axion or macho")
      return
    }
    if (value.children !== undefined && this.array(value.children, childPath(path, "children"), "Matter children")) {
      const slots = kind === "axion"
        ? new Set(["then", "else", "child"])
        : kind === "fuzzy"
          ? new Set(["branch"])
          : new Set(["child"])
      value.children.forEach((child, index) => {
        const childItemPath = childPath(childPath(path, "children"), index)
        if (!this.record(child, childItemPath, "Matter child")) return
        this.closed(child, childItemPath, ["edgeSlot", "particle"])
        this.required(child, childItemPath, ["edgeSlot", "particle"])
        if (!slots.has(child.edgeSlot as string)) {
          this.issue(
            childPath(childItemPath, "edgeSlot"),
            "invalid_edge_slot",
            `Matter ${String(kind)} does not admit edge slot "${String(child.edgeSlot)}"`,
          )
        }
        if (
          kind === "fuzzy" &&
          isRecord(child.particle) &&
          child.particle.kind !== "wimp"
        ) {
          this.issue(
            childPath(childItemPath, "particle"),
            "invalid_matter_child",
            "Fuzzy dynamic-meta branches must produce WIMP particles",
          )
        }
        this.matterParticle(child.particle, childPath(childItemPath, "particle"), targets)
      })
    }
  }

  template(value: unknown, path: JsonPointer): Set<MetaAddress> {
    const targets = new Set<MetaAddress>()
    if (!this.record(value, path, "Meta template")) return targets
    this.closed(value, path, ["name", "desc", "fields", "superposition", "mass", "processes", "reactions", "matter", "bulk"])
    this.required(value, path, ["name", "fields", "superposition", "mass", "processes"])
    this.string(value.name, childPath(path, "name"), "Meta name")
    if (value.desc !== undefined) this.string(value.desc, childPath(path, "desc"), "Meta description")

    const fieldKeys: string[] = []
    const fields = new Map<string, RecordValue>()
    if (this.array(value.fields, childPath(path, "fields"), "Fields")) {
      value.fields.forEach((field, index) => {
        this.field(field, childPath(childPath(path, "fields"), index))
        if (isRecord(field) && typeof field.key === "string") {
          fieldKeys.push(field.key)
          fields.set(field.key, field)
        }
      })
      this.unique(fieldKeys, childPath(path, "fields"), "Field key")
    }
    const fieldSet = new Set(fieldKeys)
    const states = this.states(value.superposition, childPath(path, "superposition"), fields)

    const massKeys: string[] = []
    if (this.array(value.mass, childPath(path, "mass"), "Mass declarations")) {
      value.mass.forEach((mass, index) => {
        const massPath = childPath(childPath(path, "mass"), index)
        if (!this.record(mass, massPath, "Mass declaration")) return
        this.closed(mass, massPath, ["key", "format", "label", "description"])
        this.required(mass, massPath, ["key", "format"])
        if (this.string(mass.key, childPath(massPath, "key"), "Mass key")) massKeys.push(mass.key)
        if (mass.format !== "json" && mass.format !== "binary") {
          this.issue(childPath(massPath, "format"), "invalid_mass_format", "Mass format must be json or binary")
        }
        if (mass.label !== undefined) this.string(mass.label, childPath(massPath, "label"), "Mass label")
        if (mass.description !== undefined) this.string(mass.description, childPath(massPath, "description"), "Mass description")
      })
      this.unique(massKeys, childPath(path, "mass"), "Mass key")
    }

    this.processes(value.processes, childPath(path, "processes"), fieldSet, states)
    if (value.reactions !== undefined) {
      this.reactions(value.reactions, childPath(path, "reactions"), fieldSet, states)
    }
    if (value.matter !== undefined) this.matter(value.matter, childPath(path, "matter"), targets)
    if (value.bulk !== undefined) {
      const bulkPath = childPath(path, "bulk")
      if (this.record(value.bulk, bulkPath, "Bulk")) {
        this.closed(value.bulk, bulkPath, ["view"])
        this.required(value.bulk, bulkPath, ["view"])
        this.string(value.bulk.view, childPath(bulkPath, "view"), "Bulk view")
      }
    }
    return targets
  }

  decodePointer(pointer: string, path: JsonPointer): string[] | null {
    if (!pointer.startsWith("#/")) {
      this.issue(path, "invalid_document_pointer", "Document pointer must start with #/")
      return null
    }
    const tokens = pointer.slice(2).split("/")
    const decoded: string[] = []
    for (const token of tokens) {
      if (/(?:~[^01]|~$)/.test(token)) {
        this.issue(path, "invalid_document_pointer", "Document pointer contains invalid escape")
        return null
      }
      decoded.push(token.replaceAll("~1", "/").replaceAll("~0", "~"))
    }
    return decoded
  }

  resolvePointer(document: RecordValue, pointer: unknown, path: JsonPointer): {tokens: string[]; value: unknown} | null {
    if (!this.string(pointer, path, "Document pointer")) return null
    const tokens = this.decodePointer(pointer, path)
    if (!tokens || tokens[0] !== "template") {
      this.issue(path, "invalid_declaration_pointer", "Runtime declaration must resolve inside template")
      return null
    }
    let current: unknown = document
    for (const token of tokens) {
      if (Array.isArray(current)) {
        if (!/^(0|[1-9]\d*)$/.test(token) || Number(token) >= current.length) {
          this.issue(path, "unresolved_declaration_pointer", "Runtime declaration pointer does not resolve")
          return null
        }
        current = current[Number(token)]
      } else if (isRecord(current) && Object.hasOwn(current, token)) {
        current = current[token]
      } else {
        this.issue(path, "unresolved_declaration_pointer", "Runtime declaration pointer does not resolve")
        return null
      }
    }
    return {tokens, value: current}
  }

  pointer(tokens: readonly string[]): DocumentPointer {
    return `#/${tokens.map(pointerToken).join("/")}` as DocumentPointer
  }

  occurrence(
    tokens: readonly string[],
    section: "matter" | "children",
    index: number,
  ): OccurrenceExpectation {
    return {
      pointer: section === "matter"
        ? this.pointer([...tokens, "matter", String(index)])
        : this.pointer([...tokens, "children", String(index), "particle"]),
    }
  }

  occurrencePlan(tokens: readonly string[], declaration: unknown): OccurrencePlan {
    if (!isRecord(declaration)) return {mode: "static", items: []}
    if (Array.isArray(declaration.matter)) {
      return {
        mode: "static",
        items: declaration.matter.map((_particle, index) =>
          this.occurrence(tokens, "matter", index)
        ),
      }
    }
    const children = Array.isArray(declaration.children) ? declaration.children : []
    const occurrences = children.map((_child, index) => this.occurrence(tokens, "children", index))
    if (declaration.kind === "axion") {
      const branch = (slots: readonly string[]): OccurrenceExpectation[] =>
        children.flatMap((child, index) =>
          isRecord(child) && slots.includes(String(child.edgeSlot)) ? [occurrences[index]!] : []
        )
      const selected = branch(["then", "child"])
      const rejected = branch(["else"])
      return {
        mode: "axion",
        alternatives: [selected, rejected],
      }
    }
    if (declaration.kind === "macho") return {mode: "macho", items: occurrences}
    if (declaration.kind === "fuzzy") return {mode: "fuzzy", items: occurrences}
    return {mode: "static", items: occurrences}
  }

  runtimeNode(
    value: unknown,
    path: JsonPointer,
    document: RecordValue,
    templates: RecordValue,
    expectedDeclarations: OccurrenceExpectation[] | null,
    root: MetaAddress | null,
  ): void {
    if (!this.record(value, path, "Runtime node")) return
    let resolved: {tokens: string[]; value: unknown} | null = null
    let childDeclarations: OccurrencePlan = {mode: "static", items: []}
    if (value.kind === "atom") {
      this.closed(value, path, ["kind", "declaration", "meta", "state", "values", "children"])
      this.required(value, path, ["kind", "declaration", "meta", "state", "values"])
      const meta = value.meta
      const metaOk = this.address(meta, childPath(path, "meta"))
      resolved = this.resolvePointer(document, value.declaration, childPath(path, "declaration"))
      if (resolved && metaOk) {
        const declaration = resolved.value
        const pointsToMeta = resolved.tokens.length === 2 && resolved.tokens[1] === meta
        const pointsToWimp = isRecord(declaration) && declaration.kind === "wimp" && declaration.src === meta
        if (!pointsToMeta && !pointsToWimp) {
          this.issue(childPath(path, "declaration"), "declaration_mismatch", "Atom declaration must point to its Meta template or producing WIMP Matter")
        }
        const declarationPointer = this.pointer(resolved.tokens)
        if (root !== null) {
          const rootPointer = this.pointer(["template", meta])
          if (meta !== root || declarationPointer !== rootPointer) {
            this.issue(
              childPath(path, "declaration"),
              "occurrence_pointer_mismatch",
              "Root Atom must point exactly to the selected root Meta template",
            )
          }
        } else if (
          expectedDeclarations !== null &&
          !expectedDeclarations.some(({pointer}) => pointer === declarationPointer)
        ) {
          this.issue(
            childPath(path, "declaration"),
            "occurrence_pointer_mismatch",
            "Child Atom must point to its exact producing WIMP Matter occurrence",
          )
        }
        childDeclarations = this.occurrencePlan(resolved.tokens, declaration)
      }
      const template = metaOk ? templates[meta] : undefined
      if (!isRecord(template)) {
        if (metaOk) this.issue(childPath(path, "meta"), "unknown_meta_reference", `Runtime Meta "${meta}" is absent from template`)
      } else {
        if (metaOk) {
          const pointsToOwnTemplate = resolved?.tokens.length === 2 && resolved.tokens[1] === meta
          if (!pointsToOwnTemplate) {
            const ownPlan = this.occurrencePlan(["template", meta], template)
            if (childDeclarations.mode === "static" && ownPlan.mode === "static") {
              childDeclarations = {
                mode: "static",
                items: [...ownPlan.items, ...childDeclarations.items],
              }
            }
          }
        }
        const stateNames = Array.isArray(template.superposition)
          ? new Set(template.superposition.flatMap((state) => isRecord(state) && typeof state.name === "string" ? [state.name] : []))
          : new Set<string>()
        if (value.state !== null && (typeof value.state !== "string" || !stateNames.has(value.state))) {
          this.issue(childPath(path, "state"), "unknown_state_reference", `Runtime State "${String(value.state)}" is not declared`)
        }
        const fields = new Map<string, RecordValue>()
        if (Array.isArray(template.fields)) {
          template.fields.forEach((field) => {
            if (isRecord(field) && typeof field.key === "string") fields.set(field.key, field)
          })
        }
        if (this.record(value.values, childPath(path, "values"), "Runtime values")) {
          for (const [key, fieldValue] of Object.entries(value.values)) {
            const field = fields.get(key)
            const valuePath = childPath(childPath(path, "values"), key)
            if (!field) {
              this.issue(valuePath, "unknown_field_reference", `Runtime Field "${key}" is not declared`)
              continue
            }
            this.runtimeFieldValue(field, fieldValue, valuePath)
          }
        }
      }
    } else if (value.kind === "topology") {
      this.closed(value, path, ["kind", "declaration", "topology", "children"])
      this.required(value, path, ["kind", "declaration", "topology"])
      if (root !== null) {
        this.issue(
          childPath(path, "kind"),
          "occurrence_pointer_mismatch",
          "A runtime root must be an Atom, not a topology",
        )
      }
      if (!TOPOLOGIES.has(value.topology as string)) {
        this.issue(childPath(path, "topology"), "invalid_topology", "Runtime topology must be fuzzy, axion or macho")
      }
      resolved = this.resolvePointer(document, value.declaration, childPath(path, "declaration"))
      if (resolved && (!isRecord(resolved.value) || resolved.value.kind !== value.topology)) {
        this.issue(childPath(path, "declaration"), "declaration_mismatch", "Topology declaration kind does not match runtime topology")
      }
      if (resolved) {
        const declarationPointer = this.pointer(resolved.tokens)
        if (
          expectedDeclarations !== null &&
          !expectedDeclarations.some(({pointer}) => pointer === declarationPointer)
        ) {
          this.issue(
            childPath(path, "declaration"),
            "occurrence_pointer_mismatch",
            "Topology must point to its exact producing topology Matter occurrence",
          )
        }
        childDeclarations = this.occurrencePlan(resolved.tokens, resolved.value)
      }
    } else {
      this.issue(childPath(path, "kind"), "invalid_runtime_kind", "Runtime node kind must be atom or topology")
      return
    }
    this.runtimeChildren(value.children, childPath(path, "children"), document, templates, childDeclarations)
  }

  runtimeChildren(
    value: unknown,
    path: JsonPointer,
    document: RecordValue,
    templates: RecordValue,
    expected: OccurrencePlan,
  ): void {
    const children = value === undefined
      ? []
      : this.array(value, path, "Runtime children") ? value : null
    if (children === null) return

    const pointerOf = (child: unknown): string | null =>
      isRecord(child) && typeof child.declaration === "string" ? child.declaration : null
    const validateChild = (
      child: unknown,
      index: number,
      matched: OccurrenceExpectation | undefined,
    ): void => {
      const childItemPath = childPath(path, index)
      this.runtimeNode(
        child,
        childItemPath,
        document,
        templates,
        matched === undefined ? [] : [matched],
        null,
      )
    }
    const pointers = children.map(pointerOf)

    if (expected.mode === "static") {
      let cursor = 0
      children.forEach((child, index) => {
        const pointer = pointers[index]
        const matchedIndex = pointer === null
          ? -1
          : expected.items.findIndex((item, itemIndex) =>
              itemIndex >= cursor && item.pointer === pointer
            )
        if (matchedIndex >= 0) {
          if (matchedIndex !== cursor) {
            this.issue(
              childPath(childPath(path, index), "declaration"),
              "occurrence_order_mismatch",
              "Runtime child skips or reorders a required static Matter occurrence",
            )
          }
          validateChild(child, index, expected.items[matchedIndex])
          cursor = matchedIndex + 1
        } else {
          validateChild(child, index, undefined)
        }
      })
      if (cursor < expected.items.length) {
        this.issue(path, "missing_static_occurrence", "Required static Matter occurrence is missing")
      }
      return
    }

    if (expected.mode === "macho") {
      let cursor = 0
      children.forEach((child, index) => {
        const pointer = pointers[index]
        let matchedIndex = -1
        if (pointer !== null) {
          if (expected.items[cursor]?.pointer === pointer) {
            matchedIndex = cursor
          } else {
            matchedIndex = expected.items.findIndex((item, itemIndex) =>
              itemIndex > cursor && item.pointer === pointer
            )
          }
        }
        if (matchedIndex < 0) {
          this.issue(
            childPath(childPath(path, index), "declaration"),
            "collection_occurrence_mismatch",
            "Macho child declaration is unknown or violates collection occurrence order",
          )
          validateChild(child, index, undefined)
          return
        }
        cursor = matchedIndex
        validateChild(child, index, expected.items[matchedIndex])
      })
      return
    }

    if (expected.mode === "fuzzy") {
      const matched = children.length === 1
        ? expected.items.find(({pointer}) => pointer === pointers[0])
        : undefined
      if (children.length > 1 || (children.length === 1 && matched === undefined)) {
        this.issue(
          path,
          "dynamic_branch_mismatch",
          "Fuzzy topology may project zero or exactly one selected dynamic Meta branch",
        )
      }
      children.forEach((child, index) =>
        validateChild(
          child,
          index,
          index === 0 && children.length === 1 ? matched : undefined,
        )
      )
      return
    }

    const alternative = expected.alternatives.find((items) =>
      items.length === pointers.length &&
      items.every(({pointer}, index) => pointer === pointers[index])
    )
    if (!alternative) {
      this.issue(
        path,
        "branch_occurrence_mismatch",
        "Axion children must be exactly one selected then/child or else branch sequence",
      )
    }
    children.forEach((child, index) => validateChild(child, index, alternative?.[index]))
  }

  runtimeFieldValue(field: RecordValue, value: unknown, path: JsonPointer): void {
    if (value === null) {
      if (field.required === true) this.issue(path, "invalid_runtime_value", "Required Field value cannot be null")
      return
    }
    if (field.type === "string" && typeof value !== "string") {
      this.issue(path, "invalid_runtime_value", "Runtime value must be a string")
    } else if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      this.issue(path, "invalid_runtime_value", "Runtime value must be a finite number")
    } else if (field.type === "boolean" && typeof value !== "boolean") {
      this.issue(path, "invalid_runtime_value", "Runtime value must be a boolean")
    } else if (field.type === "array" &&
      (!Array.isArray(value) || value.some((item) => typeof item !== "number" || !Number.isFinite(item)))) {
      this.issue(path, "invalid_runtime_value", "Runtime value must be finite number[]")
    } else if (field.type === "enum" &&
      (!Array.isArray(field.values) || typeof value !== "string" || !field.values.includes(value))) {
      this.issue(path, "invalid_runtime_value", "Runtime enum value must be a declared variant")
    }
  }

  validate(input: unknown): ValidationResult<Graph> {
    if (!this.record(input, "", "Graph")) return {ok: false, issues: this.issues}
    this.json(input, "")
    this.closed(input, "", ["schema", "root", "template", "runtime"])
    this.required(input, "", ["schema", "root", "template", "runtime"])
    if (input.schema !== GRAPH_SCHEMA) {
      this.issue("/schema", "invalid_schema", `schema must be "${GRAPH_SCHEMA}"`)
    }
    const root = input.root
    const rootOk = this.address(root, "/root")
    const targets = new Map<MetaAddress, Set<MetaAddress>>()
    let templates: RecordValue = {}
    if (this.record(input.template, "/template", "Template map")) {
      templates = input.template
      for (const [address, template] of Object.entries(input.template)) {
        const templatePath = childPath("/template", address)
        if (!this.address(address, templatePath)) continue
        targets.set(address, this.template(template, templatePath))
      }
    }
    if (rootOk && !Object.hasOwn(templates, root)) {
      this.issue("/root", "missing_root_template", `Root Meta "${root}" is absent from template`)
    }
    for (const [address, addressTargets] of targets) {
      for (const target of addressTargets) {
        if (!Object.hasOwn(templates, target)) {
          this.issue(
            childPath(childPath("/template", address), "matter"),
            "unresolved_matter_target",
            `Matter target "${target}" must have a complete template entry`,
          )
        }
      }
    }
    if (rootOk && Object.hasOwn(templates, root)) {
      const reachable = new Set<MetaAddress>()
      const pending: MetaAddress[] = [root]
      while (pending.length > 0) {
        const address = pending.shift()!
        if (reachable.has(address)) continue
        reachable.add(address)
        for (const target of targets.get(address) ?? []) pending.push(target)
      }
      for (const address of Object.keys(templates)) {
        if (isMetaAddress(address) && !reachable.has(address)) {
          this.issue(childPath("/template", address), "unreachable_template", `Template "${address}" is not reachable from root`)
        }
      }
    }
    if (this.record(input.runtime, "/runtime", "Runtime")) {
      this.closed(input.runtime, "/runtime", ["roots"])
      this.required(input.runtime, "/runtime", ["roots"])
      if (this.array(input.runtime.roots, "/runtime/roots", "Runtime roots")) {
        input.runtime.roots.forEach((node, index) =>
          this.runtimeNode(
            node,
            childPath("/runtime/roots", index),
            input,
            templates,
            null,
            rootOk ? root : null,
          )
        )
      }
    }
    return this.issues.length === 0
      ? {ok: true, value: input as unknown as Graph}
      : {ok: false, issues: this.issues}
  }
}

export const validateGraph = (input: unknown): ValidationResult<Graph> =>
  new Validator().validate(input)

export const graphValidators: GraphValidators = {
  graph: validateGraph,
}
