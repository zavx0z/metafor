/**
 * Fields — управление деревом акторов (лексикографический порядок).
 *
 * - Хранит только Actor (никаких «нод»).
 * - Поддерживает создание по индексному пути вида "0/1/2".
 * - Витрина детей всегда отсортирована онлайн (без dirty/normalize).
 * - Даёт статический доступ: Fields.get() — глобальный синглтон.
 */

import type { Actor } from "../actor"

/** Лексикографический ключ порядка */
type Key = Uint8Array

/** Внутренние метаданные актора (не экспонируются) */
interface Meta {
  parent: string | null
  orderKey: Key
  seq: number
}

let GLOBAL_SEQ = 0
const ROOT = "" // ключ для корня в childrenView (когда parentId === null)

/** Безопасное чтение байта с запасным значением */
function byteAt(key: Key, i: number, fallback: number): number {
  return i < key.length ? key[i]! : fallback
}

/** Сравнение двух лексикографических ключей */
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
 * Сгенерировать ключ строго между a и b.
 * @remarks a == null трактуется как -∞, b == null — как +∞.
 */
function between(a: Key | null, b: Key | null): Key {
  const BASE = 256
  if (a === null && b === null) return Uint8Array.from([128])

  if (a === null) {
    if (b!.length === 0) return Uint8Array.from([127])
    const out: number[] = []
    for (let i = 0; i < b!.length; i++) {
      const bi = b![i]!
      if (bi > 0) {
        out.push(bi - 1)
        return Uint8Array.from(out)
      }
      out.push(0)
    }
    return Uint8Array.from([...b!, 0])
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

/** Разбор пути "0/1/2" → массив индексов */
function parseIndexPath(path: string): number[] {
  if (path.trim() === "") return []
  const parts = path.split("/")
  const out: number[] = []
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`Некорректный индекс в пути: "${p}"`)
    }
    out.push(n)
  }
  return out
}

/** Получить родительский под-путь и последний индекс: "0/1/2" → ("0/1", 2) */
function splitParentAndIndex(path: string): { parentPath: string | null; index: number } {
  const idx = parseIndexPath(path)
  if (idx.length === 0) throw new Error(`Путь не может быть пустым`)
  const last = idx[idx.length - 1]!
  const parentIdx = idx.slice(0, -1)
  return { parentPath: parentIdx.length ? parentIdx.join("/") : null, index: last }
}

/**
 * Класс Fields — арена акторов и витрина детей с лексикографическим порядком.
 */
export class Fields {
  /** Глобальный синглтон */
  private static instance: Fields | null = null

  /** Получить глобальный экземпляр Fields (создаётся при первом обращении) */
  public static get(): Fields {
    if (!Fields.instance) Fields.instance = new Fields()
    return Fields.instance
  }

  /** Заменить глобальный экземпляр (напр., при тестировании) */
  public static set(instance: Fields): void {
    Fields.instance = instance
  }

  /** Хранилище акторов: id -> Actor */
  private actors = new Map<string, Actor>()
  /** Метаданные актора: id -> Meta */
  private meta = new Map<string, Meta>()
  /** Витрина детей: parentId|"" -> отсортированный список child ids */
  private childrenView = new Map<string, string[]>()

  // ==== базовые утилиты ====

  private parentKey(parentId: string | null): string {
    return parentId ?? ROOT
  }
  /** Родитель данного id (или null для корня) */
  public getParentId(id: string): string | null {
    const m = (this as any).meta.get(id) as { parent: string | null } | undefined
    return m?.parent ?? null
  }
  private ensureChildren(parentId: string | null): string[] {
    const k = this.parentKey(parentId)
    const arr = this.childrenView.get(k)
    if (arr) return arr
    const fresh: string[] = []
    this.childrenView.set(k, fresh)
    return fresh
  }

