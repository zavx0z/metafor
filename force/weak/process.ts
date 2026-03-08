/**
 * Weak Force — управление процессами.
 *
 * @packageDocumentation
 */

import { weak$ } from "./store"
import type { MetaJson } from "@metafor/ast"
import type { Intention } from "../force.t"

/**
 * Регистрирует схемы процессов из DSL.
 *
 * @param processes - Объект с ключами процессов и их схемами из DSL.
 *
 * @example
 * ```typescript
 * registerProcesses({
 *   patrolProcess: {
 *     type: "action",
 *     label: "Патруль",
 *     action: { src: "./actions/patrol.ts", read: ["position"] }
 *   },
 *   deathProcess: {
 *     type: "action",
 *     label: "Смерть",
 *     action: { src: "./actions/death.ts", read: ["hp"] }
 *   }
 * })
 * ```
 */
export function registerProcesses(processes: Record<Intention, MetaJson>): void {
  for (const [key, schema] of Object.entries(processes)) {
    weak$.processes.set(key, schema as MetaJson)
  }
}

/**
 * Получает схему процесса по ключу.
 *
 * @param processKey - Ключ процесса (ID намерения).
 * @returns Схема процесса или undefined если не найдена.
 */
export function getProcessSchema(processKey: Intention): MetaJson | undefined {
  return weak$.processes.get(processKey)
}
