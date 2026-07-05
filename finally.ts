import { normalizeFunctionString, parseFunction } from "./action.ts"
import type { Fields } from "@metafor/types/metafor/fields"
import type {
  FinallyChainResult,
  FinallyConfig,
  FinallyInput,
  FinallyRuntimeResult,
  ParsedFinally,
} from "@metafor/types/metafor/finally"
import type { Mass } from "@metafor/types/metafor/schema"

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
