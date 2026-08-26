/**
Единый публичный read-only Graph мира MetaFor.

Модуль владеет wire-формой, нейтральными адресами и закрытой validation. Он не
владеет каноническим миром, причинной history или доменными способами собрать
`template` и `runtime`.

@packageDocumentation
*/

/** Schema marker единственного публичного Graph-контракта. */
export const GRAPH_SCHEMA = "metafor/graph" as const
/** Schema marker одной ref-based разницы между двумя валидными Graph. */
export const GRAPH_DELTA_SCHEMA = "metafor/graph-delta/v1" as const
/** Dark Oracle method, возвращающий полный текущий Graph без client-selected root. */
export const READ_GRAPH_METHOD = "readGraph" as const

/** JSON leaf, допустимый в Graph после закрытой validation. */
export type JsonPrimitive = null | boolean | number | string
/** Ациклическое JSON-compatible значение без runtime objects и `undefined`. */
export type JsonValue = JsonPrimitive | JsonValue[] | {[key: string]: JsonValue}
/** RFC 6901-compatible pointer внутри одного Graph document. */
export type JsonPointer = "" | `/${string}`
/** Внутридокументная ссылка, не являющаяся постоянной identity сущности. */
export type DocumentPointer = `#${JsonPointer}`

/** Opaque runtime Atom identity. Placement paths may change while this ref stays stable. */
export type AtomRef = `atom:${string}`
/** Opaque runtime Topology identity, independent from its current parent and order. */
export type TopologyRef = `topology:${string}`
/** Opaque identity of one authorized runtime Mass key-file. */
export type MassRef = `mass:${string}`
/** Opaque identity of one exact resolved source-to-target Reaction relation. */
export type ReactionRelationRef = `reaction:${string}`

declare const MetaAddressBrand: unique symbol

/** Canonical safe two-segment `<owner>/<repository>` address. */
export type MetaAddress = string & {readonly [MetaAddressBrand]: "MetaAddress"}

/**
 * Dark Oracle `readGraph` accepts no client-selected root. The current root is
 * owned by the world projection and is returned as `Graph.root`.
 */
export type ReadGraphParams = Record<string, never>

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

/** Optional string Field без provenance и текущего runtime value. */
export type MetaStringField =
  | MetaOptionalField<"string", string>
  | MetaRequiredIdentifiedField<"string", string>

/** Optional либо required Field с конечным числом. */
export type MetaNumberField =
  | MetaOptionalField<"number", number>
  | MetaRequiredIdentifiedField<"number", number>

/** Optional либо required boolean Field. */
export type MetaBooleanField =
  | MetaOptionalField<"boolean", boolean>
  | MetaRequiredIdentifiedField<"boolean", boolean>

/** Числовой массив, чья интерпретация элементов остаётся metadata декларации. */
export type MetaArrayField =
  MetaFieldBase & {
    type: "array"
    data?: string
    id?: never
  } & (
    | {required?: never; default?: number[]}
    | {required: true; default: number[]}
  )

/** Enum, в котором порядок variants задаёт ordinal mapping. */
export type MetaEnumField =
  MetaFieldBase & {
    type: "enum"
    values: string[]
  } & (
    | {required?: never; default?: string; id?: never}
    | {required: true; default: string; id?: true}
  )

/** Закрытый набор Field declarations внутри `Graph.template`. */
export type MetaField =
  | MetaStringField
  | MetaNumberField
  | MetaBooleanField
  | MetaArrayField
  | MetaEnumField

/** Сериализуемый RegExp descriptor; исполняемый `RegExp` не входит в Graph. */
export interface MetaRegExp {
  source: string
  flags: string
}

/** Язык Conditions для boolean Field. */
export type MetaBooleanCondition =
  | boolean
  | null
  | {null?: boolean; eq?: boolean; notEq?: boolean; logicalEq?: boolean}

/** Язык Conditions для string Field. */
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

/** Язык Conditions для Field с конечным числом. */
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

/** Числовой predicate, применяемый `every` или `some` к элементам массива. */
export interface MetaArrayItemCondition {
  gt?: number
  gte?: number
  lt?: number
  lte?: number
  eq?: number
}

/** Язык Conditions для Field с числовым массивом. */
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

/** Язык Conditions для enum Field и его объявленных variants. */
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

/** Condition union, проверяемый по типу referenced Field declaration. */
export type MetaCondition =
  | MetaBooleanCondition
  | MetaStringCondition
  | MetaNumberCondition
  | MetaArrayCondition
  | MetaEnumCondition

/** Конъюнкция Conditions, адресованных semantic Field key. */
export type MetaConditionWave = {[field: string]: MetaCondition}
/** Ordered mapping целевых States; первый подходящий Transition имеет приоритет. */
export type MetaTransitions = {[targetState: string]: MetaConditionWave}

/** Один объявленный State и его исходящие Transitions. */
export interface MetaState {
  name: string
  transitions: MetaTransitions | null
}

/** Metadata одного Mass key без bytes и filesystem path. */
export interface MetaMass {
  key: string
  format: "json" | "binary"
  label?: string
  description?: string
}

/** Environments, в которых может исполняться action одного Process. */
export type MetaExecutionEnv =
  | "browser"
  | "node"
  | "worker"
  | "server"
  | "any"

/** Сериализуемая action reference; исполняемая функция остаётся в authored source. */
export interface MetaActionDescriptor {
  src: string
  importSpecifier?: string
  wrapperSrc?: string
  read?: string[]
}

/** Сериализуемая handler reference с объявленным доступом к Fields. */
export interface MetaHandlerDescriptor {
  src: string
  read?: string[]
  write?: string[]
}

/** Process descriptor, начинающий action после входа в owning State. */
export interface MetaActionProcessDescriptor {
  type: "action"
  label?: string
  desc?: string
  env?: MetaExecutionEnv[]
  action: MetaActionDescriptor
  success?: MetaHandlerDescriptor
  error?: MetaHandlerDescriptor
}

/** Teardown descriptor при retirement Atom, а не обычный State Process. */
export interface MetaFinallyProcessDescriptor {
  type: "finally"
  label?: string
  desc?: string
  env?: MetaExecutionEnv[]
  before: MetaActionDescriptor
}

/** WIMP-local Process key и его закрытый сериализуемый descriptor. */
export interface MetaProcess {
  key: string
  declaration: MetaActionProcessDescriptor | MetaFinallyProcessDescriptor
}

