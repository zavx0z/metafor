/**
 * Общие типы @metafor/dsl.
 *
 * Корневой экспорт для импорта типов:
 * ```typescript
 * import type { MetaDSL, MetaForFn } from "@metafor/dsl/types"
 * ```
 */

export type {
  MetaForFn,
  MetaForConfig,
  MetaDSL,
  BulkDeclaration,
  GravityDeclaration,
  ViewDefinitionParams,
  Mass,
  Self,
  JsonPatch,
  Initiator,
} from "./metafor"

export type {
  Process,
  ProcessChain,
  ActionChain,
  ActionParams,
  ProcessesDeclaration,
  ProcessesSchema,
  ParsedProcess,
  ParsedDestroy,
  ParsedActionHandler,
  ParsedHandler,
  ProcessConfig,
  DestroyConfig,
  DestroyChain,
  ExecutionEnv,
  ProcessType,
} from "./process"

export type {
  Reaction,
  ReactionAction,
  ReactionParams,
  ReactionFilterConditions,
  ReactionsDeclaration,
  ReactionsChainResult,
  ReactionsSchema,
} from "./reactions"

/**
 * Состояние приложения.
 * Строковое представление текущего состояния.
 *
 * @group Шаблонизатор
 * @example
 * ```typescript
 * const state: State = "loading" // "loading" | "ready" | "error"
 * ```
 */

export type State = string

export type {
  Superposition,
  Transitions,
  Wave,
  Condition,
  ConditionOptional,
  CondBooleanRequired,
  CondBooleanOptional,
  CondEnumRequired,
  CondEnumOptional,
  CondStringRequired,
  CondStringOptional,
  CondNumberRequired,
  CondNumberOptional,
  CondArrayRequired,
  CondArrayOptional,
} from "./states"
