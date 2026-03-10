/**
 * Force — домен бизнес-логики (акторы, состояния, намерения).
 *
 * @packageDocumentation
 */

import { write as fieldsWrite, update as fieldsUpdate, unlock } from "@metafor/boundary"
import { convertField } from "./strong/field"
import { convertToNumeric } from "../boundary/fields/superposition"
import { flattenGravity, buildStrongEntanglement, projectEntanglementToBoundary } from "./strong/strong"
import { force$ } from "./store"

import type { ActorId, BraneStateChange, ActorUpdate } from "./force.t"
import type { FieldDefinition } from "./strong/field.t"
import type { ActorConfig } from "./force.t"
import type { Brane, Data, Field } from "@boundary/fields"
import type { NodeType } from "@metafor/dsl"
import { valuesToTuples } from "./strong/value"

// ==================== Функции ====================
/**
 * Добавляет поле в глобальное хранилище.
 *
 * @param name - Имя поля.
 * @param field - Зарегистрированное поле.
 * @returns Индекс поля.
 * @throws {Error} Если тип поля конфликтует с существующим.
 */
function addField(name: string, field: Field): number {
  const existing = force$.globalFields.get(name)
  if (existing) {
    const [existingIndex, existingField] = existing
    if (existingField.type !== field.type) {
      throw new Error(`Field '${name}' type conflict`)
    }
    return existingIndex
  }
  const newIndex = force$.nextFieldIndex++
  force$.globalFields.set(name, [newIndex, field])
  force$.fieldNameIndex.set(name, newIndex)
  return newIndex
}

function buildBoundaryEntanglement(actorIds: string[]) {
  const gravity = force$.gravitySource
  if (!gravity || gravity.length === 0) {
    return { blocks: [] }
  }

  const runtimeActors = actorIds.map((actorId, braneIndex) => ({
    actorId,
    braneIndex,
    fieldNames: Object.keys(force$.actorParams.get(actorId) ?? {}),
  }))

  const flattened = flattenGravity(gravity)
  const plan = buildStrongEntanglement(flattened, runtimeActors)
  return projectEntanglementToBoundary(plan, force$.fieldNameIndex)
}

/**
 * Создаёт актора (эмерджентный паттерн) и регистрирует его в системе.
 *
 * @param config - Конфигурация актора (поля, суперпозиция, намерения).
 * @returns UUID актора.
 *
 * @remarks
 * **Порядок переходов в суперпозиции важен!**
 * Переходы проверяются в порядке объявления ключей.
 * Первый выполненный переход останавливает проверку.
 *
 * @example
 * ```typescript
 * const uuid = crypto.randomUUID()
 * createActor({
 *   uuid,
 *   fields: {
 *     hp: { type: "number" },
 *     mana: { type: "number" },
 *     isAlive: { type: "boolean" }
 *   },
 *   values: { hp: 100, mana: 50, isAlive: true },
 *   superposition: {
 *     IDLE: {
 *       PATROL: { hp: { gt: 50 } },   // ← Приоритет 1: hp > 50
 *       DEAD: { hp: { lte: 0 } }      // ← Приоритет 2: hp <= 0
 *     },
 *     PATROL: {
 *       IDLE: { mana: { lt: 10 } },   // mana < 10 → IDLE
 *       COMBAT: { isAlive: true }     // isAlive === true → COMBAT
 *     },
 *     COMBAT: null,
 *     DEAD: null                       // Терминальное состояние
 *   },
 *   intentions: {
 *     PATROL: "patrolProcess",        // Ключ процесса из DSL
 *     DEAD: "deathProcess"
 *   }
 * })
 * ```
 */
export function createActor(config: ActorConfig): string {
  const uuid = config.uuid
  force$.actorIds.add(uuid)
  for (const [name, def] of Object.entries(config.fields)) {
    const registeredField = convertField(def as FieldDefinition)
    addField(name, registeredField)
    if (config.values[name] !== undefined) {
      // Сохраняем в fieldsDefinition для последующего write()
      force$.fieldsDefinition[name] = def as FieldDefinition
    }
  }
  force$.actorParams.set(uuid, { ...config.values })
  force$.intentions.set(uuid, config.intentions ?? {})
  force$.superpositions.set(uuid, config.superposition)
  // Состояние не устанавливается — актор рождается в неопределённом состоянии
  return uuid
}

/**
 * Удаляет актора.
 *
 * @param uuid - {@link ActorId} актора.
 */
