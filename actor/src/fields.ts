/**
 * @file core/fields.ts
 * @description
 * Fields — арена акторов и витрина их порядка в виде ориентированного дерева.
 *
 * Ключевые свойства:
 * - Хранит **только** экземпляры Actor (никаких «нод»-обёрток).
 * - Порядок детей поддерживается **лексикографическими ключами** (`Uint8Array`) онлайн:
 *   вставки/перемещения не требуют глобальной нормализации.
 * - Поддерживает:
 *   - Создание по индексному пути "0/1/2".
 *   - Вставку «между» соседями по лексикографическому ключу.
 *   - Резервацию места по `id` будущего актора (устойчиво к гонкам).
 * - Доступ к глобальному синглтону через `Fields.get()`.
 */

import type { Actor } from "../actor"

/** Лексикографический ключ порядка среди детей одного родителя. */
export type Key = Uint8Array

/** Внутренние метаданные актора (не экспонируются). */
interface Meta {
  /** Родительский id или null для корня. */
  parent: string | null
  /** Лексикографический ключ порядка (сравнивается лексикографически по байтам). */
  orderKey: Key
  /** Стабилизатор порядка (монотонный seq), используется при равных ключах. */
  seq: number
}

/** Описание зарезервированного слота под будущий актор с указанным id. */
type Reservation = { parentId: string | null; orderKey: Key }

/** Витрина корня (псевдо-id) в childrenView. */
const ROOT = ""

/** Глобальный монотонный счётчик для стабильности вставок. */
let GLOBAL_SEQ = 0

// ------------------------- внутренние утилиты -------------------------

/** Нормализация строкового индекс-пути: срезает ведущие слеши, сжимает повторные. */
function normalizeIndexPathString(path: string): string {
  // "/0//1/2" -> "0/1/2", "   /1 " -> "1"
  const s = path.trim().replace(/^\/+/, "").replace(/\/+/g, "/")
  return s
}

/** Разбор строкового индекс-пути "0/1/2" -> массив индексов. */
function parseIndexPath(path: string): number[] {
  const normalized = normalizeIndexPathString(path)
  if (normalized === "") return []
  const parts = normalized.split("/")
  const out: number[] = []
  for (const p of parts) {
    // запрещаем пустые сегменты после нормализации
    if (p === "") throw new Error(`Некорректный индекс в пути: "${path}"`)
    const n = Number(p)
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`Некорректный индекс в пути: "${p}"`)
    }
    out.push(n)
  }
  return out
}

/** "0/1/2" -> { parentPath: "0/1" | null, index: 2 } */
function splitParentAndIndex(path: string): { parentPath: string | null; index: number } {
  const normalized = normalizeIndexPathString(path)
  const idx = parseIndexPath(normalized)
  if (idx.length === 0) throw new Error(`Путь не может быть пустым`)
  const last = idx[idx.length - 1]!
  const parentIdx = idx.slice(0, -1)
  return { parentPath: parentIdx.length ? parentIdx.join("/") : null, index: last }
}
/** Безопасно вернуть i-й байт ключа с запасным значением. */
function byteAt(key: Key, i: number, fallback: number): number {
  return i < key.length ? key[i]! : fallback
}

/** Сравнение двух лексикографических ключей (по байтам; как у строк). */
function cmpKey(a: Key, b: Key): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const ai = a[i]!
    const bi = b[i]!
    if (ai !== bi) return ai - bi
  }
  return a.length - b.length
}

/**
 * Сгенерировать ключ строго **между** ключами `a` и `b`.
 * - `a == null` трактуется как `-∞`
 * - `b == null` трактуется как `+∞`
 *
 * @example
 * between(null, null) -> [128]
 * between([10], [11]) -> [10, 127] (или схожее промежуточное значение)
 */
