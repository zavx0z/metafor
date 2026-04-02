import type { Fields } from "./fields.t"
import type { Mass } from "./metafor.t"
import type { ExecutionEnv, ParsedActionHandler } from "./process.t"

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
export type FinallyChain<ɸ extends Fields = Fields, m extends Mass = Mass> = {
  before: (handler: ({ mass }: { mass: m }) => void | Promise<void>) => FinallyChain<ɸ, m>
}

export type DestroyChain<ɸ extends Fields = Fields, m extends Mass = Mass> = FinallyChain<ɸ, m>

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
