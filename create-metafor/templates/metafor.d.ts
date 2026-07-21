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

type MetaForIsAny<Value> = 0 extends (1 & Value) ? true : false

type MetaForSerializableMassResult<Value> = MetaForIsAny<Value> extends true
  ? false
  : Value extends null | string | number | boolean
    ? true
    : Value extends readonly (infer Item)[]
      ? MetaForIsSerializableMassValue<Item>
      : Value extends (...args: any[]) => any
        ? false
        : Value extends object
          ? Extract<keyof Value, symbol> extends never
            ? Extract<Value[keyof Value], (...args: any[]) => any> extends never
              ? false extends {
                  [Key in keyof Value]-?: MetaForIsSerializableMassValue<Value[Key]>
                }[keyof Value]
                ? false
                : true
              : false
            : false
          : false

type MetaForIsSerializableMassValue<Value> = MetaForIsAny<Value> extends true
  ? false
  : false extends (Value extends unknown ? MetaForSerializableMassResult<Value> : never)
    ? false
    : true

type MetaForMassDeclaration<Mass extends Record<string, unknown>> = {
  [Key in keyof Mass]: MetaForIsSerializableMassValue<Mass[Key]> extends true
    ? Mass[Key]
    : never
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
    callback: (params: { mass: Mass; energy: Energy }) => void | Promise<void>,
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

type MetaForBulkStage = {
  bulk(parts?: MetaForBulkParts): MetaForSchema
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
  ): MetaForBulkStage
}

type MetaForReactionStage<
  Fields extends MetaForFields,
  Superposition,
  Mass,
  Energy,
> = {
  reactions(
    callback?: () => readonly unknown[],
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
  energy<Energy extends Record<string, unknown>>(
    callback: () => Energy & MetaForEnergyDeclaration<Energy>,
  ): MetaForProcessStage<Fields, Superposition, Mass, Energy>
}

type MetaForMassStage<
  Fields extends MetaForFields,
  Superposition,
> = {
  mass<Mass extends Record<string, unknown>>(
    value: Mass & MetaForMassDeclaration<Mass>,
  ): MetaForEnergyStage<Fields, Superposition, Mass>
}

type MetaForSuperpositionStage<Fields extends MetaForFields> = {
  superposition<const Superposition extends Record<string, unknown>>(
    value: Superposition,
    ...check: MetaForSuperpositionInputCheck<Fields, Superposition>
  ): MetaForMassStage<Fields, Superposition>
}

type MetaForFieldsStage = {
  fields<Fields extends MetaForFields>(
    callback: (field: MetaForFieldBuilder) => Fields,
  ): MetaForSuperpositionStage<Fields>
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

export {}
