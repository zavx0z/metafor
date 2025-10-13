/**
 * Field — минимальное хранилище акторов (singleton module).
 *
 * - Хранит actors: Map<id, Actor>
 * - Хранит topology: Map<id, Topology> с полями (parent, orderKey?, seq)
 * - Эмитит события: create / remove / topologyChanged
 * - Предназначен для использования вместе с модулем gravity, который реализует правила иерархии.
 *
 * Принцип: Field — пассивное хранилище. Любая логика модификации parent/orderKey должна
 * выполняться доверенным слоем (например, gravity) через setTopology / create / remove.
 */

import type { Actor } from "./actor"
import type { Topology, Payloads, EventName, Listener } from "./field.t"

/* -------------------------
   Приватное состояние модуля
   ------------------------- */
const _actors = new Map<string, Actor>()
const _topology = new Map<string, Topology>()
const _listeners = new Map<EventName, Set<Listener<any>>>()

let _globalSeq = 0

/* -------------------------
   Вспомогательные функции
   ------------------------- */

/** Внутренняя функция эмита событий (без бросания ошибок наружу) */
function _emit<E extends EventName>(evt: E, payload: Payloads[E]): void {
  const set = _listeners.get(evt)
  if (!set) return
  for (const fn of Array.from(set)) {
    try {
      ;(fn as Listener<E>)(payload)
    } catch (err) {
      // Не ломаем поток — ошибки обработчиков не должны рушить core.
      // Логирование можно добавить здесь при необходимости.
      // console.error(`Field event handler error for ${evt}:`, err)
    }
  }
}

/* -------------------------
   Экспортируемый API
   ------------------------- */

/**
 * Подписаться на событие Field.
 * @param evt - 'create' | 'remove' | 'topologyChanged'
 * @returns Отписка-функция
 */
export function on<E extends EventName>(evt: E, fn: Listener<E>): () => void {
  let set = _listeners.get(evt)
  if (!set) {
    set = new Set<Listener<any>>()
    _listeners.set(evt, set)
  }
  set.add(fn as Listener<any>)
  return () => off(evt, fn)
}

/** Отписаться от события */
export function off<E extends EventName>(evt: E, fn: Listener<E>): void {
  const set = _listeners.get(evt)
  set?.delete(fn as Listener<any>)
}

/**
 * Создать актор в хранилище.
 * @param actor Экземпляр актора — у актора должен быть уникальный `id: string`.
 * @param initialTopology Опциональная начальная топология (parent, orderKey, seq). Если seq не указан — сгенерируется.
 * @throws Ошибки на русском: если id отсутствует или уже существует.
 */
export function create(actor: Actor, initialTopology?: Partial<Topology>): void {
  // guard: actor должен иметь id
  const id = (actor as any)?.id as string | undefined
  if (!id || typeof id !== "string") {
    throw new Error("У актора отсутствует корректный id (строка).")
  }
  if (_actors.has(id)) {
    throw new Error(`Актор уже существует: ${id}`)
  }

  _actors.set(id, actor)

  const topology: Topology = {
    parent: initialTopology?.parent ?? null,
    seq: typeof initialTopology?.seq === "number" ? initialTopology!.seq! : _globalSeq++,
    ...(initialTopology?.orderKey !== undefined ? { orderKey: initialTopology.orderKey } : {}),
  }
  _topology.set(id, topology)

  _emit("create", { id })
}

/**
 * Удалить актор из хранилища.
 * @param id Идентификатор актора.
 * @param recursive Если true — поле просто удалит запись. (Иерархию удаляет gravity)
 * @remarks Field не трогает детей: управление деревом — в gravity.
 */
export function remove(id: string): void {
  if (!_actors.has(id)) return
  _actors.delete(id)
  const prev = _topology.get(id)
  _topology.delete(id)

  _emit("remove", { id })
  if (prev) {
    // уведомляем, что топология удалена
    _emit("topologyChanged", { id, prev, next: null })
  }
}

/**
 * Получить актор по id.
 * @returns Actor или null
 */
export function getActor(id: string): Actor | null {
  return _actors.get(id) ?? null
}

/**
 * Проверяет, есть ли актор в хранилище.
 */
export function has(id: string): boolean {
  return _actors.has(id)
}

/**
 * Получить топологию актора.
 * @returns Topology или null
 */
export function getTopology(id: string): Topology | null {
  const t = _topology.get(id)
  return t ? { ...t } : null // возвращаем копию для безопасности
}

/**
 * Низкоуровневая операция: установить/обновить часть topology для актора.
 * @remarks Эту функцию должен вызывать только доверенный слой (gravity).
 * @throws Если топология отсутствует для id.
 */
export function setTopology(id: string, patch: Partial<Topology>): void {
  const prev = _topology.get(id)
  if (!prev) throw new Error(`Топология актора отсутствует: ${id}`)
  const next: Topology = {
    ...prev,
    parent: patch.parent === undefined ? prev.parent : patch.parent,
    seq: typeof patch.seq === "number" ? patch.seq : prev.seq,
    ...(patch.orderKey !== undefined ? { orderKey: patch.orderKey } : {}),
  }
  _topology.set(id, next)
  _emit("topologyChanged", { id, prev, next })
}

/**
 * Возвращает количество акторов в Field.
 */
export function size(): number {
  return _actors.size
}

/**
 * Получить snapshot (который удобно логировать/дебажить).
 * Возвращает простые JS-объекты (без ссылок на реальные Actor-экземпляры).
 */
export function snapshot(): { actors: string[]; topology: Record<string, Topology> } {
  const actors = Array.from(_actors.keys())
  const topology: Record<string, Topology> = {}
  for (const [id, m] of _topology.entries()) topology[id] = { ...m }
  return { actors, topology }
}

/**
 * Получить ids детей по parentId (плоский запрос без иерархической логики).
 */
export function getChildrenIds(parentId: string | null): string[] {
  const result: string[] = []
  for (const [id, m] of _topology.entries()) if (m.parent === parentId) result.push(id)
  return result
}

/* -------------------------
   Тестовые/вспомогательные хелперы
   ------------------------- */

/**
 * Полностью очистить состояние Field — используется в тестах.
 */
export function __resetForTests__(): void {
  _actors.clear()
  _topology.clear()
  _listeners.clear()
  _globalSeq = 0
}

/**
 * Создаёт минимальный Actor-стаб с заданным id — удобный для unit-тестов.
 * (Экспорт опционален; используй свой реальный Actor в проекте.)
 */
export function __makeTestActor__(id: string): Actor {
  // minimal fallback shape — приводится к типу Actor через any
  return { id } as any as Actor
}

/* -------------------------
   Экспорт по умолчанию (необязательно)
   ------------------------- */
export const Field = {
  create,
  remove,
  getActor,
  has,
  getTopology,
  setTopology,
  size,
  snapshot,
  getChildrenIds,
  on,
  off,
  __resetForTests__,
  __makeTestActor__,
}