  /** Позиция для вставки по (orderKey, seq) — стабильный бинарный поиск (вправо) */
  private bsearchByKey(arr: string[], key: Key, seq: number): number {
    let lo = 0,
      hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      const midId = arr[mid]!
      const m = this.meta.get(midId)!
      const c = cmpKey(m.orderKey, key) || m.seq - seq
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

  // ==== чтение / проверка ====

  /**
   * Получить актора по id.
   * @param id — идентификатор актора.
   * @returns Экземпляр актора либо null.
   */
  public getActor(id: string): Actor | null {
    return this.actors.get(id) ?? null
  }

  /**
   * Проверить наличие актора.
   * @param id — идентификатор актора.
   */
  public has(id: string): boolean {
    return this.actors.has(id)
  }

  /**
   * Построить индекс-путь ("0/1/2") для актора по его текущей позиции.
   * @param id Идентификатор актора.
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
   * Рассчитать индекс-путь для нового «брата» рядом с neighborId.
   * @param neighborId Идентификатор соседа (существующего актора).
   * @param at Позиция: "before" | "after" (по умолчанию "after").
   * @returns Строка пути для нового актора.
   * @throws Если сосед не найден или отсутствует в витрине своего родителя.
   */
  public computeSiblingPath(neighborId: string, at: "before" | "after" = "after"): string {
    // путь соседа → его родительский путь и собственный индекс
    const neighborPath = this.getPath(neighborId) // "a/b/…/k" в индексах типа "0/1/2"
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
   * Дети родителя в текущем порядке.
   * @param parentId — id родителя (или null для корня).
   * @returns Отсортированный массив id детей.
   */
  public getChildren(parentId: string | null): readonly string[] {
    return this.ensureChildren(parentId)
  }

  /**
   * Узнать, занят ли путь.
   * @param path Индекс-путь вида "0/1/2".
   */
  public hasPath(path: string): boolean {
    return this.getNode(path) !== null
  }

  /**
   * Получить актора по индекс-пути.
   * @param path Индекс-путь вида "0/1/2".
   * @returns Actor или null.
   */
  public getNode(path: string): Actor | null {
    const id = this.getIdByIndexPath(null, parseIndexPath(path))
    return id ? this.getActor(id) : null
  }

  /**
   * Спуск по индексному пути от rootId.
   * @param rootId — id корня, либо null (виртуальный корень).
   * @param indexPath — массив индексов (например, [0,2,1]).
   * @returns id найденного актора либо null.
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

  // ==== создание (принимают Actor) ====

  /**
   * Создать актора и добавить его в конец детей родителя.
   * @param parentId id родителя (или null для корня).
   * @param actor Актор (должен иметь уникальный `id`).
   */
  public createChildren(parentId: string | null, actor: Actor): void {
    const id = (actor as any).id as string
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) throw new Error(`Актор уже существует: ${id}`)

    this.actors.set(id, actor)
    this.meta.set(id, { parent: null, orderKey: new Uint8Array(0), seq: GLOBAL_SEQ++ })
    this.appendChild(parentId, id)
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

    this.actors.set(id, actor)
    this.meta.set(id, { parent: null, orderKey: new Uint8Array(0), seq: GLOBAL_SEQ++ })
    this.insertBetween(leftId, rightId, id)
  }

  /**
   * Создать актора и вставить его перед соседом.
   * @param neighborId id соседа.
   * @param actor создаваемый актор.
   */
  public createBefore(neighborId: string, actor: Actor): void {
    const id = (actor as any).id as string
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) throw new Error(`Актор уже существует: ${id}`)

    this.actors.set(id, actor)
    this.meta.set(id, { parent: null, orderKey: new Uint8Array(0), seq: GLOBAL_SEQ++ })
    this.insertBefore(neighborId, id)
  }

  /**
   * Создать актора и вставить его после соседа.
   * @param neighborId id соседа.
   * @param actor создаваемый актор.
   * @remarks Если справа нет соседа — будет добавлен в конец.
   */
  public createAfter(neighborId: string, actor: Actor): void {
    const id = (actor as any).id as string
    if (!id) throw new Error(`У актора отсутствует id`)
    if (this.actors.has(id)) throw new Error(`Актор уже существует: ${id}`)

    this.actors.set(id, actor)
    this.meta.set(id, { parent: null, orderKey: new Uint8Array(0), seq: GLOBAL_SEQ++ })
    this.insertAfter(neighborId, id)
  }

  /**
   * Создать актора по индекс-пути.
   * @param path Индекс-путь вида "0/1/2".
   * @param actor Актор.
   * @throws Если индекс вне диапазона или путь уже занят.
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
    // index в диапазоне мы уже проверили выше
    this.actors.set(id, actor)
    this.meta.set(id, { parent: null, orderKey: new Uint8Array(0), seq: GLOBAL_SEQ++ })

    const leftId = index > 0 ? children[index - 1]! : null
    const rightId = index < children.length ? children[index]! : null
    this.insertBetween(leftId, rightId, id)

    this.actors.set(id, actor)
    this.meta.set(id, { parent: null, orderKey: new Uint8Array(0), seq: GLOBAL_SEQ++ })

    // Вставка строго на позицию index
    if (index === children.length) {
      this.appendChild(parentId, id)
    } else {
      const neighborId = children[index]!
      this.insertBefore(neighborId, id)
    }
  }

  // ==== перемещения (id уже существует) ====

  /**
   * Добавить существующего ребёнка в конец детей родителя.
   * @param parentId id родителя (или null).
   * @param childId id перемещаемого актора.
   */
  public appendChild(parentId: string | null, childId: string): void {
    this.requireActor(childId)
    const m = this.requireMeta(childId)

    const arr = this.ensureChildren(parentId)
    const lastId = arr.length ? arr[arr.length - 1]! : null
    const lastKey = lastId ? this.requireMeta(lastId).orderKey : null

    this.unlink(childId)
    m.parent = parentId
    m.orderKey = between(lastKey, null)

    const pos = this.bsearchByKey(arr, m.orderKey, m.seq)
    arr.splice(pos, 0, childId)
  }

  /**
   * Вставить существующего ребёнка между левым и правым соседями.
   * @param leftId id левого соседа (или null).
   * @param rightId id правого соседа (или null).
   */
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