export function between(a: Key | null, b: Key | null): Key {
  const BASE = 256
  if (a === null && b === null) return Uint8Array.from([128])

  if (a === null) {
    // если b пустой ключ → вернём "самый малый" стабильный ключ 127
    if (b!.length === 0) return Uint8Array.from([127])

    // найдём первый байт > 0, уменьшим его на 1 и вернём префикс до него включительно
    const out: number[] = []
    for (let i = 0; i < b!.length; i++) {
      const bi = b![i]!
      if (bi > 0) {
        out.push(bi - 1)
        return Uint8Array.from(out)
      }
      out.push(0)
    }

    // если все байты == 0 → уже минимально возможно; вернём b как есть
    // (дальше сравнение по seq обеспечит нужный порядок)
    return Uint8Array.from(b!)
  }

  if (b === null) {
    return Uint8Array.from([...a, 128])
  }

  const out: number[] = []
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const ai = byteAt(a, i, 0)
    const bi = byteAt(b, i, BASE - 1)
    if (ai === bi) {
      out.push(ai)
      continue
    }
    if (bi - ai > 1) {
      out.push(ai + Math.floor((bi - ai) / 2))
      return Uint8Array.from(out)
    }
    out.push(ai)
  }
  return Uint8Array.from([...out, Math.floor((BASE - 1) / 2)])
}
// =====================================================================

/**
 * Класс Fields — глобальная арена акторов и упорядоченная витрина их детей.
 *
 * @remarks
 * - Синглтон: используйте {@link Fields.get}.
 * - Внутренне хранит:
 *   - `actors`: `id -> Actor`
 *   - `meta`: `id -> Meta` (родитель, ключ порядка, seq)
 *   - `childrenView`: `(parentId|ROOT) -> string[]` — упорядоченные id детей.
 *   - `reservations`: `id -> Reservation` — зарезервированные слоты под будущие акторы.
 */
export class Fields {
  // -------- singleton --------

  private static instance: Fields | null = null

  /** Получить глобальный экземпляр Fields (создаётся при первом обращении). */
  public static get(): Fields {
    if (!Fields.instance) Fields.instance = new Fields()
    return Fields.instance
  }

  /** Заменить глобальный экземпляр (например, в тестах). */
  public static set(instance: Fields): void {
    Fields.instance = instance
  }

  // -------- storage --------

  /** Хранилище акторов: id -> Actor. */
  private actors = new Map<string, Actor>()
  /** Метаданные актора: id -> Meta. */
  private meta = new Map<string, Meta>()
  /** Витрина детей: parentId|ROOT -> **упорядоченный** список id детей. */
  private childrenView = new Map<string, string[]>()
  /** Резервации слотов по будущим id. */
  private reservations = new Map<string, Reservation>()

  // -------- helpers --------

  private parentKey(parentId: string | null): string {
    return parentId ?? ROOT
  }

  /** Гарантировать наличие массива детей для `parentId`. */
  private ensureChildren(parentId: string | null): string[] {
    const k = this.parentKey(parentId)
    const arr = this.childrenView.get(k)
    if (arr) return arr
    const fresh: string[] = []
    this.childrenView.set(k, fresh)
    return fresh
  }

