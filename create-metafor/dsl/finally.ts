import { extractModuleSrc, normalizeFunctionString, parseFunction, validateActionStructure } from "./action.ts"
import type { Fields } from "@metafor/types/metafor/fields"
import type {
  FinallyChainResult,
  FinallyConfig,
  FinallyInput,
  FinallyRuntimeResult,
  ParsedFinally,
} from "@metafor/types/metafor/finally"
import type { Energy, Mass } from "@metafor/types/metafor/schema"

const FINALLY_TYPE: ParsedFinally["type"] = "finally"

export function createFinallyChain<ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string, e extends Energy = Energy>(
  state: s,
  config?: FinallyConfig,
): FinallyChainResult<ɸ, m, s, e>
export function createFinallyChain<ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string, e extends Energy = Energy>(
  state: s,
  config?: FinallyConfig,
): FinallyChainResult<ɸ, m, s, e> {
  const result: FinallyRuntimeResult<m, s, e> = {
    type: FINALLY_TYPE,
    state,
    ...(config?.label ? { label: config.label } : {}),
    ...(config?.desc ? { desc: config.desc } : {}),
    ...(config?.env ? { env: config.env } : {}),
  }

  const chain: FinallyChainResult<ɸ, m, s, e> = {
    type: FINALLY_TYPE,
    before: (handler) => {
      result.before = handler
      return chain
    },
    getResult: () => result,
  }

  return chain
}

export const parseFinally = <m extends Mass = Mass, e extends Energy = Energy>(process: FinallyInput<m, e>): ParsedFinally => {
  if (process.before) {
    const validation = validateActionStructure(process.before)
    if (!validation.valid || extractModuleSrc(process.before) === null) {
      throw new Error(
        `Невалидная структура destroy.before: ${validation.error ?? 'функция должна содержать import("...") внешнего cleanup-модуля'}`,
      )
    }
  }
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

export const isFinallyChain = <ɸ extends Fields = Fields, m extends Mass = Mass, s extends string = string, e extends Energy = Energy>(
  value: unknown,
): value is FinallyChainResult<ɸ, m, s, e> => {
  if (!value || typeof value !== "object") return false

  const candidate = value as { type?: unknown; getResult?: unknown }
  return candidate.type === FINALLY_TYPE && typeof candidate.getResult === "function"
}
