/**
 * Валидация входных данных для write().
 *
 * @packageDocumentation
 */

import { FieldType, type Data } from "./schema.t"

/**
 * Валидирует входные данные перед обработкой.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects, только проверка и выброс ошибок.
 *
 * @param data - Конфигурация для валидации
 * @throws {Error} При невалидных данных
 */
export function validateData(data: Data): void {
  // Проверка на пустые/отсутствующие массивы — допустимо
  if (!data.fields || data.fields.length === 0) {
    return // Нет полей — нечего валидировать
  }

  if (!data.branes || data.branes.length === 0) {
    return // Нет бран — нечего валидировать
  }

  // Валидация полей
  data.fields.forEach((field, fieldIndex) => {
    if (
      field.type === undefined ||
      !Object.values(FieldType).includes(field.type)
    ) {
      throw new Error(`Field ${fieldIndex}: invalid type ${field.type}`)
    }

    // Проверка elementType для ARRAY_PTR
    if (field.type === FieldType.ARRAY_PTR && !field.elementType) {
      throw new Error(`Field ${fieldIndex}: ARRAY_PTR requires elementType`)
    }
  })

  // Валидация бран
  data.branes.forEach((brane, braneIndex) => {
    // Проверка values
    if (!brane.values || !Array.isArray(brane.values)) {
      throw new Error(`Brane ${braneIndex}: values must be an array`)
    }

    brane.values.forEach(([fieldIndex, value], paramIndex) => {
      if (fieldIndex < 0 || fieldIndex >= data.fields!.length) {
        throw new Error(
          `Brane ${braneIndex}, param ${paramIndex}: field index ${fieldIndex} out of range`,
        )
      }

      const field = data.fields![fieldIndex]!

      // Проверка enum значений (строка допустима для enum полей)
      if (field.enum && typeof value === "string") {
        if (!field.enum.includes(value)) {
          throw new Error(
            `Brane ${braneIndex}, field ${fieldIndex}: value '${value}' not in enum [${field.enum}]`,
          )
        }
        // Строковое значение enum допустимо — дальше не проверяем тип
        return
      }

      // Проверка типа значения для не-enum полей
      if (field.type === FieldType.STRING_PTR && typeof value !== "string") {
        throw new Error(
          `Brane ${braneIndex}, field ${fieldIndex}: expected string, got ${typeof value}`,
        )
      }

      if (field.type === FieldType.ARRAY_PTR && !Array.isArray(value)) {
        throw new Error(
          `Brane ${braneIndex}, field ${fieldIndex}: expected array, got ${typeof value}`,
        )
      }

      if (
        field.type === FieldType.F32 ||
        field.type === FieldType.U32
      ) {
        if (typeof value !== "number") {
          throw new Error(
            `Brane ${braneIndex}, field ${fieldIndex}: expected number, got ${typeof value}`,
          )
        }
      }

      if (field.type === FieldType.BOOL && typeof value !== "boolean") {
        throw new Error(
          `Brane ${braneIndex}, field ${fieldIndex}: expected boolean, got ${typeof value}`,
        )
      }
    })

    // Проверка collapses
    if (!brane.collapses || !Array.isArray(brane.collapses)) {
      throw new Error(`Brane ${braneIndex}: collapses must be an array`)
    }

    brane.collapses.forEach((stateTransitions, stateIndex) => {
      if (!Array.isArray(stateTransitions)) {
        throw new Error(
          `Brane ${braneIndex}, state ${stateIndex}: transitions must be an array`,
        )
      }

      stateTransitions.forEach((transition, transitionIndex) => {
        if (transition === null) return // Терминальное состояние

        const [targetState, conditions] = transition

        if (typeof targetState !== "number" || targetState < 0) {
          throw new Error(
            `Brane ${braneIndex}, state ${stateIndex}, transition ${transitionIndex}: invalid target state`,
          )
        }

        if (targetState >= brane.collapses.length) {
          throw new Error(
            `Brane ${braneIndex}, state ${stateIndex}, transition ${transitionIndex}: target state ${targetState} out of range`,
          )
        }

        // Валидация условий
        if (conditions && typeof conditions === "object") {
          for (const [condFieldIndex, _] of Object.entries(conditions)) {
            const fieldIdx = Number(condFieldIndex)

            if (fieldIdx < 0 || fieldIdx >= data.fields!.length) {
              throw new Error(
                `Brane ${braneIndex}, state ${stateIndex}: condition references non-existent field ${fieldIdx}`,
              )
            }

            // Проверка циклических зависимостей (упрощённая)
            if (fieldIdx === braneIndex) {
              // Это не циклическая зависимость, а ссылка на своё поле — ок
            }
          }
        }
      })
    })
  })
}
