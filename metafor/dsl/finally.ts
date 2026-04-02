import { normalizeFunctionString, parseFunction } from "./action"
import type { Fields } from "./fields.t"
import type { FinallyConfig, FinallyChain, ParsedFinally } from "./finally.t"
import type { Mass } from "./metafor.t"
import type { ExecutionEnv } from "./process.t"

type FinallyBeforeHandler<m extends Mass> = ({ mass }: { mass: m }) => void | Promise<void>

type FinallyResult<m extends Mass> = {
  type: ParsedFinally["type"]
  label?: string
  desc?: string
  env?: ExecutionEnv[]
  before?: FinallyBeforeHandler<m>
}

export type FinallyChainResult<ɸ extends Fields = Fields, m extends Mass = Mass> = FinallyChain<ɸ, m> & {
  readonly type: ParsedFinally["type"]
  getResult: () => FinallyResult<m>
}

const FINALLY_TYPE: ParsedFinally["type"] = "finally"

export const createFinallyChain = <ɸ extends Fields = Fields, m extends Mass = Mass>(
  config?: FinallyConfig,
): FinallyChainResult<ɸ, m> => {
  const result: FinallyResult<m> = {
    type: FINALLY_TYPE,
    ...(config?.label ? { label: config.label } : {}),
    ...(config?.desc ? { desc: config.desc } : {}),
    ...(config?.env ? { env: config.env } : {}),
  }

  const chain: FinallyChainResult<ɸ, m> = {
    type: FINALLY_TYPE,
    before: (handler) => {
      result.before = handler
      return chain
    },
    getResult: () => result,
  }

  return chain
}

export const parseFinally = <m extends Mass = Mass>(process: FinallyResult<m>): ParsedFinally => {
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

export const isFinallyChain = <ɸ extends Fields = Fields, m extends Mass = Mass>(
  value: unknown,
): value is FinallyChainResult<ɸ, m> => {
  if (!value || typeof value !== "object") return false

  const candidate = value as { type?: unknown; getResult?: unknown }
  return candidate.type === FINALLY_TYPE && typeof candidate.getResult === "function"
}
