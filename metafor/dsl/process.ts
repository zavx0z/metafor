import type { ActionParams } from "./action.t"
import {
  extractImportSpecifier,
  extractModuleSrc,
  normalizeFunctionString,
  parseFunction,
  updateAppendArg,
  validateActionStructure,
} from "./action"
import { createFinallyChain, isFinallyChain, parseFinally } from "./finally"
import type { Fields } from "./fields.t"
import { Initiator, type Mass } from "./metafor.t"
import {
  ProcessType,
  type ActionChain,
  type ParsedProcess,
  type Process,
  type ProcessChain,
  type ProcessConfig,
  type ProcessesDeclaration,
  type ProcessesSchema,
} from "./process.t"

type ProcessChainResult<ɸ extends Fields, m extends Mass, Res> = ActionChain<ɸ, m, Res> & {
  readonly type: ProcessType.ACTION
  getResult: () => Process<ɸ, m, Res>
}

type ProcessChainLike<ɸ extends Fields, m extends Mass> = {
  readonly type: ProcessType.ACTION
  getResult: () => Process<ɸ, m, unknown>
}

const createProcessChain = <ɸ extends Fields, m extends Mass>(config?: ProcessConfig): ProcessChain<ɸ, m> => ({
  action: <Res>(fn: (params: ActionParams<ɸ, m>) => Res | Promise<Res>): ProcessChainResult<ɸ, m, Res> => {
    const result: Process<ɸ, m, Res> = {
      type: ProcessType.ACTION,
      action: fn,
      ...(config?.label ? { label: config.label } : {}),
      ...(config?.desc ? { desc: config.desc } : {}),
      ...(config?.env ? { env: config.env } : {}),
    }

    const chain: ProcessChainResult<ɸ, m, Res> = {
      type: ProcessType.ACTION,
      action: fn,
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
})

const isProcessChain = <ɸ extends Fields, m extends Mass>(value: unknown): value is ProcessChainLike<ɸ, m> => {
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
export function parseProcess<ɸ extends Fields, m extends Mass, Res = any>(process: Process<ɸ, m, Res>): ParsedProcess {
  const validation = validateActionStructure(process.action)
  if (!validation.valid) {
    throw new Error(`Невалидная структура action: ${validation.error}`)
  }

  const modulePath = extractModuleSrc(process.action)
  const importSpecifier = extractImportSpecifier(process.action)
  const parsedAction = parseFunction(process.action, false)

  const result: ParsedProcess = {
    type: ProcessType.ACTION,
    action: {
      src: modulePath ?? "",
      ...(importSpecifier ? { importSpecifier } : {}),
      ...(parsedAction.read.length > 0 ? { read: parsedAction.read } : {}),
    },
    ...(process.label ? { label: process.label } : {}),
    ...(process.desc ? { desc: process.desc } : {}),
    ...(process.env ? { env: process.env } : {}),
  }

  if (process.success) {
    const parsed = parseFunction(process.success, true)
    const src = normalizeFunctionString(updateAppendArg(process.success.toString(), `"${Initiator.Success}"`))
    result.success = {
      src,
      ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
      ...(parsed.write.length > 0 ? { write: parsed.write } : {}),
    }
  }

  if (process.error) {
    const parsed = parseFunction(process.error)
    const src = normalizeFunctionString(updateAppendArg(process.error.toString(), `"${Initiator.Error}"`))
    result.error = {
      src,
      ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
      ...(parsed.write.length > 0 ? { write: parsed.write } : {}),
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
export const processesSchema = <ɸ extends Fields, 𝛴 extends string, m extends Mass>(
  processes: ProcessesDeclaration<ɸ, 𝛴, m>,
): ProcessesSchema => {
  const chains = processes(createProcessChain, createFinallyChain)
  const result: ProcessesSchema = {}

  for (const [key, chain] of Object.entries(chains)) {
    if (!chain) continue

    if (isFinallyChain<ɸ, m>(chain)) {
      result[key] = parseFinally(chain.getResult())
      continue
    }

    if (isProcessChain<ɸ, m>(chain)) {
      result[key] = parseProcess(chain.getResult())
    }
  }

  return result
}
