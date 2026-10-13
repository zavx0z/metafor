declare const MetaForFieldValueBrand: unique symbol
declare const MetaForProcessStateBrand: unique symbol

type MetaForTemplateTag = (strings: TemplateStringsArray, ...values: unknown[]) => string

type MetaForFieldKind = "string" | "number" | "boolean" | "array" | "enum"

type MetaForFieldConfig = {
  label?: string
  id?: true
  data?: string
}

type MetaForFieldType<
  Kind extends MetaForFieldKind,
  Value,
  Required extends boolean,
  Options extends readonly string[] = readonly string[],
> = {
  readonly type: Kind
  readonly required: Required
  readonly default?: Value
  readonly values?: Options
  readonly [MetaForFieldValueBrand]?: Value
}

type MetaForAnyField = MetaForFieldType<
  MetaForFieldKind,
  unknown,
  boolean,
  readonly string[]
>

type MetaForFields = Record<string, MetaForAnyField>

type MetaForValue<Field> = Field extends MetaForFieldType<
  MetaForFieldKind,
  infer Value,
  infer Required,
  readonly string[]
>
  ? Required extends true
    ? Value
    : Value | null
  : never

type MetaForValues<Fields extends MetaForFields> = {
  [Key in keyof Fields]: MetaForValue<Fields[Key]>
}

type MetaForUpdate<Fields extends MetaForFields> = (
  values: Partial<MetaForValues<Fields>>,
) => Partial<MetaForValues<Fields>>

type MetaForPrimitiveField<
  Kind extends "string" | "number" | "boolean",
  Value,
> = {
  optional(config?: MetaForFieldConfig): MetaForFieldType<Kind, Value, false>
  optional<Default extends Value>(
    defaultValue: Default,
    config?: MetaForFieldConfig,
  ): MetaForFieldType<Kind, Value, false>
  required<Default extends Value>(
    defaultValue: Default,
    config?: MetaForFieldConfig,
  ): MetaForFieldType<Kind, Value, true>
}

type MetaForArrayField = {
  optional(config?: MetaForFieldConfig): MetaForFieldType<"array", number[], false>
  optional(
    defaultValue: number[],
    config?: MetaForFieldConfig,
  ): MetaForFieldType<"array", number[], false>
  required(
    defaultValue: number[],
    config?: MetaForFieldConfig,
  ): MetaForFieldType<"array", number[], true>
}

type MetaForEnumField<Options extends readonly [string, ...string[]]> = {
  optional(config?: MetaForFieldConfig): MetaForFieldType<
    "enum",
    Options[number],
    false,
    Options
  >
  optional<Default extends Options[number]>(
    defaultValue: Default,
    config?: MetaForFieldConfig,
  ): MetaForFieldType<"enum", Options[number], false, Options>
  required<Default extends Options[number]>(
    defaultValue: Default,
    config?: MetaForFieldConfig,
  ): MetaForFieldType<"enum", Options[number], true, Options>
}

type MetaForFieldBuilder = {
  string: MetaForPrimitiveField<"string", string>
  number: MetaForPrimitiveField<"number", number>
  boolean: MetaForPrimitiveField<"boolean", boolean>
  array: MetaForArrayField
  enum<const Options extends readonly [string, ...string[]]>(
    ...values: Options
  ): MetaForEnumField<Options>
}

type MetaForNullableOperator<Required extends boolean> = Required extends true
  ? {}
  : { null?: boolean }

type MetaForStringCondition<Required extends boolean> =
  | string
  | (MetaForNullableOperator<Required> & {
      eq?: string
      notEq?: string
      include?: string
      notInclude?: string
      startsWith?: string
      endsWith?: string
      pattern?: RegExp
      length?: number | { min?: number; max?: number }
      between?: readonly [string, string]
      in?: readonly string[]
      notIn?: readonly string[]
    })
  | (Required extends true ? never : null)

