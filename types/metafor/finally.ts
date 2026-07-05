import type { Fields } from "./fields.ts"
import type { Mass } from "./schema.ts"
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

export type FinallyBeforeHandler<m extends Mass> = ({ mass }: { mass: m }) => void | Promise<void>

export type FinallyInput<m extends Mass> = {
  type: ParsedFinally["type"]
  label?: string
  desc?: string
  env?: ExecutionEnv[]
  before?: FinallyBeforeHandler<m>
}

export type FinallyRuntimeResult<m extends Mass, s extends string = string> = FinallyInput<m> & {
  state: s
}

export type FinallyChainResult<ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string> = FinallyChain<
  ɸ,
  m,
  s
> & {
  readonly type: ParsedFinally["type"]
  getResult: () => FinallyRuntimeResult<m, s>
}