export function deleteActor(uuid: ActorId): void {
  force$.actorIds.delete(uuid)
  force$.actorParams.delete(uuid)
  force$.intentions.delete(uuid)
  force$.superpositions.delete(uuid)
  force$.states.delete(uuid)
  force$.uuidToIndex.delete(uuid)
}

/**
 * Регистрирует parsed `bulk.gravity` AST как upstream источник actor connectivity.
 */
export function setGravitySource(gravity: NodeType[] | null): void {
  force$.gravitySource = gravity
}

/**
 * Создаёт/пересоздаёт Boundary со всеми бранами.
 *
 * @returns Массив изменений состояний (только birth-events при первой инициализации)
 */
export async function updateBoundary(): Promise<BraneStateChange[]> {
  const actorIds = Array.from(force$.actorIds)
  if (actorIds.length === 0) {
    return []
  }
  // Собираем поля в массив Field[]
  const fieldsArray: Field[] = []
  for (const [_, [index, field]] of force$.globalFields.entries()) {
    fieldsArray[index] = field
  }
  // Конвертируем values и superposition для каждого актора
  const allBranes: Brane[] = actorIds.map((actorId) => {
    const actorValues = force$.actorParams.get(actorId)!
    const valuesTuples = valuesToTuples(actorValues)
    const actorSuperposition = force$.superpositions.get(actorId)!
    const converted = convertToNumeric(actorSuperposition, force$.fieldNameIndex)
    // Сохраняем states для reverse-маппинга
    force$.stateMaps.set(actorId, converted.states)
    // Находим индекс начального состояния
    // Если состояние не установлено (актор рождается) — используем первое состояние из суперпозиции
    const currentState = force$.states.get(actorId)
    const initialStateName = currentState ?? converted.states[0]!
    const initialStateIndex = converted.states.indexOf(initialStateName)
    if (initialStateIndex === -1) {
      throw new Error(`State '${initialStateName}' not found in superposition`)
    }
    return {
      values: valuesTuples,
      state: initialStateIndex,
      collapses: converted.boundary.transitions,
    }
  })
  // Инициализируем через @boundary/fields/write()
  const data: Data = {
    fields: fieldsArray,
    branes: allBranes,
    entanglement: buildBoundaryEntanglement(actorIds),
  }
  await fieldsWrite(data)
  // Маппинги
  force$.uuidToIndex.clear()
  force$.indexToUuid.clear()
  actorIds.forEach((actorId, i) => {
    force$.uuidToIndex.set(actorId, i)
    force$.indexToUuid.set(i, actorId)
  })

  // Инициализация состояния всех акторов с эмитом только birth-событий
  // (без runtime-переходов, т.к. updateBoundary не выполняет шаг FSM)
  const changes: BraneStateChange[] = []
  const actorsToUnlock: ActorId[] = []

  for (const actorId of actorIds) {
    const stateMap = force$.stateMaps.get(actorId)
    if (!stateMap || stateMap.length === 0) {
      throw new Error(`State map not found for actor ${actorId}`)
    }

    const old = force$.states.get(actorId)
    if (old === undefined) {
      const firstState = stateMap[0]!
      force$.states.set(actorId, firstState)

      const intention = force$.intentions.get(actorId)?.[firstState]
      changes.push({
        actorId,
        oldState: undefined,
        newState: firstState,
        intention: intention ?? null,
        values: force$.actorParams.get(actorId)!,
      })

      if (!intention) {
        actorsToUnlock.push(actorId)
      }
    }
  }

  // Для birth без intention снимаем lock сразу, без шага эволюции
  if (actorsToUnlock.length > 0) {
    const uniqueActorsToUnlock = Array.from(new Set(actorsToUnlock))
    const indexes = uniqueActorsToUnlock
      .map((id) => force$.uuidToIndex.get(id))
      .filter((index): index is number => index !== undefined)
    unlock(indexes)
  }

  if (changes.length > 0 && force$.onStateChange.current) {
    force$.onStateChange.current(changes)
  }

  return changes
}

/**
 * Обновляет поля бран и выполняет шаг эволюции через @boundary/fields.
 *
 * @param updates - Массив обновлений: `[{ uuid, fields, lock }, ...]`
 * @throws {Error} Если Boundary не инициализирован. Вызовите updateBoundary() перед updateActors().
 *
 * @example
 * ```typescript
 * // Обновить одну монаду
 * await updateActors([{ uuid: 'uuid', fields: { hp: 80 } }])
 *
 * // Обновить с блокировкой
 * await updateActors([{ uuid: 'uuid', fields: { hp: 80 }, lock: true }])
 *
 * // Разблокировать без изменения полей
 * await updateActors([{ uuid: 'uuid', fields: {}, lock: false }])
 * ```
 */