  /** Стабильный бинарный поиск позиции вставки по (orderKey, seq). */
  private bsearchByKey(arr: string[], key: Key, seq: number): number {
    let lo = 0,
      hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      const midId = arr[mid]!
      const m = this.meta.get(midId)!
      let c = cmpKey(m.orderKey, key)
      if (c === 0) c = seq - m.seq
      if (c <= 0) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  private requireActor(id: string): Actor {
    const a = this.actors.get(id)
    if (!a) throw new Error(`Актор не найден: ${id}`)
    return a
  }

  private requireMeta(id: string): Meta {
    const m = this.meta.get(id)
    if (!m) throw new Error(`Метаданные актора отсутствуют: ${id}`)
    return m
  }

  // -------- чтение / проверка --------

  /**
   * Родитель данного id (или null для корня).
   * @param id Идентификатор актора.
   */
  public getParentId(id: string): string | null {
    return this.meta.get(id)?.parent ?? null
  }

  /**
   * Получить актора по id.
   * @returns Экземпляр актора либо `null`.
   */
  public getActor(id: string): Actor | null {
    return this.actors.get(id) ?? null
  }

  /** Проверить наличие актора по id. */
  public has(id: string): boolean {
    return this.actors.has(id)
  }

  /** Получить всех акторов в системе.
   * @returns Массив всех акторов.
   */
  public getAllActors(): Actor[] {
    return Array.from(this.actors.values())
  }

  /**
   * Построить индекс-путь ("0/1/2") для актора по его текущей позиции.
   * @throws Если актор не найден или витрина рассинхронизирована.
   */
  public getPath(id: string): string {
    if (!this.actors.has(id)) throw new Error(`Актор не найден: ${id}`)
    const indices: number[] = []
    let cur: string | null = id
    while (cur) {
      const m = this.meta.get(cur)
      if (!m) throw new Error(`Метаданные актора отсутствуют: ${cur}`)
      const kids = this.getChildren(m.parent)
      const idx = kids.indexOf(cur)
      if (idx < 0) throw new Error(`Витрина не содержит актора "${cur}" у родителя "${m.parent ?? "root"}"`)
      indices.push(idx)
      cur = m.parent
    }
    indices.reverse()
    return indices.join("/")
  }

  /**
   * Рассчитать индекс-путь для нового «брата» рядом с `neighborId`.
   * @param neighborId Существующий актор-ориентир.
   * @param at Позиция относительно `neighborId`: `"before"` | `"after"` (по умолчанию `"after"`).
   */
  public computeSiblingPath(neighborId: string, at: "before" | "after" = "after"): string {
    const neighborPath = this.getPath(neighborId)
    const slash = neighborPath.lastIndexOf("/")
    const parentPath = slash === -1 ? null : neighborPath.slice(0, slash)
    const neighborIndexStr = slash === -1 ? neighborPath : neighborPath.slice(slash + 1)
    const neighborIndex = Number(neighborIndexStr)
    if (!Number.isInteger(neighborIndex) || neighborIndex < 0) {
      throw new Error(`Некорректный путь соседа: "${neighborPath}"`)
    }
    const newIndex = at === "before" ? neighborIndex : neighborIndex + 1
    return parentPath ? `${parentPath}/${newIndex}` : String(newIndex)
  }

  /**
   * Дети родителя в текущем (лексикографическом) порядке.
   * @param parentId id родителя (или null для корня).
   */
  public getChildren(parentId: string | null): readonly string[] {
    return this.ensureChildren(parentId)
  }

  /** Занят ли индекс-путь. */
  public hasPath(path: string): boolean {
    return this.getNode(path) !== null
  }

  /** Получить актора по индекс-пути. */
  public getNode(path: string): Actor | null {
    const id = this.getIdByIndexPath(null, parseIndexPath(path))
    return id ? this.getActor(id) : null
  }

  /**
   * Спуск по индексному пути от `rootId`.
   * @param rootId id корня или null (виртуальный корень).
   * @param indexPath массив индексов, например `[0,2,1]`.
   */
  public getIdByIndexPath(rootId: string | null, indexPath: number[]): string | null {
    let parent: string | null = rootId
    let current: string | null = null
    for (const idx of indexPath) {
      const kids = this.getChildren(parent)
      if (idx < 0 || idx >= kids.length) return null
      current = kids[idx]!
      parent = current
    }
    return current
  }

  // -------- создание (принимают Actor) --------

  /**
   * Создать актора и добавить его в конец детей `parentId`.
   * @param parentId id родителя (или null).
   * @param actor Экземпляр актора (должен иметь уникальный `id`).
   */
  public createChildren(parentId: string | null, actor: Actor): void {
    const id = (actor as any).id as string
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) throw new Error(`Актор уже существует: ${id}`)

    // регистрация в арене
    this.actors.set(id, actor)
    const arr = this.ensureChildren(parentId)

    // вычисляем ключ «после» последнего ребёнка
    const lastId = arr.length ? arr[arr.length - 1]! : null
    const lastKey = lastId ? this.requireMeta(lastId).orderKey : null

    const meta: Meta = { parent: parentId, orderKey: between(lastKey, null), seq: GLOBAL_SEQ++ }
    this.meta.set(id, meta)

    // точка вставки по ключу
    const pos = this.bsearchByKey(arr, meta.orderKey, meta.seq)
    arr.splice(pos, 0, id)
  }

  /**
   * Создать актора и вставить его между левым и правым соседями.
   * @param leftId id левого соседа (или null).
   * @param rightId id правого соседа (или null).
   * @param actor создаваемый актор.
   */
  public createBetween(leftId: string | null, rightId: string | null, actor: Actor): void {
    const id = (actor as any).id as string
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) throw new Error(`Актор уже существует: ${id}`)