type MetaForNumberCondition<Required extends boolean> =
  | number
  | (MetaForNullableOperator<Required> & {
      eq?: number
      notEq?: number
      gt?: number
      gte?: number
      lt?: number
      lte?: number
      notGt?: number
      notGte?: number
      notLt?: number
      notLte?: number
      between?: readonly [number, number]
      in?: readonly number[]
      notIn?: readonly number[]
    })
  | (Required extends true ? never : null)

type MetaForBooleanCondition<Required extends boolean> =
  | boolean
  | (MetaForNullableOperator<Required> & {
      eq?: boolean
      notEq?: boolean
      logicalEq?: boolean
    })
  | (Required extends true ? never : null)

type MetaForEnumCondition<Value, Required extends boolean> =
  | Value
  | (MetaForNullableOperator<Required> & {
      eq?: Value
      notEq?: Value
      oneOf?: readonly Value[]
      notOneOf?: readonly Value[]
    })
  | (Required extends true ? never : null)

type MetaForArrayCondition<Required extends boolean> =
  | number[]
  | (MetaForNullableOperator<Required> & {
      length?: number | { min?: number; max?: number }
      includes?: number
      notIncludes?: number
      every?: { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number }
      some?: { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number }
      isEmpty?: boolean
    })
  | (Required extends true ? never : null)

type MetaForFieldCondition<Field> = Field extends MetaForFieldType<
  infer Kind,
  infer Value,
  infer Required,
  readonly string[]
>
  ? Kind extends "enum"
    ? MetaForEnumCondition<Value, Required>
    : Kind extends "string"
      ? MetaForStringCondition<Required>
      : Kind extends "number"
        ? MetaForNumberCondition<Required>
        : Kind extends "boolean"
          ? MetaForBooleanCondition<Required>
          : Kind extends "array"
            ? MetaForArrayCondition<Required>
            : never
  : never

type MetaForWave<Fields extends MetaForFields> = {
  [Key in keyof Fields]?: MetaForFieldCondition<Fields[Key]>
}

type MetaForStateKeys<Superposition> = Extract<keyof Superposition, string>

type MetaForTransitions<
  State extends string,
  Fields extends MetaForFields,
> = {
  [Target in State]?: MetaForWave<Fields>
}

type MetaForSuperposition<
  State extends string,
  Fields extends MetaForFields,
> = {
  [From in State]: MetaForTransitions<Exclude<State, From>, Fields> | null
}

type MetaForObjectUnionKeys<Value> = Value extends object ? keyof Value : never

type MetaForConditionIsExact<Actual, Expected> = Actual extends Expected
  ? Actual extends object
    ? Exclude<keyof Actual, MetaForObjectUnionKeys<Expected>> extends never
      ? true
      : false
    : true
  : false

type MetaForWaveIsExact<Fields extends MetaForFields, Actual> = Actual extends object
  ? Exclude<keyof Actual, keyof Fields> extends never
    ? false extends {
        [Key in keyof Actual]: Key extends keyof Fields
          ? MetaForConditionIsExact<Actual[Key], MetaForFieldCondition<Fields[Key]>>
          : false
      }[keyof Actual]
      ? false
      : true
    : false
  : false

type MetaForTransitionsAreExact<
  Fields extends MetaForFields,
  Superposition extends Record<string, unknown>,
  From extends string,
  Actual,
> = Actual extends null
  ? true
  : Actual extends object
    ? From extends keyof Actual
      ? false
      : Exclude<keyof Actual, Exclude<MetaForStateKeys<Superposition>, From>> extends never
      ? false extends {
          [Target in keyof Actual]: MetaForWaveIsExact<Fields, Actual[Target]>
        }[keyof Actual]
        ? false
        : true
      : false
    : false

type MetaForSuperpositionIsExact<
  Fields extends MetaForFields,
  Superposition extends Record<string, unknown>,
> = false extends {
  [State in keyof Superposition]: MetaForTransitionsAreExact<
    Fields,
    Superposition,
    State extends string ? State : never,
    Superposition[State]
  >
}[keyof Superposition]
  ? false
  : true

