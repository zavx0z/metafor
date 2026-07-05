import type { Fields } from "./fields.ts"
import type { Mass } from "./metafor.ts"
import type { ExecutionEnv, ParsedActionHandler } from "./process.ts"

declare const FinallyStateBrand: unique symbol

interface FinallyStateMarker<s extends string> {
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

/**
 * Цепочка для декларации finally-процесса.
 */
export interface FinallyChain<ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string> extends FinallyStateMarker<s> {
  before: (handler: ({ mass }: { mass: m }) => void | Promise<void>) => FinallyChain<ɸ, m, s>
}

/**
 * Распарсенный finally-процесс.
 */
export interface ParsedFinally {
  type: "finally"
  /** Название процесса */
  label?: string
  /** Описание процесса */
  desc?: string
  /** Среды исполнения процесса */
  env?: ExecutionEnv[]
  before: ParsedActionHandler
}
