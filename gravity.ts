/* Gravity module — владеет childrenView, orderKey generation, вставками по пути/соседям.
   Делает изменения в Fields через fields.create / fields.setMeta / fields.remove.
*/

import type { Actor } from "./actor"
import * as Field from "./field"
import type { Topology, Key } from "./field.t"

/* -------------------------
   Вспомогательные функции
   ------------------------- */

/**
 * Сравнить два order-ключа лексикографически.
 * @param a Первый ключ
 * @param b Второй ключ
 * @returns -1 если a < b, 0 если a = b, 1 если a > b
 */
function cmpKey(a?: Key, b?: Key): number {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!
  }
  return a.length - b.length
}

/**
 * Вычислить промежуточный ключ между двумя ключами.
 * @param a Левый ключ (или null)
 * @param b Правый ключ (или null)
 * @returns Новый ключ между a и b для вставки
 * @remarks Обеспечивает бесконечную плотность ключей между любыми соседями
 */
function between(a?: Key | null, b?: Key | null): Key {
  // простая реализация: если нет a и b -> [128], если только a -> a + 128, только b -> b-1, etc.
  if (!a && !b) return Uint8Array.from([128])
  if (!a) {
    // return something less than b
    const bi = b!
    if (bi.length === 0) return Uint8Array.from([127])
    const out = new Uint8Array(bi.length)
    out.set(bi)
    if (out[out.length - 1]! > 0) {
      out[out.length - 1] = out[out.length - 1]! - 1
    }
    return out
  }
  if (!b) {
    const out = new Uint8Array(a.length + 1)
    out.set(a)
    out[a.length] = 128
    return out
  }
  // naive midpoint
  const n = Math.max(a.length, b.length)
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const ai = i < a.length ? a[i]! : 0
    const bi = i < b.length ? b[i]! : 255
    if (bi - ai > 1) {
      out[i] = ai + Math.floor((bi - ai) / 2)
      return out
    }
    out[i] = ai
  }
  return Uint8Array.from([...out, 128])
}

/* -------------------------
   Приватное состояние модуля
   ------------------------- */

/**
 * Внутреннее представление иерархии акторов.
 * Ключ: parentId (или "__ROOT__" для корневого уровня)
 * Значение: массив ID дочерних акторов в порядке orderKey
 */
const childrenView = new Map<string, string[]>()

/**
 * Преобразовать parentId в ключ для childrenView.
 * @param parentId ID родителя или null для корневого уровня
 * @returns Ключ для доступа к childrenView
 */
function parentKey(parentId: string | null) {
  return parentId ?? "__ROOT__"
}

/* -------------------------
   Экспортируемый API
   ------------------------- */

/**
 * Получить детей родителя.
 * @param parentId ID родителя или null для корневого уровня
 * @returns Неизменяемый массив ID детей (делай копию, если планируешь мутировать)
 */
export function getChildren(parentId: string | null): readonly string[] {
  const k = parentKey(parentId)
  if (!childrenView.has(k)) childrenView.set(k, [])
  return childrenView.get(k)!
}

/**
 * Низкоуровневая вставка актора в childrenView.
 * @param parentId ID родителя или null для корневого уровня
 * @param idx Индекс для вставки
 * @param id ID актора для вставки
 * @remarks Используется после вычисления orderKey
 */
function insertAt(parentId: string | null, idx: number, id: string): void {
  const k = parentKey(parentId)
  if (!childrenView.has(k)) childrenView.set(k, [])
  childrenView.get(k)!.splice(idx, 0, id)
}

/**
 * Создать актор по индекс-пути.
 * @param path Индекс-путь вида "0/1/2" (индексы детей от корня)
 * @param actor Экземпляр актора с уникальным id
 * @throws Ошибки на русском: некорректный путь, индекс вне диапазона, родитель не найден
 * @example createNode("0/1", { id: "child", ... }) // создаст дочерний элемент
 */