type MetaForSuperpositionInputCheck<
  Fields extends MetaForFields,
  Superposition extends Record<string, unknown>,
> = Superposition extends MetaForSuperposition<
  MetaForStateKeys<Superposition>,
  Fields
>
  ? MetaForSuperpositionIsExact<Fields, Superposition> extends true
    ? []
    : [expected: MetaForSuperposition<MetaForStateKeys<Superposition>, Fields>]
  : [expected: MetaForSuperposition<MetaForStateKeys<Superposition>, Fields>]

type MetaForIncomingTransitionWave<
  Superposition,
  Target extends string,
> = {
  [From in MetaForStateKeys<Superposition>]: Superposition[From] extends null
    ? never
    : Target extends Extract<keyof Superposition[From], string>
      ? Superposition[From][Target]
      : never
}[MetaForStateKeys<Superposition>]

type MetaForRefineNullability<Value, Guard> = Guard extends null
  ? Extract<Value, null | undefined>
  : Guard extends { null: infer NullFlag }
    ? NullFlag extends true
      ? Extract<Value, null | undefined>
      : NullFlag extends false
        ? NonNullable<Value>
        : Value
    : Value

type MetaForApplyIncomingWaveRefinement<
  Fields extends MetaForFields,
  GuardWave,
> = GuardWave extends object
  ? {
      [Key in keyof MetaForValues<Fields>]: Key extends keyof GuardWave
        ? MetaForRefineNullability<MetaForValues<Fields>[Key], GuardWave[Key]>
        : MetaForValues<Fields>[Key]
    }
  : MetaForValues<Fields>

type MetaForProcessValue<
  Fields extends MetaForFields,
  Superposition,
  Target extends string,
> = [MetaForIncomingTransitionWave<Superposition, Target>] extends [never]
  ? MetaForValues<Fields>
  : MetaForIncomingTransitionWave<Superposition, Target> extends infer GuardWave
    ? GuardWave extends unknown
      ? MetaForApplyIncomingWaveRefinement<Fields, GuardWave>
      : never
    : MetaForValues<Fields>

type MetaForEnergyDeclaration<Energy extends Record<string, unknown>> = {
  [Key in keyof Energy]: [Extract<Energy[Key], (...args: any[]) => any>] extends [never]
    ? Energy[Key]
    : never
}

type MetaForEnergyInputCheck<Energy extends Record<string, unknown>> =
  Energy extends MetaForEnergyDeclaration<Energy> ? [] : [energy: never]

type MetaForMassFormat = "json" | "binary" | "directory"

type MetaForMassDeclaration<Format extends MetaForMassFormat = MetaForMassFormat> = {
  readonly format: Format
  readonly label?: string
  readonly description?: string
}

type MetaForMassDeclarations = Record<string, MetaForMassDeclaration>

type MetaForMassHandle = {
  readBytes(): Promise<Uint8Array>
  readText(): Promise<string>
  readJson<Value = unknown>(): Promise<Value>
  write(value: unknown): Promise<void>
}

type MetaForMassDirectoryLease = {
  readonly path: string
  readonly signal: AbortSignal
  release(): Promise<void>
}

type MetaForMassDirectoryHandle = {acquire(): Promise<MetaForMassDirectoryLease>}
type MetaForMassHandles<Schema extends MetaForMassDeclarations> = {
  [Key in keyof Schema]: Schema[Key] extends MetaForMassDeclaration<"directory"> ? MetaForMassDirectoryHandle : MetaForMassHandle
}

type MetaForMassOptions = {label?: string; description?: string}
type MetaForMassFactory = {
  json(options?: MetaForMassOptions): MetaForMassDeclaration<"json">
  binary(options?: MetaForMassOptions): MetaForMassDeclaration<"binary">
  directory(options?: MetaForMassOptions): MetaForMassDeclaration<"directory">
}

