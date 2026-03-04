/**
 * Подготовка данных для GPU — кодирование, компиляция, построение heap.
 *
 * @packageDocumentation
 */
import { findEntangledGroups, buildBraneMapping } from "./entangled"
import { buildHeap } from "./heap"
import type { HeapInput } from "./heap.t"
import { compileEnsemble } from "./superposition"
import type { CompiledRules } from "./superposition.t"
import { encodeValue, fieldTypeToBytecodeType, encodeFieldValue } from "./values"
import type { EncodingContext } from "./values.t"
import { FieldType, type Data } from "./index.t"
import { TYPE } from "./opcodes"

/**
 * Подготовленные данные для GPU.
 */
export interface PreparedData {
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>
  encodedEntangledFields: Map<string, [number, number][]>
  encodedLocalFields: [number, number][][]
  heapInput: HeapInput
  heapData: Uint32Array
  heapLayout: { blockPtrs: number[] }
  compiledRules: CompiledRules
  initialStates: Uint32Array
  /** Размер резервированной зоны для ARRAY аллокаций. */
  arrayReserveSize: number
}

/**
 * Этап 1: Подготовка данных (кодирование, компиляция).
 *
 * @remarks
 * **Функция с side effects:**
 * - Вызывает `getStringAtlas().intern()` для строк (изменяет состояние атласа)
 * - Вызывает `compileEnsemble()` (интернирует строки из правил)
 *
 * **Не является чистой функцией** в терминах fp.md п.1.
 * Используется как "координатор" в конвейере данных.
 *
 * @param data - Конфигурация полей и бран
 * @returns Подготовленные данные для GPU
 */