    // регистрация в арене
    this.actors.set(id, actor)

    // вычисляем родителя и ключ «между»
    const L = leftId ? this.requireMeta(leftId) : null
    const R = rightId ? this.requireMeta(rightId) : null
    let parentId: string | null = null
    if (L && R) {
      const lp = L.parent ?? ""
      const rp = R.parent ?? ""
      if (lp !== rp) throw new Error(`Соседи должны иметь одного родителя`)
      parentId = L.parent
    } else if (L) parentId = L.parent
    else if (R) parentId = R.parent

    const leftKey = leftId ? this.requireMeta(leftId).orderKey : null
    const rightKey = rightId ? this.requireMeta(rightId).orderKey : null
    const key = between(leftKey, rightKey)

    // метаданные и вставка
    const meta: Meta = { parent: parentId, orderKey: key, seq: GLOBAL_SEQ++ }
    this.meta.set(id, meta)
    const arr = this.ensureChildren(parentId)
    const pos = this.bsearchByKey(arr, key, meta.seq)
    arr.splice(pos, 0, id)
  }

  /**
   * Создать актора и вставить его перед соседом.
   * @param neighborId id соседа.
   * @param actor Экземпляр актора.
   */
  public createBefore(neighborId: string, actor: Actor): void {
    const id = actor.id
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) throw new Error(`Актор уже существует: ${id}`)

    const metaN = this.requireMeta(neighborId)
    const arr = this.ensureChildren(metaN.parent)
    const idx = arr.indexOf(neighborId)
    if (idx < 0) throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighborId}`)
    const leftId = idx > 0 ? arr[idx - 1]! : null

    // регистрация и мета
    this.actors.set(id, actor)
    const leftKey = leftId ? this.requireMeta(leftId).orderKey : null
    const key = between(leftKey, metaN.orderKey)
    const meta: Meta = { parent: metaN.parent, orderKey: key, seq: GLOBAL_SEQ++ }
    this.meta.set(id, meta)

    // вставка
    const pos = this.bsearchByKey(arr, key, meta.seq)
    arr.splice(pos, 0, id)
  }

  /**
   * Создать актора и вставить его после соседа.
   * @param neighborId id соседа.
   * @param actor Экземпляр актора.
   * @remarks Если справа нет соседа — эквивалентно добавлению в конец.
   */
  public createAfter(neighborId: string, actor: Actor): void {
    const id = (actor as any).id as string
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) throw new Error(`Актор уже существует: ${id}`)

    const metaN = this.requireMeta(neighborId)
    const arr = this.ensureChildren(metaN.parent)
    const idx = arr.indexOf(neighborId)
    if (idx < 0) throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighborId}`)
    const rightId = idx + 1 < arr.length ? arr[idx + 1]! : null

    // регистрация и мета
    this.actors.set(id, actor)
    const rightKey = rightId ? this.requireMeta(rightId).orderKey : null
    const key = between(metaN.orderKey, rightKey)
    const meta: Meta = { parent: metaN.parent, orderKey: key, seq: GLOBAL_SEQ++ }
    this.meta.set(id, meta)

    // вставка
    const pos = this.bsearchByKey(arr, key, meta.seq)
    arr.splice(pos, 0, id)
  }

  /**
   * Создать актора по индекс-пути.
   * Надёжная версия: вычисляет лексикографический ключ по индексной позиции
   * и выполняет **ровно одну** вставку «по ключу».
   *
   * @param path Индекс-путь вида "0/1/2".
   * @param actor Экземпляр актора.
   * @throws Если индекс вне диапазона.
   */
  public createNode(path: string, actor: Actor): void {
    const id = (actor as any).id as string
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) throw new Error(`Актор уже существует: ${id}`)

    const { parentPath, index } = splitParentAndIndex(path)
    const parentId = parentPath ? this.getIdByIndexPath(null, parseIndexPath(parentPath)) : null
    const children = this.getChildren(parentId)
    if (index < 0 || index > children.length) {
      throw new Error(`Индекс вне диапазона для пути "${path}"`)
    }

    // если вставляем ровно в позицию существующего — это "перед соседом"
    if (index < children.length) {
      const neighborId = children[index]!
      this.createBefore(neighborId, actor)
      return
    }
    // иначе — добавляем в конец
    this.createChildren(parentId, actor)
  }

  /**
   * Создать актора по заранее рассчитанному лексикографическому ключу.
   * @param parentId Родитель (или null для корня).
   * @param orderKey Лексикографический ключ позиции среди детей родителя.
   * @param actor Экземпляр актора.
   */
  public createWithOrder(parentId: string | null, orderKey: Key, actor: Actor): void {
    const id = (actor as any).id as string
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) throw new Error(`Актор уже существует: ${id}`)

    this.actors.set(id, actor)
    const meta: Meta = { parent: parentId, orderKey, seq: GLOBAL_SEQ++ }
    this.meta.set(id, meta)

    const arr = this.ensureChildren(parentId)
    const pos = this.bsearchByKey(arr, orderKey, meta.seq)
    arr.splice(pos, 0, id)
  }

  // -------- перемещения (id уже существует) --------

  /** Добавить существующего ребёнка в конец детей `parentId`. */
  public appendChild(parentId: string | null, childId: string): void {
    this.requireActor(childId)
    const m = this.requireMeta(childId)

    const arr = this.ensureChildren(parentId)
    const lastId = arr.length ? arr[arr.length - 1]! : null
    const lastKey = lastId ? this.requireMeta(lastId).orderKey : null

    this.unlink(childId) // актуализируем витрину
    m.parent = parentId
    m.orderKey = between(lastKey, null)

    const pos = this.bsearchByKey(arr, m.orderKey, m.seq)
    arr.splice(pos, 0, childId)
  }

  /** Вставить существующего ребёнка между левым и правым соседями. */
  public insertBetween(leftId: string | null, rightId: string | null, childId: string): void {
    this.requireActor(childId)
    const mChild = this.requireMeta(childId)

    const L = leftId ? this.requireMeta(leftId) : null
    const R = rightId ? this.requireMeta(rightId) : null
    let parentId: string | null = null
    if (L && R) {
      const lp = L.parent ?? ""
      const rp = R.parent ?? ""
      if (lp !== rp) throw new Error(`Соседи должны иметь одного родителя`)
      parentId = L.parent
    } else if (L) parentId = L.parent
    else if (R) parentId = R.parent

    this.unlink(childId)

    const arr = this.ensureChildren(parentId)
    let insertIndex = 0
    if (rightId) {
      const rIdx = arr.indexOf(rightId)
      if (rIdx < 0) throw new Error(`Правый сосед отсутствует в витрине родителя: ${rightId}`)
      insertIndex = rIdx
    } else if (leftId) {
      const lIdx = arr.indexOf(leftId)
      if (lIdx < 0) throw new Error(`Левый сосед отсутствует в витрине родителя: ${leftId}`)
      insertIndex = lIdx + 1
    }

    const leftKey = leftId ? this.requireMeta(leftId).orderKey : null
    const rightKey = rightId ? this.requireMeta(rightId).orderKey : null

    mChild.parent = parentId
    mChild.orderKey = between(leftKey, rightKey)

    arr.splice(insertIndex, 0, childId)
  }

  /** Вставить существующего ребёнка перед соседом. */
  public insertBefore(neighborId: string, childId: string): void {
    if (neighborId === childId) return
    this.requireActor(childId)
    const mChild = this.requireMeta(childId)

    const mN = this.requireMeta(neighborId)
    this.unlink(childId)

    const arr = this.ensureChildren(mN.parent)
    const idx = arr.indexOf(neighborId)
    if (idx < 0) throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighborId}`)

    const leftId = idx > 0 ? arr[idx - 1]! : null
    const leftKey = leftId ? this.requireMeta(leftId).orderKey : null

    mChild.parent = mN.parent
    mChild.orderKey = between(leftKey, mN.orderKey)

    arr.splice(idx, 0, childId)
  }

  /**
   * Вставить существующего ребёнка после соседа.
   * @remarks Если справа нет соседа — эквивалентно добавлению в конец.
   */
  public insertAfter(neighborId: string, childId: string): void {
    if (neighborId === childId) return
    this.requireActor(childId)
    const mChild = this.requireMeta(childId)

    const mN = this.requireMeta(neighborId)
    this.unlink(childId)

    const arr = this.ensureChildren(mN.parent)
    const idx = arr.indexOf(neighborId)
    if (idx < 0) throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighborId}`)

    const rightId = idx + 1 < arr.length ? arr[idx + 1]! : null
    const rightKey = rightId ? this.requireMeta(rightId).orderKey : null

    mChild.parent = mN.parent
    mChild.orderKey = between(mN.orderKey, rightKey)

    arr.splice(idx + 1, 0, childId)
  }

  /** Отвязать актора от текущего родителя (не удаляя из арены). */
  public unlink(id: string): void {
    const m = this.meta.get(id)
    if (!m) return
    const arr = this.ensureChildren(m.parent)
    const idx = arr.indexOf(id)
    if (idx >= 0) arr.splice(idx, 1)
    m.parent = null
  }

  /**
   * Перенести детей удаляемого актора на уровень его родителя.
   * @param id Идентификатор удаляемого актора.
   */
  private promoteChildren(id: string): void {
    const children = this.getChildren(id)
    if (children.length === 0) return

    const meta = this.meta.get(id)
    if (!meta) return

    const parentId = meta.parent
    const parentChildren = this.ensureChildren(parentId)
    const parentIndex = parentId ? parentChildren.indexOf(id) : -1

    // Обновляем родителя для всех детей
    for (const childId of children) {
      const childMeta = this.meta.get(childId)
      if (childMeta) {
        childMeta.parent = parentId
      }
    }

    if (parentIndex >= 0) {
      // Удаляем родителя из массива детей его родителя
      parentChildren.splice(parentIndex, 1)

      // Вставляем детей на место родителя
      parentChildren.splice(parentIndex, 0, ...children)
    } else {
      // Если это корневой элемент, добавляем детей в корень
      parentChildren.push(...children)
    }
  }

  /**
   * Удалить актора.
   * @param id Идентификатор актора.
   * @param recursive Если true — удалить также всё поддерево.
   */
  public remove(id: string, recursive = false): void {
    if (!this.actors.has(id)) return

    if (recursive) {
      // Рекурсивное удаление: удаляем всех детей
      const kids = [...this.getChildren(id)]
      for (const childId of kids) this.remove(childId, true)
    } else {
      // Нерекурсивное удаление: переносим детей на уровень родителя
      this.promoteChildren(id)
    }

    this.unlink(id)
    this.actors.delete(id)
    this.meta.delete(id)
    this.childrenView.delete(this.parentKey(id))
    this.reservations.delete(id)
  }

  // -------- навигация по витрине --------

  /** Получить первого ребёнка родителя. */
  public getFirstChild(parentId: string | null): string | null {
    const kids = this.getChildren(parentId)
    return kids.length ? kids[0]! : null
  }

  /** Получить следующего соседа внутри одного родителя. */
  public getNextSibling(parentId: string | null, id: string): string | null {
    const kids = this.getChildren(parentId)
    const i = kids.indexOf(id)
    return i >= 0 && i + 1 < kids.length ? kids[i + 1]! : null
  }

  /** Получить предыдущего соседа. */
  public getPrevSibling(parentId: string | null, id: string): string | null {
    const kids = this.getChildren(parentId)
    const i = kids.indexOf(id)
    return i > 0 ? kids[i - 1]! : null
  }

  // -------- сахар над insertBefore/insertAfter --------

  /** Переместить существующего ребёнка ПОСЛЕ указанного узла. */
  public moveAfter(targetId: string, childId: string): void {
    if (targetId === childId) return
    this.insertAfter(targetId, childId)
  }

  /** Переместить существующего ребёнка ПЕРЕД указанным узлом. */
  public moveBefore(targetId: string, childId: string): void {
    if (targetId === childId) return
    this.insertBefore(targetId, childId)
  }

  /**
   * Перепривязать существующего ребёнка к новому родителю с позиционированием.
   * @param newParentId Новый родитель (или null для корня).
   * @param childId Перемещаемый актор.
   * @param options { at: "start" | "end" | "after"; after?: string|null }
   */
  public reparentActor(
    newParentId: string | null,
    childId: string,
    options: { at: "start" | "end" | "after"; after?: string | null } = { at: "end" }
  ): void {
    if (options.at === "start") {
      const first = this.getFirstChild(newParentId)
      this.insertBetween(null, first, childId)
      return
    }
    if (options.at === "after" && options.after) {
      const kids = this.getChildren(newParentId)
      if (!kids.includes(options.after)) {
        throw new Error(`Узел "${options.after}" не является ребёнком указанного родителя`)
      }
      const next = this.getNextSibling(newParentId, options.after)
      this.insertBetween(options.after, next, childId)
      return
    }
    this.appendChild(newParentId, childId)
  }

  // -------- РЕЗЕРВАЦИИ (устойчивые вставки по id) --------

  /**
   * Зарезервировать слот для будущего актора с id `newId`, вычислив позицию
   * по соседу `targetId`: `"before"` или `"after"`.
   */
  public reserveSibling(newId: string, targetId: string, at: "before" | "after" = "after"): void {
    if (this.actors.has(newId) || this.reservations.has(newId)) {
      throw new Error(`id уже занят или зарезервирован: ${newId}`)
    }
    const parentId = this.getParentId(targetId)
    const kids = this.getChildren(parentId)
    const idx = kids.indexOf(targetId)
    if (idx < 0) throw new Error("Сосед не найден в витрине")

    const leftId = at === "before" ? (idx > 0 ? kids[idx - 1]! : null) : targetId
    const rightId = at === "before" ? targetId : idx + 1 < kids.length ? kids[idx + 1]! : null

    const leftKey = leftId ? this.requireMeta(leftId).orderKey : null
    const rightKey = rightId ? this.requireMeta(rightId).orderKey : null
    const orderKey = between(leftKey, rightKey)

    this.reservations.set(newId, { parentId, orderKey })
  }

  /**
   * Зарезервировать слот по индекс-пути (переводит индекс в лексикографический ключ).
   */
  public reserveByIndexPath(newId: string, path: string): void {
    if (this.actors.has(newId) || this.reservations.has(newId)) {
      throw new Error(`id уже занят или зарезервирован: ${newId}`)
    }
    const { parentPath, index } = splitParentAndIndex(path)
    const parentId = parentPath ? this.getIdByIndexPath(null, parseIndexPath(parentPath)) : null
    const children = this.getChildren(parentId)
    if (index < 0 || index > children.length) {
      throw new Error(`Индекс вне диапазона для пути "${path}"`)
    }
    const leftId = index > 0 ? children[index - 1]! : null
    const rightId = index < children.length ? children[index]! : null
    const leftKey = leftId ? this.requireMeta(leftId).orderKey : null
    const rightKey = rightId ? this.requireMeta(rightId).orderKey : null
    const orderKey = between(leftKey, rightKey)

    this.reservations.set(newId, { parentId, orderKey })
  }

  /**
   * Зарезервировать слот, если ключ уже рассчитан внешним кодом.
   */
  public reserveByKey(newId: string, parentId: string | null, orderKey: Key): void {
    if (this.actors.has(newId) || this.reservations.has(newId)) {
      throw new Error(`id уже занят или зарезервирован: ${newId}`)
    }
    this.reservations.set(newId, { parentId, orderKey })
  }

  /** Отменить резервацию под id (если есть). */
  public cancelReservation(newId: string): void {
    this.reservations.delete(newId)
  }

  /**
   * Присоединить актор к зарезервированному слоту по его id.
   * Если резервации нет — актор попадёт **в конец корня**.
   */
  public attachReserved(actor: Actor): void {
    const id = (actor as any).id as string
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) return // уже вставлен

    const r = this.reservations.get(id)
    if (!r) {
      this.createChildren(null, actor)
      return
    }
    this.reservations.delete(id)

    this.actors.set(id, actor)
    const meta: Meta = { parent: r.parentId, orderKey: r.orderKey, seq: GLOBAL_SEQ++ }
    this.meta.set(id, meta)

    const arr = this.ensureChildren(r.parentId)
    const pos = this.bsearchByKey(arr, r.orderKey, meta.seq)
    arr.splice(pos, 0, id)
  }
}