/** The host supplies Graph types and implementation; standalone editing keeps its body opaque. */
type MetaForOracleEnvironment = {
  read(): Promise<{
    contractVersion: 1
    actor: {ref: `atom:${string}`; meta: string}
    scope: {kind: "full-root"; root: string}
    operations: readonly [{name: "readGraph"; description: string; inputSchema: {type: "object"; properties: Readonly<Record<string, never>>; additionalProperties: false}}]
    graph: unknown
  }>
  call(name: "readGraph", input: Readonly<Record<string, never>>): Promise<unknown>
}

declare const MetaForAgentFieldBrand: unique symbol
type MetaForAgentFieldReference<T> = {readonly kind: "field"; readonly key: string; readonly [MetaForAgentFieldBrand]?: T}
type MetaForAgentAtomReference = {readonly kind: "atom"; readonly scope: "owner"}
type MetaForAgentMassReference = {readonly kind: "mass"; readonly key: string}
type MetaForAgentJson = null | string | number | boolean | readonly MetaForAgentJson[] | {readonly [key: string]: MetaForAgentJson}
type MetaForAgentTool = {readonly kind: "oracle-tool"; readonly name: string; readonly input: MetaForAgentJson; readonly owner?: {readonly meta: string}}
type MetaForAgentOracleReference = {
  readonly kind: "oracle"
  tool<const Name extends string, const Input extends MetaForAgentJson>(name: Name, input: Input, owner?: {readonly meta: string}): MetaForAgentTool
}
type MetaForAgentDisplaySource = MetaForAgentAtomReference | MetaForAgentMassReference | MetaForAgentOracleReference | {readonly kind: "graph" | "force"}
type MetaForAgentBinding = string | null | MetaForAgentFieldReference<string | null>
type MetaForAgentElement = {readonly tag: "agent" | "display" | symbol; readonly props: Readonly<Record<string, unknown>>}
type MetaForAgentChildren = MetaForAgentElement | readonly MetaForAgentChildren[] | null | false
type MetaForAgentDisplayProps = {id: string; source: MetaForAgentDisplaySource}
type MetaForAgentProps = {
  id: string
  atom?: MetaForAgentAtomReference
  task: MetaForAgentBinding
  answer: MetaForAgentBinding
  status: MetaForAgentBinding
  error: MetaForAgentBinding
  providerBinding?: MetaForAgentBinding
  providerBootstrap?: MetaForAgentBinding
  providerRegistry?: MetaForAgentMassReference
  tools?: readonly MetaForAgentTool[]
  children?: MetaForAgentChildren
}
type MetaForAgentsContext<Values extends Record<string, unknown>, MassKeys extends string = never> = {
  readonly atom: MetaForAgentAtomReference
  readonly value: {[Key in keyof Values]: MetaForAgentFieldReference<Values[Key]>}
  readonly mass: {[Key in MassKeys]: MetaForAgentMassReference}
  readonly oracle: MetaForAgentOracleReference
  readonly graph: {readonly kind: "graph"}
  readonly force: {readonly kind: "force"}
}

type MetaForSelf = {
  atom: string
  meta: string
  path: string
}

type MetaForExecutionEnvironment = "browser" | "node" | "worker" | "server" | "any"

type MetaForProcessConfig = {
  label?: string
  desc?: string
  env?: readonly MetaForExecutionEnvironment[]
}

type MetaForStateItem<State extends string> = {
  readonly [MetaForProcessStateBrand]: State
}

type MetaForActionParams<
  Fields extends MetaForFields,
  Mass,
  Energy,
  Value,
> = {
  field: Fields
  value: Value
  mass: Mass
  energy: Energy
  signal: AbortSignal
  environment?: MetaForOracleEnvironment
  self: MetaForSelf
}

type MetaForActionChain<
  State extends string,
  Fields extends MetaForFields,
  Result,
