import type {ActionParams} from "@metafor/types/metafor/action"
import {
  extractImportSpecifier,
  extractModuleSrc,
  normalizeFunctionString,
  parseFunction,
  updateAppendArg,
  validateActionStructure,
} from "./action.ts"
import type {FinallyConfig} from "@metafor/types/metafor/finally"
import {createFinallyChain, isFinallyChain, parseFinally} from "./finally.ts"
import type {Fields, Values} from "@metafor/types/metafor/fields"
import {Initiator, type Energy, type Mass} from "@metafor/types/metafor/schema"
import {
  ProcessType,
  type ActionChain,
  type ParsedProcess,
  type Process,
  type ProcessChain,
  type ProcessChainLike,
  type ProcessChainResult,
  type ProcessConfig,
  type ProcessRuntimeResult,
  type ProcessesDeclaration,
  type ProcessesList,
  type ProcessesSchema,
} from "@metafor/types/metafor/process"

export function createProcessChain<ɸ extends Fields, m extends Mass, v extends Values<ɸ> = Values<ɸ>, s extends string = string, e extends Energy = Energy>(
  state: s,
  config?: ProcessConfig,
): ProcessChain<ɸ, m, v, s, e>
export function createProcessChain<ɸ extends Fields, m extends Mass, v extends Values<ɸ> = Values<ɸ>, s extends string = string, e extends Energy = Energy>(
  state: s,
  config?: ProcessConfig,
): ProcessChain<ɸ, m, v, s, e> {
  return {
    action: <Res>(fn: (params: ActionParams<ɸ, m, v, e>) => Res | Promise<Res>): ProcessChainResult<ɸ, m, Res, v, s, e> => {
      const result: ProcessRuntimeResult<ɸ, m, Res, v, s, e> = {
        type: ProcessType.ACTION,
        state,
        action: fn,
        ...(config?.label ? {label: config.label} : {}),
        ...(config?.desc ? {desc: config.desc} : {}),
        ...(config?.env ? {env: config.env} : {}),
      }

      const chain: ProcessChainResult<ɸ, m, Res, v, s, e> = {
        type: ProcessType.ACTION,
        success: (handler) => {
          result.success = handler
          return chain
        },
        error: (handler) => {
          result.error = handler
          return chain
        },
        getResult: () => result,
      }

      return chain
    },
  }
}

const isProcessChain = <ɸ extends Fields, m extends Mass, v extends Values<ɸ> = Values<ɸ>, s extends string = string, e extends Energy = Energy>(
  value: unknown,
): value is ProcessChainLike<ɸ, m, v, s, e> => {
  if (!value || typeof value !== "object") return false

  const candidate = value as { type?: unknown; getResult?: unknown }
  return candidate.type === ProcessType.ACTION && typeof candidate.getResult === "function"
}

/**
 * Парсит процесс и извлекает информацию о всех обработчиках.
 *
 * Анализирует объект процесса с обработчиками action, success и error.
 * Для action извлекает путь к модулю через extractModuleSrc, определяет спецификатор импорта через extractImportSpecifier
 * и валидирует структуру. Для success/error сохраняет строковое представление функции для десериализации.
 *
 * @param process - Объект процесса с обработчиками
 * @returns Распарсенный процесс с информацией о полях, путём к модулю action и именем экспорта
 * @throws Error если структура action функции не соответствует требованиям
 */
export function parseProcess<ɸ extends Fields, m extends Mass, Res = any, v extends Values<ɸ> = Values<ɸ>, s extends string = string, e extends Energy = Energy>(
  process: Process<ɸ, m, Res, v, s, e>,
  declaredFields: readonly string[] = [],
): ParsedProcess {
  const validation = validateActionStructure(process.action)
  if (!validation.valid) {
    throw new Error(`Невалидная структура action: ${validation.error}`)
  }

  const modulePath = extractModuleSrc(process.action)
  const importSpecifier = extractImportSpecifier(process.action)
  const parsedAction = parseFunction(process.action, false)
  const actionRead = [...new Set([...declaredFields, ...parsedAction.read])]

  const result: ParsedProcess = {
    type: ProcessType.ACTION,
    action: {
      src: modulePath ?? "",
      ...(importSpecifier ? {importSpecifier} : {}),
      wrapperSrc: normalizeFunctionString(process.action.toString()),
      ...(actionRead.length > 0 ? {read: actionRead} : {}),
    },
    ...(process.label ? {label: process.label} : {}),
    ...(process.desc ? {desc: process.desc} : {}),
    ...(process.env ? {env: process.env} : {}),
  }

  if (process.success) {
    const parsed = parseFunction(process.success, true)
    const src = normalizeFunctionString(updateAppendArg(process.success.toString(), `"${Initiator.Success}"`))
    result.success = {
      src,
      ...(parsed.read.length > 0 ? {read: parsed.read} : {}),
      ...(parsed.write.length > 0 ? {write: parsed.write} : {}),
    }
  }

  if (process.error) {
    const parsed = parseFunction(process.error)
    const src = normalizeFunctionString(updateAppendArg(process.error.toString(), `"${Initiator.Error}"`))
    result.error = {
      src,
      ...(parsed.read.length > 0 ? {read: parsed.read} : {}),
      ...(parsed.write.length > 0 ? {write: parsed.write} : {}),
    }
  }

  return result
}

/**
 * Парсит конфигурацию процессов и извлекает информацию о всех процессах.
 *
 * Анализирует конфигурацию, где каждое свойство содержит цепочку действий,
 * и возвращает объект с распарсенными процессами.
 */
export const processesSchema = <
  ɸ extends Fields,
  𝛴 extends string,
  m extends Mass,
  ψ = never,
  e extends Energy = Energy,
>(
  processes: ProcessesDeclaration<ɸ, 𝛴, m, ψ, e>,
  declaredFields: readonly string[] = [],
): ProcessesSchema => {
  const processFactory: Parameters<ProcessesDeclaration<ɸ, 𝛴, m, ψ, e>>[0] = ((state: string, config?: ProcessConfig) =>
    createProcessChain<ɸ, m, Values<ɸ>, string, e>(state, config)) as Parameters<ProcessesDeclaration<ɸ, 𝛴, m, ψ, e>>[0]
  const destroyFactory: Parameters<ProcessesDeclaration<ɸ, 𝛴, m, ψ, e>>[1] = ((state: string, config?: FinallyConfig) =>
    createFinallyChain<ɸ, m, string, e>(state, config)) as Parameters<ProcessesDeclaration<ɸ, 𝛴, m, ψ, e>>[1]
  const chains = processes(processFactory, destroyFactory)
  const result: ProcessesSchema = {}

  const assignParsedChain = (key: string, chain: unknown) => {
    if (result[key]) {
      throw new Error(`Процесс для суперпозиции "${key}" уже определен`)
    }

    if (isFinallyChain<ɸ, m, string, e>(chain)) {
      result[key] = parseFinally(chain.getResult())
      return
    }

    if (isProcessChain<ɸ, m, Values<ɸ>, string, e>(chain)) {
      result[key] = parseProcess(chain.getResult(), declaredFields)
    }
  }

  for (const chain of chains as ProcessesList<ɸ, 𝛴, m, ψ, e>) {
    if (!chain) continue

    if (isFinallyChain<ɸ, m, string, e>(chain)) {
      assignParsedChain(chain.getResult().state, chain)
      continue
    }

    if (isProcessChain<ɸ, m, Values<ɸ>, string, e>(chain)) {
      assignParsedChain(chain.getResult().state, chain)
    }
  }

  return result
}
