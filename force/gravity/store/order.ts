/**
 * Модуль генерации и сравнения orderKey.
 * @packageDocumentation
 *
 * Отвечает за создание лексикографических ключей для упорядочивания элементов.
 * Использует Uint8Array для обеспечения бесконечной плотности между любыми соседями.
 *
 * ## Алгоритм
 *
 * Ключи представляют собой байтовые массивы переменной длины.
 * Функция between() делит диапазон пополам, создавая новый ключ между двумя соседями.
 * При переполнении длины добавляется дополнительный байт.
 */

import type { OrderKey } from "./order.t"

/**
 * Создает первый ключ в последовательности.
 *
 * @returns OrderKey с единственным байтом 128 (середина диапазона)
 *
 * @example
 * ```typescript
 * const first = first()  // Uint8Array(1) [128]
 * ```
 */
export function first(): OrderKey {
  return new Uint8Array([128])
}

/**
 * Создает последний ключ в последовательности.
 *
 * @returns OrderKey с единственным байтом 255
 *
 * @example
 * ```typescript
 * const last = last()  // Uint8Array(1) [255]
 * ```
 */
export function last(): OrderKey {
  return new Uint8Array([255])
}

/**
 * Вычисляет orderKey между двумя соседями.
 *
 * ## Алгоритм
 *
 * Делит диапазон пополам между `prevKey` и `nextKey`.
 * Если оба null — создаёт первый ключ `[128]`.
 *
 * @param prevKey - ключ предыдущего элемента (null если первый)
 * @param nextKey - ключ следующего элемента (null если последний)
 * @returns новый orderKey посередине
 *
 * @example
 * ```typescript
 * const key = between(null, null)  // первый элемент
 * const key2 = between(key, null)  // второй элемент
 * const key3 = between(key, key2)  // между первым и вторым
 * ```
 */
export function between(
  prevKey: OrderKey | null,
  nextKey: OrderKey | null
): OrderKey {
  // Оба null — создаём первый ключ
  if (!prevKey && !nextKey) {
    return first()
  }

  // Только prevKey — создаём ключ после него
  if (prevKey && !nextKey) {
    const result = new Uint8Array(prevKey.length + 1)
    result.set(prevKey)
    result[prevKey.length] = 128
    return result
  }

  // Только nextKey — создаём ключ перед ним
  if (!prevKey && nextKey) {
    const result = new Uint8Array(nextKey.length)
    for (let i = 0; i < nextKey.length; i++) {
      result[i] = Math.floor(nextKey[i]! / 2)
    }
    return result
  }

  // Оба ключа существуют — делим пополам
  const prev = prevKey!
  const next = nextKey!

  // Находим первую позицию где ключи отличаются
  let minLength = Math.min(prev.length, next.length)
  let diffIndex = -1

  for (let i = 0; i < minLength; i++) {
    if (prev[i] !== next[i]) {
      diffIndex = i
      break
    }
  }

  // Ключи идентичны на общей длине — расширяем prev
  if (diffIndex === -1) {
    if (prev.length === next.length) {
      // Полностью идентичные ключи — ошибка, но создаём что-то между
      const result = new Uint8Array(prev.length + 1)
      result.set(prev)
      result[prev.length] = 128
      return result
    }

    // prev короче next — prev уже "между"
    const result = new Uint8Array(prev.length + 1)
    result.set(prev)
    result[prev.length] = 128
    return result
  }

  // Создаём ключ между prev и next
  const result = new Uint8Array(diffIndex + 1)
  for (let i = 0; i < diffIndex; i++) {
    result[i] = prev[i]!
  }

  const mid = Math.floor((prev[diffIndex]! + next[diffIndex]!) / 2)

  // Если mid равен prev[diffIndex], нужно добавить дополнительный байт
  if (mid === prev[diffIndex]!) {
    result.set(prev.slice(0, diffIndex + 1))
    const extended = new Uint8Array(result.length + 1)
    extended.set(result)
    extended[result.length] = 128
    return extended
  }

  result[diffIndex] = mid
  return result
}

/**
 * Сравнивает два orderKey лексикографически.
 *
 * @param a - первый ключ для сравнения
 * @param b - второй ключ для сравнения
 * @returns -1 если a < b, 0 если a === b, 1 если a > b
 *
 * @example
 * ```typescript
 * compare(first(), last())  // -1
 * compare(first(), first())  // 0
 * compare(last(), first())  // 1
 * ```
 */
export function compare(a: OrderKey, b: OrderKey): -1 | 0 | 1 {
  const minLength = Math.min(a.length, b.length)

  for (let i = 0; i < minLength; i++) {
    if (a[i]! < b[i]!) {
      return -1
    }
    if (a[i]! > b[i]!) {
      return 1
    }
  }

  // Все общие байты равны — сравниваем длины
  if (a.length < b.length) {
    return -1
  }
  if (a.length > b.length) {
    return 1
  }

  return 0
}