> = MetaForStateItem<State> & {
  success(
    callback: (params: { update: MetaForUpdate<Fields>; data: Result }) => void,
  ): MetaForActionChain<State, Fields, Result>
  error(
    callback: (params: { update: MetaForUpdate<Fields>; error: Error }) => void,
  ): MetaForActionChain<State, Fields, Result>
}

type MetaForProcessChain<
  State extends string,
  Fields extends MetaForFields,
  Mass,
  Energy,
  Value,
> = {
  action<Result>(
    callback: (params: MetaForActionParams<Fields, Mass, Energy, Value>) => Result,
  ): MetaForActionChain<State, Fields, Awaited<Result>>
}

type MetaForDestroyChain<
  State extends string,
  Mass,
  Energy,
> = MetaForStateItem<State> & {
  before(
    callback: (params: { mass: Mass; energy: Energy; signal: AbortSignal }) => void | Promise<void>,
  ): MetaForDestroyChain<State, Mass, Energy>
}

type MetaForProcessesDeclaration<
  Fields extends MetaForFields,
  Superposition,
  Mass,
  Energy,
> = (
  process: <State extends MetaForStateKeys<Superposition>>(
    state: State,
    config?: MetaForProcessConfig,
  ) => MetaForProcessChain<
    State,
    Fields,
    Mass,
    Energy,
    MetaForProcessValue<Fields, Superposition, State>
  >,
  destroy: <State extends MetaForStateKeys<Superposition>>(
    state: State,
    config?: MetaForProcessConfig,
  ) => MetaForDestroyChain<State, Mass, Energy>,
) => readonly MetaForStateItem<MetaForStateKeys<Superposition>>[]

type MetaForBulkParts = {
  view?: (context: { css: MetaForTemplateTag }) => string
}

type MetaForSchema = {
  readonly __metafor?: true
}

type MetaForFinalStage<Fields extends MetaForFields, Mass> = MetaForSchema & {
  agents(declaration: (context: MetaForAgentsContext<MetaForValues<Fields>, Extract<keyof Mass, string>>) => MetaForAgentChildren): MetaForSchema
}

type MetaForBulkStage<Fields extends MetaForFields, Mass> = {
  bulk(parts?: MetaForBulkParts): MetaForFinalStage<Fields, Mass>
}

type MetaForMatterStage<
  Fields extends MetaForFields,
  Superposition,
  Mass,
  Energy,
> = {
  matter(
    callback?: (context: {
      value: MetaForValues<Fields>
      state: MetaForStateKeys<Superposition>
      update: MetaForUpdate<Fields>
      mass: Mass
      energy: Energy
      html: MetaForTemplateTag
    }) => string,
  ): MetaForBulkStage<Fields, Mass>
}

type MetaForReactionSourceSelector = Readonly<{
  atom?: `atom:${string}`
  meta?: string
  relation?: "parent" | "child" | "descendant"
  states: readonly [string, ...string[]]
}>

type MetaForReactionConfig<Mass> = Readonly<{
  key: string
  label?: string
  desc?: string
  mass?: Readonly<{
    read?: readonly Extract<keyof Mass, string>[]
    write?: readonly Extract<keyof Mass, string>[]
  }>
}>

type MetaForReactionObservation = Readonly<{
  id: string
  source: Readonly<{
    atom: `atom:${string}`
    meta: string
    state: string
  }>
  timestamp: number
}>

type MetaForOrdinaryFieldKey<Fields extends MetaForFields> = {
  [Key in keyof Fields]: Fields[Key]["type"] extends "string" | "number" | "boolean"
    ? Key
    : never
}[keyof Fields]

type MetaForReactionUpdate<Fields extends MetaForFields> = (
  values: Partial<Pick<MetaForValues<Fields>, MetaForOrdinaryFieldKey<Fields>>>,
) => Partial<Pick<MetaForValues<Fields>, MetaForOrdinaryFieldKey<Fields>>>

type MetaForReactionAction<
  Fields extends MetaForFields,
  State extends string,
  Mass,