/** Declarative source selector resolved by Boundary into exact runtime relations. */
export interface MetaReactionSource {
  atom?: AtomRef
  meta?: MetaAddress
  relation?: "parent" | "child" | "descendant"
  states: string[]
}

/** WIMP-local Reaction with visible State, Field and Mass dependencies. */
export interface MetaReaction {
  key: string
  label: string
  desc: string | null
  sources: MetaReactionSource[]
  src: string
  read: string[]
  write: string[]
  massRead: string[]
  massWrite: string[]
  states: string[]
}

/** Direct Mass binding всего source либо явного key mapping. */
export type MetaMatterDirectMass =
  | {kind: "whole"}
  | {
      kind: "keys"
      entries: Array<{target: string; source: string}>
    }

/** Сериализуемый Matter binding; runtime values и handles остаются вне Graph. */
export type MetaMatterBinding =
  | string
  | {
      data?: string | string[]
      expr?: string
      directMass?: MetaMatterDirectMass
    }

/** Дочерний occurrence, создаваемый WIMP Matter declaration. */
export interface MetaMatterWimpChild {
  edgeSlot: "child"
  particle: MetaMatterParticle
}

/** Dynamic Meta branch, выбранный одним Fuzzy controller. */
export interface MetaMatterFuzzyChild {
  edgeSlot: "branch"
  particle: MetaMatterWimp
}

/** Ребёнок одной semantic branch Axion controller. */
export interface MetaMatterAxionChild {
  edgeSlot: "then" | "else" | "child"
  particle: MetaMatterParticle
}

/** Повторяемая child declaration Macho collection controller. */
export interface MetaMatterMachoChild {
  edgeSlot: "child"
  particle: MetaMatterParticle
}

/** Matter declaration, создающая Atom из referenced WIMP template. */
export interface MetaMatterWimp {
  kind: "wimp"
  src: MetaAddress
  fieldsBinding?: MetaMatterBinding
  massBinding?: MetaMatterBinding
  energyBinding?: MetaMatterBinding
  children?: MetaMatterWimpChild[]
}

/** Dynamic-Meta controller с нулём либо одной выбранной runtime branch. */
export interface MetaMatterFuzzy {
  kind: "fuzzy"
  fuzzyKind: "dynamic-meta"
  predicateBinding: MetaMatterBinding
  children?: MetaMatterFuzzyChild[]
}

/** Условный controller, проецирующий ровно одну допустимую branch sequence. */
export interface MetaMatterAxion {
  kind: "axion"
  predicateBinding: MetaMatterBinding
  children?: MetaMatterAxionChild[]
}

/** Collection controller с нулём или несколькими ordered repetitions. */
export interface MetaMatterMacho {
  kind: "macho"
  collectionBinding: MetaMatterBinding
  children?: MetaMatterMachoChild[]
}

/** Закрытый набор Matter declarations внутри `Graph.template`. */
export type MetaMatterParticle =
  | MetaMatterWimp
  | MetaMatterFuzzy
  | MetaMatterAxion
  | MetaMatterMacho

/**
Полная нормализованная декларация одного WIMP.

Порядок Fields, States, Processes, Reactions и Matter сохраняется только там,
где он участвует в identity, materialization или причинном выборе.
*/
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

/**
Один текущий Atom occurrence, рождённый из WIMP template.

`declaration` указывает текущее место рождения внутри этого Graph snapshot и не
заменяет постоянную Atom identity. Отсутствующий Field key означает отсутствие
проецируемого текущего значения; default остаётся в `template`.
*/
export interface RuntimeAtom {
  ref: AtomRef
  kind: "atom"
  declaration: DocumentPointer
  meta: MetaAddress
  state: string | null
  values: {[field: string]: JsonValue}
  mass: RuntimeMass[]
  children?: RuntimeNode[]
}

/** Текущий structural controller occurrence, а не runtime WIMP. */
export interface RuntimeTopology {
  ref: TopologyRef
  kind: "topology"
  declaration: DocumentPointer
  topology: "fuzzy" | "axion" | "macho"
  children?: RuntimeNode[]
}

/** Runtime occurrence, допустимый во вложенном текущем дереве Graph. */
export type RuntimeNode = RuntimeAtom | RuntimeTopology

/** Metadata-only runtime Mass occurrence. Content is read lazily through its RPC. */
export interface RuntimeMass {
  ref: MassRef
  key: string
  format: "json" | "binary"
  label: string | null
  description: string | null
  content: "lazy"
}

/** One exact potential Reaction relation resolved from an authored source selector. */
export interface RuntimeReactionRelation {
  ref: ReactionRelationRef
  kind: "reaction"
  reaction: {
    meta: MetaAddress
    key: string
  }
  source: {
    atom: AtomRef
    states: string[]
  }
  target: {
    atom: AtomRef
    states: string[]
  }
  /** Derived from the target Atom current State; it is not another runtime Store. */
  active: boolean
}

/**
Единственный публичный Graph, собираемый Dark Oracle из независимых Dark и
Boundary projections.

Graph является производным read-only snapshot: его не авторят, не сохраняют
как канонический мир и не используют вместо Force history. JSON является
только wire-сериализацией этого контракта.
*/
export interface Graph {
  schema: typeof GRAPH_SCHEMA
  root: MetaAddress
  template: {[address: MetaAddress]: MetaTemplate}
  runtime: {
    roots: RuntimeNode[]
    reactions: RuntimeReactionRelation[]
  }
}

/** Lowercase SHA-256 canonical Graph bytes with an explicit algorithm prefix. */
export type GraphDigest = `sha256:${string}`

/** Stable identity of one runtime occurrence, independent from tree placement. */
export type RuntimeNodeRef = AtomRef | TopologyRef

/**
Runtime occurrence data without nested placement.

Containment and sibling order are changed only by `children`, so moving a node
does not replace its semantic data or address it by an array position.
*/
export type RuntimeNodeHead =
  | Omit<RuntimeAtom, "children">
  | Omit<RuntimeTopology, "children">

/** Add or replace one complete template selected by its canonical Meta identity. */
export type GraphDeltaTemplateWrite = {
  op: "add" | "replace"
  target: {kind: "template"; ref: MetaAddress}
  value: MetaTemplate
}

/** Remove one complete template by canonical Meta identity. */
export type GraphDeltaTemplateRemove = {
  op: "remove"
  target: {kind: "template"; ref: MetaAddress}
}

