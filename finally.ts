import { normalizeFunctionString, parseFunction } from "./action.ts"
import type { Fields } from "./fields.t.ts"
import type { FinallyConfig, FinallyChain, ParsedFinally } from "./finally.t.ts"
import type { Mass } from "./metafor.t.ts"
import type { ExecutionEnv } from "./process.t.ts"

type FinallyBeforeHandler<m extends Mass> = ({ mass }: { mass: m }) => void | Promise<void>

type FinallyInput<m extends Mass> = {
  type: ParsedFinally["type"]
  label?: string
  desc?: string
  env?: ExecutionEnv[]
  before?: FinallyBeforeHandler<m>
}

type FinallyRuntimeResult<m extends Mass, s extends string = string> = FinallyInput<m> & {
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

const FINALLY_TYPE: ParsedFinally["type"] = "finally"

export function createFinallyChain<ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string>(
  state: s,
  config?: FinallyConfig,
): FinallyChainResult<ɸ, m, s>
export function createFinallyChain<ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string>(
  state: s,
  config?: FinallyConfig,
): FinallyChainResult<ɸ, m, s> {
  const result: FinallyRuntimeResult<m, s> = {
    type: FINALLY_TYPE,
    state,
    ...(config?.label ? { label: config.label } : {}),
    ...(config?.desc ? { desc: config.desc } : {}),
    ...(config?.env ? { env: config.env } : {}),
  }

  const chain: FinallyChainResult<ɸ, m, s> = {
    type: FINALLY_TYPE,
    before: (handler) => {
      result.before = handler
      return chain
    },
    getResult: () => result,
  }

  return chain
}

export const parseFinally = <m extends Mass = Mass>(process: FinallyInput<m>): ParsedFinally => {
  const parsed = process.before ? parseFunction(process.before, false) : { read: [] }

  return {
    type: FINALLY_TYPE,
    before: {
      src: process.before ? normalizeFunctionString(process.before.toString()) : "() => {}",
      ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
    },
    ...(process.label ? { label: process.label } : {}),
    ...(process.desc ? { desc: process.desc } : {}),
    ...(process.env ? { env: process.env } : {}),
  }
}

export const isFinallyChain = <ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string>(
  value: unknown,
): value is FinallyChainResult<ɸ, m, s> => {
  if (!value || typeof value !== "object") return false

  const candidate = value as { type?: unknown; getResult?: unknown }
  return candidate.type === FINALLY_TYPE && typeof candidate.getResult === "function"
}