> = (params: Readonly<{
  observation: MetaForReactionObservation
  update: MetaForReactionUpdate<Fields>
  value: MetaForValues<Fields>
  mass: Mass
  state: State
  self: MetaForSelf
}>) => void | Promise<void>

type MetaForReactionItem<
  Fields extends MetaForFields,
  State extends string,
  Mass,
> = Readonly<{
  key: string
  label: string
  desc?: string
  sources: readonly MetaForReactionSourceSelector[]
  update: MetaForReactionAction<Fields, State, Mass>
}>

type MetaForReactionBuilder<
  Fields extends MetaForFields,
  State extends string,
  Mass,
> = (
  config: MetaForReactionConfig<Mass>,
) => {
  filter(
    sources: readonly [MetaForReactionSourceSelector, ...MetaForReactionSourceSelector[]],
  ): {
    equal(
      update: MetaForReactionAction<Fields, State, Mass>,
    ): MetaForReactionItem<Fields, State, Mass>
  }
}

type MetaForReactionStage<
  Fields extends MetaForFields,
  Superposition,
  Mass,
  Energy,
> = {
  reactions(
    callback?: (
      reaction: MetaForReactionBuilder<Fields, MetaForStateKeys<Superposition>, Mass>,
    ) => readonly (
      readonly [
        readonly [MetaForStateKeys<Superposition>, ...MetaForStateKeys<Superposition>[]],
        MetaForReactionItem<Fields, MetaForStateKeys<Superposition>, Mass>,
      ]
    )[],
  ): MetaForMatterStage<Fields, Superposition, Mass, Energy>
}

type MetaForProcessStage<
  Fields extends MetaForFields,
  Superposition,
  Mass,
  Energy,
> = {
  processes(
    callback: MetaForProcessesDeclaration<Fields, Superposition, Mass, Energy>,
  ): MetaForReactionStage<Fields, Superposition, Mass, Energy>
}

type MetaForEnergyStage<
  Fields extends MetaForFields,
  Superposition,
  Mass,
> = {
  energy<Energy extends Record<string, unknown> = {}>(
    ...check: MetaForEnergyInputCheck<Energy>
  ): MetaForProcessStage<Fields, Superposition, Mass, Energy>
}

type MetaForMassStage<Fields extends MetaForFields, Superposition> = {
  mass<Factory extends (mass: MetaForMassFactory) => MetaForMassDeclarations>(
    factory: Factory,
  ): MetaForEnergyStage<Fields, Superposition, MetaForMassHandles<ReturnType<Factory>>>
}

type MetaForLifecycle<Fields extends MetaForFields> = Partial<Record<"started" | "stopping", {
  [Key in keyof Fields]: Fields[Key]["type"] extends "string" | "number" | "boolean"
    ? {field: Key & string; value: MetaForValues<Fields>[Key]}
    : never
}[keyof Fields]>>

type MetaForSuperpositionStage<Fields extends MetaForFields> = {
  superposition<const Superposition extends Record<string, unknown>>(
    value: Superposition,
    ...check: MetaForSuperpositionInputCheck<Fields, Superposition>
  ): MetaForMassStage<Fields, Superposition>
}

type MetaForFieldsStage = {
  fields<Fields extends MetaForFields>(
    callback: (field: MetaForFieldBuilder) => Fields,
  ): MetaForSuperpositionStage<Fields> & {
    lifecycle(input: MetaForLifecycle<Fields>): MetaForSuperpositionStage<Fields>
  }
}

type MetaForFn = (
  name: string,
  config?: { desc?: string },
) => MetaForFieldsStage

declare global {
  var MetaFor: MetaForFn

  interface Window {
    MetaFor: MetaForFn
  }
}

export type AgentsContext<Keys extends string = string, MassKeys extends string = never> =
  MetaForAgentsContext<Record<Keys, string | null>, MassKeys>
export type AgentProps = MetaForAgentProps & {atom: MetaForAgentAtomReference}
export type AgentDisplayProps = MetaForAgentDisplayProps
export type AgentElement = MetaForAgentElement