/** Add or replace runtime data while preserving placement as a separate relation. */
export type GraphDeltaRuntimeNodeWrite = {
  op: "add" | "replace"
  target: {kind: "runtime-node"; ref: RuntimeNodeRef}
  value: RuntimeNodeHead
}

/** Remove one runtime occurrence by stable ref. Descendants remain explicit changes. */
export type GraphDeltaRuntimeNodeRemove = {
  op: "remove"
  target: {kind: "runtime-node"; ref: RuntimeNodeRef}
}

/**
Replace one complete ordered child-ref list.

`parent: null` addresses `Graph.runtime.roots`. For a runtime node, `value: null`
preserves an absent optional `children` member; an empty array preserves an
explicit empty member. This distinction keeps canonical Graph bytes exact.
*/
export type GraphDeltaChildrenReplace = {
  op: "replace"
  target: {kind: "children"; parent: RuntimeNodeRef | null}
  value: RuntimeNodeRef[] | null
}

/** Add or replace one exact Boundary-resolved Reaction relation. */
export type GraphDeltaReactionRelationWrite = {
  op: "add" | "replace"
  target: {kind: "reaction-relation"; ref: ReactionRelationRef}
  value: RuntimeReactionRelation
}

/** Remove one exact Reaction relation by stable ref. */
export type GraphDeltaReactionRelationRemove = {
  op: "remove"
  target: {kind: "reaction-relation"; ref: ReactionRelationRef}
}

/**
Replace deterministic order of the flat runtime Reaction relation projection.

Relation identity and content stay in their own changes; this list preserves
exact Graph bytes without positional mutation targets.
*/
export type GraphDeltaReactionOrderReplace = {
  op: "replace"
  target: {kind: "reaction-order"}
  value: ReactionRelationRef[]
}

/** Closed semantic operations accepted by one atomic GraphDelta application. */
export type GraphDeltaChange =
  | GraphDeltaTemplateWrite
  | GraphDeltaTemplateRemove
  | GraphDeltaRuntimeNodeWrite
  | GraphDeltaRuntimeNodeRemove
  | GraphDeltaChildrenReplace
  | GraphDeltaReactionRelationWrite
  | GraphDeltaReactionRelationRemove
  | GraphDeltaReactionOrderReplace

/**
Ref-based difference between two complete Graph snapshots of the same root.

The delta is a derived read artifact. It is not an authoring command, Force
Particle, canonical history or second Store. `baseDigest` and `resultDigest`
make detached application fail closed before exposing a result.
*/
export interface GraphDelta {
  schema: typeof GRAPH_DELTA_SCHEMA
  root: MetaAddress
  baseDigest: GraphDigest
  resultDigest: GraphDigest
  changes: GraphDeltaChange[]
}

/** Одна точная проблема закрытой Graph validation по JSON Pointer. */
export interface ValidationIssue {
  path: JsonPointer
  code: string
  message: string
}

/** Fail-closed результат validation без исключения и без частичного Graph. */
export type ValidationResult<T> =
  | {ok: true; value: T}
  | {ok: false; issues: ValidationIssue[]}

/** Closed validation surface for Graph snapshots and structural deltas. */
export interface GraphValidators {
  graph(input: unknown): ValidationResult<Graph>
  delta(input: unknown): ValidationResult<GraphDelta>
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
type TemplateTargets = {
  matter: Set<MetaAddress>
  reactions: Set<MetaAddress>
}

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
const ATOM_REF = /^atom:[1-9]\d*$/
const TOPOLOGY_REF = /^topology:[1-9]\d*$/
const MASS_REF = /^mass:[A-Za-z0-9][A-Za-z0-9._:-]*$/
const REACTION_RELATION_REF = /^reaction:[A-Za-z0-9][A-Za-z0-9._:-]*$/
const GRAPH_DIGEST = /^sha256:[a-f0-9]{64}$/

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

/**
Проверяет и брендирует безопасный публичный Meta address.

@param value - Ожидаемый адрес `<owner>/<repository>` без дополнительных сегментов.
@returns Брендированный адрес либо `null` без нормализации входа.
*/
export const parseMetaAddress = (value: string): MetaAddress | null =>
  isMetaAddress(value) ? value : null

class Validator {
  readonly issues: ValidationIssue[] = []
  readonly runtimeAtoms = new Map<string, {meta: MetaAddress; state: string | null}>()
  readonly runtimeParents = new Map<string, string | null>()
  readonly runtimeMassFormats = new Map<string, "json" | "binary">()
  readonly runtimeTopologies = new Set<string>()

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

  nonEmptyString(value: unknown, path: JsonPointer, name: string): value is string {
    if (!this.string(value, path, name)) return false
    if (value.trim().length > 0) return true
    this.issue(path, "empty_string", `${name} must not be empty`)
    return false
  }

  typedRef(
    value: unknown,
    path: JsonPointer,
    name: string,
    pattern: RegExp,
  ): value is string {
    if (typeof value === "string" && pattern.test(value)) return true
    this.issue(path, "invalid_ref", `${name} is not a canonical typed ref`)
    return false
  }

  runtimeNodeRef(value: unknown, path: JsonPointer, name: string): value is RuntimeNodeRef {
    if (typeof value === "string" && (ATOM_REF.test(value) || TOPOLOGY_REF.test(value))) return true
    this.issue(path, "invalid_ref", `${name} is not a canonical Atom or Topology ref`)
    return false
  }