export async function updateActors(updates: ActorUpdate[]): Promise<BraneStateChange[]> {
  if (updates.length === 0) {
    return []
  }

  const allUpdates: Array<[number, Array<[number, unknown]>, boolean?]> = []

  for (const { uuid, fields = {}, lock } of updates) {
    const index = force$.uuidToIndex.get(uuid)
    if (index === undefined) {
      throw new Error(`Actor ${uuid} not found in boundary`)
    }

    // Обновляем params актора
    const actorParams = force$.actorParams.get(uuid)
    if (actorParams) {
      force$.actorParams.set(uuid, { ...actorParams, ...fields })
    }

    // Конвертируем в кортежи для update()
    const fieldUpdates = Object.entries(fields).map(([name, value]) => {
      const fieldIndex = force$.fieldNameIndex.get(name)
      if (fieldIndex === undefined) {
        throw new Error(`Field '${name}' not found`)
      }
      return [fieldIndex, value] as [number, unknown]
    })

    // Добавляем обновление: [braneIndex, fieldUpdates, lock?]
    if (lock !== undefined) {
      allUpdates.push([index, fieldUpdates, lock])
    } else {
      allUpdates.push([index, fieldUpdates])
    }
  }

  // Вызываем @boundary/fields/update()
  const stateChanges = await fieldsUpdate(allUpdates)

  // Обрабатываем изменения состояний
  const changes: BraneStateChange[] = []
  const actorsToUnlock: ActorId[] = []

  stateChanges.forEach(([braneIndex, stateIndex]) => {
    const actorId = force$.indexToUuid.get(braneIndex)
    if (!actorId) return
    const stateMap = force$.stateMaps.get(actorId)
    if (!stateMap) {
      throw new Error(`State map not found for actor ${actorId}`)
    }
    const current = stateMap[stateIndex]!
    const old = force$.states.get(actorId)
    if (old !== undefined && current !== old) {
      force$.states.set(actorId, current)
      const intentions = force$.intentions.get(actorId)
      const intention = intentions?.[current]
      changes.push({
        actorId,
        oldState: old,
        newState: current,
        intention: intention ?? null,
        values: force$.actorParams.get(actorId)!,
      })
      // Авто-снятие блокировки если нет намерения (TAKT 2)
      if (!intention) {
        actorsToUnlock.push(actorId)
      }
    }
  })

  // Снимаем блокировку с бран без намерения напрямую, без дополнительного шага эволюции
  if (actorsToUnlock.length > 0) {
    const uniqueActorsToUnlock = Array.from(new Set(actorsToUnlock))
    const indexes = uniqueActorsToUnlock
      .map((id) => force$.uuidToIndex.get(id))
      .filter((index): index is number => index !== undefined)
    unlock(indexes)
  }
  // Пакетная отправка изменений
  if (changes.length > 0 && force$.onStateChange.current) {
    force$.onStateChange.current(changes)
  }
  return changes
}

/**
 * Устанавливает callback на изменение состояния.
 *
 * @param callback - Функция обратного вызова, получает массив изменений всех бран.
 *
 * @example
 * ```typescript
 * onStateChange((changes) => {
 *   for (const { actorId, oldState, newState, intention, values } of changes) {
 *     console.log(`${actorId}: ${oldState} → ${newState}, intention: ${intention}`)
 *   }
 * })
 * ```
 */
export function onStateChange(callback: (changes: BraneStateChange[]) => void): void {
  force$.onStateChange.current = callback
}

/**
 * Снимает блокировку с акторов после завершения процессов.
 *
 * Вызывается WEAK FORCE после завершения всех процессов для разблокировки бран.
 *
 * @param actorIds - UUIDs акторов для разблокировки. Если не указаны, разблокируются все.
 *
 * @example
 * ```typescript
 * // После завершения процессов
 * await releaseLock(['uuid1', 'uuid2'])
 *
 * // Разблокировать все
 * await releaseLock()
 * ```
 */
export async function releaseLock(actorIds?: ActorId[]): Promise<BraneStateChange[]> {
  const uuidsToUnlock = actorIds ?? Array.from(force$.actorIds)
  if (uuidsToUnlock.length === 0) return []
  const unlockUpdates = uuidsToUnlock.map((uuid) => ({
    uuid,
    fields: {},
    lock: false,
  }))
  return await updateActors(unlockUpdates)
}
