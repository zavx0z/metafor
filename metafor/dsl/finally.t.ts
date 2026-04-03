import type { Fields } from "./fields.t"
import type { Mass } from "./metafor.t"
import type { ExecutionEnv, ParsedActionHandler } from "./process.t"

declare const FinallyStateBrand: unique symbol

type FinallyStateMarker<s extends string> = {
  readonly [FinallyStateBrand]?: s
}

interface BaseFinallyConfig {
  /** Название */
  label?: string
  /** Описание */
  desc?: string
}

export interface FinallyConfig extends BaseFinallyConfig {
  /** Среды исполнения процесса */
  env?: ExecutionEnv[]
}

export type DestroyConfig = FinallyConfig

/**
 * Цепочка для декларации finally-процесса.
 */
export type FinallyChain<ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string> = FinallyStateMarker<s> & {
  before: (handler: ({ mass }: { mass: m }) => void | Promise<void>) => FinallyChain<ɸ, m, s>
}

export type DestroyChain<ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string> = FinallyChain<ɸ, m, s>

/**
 * Распарсенный finally-процесс.
 */
export type ParsedFinally = {
  type: "finally"
  /** Название процесса */
  label?: string
  /** Описание процесса */
  desc?: string
  /** Среды исполнения процесса */
  env?: ExecutionEnv[]
  before: ParsedActionHandler
}

export type ParsedDestroy = ParsedFinally