  digest(value: unknown, path: JsonPointer): value is GraphDigest {
    if (typeof value === "string" && GRAPH_DIGEST.test(value)) return true
    this.issue(path, "invalid_digest", "Graph digest must be lowercase sha256:<64 hex>")
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

  reactions(
    value: unknown,
    path: JsonPointer,
    fields: ReadonlyMap<string, RecordValue>,
    stateNames: Set<string>,
    massKeys: Set<string>,
    targets: Set<MetaAddress>,
  ): void {
    if (!this.array(value, path, "Reactions")) return
    const keys: string[] = []
    value.forEach((item, index) => {
      const itemPath = childPath(path, index)
      if (!this.record(item, itemPath, "Reaction")) return
      this.closed(item, itemPath, [
        "key", "label", "desc", "sources", "src", "read", "write", "massRead", "massWrite", "states",
      ])
      this.required(item, itemPath, [
        "key", "label", "desc", "sources", "src", "read", "write", "massRead", "massWrite", "states",
      ])
      if (this.nonEmptyString(item.key, childPath(itemPath, "key"), "Reaction key")) keys.push(item.key)
      this.string(item.label, childPath(itemPath, "label"), "Reaction label")
      if (item.desc !== null) this.string(item.desc, childPath(itemPath, "desc"), "Reaction description")
      this.nonEmptyString(item.src, childPath(itemPath, "src"), "Reaction update source")
      const sourcesPath = childPath(itemPath, "sources")
      if (this.array(item.sources, sourcesPath, "Reaction sources")) {
        if (item.sources.length === 0) {
          this.issue(sourcesPath, "empty_reaction_sources", "Reaction must observe at least one source selector")
        }
        item.sources.forEach((source, sourceIndex) => {
          const sourcePath = childPath(sourcesPath, sourceIndex)
          if (!this.record(source, sourcePath, "Reaction source")) return
          this.closed(source, sourcePath, ["atom", "meta", "relation", "states"])
          this.required(source, sourcePath, ["states"])
          if (source.atom === undefined && source.meta === undefined && source.relation === undefined) {
            this.issue(sourcePath, "empty_reaction_selector", "Reaction source must select an Atom, Meta or structural relation")
          }
          if (source.atom !== undefined) {
            this.typedRef(source.atom, childPath(sourcePath, "atom"), "Reaction source Atom", ATOM_REF)
          }
          if (source.meta !== undefined && this.address(source.meta, childPath(sourcePath, "meta"))) {
            targets.add(source.meta)
          }
          if (source.relation !== undefined &&
              source.relation !== "parent" && source.relation !== "child" && source.relation !== "descendant") {
            this.issue(
              childPath(sourcePath, "relation"),
              "invalid_reaction_relation",
              "Reaction source relation must be parent, child or descendant",
            )
          }
          if (this.stringArray(source.states, childPath(sourcePath, "states"), "Reaction source States")) {
            this.unique(source.states, childPath(sourcePath, "states"), "Reaction source State")
            if (source.states.length === 0) {
              this.issue(childPath(sourcePath, "states"), "empty_reaction_states", "Reaction source must observe at least one State")
            }
            source.states.forEach((state, stateIndex) => {
              if (state.trim().length === 0) {
                this.issue(childPath(childPath(sourcePath, "states"), stateIndex), "empty_string", "Reaction source State must not be empty")
              }
            })
          }
        })
      }
      const fieldKeys = new Set(fields.keys())
      if (this.stringArray(item.read, childPath(itemPath, "read"), "Reaction read set")) {
        this.fieldReferences(item.read, childPath(itemPath, "read"), fieldKeys)
        this.unique(item.read, childPath(itemPath, "read"), "Reaction read Field")
      }
      if (this.stringArray(item.write, childPath(itemPath, "write"), "Reaction write set")) {
        this.fieldReferences(item.write, childPath(itemPath, "write"), fieldKeys)
        this.unique(item.write, childPath(itemPath, "write"), "Reaction write Field")
        item.write.forEach((key, fieldIndex) => {
          const field = fields.get(key)
          if (field?.type === "enum" || field?.type === "array") {
            this.issue(
              childPath(childPath(itemPath, "write"), fieldIndex),
              "topology_field_write",
              `Reaction cannot write topology Field "${key}"`,
            )
          }
        })
      }
      for (const access of ["massRead", "massWrite"] as const) {
        const accessPath = childPath(itemPath, access)
        if (!this.stringArray(item[access], accessPath, `Reaction ${access}`)) continue
        this.unique(item[access], accessPath, `Reaction ${access} Mass`)
        item[access].forEach((key, massIndex) => {
          if (!massKeys.has(key)) {
            this.issue(childPath(accessPath, massIndex), "unknown_mass_reference", `Unknown Mass "${key}"`)
          }
        })
      }
      if (this.stringArray(item.states, childPath(itemPath, "states"), "Reaction States")) {
        this.unique(item.states, childPath(itemPath, "states"), "Reaction active State")
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

  template(value: unknown, path: JsonPointer): TemplateTargets {
    const targets: TemplateTargets = {matter: new Set(), reactions: new Set()}
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
      this.reactions(
        value.reactions,
        childPath(path, "reactions"),
        fields,
        states,
        new Set(massKeys),
        targets.reactions,
      )
    }
    if (value.matter !== undefined) this.matter(value.matter, childPath(path, "matter"), targets.matter)
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

  runtimeMass(value: unknown, path: JsonPointer, template: RecordValue): void {
    if (!this.array(value, path, "Runtime Mass")) return
    const declarations = new Map<string, RecordValue>()
    if (Array.isArray(template.mass)) {
      for (const declaration of template.mass) {
        if (isRecord(declaration) && typeof declaration.key === "string") {
          declarations.set(declaration.key, declaration)
        }
      }
    }
    const keys: string[] = []
    value.forEach((item, index) => {
      const itemPath = childPath(path, index)
      if (!this.record(item, itemPath, "Runtime Mass item")) return
      this.closed(item, itemPath, ["ref", "key", "format", "label", "description", "content"])
      this.required(item, itemPath, ["ref", "key", "format", "label", "description", "content"])
      const rawRef = item.ref
      const rawKey = item.key
      const format = item.format
      const refOk = this.typedRef(rawRef, childPath(itemPath, "ref"), "Mass ref", MASS_REF)
      const keyOk = this.nonEmptyString(rawKey, childPath(itemPath, "key"), "Runtime Mass key")
      if (keyOk) keys.push(rawKey)
      if (format !== "json" && format !== "binary") {
        this.issue(childPath(itemPath, "format"), "invalid_mass_format", "Runtime Mass format must be json or binary")
      }
      if (item.label !== null) this.string(item.label, childPath(itemPath, "label"), "Runtime Mass label")
      if (item.description !== null) {
        this.string(item.description, childPath(itemPath, "description"), "Runtime Mass description")
      }
      if (item.content !== "lazy") {
        this.issue(childPath(itemPath, "content"), "invalid_literal", "Runtime Mass content must use the lazy marker")
      }
      const declaration = keyOk ? declarations.get(rawKey) : undefined
      if (keyOk && !declaration) {
        this.issue(childPath(itemPath, "key"), "unknown_mass_reference", `Runtime Mass "${rawKey}" is not declared`)
      } else if (declaration && declaration.format !== format) {
        this.issue(childPath(itemPath, "format"), "mass_format_mismatch", "Runtime Mass format must match its declaration")
      }
      if (refOk && (format === "json" || format === "binary")) {
        const previous = this.runtimeMassFormats.get(rawRef)
        if (previous !== undefined && previous !== format) {
          this.issue(childPath(itemPath, "ref"), "mass_ref_mismatch", "One Mass ref cannot use multiple formats")
        } else {
          this.runtimeMassFormats.set(rawRef, format)
        }
      }
    })
    this.unique(keys, path, "Runtime Mass key")
  }

  runtimeNode(
    value: unknown,
    path: JsonPointer,
    document: RecordValue,
    templates: RecordValue,
    expectedDeclarations: OccurrenceExpectation[] | null,
    root: MetaAddress | null,
    owningAtom: string | null,
  ): void {
    if (!this.record(value, path, "Runtime node")) return
    let resolved: {tokens: string[]; value: unknown} | null = null
    let childDeclarations: OccurrencePlan = {mode: "static", items: []}
    if (value.kind === "atom") {
      this.closed(value, path, ["ref", "kind", "declaration", "meta", "state", "values", "mass", "children"])
      this.required(value, path, ["ref", "kind", "declaration", "meta", "state", "values", "mass"])
      const refOk = this.typedRef(value.ref, childPath(path, "ref"), "Atom ref", ATOM_REF)
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
        this.runtimeMass(value.mass, childPath(path, "mass"), template)
        if (refOk && metaOk) {
          if (this.runtimeAtoms.has(value.ref as string)) {
            this.issue(childPath(path, "ref"), "duplicate_ref", `Atom ref "${String(value.ref)}" is duplicated`)
          } else {
            this.runtimeAtoms.set(value.ref as string, {
              meta,
              state: typeof value.state === "string" ? value.state : null,
            })
            this.runtimeParents.set(value.ref as string, owningAtom)
          }
        }
      }
    } else if (value.kind === "topology") {
      this.closed(value, path, ["ref", "kind", "declaration", "topology", "children"])
      this.required(value, path, ["ref", "kind", "declaration", "topology"])
      if (this.typedRef(value.ref, childPath(path, "ref"), "Topology ref", TOPOLOGY_REF)) {
        if (this.runtimeTopologies.has(value.ref)) {
          this.issue(childPath(path, "ref"), "duplicate_ref", `Topology ref "${value.ref}" is duplicated`)
        } else {
          this.runtimeTopologies.add(value.ref)
        }
      }
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
    const childOwner = value.kind === "atom" && typeof value.ref === "string" && ATOM_REF.test(value.ref)
      ? value.ref
      : owningAtom
    this.runtimeChildren(
      value.children,
      childPath(path, "children"),
      document,
      templates,
      childDeclarations,
      childOwner,
    )
  }

  runtimeChildren(
    value: unknown,
    path: JsonPointer,
    document: RecordValue,
    templates: RecordValue,
    expected: OccurrencePlan,
    owningAtom: string | null,
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
        owningAtom,
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

  reactionRelationMatches(
    relation: unknown,
    source: string,
    target: string,
  ): boolean {
    if (relation === undefined) return true
    if (relation === "parent") return this.runtimeParents.get(target) === source
    if (relation === "child") return this.runtimeParents.get(source) === target
    if (relation !== "descendant") return false
    const visited = new Set<string>()
    let current = this.runtimeParents.get(source) ?? null
    while (current !== null) {
      if (current === target) return true
      if (visited.has(current)) return false
      visited.add(current)
      current = this.runtimeParents.get(current) ?? null
    }
    return false
  }

  runtimeReactions(value: unknown, path: JsonPointer, templates: RecordValue): void {
    if (!this.array(value, path, "Runtime Reaction relations")) return
    const refs: string[] = []
    value.forEach((item, index) => {
      const itemPath = childPath(path, index)
      if (!this.record(item, itemPath, "Runtime Reaction relation")) return
      this.closed(item, itemPath, ["ref", "kind", "reaction", "source", "target", "active"])
      this.required(item, itemPath, ["ref", "kind", "reaction", "source", "target", "active"])
      if (this.typedRef(item.ref, childPath(itemPath, "ref"), "Reaction relation ref", REACTION_RELATION_REF)) {
        refs.push(item.ref)
      }
      if (item.kind !== "reaction") {
        this.issue(childPath(itemPath, "kind"), "invalid_literal", "Runtime Reaction relation kind must be reaction")
      }

      const reactionPath = childPath(itemPath, "reaction")
      let declaration: RecordValue | undefined
      let reactionMeta: MetaAddress | null = null
      let reactionKey: string | null = null
      if (this.record(item.reaction, reactionPath, "Reaction declaration reference")) {
        this.closed(item.reaction, reactionPath, ["meta", "key"])
        this.required(item.reaction, reactionPath, ["meta", "key"])
        if (this.address(item.reaction.meta, childPath(reactionPath, "meta"))) {
          reactionMeta = item.reaction.meta
        }
        if (this.nonEmptyString(item.reaction.key, childPath(reactionPath, "key"), "Reaction key")) {
          reactionKey = item.reaction.key
        }
        const template = reactionMeta === null ? undefined : templates[reactionMeta]
        if (isRecord(template) && Array.isArray(template.reactions) && reactionKey !== null) {
          declaration = template.reactions.find((candidate) =>
            isRecord(candidate) && candidate.key === reactionKey
          ) as RecordValue | undefined
        }
        if (reactionMeta !== null && reactionKey !== null && declaration === undefined) {
          this.issue(reactionPath, "unknown_reaction_reference", `Reaction "${reactionMeta}#${reactionKey}" is not declared`)
        }
      }

      const sourcePath = childPath(itemPath, "source")
      let source: {meta: MetaAddress; state: string | null} | undefined
      let sourceRef: string | null = null
      let sourceStates: string[] = []
      if (this.record(item.source, sourcePath, "Reaction source endpoint")) {
        this.closed(item.source, sourcePath, ["atom", "states"])
        this.required(item.source, sourcePath, ["atom", "states"])
        if (this.typedRef(item.source.atom, childPath(sourcePath, "atom"), "Reaction source Atom", ATOM_REF)) {
          sourceRef = item.source.atom
          source = this.runtimeAtoms.get(item.source.atom)
          if (!source) {
            this.issue(childPath(sourcePath, "atom"), "unknown_atom_reference", `Unknown source Atom "${item.source.atom}"`)
          }
        }
        if (this.stringArray(item.source.states, childPath(sourcePath, "states"), "Reaction source States")) {
          sourceStates = item.source.states
          this.unique(sourceStates, childPath(sourcePath, "states"), "Reaction source State")
          if (sourceStates.length === 0) {
            this.issue(childPath(sourcePath, "states"), "empty_reaction_states", "Resolved source must expose at least one State")
          }
        }
      }

      const targetPath = childPath(itemPath, "target")
      let target: {meta: MetaAddress; state: string | null} | undefined
      let targetRef: string | null = null
      let targetStates: string[] = []
      if (this.record(item.target, targetPath, "Reaction target endpoint")) {
        this.closed(item.target, targetPath, ["atom", "states"])
        this.required(item.target, targetPath, ["atom", "states"])
        if (this.typedRef(item.target.atom, childPath(targetPath, "atom"), "Reaction target Atom", ATOM_REF)) {
          targetRef = item.target.atom
          target = this.runtimeAtoms.get(item.target.atom)
          if (!target) {
            this.issue(childPath(targetPath, "atom"), "unknown_atom_reference", `Unknown target Atom "${item.target.atom}"`)
          }
        }
        if (this.stringArray(item.target.states, childPath(targetPath, "states"), "Reaction target States")) {
          targetStates = item.target.states
          this.unique(targetStates, childPath(targetPath, "states"), "Reaction target State")
        }
      }

      if (source) {
        const sourceTemplate = templates[source.meta]
        const declaredStates = isRecord(sourceTemplate) && Array.isArray(sourceTemplate.superposition)
          ? new Set(sourceTemplate.superposition.flatMap((state) =>
              isRecord(state) && typeof state.name === "string" ? [state.name] : []
            ))
          : new Set<string>()
        sourceStates.forEach((state, stateIndex) => {
          if (!declaredStates.has(state)) {
            this.issue(childPath(childPath(sourcePath, "states"), stateIndex), "unknown_state_reference", `Unknown source State "${state}"`)
          }
        })
      }
      if (target && reactionMeta !== null && target.meta !== reactionMeta) {
        this.issue(targetPath, "reaction_target_mismatch", "Reaction relation target must instantiate the declaring Meta")
      }
      if (declaration) {
        const declaredTargetStates = Array.isArray(declaration.states)
          ? declaration.states.filter((state): state is string => typeof state === "string")
          : []
        if (declaredTargetStates.length !== targetStates.length ||
            declaredTargetStates.some((state) => !targetStates.includes(state))) {
          this.issue(childPath(targetPath, "states"), "reaction_target_states_mismatch", "Resolved target States must match the Reaction declaration")
        }
        const selectors = declaration.sources
        if (source && sourceRef !== null && targetRef !== null && Array.isArray(selectors)) {
          const matches = sourceStates.every((state) =>
            selectors.some((selector) => {
              if (!isRecord(selector)) return false
              const selectorStates = selector.states
              return (selector.atom === undefined || selector.atom === sourceRef) &&
                (selector.meta === undefined || selector.meta === source.meta) &&
                this.reactionRelationMatches(selector.relation, sourceRef, targetRef) &&
                Array.isArray(selectorStates) && selectorStates.includes(state)
            })
          )
          if (!matches) {
            this.issue(sourcePath, "reaction_source_mismatch", "Resolved source does not match an authored Reaction selector")
          }
        }
      }
      if (typeof item.active !== "boolean") {
        this.issue(childPath(itemPath, "active"), "invalid_type", "Reaction active must be boolean")
      } else if (target && item.active !== (target.state !== null && targetStates.includes(target.state))) {
        this.issue(childPath(itemPath, "active"), "reaction_activity_mismatch", "Reaction activity must be derived from the target current State")
      }
    })
    this.unique(refs, path, "Reaction relation ref")
  }

  reactionSourceStates(templates: RecordValue): void {
    for (const [address, template] of Object.entries(templates)) {
      if (!isRecord(template) || !Array.isArray(template.reactions)) continue
      template.reactions.forEach((reaction, reactionIndex) => {
        if (!isRecord(reaction) || !Array.isArray(reaction.sources)) return
        reaction.sources.forEach((source, sourceIndex) => {
          if (!isRecord(source) || !isMetaAddress(source.meta) || !Array.isArray(source.states)) return
          const sourceTemplate = templates[source.meta]
          if (!isRecord(sourceTemplate)) return
          const names = new Set(
            Array.isArray(sourceTemplate.superposition)
              ? sourceTemplate.superposition.flatMap((state) =>
                  isRecord(state) && typeof state.name === "string" ? [state.name] : []
                )
              : [],
          )
          const statesPath = childPath(
            childPath(
              childPath(
                childPath(childPath("/template", address), "reactions"),
                reactionIndex,
              ),
              "sources",
            ),
            sourceIndex,
          )
          source.states.forEach((state, stateIndex) => {
            if (typeof state === "string" && !names.has(state)) {
              this.issue(
                childPath(childPath(statesPath, "states"), stateIndex),
                "unknown_state_reference",
                `Unknown source State "${state}" in Meta "${source.meta}"`,
              )
            }
          })
        })
      })
    }
  }

  deltaRuntimeNodeHead(
    value: unknown,
    path: JsonPointer,
    targetRef: RuntimeNodeRef,
  ): void {
    if (!this.record(value, path, "GraphDelta runtime node value")) return
    if (value.kind === "atom") {
      this.closed(value, path, ["ref", "kind", "declaration", "meta", "state", "values", "mass"])
      this.required(value, path, ["ref", "kind", "declaration", "meta", "state", "values", "mass"])
      if (this.typedRef(value.ref, childPath(path, "ref"), "Atom ref", ATOM_REF) && value.ref !== targetRef) {
        this.issue(childPath(path, "ref"), "target_ref_mismatch", "Runtime Atom value ref must match its delta target")
      }
      this.string(value.declaration, childPath(path, "declaration"), "Runtime Atom declaration")
      this.address(value.meta, childPath(path, "meta"))
      if (value.state !== null) this.string(value.state, childPath(path, "state"), "Runtime Atom State")
      this.record(value.values, childPath(path, "values"), "Runtime Atom values")
      this.array(value.mass, childPath(path, "mass"), "Runtime Atom Mass")
      return
    }
    if (value.kind === "topology") {
      this.closed(value, path, ["ref", "kind", "declaration", "topology"])
      this.required(value, path, ["ref", "kind", "declaration", "topology"])
      if (this.typedRef(value.ref, childPath(path, "ref"), "Topology ref", TOPOLOGY_REF) && value.ref !== targetRef) {
        this.issue(childPath(path, "ref"), "target_ref_mismatch", "Runtime Topology value ref must match its delta target")
      }
      this.string(value.declaration, childPath(path, "declaration"), "Runtime Topology declaration")
      if (!TOPOLOGIES.has(value.topology as string)) {
        this.issue(childPath(path, "topology"), "invalid_topology", "Runtime topology must be fuzzy, axion or macho")
      }
      return
    }
    this.issue(childPath(path, "kind"), "invalid_runtime_kind", "GraphDelta runtime node must be atom or topology")
  }

  deltaReactionRelation(
    value: unknown,
    path: JsonPointer,
    targetRef: ReactionRelationRef,
  ): void {
    if (!this.record(value, path, "GraphDelta Reaction relation value")) return
    this.closed(value, path, ["ref", "kind", "reaction", "source", "target", "active"])
    this.required(value, path, ["ref", "kind", "reaction", "source", "target", "active"])
    if (
      this.typedRef(value.ref, childPath(path, "ref"), "Reaction relation ref", REACTION_RELATION_REF) &&
      value.ref !== targetRef
    ) {
      this.issue(childPath(path, "ref"), "target_ref_mismatch", "Reaction relation value ref must match its delta target")
    }
    if (value.kind !== "reaction") {
      this.issue(childPath(path, "kind"), "invalid_literal", "Reaction relation kind must be reaction")
    }
    const reactionPath = childPath(path, "reaction")
    if (this.record(value.reaction, reactionPath, "Reaction declaration reference")) {
      this.closed(value.reaction, reactionPath, ["meta", "key"])
      this.required(value.reaction, reactionPath, ["meta", "key"])
      this.address(value.reaction.meta, childPath(reactionPath, "meta"))
      this.nonEmptyString(value.reaction.key, childPath(reactionPath, "key"), "Reaction key")
    }
    for (const side of ["source", "target"] as const) {
      const sidePath = childPath(path, side)
      if (!this.record(value[side], sidePath, `Reaction ${side}`)) continue
      this.closed(value[side], sidePath, ["atom", "states"])
      this.required(value[side], sidePath, ["atom", "states"])
      this.typedRef(value[side].atom, childPath(sidePath, "atom"), `Reaction ${side} Atom ref`, ATOM_REF)
      const statesPath = childPath(sidePath, "states")
      if (this.stringArray(value[side].states, statesPath, `Reaction ${side} States`)) {
        this.unique(value[side].states, statesPath, `Reaction ${side} State`)
      }
    }
    if (typeof value.active !== "boolean") {
      this.issue(childPath(path, "active"), "invalid_type", "Reaction relation active must be boolean")
    }
  }

  deltaChange(
    value: unknown,
    path: JsonPointer,
    targets: Set<string>,
  ): void {
    if (!this.record(value, path, "GraphDelta change")) return
    const targetPath = childPath(path, "target")
    if (!this.record(value.target, targetPath, "GraphDelta target")) {
      this.closed(value, path, ["op", "target", "value"])
      this.required(value, path, ["op", "target"])
      return
    }
    const kind = value.target.kind
    let targetKey: string | null = null

    if (kind === "template") {
      this.closed(value.target, targetPath, ["kind", "ref"])
      this.required(value.target, targetPath, ["kind", "ref"])
      const refOk = this.address(value.target.ref, childPath(targetPath, "ref"))
      targetKey = refOk ? `template\u0000${value.target.ref}` : null
      if (value.op === "remove") {
        this.closed(value, path, ["op", "target"])
        this.required(value, path, ["op", "target"])
      } else if (value.op === "add" || value.op === "replace") {
        this.closed(value, path, ["op", "target", "value"])
        this.required(value, path, ["op", "target", "value"])
        this.template(value.value, childPath(path, "value"))
      } else {
        this.issue(childPath(path, "op"), "invalid_delta_operation", "Template delta op must be add, replace or remove")
      }
    } else if (kind === "runtime-node") {
      this.closed(value.target, targetPath, ["kind", "ref"])
      this.required(value.target, targetPath, ["kind", "ref"])
      const targetRef = value.target.ref
      const refOk = this.runtimeNodeRef(targetRef, childPath(targetPath, "ref"), "Runtime node ref")
      targetKey = refOk ? `runtime-node\u0000${targetRef}` : null
      if (value.op === "remove") {
        this.closed(value, path, ["op", "target"])
        this.required(value, path, ["op", "target"])
      } else if ((value.op === "add" || value.op === "replace") && refOk) {
        this.closed(value, path, ["op", "target", "value"])
        this.required(value, path, ["op", "target", "value"])
        this.deltaRuntimeNodeHead(value.value, childPath(path, "value"), targetRef)
      } else if (value.op !== "add" && value.op !== "replace") {
        this.issue(childPath(path, "op"), "invalid_delta_operation", "Runtime node delta op must be add, replace or remove")
      }
    } else if (kind === "children") {
      this.closed(value.target, targetPath, ["kind", "parent"])
      this.required(value.target, targetPath, ["kind", "parent"])
      const parentOk = value.target.parent === null ||
        this.runtimeNodeRef(value.target.parent, childPath(targetPath, "parent"), "Children parent ref")
      targetKey = parentOk ? `children\u0000${value.target.parent ?? "root"}` : null
      this.closed(value, path, ["op", "target", "value"])
      this.required(value, path, ["op", "target", "value"])
      if (value.op !== "replace") {
        this.issue(childPath(path, "op"), "invalid_delta_operation", "Children delta op must be replace")
      }
      if (value.value === null) {
        if (value.target.parent === null) {
          this.issue(childPath(path, "value"), "invalid_root_children", "Runtime roots cannot be absent")
        }
      } else if (this.array(value.value, childPath(path, "value"), "Children refs")) {
        const refs: string[] = []
        value.value.forEach((ref, index) => {
          if (this.runtimeNodeRef(ref, childPath(childPath(path, "value"), index), "Child ref")) refs.push(ref)
        })
        this.unique(refs, childPath(path, "value"), "Child ref")
      }
    } else if (kind === "reaction-relation") {
      this.closed(value.target, targetPath, ["kind", "ref"])
      this.required(value.target, targetPath, ["kind", "ref"])
      const refOk = this.typedRef(
        value.target.ref,
        childPath(targetPath, "ref"),
        "Reaction relation ref",
        REACTION_RELATION_REF,
      )
      targetKey = refOk ? `reaction-relation\u0000${value.target.ref}` : null
      if (value.op === "remove") {
        this.closed(value, path, ["op", "target"])
        this.required(value, path, ["op", "target"])
      } else if ((value.op === "add" || value.op === "replace") && refOk) {
        this.closed(value, path, ["op", "target", "value"])
        this.required(value, path, ["op", "target", "value"])
        this.deltaReactionRelation(
          value.value,
          childPath(path, "value"),
          value.target.ref as ReactionRelationRef,
        )
      } else if (value.op !== "add" && value.op !== "replace") {
        this.issue(childPath(path, "op"), "invalid_delta_operation", "Reaction relation delta op must be add, replace or remove")
      }
    } else if (kind === "reaction-order") {
      this.closed(value.target, targetPath, ["kind"])
      this.required(value.target, targetPath, ["kind"])
      targetKey = "reaction-order"
      this.closed(value, path, ["op", "target", "value"])
      this.required(value, path, ["op", "target", "value"])
      if (value.op !== "replace") {
        this.issue(childPath(path, "op"), "invalid_delta_operation", "Reaction order delta op must be replace")
      }
      if (this.array(value.value, childPath(path, "value"), "Reaction relation order")) {
        const refs: string[] = []
        value.value.forEach((ref, index) => {
          if (this.typedRef(
            ref,
            childPath(childPath(path, "value"), index),
            "Reaction relation ref",
            REACTION_RELATION_REF,
          )) refs.push(ref)
        })
        this.unique(refs, childPath(path, "value"), "Reaction relation ref")
      }
    } else {
      this.issue(childPath(targetPath, "kind"), "invalid_delta_target", "GraphDelta target kind is unsupported")
      this.closed(value, path, ["op", "target", "value"])
      this.required(value, path, ["op", "target"])
    }

    if (targetKey !== null) {
      if (targets.has(targetKey)) {
        this.issue(targetPath, "duplicate_delta_target", "GraphDelta may change one target at most once")
      }
      targets.add(targetKey)
    }
  }

  validateDelta(input: unknown): ValidationResult<GraphDelta> {
    if (!this.record(input, "", "GraphDelta")) return {ok: false, issues: this.issues}
    this.json(input, "")
    this.closed(input, "", ["schema", "root", "baseDigest", "resultDigest", "changes"])
    this.required(input, "", ["schema", "root", "baseDigest", "resultDigest", "changes"])
    if (input.schema !== GRAPH_DELTA_SCHEMA) {
      this.issue("/schema", "invalid_schema", `schema must be "${GRAPH_DELTA_SCHEMA}"`)
    }
    this.address(input.root, "/root")
    this.digest(input.baseDigest, "/baseDigest")
    this.digest(input.resultDigest, "/resultDigest")
    if (this.array(input.changes, "/changes", "GraphDelta changes")) {
      const targets = new Set<string>()
      input.changes.forEach((change, index) =>
        this.deltaChange(change, childPath("/changes", index), targets)
      )
    }
    return this.issues.length === 0
      ? {ok: true, value: input as unknown as GraphDelta}
      : {ok: false, issues: this.issues}
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
    const targets = new Map<MetaAddress, TemplateTargets>()
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
      for (const target of addressTargets.matter) {
        if (!Object.hasOwn(templates, target)) {
          this.issue(
            childPath(childPath("/template", address), "matter"),
            "unresolved_matter_target",
            `Matter target "${target}" must have a complete template entry`,
          )
        }
      }
      for (const target of addressTargets.reactions) {
        if (!Object.hasOwn(templates, target)) {
          this.issue(
            childPath(childPath("/template", address), "reactions"),
            "unresolved_reaction_source",
            `Reaction source Meta "${target}" must have a complete template entry`,
          )
        }
      }
    }
    this.reactionSourceStates(templates)
    if (rootOk && Object.hasOwn(templates, root)) {
      const reachable = new Set<MetaAddress>()
      const pending: MetaAddress[] = [root]
      while (pending.length > 0) {
        const address = pending.shift()!
        if (reachable.has(address)) continue
        reachable.add(address)
        const dependencies = targets.get(address)
        for (const target of dependencies?.matter ?? []) pending.push(target)
        for (const target of dependencies?.reactions ?? []) pending.push(target)
      }
      for (const address of Object.keys(templates)) {
        if (isMetaAddress(address) && !reachable.has(address)) {
          this.issue(childPath("/template", address), "unreachable_template", `Template "${address}" is not reachable from root`)
        }
      }
    }
    if (this.record(input.runtime, "/runtime", "Runtime")) {
      this.closed(input.runtime, "/runtime", ["roots", "reactions"])
      this.required(input.runtime, "/runtime", ["roots", "reactions"])
      if (this.array(input.runtime.roots, "/runtime/roots", "Runtime roots")) {
        input.runtime.roots.forEach((node, index) =>
          this.runtimeNode(
            node,
            childPath("/runtime/roots", index),
            input,
            templates,
            null,
            rootOk ? root : null,
            null,
          )
        )
      }
      this.runtimeReactions(input.runtime.reactions, "/runtime/reactions", templates)
    }
    return this.issues.length === 0
      ? {ok: true, value: input as unknown as Graph}
      : {ok: false, issues: this.issues}
  }
}

/**
Проверяет полный Graph как закрытые JSON-данные и все declaration/runtime связи.

Функция возвращает discriminated result и не является boolean type guard.

@returns Валидированный исходный Graph либо полный список обнаруженных issues.
*/
export const validateGraph = (input: unknown): ValidationResult<Graph> =>
  new Validator().validate(input)

/**
Проверяет закрытую wire-структуру GraphDelta без предположений о base Graph.

Semantic add/replace/remove preconditions, containment reachability и конечный
Graph проверяются атомарным applicator, которому доступен base snapshot.

@returns Валидированный structural delta либо полный список обнаруженных issues.
*/
export const validateGraphDelta = (input: unknown): ValidationResult<GraphDelta> =>
  new Validator().validateDelta(input)

/** Стабильная object surface для consumer, внедряющего Graph validators. */
export const graphValidators: GraphValidators = {
  graph: validateGraph,
  delta: validateGraphDelta,
}