export function prepareData(data: Data): PreparedData {
  // Извлекаем values из бран для анализа entangled
  const branes = data.branes ?? []
  const fieldDefs = data.fields ?? []
  const values = branes.map((b) => b.values)

  // Анализ entangled групп (чистая функция)
  const entangledAnalysis = findEntangledGroups(values)

  // Создаём маппинг entangledBraneIds
  const entangledBraneIds = new Map<string, number>()
  let nextEntangledId = 0
  entangledAnalysis.entangledGroups.forEach((_, key) => {
    entangledBraneIds.set(key, nextEntangledId++)
  })

  // Построение маппинга бран (чистая функция)
  const braneMapping = buildBraneMapping(values, entangledBraneIds, entangledAnalysis)

  // Компиляция суперпозиций (чистая функция) — интернирует строки из IN списков
  const compiledRules = compileEnsemble(branes, fieldDefs)

  // Подготовка метаданных полей
  const fieldMeta = new Map<number, { fieldType: number; fieldSize: number }>()
  fieldDefs.forEach((field, idx) => {
    const fieldType = fieldTypeToBytecodeType(field.type)
    const fieldSize = fieldType === TYPE.STRING || fieldType === TYPE.ARRAY ? 2 : 1
    fieldMeta.set(idx, { fieldType, fieldSize })
  })

  // Кодирование entangled полей (принцип готового формата данных)
  const encodedEntangledFields = new Map<string, [number, number][]>()
  for (const [key, entangledFields] of braneMapping.entangledFields.entries()) {
    const encoded = entangledFields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx: EncodingContext = { type: meta.fieldType }
      if (field?.enum !== undefined) {
        ctx.enum = field.enum
      }
      const encodedValue = encodeFieldValue(value, ctx)
      return [fieldIndex, encodedValue] as [number, number]
    })
    encodedEntangledFields.set(key, encoded)
  }

  // Кодирование local полей (принцип готового формата данных)
  const encodedLocalFields = braneMapping.localFields.map(braneFields =>
    braneFields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx: EncodingContext = { type: meta.fieldType }
      if (field?.enum !== undefined) {
        ctx.enum = field.enum
      }
      const encodedValue = encodeFieldValue(value, ctx)
      return [fieldIndex, encodedValue] as [number, number]
    })
  )

  // Динамический расчёт резерва для ARRAY на основе входных данных
  // Формула: сумма максимальных размеров массивов для всех ARRAY_PTR полей
  // Минимальный резерв: 256 слов (1KB) для небольших массивов
  const MIN_ARRAY_RESERVE = 256
  let arrayReserve = MIN_ARRAY_RESERVE

  // Считаем потенциальный размер массивов из values
  for (const brane of branes) {
    for (const [fieldIndex, value] of brane.values) {
      const field = fieldDefs[fieldIndex]
      if (field?.type === FieldType.ARRAY_PTR && Array.isArray(value)) {
        // Размер массива в heap: 1 (длина) + элементы
        const arraySize = 1 + value.length
        if (arraySize > arrayReserve) {
          arrayReserve = arraySize
        }
      }
    }
  }

  // Добавляем буфер 2x для будущих update() операций
  arrayReserve *= 2

  // Построение heap с уже закодированными значениями
  const heapInput = {
    localFields: encodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: encodedEntangledFields,
    fieldMeta,
  }
  const heapLayout = buildHeap(heapInput)
  let heapData = heapLayout.heap

  // Расширяем heap с учётом резерва для ARRAY
  const actualHeapSize = heapData.length + arrayReserve
  const extendedHeap = new Uint32Array(actualHeapSize)
  extendedHeap.set(heapData)
  heapData = extendedHeap

  // Сохраняем размер резерва для использования в update()
  const arrayReserveSize = arrayReserve

  // Аллокация массивов из values (после создания extendedHeap)
  let heapAllocOffset = heapData.length - arrayReserveSize

  // Функция аллокации для encodeValue
  const allocateHeap = (size: number): number => {
    const ptr = heapAllocOffset
    heapAllocOffset += size
    return ptr
  }

  // Перекодируем local поля с ARRAY (теперь с allocateHeap)
  const finalEncodedLocalFields = braneMapping.localFields.map(braneFields =>
    braneFields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx: EncodingContext = {
        type: meta.fieldType,
        allocateHeap,
        heap: heapData,
      }
      if (field?.enum !== undefined) {
        ctx.enum = field.enum
      }
      if (field?.elementType !== undefined) {
        switch (field.elementType) {
          case "number":
            ctx.subType = TYPE.FLOAT
            break
          case "string":
            ctx.subType = TYPE.STRING
            break
          case "boolean":
            ctx.subType = TYPE.BOOL
            break
        }
      }
      const encodedValue = encodeValue(value, ctx)
      return [fieldIndex, encodedValue.value1] as [number, number]
    })
  )

  // Обновляем heapInput с финальными закодированными полями
  const finalHeapInput = {
    localFields: finalEncodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: encodedEntangledFields,
    fieldMeta,
  }
  const finalHeapLayout = buildHeap(finalHeapInput)
  heapData.set(finalHeapLayout.heap)

  // Перекодируем entangled поля с ARRAY (теперь с allocateHeap)
  const finalEncodedEntangledFields = new Map<string, [number, number][]>()
  for (const [key, entangledFields] of braneMapping.entangledFields.entries()) {
    const encoded = entangledFields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx: EncodingContext = {
        type: meta.fieldType,
        allocateHeap,
        heap: heapData,
      }
      if (field?.enum !== undefined) {
        ctx.enum = field.enum
      }
      if (field?.elementType !== undefined) {
        switch (field.elementType) {
          case "number":
            ctx.subType = TYPE.FLOAT
            break
          case "string":
            ctx.subType = TYPE.STRING
            break
          case "boolean":
            ctx.subType = TYPE.BOOL
            break
        }
      }
      const encodedValue = encodeValue(value, ctx)
      return [fieldIndex, encodedValue.value1] as [number, number]
    })
    finalEncodedEntangledFields.set(key, encoded)
  }

  // Финальное построение heap с entangled ARRAY
  const ultimateHeapInput = {
    localFields: finalEncodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: finalEncodedEntangledFields,
    fieldMeta,
  }
  const ultimateHeapLayout = buildHeap(ultimateHeapInput)
  heapData.set(ultimateHeapLayout.heap)

  // Начальные состояния
  const initialStates = new Uint32Array(branes.map((b) => b.state))

  return {
    fieldMeta,
    encodedEntangledFields: finalEncodedEntangledFields,
    encodedLocalFields: finalEncodedLocalFields,
    heapInput: ultimateHeapInput,
    heapData,
    heapLayout: ultimateHeapLayout,
    compiledRules,
    initialStates,
    arrayReserveSize,
  }
}