export function createNode(path: string, actor: Actor): void {
  // parse path -> parentPath and index
  const parts =
    path === ""
      ? []
      : path.split("/").map((p) => {
          const n = Number(p)
          if (!Number.isInteger(n) || n < 0) throw new Error(`Некорректный индекс в пути: "${p}"`)
          return n
        })
  const index = parts.length ? parts[parts.length - 1]! : 0
  const parentPath = parts.length <= 1 ? null : parts.slice(0, -1).join("/")
  // resolve parentId by path: we need a stable way — here assume parentPath is index-path from root
  const parentId =
    parentPath === null
      ? null
      : getIdByIndexPath(
          null,
          parentPath.split("/").map((s) => Number(s))
        )
  if (parentPath !== null && parentId === null) throw new Error(`Родитель не найден по пути "${parentPath}"`)

  // compute neighbors from current children
  const arr = getChildren(parentId)
  if (index < 0 || index > arr.length) throw new Error(`Индекс вне диапазона для пути "${path}"`)

  const leftId = index > 0 ? arr[index - 1]! : null
  const rightId = index < arr.length ? arr[index]! : null

  // create in Fields (with minimal topology), then insert into childrenView
  Field.create(actor, { parent: parentId })
  const leftTopology = leftId ? Field.getTopology(leftId) : null
  const rightTopology = rightId ? Field.getTopology(rightId) : null
  const key = between(leftTopology?.orderKey ?? null, rightTopology?.orderKey ?? null)
  Field.setTopology(actor.id, { parent: parentId, orderKey: key })
  // insert into our view at computed index
  insertAt(parentId, index, actor.id)
}

/**
 * Вставить существующий актор перед соседом.
 * @param neighborId ID соседа, перед которым вставляем
 * @param childId ID актора для вставки
 * @throws Ошибки на русском: сосед не найден, актор не найден, сосед отсутствует в витрине
 * @remarks Автоматически вычисляет orderKey между левым соседом и neighborId
 */
export function insertBefore(neighborId: string, childId: string): void {
  if (neighborId === childId) return
  const nTopology = Field.getTopology(neighborId)
  if (!nTopology) throw new Error(`Сосед не найден: ${neighborId}`)
  const parentId = nTopology.parent
  // ensure child exists
  if (!Field.has(childId)) throw new Error(`Актор не найден: ${childId}`)
  // unlink child from old parent view
  unlink(childId)
  const arr = getChildren(parentId)
  const idx = arr.indexOf(neighborId)
  if (idx < 0) throw new Error(`Сосед отсутствует в витрине: ${neighborId}`)
  const leftId = idx > 0 ? arr[idx - 1]! : null
  const leftKey = leftId ? Field.getTopology(leftId)!.orderKey : undefined
  const key = between(leftKey ?? null, nTopology.orderKey ?? null)
  Field.setTopology(childId, { parent: parentId, orderKey: key })
  insertAt(parentId, idx, childId)
}

/**
 * Вырезать актор из текущего родителя (без удаления из Field).
 * @param id ID актора для вырезания
 * @remarks Устанавливает parent: null, но не удаляет актор из Field
 */
export function unlink(id: string): void {
  const m = Field.getTopology(id)
  if (!m) return
  const p = m.parent
  const arr = getChildren(p)
  const idx = arr.indexOf(id)
  if (idx >= 0) {
    const newArr = [...arr]
    newArr.splice(idx, 1)
    childrenView.set(parentKey(p), newArr)
  }
  Field.setTopology(id, { parent: null })
}

/**
 * Получить ID актора по индекс-пути от корня.
 * @param rootId ID корневого актора или null для корневого уровня
 * @param indexPath Массив индексов пути (например [0, 1, 2] или ["0", "1", "2"])
 * @returns ID найденного актора или null, если путь неверный
 * @example getIdByIndexPath(null, [0, 1]) // получить второй дочерний элемент первого корневого
 */
export function getIdByIndexPath(rootId: string | null, indexPath: number[] | string[]): string | null {
  let parent = rootId
  let current: string | null = null
  for (const idxRaw of indexPath) {
    const idx = typeof idxRaw === "string" ? Number(idxRaw) : idxRaw
    const kids = getChildren(parent)
    if (idx < 0 || idx >= kids.length) return null
    current = kids[idx]!
    parent = current
  }
  return current
}

/**
 * Получить индекс-путь актора от корня.
 * @param id ID актора
 * @returns Индекс-путь вида "0/1/2" (индексы от корня до актора)
 * @throws Ошибки на русском: актор не найден, витрина рассинхронизирована
 * @example getPath("child") // "0/1" если child — второй дочерний элемент первого корневого
 */
export function getPath(id: string): string {
  if (!Field.has(id)) throw new Error(`Актор не найден: ${id}`)
  const parts: number[] = []
  let cur: string | null = id
  while (cur) {
    const m: Topology | null = Field.getTopology(cur)
    if (!m) break
    const p: string | null = m.parent
    const arr = getChildren(p)
    const idx = arr.indexOf(cur)
    if (idx < 0) throw new Error(`Витрина рассинхронизирована для ${cur}`)
    parts.push(idx)
    cur = p
  }
  return parts.reverse().join("/")
}

/* -------------------------
   Тестовые/вспомогательные хелперы
   ------------------------- */

/**
 * Полностью очистить состояние Gravity — используется в тестах.
 * @remarks Очищает childrenView, но не трогает Field
 */
export function __resetForTests__(): void {
  childrenView.clear()
}