    // сначала unlink — дальше индексы актуальны
    this.unlink(childId)

    const arr = this.ensureChildren(parentId)

    // допускаем, что childId мог быть равен одному из соседей — переоцениваем индексы по текущей витрине
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
  /**
   * Вставить существующего ребёнка перед соседом.
   * @param neighborId id соседа.
   */
  public insertBefore(neighborId: string, childId: string): void {
    if (neighborId === childId) return
    this.requireActor(childId)
    const mChild = this.requireMeta(childId)

    const mN = this.requireMeta(neighborId)

    // СНАЧАЛА unlink, чтобы индексы были актуальны
    this.unlink(childId)

    const arr = this.ensureChildren(mN.parent)
    const idx = arr.indexOf(neighborId)
    if (idx < 0) throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighborId}`)

    const leftId = idx > 0 ? arr[idx - 1]! : null
    const leftKey = leftId ? this.requireMeta(leftId).orderKey : null

    mChild.parent = mN.parent
    mChild.orderKey = between(leftKey, mN.orderKey)

    arr.splice(idx, 0, childId) // ровно ПЕРЕД соседом
  }

  /**
   * Вставить существующего ребёнка после соседа.
   * @param neighborId id соседа.
   * @remarks Если справа нет соседа — эквивалентно добавлению в конец.
   */
  public insertAfter(neighborId: string, childId: string): void {
    if (neighborId === childId) return
    this.requireActor(childId)
    const mChild = this.requireMeta(childId)

    const mN = this.requireMeta(neighborId)

    // сначала unlink — потом считаем индексы
    this.unlink(childId)

    const arr = this.ensureChildren(mN.parent)
    const idx = arr.indexOf(neighborId)
    if (idx < 0) throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighborId}`)

    const rightId = idx + 1 < arr.length ? arr[idx + 1]! : null
    const rightKey = rightId ? this.requireMeta(rightId).orderKey : null

    mChild.parent = mN.parent
    mChild.orderKey = between(mN.orderKey, rightKey)

    arr.splice(idx + 1, 0, childId) // ровно ПОСЛЕ соседа
  }

  /**
   * Отвязать актора от текущего родителя (не удаляя из арены).
   * @param id id актора.
   */
  public unlink(id: string): void {
    const m = this.meta.get(id)
    if (!m) return
    // ВАЖНО: даже если m.parent === null (корень), всё равно пытаемся вырезать из витрины
    const arr = this.ensureChildren(m.parent)
    const idx = arr.indexOf(id)
    if (idx >= 0) arr.splice(idx, 1)
    m.parent = null
  }

  /**
   * Удалить актора.
   * @param id id актора.
   * @param recursive если true — удалить также всё поддерево.
   */
  public remove(id: string, recursive = false): void {
    if (!this.actors.has(id)) return
    if (recursive) {
      const kids = [...this.getChildren(id)]
      for (const childId of kids) this.remove(childId, true)
    }
    this.unlink(id)
    this.actors.delete(id)
    this.meta.delete(id)
    this.childrenView.delete(this.parentKey(id))
  }
  // ===== Хелперы для навигации по витрине =====

  /**
   * Получить первого ребёнка родителя.
   * @param parentId id родителя (или null).
   */
  public getFirstChild(parentId: string | null): string | null {
    const kids = this.getChildren(parentId)
    return kids.length ? kids[0]! : null
  }

  /**
   * Получить следующего соседа внутри одного родителя.
   * @param parentId id родителя (или null).
   * @param id текущий актор.
   */
  public getNextSibling(parentId: string | null, id: string): string | null {
    const kids = this.getChildren(parentId)
    const i = kids.indexOf(id)
    return i >= 0 && i + 1 < kids.length ? kids[i + 1]! : null
  }

  /**
   * Получить предыдущего соседа (на будущее; тестам не обязательно).
   */
  public getPrevSibling(parentId: string | null, id: string): string | null {
    const kids = this.getChildren(parentId)
    const i = kids.indexOf(id)
    return i > 0 ? kids[i - 1]! : null
  }

  // ===== Сахар над insertBefore/insertAfter =====

  /**
   * Переместить существующего ребёнка ПОСЛЕ указанного узла.
   * @param targetId ориентир (сосед слева).
   * @param childId перемещаемый актор.
   */
  public moveAfter(targetId: string, childId: string): void {
    if (targetId === childId) return
    this.insertAfter(targetId, childId)
  }

  /**
   * Переместить существующего ребёнка ПЕРЕД указанным узлом.
   * @param targetId ориентир (сосед справа).
   * @param childId перемещаемый актор.
   */
  public moveBefore(targetId: string, childId: string): void {
    if (targetId === childId) return
    this.insertBefore(targetId, childId)
  }

  /**
   * Перепривязать существующего ребёнка к новому родителю с позиционированием.
   * @param newParentId новый родитель (или null для корня).
   * @param childId перемещаемый актор.
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
      // новая проверка: after должен быть ребёнком newParentId
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
}
