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

export type {
  LocalTopologyFragment,
  LocalTopologyObject,
  LocalTopologyObjectKind,
  LocalTopologyPlacement,
  LocalTopologyPlacementRelation,
  LocalTopologyLink,
  LocalTopologyReference,
  LocalTopologyEntanglementSeed,
  LocalTopologyWIMP,
  LocalTopologyAxion,
  LocalTopologyFuzzy,
  LocalTopologyMACHO,
  LocalTopologyMetaLike,
} from "./topology"

// Реэкспорт для совместимости с compileLocalTopologyFragment
export { compileLocalTopologyFragment } from "@metafor/dsl/topology"
